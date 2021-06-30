// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interface/IProduct.sol";
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
        address policyholder;
        uint64 expirationBlock;
        address product;
        uint24 price;
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

    function exists(uint256 _policyID) external view override returns (bool) {
        return _exists(_policyID);
    }

    function policyIsActive(uint256 _policyID) external view override returns (bool) {
        return policyInfo[_policyID].expirationBlock >= block.number;
    }

    // also returns false if policy never existed or has been burnt
    function policyHasEnded(uint256 _policyID) public view override returns (bool) {
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
        require(products.contains(msg.sender), "product inactive");
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
        _mint(_policyholder, policyID);
        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Exposes setTokenURI function for products to modify policies
     * The caller must be a product.
     * @param _policyID aka tokenID
     * @param _policyholder receiver of new policy token
     * @param _positionContract contract address where the position is covered
     * @param _expirationBlock policy expiration block number
     * @param _coverAmount policy coverage amount (in wei)
     * @param _price coverage price
     */
    function setPolicyInfo(
        uint256 _policyID,
        address _policyholder,     // TODO: should this be changeable?
        address _positionContract, // and this
        uint256 _coverAmount,
        uint64 _expirationBlock,
        uint24 _price
        )
        external override
    {
        require(_exists(_policyID), "query for nonexistent token");
        require(policyInfo[_policyID].product == msg.sender, "wrong product");
        PolicyInfo memory info = PolicyInfo({
            policyholder: _policyholder,
            product: msg.sender,
            positionContract: _positionContract,
            expirationBlock: _expirationBlock,
            coverAmount: _coverAmount,
            price: _price
        });
        policyInfo[_policyID] = info;
    }

    /**
     * @notice Fuction for the product to burn expired or canceled policies
     * The caller must be a product.
     * @param _policyID policyID aka tokenID
     */
    function burn(uint256 _policyID) external override {
        require(_exists(_policyID), "query for nonexistent token");
        require(policyInfo[_policyID].product == msg.sender, "wrong product");
        _burn(_policyID);
    }

    function _burn(uint256 _policyID) internal override {
        super._burn(_policyID);
        delete policyInfo[_policyID];
        emit PolicyBurned(_policyID);
    }

    function updateActivePolicies(uint256[] calldata _policyIDs) external override {
        for (uint256 i = 0; i < _policyIDs.length; i++) {
            uint256 policyID = _policyIDs[i];
            if (policyHasEnded(policyID)) {
                address product = policyInfo[policyID].product;
                uint256 coverAmount = policyInfo[policyID].coverAmount;
                IProduct(product).updateActivePolicies(-int256(coverAmount));
                _burn(policyID);
            }
        }
        // todo: an implementation like this would reduce SSTOREs if updating multiple policies of the same product
        // solidity doesn't allow memory mappings though
        /*
        //mapping(address => int256) memory productCoverageDiffs;
        uint256[] memory productCoverageDiffs = new uint256[products.length()];
        //EnumerableSet.AddressSet memory changedProducts;
        //EnumerableMap.AddressToUintMap memory productCoverageDiffs;
        // loop through policies
        for (uint256 i = 0; i < _policyIDs.length; i++) {
            uint256 policyID = _policyIDs[i];
            if (policyHasEnded(policyID)) {
                address product = policyInfo[policyID];
                //changedProducts.add(product);
                //productCoverageDiffs[product] -= policyInfo[policyID].coverAmount;
                productCoverageDiffs.set(product, productCoverageDiffs.get(product) + policyInfo[policyID].coverAmount);
                _burn(policyID);
                delete policyInfo[policyID];
            }
        }
        // loop through products
        //for(uint256 i = 0; i < changedProducts.length(); i++) {
        for(uint256 i = 0; i < productCoverageDiffs.length(); i++) {
            (address product, uint256 diff) = productCoverageDiffs.at(i);
            IProduct(product).updateActivePolicies(int256(-diff));
        }
        */
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
