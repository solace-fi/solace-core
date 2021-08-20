// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./Governable.sol";
import "./interface/IProduct.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IPolicyDescriptor.sol";


/**
 * @title PolicyManager
 * @author solace.fi
 * @notice The **PolicyManager** manages the creation of new policies and modification of existing policies.
 *
 * Most users will not interact with **PolicyManager** directly. To buy, modify, or cancel policies, users should use the respective [**product**](./products/BaseProduct) for the position they would like to cover. Use **PolicyManager** to view policies.
 *
 * Policies are [**ERC721s**](https://docs.openzeppelin.com/contracts/4.x/api/token/erc721#ERC721).
 */
contract PolicyManager is ERC721Enumerable, IPolicyManager, Governable {
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice The address of the policy descriptor contract, which handles generating token URIs for policies.
    address public override policyDescriptor;

    /// @notice Set of products.
    EnumerableSet.AddressSet private products;

    /// @notice The current amount covered (in wei)
    uint256 public override activeCoverAmount;

    /// @notice Total policy count.
    uint256 public totalPolicyCount = 0;

    /// @notice Policy info (policy ID => policy info).
    mapping(uint256 => PolicyInfo) internal _policyInfo;

    /**
     * @notice The constructor. It constructs the Policy Deployer **ERC721 Token** contract.
     * @param governance_ The address of the [governor](/docs/user-docs/Governance).
     */
    constructor(address governance_) ERC721("Solace Policy", "SPT") Governable(governance_) { }

    /**
     * @notice Adds a new product. The new product must be implemented in **Solace Protocol**.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param product the new product
     */
    function addProduct(address product) external override onlyGovernance {
        products.add(product);
        emit ProductAdded(product);
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param product the product to remove
     */
    function removeProduct(address product) external override onlyGovernance {
        products.remove(product);
        emit ProductRemoved(product);
    }

    /**
     * @notice Set the token descriptor.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param policyDescriptor_ The new token descriptor address.
     */
    function setPolicyDescriptor(address policyDescriptor_) external override onlyGovernance {
        policyDescriptor = policyDescriptor_;
    }

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

    /*** POLICY VIEW FUNCTIONS
    View functions that give us data about policies
    ****/

    /**
     * @notice Information about a policy.
     * @param policyID The policy ID to return info.
     * @return info info in a struct.
     */
    function policyInfo(uint256 policyID) external view override returns (PolicyInfo memory info) {
        require(_exists(policyID), "query for nonexistent token");
        info = _policyInfo[policyID];
        return info;
    }

    /**
     * @notice Information about a policy.
     * @param policyID The policy ID to return info.
     * @return policyholder The address of the policy holder.
     * @return product The product of the policy.
     * @return positionContract The covered contract for the policy.
     * @return coverAmount The amount covered for the policy.
     * @return expirationBlock The expiration block of the policy.
     * @return price The price of the policy.
     */
    function getPolicyInfo(uint256 policyID) external view override returns (address policyholder, address product, address positionContract, uint256 coverAmount, uint40 expirationBlock, uint24 price) {
        require(_exists(policyID), "query for nonexistent token");
        PolicyInfo memory info = _policyInfo[policyID];
        return (info.policyholder, info.product, info.positionContract, info.coverAmount, info.expirationBlock, info.price);
    }

    /**
     * @notice The holder of the policy.
     * @param policyID The policy ID.
     * @return policyholder The address of the policy holder.
     */
    function getPolicyholder(uint256 policyID) external view override returns (address policyholder) {
        require(_exists(policyID), "query for nonexistent token");
        return _policyInfo[policyID].policyholder;
    }

    /**
     * @notice The product used to purchase the policy.
     * @param policyID The policy ID.
     * @return product The product of the policy.
     */
    function getPolicyProduct(uint256 policyID) external view override returns (address product) {
        require(_exists(policyID), "query for nonexistent token");
        return _policyInfo[policyID].product;
    }

    /**
     * @notice The position contract the policy covers.
     * @param policyID The policy ID.
     * @return positionContract The position contract of the policy.
     */
    function getPolicyPositionContract(uint256 policyID) external view override returns (address positionContract) {
        require(_exists(policyID), "query for nonexistent token");
        return _policyInfo[policyID].positionContract;
    }

    /**
     * @notice The expiration block of the policy.
     * @param policyID The policy ID.
     * @return expirationBlock The expiration block of the policy.
     */
    function getPolicyExpirationBlock(uint256 policyID) external view override returns (uint40 expirationBlock) {
        require(_exists(policyID), "query for nonexistent token");
        return _policyInfo[policyID].expirationBlock;
    }

    /**
     * @notice The cover amount of the policy.
     * @param policyID The policy ID.
     * @return coverAmount The cover amount of the policy.
     */
    function getPolicyCoverAmount(uint256 policyID) external view override returns (uint256 coverAmount) {
        require(_exists(policyID), "query for nonexistent token");
        return _policyInfo[policyID].coverAmount;
    }

    /**
     * @notice The cover price in wei per block per wei multiplied by 1e12.
     * @param policyID The policy ID.
     * @return price The price of the policy.
     */
    function getPolicyPrice(uint256 policyID) external view override returns (uint24 price) {
        require(_exists(policyID), "query for nonexistent token");
        return _policyInfo[policyID].price;
    }

    /**
     * @notice Lists all policies for a given policy holder.
     * @param policyholder The address of the policy holder.
     * @return policyIDs The list of policy IDs that the policy holder has in any order.
     */
    function listPolicies(address policyholder) external view override returns (uint256[] memory policyIDs) {
        uint256 tokenCount = balanceOf(policyholder);
        policyIDs = new uint256[](tokenCount);
        for (uint256 index=0; index < tokenCount; index++) {
            policyIDs[index] = tokenOfOwnerByIndex(policyholder, index);
        }
        return policyIDs;
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
     * @param policyID The policy ID.
     * @return bool Returns true if the policy exists.
     */
    function exists(uint256 policyID) external view override returns (bool) {
        return _exists(policyID);
    }

    /**
     * @notice The function checks whether a given policy is active.
     * @param policyID The policy ID.
     * @return bool Returns true if the policy is active.
     */
    function policyIsActive(uint256 policyID) external view override returns (bool) {
        return _policyInfo[policyID].expirationBlock >= block.number;
    }

    /**
     * @notice The function checks whether a given policy is expired.
     * @param policyID The policy ID.
     * @return bool Returns true if the policy is expired.
     */
    function policyHasExpired(uint256 policyID) public view override returns (bool) {
        uint40 expBlock = _policyInfo[policyID].expirationBlock;
        return expBlock > 0 && expBlock < block.number;
    }


    /*** POLICY MUTATIVE FUNCTIONS
    Functions that create, modify, and destroy policies
    ****/

    /**
     * @notice The function creates new **ERC721** policy. The function is called by product contracts.
     * The caller must be a **product**.
     * @param policyholder The receiver of new policy token.
     * @param positionContract The contract address where the position is covered.
     * @param expirationBlock The policy expiration block number.
     * @param coverAmount The policy coverage amount (in wei).
     * @param price The coverage price
     * @return policyID The policy ID(aka tokenID).
     */
    function createPolicy(
        address policyholder,
        address positionContract,
        uint256 coverAmount,
        uint40 expirationBlock,
        uint24 price
    ) external override returns (uint256 policyID) {
        require(products.contains(msg.sender), "product inactive");
        PolicyInfo memory info = PolicyInfo({
            policyholder: policyholder,
            product: msg.sender,
            positionContract: positionContract,
            expirationBlock: expirationBlock,
            coverAmount: coverAmount,
            price: price
        });
        policyID = ++totalPolicyCount; // starts at 1
        activeCoverAmount += coverAmount;
        _policyInfo[policyID] = info;
        _mint(policyholder, policyID);
        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Allows for products to modify policies.
     * The caller must be a **product**.
     * @param policyID The policy ID (aka tokenID).
     * @param policyholder The receiver of new policy token.
     * @param positionContract The contract address where the position is covered.
     * @param expirationBlock The policy expiration block number.
     * @param coverAmount The policy coverage amount (in wei).
     * @param price The coverage price.
     */
    function setPolicyInfo(
        uint256 policyID,
        address policyholder,     // TODO: should this be changeable?
        address positionContract, // and this
        uint256 coverAmount,
        uint40 expirationBlock,
        uint24 price
        )
        external override
    {
        require(_exists(policyID), "query for nonexistent token");
        require(_policyInfo[policyID].product == msg.sender, "wrong product");
        activeCoverAmount = activeCoverAmount - _policyInfo[policyID].coverAmount + coverAmount;
        PolicyInfo memory info = PolicyInfo({
            policyholder: policyholder,
            product: msg.sender,
            positionContract: positionContract,
            expirationBlock: expirationBlock,
            coverAmount: coverAmount,
            price: price
        });
        _policyInfo[policyID] = info;
    }

    /**
     * @notice The fuction burns expired or canceled policies. It is called by product contracts.
     * The caller must be a product.
     * @param policyID policyID aka tokenID
     */
    function burn(uint256 policyID) external override {
        require(_exists(policyID), "query for nonexistent token");
        require(_policyInfo[policyID].product == msg.sender, "wrong product");
        _burn(policyID);
    }

    /**
     * @notice Internal private function that is used in contract.
     * @param policyID The policy ID.
     */
    function _burn(uint256 policyID) internal override {
        super._burn(policyID);
        activeCoverAmount -= _policyInfo[policyID].coverAmount;
        delete _policyInfo[policyID];
        emit PolicyBurned(policyID);
    }

    /**
     * @notice Burns expired policies.
     * @param policyIDs The list of expired policies.
     */
    function updateActivePolicies(uint256[] calldata policyIDs) external override {
        uint256 activeCover = activeCoverAmount;
        for (uint256 i = 0; i < policyIDs.length; i++) {
            uint256 policyID = policyIDs[i];
            // dont burn active or nonexistent policies
            if (policyHasExpired(policyID)) {
                address product = _policyInfo[policyID].product;
                uint256 coverAmount = _policyInfo[policyID].coverAmount;
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
     * @param tokenID The token ID(aka policy ID).
     * @return description The human readable description of the policy.
     */
    function tokenURI(uint256 tokenID) public view override(ERC721) returns (string memory) {
        require(_exists(tokenID), "query for nonexistent token");
        return IPolicyDescriptor(policyDescriptor).tokenURI(this, tokenID);
    }

}
