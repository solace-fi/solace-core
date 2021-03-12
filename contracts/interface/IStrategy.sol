// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

/**
 * @title Strategy interface
 * @author solace.fi
 * @notice Interface for investment Strategy contract
 */
interface IStrategy {
    function withdraw(uint256 _amount) external;
    function deposit() external payable;
}