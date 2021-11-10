// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./interface/IProduct.sol";
import "./interface/IRiskManager.sol";
import "./interface/IRiskStrategy.sol";

contract RiskStrategy is IRiskStrategy, Governable {

    /// @notice Solace `Risk Manager`
    IRiskManager internal _riskManager;

    /// @notice the address of the strategist.(a.k.a strategy owner)
    address internal _strategist = address(0);

    /// @notice mapping product => index
    mapping(address => uint256) internal _productToIndex;
   
    /// @notice mapping index => product
    mapping(uint256 => address) internal _indexToProduct;

    /// @notice mapping for the product risk params per product
    mapping(address => ProductRiskParams) internal _productRiskParams;

    /// @notice the number of products in strategy
    uint256 internal _productCount = 0;

    /// @notice sum of the product weights in strategy
    /// @dev zero-assignment is fine. it is set on constructor.
    uint32 internal _weightSum = 0;

    /// @notice the allocation weight that is allocated by `Risk Manager`.
    /// It defines how much amount the strategy can use for coverage. 
    uint32 internal _weightAllocation = 0;

    /// @notice controls the access that for only risk manager can access.
    modifier onlyRiskManager() {
      require(msg.sender == address(_riskManager), "not risk manager");
      _;
    }

    /**
     * @notice Constructs the `RiskStrategy` contract.
     * @param governance The address of the [governor](/docs/protocol/governance).
     * @param riskManager The address of the Solace `RiskManager` contract.
    */
    constructor(
        address governance,
        address riskManager,
        address strategist,
        address[] memory products,
        uint32[] memory weights,
        uint24[] memory prices,
        uint16[] memory divisors) Governable(governance) {

        require(riskManager != address(0x0), "zero address risk manager");
        require(strategist  != address(0x0), "zero address strategist");
        _riskManager = IRiskManager(riskManager);
        _strategist = strategist;

        // set strategy product risk params
        _initializeStrategyRiskParams(products, weights, prices, divisors); 
    }

    /***************************************
      RISK STRATEGY MUTUATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Increases the weight of the `Risk Strategy`.
     * @param weight The value to increase.
    */
    function increaseWeightAllocation(uint32 weight) external override onlyRiskManager {
        require(weight > 0, "invalid weight!");
        _weightAllocation += weight;
        emit RiskStrategyWeightAllocationIncreased(address(this), weight);
    }

    /**
     * @notice Decreases the weight of the `Risk Strategy`.
     * @param weight The value to decrease.
    */
    function decreaseWeightAllocation(uint32 weight) external override onlyRiskManager {
        require(weight > 0, "invalid weight!");
        _weightAllocation = _weightAllocation == 0 ? 0 : _weightAllocation - weight;
        emit RiskStrategyWeightAllocationDecreased(address(this), weight);
    }

    /**
     * @notice Sets the weight of the `Risk Strategy`.
     * @param weight The value to set.
    */
    function setWeightAllocation(uint32 weight) external override onlyRiskManager {
        require(weight > 0, "invalid weight!");
        _weightAllocation = weight;
        emit RiskStrategyWeightAllocationSet(address(this), weight);
    }
    
    /***************************************
      RISK STRATEGY VIEW FUNCTIONS
    ***************************************/

    /**
    * @notice Given a request for coverage, determines if that risk is acceptable and if so at what price.
    * @param prod The product that wants to sell coverage.
    * @param currentCover If updating an existing policy's cover amount, the current cover amount, otherwise 0.
    * @param newCover The cover amount requested.
    * @return acceptable True if risk of the new cover is acceptable, false otherwise.
    * @return price The price in wei per 1e12 wei of coverage per block.
    */
    function assessRisk(address prod, uint256 currentCover, uint256 newCover) external view override returns (bool acceptable, uint24 price) {
        // must be a registered product
        if (_productToIndex[prod] == 0) return (false, type(uint24).max);
        // max cover checks
        uint256 mc = maxCover();
        ProductRiskParams storage params = _productRiskParams[prod];
        // must be less than maxCoverPerProduct
        mc = mc * params.weight / _weightSum;
        uint256 productActiveCoverAmount = IProduct(prod).activeCoverAmount();
        productActiveCoverAmount = productActiveCoverAmount + newCover - currentCover;
        if (productActiveCoverAmount > mc) return (false, params.price);
        // must be less than maxCoverPerPolicy
        mc = mc / params.divisor;
        if(newCover > mc) return (false, params.price);
        // risk is acceptable
        return (true, params.price);
    }
    
    /**
     * @notice The maximum amount of cover that `Risk Strategy` as a whole can sell.
     * @return cover The max amount of cover in `wei`
    */
    function maxCover() public view override returns (uint256 cover) {
        return (_riskManager.maxCover() * _weightAllocation) / _riskManager.weightSum();
    }

    /**
     * @notice The maximum amount of cover in `Risk Strategy` that a product can sell in total.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in `wei`
    */
    function  maxCoverPerProduct(address prod) public view override returns (uint256 cover) {
        return maxCover() * _productRiskParams[prod].weight / _weightSum;
    }

    /**
     * @notice The amount of cover in `Risk Strategy` that a product can still sell.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in `wei`.  
    */
    function sellableCoverPerProduct(address prod) public view override returns (uint256 cover) {
        // max cover per product
        uint256 mc = maxCoverPerProduct(prod);
        // active cover for product
        // TODO: implement logic according to strategy
        uint256 ac = IProduct(prod).activeCoverAmount();
        return (mc < ac) ? 0 : (mc - ac);
    }

    /**
     * @notice The maximum amount of cover in `Risk Strategy` that a product can sell in a single policy.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in `wei`.
    */
    function maxCoverPerPolicy(address prod) external view override returns (uint256 cover) {
        ProductRiskParams storage params = _productRiskParams[prod];
        require(params.weight > 0, "product inactive");
        return maxCover() * params.weight / (_weightSum * params.divisor);
    }

    /**
     * @notice Checks if product is an active product in `Risk Strategy`.
     * @param prod The product to check.
     * @return status True if the product is active.
    */
    function productIsActive(address prod) public view override returns (bool status) {
        return _productToIndex[prod] != 0;
    }

    /**
     * @notice Returns the number of registered products in `Risk Strategy`.
     * @return count The number of products.
    */
    function numProducts() external view override returns (uint256 count) {
        return _productCount;
    }

    /**
     * @notice Returns the product at an index in `Risk Strategy`.
     * @param index The index to query.
     * @return prod The product address.
    */
    function product(uint256 index) external view override returns (address prod) {
      return _indexToProduct[index];
    }

    /**
     * @notice Returns given product's risk paramaters. The product must be active.
     * @param prod The product to get parameters for.
     * @return weight The weighted allocation of this product.
     * @return price The price in `wei` per `1e12 wei` of coverage per block.
     * @return divisor The max cover per policy divisor.
    */
    function productRiskParams(address prod) external view override returns (uint32 weight, uint24 price, uint16 divisor) {
        ProductRiskParams storage params = _productRiskParams[prod];
        require(params.weight > 0,  "product inactive");
        return (params.weight, params.price, params.divisor);
    }

    /**
     * @notice Returns the sum of weights in `Risk Strategy`.
     * @return sum The weight sum.
    */
    function weightSum() external view override returns (uint32 sum) {
        return _weightSum;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a product.
     * If the product is already added, sets its parameters.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Governance can add or update product in the strategy in case of any necessary situations.
     * @param prod Address of the product.
     * @param weight The products weight.
     * @param price The products price in wei per 1e12 wei of coverage per block.
     * @param divisor The max cover amount divisor for per policy. (maxCover / divisor = maxCoverPerPolicy).
     */
    function addProduct(address prod, uint32 weight, uint24 price, uint16 divisor) external override onlyGovernance {
        require(prod != address(0x0), "invalid product risk param");
        require(weight > 0, "invalid weight risk param");
        require(price > 0, "invalid price risk param");
        require(divisor > 0, "invalid divisor risk param");

        uint256 index = _productToIndex[prod];
        if (index == 0) {
            // add new product
            uint32 weightSum_ = (_productCount == 0) ? weight : (_weightSum + weight);
            _weightSum = weightSum_;
            _productRiskParams[prod] = ProductRiskParams({
                weight: weight,
                price: price,
                divisor: divisor
            });
            index = _productCount;
            _productToIndex[prod] = index;
            _indexToProduct[index] = prod;
            _productCount++;
            emit ProductAddedByGovernance(prod, weight, price, divisor);
        } else {
            // change params of existing product
            uint32 prevWeight = _productRiskParams[prod].weight;
            uint32 weightSum_ = _weightSum - prevWeight + weight;
            _weightSum = weightSum_;
            _productRiskParams[prod] = ProductRiskParams({
                weight: weight,
                price: price,
                divisor: divisor
            });
            emit ProductUpdatedByGovernance(prod, weight, price, divisor);
        }
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Governance can add or update product in the strategy in case of any necessary situations.
     * @param prod Address of the product to remove.
     */
    function removeProduct(address prod) external override onlyGovernance {
        uint256 index = _productToIndex[prod];
        // product wasn't added to begin with
        if (index == 0) return;
        // if not at the end copy down
        uint256 lastIndex = _productCount;
        if (index != lastIndex) {
            address lastProduct = _indexToProduct[lastIndex];
            _productToIndex[lastProduct] = index;
            _indexToProduct[index] = lastProduct;
        }
        // pop end of array
        delete _productToIndex[prod];
        delete _indexToProduct[lastIndex];
        uint256 newProductCount = _productCount - 1;
        _weightSum = (newProductCount == 0) ? type(uint32).max : (_weightSum - _productRiskParams[prod].weight);
        _productCount = newProductCount;
        delete _productRiskParams[prod];
        emit ProductRemovedByGovernance(prod);
    }

    /**
     * @notice Sets the products and their parameters.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param products The products.
     * @param weights The product weights.
     * @param prices The product prices.
     * @param divisors The max cover per policy divisors.
     */
    function setProductParams(address[] calldata products, uint32[] calldata weights, uint24[] calldata prices, uint16[] calldata divisors) external override onlyGovernance {
        // check array lengths
        uint256 length = products.length;
        require(length == weights.length && length == prices.length && length == divisors.length, "length mismatch");
        // delete old products
        for (uint256 index = _productCount; index > 0; index--) {
            address prod = _indexToProduct[index];
            delete _productToIndex[prod];
            delete _indexToProduct[index];
            delete _productRiskParams[prod];
            emit ProductRiskParamsSetByGovernance(prod, 0, 0, 0);
        }
        // add new products
        uint32 weightSum_ = 0;
        for (uint256 i = 0; i < length; i++) {
            address prod = products[i];
            uint32 weight = weights[i];
            uint24 price = prices[i];
            uint16 divisor = divisors[i];

            require(prod != address(0x0), "invalid product risk param");
            require(weight > 0, "invalid weight risk param");
            require(price > 0, "invalid price risk param");
            require(divisor > 0, "invalid divisor risk param");
            require(_productToIndex[prod] == 0, "duplicate product");

            _productRiskParams[prod] = ProductRiskParams({
                weight: weight,
                price: price,
                divisor: divisor
            });
            weightSum_ += weight;
            _productToIndex[prod] = i;
            _indexToProduct[i] = prod;
            emit ProductRiskParamsSetByGovernance(prod, 0, 0, 0);
        }
        _weightSum = (length == 0) ? type(uint32).max : weightSum_;
        _productCount = length;
    }

    /***************************************
      RISK STRATEGY PRIVATE FUNCTIONS
    ***************************************/

    function _initializeStrategyRiskParams(address[] memory products, uint32[] memory weights, uint24[] memory prices, uint16[] memory divisors ) private {
        uint256 size = products.length;
        require(size > 0 && (size == weights.length && size == prices.length && size == divisors.length), "risk param length mismatch");
       
        for (uint256 i = 0; i < size; i++) {
            require(products[i] != address(0x0), "invalid product risk param");
            require(weights[i]  > 0, "invalid weight risk param");
            require(prices[i]   > 0, "invalid price risk param");
            require(divisors[i] > 0, "invalid divisor risk param");

            _productRiskParams[products[i]] = ProductRiskParams({
              weight: weights[i],
              price: prices[i],
              divisor: divisors[i]
            });

            _productToIndex[products[i]] = _productCount;
            _indexToProduct[_productCount] = products[i];
            _productCount++;
            _weightSum += weights[i];

            emit ProductRiskParamsSet(products[i], weights[i], prices[i], divisors[i]);            
        }
    }
}
