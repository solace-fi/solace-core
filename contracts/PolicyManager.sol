// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interface/IProduct.sol";
import "./interface/IPolicyManager.sol";
import "./interface/INonfungibleTokenPolicyDescriptor.sol";


/**
 * @title PolicyManager
 * @author solace.fi
 * @notice The **Policy Manager** manages the creating new policies or modifying the existing policies. The policy is an [**ERC721**](https://docs.openzeppelin.com/contracts/2.x/erc721) token.
 */
contract PolicyManager is ERC721Enumerable, IPolicyManager {
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Governor.
    address public override governance;

    /// @notice Governance to take over.
    address public override newGovernance;

     /// @notice The address of the token descriptor contract, which handles generating token URIs for position tokens
    address public tokenDescriptor;

    /// @notice Set of products.
    EnumerableSet.AddressSet private products;

    /// @notice The current amount covered (in wei)
    uint256 public override activeCoverAmount; 

    /// @notice Total policy count.
    uint256 public totalPolicyCount = 0;

    /// @notice PolicyInfo struct.
    struct PolicyInfo {
        uint256 coverAmount;
        address policyholder;
        uint40 expirationBlock;
        address product;
        uint24 price;
        address positionContract;
    }

    /// @notice Policy info (policy id => policy info).
    mapping(uint256 => PolicyInfo) public policyInfo;

    /**
     * @notice The constructor. It constructs the Policy Deployer **ERC721 Token** contract.
     * @param _governance The address of the governor.
     */
    constructor(address _governance) ERC721("Solace Policy", "SPT") {
        governance = _governance;
    }

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current `governor`.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new `governor`.
     */
    function acceptGovernance() external override {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Adds a new product. The new product must be implemented in **Solace Protocol**.
     * Can only be called by the current `governor`.
     * @param _product the new product
     */
    function addProduct(address _product) external override {
        require(msg.sender == governance, "!governance");
        products.add(_product);
        emit ProductAdded(_product);
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current `governor`.
     * @param _product the product to remove
     */
    function removeProduct(address _product) external override {
        require(msg.sender == governance, "!governance");
        products.remove(_product);
        emit ProductRemoved(_product);
    }

    /**
     * @notice Allows governance to set policy descriptor.
     * Can only be called by the current `governor`.
     * @param _tokenDescriptor The new policy token descriptor address.
     */
    function setTokenDescriptor(address _tokenDescriptor) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        tokenDescriptor = _tokenDescriptor;
    }

    /**
     * @notice Checks is an address is an active product.
     * @param _product The product to check.
     * @return bool Returns true if the product is active.
     */
    function productIsActive(address _product) external view override returns (bool) {
        return products.contains(_product);
    }

    /**
     * @notice Returns the number of products.
     * @return value The number of products.
     */
    function numProducts() external override view returns (uint256) {
        return products.length();
    }

    /**
     * @notice Returns the product at the given index.
     * @param _productNum The index to query.
     * @return productAddress The address of the product.
     */
    function getProduct(uint256 _productNum) external override view returns (address) {
        return products.at(_productNum);
    }

    /*** POLICY VIEW FUNCTIONS
    View functions that give us data about policies
    ****/
    
    /**
     * @notice The function returns the policy details.
     * @param _policyID The policy id to return info.
     * @return policyholder The address of the policy holder.
     * @return product The product of the policy. 
     * @return positionContract The covered contract for the policy.
     * @return coverAmount The amount covered for the policy.
     * @return expirationBlock The expiration block of the policy.
     * @return price The price of the policy.
     */
    function getPolicyInfo(uint256 _policyID) external view override returns (address policyholder, address product, address positionContract, uint256 coverAmount, uint40 expirationBlock, uint24 price){
        require(_exists(_policyID), "query for nonexistent token");
        PolicyInfo memory info = policyInfo[_policyID];
        return (info.policyholder, info.product, info.positionContract, info.coverAmount, info.expirationBlock, info.price);
    }

    /**
     * @notice The function returns the policy holder of the policy.
     * @param _policyID The policy id.
     * @return policyholder The address of the policy holder.
     */
    function getPolicyholder(uint256 _policyID) external view override returns (address){
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].policyholder;
    }

    /**
     * @notice The function returns the policy product of the policy.
     * @param _policyID The policy id.
     * @return product The product of the policy. 
     */
    function getPolicyProduct(uint256 _policyID) external view override returns (address){
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].product;
    }

    /**
     * @notice The function returns the position contract of the policy.
     * @param _policyID The policy id.
     * @return positionContract The position contract of the policy. 
     */
    function getPolicyPositionContract(uint256 _policyID) external view override returns (address){
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].positionContract;
    }

    /**
     * @notice The function returns the expiration block of the policy.
     * @param _policyID The policy id.
     * @return expirationBlock The expiration block of the policy. 
     */
    function getPolicyExpirationBlock(uint256 _policyID) external view override returns (uint40) {
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].expirationBlock;
    }

    /**
     * @notice The function returns the cover amount of the policy.
     * @param _policyID The policy id.
     * @return coverAmount The cover amount of the policy. 
     */
    function getPolicyCoverAmount(uint256 _policyID) external view override returns (uint256) {
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].coverAmount;
    }

    /**
     * @notice The function returns the price of the policy.
     * @param _policyID The policy id.
     * @return price The price of the policy. 
     */
    function getPolicyPrice(uint256 _policyID) external view override returns (uint24){
        require(_exists(_policyID), "query for nonexistent token");
        return policyInfo[_policyID].price;
    }

    /**
     * @notice The function lists all policies for a given policy holder.
     * @param _policyholder The address of the policy holder.
     * @return tokenIDs The list of token ids(policy ids) that the policy holder have.
     */
    function listPolicies(address _policyholder) external view override returns (uint256[] memory tokenIDs) {
        uint256 tokenCount = balanceOf(_policyholder);
        tokenIDs = new uint256[](tokenCount);
        for (uint256 index=0; index < tokenCount; index++) {
            tokenIDs[index] = tokenOfOwnerByIndex(_policyholder, index);
        }
        return tokenIDs;
    }

    /**
     * @notice These functions can be used to check a policys stage in the lifecycle.
     * There are three major lifecycle events:
     *   1 - policy is bought (aka minted)
     *   2 - policy expires
     *   3 - policy is burnt (aka deleted)
     * There are four stages:
     *   A - pre-mint
     *   B - pre-expiration
     *   C - post-expiration
     *   D - post-burn
     * Truth table:
     *               A B C D
     *   exists      0 1 1 0
     *   isActive    0 1 0 0
     *   hasExpired  0 0 1 0
     * @param _policyID The policy id.
     * @return bool Returns true if the policy exists.
     */
    function exists(uint256 _policyID) external view override returns (bool) {
        return _exists(_policyID);
    }

    /**
     * @notice The function checks whether a given policy is active.
     * @param _policyID The policy id.
     * @return bool Returns true if the policy is active.
     */
    function policyIsActive(uint256 _policyID) external view override returns (bool) {
        return policyInfo[_policyID].expirationBlock >= block.number;
    }

    /**
     * @notice The function checks whether a given policy is expired.
     * @param _policyID The policy id.
     * @return bool Returns true if the policy is expired.
     */
    function policyHasExpired(uint256 _policyID) public view override returns (bool) {
        uint40 expBlock = policyInfo[_policyID].expirationBlock;
        return expBlock > 0 && expBlock < block.number;
    }


    /*** POLICY MUTATIVE FUNCTIONS
    Functions that create, modify, and destroy policies
    ****/

    /**
     * @notice The function creates new **ERC721** policy. The function is called by product contracts.
     * The caller must be a **product**.
     * @param _policyholder The receiver of new policy token.
     * @param _positionContract The contract address where the position is covered.
     * @param _expirationBlock The policy expiration block number.
     * @param _coverAmount The policy coverage amount (in wei).
     * @param _price The coverage price
     * @return policyID The policy id(aka tokenID).
     */
    function createPolicy(
        address _policyholder,
        address _positionContract,
        uint256 _coverAmount,
        uint40 _expirationBlock,
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
        activeCoverAmount += _coverAmount;
        policyInfo[policyID] = info;
        _mint(_policyholder, policyID);
        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Exposes setTokenURI function for products to modify policies.
     * The caller must be a **product**.
     * @param _policyID The policy id (aka tokenID).
     * @param _policyholder The receiver of new policy token.
     * @param _positionContract The contract address where the position is covered.
     * @param _expirationBlock The policy expiration block number.
     * @param _coverAmount The policy coverage amount (in wei).
     * @param _price The coverage price.
     */
    function setPolicyInfo(
        uint256 _policyID,
        address _policyholder,     // TODO: should this be changeable?
        address _positionContract, // and this
        uint256 _coverAmount,
        uint40 _expirationBlock,
        uint24 _price
        )
        external override
    {
        require(_exists(_policyID), "query for nonexistent token");
        require(policyInfo[_policyID].product == msg.sender, "wrong product");
        activeCoverAmount = activeCoverAmount - policyInfo[_policyID].coverAmount + _coverAmount;
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
     * @notice The fuction burns expired or canceled policies. It is called by product contracts.
     * The caller must be a product.
     * @param _policyID policyID aka tokenID
     */
    function burn(uint256 _policyID) external override {
        require(_exists(_policyID), "query for nonexistent token");
        require(policyInfo[_policyID].product == msg.sender, "wrong product");
        _burn(_policyID);
    }

    /**
     * @notice Internal private function that is used in contract.
     * @param _policyID The policy id.
     */
    function _burn(uint256 _policyID) internal override {
        super._burn(_policyID);
        activeCoverAmount -= policyInfo[_policyID].coverAmount;
        delete policyInfo[_policyID];
        emit PolicyBurned(_policyID);
    }

    /**
     * @notice Burns expired policies.
     * @param _policyIDs The list of expired policies.
     */
    function updateActivePolicies(uint256[] calldata _policyIDs) external override {
        uint256 activeCover = activeCoverAmount;
        for (uint256 i = 0; i < _policyIDs.length; i++) {
            uint256 policyID = _policyIDs[i];
            // dont burn active or nonexistent policies
            if (policyHasExpired(policyID)) {
                address product = policyInfo[policyID].product;
                uint256 coverAmount = policyInfo[policyID].coverAmount;
                activeCover -= coverAmount;
                IProduct(product).updateActiveCoverAmount(-int256(coverAmount));
                _burn(policyID);
            }
        }
        activeCoverAmount = activeCover;
    }

    /*** ERC721 INHERITANCE FUNCTIONS
    Overrides that properly set functionality through parent contracts
    ****/

    /**
     * @notice The function returns a human readable descriptor for the policy.
     * @param tokenId The token id(aka policy id).
     * @return description The human readable description of the policy.
     */
    function tokenURI(uint256 tokenId) public view override(ERC721) returns (string memory) {
        require(_exists(tokenId), "query for nonexistent token");
        return INonfungibleTokenPolicyDescriptor(tokenDescriptor).tokenURI(this, tokenId);
    }

}
