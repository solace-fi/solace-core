// SPDX-License-Identifier: GPL-3.0-or-later
// code borrowed from https://etherscan.io/address/0xa2327a938febf5fec13bacfb16ae10ecbc4cbdcf#code
pragma solidity 0.8.6;

/**
 * @title IBlackList
 * @author Circle
 * @notice Circle's USDC has the ability to blacklist accounts. We need to circumvent the blacklist to test our products, and IBlacklist helps us do that.
 */
interface IBlacklist {
    /**
     * @notice Checks if account is blacklisted.
     * @param account The address to check.
     * @return status True if the account is blacklisted.
     */
    function isBlacklisted(address account) external view returns (bool status);
}
