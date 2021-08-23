// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface IYVault {
    function token() external view returns (address);
    function balanceOf(address user) external view returns (uint256);
    function getPricePerFullShare() external view returns (uint256);
    function deposit(uint256 amount) external;
}
