// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import '@openzeppelin/contracts/utils/Strings.sol';


/* TODO
 * - keep track of addresses who's policies expired and burned to later give discounts
 * - restrict transfers or separate buyer-policyholder notions
 */

/**
 * @title PolicyManager
 * @author solace.fi
 * @notice Creates new and modifies existing coverage policy ERC721 tokens
 */
contract PolicyManager is ERC721URIStorage, ERC721Enumerable {
    using Address for address;

    /// @notice governor
    address public governance;
    /// @notice active products
    mapping (address => bool) public productIsActive;

    /// @notice total policy count
    uint256 public totalPolicyCount = 0;

    struct PolicyTokenURIParams {
        address policyholder;
        address product;
        address positionContract;
        uint256 expirationBlock;
        uint256 coverAmount;
        uint256 price;
    }

    /**
     * @notice Constructs the Policy Deployer ERC721 Token contract.
     */
    constructor() ERC721("Solace Policy", "SPT") {
        governance = msg.sender;
    }

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance the new governor
     */
    function setGovernance(address _governance) public {
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    /**
     * @notice Adds a new product.
     * Can only be called by the current governor.
     * @param _product the new product
     */
    function addProduct(address _product) public {
        require(msg.sender == governance, "!governance");
        productIsActive[_product] = true;
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current governor.
     * @param _product the product to remove
     */
    function removeProduct(address _product) public {
        require(msg.sender == governance, "!governance");
        productIsActive[_product] = false;
    }

    /*** POLICY VIEW FUNCTIONS 
    View functions that give us data about policies
    ****/

    function getPolicyParams(uint256 _policyID) public view returns (PolicyTokenURIParams memory) {
        string memory encodedTokenURI = tokenURI(_policyID);
        PolicyTokenURIParams memory params = _decodeTokenURI(encodedTokenURI);
        return params;
    }

    function getPolicyholderAddress(uint256 _policyID) external view returns (address policyholder){}

    function getPolicyProduct(uint256 _policyID) external view returns (address product){}

    function getPolicyExpirationBlock(uint256 _policyID) external view returns (uint256) {
        PolicyTokenURIParams memory params = getPolicyParams(_policyID);
        return params.expirationBlock;
    }

    function getPolicyCoverAmount(uint256 _policyID) external view returns (uint256) {
        PolicyTokenURIParams memory params = getPolicyParams(_policyID);
        return params.coverAmount;
    }
    
    function getPolicyPrice(uint256 _policyID) external view returns (uint256 price){}

    function myPolicies() external view returns (uint256[] memory tokenIDs) {
        uint256 tokenCount = balanceOf(msg.sender);
        tokenIDs = new uint256[](tokenCount);
        for (uint256 index=0; index < tokenCount; index++) {
            tokenIDs[index] = tokenOfOwnerByIndex(msg.sender,index);
        }
        return tokenIDs;
    }

    

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
     * @return tokenID (aka policyID)
     */
    function createPolicy(
        address _policyholder,
        address _positionContract,
        uint256 _expirationBlock,
        uint256 _coverAmount,
        uint256 _price
        ) 
        external returns (uint256 tokenID)
    {
        require(productIsActive[msg.sender], "product !active");
        PolicyTokenURIParams memory tokenURIParams = PolicyTokenURIParams({
            policyholder: _policyholder,
            product: msg.sender,
            positionContract: _positionContract,
            expirationBlock: _expirationBlock,
            coverAmount: _coverAmount,
            price: _price
        });
        tokenID = totalPolicyCount++;
        _beforeTokenTransfer(address(0), _policyholder, tokenID);
        _mint(_policyholder, tokenID);
        string memory tokenURI = _encodeTokenURI(tokenURIParams);
        _setTokenURI(tokenID, tokenURI);
        return tokenID;
    }

    /**
     * @notice Exposes setTokenURI function for products to modify policies
     * The caller must be a product.
     * @param _tokenId tokenID (aka policyID)
     * @param _policyholder receiver of new policy token
     * @param _positionContract contract address where the position is covered
     * @param _expirationBlock policy expiration block number
     * @param _coverAmount policy coverage amount (in wei)
     * @param _price coverage price
     */
    function setTokenURI(
        uint256 _tokenId,
        address _policyholder,
        address _positionContract,
        uint256 _expirationBlock,
        uint256 _coverAmount,
        uint256 _price
        )
        external
    {
        require(productIsActive[msg.sender], "product !active");
        PolicyTokenURIParams memory tokenURIParams = PolicyTokenURIParams({
            policyholder: _policyholder,
            product: msg.sender,
            positionContract: _positionContract,
            expirationBlock: _expirationBlock,
            coverAmount: _coverAmount,
            price: _price
        });
        string memory tokenURI = _encodeTokenURI(tokenURIParams);
        _setTokenURI(_tokenId, tokenURI);
    }

    /**
     * @notice Fuction for the product to burn expired or canceled policies
     * The caller must be a product.
     * @param _tokenId tokenID (aka policyID)
     */
    function burn(uint256 _tokenId) external {
        require(productIsActive[msg.sender], "product !active");
        _beforeTokenTransfer(ownerOf(_tokenId), address(0), _tokenId);
        _burn(_tokenId);
    }

    /**
     * @notice Encodes `tokenURI`
     * @param _params policy tokenURI parameteres passed as PolicyTokenURIParams struct
     * @return string `tokenURI`
     */
    function _encodeTokenURI(PolicyTokenURIParams memory _params) internal pure returns (string memory) {
        string memory tokenURI = string(abi.encode(_params));
        return tokenURI;
    }

    /**
     * @notice Decodes `tokenURI`
     * @param _tokenURI policy tokenURI passed as a string
     * @return struct `params`
     */
    function _decodeTokenURI(string memory _tokenURI) internal pure returns (PolicyTokenURIParams memory) {
        PolicyTokenURIParams memory params = abi.decode(bytes(_tokenURI), (PolicyTokenURIParams));
        return params;
    }


    /*** ERC721 INHERITANCE FUNCTIONS 
    Overrides that properly set functionality through parent contracts
    ****/

    /**
     * @dev Must use _beforeTokenTransfer() to keep track of the tokens according to Enumerable 
     */
    function _transfer(address from, address to, uint256 tokenId) internal override {
        _beforeTokenTransfer(from, to, tokenId);
        super._transfer(from, to, tokenId);
    }

    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal virtual override(ERC721, ERC721Enumerable) {
        ERC721Enumerable._beforeTokenTransfer(from, to, tokenId);
    }

    function _burn(uint256 tokenId) internal virtual override(ERC721, ERC721URIStorage) {
        ERC721URIStorage._burn(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, ERC721Enumerable) returns (bool) {
        ERC721Enumerable.supportsInterface(interfaceId);
    }

    function tokenURI(uint256 tokenId) public view virtual override(ERC721, ERC721URIStorage) returns (string memory) {
        ERC721URIStorage.tokenURI(tokenId);
    }

}