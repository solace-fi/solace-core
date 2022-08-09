// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./GaugeStructs.sol";

/**
 * @title GaugeController
 * @author solace.fi
 * @notice Stores individual votes for Solace Native gauges, and maintains current gauge weights.
 *
 * Current gauge weights can be obtained through [`getGaugeWeight()`](#getgaugeweight) and [`getAllGaugeWeights()`](#getallgaugeweights)
 *
 * Only governance can make mutator calls to GaugeController.sol. There are no unpermissioned external mutator calls in this contract.
 * 
 * After every epoch, governance must call [`updateGaugeWeights()`](#updategaugeweights). This will process the last epoch's votes (stored in this contract).
 * 
 * Individual voters register and manage their vote through voting contracts that conform to IGaugeVoting.
 *
 * Governance can [`addGauge()`](#addgauge) or [`pauseGauge()`](#pausegauge).
 */
interface IGaugeController {

    /***************************************
    CUSTOM ERRORS
    ***************************************/

    /// @notice Thrown when zero address is given as an argument.
    /// @param contractName Name of contract for which zero address was incorrectly provided.
    error ZeroAddressInput(string contractName);
    
    /// @notice Thrown when array arguments are mismatched in length;
    error ArrayArgumentsLengthMismatch();

    /// @notice Thrown if pauseGauge() is attempted on a gauge that is already paused.
    /// @param gaugeID The gauge ID.
    error GaugeAlreadyPaused(uint256 gaugeID);

    /// @notice Thrown if unpauseGauge() is attempted on a gauge that is already paused.
    /// @param gaugeID The gauge ID.
    error GaugeAlreadyUnpaused(uint256 gaugeID);

    /// @notice Thrown if unpauseGauge() is attempted on gauge ID 0.
    error CannotUnpauseGaugeID0();

    /// @notice Thrown if vote() is attempted for gauge ID 0.
    error CannotVoteForGaugeID0();

    /// @notice Thrown if updateGaugeWeights() is called after gauge weights have been successfully updated in the current epoch.
    error GaugeWeightsAlreadyUpdated();

    /// @notice Thrown when vote attempted before gauge weights have been successfully updated for this epoch.
    error GaugeWeightsNotYetUpdated();

    /// @notice Thrown when vote() is called by an address not added as a voting contract.
    error NotVotingContract();

    /// @notice Thrown when removeVotingContract attempted for address that has not previously been added as a voting contract.
    error VotingContractNotAdded();

    /// @notice Thrown when vote() is called with gaugeID that does not exist.
    error GaugeIDNotExist();

    /// @notice Thrown when vote() is called with gaugeID that is paused.
    error GaugeIDPaused();

    /// @notice Thrown when getInsurancePremium() is called and there are no tokenholders added.
    error NoTokenholdersAdded();

    /// @notice Thrown when removeTokenholder() is attempted for an address not in the tokenholder set.
    error TokenholderNotPresent();

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

    /// @notice Emitted when leverage factor set.
    event LeverageFactorSet(uint256 indexed leverageFactor);

    /// @notice Emitted when rate on line for a gauge is set.
    event RateOnLineSet(uint256 indexed gaugeID, uint256 rateOnLine);

    /// @notice Emitted when address of underwriting equity token is set.
    event TokenSet(address indexed token);

    /// @notice Emitted when address added to tokenholder set.
    event TokenholderAdded(address indexed tokenholder);

    /// @notice Emitted when address removed from tokenholder set.
    event TokenholderRemoved(address indexed tokenholder);

    /// @notice Emitted when updateGaugeWeights() does an incomplete update, and run again until completion.
    event IncompleteGaugeUpdate();

    /// @notice Emitted when gauge weights are updated.
    event GaugeWeightsUpdated(uint256 indexed updateTime);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Underwriting equity token.
    function token() external view returns (address);

    /// @notice Insurance leverage factor.
    function leverageFactor() external view returns (uint256);

    /// @notice The total number of gauges that have been created.
    function totalGauges() external view returns (uint256);

    /// @notice End timestamp for last epoch that all stored votes were processed.
    function lastTimeGaugeWeightsUpdated() external view returns (uint256);

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch.
     * @return timestamp
     */
    function getEpochStartTimestamp() external view returns (uint256 timestamp);

    /**
     * @notice Get timestamp for end of the current epoch.
     * @return timestamp
     */
    function getEpochEndTimestamp() external view returns (uint256 timestamp);

    /**
     * @notice Get current gauge weight of single gauge ID.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight
     * @param gaugeID_ The ID of the gauge to query.
     * @return weight
     */
    function getGaugeWeight(uint256 gaugeID_) external view returns (uint256 weight);

    /**
     * @notice Get all gauge weights.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @dev weights[0] will always be 0, so that weights[1] maps to the weight of gaugeID 1.
     * @return weights
     */
    function getAllGaugeWeights() external view returns (uint256[] memory weights);

    /**
     * @notice Get number of active gauges.
     * @return numActiveGauges
     */
    function getNumActiveGauges() external view returns (uint256 numActiveGauges);

    /**
     * @notice Get number of paused gauges.
     * @return numPausedGauges
     */
    function getNumPausedGauges() external view returns (uint256 numPausedGauges);
    
    /**
     * @notice Get gauge name.
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
     * @return rateOnLine_ Annual rate on line, 1e18 => 100%.
     */
    function getRateOnLineOfGauge(uint256 gaugeID_) external view returns (uint256 rateOnLine_);

    /**
     * @notice Obtain insurance capacity in $UWE terms.
     * @dev Leverage * UWE capacity.
     * @return insuranceCapacity Insurance capacity in $UWE.
     */
    function getInsuranceCapacity() external view returns (uint256 insuranceCapacity);

    /**
     * @notice Get vote power sum across all gauges.
     * @return votePowerSum
     */
    function getVotePowerSum() external view returns (uint256 votePowerSum);

    /**
     * @notice Get all votes for a given voter and voting contract.
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @param voter_ Address of voter.
     * @return votes Array of Vote {gaugeID, votePowerBPS}.
     */
    function getVotes(address votingContract_, address voter_) external view returns (GaugeStructs.Vote[] memory votes);

    /**
     * @notice Get all voters for a given voting contract.
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @return voters Array of voters
     */
    function getVoters(address votingContract_) external view returns (address[] memory voters);

    /**
     * @notice Get number of votes for a given voter and voting contract.
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @param voter_ Address of voter.
     * @return voteCount Number of votes.
     */
    function getVoteCount(address votingContract_, address voter_) external view returns (uint256 voteCount);

    /**
     * @notice Get number of voters for a voting contract.
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @return votersCount Number of votes.
     */
    function getVotersCount(address votingContract_) external view returns (uint256 votersCount);
    
    /***************************************
    VOTING CONTRACT FUNCTIONS
    ***************************************/

    /**
     * @notice Register votes.
     * @dev Can only be called by voting contracts that have been added via addVotingContract().
     * @param voter_ Address of voter.
     * @param gaugeID_ The ID of the voted gauge.
     * @param newVotePowerBPS_ Desired vote power BPS, 0 if removing vote.
     * @return oldVotePowerBPS Old votePowerBPS value, 0 if new vote.
     */
    function vote(address voter_, uint256 gaugeID_, uint256 newVotePowerBPS_) external returns (uint256 oldVotePowerBPS);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a voting contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract_ The votingContract to add.
     */
    function addVotingContract(address votingContract_) external;

    /**
     * @notice Removes a voting contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract_ The votingContract to add.
     */
    function removeVotingContract(address votingContract_) external;

    /**
     * @notice Adds an insurance gauge.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeName_ Gauge name
     * @param rateOnLine_ Annual rate on line (1e18 => 100%).
     */
    function addGauge(string calldata gaugeName_, uint256 rateOnLine_) external;

    /**
     * @notice Pauses an insurance gauge.
     * @notice Paused gauges cannot have votes added or modified, and votes for a paused gauge will not be counted
     * in the next updateGaugeWeights() call.
     * @dev We do not include a removeGauge function as this would distort the order of the _gauges array
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeID_ ID of gauge to pause
     */
    function pauseGauge(uint256 gaugeID_) external;

    /**
     * @notice Unpauses an insurance gauge.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeID_ ID of gauge to pause
     */
    function unpauseGauge(uint256 gaugeID_) external;

    /**
     * @notice Set insurance leverage factor.
     * @dev 1e18 => 100%.
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
     * @notice Adds address to tokenholders set - these addresses will be queried for $UWE token balance and summed to determine the Solace Native insurance capacity.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokenholder_ Address of new tokenholder
     */
    function addTokenholder(address tokenholder_) external;

    /**
     * @notice Removes an address from the tokenholder set - these addresses will be queried for $UWE token balance and summed to determine the Solace Native insurance capacity.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokenholder_ Address of new tokenholder.
     */
    function removeTokenholder(address tokenholder_) external;
    
    /**
     * @notice Set annual rate-on-line for selected gaugeIDs
     * @dev 1e18 => 100%
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeIDs_ Array of gaugeIDs.
     * @param rateOnLines_ Array of corresponding annual rate on lines.
     */
    function setRateOnLine(uint256[] calldata gaugeIDs_, uint256[] calldata rateOnLines_) external;

    /**
     * @notice Updates gauge weights by processing votes for the last epoch.
     * @dev Designed to be called in a while-loop with custom gas limit of 6M until `lastTimePremiumsCharged == epochStartTimestamp`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function updateGaugeWeights() external;
}
