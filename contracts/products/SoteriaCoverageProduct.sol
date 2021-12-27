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
    uint256 internal _activeCoverAmount;

    /// @notice The total policy count.
    uint256 internal _totalPolicyCount;

    /// @notice The policy holder funds.
    mapping(address => uint256) internal _funds;

    /// @notice The policyholder => policyID.
    mapping(address => uint256) internal _ownerToPolicy;

    /// @notice The policyID => policyholder.
    mapping(uint256 => address) internal _policyToOwner;

    /// @notice The cover amount for each policy(policyID => coverAmount).
    mapping (uint256 => uint256) internal _coverAmountOf;

    /// @notice The authorized signers.
    mapping(address => bool) internal _isAuthorizedSigner;

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
     * @param coverAmount_ The value to cover in **ETH**.
     * @param minFundAmount_ The minimum funding amount to pay weekly premium amount.
     * @return policyID The ID of newly created policy.
    */
    function activatePolicy(address policyholder_, uint256 coverAmount_, uint256 minFundAmount_) external payable override whileUnpaused returns (uint256 policyID) {
        require(policyholder_ != address(0x0), "zero address policyholder");
        require(coverAmount_ > 0, "zero cover value");
        require(funds(policyholder_) + msg.value >= minFundAmount_, "insufficient fund");
        
        policyID = policyByOwner(policyholder_);
        require(!policyStatus(policyID), "already bought policy");
        require(assessRisk(0, coverAmount_), "cannot accept that risk");

        // deposit funds
        _deposit(policyholder_, msg.value);

        if (policyID == 0) {
            policyID = ++_totalPolicyCount;
            _ownerToPolicy[policyholder_] = policyID;
            _policyToOwner[policyID] = policyholder_;
            _mint(policyholder_, policyID);
        }

        // update cover amount
        _activeCoverAmount += coverAmount_;
        _coverAmountOf[policyID] = coverAmount_;
       
        // update policy manager active cover amount
        _updatePolicyManager(_activeCoverAmount);
        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Updates the cover amount of the policy.
     * @param newCoverAmount_ The new value to cover in **ETH**.
    */
    function updateCoverAmount(uint256 newCoverAmount_) external override nonReentrant whileUnpaused {
        require(newCoverAmount_ > 0, "zero cover value");
        uint256 policyID = policyByOwner(msg.sender);
        require(policyID > 0, "invalid policy");
        uint256 currentCoverAmount = coverAmountOf(policyID);
        require(assessRisk(currentCoverAmount, newCoverAmount_), "cannot accept that risk");
        uint256 coverAmount = activeCoverAmount();
        coverAmount = coverAmount + newCoverAmount_ - currentCoverAmount;
        _coverAmountOf[policyID] = newCoverAmount_;
        _activeCoverAmount = coverAmount;
        _updatePolicyManager(coverAmount);
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
            // skip computation if policy inactive (coverAmount == 0)
            if (coverAmountOf(policyByOwner(holders_[i])) == 0) {
                continue;
            }

            if (_funds[holders_[i]] >= premiums_[i]) {
                amountToPayTreasury += premiums_[i];
                _funds[holders_[i]] -= premiums_[i];
                emit PremiumCharged(holders_[i], premiums_[i]);
            } else {
                uint256 partialPremium = _funds[holders_[i]];
                amountToPayTreasury += partialPremium;
                _funds[holders_[i]] = 0;
                // turn off the policy
                _closePolicy(holders_[i]);
                emit PremiumPartiallyCharged(holders_[i], premiums_[i], partialPremium);
            }  
        }
        // transfer premium to the treasury
        ITreasury(payable(_registry.treasury())).routePremiums{value: amountToPayTreasury}();
    }

    /**
     * @notice Cancel and burn a policy.
     * User will receive their deposited funds.
     * Can only be called by the policyholder.
     * @param policyID_ The ID of the policy.
     */
     function cancelPolicy(uint256 policyID_) external override nonReentrant {
        require(_exists(policyID_), "invalid policy");
        require(ownerOfPolicy(policyID_) == msg.sender, "!policyholder");
        uint256 refundAmount = funds(msg.sender);
        _activeCoverAmount -= coverAmountOf(policyID_);
        _coverAmountOf[policyID_] = 0;

        // send deposited fund to the policyholder
        if (refundAmount > 0) Address.sendValue(payable(msg.sender), refundAmount);
        _funds[msg.sender] = 0;
        _updatePolicyManager(_activeCoverAmount);
        emit PolicyCanceled(policyID_);
    }

    /**
     * @notice Submit a claim.
     * The user can only submit one claim per policy and the claim must be signed by an authorized signer.
     * If successful the policy is not burnt and a new claim is created.
     * The new claim will be in [`ClaimsEscrow`](../ClaimsEscrow) and have the same ID as the policy.
     * Can only be called by the policyholder.
     * @param policyID_ The policy that suffered a loss.
     * @param amountOut_ The amount the user will receive.
     * @param deadline_ Transaction must execute before this timestamp.
     * @param signature_ Signature from the signer.
     */
     function submitClaim(
        uint256 policyID_,
        uint256 amountOut_,
        uint256 deadline_,
        bytes calldata signature_
    ) external override nonReentrant {
        // validate inputs
        require(policyStatus(policyID_), "inactive policy");
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp <= deadline_, "expired deadline");
        require(ownerOfPolicy(policyID_) == msg.sender, "!policyholder");
        require(amountOut_ <= coverAmountOf(policyID_), "excessive amount out");
        // verify signature
        {
        bytes32 structHash = keccak256(abi.encode(_SUBMIT_CLAIM_TYPEHASH, policyID_, msg.sender, amountOut_, deadline_));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature_);
        require(_isAuthorizedSigner[signer], "invalid signature");
        }
        _activeCoverAmount -= coverAmountOf(policyID_);
        _coverAmountOf[policyID_] = 0;
        _updatePolicyManager(_activeCoverAmount);
        // submit claim to ClaimsEscrow
        IClaimsEscrow(payable(_registry.claimsEscrow())).receiveClaim(policyID_, msg.sender, amountOut_);
        emit ClaimSubmitted(policyID_);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
    * @notice Given a request for coverage, determines if that risk is acceptable and if so at what price.
    * @param currentCover_ If updating an existing policy's cover amount, the current cover amount, otherwise 0.
    * @param newCover_ The cover amount requested.
    * @return acceptable True if risk of the new cover is acceptable, false otherwise.
    */
    function assessRisk(uint256 currentCover_, uint256 newCover_) public view override returns (bool acceptable) {
        uint256 mc = maxCover();
        uint256 coverAmount = activeCoverAmount();
        coverAmount = coverAmount + newCover_ - currentCover_;
        if (coverAmount > mc) return false;
        return true;
    }

    /**
     * @notice Returns the policyholder fund amount.
     * @param policyholder_ The address of the policyholder.
     * @return amount The amount of funds.    
    */
    function funds(address policyholder_) public view override returns (uint256 amount) {
        return _funds[policyholder_];
    }

    /**
     * @notice Returns whether if the policy is active or not.
     * @param policyID_ The id of the policy.
     * @return status True if policy is active. False otherwise.
    */
    function policyStatus(uint256 policyID_) public view override returns (bool status) {
        return coverAmountOf(policyID_) > 0 ? true : false;
    }

    /**
     * @notice Returns the policyholder's policy id.
     * @param policyholder_ The address of the policyholder.
     * @return policyID The policy id.
    */
    function policyByOwner(address policyholder_) public view override returns (uint256 policyID) {
        return _ownerToPolicy[policyholder_];
    }

    /**
     * @notice Returns the policy owner policy for given policy id.
     * @param policyID_ The policy id.
     * @return owner The address of the policyholder.
    */
    function ownerOfPolicy(uint256 policyID_) public view override returns (address owner) {
        return _policyToOwner[policyID_];
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
    function activeCoverAmount() public view override returns (uint256 amount) {
        return _activeCoverAmount;
    }

    /**
     * @notice Returns all policy holders.
     * @return holders The array of policy holders.
    */
    function policyholders() public view override returns (address[] memory holders) {
        uint256 count = policyCount();
        holders = new address[](count);
        for (uint256 i = count; i > 0; i--) {
            holders[i-1] = _policyToOwner[i];
        }
        return holders;
    }

    /**
     * @notice Returns the policy count.
     * @return count The policy count.
    */
    function policyCount() public view override returns (uint256 count) {
        return _totalPolicyCount;
    }

    /**
     * @notice Returns cover amount of given policy id.
     * @param policy_ The policy id.
     * @return amount The cover amount for given policy.
    */
    function coverAmountOf(uint256 policy_) public view override returns (uint256 amount) {
        return _coverAmountOf[policy_];
    }

    /**
     * @notice Returns true if the given account is authorized to sign claims.
     * @param account_ Potential signer to query.
     * @return status True if is authorized signer.
     */
     function isAuthorizedSigner(address account_) external view override returns (bool status) {
        return _isAuthorizedSigner[account_];
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
     * Cancelling policies and submitting claims are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param paused_ True to pause, false to unpause.
    */
    function setPaused(bool paused_) external override onlyGovernance {
        _paused = paused_;
        emit PauseSet(paused_);
    }

    /**
     * @notice Adds a new signer that can authorize claims.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer_ The signer to add.
    */
    function addSigner(address signer_) external override onlyGovernance {
        require(signer_ != address(0x0), "zero address signer");
        _isAuthorizedSigner[signer_] = true;
        emit SignerAdded(signer_);
    }

    /**
     * @notice Removes a signer.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer_ The signer to remove.
    */
    function removeSigner(address signer_) external override onlyGovernance {
        _isAuthorizedSigner[signer_] = false;
        emit SignerRemoved(signer_);
    }

    /***************************************
    INTERNAL FUNCTIONS
    ***************************************/

    /**
     * @notice Adds funds to policy holder's balance.
     * @param policyholder The policy holder address.
     * @param amount The amount of fund to deposit.
    */
    function _deposit(address policyholder, uint256 amount) internal whileUnpaused {
        _funds[policyholder] += amount;
        emit DepositMade(policyholder, amount);
    }

    /**
     * @notice Closes the policy when user has no enough fund to pay premium.
     * @param policyholder The address of the policy owner.
    */
    function _closePolicy(address policyholder) internal {
        uint256 policyID = policyByOwner(policyholder);
        _activeCoverAmount -= coverAmountOf(policyID);
        _coverAmountOf[policyID] = 0;
        _updatePolicyManager(_activeCoverAmount);
        emit PolicyClosed(policyID);
    }

    /**
     * @notice Updates policy manager's active cover amount.
     * @param soteriaActiveCoverAmount The active cover amount of soteria product.
    */
    function _updatePolicyManager(uint256 soteriaActiveCoverAmount) internal {
        _policyManager.setSoteriaActiveCoverAmount(soteriaActiveCoverAmount);
        emit PolicyManagerUpdated(soteriaActiveCoverAmount);
    }

}