// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface ICurveAddressProvider {
    // solhint-disable-next-line func-name-mixedcase
    function get_registry() external view returns (address);
}
