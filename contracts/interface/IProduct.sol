// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IProduct
 * @author solace.fi
 * @notice Interface for product contracts
 */
interface IProduct {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a policy is created.
    event PolicyCreated(uint256 indexed policyID);
    /// @notice Emitted when a policy is extended.
    event PolicyExtended(uint256 indexed policyID);
    /// @notice Emitted when a policy is canceled.
    event PolicyCanceled(uint256 indexed policyID);
    /// @notice Emitted when a policy is updated.
    event PolicyUpdated(uint256 indexed policyID);
    /// @notice Emitted when a claim is submitted.
    event ClaimSubmitted(uint256 indexed policyID);
    /// @notice Emitted when min period is set.
    event MinPeriodSet(uint40 minPeriod);
    /// @notice Emitted when max period is set.
    event MaxPeriodSet(uint40 maxPeriod);
    /// @notice Emitted when buying is paused or unpaused.
    event PauseSet(bool paused);
    /// @notice Emitted when PolicyManager is set.
    event PolicyManagerSet(address policyManager);
    /// @notice Emitted when a risk strategy is added.
    event StrategyAdded(address strategy);
    /// @notice Emitted when a risk strategy is removed.
    event StrategyRemoved(address strategy);

    /***************************************
    POLICYHOLDER FUNCTIONS
    ***************************************/

    /**
     * @notice Purchases and mints a policy on the behalf of the policyholder.
     * User will need to pay **ETH**.
     * @param policyholder Holder of the position(s) to cover.
     * @param coverAmount The value to cover in **ETH**.
     * @param blocks The length (in blocks) for policy.
     * @param positionDescription A byte encoded description of the position(s) to cover.
     * @param riskStrategy The risk strategy of the product to cover.
     * @return policyID The ID of newly created policy.
     */
    function buyPolicy(address policyholder, uint256 coverAmount, uint40 blocks, bytes memory positionDescription, address riskStrategy) external payable returns (uint256 policyID);

    /**
     * @notice Increase or decrease the cover amount of the policy.
     * User may need to pay **ETH** for increased cover amount or receive a refund for decreased cover amount.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     * @param newCoverAmount The new value to cover in **ETH**.
     */
    function updateCoverAmount(uint256 policyID, uint256 newCoverAmount) external payable;

    /**
     * @notice Extend a policy.
     * User will need to pay **ETH**.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     * @param extension The length of extension in blocks.
     */
    function extendPolicy(uint256 policyID, uint40 extension) external payable;

    /**
     * @notice Extend a policy and update its cover amount.
     * User may need to pay **ETH** for increased cover amount or receive a refund for decreased cover amount.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     * @param newCoverAmount The new value to cover in **ETH**.
     * @param extension The length of extension in blocks.
     */
    function updatePolicy(uint256 policyID, uint256 newCoverAmount, uint40 extension) external payable;

    /**
     * @notice Cancel and burn a policy.
     * User will receive a refund for the remaining blocks.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     */
    function cancelPolicy(uint256 policyID) external;

    /***************************************
    QUOTE VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Calculate a premium quote for a policy.
     * @param coverAmount The value to cover in **ETH**.
     * @param blocks The duration of the policy in blocks.
     * @param riskStrategy The risk strategy address.
     * @return premium The quote for their policy in **ETH**.
     */
    function getQuote(uint256 coverAmount, uint40 blocks, address riskStrategy) external view returns (uint256 premium);

    /***************************************
    GLOBAL VIEW FUNCTIONS
    ***************************************/

    /** 
     * @notice Returns the minimum policy period in blocks.
     * @return period The minimum period value.
    */
    function minPeriod() external view returns (uint40);

    /**
     * @notice Returns the maximum policy period in blocks.
     * @return period The maxiumum period value.
    */
    function maxPeriod() external view returns (uint40);

    /**
     * @notice Returns the current amount covered (in wei).
     * @return amount The current amount.
    */
    function activeCoverAmount() external view returns (uint256 amount);

    /**
     * @notice Returns the current amount covered (in wei) per risk strategy.
     * @param riskStrategy The risk strategy address.
     * @return amount The current amount.
    */
    function activeCoverAmountPerStrategy(address riskStrategy) external view returns (uint256 amount);

    /**
      * @notice Return the strategy at an index.
      * @dev Enumerable `[1, numStrategies]`.
      * @param index_ Index to query.
      * @return strategy The product address.
    */
    function strategyAt(uint256 index_) external view returns (address strategy);

    /**
     * @notice Returns the number of registered strategies.
     * @return count The number of strategies.
    */
    function numStrategies() external view returns (uint256 count);

    /**
     * @notice Returns whether or not product is currently in paused state.
     * @return status True if product is paused.
    */
    function paused() external view returns (bool status);

    /**
     * @notice Returns the address of the [`PolicyManager`](../PolicyManager).
     * @return policymanager The policy manager address.
    */
    function policyManager() external view returns (address policymanager);

    /**
     * @notice Returns the address of the [`Registry`](../Registry).
     * @return registry The registry address.
    */
    function registry() external view returns (address registry);
   
    /**
     * @notice Returns true if the given account is authorized to sign claims.
     * @param account Potential signer to query.
     * @return status True if is authorized signer.
     */
     function isAuthorizedSigner(address account) external view returns (bool status);

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Updates the product's book-keeping variables.
     * Can only be called by the [`PolicyManager`](../PolicyManager).
     * @param coverDiff The change in active cover amount.
     */
    function updateActiveCoverAmount(int256 coverDiff) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the minimum number of blocks a policy can be purchased for.
     * @param minPeriod_ The minimum number of blocks.
     */
    function setMinPeriod(uint40 minPeriod_) external;

    /**
     * @notice Sets the maximum number of blocks a policy can be purchased for.
     * @param maxPeriod_ The maximum number of blocks
     */
    function setMaxPeriod(uint40 maxPeriod_) external;

    /**
     * @notice Changes the policy manager.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param policyManager_ The new policy manager.
     */
    function setPolicyManager(address policyManager_) external;

    /**
     * @notice Adds a risk strategy for the product.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param strategy_ The address of the risk strategy.
    */
    function addRiskStrategy(address strategy_) external;

    /**
     * @notice Removes risk strategy from the product.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param strategy_ The address of the risk strategy to remove.
    */
    function removeRiskStrategy(address strategy_) external;
}
