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
    event ProductAdded(address _product);
    event ProductRemoved(address _product);
    event PolicyCreated(uint256 _tokenID);
    event PolicyBurned(uint256 _tokenID);

    /**
     * @notice Adds a new product.
     * Can only be called by the current governor.
     * @param _product the new product
     */
    function addProduct(address _product) external;

    /**
     * @notice Removes a product.
     * Can only be called by the current governor.
     * @param _product the product to remove
     */
    function removeProduct(address _product) external;


    /**
     * @notice Set the token descriptor.
     * Can only be called by the current governor.
     * @param _policyDescriptor The new token descriptor address.
     */
    function setPolicyDescriptor(address _policyDescriptor) external;

    /// @notice The address of the policy descriptor contract, which handles generating token URIs for policies.
    function policyDescriptor() external view returns (address);

    /**
     * @notice Checks is an address is an active product.
     * @param _product The product to check.
     * @return _status True if the product is active.
     */
    function productIsActive(address _product) external view returns (bool _status);

    /**
     * @notice Returns the number of products.
     * @return _count The number of products.
     */
    function numProducts() external view returns (uint256 _count);

    /**
     * @notice Returns the product at the given index.
     * @param _productNum The index to query.
     * @return _product The address of the product.
     */
    function getProduct(uint256 _productNum) external view returns (address _product);

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
     * @param _policyID The policy id to return info.
     * @return _info info in a struct.
     */
    function policyInfo(uint256 _policyID) external view returns (PolicyInfo memory _info);

    /**
     * @notice Information about a policy.
     * @param _policyID The policy id to return info.
     * @return _policyholder The address of the policy holder.
     * @return _product The product of the policy.
     * @return _positionContract The covered contract for the policy.
     * @return _coverAmount The amount covered for the policy.
     * @return _expirationBlock The expiration block of the policy.
     * @return _price The price of the policy.
     */
    function getPolicyInfo(uint256 _policyID) external view returns (address _policyholder, address _product, address _positionContract, uint256 _coverAmount, uint40 _expirationBlock, uint24 _price);

    /**
     * @notice The holder of the policy.
     * @param _policyID The policy id.
     * @return _policyholder The address of the policy holder.
     */
    function getPolicyholder(uint256 _policyID) external view returns (address _policyholder);

    /**
     * @notice The product used to purchase the policy.
     * @param _policyID The policy id.
     * @return _product The product of the policy.
     */
    function getPolicyProduct(uint256 _policyID) external view returns (address _product);

    /**
     * @notice The position contract the policy covers.
     * @param _policyID The policy id.
     * @return _positionContract The position contract of the policy.
     */
    function getPolicyPositionContract(uint256 _policyID) external view returns (address _positionContract);

    /**
     * @notice The expiration block of the policy.
     * @param _policyID The policy id.
     * @return _expirationBlock The expiration block of the policy.
     */
    function getPolicyExpirationBlock(uint256 _policyID) external view returns (uint40 _expirationBlock);

    /**
     * @notice The cover amount of the policy.
     * @param _policyID The policy id.
     * @return _coverAmount The cover amount of the policy.
     */
    function getPolicyCoverAmount(uint256 _policyID) external view returns (uint256 _coverAmount);

    /**
     * @notice The cover price in wei per block per wei multiplied by 1e12.
     * @param _policyID The policy id.
     * @return _price The price of the policy.
     */
    function getPolicyPrice(uint256 _policyID) external view returns (uint24 _price);

    /**
     * @notice Lists all policies for a given policy holder.
     * @param _policyholder The address of the policy holder.
     * @return _policyIDs The list of policy IDs that the policy holder has in any order.
     */
    function listPolicies(address _policyholder) external view returns (uint256[] memory _policyIDs);
    function exists(uint256 _policyID) external view returns (bool);
    function policyIsActive(uint256 _policyID) external view returns (bool);
    function policyHasExpired(uint256 _policyID) external view returns (bool);

    /*** POLICY MUTATIVE FUNCTIONS
    Functions that create, modify, and destroy policies
    ****/
    /**
     * @notice Creates new ERC721 policy `tokenID` for `to`.
     * The caller must be a product.
     * @param _policyholder receiver of new policy token
     * @param _positionContract contract address where the position is covered
     * @param _expirationBlock policy expiration block number
     * @param _coverAmount policy coverage amount (in wei)
     * @param _price coverage price
     * @return policyID (aka tokenID)
     */
    function createPolicy(
        address _policyholder,
        address _positionContract,
        uint256 _coverAmount,
        uint40 _expirationBlock,
        uint24 _price
    ) external returns (uint256 policyID);
    function setPolicyInfo(uint256 _policyID, address _policyholder, address _positionContract, uint256 _coverAmount, uint40 _expirationBlock, uint24 _price) external;
    function burn(uint256 _tokenId) external;

    function updateActivePolicies(uint256[] calldata _policyIDs) external;

    // other view functions

    function activeCoverAmount() external view returns (uint256);
}
