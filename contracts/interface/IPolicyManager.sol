// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

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
     * @notice Allows governance to set token descriptor.
     * Can only be called by the current governor.
     * @param _policyDescriptor The new token descriptor address.
     */
    function setPolicyDescriptor(address _policyDescriptor) external;

    /// @notice The address of the policy descriptor contract, which handles generating token URIs for policies
    function policyDescriptor() external view returns (address);

    /**
     * @notice Checks is an address is an active product.
     * @param _product The product to check.
     * @return True if the product is active.
     */
    function productIsActive(address _product) external view returns (bool);

    /**
     * @notice Returns the number of products.
     * @return The number of products.
     */
    function numProducts() external view returns (uint256);

    /**
     * @notice Returns the product at the given index.
     * @param _productNum The index to query.
     * @return The address of the product.
     */
    function getProduct(uint256 _productNum) external view returns (address);

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

    function policyInfo(uint256 _policyID) external view returns (PolicyInfo memory);
    function getPolicyInfo(uint256 _policyID) external view returns (address policyholder, address product, address positionContract, uint256 coverAmount, uint40 expirationBlock, uint24 price);
    function getPolicyholder(uint256 _policyID) external view returns (address);
    function getPolicyProduct(uint256 _policyID) external view returns (address);
    function getPolicyPositionContract(uint256 _policyID) external view returns (address);
    function getPolicyExpirationBlock(uint256 _policyID) external view returns (uint40);
    function getPolicyCoverAmount(uint256 _policyID) external view returns (uint256);
    function getPolicyPrice(uint256 _policyID) external view returns (uint24);
    function listPolicies(address _policyholder) external view returns (uint256[] memory);
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
