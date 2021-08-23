// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./interface/IVault.sol";
import "./interface/IRegistry.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IRiskManager.sol";


/**
 * @title RiskManager
 * @author solace.fi
 * @notice Calculates the acceptable risk, sellable cover, and capital requirements of Solace products and capital pool.
 *
 * The total amount of sellable coverage is proportional to the assets in the [**risk backing capital pool**](./Vault). The max cover is split amongst products in a weighting system. [**Governance**](/docs/user-docs/Governance). can change these weights and with it each product's sellable cover.
 *
 * The minimum capital requirement is proportional to the amount of cover sold to [active policies](./PolicyManager).
 *
 * Solace can use leverage to sell more cover than the available capital. The amount of leverage is stored as [`partialReservesFactor`](#partialreservesfactor) and is settable by [**governance**](/docs/user-docs/Governance).
 */
contract RiskManager is IRiskManager, Governable {

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    // max cover variables
    address[] internal _products;
    mapping(address => uint32) internal _weights;
    uint32 internal _weightSum;

    // Multiplier for minimum capital requirement in BPS.
    uint16 internal _partialReservesFactor;

    // Registry
    IRegistry internal _registry;

    /**
     * @notice Constructs the RiskManager contract.
     * @param governance_ The address of the [governor](/docs/user-docs/Governance).
     * @param registry_ Address of registry.
     */
    constructor(address governance_, address registry_) Governable(governance_) {
        _registry = IRegistry(registry_);
        _weightSum = type(uint32).max; // no div by zero
        _partialReservesFactor = 10000;
    }

    /***************************************
    MAX COVER VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The maximum amount of cover that Solace as a whole can sell.
     * @return cover The max amount of cover in wei.
     */
    function maxCover() public view override returns (uint256 cover) {
        return IVault(payable(_registry.vault())).totalAssets() * 10000 / _partialReservesFactor;
    }

    /**
     * @notice The maximum amount of cover that a product can sell.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in wei.
     */
    function maxCoverAmount(address prod) external view override returns (uint256 cover) {
        return maxCover() * _weights[prod] / _weightSum;
    }

    /**
     * @notice Return the number of registered products.
     * @return count Number of products.
     */
    function numProducts() external view override returns (uint256 count) {
        return _products.length;
    }

    /**
     * @notice Return the product at an index.
     * @dev Enumerable `[0, numProducts-1]`.
     * @param index Index to query.
     * @return prod The product address.
     */
    function product(uint256 index) external view override returns (address prod) {
        return _products[index];
    }

    /**
     * @notice Returns the weight of a product.
     * @param prod Product to query.
     * @return mass The product's weight.
     */
    function weight(address prod) external view override returns (uint32 mass) {
        return _weights[prod];
    }

    /**
     * @notice Returns the sum of weights.
     * @return sum WeightSum.
     */
    function weightSum() external view override returns (uint32 sum) {
        return _weightSum;
    }

    /***************************************
    MIN CAPITAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The minimum amount of capital required to safely cover all policies.
     * @return mcr The minimum capital requirement.
     */
    function minCapitalRequirement() external view override returns (uint256 mcr) {
        return IPolicyManager(_registry.policyManager()).activeCoverAmount() * _partialReservesFactor / 10000;
    }

    /**
     * @notice Multiplier for minimum capital requirement.
     * @return factor Partial reserves factor in BPS.
     */
    function partialReservesFactor() external view override returns (uint16 factor) {
        return _partialReservesFactor;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a new product and sets its weight.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param product_ Address of new product.
     * @param weight_ The products weight.
     */
    function addProduct(address product_, uint32 weight_) external override onlyGovernance {
        // or changes an existing product's weight
        // don't keep endlessly changing weights like this, use setProductWeights instead

        if(_products.length == 0) {
            // add the first product
            require(weight_ > 0, "1/0");
            _weights[product_] = weight_;
            _products.push(product_);
            _weightSum = weight_;
        } else {
            // add another product
            uint32 prevWeight = _weights[product_];
            _weights[product_] = weight_;
            _products.push(product_);
            uint32 weightSum_ = _weightSum - prevWeight + weight_;
            require(weightSum_ > 0, "1/0");
            _weightSum = weightSum_;
        }
    }

    /**
     * @notice Sets the products and their weights.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param products_ The products.
     * @param weights_ The product weights.
     */
    function setProductWeights(address[] calldata products_, uint32[] calldata weights_) external override onlyGovernance {
        // check recipient - weight map
        require(products_.length == weights_.length, "length mismatch");
        // delete old products
        while(_products.length > 0) {
            address prod = _products[_products.length-1];
            delete _weights[prod];
            _products.pop();
        }
        // add new products
        uint32 weightSum_ = 0;
        uint256 length = products_.length;
        for(uint256 i = 0; i < length; i++) {
            require(_weights[products_[i]] == 0, "duplicate product");
            _weights[products_[i]] = weights_[i];
            weightSum_ += weights_[i];
        }
        require(weightSum_ > 0, "1/0");
        _weightSum = weightSum_;
        _products = products_;
    }

    /**
     * @notice Sets the partial reserves factor.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param partialReservesFactor_ New partial reserves factor in BPS.
     */
    function setPartialReservesFactor(uint16 partialReservesFactor_) external override onlyGovernance {
        _partialReservesFactor = partialReservesFactor_;
    }
}
