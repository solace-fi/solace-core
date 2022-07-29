// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./../utils/Governable.sol";
import "./../interfaces/native/IGaugeVoter.sol";
import "./../interfaces/native/IGaugeController.sol";

// TODO

/**
 * @title GaugeController
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
// solhint-disable-next-line contract-name-camelcase
contract GaugeController is 
        IGaugeController, 
        ReentrancyGuard, 
        Governable 
    {
    using EnumerableSet for EnumerableSet.AddressSet;

    /***************************************
    GLOBAL PUBLIC VARIABLES
    ***************************************/

    /// @notice Underwriting equity token
    address public override token;

    /// @notice Insurance leverage factor
    /// @dev 1e18 => 100%.
    uint256 public override leverageFactor;

    /// @notice The total number of gauges that have been created
    uint256 public override totalGauges;
    
    /// @notice Timestamp of last epoch start (rounded to weeks) that gauge weights were successfully updated.
    uint256 public override lastTimeGaugeWeightUpdated;

    uint256 constant public override WEEK = 604800;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    /// @notice The total number of paused gauges
    uint256 internal pausedGaugesCount;

    /// @notice Epoch start timestamp (rounded to weeks) => gaugeID => total vote power
    /// @dev The same data structure exists in UnderwritingLockVoting.sol. If there is only the single IGaugeVoting contract (UnderwritingLockVoting.sol), then this data structure will be a deep copy. If there is more than one IGaugeVoting contract, this data structure will be the merged deep copies of `_votePowerOfGaugeForEpoch` in the IGaugeVoting contracts.   
    mapping(uint256 => mapping(uint256 => uint256)) internal _votePowerOfGaugeForEpoch;

    // Set of voting contracts conforming to IGaugeVoting.sol interface. Sources of aggregated voting data.
    EnumerableSet.AddressSet internal _votingContracts;

    /// @notice Array of Gauge {string name, bool active}
    Gauge[] internal _gauges;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Construct the UnderwritingLocker contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     */
    constructor(address governance_)
        Governable(governance_)
    {
        Gauge memory newGauge = Gauge("", false, 0); // Pre-fill slot 0 of _gauges, ensure gaugeID 1 maps to _gauges[1]
        _gauges.push(newGauge); 
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch
     * @return timestamp
     */
    function _getEpochStartTimestamp() internal view returns (uint256 timestamp) {
        return ( (block.timestamp * WEEK) / WEEK );
    }

    /**
     * @notice Get timestamp for end of the current epoch
     * @return timestamp
     */
    function _getEpochEndTimestamp() internal view returns (uint256 timestamp) {
        return ( (block.timestamp * WEEK) / WEEK ) + 1;
    }

    /**
     * @notice Get vote power sum for all gauges
     * @return votePowerSum
     */
    function _getVotePowerSum() internal view returns (uint256 votePowerSum) {
        for(uint256 i = 1; i < totalGauges + 1; i++) {
            if (_gauges[i].active) {
                votePowerSum += _votePowerOfGaugeForEpoch[lastTimeGaugeWeightUpdated][i];
            }
        }
    }

    /**
     * @notice Get current gauge weight of single gauge ID
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight
     * @param gaugeID_ The ID of the gauge to query.
     * @return weight
     */
    function _getGaugeWeight(uint256 gaugeID_) internal view returns (uint256 weight) {
        uint256 votePowerSum = _getVotePowerSum();
        return 1e18 * _votePowerOfGaugeForEpoch[lastTimeGaugeWeightUpdated][gaugeID_] / votePowerSum;
    }

    /**
     * @notice Get all gauge weights.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @return weights
     * @dev weights[0] will always be 0, so that weights[1] maps to the weight of gaugeID 1.
     */
    function _getAllGaugeWeights() internal view returns (uint256[] memory weights) {
        weights = new uint[](totalGauges + 1);
        weights[0] = 0;
        uint256 votePowerSum = _getVotePowerSum();

        for(uint256 i = 1; i < totalGauges + 1; i++) {
            if (_gauges[i].active) {
                weights[i] = (1e18 * _votePowerOfGaugeForEpoch[lastTimeGaugeWeightUpdated][i] / votePowerSum);
            } else {
                weights[i] = 0;
            }
        }

        return weights;
    }

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch
     * @return timestamp
     */
    function getEpochStartTimestamp() external view override returns (uint256 timestamp) {
        return _getEpochStartTimestamp();
    }

    /**
     * @notice Get timestamp for end of the current epoch
     * @return timestamp
     */
    function getEpochEndTimestamp() external view override returns (uint256 timestamp) {
        return _getEpochEndTimestamp();
    }

    /**
     * @notice Get current gauge weight of single gauge ID
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight
     * @param gaugeID_ The ID of the gauge to query.
     * @return weight
     */
    function getGaugeWeight(uint256 gaugeID_) external view override returns (uint256 weight) {
        return _getGaugeWeight(gaugeID_);
    }

    /**
     * @notice Get all gauge weights.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @return weights
     * @dev weights[0] will always be 0, so that weights[1] maps to the weight of gaugeID 1.
     */
    function getAllGaugeWeight() external view override returns (uint256[] memory weights) {
        return _getAllGaugeWeights();
    }

    /**
     * @notice Get number of active gauges
     * @return numActiveGauges
     */
    function getNumActiveGauges() external view override returns (uint256 numActiveGauges) {
        return (totalGauges - pausedGaugesCount);
    }

    /**
     * @notice Get number of paused gauges
     * @return numPausedGauges
     */
    function getNumPausedGauges() external view override returns (uint256 numPausedGauges) {
        return pausedGaugesCount;
    }

    /**
     * @notice Get gauge name
     * @param gaugeID_ The ID of the gauge to query.
     * @return gaugeName
     */
    function getGaugeName(uint256 gaugeID_) external view override returns (string memory gaugeName) {
        return _gauges[gaugeID_].name;
    }

    /**
     * @notice Query whether gauge is active.
     * @param gaugeID_ The ID of the gauge to query.
     * @return gaugeActive True if active, false otherwise.
     */
    function isGaugeActive(uint256 gaugeID_) external view override returns (bool gaugeActive) {
        return _gauges[gaugeID_].active;
    }

    /**
     * @notice Obtain rate on line of gauge.
     * @param gaugeID_ The ID of the gauge to query.
     * @return rateOnLine_ Rate on line, 1e18 => 100%.
     */
    function getRateOnLineOfGauge(uint256 gaugeID_) external view override returns (uint256 rateOnLine_) {
        return _gauges[gaugeID_].rateOnLine;
    }

    /**
     * @notice Obtain insurance capacity in $UWE terms.
     * @dev Leverage * UWE capacity
     * @return insuranceCapacity Insurance capacity in $UWE.
     */
    function getInsuranceCapacity() external view override returns (uint256 insuranceCapacity) {
        return (insuranceCapacity * IERC20(token).totalSupply() / 1e18);
    }

    /**
     * @notice Get vote power sum for all gauges
     * @return votePowerSum
     */
    function getVotePowerSum() external view override returns (uint256 votePowerSum) {
        return _getVotePowerSum();
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a voting contract
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract_ The votingContract to add.
     */
    function addVotingContract(address votingContract_) external override onlyGovernance {
        _votingContracts.add(votingContract_);
        emit VotingContractAdded(votingContract_);
    }

    /**
     * @notice Removes a voting contract
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract_ The votingContract to add.
     */
    function removeVotingContract(address votingContract_) external override onlyGovernance {
        _votingContracts.remove(votingContract_);
        emit VotingContractRemoved(votingContract_);
    }

    /**
     * @notice Adds an insurance gauge
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeName_ Gauge name
     * @param rateOnLine_ Rate on line (1e18 => 100%).
     */
    function addGauge(string calldata gaugeName_, uint256 rateOnLine_) external override onlyGovernance {
        uint256 gaugeID = ++totalGauges;
        Gauge memory newGauge = Gauge(gaugeName_, true, rateOnLine_);
        _gauges.push(newGauge); 
        assert(_gauges.length == totalGauges); // Uphold invariant, should not be violated.
        emit GaugeAdded(gaugeID, gaugeName_);
    }

    /**
     * @notice Pauses an insurance gauge
     * @dev We do not include a removeGauge function as this would involve re-organising the entire historical data of gauge votes, and can easily lead to confusion if gaugeID 2 in the past is not the same as gaugeID 2 currently.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * If a gaugeID is paused, it means that vote data for that gauge will no longer be collected on future [`updateGaugeWeights()`](#updategaugeweights) calls.
     * It does not mean that users can no longer vote for their gauge, it just means that their vote for that gauge will no longer count for gauge weights (however they will still be charged for that vote. It is the responsibility of the voter to ensure they are voting for a valid gauge).
     * @param gaugeID_ ID of gauge to pause
     */
    function pauseGauge(uint256 gaugeID_) external override onlyGovernance {
        if(_gauges[gaugeID_].active == false) revert GaugeAlreadyPaused({gaugeID: gaugeID_});
        pausedGaugesCount += 1;
        _gauges[gaugeID_].active = false;
        emit GaugePaused(gaugeID_, _gauges[gaugeID_].name);
    }

    /**
     * @notice Unpauses an insurance gauge
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeID_ ID of gauge to pause
     */
    function unpauseGauge(uint256 gaugeID_) external override onlyGovernance {
        if(_gauges[gaugeID_].active == true) revert GaugeAlreadyUnpaused({gaugeID: gaugeID_});
        pausedGaugesCount -= 1;
        _gauges[gaugeID_].active = true;
        emit GaugeUnpaused(gaugeID_, _gauges[gaugeID_].name);
    }

    /**
     * @notice Updates gauge weights by getting current vote data from Voting contracts.
     * @dev Can only be called once per epoch.
     * @dev Requires all Voting contracts to had votes processed for this epoch
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function updateGaugeWeights() external override nonReentrant onlyGovernance {
        uint256 epochStartTime = _getEpochStartTimestamp();
        if (lastTimeGaugeWeightUpdated >= epochStartTime) revert GaugeWeightsAlreadyUpdated({epochTimestamp: epochStartTime});
        uint256 n_voting_contracts = _votingContracts.length();
        // Iterate through voting contracts
        for(uint256 i = 0; i < n_voting_contracts; i++) {
            require( IGaugeVoter(_votingContracts.at(i)).lastTimeAllVotesProcessed() == epochStartTime, "Voting contract not updated for this epoch");
            if( IGaugeVoter(_votingContracts.at(i)).lastTimeAllVotesProcessed() != epochStartTime) revert VotingContractNotUpdated(epochStartTime, _votingContracts.at(i));

            // Iterate through gaugeID, gaugeID start from 1
            for (uint256 j = 1; j < totalGauges + 1; j++) {
                if (_gauges[j].active) {
                    _votePowerOfGaugeForEpoch[epochStartTime][j] += IGaugeVoter(_votingContracts.at(i)).getVotePowerOfGaugeForEpoch(epochStartTime, j);
                }
            }
        }
        
        lastTimeGaugeWeightUpdated = epochStartTime;
        emit GaugeWeightsUpdated(epochStartTime);
    }

    /**
     * @notice Set insurance leverage factor.
     * @dev 1e18 => 100%
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param leverageFactor_ Desired leverage factor.
     */
    function setLeverageFactor(uint256 leverageFactor_) external override onlyGovernance {
        leverageFactor = leverageFactor_;
        emit LeverageFactorSet(leverageFactor_);
    }

    /**
     * @notice Set rate on line for selected gaugeIDs
     * @dev 1e18 => 100%
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeIDs_ Array of gaugeIDs.
     * @param rateOnLines_ Array of corresponding rate on line.
     */
    function setRateOnLine(uint256[] calldata gaugeIDs_, uint256[] calldata rateOnLines_) external override onlyGovernance {
        if (gaugeIDs_.length != rateOnLines_.length) revert ArrayArgumentsLengthMismatch();
        for (uint256 i = 0; i < gaugeIDs_.length; i++) {
            _gauges[gaugeIDs_[i]].rateOnLine = rateOnLines_[i];
            emit RateOnLineSet(gaugeIDs_[i], rateOnLines_[i]);
        }
    }
}
