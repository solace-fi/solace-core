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
     * @notice Obtain vote power sum for a gauge for a given epoch
     * @param epochStartTimestamp_ Start timestamp for epoch.
     * @param gaugeID_ Gauge ID to query.
     * @return votePower
     */
    function getVotePowerOfGaugeForEpoch(uint256 epochStartTimestamp_, uint256 gaugeID_) external view returns (uint256 votePower);

    /**
     * @notice Obtain end timestamp (rounded down to weeks) for the epoch most recently processed in full.
     * @return timestamp_
     */
    function lastTimeAllVotesProcessed() external view returns (uint256 timestamp_);
}
