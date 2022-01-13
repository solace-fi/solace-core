// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../Governable.sol";
import "../interface/ITreasury.sol";
import "../interface/IPolicyManager.sol";
import "../interface/IRegistry.sol";
import "../interface/IRiskManager.sol";
import "../interface/IClaimsEscrow.sol";
import "../interface/ISoteriaCoverageProduct.sol";

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

    /// @notice Typehash for claim submissions.
    // solhint-disable-next-line var-name-mixedcase
    bytes32 internal immutable _SUBMIT_CLAIM_TYPEHASH;

    /// @notice Registry contract.
    IRegistry internal _registry;

    /// @notice RiskManager contract
    IRiskManager internal _riskManager;

    /// @notice PolicyManager contract
    IPolicyManager internal _policyManager;

    /// @notice Cannot buy new policies while paused. (Default is False)
    bool internal _paused;

    /***************************************
    BOOK-KEEPING VARIABLES
    ***************************************/

    /// @notice The current amount covered (in wei).
    uint256 internal _activeCoverLimit;

    /// @notice The total policy count.
    uint256 internal _totalPolicyCount;

    /// @notice The maximum rate charged per second per wei of coverLimit.
    /// @dev Because Solidity cannot store fractions in a single variable, need two variables: one for numerator and one for divisor
    /// @dev We also need to be careful to perform multiplication before division, as Solidity rounds down to 0
    /// @dev For testing assume _maxRate reflects 10% of coverLimit annually = 1/315360000
    uint256 internal _maxRateNum;
    uint256 internal _maxRateDenom;

    /// @notice Maximum epoch duration over which premiums are charged.
    uint256 internal _chargeCycle;

    /// @notice The policyholder => Soteria account balance.
    mapping(address => uint256) internal _accountBalanceOf; // Considered _soteriaAccountBalance name

    /// @notice The policyholder => policyID.
    mapping(address => uint256) internal _policyOf;

    /// @notice The cover limit for each policy(policyID => coverLimit).
    mapping (uint256 => uint256) internal _coverLimitOf;

    /// @notice The policy holder => reward points. Having a reward points mechanism enables `free` cover gifts and discounts for referrals.
    mapping (address => uint256) internal _rewardPointsOf;

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
     * @param typehash_ The typehash for submitting claims.
     * @param domain_ The user readable name of the EIP712 signing domain.
     * @param version_ The current major version of the signing domain.
     */
    constructor(
        address governance_,
        address registry_,
        bytes32 typehash_,
        string memory domain_,
        string memory version_
    ) ERC721("Soteria Policy", "SOPT") Governable(governance_) EIP712(domain_, version_) {
        // set registry
        require(registry_ != address(0x0), "zero address registry");
        _registry = IRegistry(registry_);

        // set riskmanager
        require(_registry.riskManager() != address(0x0), "zero address riskmanager");
        _riskManager = IRiskManager(_registry.riskManager());

        // set policymanager
        require(_registry.policyManager() != address(0x0), "zero address policymanager");
        _policyManager = IPolicyManager(_registry.policyManager());
        _SUBMIT_CLAIM_TYPEHASH = typehash_;
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
    POLICY FUNCTIONS
    ***************************************/

    /**
     * @notice Activates policy on the behalf of the policyholder.
     * @param policyholder_ Holder of the position to cover.
     * @param coverLimit_ The value to cover in **ETH**.
     * @return policyID The ID of newly created policy.
    */
    function activatePolicy(address policyholder_, uint256 coverLimit_) external payable override whileUnpaused returns (uint256 policyID) {
        require(policyholder_ != address(0x0), "zero address policyholder");
        require(coverLimit_ > 0, "zero cover value");
        
        policyID = policyOf(policyholder_);
        require(!policyStatus(policyID), "policy already activated");
        require(_canPurchaseNewCover(0, coverLimit_), "insufficient capacity for new cover");
        require(msg.value + _accountBalanceOf[policyholder_] > _minRequiredAccountBalance(coverLimit_), "insufficient deposit for minimum required account balance");

        // deposit funds
        _deposit(policyholder_, msg.value);

        // mint policy if doesn't currently exist
        if (policyID == 0) {
            policyID = ++_totalPolicyCount;
            _policyOf[policyholder_] = policyID;
            _mint(policyholder_, policyID);
        }

        // update cover amount
        _activeCoverLimit += coverLimit_;
        _coverLimitOf[policyID] = coverLimit_;
       
        // update policy manager active cover amount
        _updatePolicyManager(_activeCoverLimit); // Need to change to _updateRiskManager(_activeCoverLimit)
        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Updates the cover amount of the policy, either governance or policyholder can do this.
     * @param policyID_ The policy ID to update.
     * @param newCoverLimit_ The new value to cover in **ETH**.
    */
    function updateCoverLimit(uint256 policyID_, uint256 newCoverLimit_) external override nonReentrant whileUnpaused {
        require(newCoverLimit_ > 0, "zero cover value");
        require(_exists(policyID_), "invalid policy");
        address policyOwner = ownerOf(policyID_);
        require(this.governance() == msg.sender || policyOwner == msg.sender, "not owner or governance");
        uint256 currentCoverLimit = coverLimitOf(policyID_);
        require(_canPurchaseNewCover(currentCoverLimit, newCoverLimit_), "insufficient capacity for new cover");
        require(_accountBalanceOf[policyOwner] > _minRequiredAccountBalance(newCoverLimit_), "insufficient deposit for minimum required account balance");
        
        _coverLimitOf[policyID_] = newCoverLimit_;
        uint256 newActiveCoverLimit = activeCoverLimit() + newCoverLimit_ - currentCoverLimit;
        _activeCoverLimit = newActiveCoverLimit;
        _updatePolicyManager(newActiveCoverLimit); // Need to change to _updateRiskManager(newActiveCoverLimit)
        emit PolicyUpdated(policyID_);
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
     * @param amount_ Amount policyholder desires to withdraw.
     * User Soteria account must have > minAccountBalance.
     * Otherwise account will be deactivated.
     */
    function withdraw(uint256 amount_) external override nonReentrant whileUnpaused {
      require(amount_ <= _accountBalanceOf[msg.sender], "cannot withdraw this amount");
      
      uint256 currentCoverLimit = _coverLimitOf[_policyOf[msg.sender]];

      if (_accountBalanceOf[msg.sender] - amount_ > _minRequiredAccountBalance(currentCoverLimit)) {
          _withdraw(msg.sender, amount_);
      } else {
          uint256 accountBalance = _accountBalanceOf[msg.sender];
          _deactivatePolicy(msg.sender);
          Address.sendValue(payable(msg.sender), accountBalance);
      }
    }

    /**
     * @notice Deactivate a user's own policy.
     * @param policyID_ The policy ID to update.
     * User will receive their entire Soteria account balance.
     */
     function deactivatePolicy(uint256 policyID_) public override nonReentrant {
        require(policyStatus(policyID_), "invalid policy");
        address policyOwner = ownerOf(policyID_);
        require(this.governance() == msg.sender || policyOwner == msg.sender, "not owner or governance");

        uint256 refundAmount = accountBalanceOf(policyOwner);
        _deactivatePolicy(policyOwner);
        if (refundAmount > 0) Address.sendValue(payable(policyOwner), refundAmount);
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
        return _riskManager.maxCoverPerStrategy(address(this));
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
        return address(_riskManager);
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
        return _activeCoverLimit;
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
        require(_registry.riskManager() != address(0x0), "zero address riskmanager");
        _riskManager = IRiskManager(_registry.riskManager());
        require(_registry.policyManager() != address(0x0), "zero address policymanager");
        _policyManager = IPolicyManager(_registry.policyManager());
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
     * @notice Enables governance to gift (and remove) 'free' cover to specific addresses.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param policyholder_ The policy holder to set reward points for.
     * @param rewardPoints_ Desired amount of reward points.
    */
    function setRewardPoints(address policyholder_, uint256 rewardPoints_) external override onlyGovernance {
        _rewardPointsOf[policyholder_] = rewardPoints_;
        emit RewardPointsSet(policyholder_, rewardPoints_);
    }  

    /**
     * @notice Charge premiums for each policy holder.
     * @param holders_ The policy holders.
     * @param premiums_ The premium amounts in `wei` per policy holder.
    */
    function chargePremiums(address[] calldata holders_, uint256[] calldata premiums_) external payable override onlyGovernance whileUnpaused {
        uint256 count = holders_.length;
        require(count == premiums_.length, "length mismatch");
        require(count <= policyCount(), "policy count exceeded");
        uint256 amountToPayTreasury = 0;

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
                    amountToPayTreasury += amountDeductedFromSoteriaAccount;
                    _accountBalanceOf[holders_[i]] -= amountDeductedFromSoteriaAccount;
                    _rewardPointsOf[holders_[i]] = 0;
                }
                
                emit PremiumCharged(holders_[i], premiums_[i]);
            } else {
                uint256 partialPremium = _accountBalanceOf[holders_[i]] + _rewardPointsOf[holders_[i]];
                amountToPayTreasury += _accountBalanceOf[holders_[i]];
                _rewardPointsOf[holders_[i]] = 0;
                _deactivatePolicy(holders_[i]); // Difference between manually calling deactivatePolicy() and having _deactivatePolicy() called here, is that the remaining account balance goes to Treasury here instead of being returned to the user
                emit PremiumPartiallyCharged(holders_[i], premiums_[i], partialPremium);
            }  
        }
        // transfer premium to the treasury
        ITreasury(payable(_registry.treasury())).routePremiums{value: amountToPayTreasury}();
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
        // Redundant check if _activeCoverLimit will be lowered
        if (newTotalCover_ < existingTotalCover_) return true;
        else {
            uint256 changeInTotalCover = newTotalCover_ - existingTotalCover_;
            if (changeInTotalCover < availableCoverCapacity()) return true;
            else return false;
        }
    }

    /**
     * @notice Adds funds to policy holder's balance.
     * @param policyholder The policy holder address.
     * @param amount The amount of fund to deposit.
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
        uint256 policyID = _policyOf[policyholder];
        _activeCoverLimit -= _coverLimitOf[policyID];
        _coverLimitOf[policyID] = 0;
        _accountBalanceOf[policyholder] = 0;
        _updatePolicyManager(_activeCoverLimit); // Need to change to _updateRiskManager(_activeCoverLimit)
        emit PolicyDeactivated(policyID);
    }

    // REQUIRE CHANGING PolicyManager.sol & RiskManager.sol so that RiskManager tracks the activeCoverLimit
    /**
     * @notice Updates policy manager's active cover amount.
     * @param soteriaActiveCoverLimit The active cover amount of soteria product.
    */
    function _updatePolicyManager(uint256 soteriaActiveCoverLimit) internal {
        _policyManager.setSoteriaActiveCoverAmount(soteriaActiveCoverLimit);
        emit PolicyManagerUpdated(soteriaActiveCoverLimit);
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
        require(balanceOf(to) <= 1, "can only mint one SOPT");
    }
}