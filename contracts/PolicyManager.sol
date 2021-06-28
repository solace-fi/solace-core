// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
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
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Governor.
    address public override governance;

    /// @notice Governance to take over.
    address public override newGovernance;

    // Set of products.
    EnumerableSet.AddressSet private products;

    /// @notice total policy count
    uint256 public totalPolicyCount = 0;

    struct PolicyInfo {
        uint256 coverAmount;
        uint64 expirationBlock;
        uint24 price;
        address policyholder;
        address product;
        address positionContract;
    }

    // policy id => policy info
    mapping(uint256 => PolicyInfo) public policyInfo;

    /**
     * @notice Constructs the Policy Deployer ERC721 Token contract.
     */
    constructor(address _governance) ERC721("Solace Policy", "SPT") {
        governance = _governance;
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
        products.add(_product);
        emit ProductAdded(_product);
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current governor.
     * @param _product the product to remove
     */
    function removeProduct(address _product) external override {
        require(msg.sender == governance, "!governance");
        products.remove(_product);
        emit ProductRemoved(_product);
    }

    /**
     * @notice Checks is an address is an active product.
     * @param _product The product to check.
     * @return True if the product is active.
     */
    function productIsActive(address _product) external view override returns (bool) {
        return products.contains(_product);
    }

    /**
     * @notice Returns the number of products.
     * @return The number of products.
     */
    function numProducts() external override view returns (uint256) {
        return products.length();
    }

    /**
     * @notice Returns the product at the given index.
     * @param _productNum The index to query.
     * @return The address of the product.
     */
    function getProduct(uint256 _productNum) external override view returns (address) {
        return products.at(_productNum);
    }

    /*** POLICY VIEW FUNCTIONS
    View functions that give us data about policies
    ****/

    function getPolicyInfo(uint256 _policyID) external view override returns (address policyholder, address product, address positionContract, uint256 coverAmount, uint64 expirationBlock, uint24 price){
        require(_exists(_policyID), "query for nonexistent token");
        PolicyInfo memory info = policyInfo[_policyID];
        return (info.policyholder, info.product, info.positionContract, info.coverAmount, info.expirationBlock, info.price);
    }

    function getPolicyholder(uint256 _policyID) external view override returns (address){
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].policyholder;
    }

    function getPolicyProduct(uint256 _policyID) external view override returns (address){
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].product;
    }

    function getPolicyPositionContract(uint256 _policyID) external view override returns (address){
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].positionContract;
    }

    function getPolicyExpirationBlock(uint256 _policyID) external view override returns (uint64) {
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].expirationBlock;
    }

    function getPolicyIsActive(uint256 _policyID) external view returns (bool) {
        //require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].expirationBlock >= block.number;
    }

    function getPolicyCoverAmount(uint256 _policyID) external view override returns (uint256) {
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].coverAmount;
    }

    function getPolicyPrice(uint256 _policyID) external view override returns (uint24){
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].price;
    }

    function listPolicies(address _policyholder) external view override returns (uint256[] memory tokenIDs) {
        uint256 tokenCount = balanceOf(_policyholder);
        tokenIDs = new uint256[](tokenCount);
        for (uint256 index=0; index < tokenCount; index++) {
            tokenIDs[index] = tokenOfOwnerByIndex(_policyholder, index);
        }
        return tokenIDs;
    }

    function policyIsActive(uint256 _policyID) external view override returns (bool) {
        return policyInfo[_policyID].expirationBlock >= block.number;
    }

    // returns false if never existed either
    function policyHasEnded(uint256 _policyID) external view override returns (bool) {
        uint64 expBlock = policyInfo[_policyID].expirationBlock;
        return expBlock > 0 && expBlock < block.number;
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
     * @return policyID (aka tokenID)
     */
    function createPolicy(
        address _policyholder,
        address _positionContract,
        uint256 _coverAmount,
        uint64 _expirationBlock,
        uint24 _price
    ) external override returns (uint256 policyID) {
        require(products.contains(msg.sender), "product !active");
        PolicyInfo memory info = PolicyInfo({
            policyholder: _policyholder,
            product: msg.sender,
            positionContract: _positionContract,
            expirationBlock: _expirationBlock,
            coverAmount: _coverAmount,
            price: _price
        });
        policyID = ++totalPolicyCount; // starts at 1
        policyInfo[policyID] = info;
        //policyHashIdMap[_policyHash] = policyID;
        //policySearchMap[msg.sender][_policyholder][_positionContract] = tokenID;
        _mint(_policyholder, policyID);
        emit PolicyCreated(policyID);
        return policyID;
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
        address _policyholder,     // TODO: should this be changeable?
        address _positionContract, // and this
        uint256 _coverAmount,
        uint64 _expirationBlock,
        uint24 _price
        )
        external override
    {
        require(_exists(_policyId), "query for nonexistent token");
        require(policyInfo[_policyId].product == msg.sender, "wrong product");
        PolicyInfo memory info = PolicyInfo({
            policyholder: _policyholder,
            product: msg.sender,
            positionContract: _positionContract,
            expirationBlock: _expirationBlock,
            coverAmount: _coverAmount,
            price: _price
        });
        policyInfo[_policyId] = info;
        //policySearchMap[msg.sender][_policyholder][_positionContract] = tokenID;
    }

    /**
     * @notice Fuction for the product to burn expired or canceled policies
     * The caller must be a product.
     * @param _policyId policyID aka tokenID
     */
    function burn(uint256 _policyId) external override {
        //require(products.contains(msg.sender), "product !active");
        //require(policyInfo[_policyId].product == msg.sender || policyInfo[_policyId].policyholder == msg.sender, "not owner and not authorized");
        _burn(_policyId);
        address policyholder = policyInfo[_policyId].policyholder;
        address positionContract = policyInfo[_policyId].positionContract;
        delete policyInfo[_policyId];
        //delete policySearchMap[msg.sender][policyholder][positionContract];
        //delete policyHashIdMap ?
        emit PolicyBurned(_policyId);
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
        return _encodeTokenURI(policyInfo[tokenId]);
    }

}
