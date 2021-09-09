// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title Mock AToken
 * @author solace.fi
 * @notice Mock AToken is only used to test AaveV2Product.
 */
contract MockAToken {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address underlying) {
        return address(this);
    }
}
