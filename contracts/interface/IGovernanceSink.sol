// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IGovernanceSink
 * @author solace.fi
 * @notice An inert holder of governance roles.
 *
 * There will come a time when our contracts become self-sustaining and no longer require a [**governor**](/docs/protocol/governance). When that time comes, `GovernanceSink` will be the holder of the governance role.
 *
 * OpenZeppelin's `renounceOwnership()` is vulnerable to 'reinitialization exploits' in which a contract asserts that an initialization function only runs once. In reality, the contract checks `owner == address(0x0)`, which once again becomes true after `renounceOwnership()`. An attacker can rerun the initialization function and set themselves as owner. Transferring the governance role to `GovernanceSink` is a safer alternative as `GovernanceSink` cannot do anything besides hold the role.
 */
interface IGovernanceSink {

    /**
     * @notice Accepts the governance role for a given contract.
     * This action cannot be reversed.
     * Before you call it, ask yourself:
     *   - Is the contract self-sustaining?
     *   - Is there a chance you will need governance privileges in the future?
     * Note that there is no access control on this function.
     * Assume it will be called immediately after `renouncingContract.setGovernance()`.
     * @param renouncingContract The address of the contract to renounce governance. Must have already `setGovernance()`.
     */
    function sinkGovernance(address renouncingContract) external;
}
