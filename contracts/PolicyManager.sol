// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./Governable.sol";
import "./ERC721Enhanced.sol";
import "./interface/IProduct.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IPolicyDescriptor.sol";
import "./interface/ISoteriaCoverageProduct.sol";


/**
 * @title PolicyManager
 * @author solace.fi
 * @notice The **PolicyManager** manages the creation of new policies and modification of existing policies.
 *
 * Most users will not interact with **PolicyManager** directly. To buy, modify, or cancel policies, users should use the respective [**product**](./products/CoverageProduct) for the position they would like to cover. Use **PolicyManager** to view policies.
 *
 * Policies are [**ERC721s**](https://docs.openzeppelin.com/contracts/4.x/api/token/erc721#ERC721).
 */
contract PolicyManager is ERC721Enhanced, IPolicyManager, Governable {
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice The address of the policy descriptor contract, which handles generating token URIs for policies.
    address internal _policyDescriptor;

    /// @notice solace.fi Soteria coverage product.
    ISoteriaCoverageProduct internal _soteriaCoverageProduct;

    /// @notice Set of products.
    EnumerableSet.AddressSet internal products;

    // The current amount covered (in wei).
    uint256 internal _activeCoverAmount;

    /// @notice Total policy count.
    uint256 internal _totalPolicyCount = 0;

    /// @notice Policy info (policy ID => policy info).
    mapping(uint256 => PolicyInfo) internal _policyInfo;

    /// @notice The current amount covered (in wei) per strategy;
    mapping(address => uint256) internal _activeCoverAmountPerStrategy;

    /**
     * @notice Constructs the `PolicyManager`.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     */
    constructor(address governance_) ERC721Enhanced("Solace Policy", "SPT") Governable(governance_) { }

    /***************************************
    POLICY VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Information about a policy.
     * @param policyID The policy ID to return info.
     * @return info info in a struct.
     */
    function policyInfo(uint256 policyID) external view override tokenMustExist(policyID) returns (PolicyInfo memory info) {
        info = _policyInfo[policyID];
        return info;
    }

    /**
     * @notice Information about a policy.
     * @param policyID The policy ID to return info.
     * @return policyholder The address of the policy holder.
     * @return product The product of the policy.
     * @return coverAmount The amount covered for the policy.
     * @return expirationBlock The expiration block of the policy.
     * @return price The price of the policy.
     * @return positionDescription The description of the covered position(s).
     * @return riskStrategy The risk strategy of the covered product.
     */
    function getPolicyInfo(uint256 policyID) external view override tokenMustExist(policyID) returns (address policyholder, address product, uint256 coverAmount, uint40 expirationBlock, uint24 price, bytes memory positionDescription, address riskStrategy) {
        PolicyInfo memory info = _policyInfo[policyID];
        return (ownerOf(policyID), info.product, info.coverAmount, info.expirationBlock, info.price, info.positionDescription, info.riskStrategy);
    }

    /**
     * @notice The holder of the policy.
     * @param policyID The policy ID.
     * @return policyholder The address of the policy holder.
     */
    function getPolicyholder(uint256 policyID) external view override tokenMustExist(policyID) returns (address policyholder) {
        return ownerOf(policyID);
    }

    /**
     * @notice The product used to purchase the policy.
     * @param policyID The policy ID.
     * @return product The product of the policy.
     */
    function getPolicyProduct(uint256 policyID) external view override tokenMustExist(policyID) returns (address product) {
        return _policyInfo[policyID].product;
    }

    /**
     * @notice The expiration block of the policy.
     * @param policyID The policy ID.
     * @return expirationBlock The expiration block of the policy.
     */
    function getPolicyExpirationBlock(uint256 policyID) external view override tokenMustExist(policyID) returns (uint40 expirationBlock) {
        return _policyInfo[policyID].expirationBlock;
    }

    /**
     * @notice The cover amount of the policy.
     * @param policyID The policy ID.
     * @return coverAmount The cover amount of the policy.
     */
    function getPolicyCoverAmount(uint256 policyID) external view override tokenMustExist(policyID) returns (uint256 coverAmount) {
        return _policyInfo[policyID].coverAmount;
    }

    /**
     * @notice The cover price in wei per block per wei multiplied by 1e12.
     * @param policyID The policy ID.
     * @return price The price of the policy.
     */
    function getPolicyPrice(uint256 policyID) external view override tokenMustExist(policyID) returns (uint24 price) {
        return _policyInfo[policyID].price;
    }

    /**
     * @notice The byte encoded description of the covered position(s).
     * Only makes sense in context of the product.
     * @param policyID The policy ID.
     * @return positionDescription The description of the covered position(s).
     */
    function getPositionDescription(uint256 policyID) external view override tokenMustExist(policyID) returns (bytes memory positionDescription) {
        positionDescription = _policyInfo[policyID].positionDescription;
        return positionDescription;
    }

    /**
     * @notice Returns the risk strategy of the product in policy.
     * @param policyID The policy ID.
     * @return strategy The risk strategy address.
    */
    function getPolicyRiskStrategy(uint256 policyID) external view override tokenMustExist(policyID) returns (address strategy) {
        return _policyInfo[policyID].riskStrategy;
    }


    /*
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
    */

    /**
     * @notice Checks if a policy is active.
     * @param policyID The policy ID.
     * @return status True if the policy is active.
     */
    function policyIsActive(uint256 policyID) external view override returns (bool status) {
        return _policyInfo[policyID].expirationBlock >= block.number;
    }

    /**
     * @notice Checks whether a given policy is expired.
     * @param policyID The policy ID.
     * @return status True if the policy is expired.
     */
    function policyHasExpired(uint256 policyID) public view override returns (bool status) {
        uint40 expBlock = _policyInfo[policyID].expirationBlock;
        return expBlock > 0 && expBlock < block.number;
    }

    /// @notice The total number of policies ever created.
    function totalPolicyCount() external view override returns (uint256 count) {
        return _totalPolicyCount;
    }

    /// @notice The address of the [`PolicyDescriptor`](./PolicyDescriptor) contract.
    function policyDescriptor() external view override returns (address descriptor) {
        return _policyDescriptor;
    }

    /**
     * @notice Describes the policy.
     * @param policyID The policy ID.
     * @return description The human readable description of the policy.
     */
    function tokenURI(uint256 policyID) public view override(ERC721) tokenMustExist(policyID) returns (string memory description) {
        return IPolicyDescriptor(_policyDescriptor).tokenURI(this, policyID);
    }

    /***************************************
    POLICY MUTATIVE FUNCTIONS
    ***************************************/

    /**
     * @notice Creates a new policy.
     * Can only be called by **products**.
     * @param policyholder The receiver of new policy token.
     * @param coverAmount The policy coverage amount (in wei).
     * @param expirationBlock The policy expiration block number.
     * @param price The coverage price.
     * @param positionDescription The byte encoded description of the covered position(s).
     * @param riskStrategy The risk strategy of the covered product.
     * @return policyID The policy ID.
     */
    function createPolicy(
        address policyholder,
        uint256 coverAmount,
        uint40 expirationBlock,
        uint24 price,
        bytes calldata positionDescription,
        address riskStrategy
    ) external override returns (uint256 policyID) {
        require(products.contains(msg.sender), "product inactive");
        PolicyInfo memory info = PolicyInfo({
            product: msg.sender,
            positionDescription: positionDescription,
            expirationBlock: expirationBlock,
            coverAmount: coverAmount,
            price: price,
            riskStrategy: riskStrategy
        });
        policyID = ++_totalPolicyCount; // starts at 1
        _activeCoverAmount += coverAmount;
        _activeCoverAmountPerStrategy[riskStrategy] += coverAmount;
        _policyInfo[policyID] = info;
        _mint(policyholder, policyID);
        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Modifies a policy.
     * Can only be called by **products**.
     * @param policyID The policy ID.
     * @param coverAmount The policy coverage amount (in wei).
     * @param expirationBlock The policy expiration block number.
     * @param price The coverage price.
     * @param positionDescription The byte encoded description of the covered position(s).
     * @param riskStrategy The risk strategy of the covered positions(s).
     */
    function setPolicyInfo(
        uint256 policyID,
        uint256 coverAmount,
        uint40 expirationBlock,
        uint24 price,
        bytes calldata positionDescription,
        address riskStrategy
        )
        external override tokenMustExist(policyID)
    {
        require(_policyInfo[policyID].product == msg.sender, "wrong product");
        _activeCoverAmount = _activeCoverAmount - _policyInfo[policyID].coverAmount + coverAmount;
        _activeCoverAmountPerStrategy[riskStrategy] = _activeCoverAmountPerStrategy[riskStrategy] - _policyInfo[policyID].coverAmount + coverAmount;
        PolicyInfo memory info = PolicyInfo({
            product: msg.sender,
            positionDescription: positionDescription,
            expirationBlock: expirationBlock,
            coverAmount: coverAmount,
            price: price,
            riskStrategy: riskStrategy
        });
        _policyInfo[policyID] = info;
        emit PolicyUpdated(policyID);
    }

    /**
     * @notice Modifies a policy without position description value.
     * Can only be called by **products**.
     * @param policyID The policy ID.
     * @param coverAmount The policy coverage amount (in wei).
     * @param expirationBlock The policy expiration block number.
     * @param price The coverage price.
     * @param riskStrategy The risk strategy of the covered positions(s).
     */
     function updatePolicyInfo(
        uint256 policyID,
        uint256 coverAmount,
        uint40 expirationBlock,
        uint24 price,
        address riskStrategy
        )
        external override tokenMustExist(policyID)
    {
        require(_policyInfo[policyID].product == msg.sender, "wrong product");
        _activeCoverAmount = _activeCoverAmount - _policyInfo[policyID].coverAmount + coverAmount;
        _activeCoverAmountPerStrategy[riskStrategy] = _activeCoverAmountPerStrategy[riskStrategy] - _policyInfo[policyID].coverAmount + coverAmount;
        PolicyInfo memory info = PolicyInfo({
            product: msg.sender,
            positionDescription: _policyInfo[policyID].positionDescription,
            expirationBlock: expirationBlock,
            coverAmount: coverAmount,
            price: price,
            riskStrategy: riskStrategy
        });
        _policyInfo[policyID] = info;
        emit PolicyUpdated(policyID);
    }

    /**
     * @notice Burns expired or cancelled policies.
     * Can only be called by **products**.
     * @param policyID The ID of the policy to burn.
     */
    function burn(uint256 policyID) external override tokenMustExist(policyID) {
        require(_policyInfo[policyID].product == msg.sender, "wrong product");
        _burn(policyID);
    }

    /**
     * @notice Burns policies.
     * @param policyID The policy ID.
     */
    function _burn(uint256 policyID) internal override {
        super._burn(policyID);
        _activeCoverAmount -= _policyInfo[policyID].coverAmount;
        _activeCoverAmountPerStrategy[_policyInfo[policyID].riskStrategy] -=  _policyInfo[policyID].coverAmount;
        delete _policyInfo[policyID];
        emit PolicyBurned(policyID);
    }

    /**
     * @notice Burns expired policies.
     * @param policyIDs The list of expired policies.
     */
    function updateActivePolicies(uint256[] calldata policyIDs) external override {
        uint256 activeCover = _activeCoverAmount;

        for(uint256 i = 0; i < policyIDs.length; i++) {
            uint256 policyID = policyIDs[i];
            // dont burn active or nonexistent policies
            if (policyHasExpired(policyID)) {
                address product = _policyInfo[policyID].product;
                uint256 coverAmount = _policyInfo[policyID].coverAmount;
                activeCover -= coverAmount;
                _activeCoverAmountPerStrategy[_policyInfo[policyID].riskStrategy] -= coverAmount;
                IProduct(product).updateActiveCoverAmount(-SafeCast.toInt256(coverAmount));
                super._burn(policyID);
            }
        }
        _activeCoverAmount = activeCover;
    }

    /**
     * @notice Updates the active cover amount of the Soteria product.
     * This function is only called by `SoteriaCoverageProduct` when a new policy is bought or updated.
     * @param newCoverAmount The new cover amount.
    */
    function setSoteriaActiveCoverAmount(uint256 newCoverAmount) external override {
        require(address(_soteriaCoverageProduct) != address(0x0), "no soteria product");
        require(msg.sender == address(_soteriaCoverageProduct), "only soteria product");
        uint256 coverAmount = _activeCoverAmount;
        coverAmount = coverAmount + newCoverAmount - _activeCoverAmountPerStrategy[msg.sender];
        _activeCoverAmountPerStrategy[msg.sender] = newCoverAmount;
        _activeCoverAmount = coverAmount;
        emit SoteriaProductCoverAmountUpdated(newCoverAmount);
    }

    /***************************************
    PRODUCT VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Checks is an address is an active product.
     * @param product The product to check.
     * @return status Returns true if the product is active.
     */
    function productIsActive(address product) external view override returns (bool status) {
        return products.contains(product);
    }

    /**
     * @notice Returns the number of products.
     * @return count The number of products.
     */
    function numProducts() external override view returns (uint256 count) {
        return products.length();
    }

    /**
     * @notice Returns the product at the given index.
     * @param productNum The index to query.
     * @return product The address of the product.
     */
    function getProduct(uint256 productNum) external override view returns (address product) {
        return products.at(productNum);
    }

    /**
     * @notice Returns `SoteriaCoverageProduct`.
     * @return soteria The address of soteria product.
    */
    function getSoteriaProduct() external override view returns (address soteria) {
        return address(_soteriaCoverageProduct);
    }

    /***************************************
    OTHER VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the current amount covered (in wei).
     * @return amount The covered amount (in wei).
    */
    function activeCoverAmount() external view override returns (uint256 amount) {
        return _activeCoverAmount;
    }

    /**
     * @notice Returns the current amount covered (in wei).
     * @param riskStrategy The risk strategy address.
     * @return amount The covered amount (in wei).
    */
    function activeCoverAmountPerStrategy(address riskStrategy) external view override returns (uint256 amount) {
        return _activeCoverAmountPerStrategy[riskStrategy];
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a new product.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param product the new product
     */
    function addProduct(address product) external override onlyGovernance {
        require(product != address(0x0), "zero product");
        products.add(product);
        emit ProductAdded(product);
    }

    /**
     * @notice Sets soteria product.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param soteria The `SoteriaCoverageProduct`.
     */
     function setSoteriaProduct(address soteria) external override onlyGovernance {
        require(soteria != address(0x0), "zero address soteria");
        _soteriaCoverageProduct = ISoteriaCoverageProduct(soteria);
        emit SoteriaProductSet(soteria);
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param product the product to remove
     */
    function removeProduct(address product) external override onlyGovernance {
        products.remove(product);
        emit ProductRemoved(product);
    }

    /**
     * @notice Set the token descriptor.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param policyDescriptor_ The new token descriptor address.
     */
    function setPolicyDescriptor(address policyDescriptor_) external override onlyGovernance {
        _policyDescriptor = policyDescriptor_;
        emit PolicyDescriptorSet(policyDescriptor_);
    }
}
