// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

interface IPolicyManager /*is IERC721Enumerable, IERC721Metadata*/ {
    event ProductAdded(address product);
    event ProductRemoved(address product);
    event PolicyCreated(uint256 tokenID);
    event PolicyBurned(uint256 tokenID);
    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);

    /// @notice Governance.
    function governance() external view returns (address);

    /// @notice Governance to take over.
    function newGovernance() external view returns (address);

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external;

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external;

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

    /*** POLICY VIEW FUNCTIONS
    View functions that give us data about policies
    ****/
    function getPolicyInfo(uint256 _policyID) external view returns (address policyholder, address product, address positionContract, uint256 expirationBlock, uint256 coverAmount, uint256 price);
    function getPolicyholder(uint256 _policyID) external view returns (address);
    function getPolicyProduct(uint256 _policyID) external view returns (address);
    function getPolicyPositionContract(uint256 _policyID) external view returns (address);
    function getPolicyExpirationBlock(uint256 _policyID) external view returns (uint256);
    function getPolicyCoverAmount(uint256 _policyID) external view returns (uint256);
    function getPolicyPrice(uint256 _policyID) external view returns (uint256);
    function listPolicies(address _policyholder) external view returns (uint256[] memory);

    /*** POLICY MUTATIVE FUNCTIONS
    Functions that create, modify, and destroy policies
    ****/
    function createPolicy(address _policyholder, address _positionContract, uint256 _expirationBlock, uint256 _coverAmount, uint256 _price) external returns (uint256 tokenID);
    function setPolicyInfo(uint256 _policyId, address _policyholder, address _positionContract, uint256 _expirationBlock, uint256 _coverAmount, uint256 _price) external;
    function burn(uint256 _tokenId) external;
}
