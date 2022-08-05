// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

struct Vote {
    uint256 gaugeID;
    uint256 votePowerBPS;
}

/**
 * @title IGaugeVoter
 * @author solace.fi
 * @dev Could include other vote-related methods in UnderwritingLockVoting.sol, however only the bottom two are directly involved in the GaugeController pulling regular up-to-date vote information from UnderwritingLockVoting.sol. We do not want to prematurely restrict future Voting contracts to a rigid set of voting function signatures.
 * @notice A standard interface for a contract that registers and collect vote data on behalf of GaugeController.sol
 */
interface IGaugeVoter {
    /**
     * @notice Set last processed vote power for a vote ID.
     * @dev Can only be called by the gaugeController contract.
     * @dev For chargePremiums() calculations.
     * @param lockID_ The ID of the lock to set last processed vote power for.
     * @param gaugeID_ GaugeID of vote.
     * @param votePower_ Vote power.
     */
    function setLastProcessedVotePower(uint256 lockID_, uint256 gaugeID_, uint256 votePower_) external;

    /**
     * @notice Get vote power for a voter.
     * @param voter_ The address of the voter to query.
     * @return votePower
     */
    function getVotePowerOf(address voter_) external view returns (uint256 votePower);

}
