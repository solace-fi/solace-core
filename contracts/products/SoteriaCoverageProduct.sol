// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../utils/Governable.sol";
import "../interfaces/utils/IRegistry.sol";
import "../interfaces/risk/IRiskManager.sol";
import "../interfaces/products/ISoteriaCoverageProduct.sol";

/**
 * @title SoteriaCoverageProduct
 * @author solace.fi
 * @notice The smart contract implementation of **SoteriaCoverageProduct**.
 */
contract SoteriaCoverageProduct is ISoteriaCoverageProduct, ERC721, EIP712, ReentrancyGuard, Governable {
    using Address for address;

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Registry contract.
    IRegistry internal _registry;

    /// @notice Cannot buy new policies while paused. (Default is False)
    bool internal _paused;

    /***************************************
    BOOK-KEEPING VARIABLES
    ***************************************/

    /// @notice The total policy count.
    uint256 internal _totalPolicyCount;

    /**
     * @notice The maximum rate charged per second per wei of coverLimit.
     * @dev Because Solidity cannot store fractions in a single variable, need two variables: one for numerator and one for divisor
     * @dev We also need to be careful to perform multiplication before division, as Solidity rounds down to 0
     * @dev For testing assume _maxRate reflects 10% of coverLimit annually = 1/315360000
     */
    uint256 internal _maxRateNum;
    uint256 internal _maxRateDenom;

    /// @notice Maximum epoch duration over which premiums are charged.
    uint256 internal _chargeCycle;

    /**
     * @notice The cooldown period
     * Withdrawing total soteria account balance is a two-step process
     * i.) Call deactivatePolicy(), which sets cover limit to 0 and begins a cooldown time
     * ii.) After the cooldown period has been completed, the policy holder can then withdraw funds
     * @dev We could use uint40 to store time, I thought it easier to just use uint256s in this contract. We're also not packing structs in this contract.
     */
    uint256 internal _cooldownPeriod;

    /**
     * @notice Percentage of cover limit purchased, that will be rewarded for using a referral code
     * @dev In units of bps, or out of 10,000 parts. Default is 5% or _referralRewardPercentage = 500.
     */
    uint256 internal _referralRewardPercentage;

    /**
     * @notice Policy holder address => Timestamp that a depositor's cooldown started
     * @dev this is set to 0 to reset (default value is 0 in Solidity anyway)
     */
    mapping(address => uint256) internal _cooldownStart;

    /// @notice The policyholder => Soteria account balance.
    mapping(address => uint256) internal _accountBalanceOf; // Considered _soteriaAccountBalance name

    /// @notice The policyholder => policyID.
    mapping(address => uint256) internal _policyOf;

    /// @notice The cover limit for each policy(policyID => coverLimit).
    mapping (uint256 => uint256) internal _coverLimitOf;

    /// @notice This mapping is created for the purpose of avoiding the unintended side effect where `user deactivates policy -> cover limit set to 0 -> minRequiredAccountBalance also set to 0 unintentionally because minRequiredAccountBalance = coverLimit * chargeCycle * maxRate -> user can withdraw all funds immediately after deactivating account
    /// @dev This mapping is intended to mirror the _coverLimitOf mapping, except time between cooldown start and after cooldown completed
    mapping (uint256 => uint256) internal _preDeactivateCoverLimitOf;

    /// @notice The policy holder => reward points. Having a reward points mechanism enables `free` cover gifts and discounts for referrals.
    mapping (address => uint256) internal _rewardPointsOf;

    /// @notice PolicyID => Has referral code been used for this policyID?
    mapping (uint256 => bool) internal _isReferralCodeUsed;

    /***************************************
    MODIFIERS
    ***************************************/

    modifier whileUnpaused() {
        require(!_paused, "contract paused");
        _;
    }

    /**
     * @notice Constructs `Soteria` product.
     * @param governance_ The governor.
     * @param registry_ The [`Registry`](./Registry) contract address.
     * @param domain_ The user readable name of the EIP712 signing domain.
     * @param version_ The current major version of the signing domain.
     */
    constructor(
        address governance_,
        address registry_,
        string memory domain_,
        string memory version_
    ) ERC721("Soteria Policy", "SOPT") Governable(governance_) EIP712(domain_, version_) {
        require(registry_ != address(0x0), "zero address registry");
        _registry = IRegistry(registry_);
        require(_registry.get("riskManager") != address(0x0), "zero address riskmanager");
    }
    
    /***************************************
    FALLBACK FUNCTIONS
    ***************************************/

    /**
     * @notice Fallback function to allow contract to receive *ETH*.
    */
    // solhint-disable-next-line 
    receive() external payable nonReentrant {
        _deposit(msg.sender, msg.value);
    }

    /**
     * @notice Fallback function to allow contract to receive *ETH*.
    */
    fallback() external payable nonReentrant {
        _deposit(msg.sender, msg.value);
    }

    /***************************************
    POLICY HOLDER FUNCTIONS
    ***************************************/

    /**
     * @notice Activates policy on the behalf of the policyholder.
     * @param policyholder_ Holder of the position to cover.
     * @param coverLimit_ The value to cover in **ETH**.
     * @param referralCode_ Referral code
     * @return policyID The ID of newly created policy.
    */
    function activatePolicy(address policyholder_, uint256 coverLimit_, uint256 referralCode_) external payable override whileUnpaused returns (uint256 policyID) {
        require(policyholder_ != address(0x0), "zero address policyholder");
        require(coverLimit_ > 0, "zero cover value");
        
        policyID = policyOf(policyholder_);
        require(!policyStatus(policyID), "policy already activated");
        require(_canPurchaseNewCover(0, coverLimit_), "insufficient capacity for new cover");
        require(msg.value + _accountBalanceOf[policyholder_] > _minRequiredAccountBalance(coverLimit_), "insufficient deposit for minimum required account balance");

        // Exit cooldown
        _exitCooldown(policyholder_);
        
        // deposit funds
        _deposit(policyholder_, msg.value);

        // mint policy if doesn't currently exist
        if (policyID == 0) {
            policyID = ++_totalPolicyCount;
            _policyOf[policyholder_] = policyID;
            _mint(policyholder_, policyID);
        }

        if (referralCode_ != 0) _processReferralCode(policyholder_, coverLimit_, referralCode_);

        // update cover amount
        _updateActiveCoverLimit(0, coverLimit_);
        _coverLimitOf[policyID] = coverLimit_;
        _preDeactivateCoverLimitOf[policyID] = coverLimit_;
        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Updates the cover amount of your policy
     * @notice If you update the cover limit for your policy, you will exit the cooldown process if you already started it. This means that if you want to withdraw all your funds, you have to redo the 'deactivatePolicy() => withdraw()' process
     * @param newCoverLimit_ The new value to cover in **ETH**.
     * @param referralCode_ Referral code
    */
    function updateCoverLimit(uint256 newCoverLimit_, uint256 referralCode_) external override nonReentrant whileUnpaused {
        require(newCoverLimit_ > 0, "zero cover value");
        uint256 policyID = _policyOf[msg.sender];
        require(_exists(policyID), "invalid policy");
        uint256 currentCoverLimit = coverLimitOf(policyID);
        require(_canPurchaseNewCover(currentCoverLimit, newCoverLimit_), "insufficient capacity for new cover");
        require(_accountBalanceOf[msg.sender] > _minRequiredAccountBalance(newCoverLimit_), "insufficient deposit for minimum required account balance");
        
        if (referralCode_ != 0) _processReferralCode(msg.sender, newCoverLimit_, referralCode_);
        _exitCooldown(msg.sender); // Reset cooldown
        _coverLimitOf[policyID] = newCoverLimit_;
        _preDeactivateCoverLimitOf[policyID] = newCoverLimit_;
        _updateActiveCoverLimit(currentCoverLimit, newCoverLimit_);
        emit PolicyUpdated(policyID);
    }

    /**
     * @notice Deposits funds for policy holders.
     * @param policyholder_ The holder of the policy.
    */
    function deposit(address policyholder_) external payable override whileUnpaused {
        _deposit(policyholder_, msg.value);
    }

    /**
     * @notice Withdraw ETH from Soteria account to user.
     * @notice If cooldown has passed, the user can withdraw any amount
     * @notice If cooldown has not passed, the user can only withdraw down to minRequiredAccountBalance
     * @param amount_ Amount policyholder desires to withdraw.
     * User Soteria account must have > minAccountBalance.
     * Otherwise account will be deactivated.
     */
    function withdraw(uint256 amount_) external override nonReentrant whileUnpaused {
      require(amount_ <= _accountBalanceOf[msg.sender], "cannot withdraw > account balance");      
      uint256 preDeactivateCoverLimit = _preDeactivateCoverLimitOf[_policyOf[msg.sender]];

      if ( _hasCooldownPassed(msg.sender) ) {
        _withdraw(msg.sender, amount_);
      } else {
        require(_accountBalanceOf[msg.sender] - amount_ > _minRequiredAccountBalance(preDeactivateCoverLimit), "must have > minRequiredAccountbalance");
        _withdraw(msg.sender, amount_);
      }
    }

    /**
     * @notice Deactivate a policy holder's own policy.
     * Policy holder's cover will be set to 0, and cooldown timer will start
     * Policy holder must wait out the cooldown, and then he/she will be able to withdraw their entire account balance
     */
     function deactivatePolicy() public override nonReentrant {
        require(policyStatus(_policyOf[msg.sender]), "invalid policy");
        _deactivatePolicy(msg.sender);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
    * @notice Determine available capacity for new cover.
    * @return availableCoverCapacity_ The amount of available capacity for new cover.
    */
    function availableCoverCapacity() public view override returns (uint256 availableCoverCapacity_) {
        availableCoverCapacity_ = maxCover() - activeCoverLimit();
    }

    /**
    * @notice Return reward points for a policyholder.
    * @param policyholder_ The address of the policyholder.
    * @return rewardPoints_ The reward points for a policyholder.
    */
    function rewardPointsOf(address policyholder_) public view override returns (uint256 rewardPoints_) {
        return _rewardPointsOf[policyholder_];
    }

    /**
     * @notice Returns the Soteria account balance for a policyholder.
     * @param policyholder_ The address of the policyholder.
     * @return amount The amount of funds.    
    */
    function accountBalanceOf(address policyholder_) public view override returns (uint256 amount) {
        return _accountBalanceOf[policyholder_];
    }

    /**
     * @notice Returns whether if the policy is active or not.
     * @param policyID_ The id of the policy.
     * @return status True if policy is active. False otherwise.
    */
    function policyStatus(uint256 policyID_) public view override returns (bool status) {
        return coverLimitOf(policyID_) > 0 ? true : false;
    }

    /**
     * @notice Returns the policyholder's policy id.
     * @param policyholder_ The address of the policyholder.
     * @return policyID The policy id.
    */
    function policyOf(address policyholder_) public view override returns (uint256 policyID) {
        return _policyOf[policyholder_];
    }

    /**
     * @notice The maximum amount of cover that `Soteria Product` can be sold.
     * @return cover The max amount of cover in `wei`
    */
    function maxCover() public view override returns (uint256 cover) {
        return IRiskManager(_registry.get("riskManager")).maxCoverPerStrategy(address(this));
    }

    /**
     * @notice Returns [`Registry`](./Registry) contract address.
     * @return registry_ The `Registry` address.
    */
    function registry() external view override returns (address registry_) {
        return address(_registry);
    }

    /**
     * @notice Returns [`RiskManager`](./RiskManager) contract address.
     * @return riskManager_ The `RiskManager` address.
    */
    function riskManager() external view override returns (address riskManager_) {
        return address(_registry.get("riskManager"));
    }

    /**
     * @notice Returns whether or not product is currently in paused state.
     * @return status True if product is paused.
    */
    function paused() external view override returns (bool status) {
        return _paused;
    }

    /**
     * @notice Returns active cover limit in `wei`.
     * @return amount The active cover limit.
    */
    function activeCoverLimit() public view override returns (uint256 amount) {
        return IRiskManager(_registry.get("riskManager")).activeCoverLimitPerStrategy(address(this));
    }

    /**
     * @notice Returns the policy count.
     * @return count The policy count.
    */
    function policyCount() public view override returns (uint256 count) {
        return _totalPolicyCount;
    }

    /**
     * @notice Returns the max rate numerator.
     * @return maxRateNum_ the max rate numerator.
    */
    function maxRateNum() public view override returns (uint256 maxRateNum_) {
        return _maxRateNum;
    }

    /**
     * @notice Returns the max rate denominator.
     * @return maxRateDenom_ the max rate denominator.
    */
    function maxRateDenom() public view override returns (uint256 maxRateDenom_) {
        return _maxRateDenom;
    }

    /**
     * @notice Returns the charge cycle duration.
     * @return chargeCycle_ the charge cycle duration.
    */
    function chargeCycle() public view override returns (uint256 chargeCycle_) {
        return _chargeCycle;
    }

    /**
     * @notice Returns cover amount of given policy id.
     * @param policy_ The policy id.
     * @return amount The cover amount for given policy.
    */
    function coverLimitOf(uint256 policy_) public view override returns (uint256 amount) {
        return _coverLimitOf[policy_];
    }

    /**
     * @notice The minimum amount of time a user must wait to withdraw funds.
     * @return cooldownPeriod_ The cooldown period in seconds.
     */
    function cooldownPeriod() external view override returns (uint256 cooldownPeriod_) {
        return _cooldownPeriod;
    }

    /**
     * @notice The timestamp that a depositor's cooldown started.
     * @param policyholder_ The policy holder
     * @return cooldownStart_ The cooldown period start expressed as Unix timestamp
     */
    function cooldownStart(address policyholder_) external view override returns (uint256 cooldownStart_) {
        return _cooldownStart[policyholder_];
    }

    /**
     * @notice Gets the referral reward percentage in bps
     * @return referralRewardPercentage_ The referral reward percentage
     */
    function referralRewardPercentage() external view override returns (uint256 referralRewardPercentage_) {
        return _referralRewardPercentage;
    }

    /**
     * @notice Gets the unique referral code for a user.
     * @param user_ The user.
     * @return referralCode_ The referral code.
     */
    function getReferralCode(address user_) external view override returns (uint256 referralCode_) {
        return _getReferralCode(user_);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
    */
    function setRegistry(address registry_) external override onlyGovernance {
        require(registry_ != address(0x0), "zero address registry");
        _registry = IRegistry(registry_);
        require(_registry.get("riskManager") != address(0x0), "zero address riskmanager");
        emit RegistrySet(registry_);
    }

    /**
     * @notice Pauses or unpauses buying and extending policies.
     * Deactivating policies are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param paused_ True to pause, false to unpause.
    */
    function setPaused(bool paused_) external override onlyGovernance {
        _paused = paused_;
        emit PauseSet(paused_);
    }

    /**
     * @notice Sets the cooldown period that a user must wait after deactivating their policy, to withdraw funds from their Soteria account.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param cooldownPeriod_ Cooldown period in seconds.
     */
    function setCooldownPeriod(uint256 cooldownPeriod_) external override onlyGovernance {
        _cooldownPeriod = cooldownPeriod_;
        emit CooldownPeriodSet(cooldownPeriod_);
    }

    /**
     * @notice set _maxRateNum.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param maxRateNum_ Desired maxRateNum.
    */
    function setMaxRateNum(uint256 maxRateNum_) external override onlyGovernance {
        _maxRateNum = maxRateNum_;
        emit MaxRateNumSet(maxRateNum_);
    }

    /**
     * @notice set _maxRateDenom.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param maxRateDenom_ Desired maxRateDenom.
    */
    function setMaxRateDenom(uint256 maxRateDenom_) external override onlyGovernance {
        _maxRateDenom = maxRateDenom_;
        emit MaxRateDenomSet(maxRateDenom_);
    }

    /**
     * @notice set _chargeCycle.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param chargeCycle_ Desired chargeCycle.
    */
    function setChargeCycle(uint256 chargeCycle_) external override onlyGovernance {
        _chargeCycle = chargeCycle_;
        emit ChargeCycleSet(chargeCycle_);
    }

    /**
     * @notice set _referralRewardPercentage
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param referralRewardPercentage_ Desired referralRewardPercentage.
    */
    function setReferralRewardPercentage(uint256 referralRewardPercentage_) external override onlyGovernance {
        require(referralRewardPercentage_ <= 10000, "cannot set over 100%");
        _referralRewardPercentage = referralRewardPercentage_;
        emit ReferralRewardPercentageSet(referralRewardPercentage_);
    }

    /***************************************
    COVER PROMOTION ADMIN FUNCTIONS
    ***************************************/

    /**
     * @notice Enables cover promotion admin to gift (and remove) 'free' cover to specific addresses.
     * Can only be called by the current cover promotion admin.
     * @param policyholder_ The policy holder to set reward points for.
     * @param rewardPoints_ Desired amount of reward points.
    */
    function setRewardPoints(address policyholder_, uint256 rewardPoints_) external override {
        require(msg.sender == _registry.get("coverPromotionAdmin"), "not cover promotion admin");
        _rewardPointsOf[policyholder_] = rewardPoints_;
        emit RewardPointsSet(policyholder_, rewardPoints_);
    }  

    /***************************************
    PREMIUM COLLECTOR FUNCTIONS
    ***************************************/

    /**
     * @notice Charge premiums for each policy holder.
     * @param holders_ The policy holders.
     * @param premiums_ The premium amounts in `wei` per policy holder.
    */
    function chargePremiums(address[] calldata holders_, uint256[] calldata premiums_) external payable override whileUnpaused {
        uint256 count = holders_.length;
        require(msg.sender == _registry.get("premiumCollector"), "not premium collector");
        require(count == premiums_.length, "length mismatch");
        require(count <= policyCount(), "policy count exceeded");
        uint256 amountToPayPremiumPool = 0;

        for (uint256 i = 0; i < count; i++) {
            // skip computation if policy inactive
            if ( !policyStatus(_policyOf[holders_[i]]) ) continue;
            require(premiums_[i] <= _minRequiredAccountBalance(coverLimitOf(policyOf(holders_[i]))), "charging more than promised maximum rate");

            // If policy holder can pay for premium charged in full
            if (_accountBalanceOf[holders_[i]] + _rewardPointsOf[holders_[i]] >= premiums_[i]) {
                
                // If reward points can cover premium charged in full
                if (_rewardPointsOf[holders_[i]] >= premiums_[i]) {
                    _rewardPointsOf[holders_[i]] -= premiums_[i];
                } else {
                    uint256 amountDeductedFromSoteriaAccount = premiums_[i] - _rewardPointsOf[holders_[i]];
                    amountToPayPremiumPool += amountDeductedFromSoteriaAccount;
                    _accountBalanceOf[holders_[i]] -= amountDeductedFromSoteriaAccount;
                    _rewardPointsOf[holders_[i]] = 0;
                }
                
                emit PremiumCharged(holders_[i], premiums_[i]);
            } else {
                uint256 partialPremium = _accountBalanceOf[holders_[i]] + _rewardPointsOf[holders_[i]];
                amountToPayPremiumPool += _accountBalanceOf[holders_[i]];
                _accountBalanceOf[holders_[i]] = 0;
                _rewardPointsOf[holders_[i]] = 0;
                _deactivatePolicy(holders_[i]);
                emit PremiumPartiallyCharged(holders_[i], premiums_[i], partialPremium);
            }  
        }
        // single transfer to the premium pool
        Address.sendValue(payable(_registry.get("premiumPool")), amountToPayPremiumPool);
    }

    /***************************************
    INTERNAL FUNCTIONS
    ***************************************/

    /**
    * @notice Given a request for new coverage, determines if there is sufficient coverage capacity.
    * @param existingTotalCover_ The existing total cover, will be 0 when a policy is first purchased.
    * @param newTotalCover_  The total cover amount requested in a new cover request.
    * @return acceptable True there is sufficient capacity for requested new coverage amount, false otherwise.
    */
    function _canPurchaseNewCover(uint256 existingTotalCover_, uint256 newTotalCover_) internal view returns (bool acceptable) {
        uint256 changeInTotalCover = newTotalCover_ - existingTotalCover_;
        if (changeInTotalCover < availableCoverCapacity()) return true;
        else return false;
    }

    /**
     * @notice Adds funds to policy holder's balance.
     * @param policyholder The policy holder address.
     * @param amount The amount of fund to deposit.
     * @dev Explicit decision that _deposit() will not affect, nor be affected by the cooldown mechanic. 
     * Rationale: _deposit() doesn't affect cover limit, and cooldown mechanic is to protect protocol from manipulated cover limit
    */
    function _deposit(address policyholder, uint256 amount) internal whileUnpaused {
        _accountBalanceOf[policyholder] += amount;
        emit DepositMade(policyholder, amount);
    }

    /**
     * @notice Withdraw funds from Soteria to policy holder.
     * @param policyholder The policy holder address.
     * @param amount The amount of fund to withdraw.
    */
    function _withdraw(address policyholder, uint256 amount) internal whileUnpaused {
      _accountBalanceOf[policyholder] -= amount;
      Address.sendValue(payable(policyholder), amount);
      emit WithdrawMade(policyholder, amount);
    }

    /**
     * @notice Deactivate the policy.
     * @param policyholder The address of the policy owner.
    */
    function _deactivatePolicy(address policyholder) internal {
        _startCooldown(policyholder);
        uint256 policyID = _policyOf[policyholder];
        _updateActiveCoverLimit(_coverLimitOf[policyID], 0);
        _coverLimitOf[policyID] = 0;
        emit PolicyDeactivated(policyID);
    }

    /**
     * @notice Updates active cover limit of `Soteria`.
     * @param currentCoverLimit The current cover limit of the policy.
     * @param newCoverLimit The new cover limit of the policy.
    */
    function _updateActiveCoverLimit(uint256 currentCoverLimit, uint256 newCoverLimit) internal {
        IRiskManager(_registry.get("riskManager")).updateActiveCoverLimitForStrategy(address(this), currentCoverLimit, newCoverLimit);
    }

    /**
     * @notice Calculate minimum required account balance for a given cover limit
     * @param coverLimit cover limit.
    */
    function _minRequiredAccountBalance(uint256 coverLimit) internal returns (uint256 minRequiredAccountBalance) {
        minRequiredAccountBalance = ( _maxRateNum * _chargeCycle * coverLimit ) / _maxRateDenom;
    }

    /**
     * @notice Use _beforeTokenTransfer hook from ERC721 standard to ensure Soteria policies are non-transferable, and only one can be minted per user
     * @dev This hook is called on mint, transfer and burn
     * @param from sending address.
     * @param to receiving address.
     * @param tokenId tokenId.
    */
    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal virtual override {
        super._beforeTokenTransfer(from, to, tokenId);
        require(from == address(0), "only minting permitted");
    }

    /**
     * @notice Starts the **cooldown** period for the user.
     */
    function _startCooldown(address policyholder) internal {
        _cooldownStart[policyholder] = block.timestamp;
        emit CooldownStarted(policyholder, _cooldownStart[policyholder]);
    }

    /**
     * @notice Abandons the **cooldown** period for the user.
     * @dev Original name for this function from the deprecated Vault.sol was stopCooldown()
     * @dev Renamed this to _exitCooldown because "reset" gives the impression that you are starting the cooldown again, and "stop" gives the impression you are stopping the cooldown for it to pick up again later from where you stopped it
     * @dev I thought "exit" gives the imagery that you are exitting the process, and you will need to restart it manually later (which is more accurate, if user calls updateCoverLimit(), they then need to redo 'deactivatePolicy() => withdraw()' to get their entire funds back)
     */
    function _exitCooldown(address policyholder) internal {
        _cooldownStart[policyholder] = 0;
        emit CooldownStopped(policyholder);
    }

    /**
     * @notice Determine if cooldown has passed for a policy holder
     * @return True if cooldown has passed, false if not
     */
    function _hasCooldownPassed(address policyholder) internal returns (bool) {
        if (_cooldownStart[policyholder] == 0) {return false;}
        else {return block.timestamp >= _cooldownStart[policyholder] + _cooldownPeriod;}
    }

    /**
     * @notice Gets the unique referral code for a user.
     * @param user_ The user.
     * @return referralCode_ The referral code.
     */
    function _getReferralCode(address user_) internal view returns (uint256 referralCode_) {
        return uint256(uint160(user_));
    }

    /**
     * @notice Internal function to process referral code
     * @param policyholder_ Policy holder
     * @param coverLimit_ Cover limit
     * @param referralCode_ Referral code
     */
    function _processReferralCode(address policyholder_, uint256 coverLimit_, uint256 referralCode_) internal {
        address referrer = address(uint160(referralCode_));
        // require(referrer != address(0), "cannot have zero address referrer"); // Redundant because we cannot call _processReferralCode with referralCode_ = 0
        require(referrer != policyholder_, "cannot refer to self");
        require (!_isReferralCodeUsed[_policyOf[policyholder_]], "cannot use referral code again");
        
        uint256 rewardPointsEarned = (coverLimit_ * _referralRewardPercentage) / 10000;
        _isReferralCodeUsed[_policyOf[policyholder_]] = true;
        _rewardPointsOf[policyholder_] += rewardPointsEarned;
        _rewardPointsOf[referrer] += rewardPointsEarned;

        emit ReferralRewardsEarned(policyholder_, rewardPointsEarned);
        emit ReferralRewardsEarned(referrer, rewardPointsEarned);
    }
}