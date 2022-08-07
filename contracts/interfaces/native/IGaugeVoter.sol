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
     * @notice Get vote power for a voter.
     * @param voter_ The address of the voter to query.
     * @return votePower
     */
    function getVotePower(address voter_) external view returns (uint256 votePower);

    /**
     * @notice Cache last processed vote power for a vote ID.
     * @dev Can only be called by the gaugeController contract.
     * @dev For chargePremiums() calculations.
     * @param voter_ Address of voter.
     * @param votePower_ Vote power.
     */
    function cacheLastProcessedVotePower(address voter_, uint256 votePower_) external;
}
