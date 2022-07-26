// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
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
contract GaugeController is IGaugeController, ReentrancyGuard, Governable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice The total number of gauges that have been created
    uint256 public override n_gauges;
    
    /// @notice The total number of paused gauges
    uint256 internal _n_gauges_paused;

    /// @notice Timestamp of last epoch start (rounded to weeks) that gauge weights were successfully updated.
    uint256 public override lastTimeGaugeWeightUpdated;

    uint256 constant public override WEEK = 604800;

    /// @notice Epoch start timestamp (rounded to weeks) => gaugeID => total vote power
    /// @dev The same data structure exists in UnderwritingLockVoting.sol. If there is only the single IGaugeVoting contract (UnderwritingLockVoting.sol), then this data structure will be a deep copy. If there is more than one IGaugeVoting contract, this data structure will be the merged deep copies of `_votePowerOfGaugeForEpoch` in the IGaugeVoting contracts.   
    mapping(uint256 => mapping(uint256 => uint256)) internal _votePowerOfGaugeForEpoch;

    // Voting contracts conforming IGaugeVoting.sol interface. Source of aggregated voting data.
    EnumerableSet.AddressSet internal _votingContracts;

    /// @notice Array of gauges
    Gauge[] internal _gauges;

    /**
     * @notice Construct the UnderwritingLocker contract.
     * @dev Requires 'uwe' and 'revenueRouter' addresses to be set in the Registry.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     */
    constructor(address governance_)
        Governable(governance_)
    {
        // Fill slot 0 of gaugeNames array, so that gaugeNames[x] maps to name of gaugeID x instead of `x + 1` (we do not permit a gaugeId of 0)
        // Should we instead use a mapping?
        Gauge memory newGauge = Gauge("", false);
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
        for(uint256 i = 1; i < n_gauges + 1; i++) {
            if (_gauges[i].active) {
                votePowerSum += _votePowerOfGaugeForEpoch[lastTimeGaugeWeightUpdated][i];
            }
        }
    }

    /**
     * @notice Get current gauge weight of single gauge ID
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight
     * @param gaugeID The ID of the gauge to query.
     * @return weight
     */
    function _getGaugeWeight(uint256 gaugeID) internal view returns (uint256 weight) {
        uint256 votePowerSum = _getVotePowerSum();
        return 1e18 * _votePowerOfGaugeForEpoch[lastTimeGaugeWeightUpdated][gaugeID] / votePowerSum;
    }

    /**
     * @notice Get all gauge weights.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @return weights
     * @dev weights[0] will always be 0, so that weights[1] maps to the weight of gaugeID 1.
     */
    function _getAllGaugeWeights() internal view returns (uint256[] memory weights) {
        weights = new uint[](n_gauges + 1);
        weights[0] = 0;
        uint256 votePowerSum = _getVotePowerSum();

        for(uint256 i = 1; i < n_gauges + 1; i++) {
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
     * @param gaugeID The ID of the gauge to query.
     * @return weight
     */
    function getGaugeWeight(uint256 gaugeID) external view override returns (uint256 weight) {
        return _getGaugeWeight(gaugeID);
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
        return (n_gauges - _n_gauges_paused);
    }

    /**
     * @notice Get number of paused gauges
     * @return numPausedGauges
     */
    function getNumPausedGauges() external view override returns (uint256 numPausedGauges) {
        return _n_gauges_paused;
    }

    /**
     * @notice Get gauge name
     * @param gaugeID The ID of the gauge to query.
     * @return gaugeName
     */
    function getGaugeName(uint256 gaugeID) external view override returns (string memory gaugeName) {
        return _gauges[gaugeID].name;
    }

    /**
     * @notice Query whether gauge is active.
     * @param gaugeID The ID of the gauge to query.
     * @return gaugeActive True if active, false otherwise.
     */
    function isGaugeActive(uint256 gaugeID) external view override returns (bool gaugeActive) {
        return _gauges[gaugeID].active;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a voting contract
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract The votingContract to add.
     */
    function addVotingContract(address votingContract) external override onlyGovernance {
        _votingContracts.add(votingContract);
        emit VotingContractAdded(votingContract);
    }

    /**
     * @notice Removes a voting contract
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract The votingContract to add.
     */
    function removeVotingContract(address votingContract) external override onlyGovernance {
        _votingContracts.remove(votingContract);
        emit VotingContractRemoved(votingContract);
    }

    /**
     * @notice Adds an insurance gauge
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeName Gauge name
     */
    function addGauge(string calldata gaugeName) external override onlyGovernance {
        uint256 gaugeID = ++n_gauges;
        Gauge memory newGauge = Gauge(gaugeName, true);
        _gauges.push(newGauge); 
        assert(_gauges.length == n_gauges); // Uphold invariant, should not be violated.
        emit GaugeAdded(gaugeID, gaugeName);
    }

    /**
     * @notice Pauses an insurance gauge
     * @dev We do not include a removeGauge function as this would involve re-organising the entire historical data of gauge votes, and can easily lead to confusion if gaugeID 2 in the past is not the same as gaugeID 2 currently.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * If a gaugeID is paused, it means that vote data for that gauge will no longer be collected on future [`updateGaugeWeights()`](#updategaugeweights) calls.
     * It does not mean that users can no longer vote for their gauge, it just means that their vote for that gauge will no longer count for gauge weights (however they will still be charged for that vote. It is the responsibility of the voter to ensure they are voting for a valid gauge).
     * @param gaugeID ID of gauge to pause
     */
    function pauseGauge(uint256 gaugeID) external override onlyGovernance {
        if(_gauges[gaugeID].active == false) revert GaugeAlreadyPaused({gaugeID: gaugeID});
        _n_gauges_paused += 1;
        _gauges[gaugeID].active = false;
        emit GaugePaused(gaugeID, _gauges[gaugeID].name);
    }

    /**
     * @notice Unpauses an insurance gauge
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeID ID of gauge to pause
     */
    function unpauseGauge(uint256 gaugeID) external override onlyGovernance {
        if(_gauges[gaugeID].active == true) revert GaugeAlreadyUnpaused({gaugeID: gaugeID});
        _n_gauges_paused -= 1;
        _gauges[gaugeID].active = true;
        emit GaugeUnpaused(gaugeID, _gauges[gaugeID].name);
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
            for (uint256 j = 1; j < n_gauges + 1; j++) {
                if (_gauges[j].active) {
                    _votePowerOfGaugeForEpoch[epochStartTime][j] += IGaugeVoter(_votingContracts.at(i)).getVotePowerOfGaugeForEpoch(epochStartTime, j);
                }
            }
        }
        
        lastTimeGaugeWeightUpdated = epochStartTime;
        emit GaugeWeightsUpdated(epochStartTime);
    }
}
