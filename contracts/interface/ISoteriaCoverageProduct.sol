// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface ISoteriaCoverageProduct {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a new Policy is created.
    event PolicyCreated(uint256 policyID);

    /// @notice Emitted when a Policy is updated.
    event PolicyUpdated(uint256 policyID);

    /// @notice Emitted when a Policy is closed.
    event PolicyClosed(uint256 policyID);

    /// @notice Emitted when a Policy ic canceled.
    event PolicyCanceled(uint256 policyID);

    /// @notice Emitted when Registry address is updated.
    event RegistrySet(address registry);

    /// @notice Emitted when pause is set.
    event PauseSet(bool pause);

    /// @notice Emitted when a deposit mande.
    event DepositMade(address from, uint256 amount);

    /// @notice Emitted when premium is charged.
    event PremiumCharged(address policyholder, uint256 amount);

    /// @notice Emitted when premium is partially charged.
    event PremiumPartiallyCharged(address policyholder, uint256 actualPremium, uint256 chargedPremium);

    /// @notice Emitted when policy manager cover amount for soteria is updated.
    event PolicyManagerUpdated(uint256 activeCoverAmount);

    /// @notice Emitted when a claim signer is added.
    event SignerAdded(address signer);

    /// @notice Emitted when a claim signer is removed.
    event SignerRemoved(address signer);

    /// @notice Emitted when a claim is submitted.
    event ClaimSubmitted(uint256 policyID);

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
    function activatePolicy(address policyholder_, uint256 coverAmount_, uint256 minFundAmount_) external payable returns (uint256 policyID);

    /**
     * @notice Deposits funds for policy holders.
     * @param policyholder_ The holder of the policy.
    */
    function deposit(address policyholder_) external payable;

    /**
     * @notice Updates the cover amount of the policy.
     * @param newCoverAmount_ The new value to cover in **ETH**.
    */
    function updateCoverAmount(uint256 newCoverAmount_) external;

    /**
     * @notice Charge premiums for each policy holder.
     * @param holders_ The policy holders.
     * @param premiums_ The premium amounts in `wei` per policy holder.
    */
    function chargePremiums(address[] calldata holders_, uint256[] calldata premiums_) external payable;

    /**
     * @notice Cancel and burn a policy.
     * User will receive their deposited funds.
     * Can only be called by the policyholder.
     * @param policyID_ The ID of the policy.
    */
    function cancelPolicy(uint256 policyID_) external;

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
    ) external;

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
    * @notice Given a request for coverage, determines if that risk is acceptable and if so at what price.
    * @param currentCover_ If updating an existing policy's cover amount, the current cover amount, otherwise 0.
    * @param newCover_ The cover amount requested.
    * @return acceptable True if risk of the new cover is acceptable, false otherwise.
    */
    function assessRisk(uint256 currentCover_, uint256 newCover_) external view returns (bool acceptable);
    
    /**
     * @notice Returns the policyholder fund amount.
     * @param policyholder_ The address of the policyholder.
     * @return amount The amount of funds.    
    */
    function funds(address policyholder_) external view returns (uint256 amount);
   
    /**
     * @notice Returns the policyholder's policy id.
     * @param policyholder_ The address of the policyholder.
     * @return policyID The policy id.
    */
    function policyByOwner(address policyholder_) external view returns (uint256 policyID);

    /**
     * @notice Returns whether if the policy is active or not.
     * @param policyID_ The id of the policy.
     * @return status True if policy is active. False otherwise.
    */
    function policyStatus(uint256 policyID_) external view returns (bool status);

    /**
     * @notice Returns the policy owner policy for given policy id.
     * @param policyID_ The policy id.
     * @return owner The address of the policyholder.
    */
    function ownerOfPolicy(uint256 policyID_) external view returns (address owner);

    /**
     * @notice Returns all policy holders.
     * @return holders The array of policy holders.
    */
    function policyholders() external view returns (address[] memory holders);

    /**
     * @notice The maximum amount of cover that `Soteria Product` can be sold.
     * @return cover The max amount of cover in `wei`
    */
    function maxCover() external view returns (uint256 cover);

    /**
     * @notice Returns  [`Registry`](./Registry) contract address.
     * @return registry_ The `Registry` address.
    */
    function registry() external view returns (address registry_);

    /**
     * @notice Returns [`RiskManager`](./RiskManager) contract address.
     * @return riskManager_ The `RiskManager` address.
    */
    function riskManager() external view returns (address riskManager_);

    /**
     * @notice Returns whether or not product is currently in paused state.
     * @return status True if product is paused.
    */
    function paused() external view returns (bool status);

    /**
     * @notice Returns active cover amount in `wei`.
     * @return amount The active cover amount.
    */
    function activeCoverAmount() external view returns (uint256 amount);

    /**
     * @notice Returns the policy count.
     * @return count The policy count.
    */
    function policyCount() external view returns (uint256 count);

    /**
     * @notice Returns cover amount of given policy id.
     * @param policy_ The policy id.
     * @return amount The cover amount for given policy.
    */
    function coverAmountOf(uint256 policy_) external view returns (uint256 amount);

    /**
     * @notice Returns true if the given account is authorized to sign claims.
     * @param account_ Potential signer to query.
     * @return status True if is authorized signer.
    */
    function isAuthorizedSigner(address account_) external view returns (bool status);
    
    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
    */
    function setRegistry(address registry_) external;

    /**
     * @notice Pauses or unpauses buying and extending policies.
     * Cancelling policies and submitting claims are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param paused_ True to pause, false to unpause.
    */
    function setPaused(bool paused_) external;

    /**
     * @notice Adds a new signer that can authorize claims.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer_ The signer to add.
    */
    function addSigner(address signer_) external;
    
    /**
     * @notice Removes a signer.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer_ The signer to remove.
    */
    function removeSigner(address signer_) external;
}