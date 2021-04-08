// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import '@openzeppelin/contracts/utils/Strings.sol';


/* TODO
 * - add buyer to policy params (and other params?)
 * - restrict transfers to whitelisted addresses?
 * - expirationBlock vs expirationDate ???
 */

contract PolicyDeployer is ERC721URIStorage {
    using Address for address;

    /// @notice governor
    address public governance;
    /// @notice products
    mapping (address => bool) public products;
    /// @notice total policy count
    uint256 totalPolicyCount = 0;

    struct PolicyTokenURIParams {
        address product;
        uint256 expirationBlock;
        uint256 coverAmount;
    }

    /**
     * @notice Constructs the Policy Deployer ERC721 Token contract.
     */
    constructor() ERC721("Solace.Policy", "SPT") {
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
        products[_product] = true;
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current governor.
     * @param _product the product to remove
     */
    function removeProduct(address _product) public {
        require(msg.sender == governance, "!governance");
        products[_product] = false;
    }

    /**
     * @notice Creates new ERC721 policy `tokenID` for `to`.
     * The caller must be a product.
     * @param _buyer receiver of new policy token
     * @param _expirationBlock policy expiration block number
     * @param _coverAmount policy coverage amount (in wei)
     * @return tokenID (aka policyID)
     */
    function createPolicy(address _buyer, uint256 _expirationBlock, uint256 _coverAmount) external returns (uint256 tokenID) {
        require(products[msg.sender], "!product");
        PolicyTokenURIParams tokenURIParams = {
            product = msg.sender;
            expirationBlock = _expirationBlock;
            coverAmount = _coverAmount;
        };
        uint256 tokenID = _getTokenID();
        _mint(_buyer, tokenID);
        string tokenURI = _constructTokenURI(tokenURIParams)
        _setTokenURI(tokenID, tokenURI);
        return tokenID;
    }

    /**
     * @dev Sets `_tokenURI` as the tokenURI of `tokenId`.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     * - `msg.sender` must be the correct product
     */
    function setTokenURI(uint256 tokenId, string memory _tokenURI) external {
        require(products[msg.sender], "!product");
        _setTokenURI(tokenId, _tokenURI);
    }

    /**
     * @dev Destroys `tokenId`.
     * The approval is cleared when the token is burned.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     * - `msg.sender` must be the correct product
     *
     * Emits a {Transfer} event.
     */
    function burn(uint256 tokenId) external override {
        require(products[msg.sender], "!product");
        _burn(tokenId);
    }

    /**
     * @notice Creates new `tokenID` and increment the total policy count.
     * @return tokenID (aka policyID)
     */
    function _getTokenID() internal returns (uint256 tokenID) {
        uint256 tokenID = totalPolicyCount++;
        return tokenID;
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
                    '{"product":"', addressToString(_params.product),
                    '", "expirationBlock":"', uint256(_params.expirationBlock).toString(),
                    '", "coverAmount":"', uint256(_params.coverAmount).toString(),
                )
            );
        return tokenURI;
    }

    /**
     * @notice Casts an address to hex string
     * @param addr address to be converted to string
     * @return string of the address
     */
    function addressToString(address addr) internal pure returns (string memory) {
        return (uint256(addr)).toHexString(20);
    }
}