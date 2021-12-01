// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title ICoverageDataProvider
 * @author solace.fi
 * @notice Calculates the maximum amount of cover that `Solace` protocol can sell as a coverage. 
*/
interface ICoverageDataProvider {
    /// @notice Emitted when a new underwriting pool is added.
    event UnderwritingPoolAdded(address pool);
    /// @notice Emitted when underwriting pool is updated.
    event UnderwritingPoolStatusUpdated(address pool, bool status);
    /// @notice Emitted when price oracle address is updated.
    event PriceOracleUpdated(address oracle);

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
    function poolCount() external view returns (uint256 count);
    
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
    function getPoolBalance(address pool_) external view returns (uint256 amount);
}
