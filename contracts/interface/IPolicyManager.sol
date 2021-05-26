// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;


interface IPolicyManager {

    struct PolicyTokenURIParams {
        address policyholder;
        address product;
        address positionContract;
        uint256 expirationBlock;
        uint256 coverAmount;
        uint256 price;
    }

    function setGovernance(address _governance) external;
    function addProduct(address _product) external;
    function removeProduct(address _product) external;

    /*** POLICY VIEW FUNCTIONS
    View functions that give us data about policies
    ****/
    function getPolicyParams(uint256 _policyID) external view returns (PolicyTokenURIParams memory);
    function getPolicyholder(uint256 _policyID) external view returns (address);
    function getPolicyProduct(uint256 _policyID) external view returns (address);
    function getPolicyPositionContract(uint256 _policyID) external view returns (address);
    function getPolicyExpirationBlock(uint256 _policyID) external view returns (uint256);
    function getPolicyCoverAmount(uint256 _policyID) external view returns (uint256);
    function getPolicyPrice(uint256 _policyID) external view returns (uint256);
    function myPolicies() external view returns (uint256[] memory);

    /*** POLICY MUTATIVE FUNCTIONS
    Functions that create, modify, and destroy policies
    ****/
    function createPolicy(address _policyholder, address _positionContract, uint256 _expirationBlock, uint256 _coverAmount, uint256 _price) external returns (uint256 tokenID);
    function setTokenURI(uint256 _tokenId, address _policyholder, address _positionContract, uint256 _expirationBlock, uint256 _coverAmount, uint256 _price) external;
    function burn(uint256 _tokenId) external;

    /*** ERC721 INHERITANCE FUNCTIONS
    Overrides that properly set functionality through parent contracts
    ****/
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}
