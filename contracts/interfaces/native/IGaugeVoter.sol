// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IGaugeVoter
 * @author solace.fi
 * @dev Could include other vote-related methods in UnderwritingLockVoting.sol, however only the bottom two are directly involved in the GaugeController pulling regular up-to-date vote information from UnderwritingLockVoting.sol. We do not want to prematurely restrict future Voting contracts to a rigid set of voting function signatures.
 * @notice A standard interface for a contract that registers and collect vote data on behalf of GaugeController.sol
 */
interface IGaugeVoter {
    /**
     * @notice Set last recorded vote power for a vote ID.
     * @dev Can only be called by the gaugeController contract.
     * @dev For chargePremiums() calculations.
     * @param voteID_ The ID of the vote to query.
     * @param votePower_ Vote power
     */
    function setLastProcessedVotePower(uint256 voteID_, uint256 votePower_) external;

    /**
     * @notice Get vote power (for the current epoch) for a voteID.
     * @param voteID_ The ID of the vote to query.
     * @return votePower
     */
    function getVotePower(uint256 voteID_) external view returns (uint256 votePower);
}
