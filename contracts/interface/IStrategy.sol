// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

/**
 * @title Strategy interface
 * @author solace.fi
 * @notice Interface for investment Strategy contract
 */
interface IStrategy {
    function withdraw(uint256 _amount) external returns (uint256 _loss);
    function deposit() external payable;
    function estimatedTotalAssets() external view returns (uint256);
    function delegatedAssets() external view returns (uint256);
    function harvest() external;
    function isActive() external view returns (bool);
}