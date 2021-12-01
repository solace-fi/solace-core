// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interface/ICoverageDataProvider.sol";
import "./interface/IRegistry.sol";
import "./interface/IVault.sol";
import "./interface/AaveV2/IAavePriceOracle.sol";
import "./Governable.sol";

/**
 * @title  CoverageDataProvider
 * @author solace.fi
 * @notice Calculates the maximum amount of cover that `Solace` protocol can sell as a coverage. 
*/
contract CoverageDataProvider is ICoverageDataProvider, Governable {
    
    /// @notice price oracle.
    IAavePriceOracle internal _priceOracle;

    /// @notice SOLACE-USDC SLP Pool address.
    address public immutable solaceSLP = 0x9C051F8A6648a51eF324D30C235da74D060153aC;
    /// @notice SCP address.
    address public immutable solaceSCP = 0x501AcEe83a6f269B77c167c6701843D454E2EFA0;
    /// @notice DAI address.
    address public immutable dai = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    /// @notice WETH address. 
    address public immutable weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    /// @notice USDC address.
    address public immutable usdc = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    /// @notice WBTC address.
    address public immutable wbtc = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    /// @notice USDT address.
    address public immutable usdt = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    /// @notice Underwriting pool => index.
    mapping(address => uint256) internal _underwritingPoolToIndex;
    /// @notice Index => underwriting pool.
    mapping(uint256 => address) internal _indexToUnderwritingPool;
    /// @notice Underwriting pool status.
    mapping(address => bool) internal _underwritingPoolStatus;
    /// @notice Underwriting pool count.
    uint256 internal _underwritingPoolCount = 0;

    /// @notice Registry contract.
    IRegistry internal immutable _registry;

    constructor(address governance_, address registry_) Governable(governance_) {
      require(registry_ != address(0x0), "zero address registry");
      _registry = IRegistry(registry_);
      _priceOracle = IAavePriceOracle(0xA50ba011c48153De246E5192C8f9258A2ba79Ca9);
    }

    /**
     * @notice Adds new underwriting pools.
     * @param pools_ The new underwriting pools.
    */
    function addPools(address[] calldata pools_) external override onlyGovernance {
      require(pools_.length > 0, "invalid pool length");
      uint256 index = poolCount();

      for (uint256 i = 0; i < pools_.length; i++) {
        require(pools_[i] != address(0x0), "zero address pool");
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
    }

    /**
     * @notice Sets the price oracle address.
     * @param priceOracle_ The new price oracle address.
    */
    function setPriceOracle(address priceOracle_) external override onlyGovernance {
      require(priceOracle_ != address(0x0), "zero address price oracle");
      _priceOracle = IAavePriceOracle(priceOracle_);
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
    function poolCount() public view override returns (uint256 count) {
      return _underwritingPoolCount;
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
      uint256 pools = poolCount();
      for (uint256 i = 0; i < pools; i++) {
        cover += getPoolBalance(_indexToUnderwritingPool[i]);
      }
    }

    /**
     * @notice Returns total value in `ETH` for the given underwriting pool.
     * @param pool_ The underwriting pool.
     * @return amount The total asset value of the underwriting pool in ETH.
    */
    function getPoolBalance(address pool_) public view override returns (uint256 amount) {
      require(_underwritingPoolToIndex[pool_] > 0, "invalid pool");
      require(_underwritingPoolStatus[pool_], "inactive pool");
      // get pool's eth balance
      amount += address(pool_).balance;
      // get pool's weth balance
      amount += ERC20(weth).balanceOf(pool_);
      // get pool's dai balance in eth
      amount += _getAssetValue(pool_, dai);
      // get pool's usdc balance in eth
      amount += _getAssetValue(pool_, usdc);
      // get pool's usdt balance in eth
      amount += _getAssetValue(pool_, usdt);
      // get pool's wbtc balance in eth
      amount += _getAssetValue(pool_, wbtc);
      // TODO: get pool's slp balance in eth
      // TODO: get pool's scp balance in eth
    }

    function _getAssetValue(address pool, address asset) private view returns (uint256 value) {
      ERC20 erc20 = ERC20(asset);
      return (erc20.balanceOf(pool) / erc20.decimals()) * _priceOracle.getAssetPrice(asset);
    } 
}
