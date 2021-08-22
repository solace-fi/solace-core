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

    /***************************************
    POLICYHOLDER FUNCTIONS
    ***************************************/

    /**
     * @notice Purchases and mints a policy on the behalf of the policyholder.
     * User will need to pay **ETH**.
     * @param policyholder Holder of the position to cover.
     * @param positionContract The contract address where the policyholder has a position to be covered.
     * @param coverAmount The value to cover in **ETH**. Will only cover up to the appraised value.
     * @param blocks The length (in blocks) for policy.
     * @return policyID The ID of newly created policy.
     */
    function buyPolicy(address policyholder, address positionContract, uint256 coverAmount, uint40 blocks) external payable returns (uint256 policyID);

    /**
     * @notice Increase or decrease the cover amount for the policy.
     * User may need to pay **ETH** for increased cover amount or receive a refund for decreased cover amount.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     * @param newCoverAmount The new value to cover in **ETH**. Will only cover up to the appraised value.
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
     * @param newCoverAmount The new value to cover in **ETH**. Will only cover up to the appraised value.
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
     * @notice This function will only be implemented in the inheriting product contracts. It provides the user's total position in the product's protocol.
     * This total should be denominated in **ETH**. Every product will have a different mechanism to read and determine a user's total position in that product's protocol.
     * @dev It should validate that the `positionContract` belongs to the protocol and revert if it doesn't.
     * @param policyholder The `buyer` requesting the coverage quote.
     * @param positionContract The address of the exact smart contract the `buyer` has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @return positionAmount The user's total position in **Wei** in the product's protocol.
     */
    function appraisePosition(address policyholder, address positionContract) external view returns (uint256 positionAmount);

    /**
     * @notice Calculate a premium quote for a policy.
     * @param policyholder The holder of the position to cover.
     * @param positionContract The address of the exact smart contract the policyholder has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @param coverAmount The value to cover in **ETH**.
     * @param blocks The length for policy.
     * @return premium The quote for their policy in **Wei**.
     */
    function getQuote(address policyholder, address positionContract, uint256 coverAmount, uint40 blocks) external view returns (uint256 premium);

    /***************************************
    GLOBAL VIEW FUNCTIONS
    ***************************************/

    /// @notice Price in wei per 1e12 wei of coverage per block.
    function price() external view returns (uint24);
    /// @notice The minimum policy period in blocks.
    function minPeriod() external view returns (uint40);
    /// @notice The maximum policy period in blocks.
    function maxPeriod() external view returns (uint40);
    /**
     * @notice The maximum sum of position values that can be covered by this product.
     * @return maxCoverAmount The max cover amount.
     */
    function maxCoverAmount() external view returns (uint256 maxCoverAmount);
    /**
     * @notice The maximum cover amount for a single policy.
     * @return maxCoverAmountPerUser The max cover amount per user.
     */
    function maxCoverPerUser() external view returns (uint256 maxCoverAmountPerUser);
    /// @notice The max cover amount divisor for per user (maxCover / divisor = maxCoverPerUser).
    function maxCoverPerUserDivisor() external view returns (uint32);
    /// @notice Covered platform.
    /// A platform contract which locates contracts that are covered by this product.
    /// (e.g., `UniswapProduct` will have `Factory` as `coveredPlatform` contract, because every `Pair` address can be located through `getPool()` function).
    function coveredPlatform() external view returns (address);
    /// @notice The total policy count this product sold.
    function productPolicyCount() external view returns (uint256);
    /// @notice The current amount covered (in wei).
    function activeCoverAmount() external view returns (uint256);

    /**
     * @notice Returns the name of the product.
     * Must be implemented by child contracts.
     * @return productName The name of the product.
     */
    function name() external view returns (string memory productName);

    /// @notice Cannot buy new policies while paused. (Default is False)
    function paused() external view returns (bool);

    /// @notice Address of the [`PolicyManager`](../PolicyManager).
    function policyManager() external view returns (address);

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
     * @notice Sets the price for this product.
     * @param price_ Price in wei per 1e12 wei of coverage per block.
     */
    function setPrice(uint24 price_) external;

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
     * @notice Sets the max cover amount divisor per user (maxCover / divisor = maxCoverPerUser).
     * @param maxCoverPerUserDivisor_ The new divisor.
     */
    function setMaxCoverPerUserDivisor(uint32 maxCoverPerUserDivisor_) external;

    /**
     * @notice Changes the covered platform.
     * This function is used if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new **Product**.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param coveredPlatform_ The platform to cover.
     */
    function setCoveredPlatform(address coveredPlatform_) external;

    /**
     * @notice Changes the policy manager.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param policyManager_ The new policy manager.
     */
    function setPolicyManager(address policyManager_) external;
}
