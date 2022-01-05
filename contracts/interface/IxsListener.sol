// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IxsListener
 * @author solace.fi
 * @notice A standard interface for notifying a contract about an action in another contract.
 */
interface IxsListener {
    /**
     * @notice Called when an action is performed.
     * @param user The user that performed the action.
     * @param stake The new amount of tokens that the user has staked.
     */
    function registerUserAction(address user, uint256 stake) external;
}
