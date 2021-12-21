// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interface/ICoverageDataProvider.sol";
import "./interface/IRegistry.sol";
import "./interface/IVault.sol";
import "./interface/ISOLACE.sol";
import "./interface/AaveV2/IAavePriceOracle.sol";
import "./interface/Sushiswap/ISushiswapLPToken.sol";
import "./Governable.sol";

/**
 * @title  CoverageDataProvider
 * @author solace.fi
 * @notice Calculates the maximum amount of cover that `Solace` protocol can sell as a coverage. 
*/
contract CoverageDataProvider is ICoverageDataProvider, Governable {
    /***************************************
     STATE VARIABLES
    ***************************************/

    /// @notice price oracle.
    /// @dev AAVE price returns asset price in ETH.
    IAavePriceOracle internal _priceOracle;
    /// @notice Registry contract.
    IRegistry internal _registry;

    /// @notice SOLACE token address.
    ISOLACE internal _solace;

    /// @notice SOLACE-USDC SLP pool address.
    /// @dev We define a state variable for the solace-usdcs pool address
    /// in order to get SOLACE token price from this pool.
    ISushiswapLPToken internal _solaceUsdcPool;

    /// Asset Mappings
    /// @notice asset => index.
    mapping(address => uint256) internal _assetToIndex;
    /// @notice index => asset.
    mapping(uint256 => address) internal _indexToAsset;
    /// @notice assets.
    /// @dev Map enumeration [1, numOfAssets]
    mapping(address => AssetType) internal _assets;
    /// @notice asset count.
    uint256 internal _assetCount = 0;

    /// Underwriting Pool Mappings
    /// @notice Underwriting pool => index.
    /// @dev Map enumeration [1, numOfPools]
    mapping(address => uint256) internal _underwritingPoolToIndex;
    /// @notice Index => underwriting pool.
    mapping(uint256 => address) internal _indexToUnderwritingPool;
    /// @notice Underwriting pool status.
    mapping(address => bool) internal _underwritingPoolStatus;
    /// @notice Underwriting pool count.
    uint256 internal _underwritingPoolCount = 0;

    /**
     * @notice Constructs the `CoverageDataProvider` contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param registry_ The address of registry.
     * @param aaveV2PriceOracle_ The address of the AAVEv2 price oracle.
     * @param solaceUsdcPool_ The address of `Sushiswap SOLACE-USDC` pool to get `SOLACE` token price.
    */
    constructor(address governance_, address registry_, address aaveV2PriceOracle_, address solaceUsdcPool_) Governable(governance_) {
      require(registry_ != address(0x0), "zero address registry");
      require(aaveV2PriceOracle_ != address(0x0), "zero address oracle");
      require(solaceUsdcPool_ != address(0x0), "zero address pool");
      _registry = IRegistry(registry_);
      require(_registry.solace() != address(0x0), "zero address solace");

      _priceOracle = IAavePriceOracle(aaveV2PriceOracle_);
      _solaceUsdcPool = ISushiswapLPToken(solaceUsdcPool_);
      _solace = ISOLACE(_registry.solace());

      // SOLACE
      _addAsset(address(_solace), AssetType.SOLACE);
      // SOLACE-USDC SLP Pool
      _addAsset(address(_solaceUsdcPool), AssetType.SOLACE_SLP);
      // DAI
      _addAsset(0x6B175474E89094C44Da98b954EedeAC495271d0F, AssetType.ERC20);
      // WETH
      _addAsset(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2, AssetType.WETH);
      // USDC
      _addAsset(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48, AssetType.ERC20);
      // WBTC
      _addAsset(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599, AssetType.ERC20);
      // USDT
      _addAsset(0xdAC17F958D2ee523a2206206994597C13D831ec7, AssetType.ERC20);
    }

    /***************************************
     GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds new underwriting pools.
     * @param pools_ The new underwriting pools.
    */
    function addPools(address[] calldata pools_) external override onlyGovernance {
      require(pools_.length > 0, "invalid pool length");
      uint256 index = numOfPools();

      for (uint256 i = 0; i < pools_.length; i++) {
        require(pools_[i] != address(0x0), "zero address pool");
        if (_underwritingPoolToIndex[pools_[i]] > 0) continue;
        _underwritingPoolToIndex[pools_[i]] = ++index;
        _indexToUnderwritingPool[index] = pools_[i];
        _underwritingPoolStatus[pools_[i]] = true;
        emit UnderwritingPoolAdded(pools_[i]);
      }
      _underwritingPoolCount = index;
    }

    /**
     * @notice Updates the status of the given underlying pool.
     * @param pool_ The pool to update status.
     * @param status_ The new pool status.
    */
    function setPoolStatus(address pool_, bool status_) external override onlyGovernance {
      require(pool_ != address(0x0), "zero address pool");
      require(_underwritingPoolToIndex[pool_] > 0, "invalid pool");
      _underwritingPoolStatus[pool_] = status_;
      emit UnderwritingPoolStatusUpdated(pool_, status_);
    }

    /**
     * @notice Adds a new asset.
     * @param asset_ The asset address.
     * @param assetType_ The type of asset.(e.g. ERC20, Sushi LP or Uniswap LP etc.)
    */
    function addAsset(address asset_, AssetType assetType_) external override onlyGovernance {
      _addAsset(asset_, assetType_);
    }

    /**
     * @notice Removes an asset.
     * @param asset_ The asset to remove.
    */
    function removeAsset(address asset_) external override onlyGovernance {
      uint256 index = _assetToIndex[asset_];
      if (index == 0) return;

      uint256 assetCount = _assetCount;
      if (assetCount == 0) return;

      if (index != assetCount) {
        address lastAsset = _indexToAsset[assetCount];
        _assetToIndex[lastAsset] = index;
        _indexToAsset[index] = lastAsset; 
      }
      delete _assetToIndex[asset_];
      delete _indexToAsset[assetCount];
      delete _assets[asset_];
      _assetCount = assetCount - 1;
      emit AssetRemoved(asset_);
    }

    /**
     * @notice Sets the pools and assets. Removes the current assets.
     * @param assets_ The assets to set.
     * @param assetTypes_ The asset types to set.
    */
    function setAssets( address[] calldata assets_, AssetType[] calldata assetTypes_) external override onlyGovernance {
      require(assets_.length == assetTypes_.length, "length mismatch");
      // delete assets
      uint256 assetCount = _assetCount;
      for (uint256 i = assetCount; i > 0; i--) {
        address asset = _indexToAsset[i];
        delete _assetToIndex[asset];
        delete _indexToAsset[i];
        delete _assets[asset];
        emit AssetRemoved(asset);
      }
      _assetCount = 0;

      for (uint256 i = 0; i < assets_.length; i++) {
        _addAsset(assets_[i], assetTypes_[i]);
      }
    }

    /**
     * @notice Sets the registry address.
     * @param registry_ The address of the new registry.
    */
    function setRegistry(address registry_) external override onlyGovernance {
      require(registry_ != address(0x0), "zero address registry");
      _registry = IRegistry(registry_);
      require(_registry.solace() != address(0x0), "zero address solace");
      _solace = ISOLACE(_registry.solace());
      emit RegistryUpdated(registry_);
      emit SolaceUpdated(address(_solace));
    }

    /**
     * @notice Sets `SOLACE` token address.
     * @param solace_ The new token address.
    */
    function setSolace(address solace_) external override onlyGovernance {
      require(solace_ != address(0x0), "zero address solace");
      _solace = ISOLACE(solace_);
      emit SolaceUpdated(solace_);
    }

    /**
     * @notice Sets `SOLACE/USDC` SLP address.
     * @param solaceUsdcPool_ The address of the SLP pool.
    */
    function setSolaceUsdcPool(address solaceUsdcPool_) external override onlyGovernance {
      require(solaceUsdcPool_ != address(0x0), "zero address slp");
      _solaceUsdcPool = ISushiswapLPToken(solaceUsdcPool_);
      emit SolaceUsdcPoolUpdated(solaceUsdcPool_);
    }

    /**
     * @notice Sets the price oracle address.
     * @param priceOracle_ The new price oracle address.
    */
    function setPriceOracle(address priceOracle_) external override onlyGovernance {
      require(priceOracle_ != address(0x0), "zero address oracle");
      _priceOracle = IAavePriceOracle(priceOracle_);
      emit PriceOracleUpdated(priceOracle_);
    }

    /***************************************
     VIEW FUNCTIONS
    ***************************************/
   
    /**
     * @notice Returns the `SOLACE`.
     * @return solace_ The address of the `SOLACE` token.
    */
    function solace() public view override returns (address solace_) {
      return address(_solace);
    }

    /**
     * @notice Returns the `SOLACE/USDC` SLP pool.
     * @return solaceUsdcPool_ The address of the pool.
    */
    function solaceUsdcPool() public view override returns (address solaceUsdcPool_) {
      return address(_solaceUsdcPool);
    }

    /**
     * @notice Returns registry address.
     * @return registry_ The registry address.
    */
    function registry() external view override returns (address registry_) {
      return address(_registry);
    }

    /**
     * @notice Returns the price oracle.
     * @return oracle The address of the price oracle.
    */
    function priceOracle() public view override returns (address oracle) {
      return address(_priceOracle);
    }

    /**
     * @notice Returns status of the underwriting pool.
     * @param pool_ The underwriting pool to query status.
     * @return status True if underwriting pool is enabled. 
    */
    function poolStatus(address pool_) public view override returns (bool status) {
      return _underwritingPoolStatus[pool_];
    }

    /**
     * @notice Returns the underwriting pool for the given index.
     * @param index_ The underwriting pool index.
     * @return pool The underwriting pool.
    */
    function poolAt(uint256 index_) external view override returns (address pool) {
      return _indexToUnderwritingPool[index_];
    }

    /**
     * @notice Returns the underwriting pool count.
     * @return count The number of underwriting pools.
    */
    function numOfPools() public view override returns (uint256 count) {
      return _underwritingPoolCount;
    }

    /**
     * @notice Returns the underwriting pool asset count.
     * @return count The number of underwriting pools.
    */
    function numOfAssets() public view override returns (uint256 count) {
      return _assetCount;
    }

    /**
     * @notice Returns the underwriting pool asset for the given index.
     * @param index_ The underwriting pool asset index.
     * @return asset_ The underwriting pool asset.
     * @return assetType_ The underwriting pool asset.
    */
    function assetAt(uint256 index_) external view override returns (address asset_, AssetType assetType_) {
      address asset = _indexToAsset[index_];
      return (asset, _assets[asset]);
    }

    /**
     * @notice The maximum amount of cover that Solace as a whole can sell.
     * @return cover The max amount of cover in wei.
    */
    function maxCover() external view override returns (uint256 cover) {
      // get vault balance
      address vault = _registry.vault();
      if (vault != address(0x0)) {
        cover += IVault(payable(vault)).totalAssets();
      }
      // get pool balance
      uint256 pools = numOfPools();
      for (uint256 i = pools; i > 0; i--) {
        cover += getPoolAmount(_indexToUnderwritingPool[i]);
      }
    }

    /**
     * @notice Returns total value in `ETH` for the given underwriting pool.
     * @param pool_ The underwriting pool.
     * @return amount The total asset value of the underwriting pool in ETH.
    */
    function getPoolAmount(address pool_) public view override returns (uint256 amount) {
      if (_underwritingPoolToIndex[pool_] == 0) return 0;
      if (_underwritingPoolStatus[pool_] == false) return 0;
      // get pool's eth balance
      amount += address(pool_).balance;
      uint256 assetCount = _assetCount;
      for (uint256 i = assetCount; i > 0; i--) {
        address asset = _indexToAsset[i];
        AssetType assetType = _assets[asset];
        amount += _getAmount(pool_, asset, assetType);
      }
    }

    /**
     * @notice Returns `SOLACE` token price in `ETH` from `SOLACE/USDC Sushiswap Pool`.
     * @return solacePrice The `SOLACE` price in `ETH`.
    */
    function getSolacePriceInETH() public view override returns (uint256 solacePrice) {
      (uint112 reserve0, uint112 reserve1,) = _solaceUsdcPool.getReserves();
      if (reserve0 == 0 || reserve1 == 0) return 0;
      address token1 = _solaceUsdcPool.token1();
      uint112 priceInUsdcs = reserve1 / reserve0;
      uint256 priceInETH = priceInUsdcs * _priceOracle.getAssetPrice(token1);
      return priceInETH;
    }

    /***************************************
     PRIVATE FUNCTIONS
    ***************************************/

    function _getAmount(address pool, address asset, AssetType assetType) private view returns (uint256 amount) {
      if (assetType == AssetType.ERC20) {
        // any ERC20 token
        amount += _getAmountInETH(asset, ERC20(asset).balanceOf(pool), ERC20(asset).decimals());
      } else if (assetType == AssetType.WETH) {
        // WETH
        amount += ERC20(asset).balanceOf(pool);
      } else if (assetType == AssetType.SOLACE) {
        // only SOLACE
        amount += _solace.balanceOf(pool) * getSolacePriceInETH();
      } else if (assetType == AssetType.SOLACE_SLP) {
        // any SOLACE SLP pool
        ISushiswapLPToken lpToken = ISushiswapLPToken(asset);
        ERC20 token1 = ERC20(lpToken.token1());
        (uint112 reserve0, uint112 reserve1,) = lpToken.getReserves();
        uint256 slpAmount = reserve0 * getSolacePriceInETH();
        slpAmount += _getAmountInETH(asset, reserve1, token1.decimals());
        amount += (slpAmount * lpToken.balanceOf(pool)) / lpToken.totalSupply();
      } else if (assetType == AssetType.SLP) {
        // any SLP pool other than SOLACE pair
        ISushiswapLPToken lpToken = ISushiswapLPToken(asset);
        ERC20 token0 = ERC20(lpToken.token0());
        ERC20 token1 = ERC20(lpToken.token1());
        (uint112 reserve0, uint112 reserve1,) = lpToken.getReserves();
        uint256 slpAmount = _getAmountInETH(asset, reserve0, token0.decimals());
        slpAmount += _getAmountInETH(asset, reserve1, token1.decimals());
        amount += (slpAmount * lpToken.balanceOf(pool)) / lpToken.totalSupply();
      }
    }

    function _getAmountInETH(address asset, uint256 balance, uint8 decimals) private view returns (uint256 amount) {
      return (balance * _priceOracle.getAssetPrice(asset)) / decimals;
    }

    function _addAsset(address asset_, AssetType assetType_) private {
      require(asset_ != address(0x0), "zero address asset");
      uint256 index = _assetToIndex[asset_];
      if (index > 0) return;

      index = _assetCount;
      _assets[asset_] = assetType_;
      _assetToIndex[asset_] = ++index;
      _indexToAsset[index] = asset_;
      _assetCount = index;
      emit AssetAdded(asset_);
    }
}
