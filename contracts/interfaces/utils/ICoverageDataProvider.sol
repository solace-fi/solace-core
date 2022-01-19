// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title ICoverageDataProvider
 * @author solace.fi
 * @notice Calculates the maximum amount of cover that `Solace` protocol can sell as a coverage. 
*/
interface ICoverageDataProvider {
    /***************************************
     TYPE DEFINITIONS
    ***************************************/

    /// @notice Underwriting Pool asset types.
    /// 0 = SOLACE token
    /// 1 = Any ERC20 token
    /// 2 = Wrapped ETH
    /// 3 = Solace Capital Provider Token. (1 ETH = 1 SCP)
    /// 4 = Sushiswap SOLACE/? SLP pools
    /// 5 = Sushiswap ?/? SLP pools(other than SOLACE token pairs).
    enum AssetType {
        SOLACE, 
        ERC20,
        WETH,
        SOLACE_SLP,
        SLP 
    }

    /***************************************
     EVENTS
    ***************************************/

    /// @notice Emitted when a new underwriting pool is added.
    event UnderwritingPoolAdded(address pool);
    /// @notice Emitted when underwriting pool is updated.
    event UnderwritingPoolStatusUpdated(address pool, bool status);
    /// @notice Emitted when price oracle address is updated.
    event PriceOracleUpdated(address oracle);
    /// @notice Emitted when a new asset is added.
    event AssetAdded(address asset);
    /// @notice Emitted when an asset is removed.
    event AssetRemoved(address asset);
    /// @notice Emitted when registry is updated.
    event RegistryUpdated(address registry);
    /// @notice Emitted when SOLACE is updated.
    event SolaceUpdated(address solace);
    /// @notice Emitted when SOLACE/USDC SLP pool is updated.
    event SolaceUsdcPoolUpdated(address solaceUsdcPool);

    /***************************************
     GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds new underwriting pools.
     * @param pools_ The new underwriting pools.
    */
    function addPools(address[] calldata pools_) external;

    /**
     * @notice Updates the status of the given underlying pool.
     * @param pool_ The pool to update status.
     * @param status_ The new pool status.
    */
    function setPoolStatus(address pool_, bool status_) external;

    /**
     * @notice Sets the price oracle address.
     * @param priceOracle_ The new price oracle address.
    */
    function setPriceOracle(address priceOracle_) external;

    /**
     * @notice Adds a new asset.
     * @param asset_ The asset address.
     * @param assetType_ The type of asset.(e.g. ERC20, Sushi LP or Uniswap LP etc.)
    */
    function addAsset(address asset_, AssetType assetType_) external;

    /**
     * @notice Removes an asset.
     * @param asset_ The asset to remove.
    */
    function removeAsset(address asset_) external;

    /**
     * @notice Sets the pools and assets. Removes the current assets.
     * @param assets_ The assets to set.
     * @param assetTypes_ The asset types to set.
    */
    function setAssets(address[] calldata assets_, AssetType[] calldata assetTypes_) external;

    /**
     * @notice Sets the registry address.
     * @param registry_ The address of the new registry.
    */
    function setRegistry(address registry_) external;

    /**
     * @notice Sets `SOLACE` token address.
     * @param solace_ The new token address.
    */
    function setSolace(address solace_) external;

    /**
     * @notice Sets `SOLACE/USDC` SLP address.
     * @param solaceUsdcPool_ The address of the SLP pool.
    */
    function setSolaceUsdcPool(address solaceUsdcPool_) external;

    /***************************************
     VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the `SOLACE`.
     * @return solace_ The address of the `SOLACE` token.
    */
    function solace() external view returns (address solace_);

    /**
     * @notice Returns the `SOLACE/USDC` SLP pool.
     * @return solaceUsdcPool_ The address of the pool.
    */
    function solaceUsdcPool() external view returns (address solaceUsdcPool_);
    
    /**
     * @notice Returns registry address.
     * @return registry_ The registry address.
    */
    function registry() external view returns (address registry_);

    /**
     * @notice Returns the price oracle.
     * @return oracle The address of the price oracle.
    */
    function priceOracle() external view returns (address oracle);

    /**
     * @notice Returns the underwriting pool for the given index.
     * @param index_ The underwriting pool index.
     * @return pool The underwriting pool.
    */
    function poolAt(uint256 index_) external view returns (address pool);

    /**
     * @notice Returns status of the underwriting pool.
     * @param pool_ The underwriting pool to query status.
     * @return status True if underwriting pool is enabled. 
    */
    function poolStatus(address pool_) external view returns (bool status);

    /**
     * @notice Returns the underwriting pool count.
     * @return count The number of underwriting pools.
    */
    function numOfPools() external view returns (uint256 count);

    /**
     * @notice Returns the underwriting pool asset count.
     * @return count The number of underwriting pools.
    */
    function numOfAssets() external view returns (uint256 count);
    
    /**
     * @notice Returns the underwriting pool asset for the given index.
     * @param index_ The underwriting pool asset index.
     * @return asset_ The underwriting pool asset.
     * @return assetType_ The underwriting pool asset.
    */
    function assetAt(uint256 index_) external view returns (address asset_, AssetType assetType_);
   
    /**
     * @notice The maximum amount of cover that Solace as a whole can sell.
     * @return cover The max amount of cover in wei.
    */
    function maxCover() external view returns (uint256 cover);

    /**
     * @notice Returns total value in `ETH` for the given underwriting pool.
     * @param pool_ The underwriting pool.
     * @return amount The total asset value of the underwriting pool in ETH.
    */
    function getPoolAmount(address pool_) external view returns (uint256 amount);

    /**
     * @notice Returns `SOLACE` token price in `ETH` from `SOLACE/USDC Sushiswap Pool`.
     * @return solacePrice The `SOLACE` price in `ETH`.
    */
    function getSolacePriceInETH() external view returns (uint256 solacePrice); 
}
