// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface IYRegistry {
    function getVaultInfo(address vault) external view returns (
        address controller,
        address token,
        address strategy,
        bool isWrapped,
        bool isDelegated
    );
}
