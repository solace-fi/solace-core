// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

// used in USDC
interface IBlacklist {
    function isBlacklisted(address _account) external view returns (bool);
}
