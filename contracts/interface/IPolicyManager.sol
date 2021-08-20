// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

/**
 * @title IPolicyManager
 * @author solace.fi
 * @notice The **PolicyManager** manages the creation of new policies and modification of existing policies.
 *
 * Most users will not interact with **PolicyManager** directly. To buy, modify, or cancel policies, users should use the respective [**product**](../products/BaseProduct) for the position they would like to cover. Use **PolicyManager** to view policies.
 *
 * Policies are [**ERC721s**](https://docs.openzeppelin.com/contracts/4.x/api/token/erc721#ERC721).
 */
interface IPolicyManager /*is IERC721Enumerable, IERC721Metadata*/ {
    event ProductAdded(address product);
    event ProductRemoved(address product);
    event PolicyCreated(uint256 tokenID);
    event PolicyBurned(uint256 tokenID);

    /**
     * @notice Adds a new product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param product the new product
     */
    function addProduct(address product) external;

    /**
     * @notice Removes a product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param product the product to remove
     */
    function removeProduct(address product) external;


    /**
     * @notice Set the token descriptor.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param policyDescriptor The new token descriptor address.
     */
    function setPolicyDescriptor(address policyDescriptor) external;

    /// @notice The address of the policy descriptor contract, which handles generating token URIs for policies.
    function policyDescriptor() external view returns (address);

    /**
     * @notice Checks is an address is an active product.
     * @param product The product to check.
     * @return status True if the product is active.
     */
    function productIsActive(address product) external view returns (bool status);

    /**
     * @notice Returns the number of products.
     * @return count The number of products.
     */
    function numProducts() external view returns (uint256 count);

    /**
     * @notice Returns the product at the given index.
     * @param productNum The index to query.
     * @return product The address of the product.
     */
    function getProduct(uint256 productNum) external view returns (address product);

    /*** POLICY VIEW FUNCTIONS
    View functions that give us data about policies
    ****/

    /// @notice PolicyInfo struct.
    struct PolicyInfo {
        uint256 coverAmount;
        address policyholder;
        uint40 expirationBlock;
        address product;
        uint24 price;
        address positionContract;
    }

    /**
     * @notice Information about a policy.
     * @param policyID The policy ID to return info.
     * @return info info in a struct.
     */
    function policyInfo(uint256 policyID) external view returns (PolicyInfo memory info);

    /**
     * @notice Information about a policy.
     * @param policyID The policy ID to return info.
     * @return policyholder The address of the policy holder.
     * @return product The product of the policy.
     * @return positionContract The covered contract for the policy.
     * @return coverAmount The amount covered for the policy.
     * @return expirationBlock The expiration block of the policy.
     * @return price The price of the policy.
     */
    function getPolicyInfo(uint256 policyID) external view returns (address policyholder, address product, address positionContract, uint256 coverAmount, uint40 expirationBlock, uint24 price);

    /**
     * @notice The holder of the policy.
     * @param policyID The policy ID.
     * @return policyholder The address of the policy holder.
     */
    function getPolicyholder(uint256 policyID) external view returns (address policyholder);

    /**
     * @notice The product used to purchase the policy.
     * @param policyID The policy ID.
     * @return product The product of the policy.
     */
    function getPolicyProduct(uint256 policyID) external view returns (address product);

    /**
     * @notice The position contract the policy covers.
     * @param policyID The policy ID.
     * @return positionContract The position contract of the policy.
     */
    function getPolicyPositionContract(uint256 policyID) external view returns (address positionContract);

    /**
     * @notice The expiration block of the policy.
     * @param policyID The policy ID.
     * @return expirationBlock The expiration block of the policy.
     */
    function getPolicyExpirationBlock(uint256 policyID) external view returns (uint40 expirationBlock);

    /**
     * @notice The cover amount of the policy.
     * @param policyID The policy ID.
     * @return coverAmount The cover amount of the policy.
     */
    function getPolicyCoverAmount(uint256 policyID) external view returns (uint256 coverAmount);

    /**
     * @notice The cover price in wei per block per wei multiplied by 1e12.
     * @param policyID The policy ID.
     * @return price The price of the policy.
     */
    function getPolicyPrice(uint256 policyID) external view returns (uint24 price);

    /**
     * @notice Lists all policies for a given policy holder.
     * @param policyholder The address of the policy holder.
     * @return policyIDs The list of policy IDs that the policy holder has in any order.
     */
    function listPolicies(address policyholder) external view returns (uint256[] memory policyIDs);
    function exists(uint256 policyID) external view returns (bool);
    function policyIsActive(uint256 policyID) external view returns (bool);
    function policyHasExpired(uint256 policyID) external view returns (bool);

    /*** POLICY MUTATIVE FUNCTIONS
    Functions that create, modify, and destroy policies
    ****/
    /**
     * @notice Creates new ERC721 policy `tokenID` for `to`.
     * The caller must be a product.
     * @param policyholder receiver of new policy token
     * @param positionContract contract address where the position is covered
     * @param expirationBlock policy expiration block number
     * @param coverAmount policy coverage amount (in wei)
     * @param price coverage price
     * @return policyID (aka tokenID)
     */
    function createPolicy(
        address policyholder,
        address positionContract,
        uint256 coverAmount,
        uint40 expirationBlock,
        uint24 price
    ) external returns (uint256 policyID);
    function setPolicyInfo(uint256 policyID, address policyholder, address positionContract, uint256 coverAmount, uint40 expirationBlock, uint24 price) external;
    function burn(uint256 tokenID) external;

    function updateActivePolicies(uint256[] calldata policyIDs) external;

    // other view functions

    function activeCoverAmount() external view returns (uint256);
}
