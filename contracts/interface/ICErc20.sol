// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface ICErc20 is IERC20Metadata {
    function mint(uint mintAmount) external returns (uint);
    function borrow(uint256 borrowAmount) external returns (uint256);
    function redeem(uint redeemTokens) external returns (uint256);
    function exchangeRateStored() external view returns (uint256);
    function underlying() external view returns (address);
}
