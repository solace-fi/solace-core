// SPDX-License-Identifier: GPL-3.0-or-later
// code borrowed from https://etherscan.io/address/0xa50ba011c48153de246e5192c8f9258a2ba79ca9
pragma solidity 0.8.6;

/// @title AaveOracle
/// @author Aave
/// @notice Proxy smart contract to get the price of an asset from a price source, with Chainlink Aggregator
///         smart contracts as primary option
/// - If the returned price by a Chainlink aggregator is <= 0, the call is forwarded to a fallbackOracle
/// - Owned by the Aave governance system, allowed to add sources for assets, replace them
///   and change the fallbackOracle
interface IAavePriceOracle {

    /// @notice Gets an asset price by address
    /// @param asset The asset address
    function getAssetPrice(address asset) external view returns (uint256);
}
