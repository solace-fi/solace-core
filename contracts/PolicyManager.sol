// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import '@openzeppelin/contracts/utils/Strings.sol';


/* TODO
 * - encode/decode tokenURI (ie define _constructTokenURI() )
 * - don't burn, but delete URI, so later we can see who bought policy to give discounts
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
        uint256 expirationBlock;
        uint256 coverAmount;
        uint256 price;
    }

    /**
     * @notice Constructs the Policy Deployer ERC721 Token contract.
     */
    constructor() ERC721("SolacePolicy", "SPT") {
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
    View functions that give us data about individual policies
    ****/

    function getPolicyholderAddress(uint256 _policyID) external view returns (address policyholder){
        // string memory tokenURIstring = abi.decode(tokenURI(_policyID));
        // PolicyTokenURIParams tokenURIParams = ;
    }

    function getPolicyProduct(uint256 _policyID) external view returns (address product){}

    function getPolicyExpirationBlock(uint256 _policyID) external view returns (uint256 expirationBlock){}

    function getPolicyCoverAmount(uint256 _policyID) external view returns (uint256 coverAmount){}
    
    function getPolicyPrice(uint256 _policyID) external view returns (uint256 price){}

    function myPolicies() external view returns (uint256[] memory tokenIDs) {
        uint256 tokenCount = balanceOf(msg.sender);
        uint256[] memory tokenIDs = new uint256[](tokenCount);
        for (uint256 index=0; index < tokenCount; index++) {
            tokenIDs[index] = tokenOfOwnerByIndex(msg.sender,index);
        }
        return tokenIDs;
    }

    /**
     * @notice Creates new ERC721 policy `tokenID` for `to`.
     * The caller must be a product.
     * @param _policyholder receiver of new policy token
     * @param _expirationBlock policy expiration block number
     * @param _coverAmount policy coverage amount (in wei)
     * @return tokenID (aka policyID)
     */
    function createPolicy(
        address _policyholder,
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
            expirationBlock: _expirationBlock,
            coverAmount: _coverAmount,
            price: _price
        });
        uint256 tokenID = totalPolicyCount++;
        _beforeTokenTransfer(address(0), _policyholder, tokenID);
        _mint(_policyholder, tokenID);
        // string tokenURI = _constructTokenURI(tokenURIParams)
        // _setTokenURI(tokenID, tokenURI);
        return tokenID;
    }

    /**
     * @notice Exposes setTokenURI function for products to modify policies
     * The caller must be a product.
     * @param _tokenId tokenID (aka policyID)
     * @param _tokenURI the new tokenURI
     */
    function setTokenURI(uint256 _tokenId, string memory _tokenURI) external {
        require(productIsActive[msg.sender], "product !active");
        _setTokenURI(_tokenId, _tokenURI);
    }

    /**
     * @notice Fuction for the product to burn expired or canceled policies
     * The caller must be a product.
     * @param _tokenId tokenID (aka policyID)
     */
    function burn(uint256 _tokenId) external override {
        require(productIsActive[msg.sender], "product !active");
        _beforeTokenTransfer(ownerOf(_tokenId), address(0), _tokenId);
        _burn(_tokenId);
    }


    /**
     * @notice Constructs `tokenURI`
     * @param _params policy tokenURI parameteres passed as PolicyTokenURIParams struct
     * @return string `tokenURI`
     */
    function _constructTokenURI(PolicyTokenURIParams memory _params) internal pure returns (string memory) {
        string memory tokenURI =
            string(
                abi.encode(
                    // '{"policyholder":"', addressToString(_params.policyholder),
                    // '", "product":"', addressToString(_params.product),
                    // '", "expirationBlock":"', uint256(_params.expirationBlock).toString(),
                    // '", "coverAmount":"', uint256(_params.coverAmount).toString(),
                    // '", "price":"', uint256(_params.price).toString(),'}'
                )
            );
        return tokenURI;
    }

    /**
     * @notice Casts an address to hex string
     * @param addr address to be converted to string
     * @return string of the address
     */
    // function addressToString(address addr) internal pure returns (string memory) {
    //     return (uint256(addr)).toHexString(20);
    // }

    /**
     * @dev Must use _beforeTokenTransfer() to keep track of the tokens according to Enumerable 
     * 
     */
    function _transfer(address from, address to, uint256 tokenId) internal override {
        _beforeTokenTransfer(from, to, tokenId);
        super._transfer(from, to, tokenId);
    }
}