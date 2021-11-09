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
    mapping(address => RiskParams) internal _productRiskParams;

    /// @notice the number of products in strategy
    uint256 internal _productCount = 0;

    /// @notice sum of the product weights in strategy
    /// @dev zero-assignment is fine. it is set on constructor.
    uint32 internal _weightSum = 0;

    /// @notice the cover amount that is allocated by `Risk Manager`.
    uint256 internal _coverAmount = 0;

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
      RISK STRATEGY VIEW FUNCTIONS
    ***************************************/
    
    /**
     * @notice The maximum amount of cover that `Risk Strategy` as a whole can sell.
     * @return cover The max amount of cover in `wei`
    */
    function maxCover() public view override returns (uint256 cover) {
        return _coverAmount;
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
        uint256 ac = IProduct(prod).activeCoverAmount();
        return (mc < ac) ? 0 : (mc - ac);
    }

    /**
     * @notice The maximum amount of cover in `Risk Strategy` that a product can sell in a single policy.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in `wei`.
    */
    function maxCoverPerPolicy(address prod) external view override returns (uint256 cover) {
        RiskParams storage params = _productRiskParams[prod];
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
        RiskParams storage params = _productRiskParams[prod];
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

            _productRiskParams[products[i]] = RiskParams({
              weight: weights[i],
              price: prices[i],
              divisor: divisors[i]
            });

            _productToIndex[products[i]] = _productCount;
            _indexToProduct[_productCount] = products[i];
            _productCount += 1;
            _weightSum += weights[i];

            emit ProductParamsSet(products[i], weights[i], prices[i], divisors[i]);            
        }
    }

}