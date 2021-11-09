// SPDX-Licence-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface IRiskStrategy {

    /***************************************
      TYPE DEFINITIONS
    ***************************************/
   
    /// @notice Struct for a product's risk parameters.
    struct RiskParams {
      uint32 weight;  // The weighted allocation of this product vs other products.
      uint24 price;   // The price in wei per 1e12 wei of coverage per block.
      uint16 divisor; // The max cover per policy divisor. (maxCoverPerProduct / divisor = maxCoverPerPolicy)
    }
    
    /***************************************
      EVENTS
    ***************************************/
    
    /// @notice Emitted when a product's risk parameters are set.
    /// Includes adding and removing products.
    event ProductParamsSet(address product, uint32 weight, uint24 price, uint16 divisor);
    
    /***************************************
      RISK STRATEGY VIEW FUNCTIONS
    ***************************************/
    
    /**
     * @notice The maximum amount of cover that `Risk Strategy` as a whole can sell.
     * @return cover The max amount of cover in `wei`
    */
    function maxCover() external view returns (uint256 cover);
    
    /**
     * @notice The maximum amount of cover in `Risk Strategy` that a product can sell in total.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in `wei`
    */
    function  maxCoverPerProduct(address prod) external view returns (uint256 cover);
    
    /**
     * @notice The amount of cover in `Risk Strategy` that a product can still sell.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in `wei`.  
    */
    function sellableCoverPerProduct(address prod) external view returns (uint256 cover);
    
    /**
     * @notice The maximum amount of cover in `Risk Strategy` that a product can sell in a single policy.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in `wei`.
    */
    function maxCoverPerPolicy(address prod) external view returns (uint256 cover);
    
    /**
     * @notice Checks if product is an active product in `Risk Strategy`.
     * @param prod The product to check.
     * @return status True if the product is active.
    */
    function productIsActive(address prod) external view returns (bool status);
    
    /**
     * @notice Returns the number of registered products in `Risk Strategy`.
     * @return count The number of products.
    */
    function numProducts() external view returns (uint256 count);
    
    /**
     * @notice Returns the product at an index in `Risk Strategy`.
     * @param index The index to query.
     * @return prod The product address.
    */
    function product(uint256 index) external view returns (address prod);
    
    /**
     * @notice Returns given product's risk paramaters. The product must be active.
     * @param prod The product to get parameters for.
     * @return weight The weighted allocation of this product.
     * @return price The price in `wei` per `1e12 wei` of coverage per block.
     * @return divisor The max cover per policy divisor.
    */
    function productRiskParams(address prod) external view returns (uint32 weight, uint24 price, uint16 divisor);
    
    /**
     * @notice Returns the sum of weights in `Risk Strategy`.
     * @return sum The weight sum.
    */
    function weightSum() external view returns (uint32 sum);

}
