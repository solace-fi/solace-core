// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IVoteListener
 * @author solace.fi
 * @notice A standard interface for notifying a contract about votes made via UnderwritingLockVoting.sol.
 */
interface IVoteListener {
    /**
     * @notice Called when vote is made (hook called at the end of vote function logic).
     * @param voter_ The voter address.
     * @param gaugeID_ The gaugeID to vote for.
     * @param votePowerBPS_ votePowerBPS value. Can be from 0-10000.
     */
    function receiveVoteNotification(address voter_, uint256 gaugeID_, uint256 votePowerBPS_) external;
}