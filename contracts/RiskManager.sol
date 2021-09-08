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
 * The total amount of sellable coverage is proportional to the assets in the [**risk backing capital pool**](./Vault). The max cover is split amongst products in a weighting system. [**Governance**](/docs/protocol/governance). can change these weights and with it each product's sellable cover.
 *
 * The minimum capital requirement is proportional to the amount of cover sold to [active policies](./PolicyManager).
 *
 * Solace can use leverage to sell more cover than the available capital. The amount of leverage is stored as [`partialReservesFactor`](#partialreservesfactor) and is settable by [**governance**](/docs/protocol/governance).
 */
contract RiskManager is IRiskManager, Governable {

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    // enumerable map product address to uint32 weight
    mapping(address => uint256) internal _productToIndex;
    mapping(uint256 => address) internal _indexToProduct;
    uint256 internal _productCount;
    mapping(address => uint32) internal _weights;
    uint32 internal _weightSum;

    // Multiplier for minimum capital requirement in BPS.
    uint16 internal _partialReservesFactor;

    // Registry
    IRegistry internal _registry;

    /**
     * @notice Constructs the RiskManager contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
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
        return _productCount;
    }

    /**
     * @notice Return the product at an index.
     * @dev Enumerable `[1, numProducts]`.
     * @param index Index to query.
     * @return prod The product address.
     */
    function product(uint256 index) external view override returns (address prod) {
        return _indexToProduct[index];
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
     * Or sets the weight of an existing product.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param product_ Address of new product.
     * @param weight_ The products weight.
     */
    function addProduct(address product_, uint32 weight_) external override onlyGovernance {
        require(weight_ > 0, "no weight");
        uint256 index = _productToIndex[product_];
        if(index == 0) {
            // add new product
            uint32 weightSum_ = (_productCount == 0)
              ? weight_ // first product
              : (_weightSum + weight_);
            _weightSum = weightSum_;
            _weights[product_] = weight_;
            index = ++_productCount;
            _productToIndex[product_] = index;
            _indexToProduct[index] = product_;
        } else {
            // change weight of existing product
            uint32 prevWeight = _weights[product_];
            uint32 weightSum_ = _weightSum - prevWeight + weight_;
            _weightSum = weightSum_;
            _weights[product_] = weight_;
        }
        emit ProductWeightSet(product_, weight_);
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param product_ Address of the product to remove.
     */
    function removeProduct(address product_) external override onlyGovernance {
        uint256 index = _productToIndex[product_];
        // product wasn't added to begin with
        if(index == 0) return;
        // if not at the end copy down
        uint256 lastIndex = _productCount;
        if(index != lastIndex) {
            address lastProduct = _indexToProduct[lastIndex];
            _productToIndex[lastProduct] = index;
            _indexToProduct[index] = lastProduct;
        }
        // pop end of array
        delete _productToIndex[product_];
        delete _indexToProduct[lastIndex];
        uint256 newProductCount = _productCount - 1;
        _weightSum = (newProductCount == 0)
          ? type(uint32).max // no div by zero
          : (_weightSum - _weights[product_]);
        _productCount = newProductCount;
        delete _weights[product_];
        emit ProductWeightSet(product_, 0);
    }

    /**
     * @notice Sets the products and their weights.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param products_ The products.
     * @param weights_ The product weights.
     */
    function setProductWeights(address[] calldata products_, uint32[] calldata weights_) external override onlyGovernance {
        // check recipient - weight map
        require(products_.length == weights_.length, "length mismatch");
        // delete old products
        for(uint256 index = _productCount; index > 0; index--) {
            address product = _indexToProduct[index];
            delete _productToIndex[product];
            delete _indexToProduct[index];
            delete _weights[product];
            emit ProductWeightSet(product, 0);
        }
        // add new products
        uint32 weightSum_ = 0;
        uint256 length = products_.length;
        for(uint256 i = 0; i < length; i++) {
            address product = products_[i];
            uint32 weight = weights_[i];
            require(weight > 0, "no weight");
            require(_weights[product] == 0, "duplicate product");
            _weights[product] = weight;
            weightSum_ += weight;
            _productToIndex[product] = i+1;
            _indexToProduct[i+1] = product;
            emit ProductWeightSet(product, weight);
        }
        _weightSum = (length == 0)
          ? type(uint32).max // no div by zero
          : weightSum_;
        _productCount = length;
    }

    /**
     * @notice Sets the partial reserves factor.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param partialReservesFactor_ New partial reserves factor in BPS.
     */
    function setPartialReservesFactor(uint16 partialReservesFactor_) external override onlyGovernance {
        _partialReservesFactor = partialReservesFactor_;
    }
}
