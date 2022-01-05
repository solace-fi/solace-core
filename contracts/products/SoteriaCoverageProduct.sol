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
    uint256 internal _totalActiveCover;

    /// @notice The total policy count.
    uint256 internal _totalPolicyCount;

    /// @notice The maximum premium per 1 ETH of cover that can be charged in an epoch.
    uint256 internal _maxChargeablePremium;

    /// @notice The policyholder => Soteria account balance.
    mapping(address => uint256) internal _soteriaAccountBalance;

    /// @notice The policyholder => policyID.
    mapping(address => uint256) internal _policyID;

    /// @notice The cover limit for each policy(policyID => coverLimit).
    mapping (uint256 => uint256) internal _coverLimitOf;

    /// @notice The policy holder => reward points. Having a reward points mechanism enables `free` cover gifts and discounts for referrals.
    mapping (address => uint256) internal _rewardPoints;

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
        
        policyID = policyIDOf(policyholder_);
        require(!policyStatus(policyID), "already bought policy");
        require(_canPurchaseNewCover(0, coverLimit_), "insufficient capacity for new cover");
        require(msg.value > _maxChargeablePremium * coverLimit_, "insufficient deposit to meet maxChargeablePremium");

        // deposit funds
        _deposit(policyholder_, msg.value);

        // mint policy if doesn't currently exist
        if (policyID == 0) {
            policyID = ++_totalPolicyCount;
            _policyID[policyholder_] = policyID;
            _mint(policyholder_, policyID);
        }

        // update cover amount
        _totalActiveCover += coverLimit_;
        _coverLimitOf[policyID] = coverLimit_;
       
        // update policy manager active cover amount
        _updatePolicyManager(_totalActiveCover);
        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Updates the cover amount of the policy.
     * @param policyID_ The policy ID to update.
     * @param newCoverLimit_ The new value to cover in **ETH**.
    */
    function updateCoverLimit(uint256 policyID_, uint256 newCoverLimit_) external override nonReentrant whileUnpaused {
        require(newCoverLimit_ > 0, "zero cover value");
        require(policyID_ > 0, "invalid policy");
        // These following 2 require's are awkward, we would ideally like a modifier or single require statement to evaluate `msg.sender == ownerOf(policyID_) || onlyGovernance modifier`
        // Require `this.` syntax to access external functions of inherited Governance.sol
        require(!this.governanceIsLocked(), "permanently locked by governance");
        require(this.governance() == msg.sender || ownerOf(policyID_) == msg.sender, "Not owner or governance");
        uint256 currentCoverLimit = coverLimitOf(policyID_);
        require(_canPurchaseNewCover(currentCoverLimit, newCoverLimit_), "insufficient capacity for new cover");
        require(_soteriaAccountBalance[msg.sender] > newCoverLimit_ * _maxChargeablePremium, "insufficient account balance to meet maxChargeablePremium");
        
        _coverLimitOf[policyID_] = newCoverLimit_;
        uint256 newTotalActiveCover = totalActiveCover() + newCoverLimit_ - currentCoverLimit;
        _totalActiveCover = newTotalActiveCover;
        _updatePolicyManager(newTotalActiveCover);
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
     */
    function withdraw(uint256 amount_) external override nonReentrant whileUnpaused {
      require(amount_ > 0, "cannot withdraw 0");
      uint256 currentCoverLimit = coverLimitOf(_policyID[msg.sender]);
      require(_soteriaAccountBalance[msg.sender] - amount_ > _maxChargeablePremium * currentCoverLimit, "must cover next premium charge");
      _soteriaAccountBalance[msg.sender] -= amount_;
      Address.sendValue(payable(msg.sender), amount_);
      emit WithdrawMade(msg.sender, amount_);
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
            // skip computation if policy inactive (coverLimit == 0)
            if (coverLimitOf(policyIDOf(holders_[i])) == 0) {
                continue;
            }

            require(premiums_[i] <= _maxChargeablePremium * coverLimitOf(_policyID[msg.sender]), "Charging more than maxChargeablePremium");

            // If policy holder can pay for premium charged
            if (_soteriaAccountBalance[holders_[i]] + _rewardPoints[holders_[i]] >= premiums_[i]) {
                amountToPayTreasury += premiums_[i];

                // If reward points can cover premium charged
                if (_rewardPoints[holders_[i]] >= premiums_[i]) {
                    _rewardPoints[holders_[i]] -= premiums_[i];
                } else {
                    uint256 amountDeductedFromSoteriaAccount = premiums_[i] - _rewardPoints[holders_[i]];
                    _soteriaAccountBalance[holders_[i]] -= amountDeductedFromSoteriaAccount;
                    _rewardPoints[holders_[i]] = 0;
                }
                
                emit PremiumCharged(holders_[i], premiums_[i]);
            } else {
                uint256 partialPremium = _soteriaAccountBalance[holders_[i]] + _rewardPoints[holders_[i]];
                amountToPayTreasury += partialPremium;
                _rewardPoints[holders_[i]] = 0;
                _soteriaAccountBalance[holders_[i]] = 0;
                // turn off the policy
                _closePolicy(holders_[i]);
                emit PremiumPartiallyCharged(holders_[i], premiums_[i], partialPremium);
            }  
        }
        // transfer premium to the treasury
        ITreasury(payable(_registry.treasury())).routePremiums{value: amountToPayTreasury}();
    }

    /**
     * @notice Deactivate a policy.
     * User will receive their deposited funds.
     * Can only be called by the policyholder.
     * @param policyID_ The ID of the policy.
     */
     function deactivatePolicy(uint256 policyID_) external override nonReentrant {
        require(_exists(policyID_), "invalid policy");
        require(ownerOf(policyID_) == msg.sender, "!policyholder");
        uint256 refundAmount = soteriaAccountBalance(msg.sender);
        _totalActiveCover -= coverLimitOf(policyID_);
        _coverLimitOf[policyID_] = 0;
        _soteriaAccountBalance[msg.sender] = 0;
        _updatePolicyManager(_totalActiveCover);

        // send deposited fund to the policyholder
        if (refundAmount > 0) Address.sendValue(payable(msg.sender), refundAmount);
        emit PolicyDeactivated(policyID_);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
    * @notice Determine available capacity for new cover.
    * @return newCoverCapacity_ The amount of available capacity for new cover.
    */
    function newCoverCapacity() public view override returns (uint256 newCoverCapacity_) {
        newCoverCapacity_ = maxCover() - totalActiveCover();
    }

    /**
    * @notice Return reward points for a policyholder.
    * @param policyholder_ The address of the policyholder.
    * @return rewardPoints_ The reward points for a policyholder.
    */
    function rewardPointsOf(address policyholder_) public view override returns (uint256 rewardPoints_) {
        return _rewardPoints[policyholder_];
    }

    /**
     * @notice Returns the Soteria account balance for a policyholder.
     * @param policyholder_ The address of the policyholder.
     * @return amount The amount of funds.    
    */
    function soteriaAccountBalance(address policyholder_) public view override returns (uint256 amount) {
        return _soteriaAccountBalance[policyholder_];
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
    function policyIDOf(address policyholder_) public view override returns (uint256 policyID) {
        return _policyID[policyholder_];
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
     * @notice Returns active cover amount in `wei`.
     * @return amount The active cover amount.
    */
    function totalActiveCover() public view override returns (uint256 amount) {
        return _totalActiveCover;
    }

    /**
     * @notice Returns the policy count.
     * @return count The policy count.
    */
    function policyCount() public view override returns (uint256 count) {
        return _totalPolicyCount;
    }

    /**
     * @notice Returns the max chargeable premium.
     * @return maxChargeablePremium_ the max chargeable premium.
    */
    function maxChargeablePremium() public view override returns (uint256 maxChargeablePremium_) {
        return _maxChargeablePremium;
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
     * @notice set _maxChargeablePremium.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param maxChargeablePremium_ Desired maxChargeablePremium.
    */
    function setMaxChargeablePremium(uint256 maxChargeablePremium_) external override onlyGovernance {
        _maxChargeablePremium = maxChargeablePremium_;
        emit MaxChargeablePremiumSet(maxChargeablePremium_);
    }

    /**
     * @notice Enables governance to gift 'free' cover to specific addresses.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param policyholder_ The policy holder to gift reward points to.
     * @param pointsToGift_ Amount of reward points to gift.
    */
    function giftRewardPoints(address policyholder_, uint256 pointsToGift_) external override onlyGovernance {
        _rewardPoints[policyholder_] += pointsToGift_;
        emit RewardPointsGifted(policyholder_, pointsToGift_);
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
        if (changeInTotalCover < newCoverCapacity()) return true;
        else return false;
    }

    /**
     * @notice Adds funds to policy holder's balance.
     * @param policyholder The policy holder address.
     * @param amount The amount of fund to deposit.
    */
    function _deposit(address policyholder, uint256 amount) internal whileUnpaused {
        _soteriaAccountBalance[policyholder] += amount;
        emit DepositMade(policyholder, amount);
    }

    /**
     * @notice Closes the policy when user has no enough fund to pay premium.
     * @param policyholder The address of the policy owner.
    */
    function _closePolicy(address policyholder) internal {
        uint256 policyID = policyIDOf(policyholder);
        _totalActiveCover -= coverLimitOf(policyID);
        _coverLimitOf[policyID] = 0;
        _updatePolicyManager(_totalActiveCover);
        emit PolicyClosed(policyID);
    }

    /**
     * @notice Updates policy manager's active cover amount.
     * @param soteriaActiveCoverLimit The active cover amount of soteria product.
    */
    function _updatePolicyManager(uint256 soteriaActiveCoverLimit) internal {
        _policyManager.setSoteriaActiveCoverLimit(soteriaActiveCoverLimit);
        emit PolicyManagerUpdated(soteriaActiveCoverLimit);
    }
}