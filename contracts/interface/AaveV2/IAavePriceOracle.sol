// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IAavePriceOracle
 * @author solace.fi
 * @notice The smart contract that returns the asset prices in `ETH`.
*/
interface IAavePriceOracle {
    function getAssetPrice(address _asset) external view returns (uint256);
    function getAssetsPrices(address[] calldata _assets) external view returns(uint256[] memory);
}