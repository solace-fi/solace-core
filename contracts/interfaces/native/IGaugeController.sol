// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IGaugeController
 * @author solace.fi
 * @notice Maintains list (historical and current) Solace Native insurance gauges and corresponding weights. 
 * 
 * Current gauge weights can be obtained through [`getGaugeWeight()`](#getgaugeweight) and [`getAllGaugeWeights()`](#getallgaugeweights)
 *
 * Only governance can make mutator calls to GaugeController.sol. There are no unpermission external mutator calls in this contract.
 * 
 * After every epoch, governance must call [`updateGaugeWeights()`](#updategaugeweights) to get voting data from Voting contracts (contracts that conform to interface defined by IGaugeVoter.sol).
 * Individual voters register and manage their vote through Voting contracts.
 *
 * Governance can [`addGauge()`](#addgauge) or [`pauseGauge()`](#pausegauge).
 */
contract IGaugeController {

    /***************************************
    STRUCTS
    ***************************************/

    struct Gauge { 
        string name;
        bool active;
    }

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a voting contract is added.
    event VotingContractAdded(address indexed votingContractAddress);

    /// @notice Emitted when a voting contract is removed.
    event VotingContractRemoved(address indexed votingContractAddress);

    /// @notice Emitted when a gauge is added.
    event GaugeAdded(uint256 indexed gaugeID, string gaugeName);

    /// @notice Emitted when a gauge is paused.
    event GaugePaused(uint256 indexed gaugeID, string gaugeName);

    /// @notice Emitted when a gauge is unpaused.
    event GaugeUnpaused(uint256 indexed gaugeID, string gaugeName);

    /// @notice Emitted when gauge weights are updated.
    event GaugeWeightsUpdated(uint256 indexed updateTime);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice The total number of gauges that have been created
    function n_gauges() external view returns (address);

    /// @notice Timestamp of last epoch start (rounded to weeks) that gauge weights were successfully updated.
    function lastTimeGaugeWeightUpdated() external view returns (address);

    function WEEK() external view returns (uint256);

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch
     * @return timestamp
     */
    function getEpochStartTimestamp() external view returns (uint256 timestamp);

    /**
     * @notice Get timestamp for end of the current epoch
     * @return timestamp
     */
    function getEpochEndTimestamp() external view returns (uint256 timestamp);

    /**
     * @notice Get current gauge weight of single gauge ID
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight
     * @param gaugeID The ID of the gauge to query.
     * @return weight
     */
    function getGaugeWeight(gaugeID) external view returns (uint256 weight);
    /**
     * @notice Get all gauge weights.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @return weights[].
     * @dev weights[0] will always be 0, so that weights[1] maps to the weight of gaugeID 1.
     */
    function getAllGaugeWeight() external view returns (uint256 weights[]);

    /**
     * @notice Get number of active gauges
     * @return numActiveGauges
     */
    function getNumActiveGauges() external view returns (uint256 numActiveGauges);

    /**
     * @notice Get number of paused gauges
     * @return numPausedGauges
     */
    function getNumPausedGauges() external view returns (uint256 numPausedGauges);
    /**
     * @notice Get gauge name
     * @param gaugeID The ID of the gauge to query.
     * @return gaugeName
     */
    function getGaugeName(gaugeID) external view returns (string gaugeName);

    /**
     * @notice Query whether gauge is active.
     * @param gaugeID The ID of the gauge to query.
     * @return gaugeActive True if active, false otherwise.
     */
    function isGaugeActive(gaugeID) external view returns (bool gaugeActive);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a voting contract
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract The votingContract to add.
     */
    function addVotingContract(address votingContract) external;

    /**
     * @notice Removes a voting contract
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract The votingContract to add.
     */
    function removeVotingContract(address votingContract) external;

    /**
     * @notice Adds an insurance gauge
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeName Gauge name
     */
    function addGauge(string gaugeName) external;

    /**
     * @notice Pauses an insurance gauge
     * @dev We do not include a removeGauge function as this would involve re-organising the entire historical data of gauge votes, and can easily lead to confusion if gaugeID 2 in the past is not the same as gaugeID 2 currently.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * If a gaugeID is paused, it means that vote data for that gauge will no longer be collected on future [`updateGaugeWeights()`](#updategaugeweights) calls.
     * It does not mean that users can no longer vote for their gauge, it just means that their vote for that gauge will no longer count for gauge weights (however they will still be charged for that vote. It is the responsibility of the voter to ensure they are voting for a valid gauge).
     * @param gaugeID ID of gauge to pause
     */
    function pauseGauge(uint256 gaugeID) external;

    /**
     * @notice Unpauses an insurance gauge
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeID ID of gauge to pause
     */
    function unpauseGauge(uint256 gaugeID) external;

    /**
     * @notice Updates gauge weights by getting current vote data from Voting contracts.
     * @dev Can only be called once per epoch.
     * @dev Requires all Voting contracts to had votes processed for this epoch
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function updateGaugeWeights() external;
}
