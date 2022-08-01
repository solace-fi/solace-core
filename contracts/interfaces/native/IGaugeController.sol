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
interface IGaugeController {

    /***************************************
    STRUCTS
    ***************************************/

    struct Gauge { 
        bool active; // [0:8]
        uint248 rateOnLine; // [8:256] Max value we reasonably expect is ~20% or 2e17. We only need log 2 2e17 = ~58 bits for this.
        string name;
    }

    /***************************************
    CUSTOM ERRORS
    ***************************************/

    /**
     * @notice Thrown if pauseGauge() is attempted on a gauge that is already paused.
     * @param gaugeID The gauge ID.
     */
    error GaugeAlreadyPaused(uint256 gaugeID);

    /**
     * @notice Thrown if unpauseGauge() is attempted on a gauge that is already paused.
     * @param gaugeID The gauge ID.
     */
    error GaugeAlreadyUnpaused(uint256 gaugeID);

    /**
     * @notice Thrown if updateGaugeWeights() is called after gauge weights have been successfully updated in the current epoch.
     */
    error GaugeWeightsAlreadyUpdated();

    /// @notice Thrown when vote attempted before gauge weights have been successfully updated for this epoch.
    error GaugeWeightsNotYetUpdated();

    /// @notice Thrown when array arguments are mismatched in length (and need to have the same length);
    error ArrayArgumentsLengthMismatch();

    /// @notice Thrown when vote() is called by an address not listed as a voting contract;
    error NotVotingContract();

    /// @notice Thrown when vote() is called with gaugeID that does not exist.
    error VotedGaugeIDNotExist();

    /// @notice Thrown when vote() is called with gaugeID that is paused.
    error VotedGaugeIDPaused();

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a voting contract is added.
    event VotingContractAdded(address indexed votingContractAddress);

    /// @notice Emitted when a voting contract is removed.
    event VotingContractRemoved(address indexed votingContractAddress);

    /// @notice Emitted when a gauge is added.
    event GaugeAdded(uint256 indexed gaugeID, uint256 rateOnLine, string gaugeName);

    /// @notice Emitted when a gauge is paused.
    event GaugePaused(uint256 indexed gaugeID, string gaugeName);

    /// @notice Emitted when a gauge is unpaused.
    event GaugeUnpaused(uint256 indexed gaugeID, string gaugeName);

    /// @notice Emitted when gauge weights are updated.
    event GaugeWeightsUpdated(uint256 indexed updateTime);

    /// @notice Emitted when leverage factor set;
    event LeverageFactorSet(uint256 indexed leverageFactor);

    /// @notice Emitted when rate on line for a gauge is set.
    event RateOnLineSet(uint256 indexed gaugeID, uint256 rateOnLine);

    /// @notice Emitted when address of underwriting equity token is set.
    event TokenSet(address indexed token);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Underwriting equity token
    function token() external view returns (address);

    /// @notice Insurance leverage factor
    function leverageFactor() external view returns (uint256);

    /// @notice The total number of gauges that have been created
    function totalGauges() external view returns (uint256);

    /// @notice Timestamp of last epoch start (rounded to weeks) that gauge weights were successfully updated.
    function lastTimeGaugeWeightsUpdated() external view returns (uint256);

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
     * @param gaugeID_ The ID of the gauge to query.
     * @return weight
     */
    function getGaugeWeight(uint256 gaugeID_) external view returns (uint256 weight);

    /**
     * @notice Get all gauge weights.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @return weights
     * @dev weights[0] will always be 0, so that weights[1] maps to the weight of gaugeID 1.
     */
    function getAllGaugeWeight() external view returns (uint256[] memory weights);

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
     * @param gaugeID_ The ID of the gauge to query.
     * @return gaugeName
     */
    function getGaugeName(uint256 gaugeID_) external view returns (string calldata gaugeName);

    /**
     * @notice Query whether gauge is active.
     * @param gaugeID_ The ID of the gauge to query.
     * @return gaugeActive True if active, false otherwise.
     */
    function isGaugeActive(uint256 gaugeID_) external view returns (bool gaugeActive);

    /**
     * @notice Obtain rate on line of gauge.
     * @param gaugeID_ The ID of the gauge to query.
     * @return rateOnLine_ Rate on line, 1e18 => 100%.
     */
    function getRateOnLineOfGauge(uint256 gaugeID_) external view returns (uint256 rateOnLine_);

    /**
     * @notice Obtain insurance capacity in $UWE terms.
     * @dev Leverage * UWE capacity
     * @return insuranceCapacity Insurance capacity in $UWE.
     */
    function getInsuranceCapacity() external view returns (uint256 insuranceCapacity);

    /**
     * @notice Get vote power sum for all gauges
     * @return votePowerSum
     */
    function getVotePowerSum() external view returns (uint256 votePowerSum);

    /**
     * @notice Register votes.
     * @dev Can only be called by voting contracts that have been added via addVotingContract().
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @param voteID_ Unique identifier for vote.
     * @return gaugeID The ID of the voted gauge.
     */
    function getVote(address votingContract_, uint256 voteID_) external view returns (uint256 gaugeID);

    /***************************************
    VOTING CONTRACT FUNCTIONS
    ***************************************/

    /**
     * @notice Register votes.
     * @dev Can only be called by voting contracts that have been added via addVotingContract().
     * @dev Leave responsibility of emitting Event to the VotingContract.
     * @param voteID_ Unique identifier for vote.
     * @param gaugeID_ The ID of the voted gauge.
     */
    function vote(uint256 voteID_, uint256 gaugeID_) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a voting contract
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract_ The votingContract to add.
     */
    function addVotingContract(address votingContract_) external;

    /**
     * @notice Removes a voting contract
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract_ The votingContract to add.
     */
    function removeVotingContract(address votingContract_) external;

    /**
     * @notice Adds an insurance gauge
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeName_ Gauge name
     * @param rateOnLine_ Rate on line (1e18 => 100%).
     */
    function addGauge(string calldata gaugeName_, uint256 rateOnLine_) external;

    /**
     * @notice Pauses an insurance gauge
     * @dev We do not include a removeGauge function as this would involve re-organising the entire historical data of gauge votes, and can easily lead to confusion if gaugeID 2 in the past is not the same as gaugeID 2 currently.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * If a gaugeID is paused, it means that vote data for that gauge will no longer be collected on future [`updateGaugeWeights()`](#updategaugeweights) calls.
     * It does not mean that users can no longer vote for their gauge, it just means that their vote for that gauge will no longer count for gauge weights (however they will still be charged for that vote. It is the responsibility of the voter to ensure they are voting for a valid gauge).
     * @param gaugeID_ ID of gauge to pause
     */
    function pauseGauge(uint256 gaugeID_) external;

    /**
     * @notice Unpauses an insurance gauge
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeID_ ID of gauge to pause
     */
    function unpauseGauge(uint256 gaugeID_) external;

    /**
     * @notice Updates gauge weights by getting current vote data from Voting contracts.
     * @dev Can only be called once per epoch.
     * @dev Requires all Voting contracts to had votes processed for this epoch
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function updateGaugeWeights() external;

    /**
     * @notice Set insurance leverage factor.
     * @dev 1e18 => 100%
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param leverageFactor_ Desired leverage factor.
     */
    function setLeverageFactor(uint256 leverageFactor_) external;

    /**
     * @notice Set underwriting token address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param token_ The address of the new underwriting token.
     */
    function setToken(address token_) external;

    /**
     * @notice Set rate on line for selected gaugeIDs
     * @dev 1e18 => 100%
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeIDs_ Array of gaugeIDs.
     * @param rateOnLines_ Array of corresponding rate on line.
     */
    function setRateOnLine(uint256[] calldata gaugeIDs_, uint256[] calldata rateOnLines_) external;
}
