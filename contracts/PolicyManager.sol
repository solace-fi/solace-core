// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interface/IPolicyManager.sol";


/* TODO
 * - keep track of addresses who's policies expired and burned to later give discounts
 */

/**
 * @title PolicyManager
 * @author solace.fi
 * @notice Creates new and modifies existing coverage policy ERC721 tokens
 */
contract PolicyManager is ERC721Enumerable, IPolicyManager {
    using Address for address;

    /// @notice Governor.
    address public override governance;

    /// @notice Governance to take over.
    address public override newGovernance;

    /// @notice active products
    mapping (address => bool) public productIsActive;

    /// @notice total policy count
    uint256 public totalPolicyCount = 0;

    struct PolicyInfo {
        address policyholder;
        address product;
        address positionContract;
        uint256 expirationBlock;
        uint256 coverAmount;
        uint256 price;
    }

    mapping(uint256 => PolicyInfo) private _policyInfo;

    /**
     * @notice Constructs the Policy Deployer ERC721 Token contract.
     */
    constructor() ERC721("Solace Policy", "SPT") {
        governance = msg.sender;
    }

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external override {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Adds a new product.
     * Can only be called by the current governor.
     * @param _product the new product
     */
    function addProduct(address _product) external override {
        require(msg.sender == governance, "!governance");
        productIsActive[_product] = true;
        emit ProductAdded(_product);
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current governor.
     * @param _product the product to remove
     */
    function removeProduct(address _product) external override {
        require(msg.sender == governance, "!governance");
        productIsActive[_product] = false;
        emit ProductRemoved(_product);
    }

    /*** POLICY VIEW FUNCTIONS
    View functions that give us data about policies
    ****/

    function getPolicyInfo(uint256 _policyID) external view override returns (address policyholder, address product, address positionContract, uint256 expirationBlock, uint256 coverAmount, uint256 price){
        require(ownerOf(_policyID) != address(0), "query for nonexistent token");
        PolicyInfo memory info = _policyInfo[_policyID];
        return (info.policyholder, info.product, info.positionContract, info.expirationBlock, info.coverAmount, info.price);
    }

    function getPolicyholder(uint256 _policyID) external view override returns (address){
        require(ownerOf(_policyID) != address(0), "query for nonexistent token");
        return _policyInfo[_policyID].policyholder;
    }

    function getPolicyProduct(uint256 _policyID) external view override returns (address){
        require(ownerOf(_policyID) != address(0), "query for nonexistent token");
        return _policyInfo[_policyID].product;
    }

    function getPolicyPositionContract(uint256 _policyID) external view override returns (address){
        require(ownerOf(_policyID) != address(0), "query for nonexistent token");
        return _policyInfo[_policyID].positionContract;
    }

    function getPolicyExpirationBlock(uint256 _policyID) external view override returns (uint256) {
        require(ownerOf(_policyID) != address(0), "query for nonexistent token");
        return _policyInfo[_policyID].expirationBlock;
    }

    function getPolicyCoverAmount(uint256 _policyID) external view override returns (uint256) {
        require(ownerOf(_policyID) != address(0), "query for nonexistent token");
        return _policyInfo[_policyID].coverAmount;
    }

    function getPolicyPrice(uint256 _policyID) external view override returns (uint256){
        require(ownerOf(_policyID) != address(0), "query for nonexistent token");
        return _policyInfo[_policyID].price;
    }

    function listPolicies(address _policyholder) external view override returns (uint256[] memory tokenIDs) {
        uint256 tokenCount = balanceOf(_policyholder);
        tokenIDs = new uint256[](tokenCount);
        for (uint256 index=0; index < tokenCount; index++) {
            tokenIDs[index] = tokenOfOwnerByIndex(_policyholder, index);
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
        external override returns (uint256 tokenID)
    {
        require(productIsActive[msg.sender], "product !active");
        PolicyInfo memory info = PolicyInfo({
            policyholder: _policyholder,
            product: msg.sender,
            positionContract: _positionContract,
            expirationBlock: _expirationBlock,
            coverAmount: _coverAmount,
            price: _price
        });
        tokenID = totalPolicyCount++;
        _policyInfo[tokenID] = info;
        _mint(_policyholder, tokenID);
        emit PolicyCreated(tokenID);
        return tokenID;
    }

    /**
     * @notice Exposes setTokenURI function for products to modify policies
     * The caller must be a product.
     * @param _policyId aka tokenID
     * @param _policyholder receiver of new policy token
     * @param _positionContract contract address where the position is covered
     * @param _expirationBlock policy expiration block number
     * @param _coverAmount policy coverage amount (in wei)
     * @param _price coverage price
     */
    function setPolicyInfo(
        uint256 _policyId,
        address _policyholder,
        address _positionContract,
        uint256 _expirationBlock,
        uint256 _coverAmount,
        uint256 _price
        )
        external override
    {
        require(productIsActive[msg.sender], "product !active");
        PolicyInfo memory info = PolicyInfo({
            policyholder: _policyholder,
            product: msg.sender,
            positionContract: _positionContract,
            expirationBlock: _expirationBlock,
            coverAmount: _coverAmount,
            price: _price
        });
        _policyInfo[_policyId] = info;
    }

    /**
     * @notice Fuction for the product to burn expired or canceled policies
     * The caller must be a product.
     * @param _tokenId tokenID (aka policyID)
     */
    function burn(uint256 _tokenId) external override {
        require(productIsActive[msg.sender], "product !active");
        _burn(_tokenId);
        delete _policyInfo[_tokenId];
        emit PolicyBurned(_tokenId);
    }

    /**
     * @notice Encodes `tokenURI`
     * @param _params policy tokenURI parameteres passed as PolicyInfo struct
     * @return uri
     */
    function _encodeTokenURI(PolicyInfo memory _params) internal pure returns (string memory uri) {
        uri = string(abi.encode(_params));
        return uri;
    }

    /**
     * @notice Decodes `tokenURI`
     * @param _tokenURI policy tokenURI passed as a string
     * @return struct `params`
     */
    function _decodeTokenURI(string memory _tokenURI) internal pure returns (PolicyInfo memory) {
        PolicyInfo memory params = abi.decode(bytes(_tokenURI), (PolicyInfo));
        return params;
    }


    /*** ERC721 INHERITANCE FUNCTIONS
    Overrides that properly set functionality through parent contracts
    ****/

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return _encodeTokenURI(_policyInfo[tokenId]);
    }

}
