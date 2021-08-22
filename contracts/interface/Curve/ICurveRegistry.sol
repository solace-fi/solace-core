// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface ICurveRegistry {
    // solhint-disable-next-line func-name-mixedcase
    function get_pool_from_lp_token(address token) external view returns (address pool);
    // solhint-disable-next-line func-name-mixedcase
    function get_lp_token(address pool) external view returns (address token);
    // solhint-disable-next-line func-name-mixedcase, var-name-mixedcase
    function get_n_coins(address pool) external view returns (uint256 n_coins);
}
