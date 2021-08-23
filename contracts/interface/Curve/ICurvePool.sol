// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface ICurvePool {
    function coins(uint256 arg0) external view returns (address);
    // solhint-disable-next-line func-name-mixedcase, var-name-mixedcase
    function calc_withdraw_one_coin(uint256 token_amount, int128 i) external view returns (uint256);
}
