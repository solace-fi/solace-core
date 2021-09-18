// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IFusionProduct
 * @author solace.fi
 * @notice Interface for fusion product contracts
 */
interface IFusionProduct {

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
     * @notice Fuses policies together.
     * @param policyIDs The list of policies to fuse, They are burnt in the process.
     * @return policyID The ID of the fused policy.
     */
    function fuse(uint256[] calldata policyIDs) external returns (uint256 policyID);

    /**
     * @notice Cancel and burn a policy.
     * User will receive a refund for the remaining blocks.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     * @param forfeitChange False to receive your claim, true to forfeit it to the capital pool.
     */
    function cancelPolicy(uint256 policyID, bool forfeitChange) external;

    /***************************************
    QUOTE VIEW FUNCTIONS
    ***************************************/

    /// @notice The current amount covered (in wei).
    function activeCoverAmount() external view returns (uint256);

    /**
     * @notice Returns the name of the product.
     * Must be implemented by child contracts.
     * @return productName The name of the product.
     */
    function name() external view returns (string memory productName);

    /// @notice Cannot fuse policies while paused. (Default is False)
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
     * @notice Changes the policy manager.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param policyManager_ The new policy manager.
     */
    function setPolicyManager(address policyManager_) external;
}
