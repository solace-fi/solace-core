// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./../utils/Governable.sol";
import "./../interfaces/native/IGaugeVoter.sol";
import "./../interfaces/native/IGaugeController.sol";
import "hardhat/console.sol";

// TODO
// @dev how to require interface when adding voting contract?

/**
 * @title GaugeController
 * @author solace.fi
 * @notice Maintains list (historical and current) Solace Native insurance gauges and corresponding weights. Also stores individual votes.
 * 
 * Current gauge weights can be obtained through [`getGaugeWeight()`](#getgaugeweight) and [`getAllGaugeWeights()`](#getallgaugeweights)
 *
 * Only governance can make mutator calls to GaugeController.sol. There are no unpermissioned external mutator calls in this contract.
 * 
 * After every epoch, governance must call [`updateGaugeWeights()`](#updategaugeweights). This will process the last epoch's votes (stored in this contract), and will pass information required for premium charges to the VotingContract via IGaugeVoter.setLastProcessedVotePower()
 * 
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
    using EnumerableMap for EnumerableMap.UintToUintMap;

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
    uint256 public override lastTimeGaugeWeightsUpdated;

    uint256 constant public override WEEK = 604800;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    /// @notice The total number of paused gauges
    uint256 internal _pausedGaugesCount;

    /// @notice Epoch start timestamp (rounded to weeks) => gaugeID => total vote power
    /// @dev The same data structure exists in UnderwritingLockVoting.sol. If there is only the single IGaugeVoting contract (UnderwritingLockVoting.sol), then this data structure will be a deep copy. If there is more than one IGaugeVoting contract, this data structure will be the merged deep copies of `_votePowerOfGaugeForEpoch` in the IGaugeVoting contracts.   
    mapping(uint256 => mapping(uint256 => uint256)) internal _votePowerOfGaugeForEpoch;

    /// @notice Array of Gauge {string name, bool active}
    Gauge[] internal _gauges;

    /// @notice Set of voting contracts conforming to IGaugeVoting.sol interface. Sources of aggregated voting data.
    EnumerableSet.AddressSet internal _votingContracts;

    /// @notice Set of addresses from which getInsuranceCapacity() will tally UWE supply from.
    EnumerableSet.AddressSet internal _tokenholders;

    /// @notice votingContract address => voteID => gaugeID of vote
    /// @dev voteID is the unique identifier for each individual vote. In the case of UnderwritingLockVoting.sol, lockID = voteID.
    mapping(address => EnumerableMap.UintToUintMap) internal _votes;

    /// @notice Dynamic array of dead voteIDs to remove from _votes EnumerableMap.
    /// @dev Unfortunately Solidity doesn't allow dynamic arrays in memory, and I don't see a space-efficient way of creating a fixed-length array for this problem.
    uint256[] internal voteIDsToRemove;

    UpdateInfo internal _updateInfo;

    /***************************************
    STRUCTS
    ***************************************/

    /// @dev Struct pack into single 32-byte word
    /// @param finishedLastUpdate True if last call to updateGaugeWeights() resulted in complete update, false otherwise.
    /// @param savedIndexOfVotingContracts Index for _votingContracts for last incomplete updateGaugeWeights() call.
    /// @param savedIndexOfVotesIndex Index for _votes[_updateInfo.saved_index_votingContracts] for last incomplete updateGaugeWeights() call.
    struct UpdateInfo {
        bool finishedLastUpdate; // bool stored in 8 bits [0:8]
        uint120 savedIndexOfVotingContracts; // uint248 stored in [8:128]
        uint120 savedIndexOfVotesIndex; // uint248 stored in [128:248]
    }

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Construct the UnderwritingLocker contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param token_ The address of the underwriting equity token.
     */
    constructor(address governance_, address token_)
        Governable(governance_)
    {
        if (token_ == address(0x0)) revert ZeroAddressInput("token");
        token = token_;
        leverageFactor = 1e18; // Default 1x leverage factor
        Gauge memory newGauge = Gauge(false, 0, ""); // Pre-fill slot 0 of _gauges, ensure gaugeID 1 maps to _gauges[1]
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
        return ( (block.timestamp / WEEK) * WEEK );
    }

    /**
     * @notice Get timestamp for end of the current epoch
     * @return timestamp
     */
    function _getEpochEndTimestamp() internal view returns (uint256 timestamp) {
        return ( (block.timestamp / WEEK) * WEEK ) + WEEK;
    }

    /**
     * @notice Get vote power sum for all gauges
     * @return votePowerSum
     */
    function _getVotePowerSum() internal view returns (uint256 votePowerSum) {
        for(uint256 i = 1; i < totalGauges + 1; i++) {
            if (_gauges[i].active) {
                votePowerSum += _votePowerOfGaugeForEpoch[lastTimeGaugeWeightsUpdated][i];
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
        if (votePowerSum == 0) {return 0;} // Avoid divide by 0 error
        else {return 1e18 * _votePowerOfGaugeForEpoch[lastTimeGaugeWeightsUpdated][gaugeID_] / votePowerSum;}
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
                weights[i] = (1e18 * _votePowerOfGaugeForEpoch[lastTimeGaugeWeightsUpdated][i] / votePowerSum);
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
    function getAllGaugeWeights() external view override returns (uint256[] memory weights) {
        return _getAllGaugeWeights();
    }

    /**
     * @notice Get number of active gauges
     * @return numActiveGauges
     */
    function getNumActiveGauges() external view override returns (uint256 numActiveGauges) {
        return (totalGauges - _pausedGaugesCount);
    }

    /**
     * @notice Get number of paused gauges
     * @return numPausedGauges
     */
    function getNumPausedGauges() external view override returns (uint256 numPausedGauges) {
        return _pausedGaugesCount;
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
        uint256 tokenBalance;
        for (uint256 i = 0; i < _tokenholders.length(); i++) {
            tokenBalance += IERC20(token).balanceOf(_tokenholders.at(i));
        }
        return (leverageFactor * tokenBalance / 1e18);
    }

    /**
     * @notice Get vote power sum for all gauges
     * @return votePowerSum
     */
    function getVotePowerSum() external view override returns (uint256 votePowerSum) {
        return _getVotePowerSum();
    }

    /**
     * @notice Get individual vote.
     * @dev Can only be called by voting contracts that have been added via addVotingContract().
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @param voteID_ Unique identifier for vote.
     * @return gaugeID The ID of the voted gauge.
     */
    function getVote(address votingContract_, uint256 voteID_) external view override returns (uint256 gaugeID) {
        if (!_votingContracts.contains(votingContract_)) {revert NotVotingContract();}
        return _votes[votingContract_].get(voteID_, "VoteNotFound");
    }

    /***************************************
    VOTING CONTRACT FUNCTIONS
    ***************************************/

    /**
     * @notice Register votes.
     * @dev Can only be called by voting contracts that have been added via addVotingContract().
     * @param voteID_ Unique identifier for vote.
     * @param gaugeID_ The ID of the voted gauge.
     */
    function vote(uint256 voteID_, uint256 gaugeID_) external override {
        if (gaugeID_ == 0) revert CannotVoteForGaugeID0();
        if (_getEpochStartTimestamp() != lastTimeGaugeWeightsUpdated) revert GaugeWeightsNotYetUpdated();
        if (!_votingContracts.contains(msg.sender)) revert NotVotingContract();
        if (gaugeID_ + 1 > _gauges.length) revert VotedGaugeIDNotExist();
        if (!_gauges[gaugeID_].active) revert VotedGaugeIDPaused();
        _votes[msg.sender].set(voteID_, gaugeID_);
        // Leave responsibility of emitting event to the VotingContract.
    }

    /**
     * @notice Remove vote.
     * @dev Can only be called by voting contracts that have been added via addVotingContract().
     * @param voteID_ Unique identifier for vote.
     */
    function removeVote(uint256 voteID_) external override {
        if (!_votingContracts.contains(msg.sender)) {revert NotVotingContract();}
        // Test - can you remove a non-existent voteID_ without issue?
        _votes[msg.sender].remove(voteID_);
        // Leave responsibility of emitting event to the VotingContract.
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
        Gauge memory newGauge = Gauge(true, SafeCast.toUint248(rateOnLine_), gaugeName_);
        _gauges.push(newGauge); 
        assert(_gauges.length - 1 == totalGauges); // Uphold invariant, should not be violated. -1 because we already added _gauges[0] in constructor.
        emit GaugeAdded(gaugeID, rateOnLine_, gaugeName_);
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
        _pausedGaugesCount += 1;
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
        if(gaugeID_ == 0) revert CannotUnpauseGaugeID0(); // We do not permit gaugeID 0 to be active, and hence do not permit anyone to vote for it.
        _pausedGaugesCount -= 1;
        _gauges[gaugeID_].active = true;
        emit GaugeUnpaused(gaugeID_, _gauges[gaugeID_].name);
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
     * @notice Set underwriting token address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param token_ The address of the new underwriting token.
     */
    function setToken(address token_) external override onlyGovernance {
        token = token_;
        emit TokenSet(token_);
    }

    /**
     * @notice Adds an address to set of tokenholders, whose token balances will be queried and summed to determine insurance capacity.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokenholder_ Address of new tokenholder.
     */
    function addTokenholder(address tokenholder_) external override onlyGovernance {
        _tokenholders.add(tokenholder_);
        emit TokenholderAdded(tokenholder_);
    }

    /**
     * @notice Removes an address to set of tokenholders, whose token balances will be queried and summed to determine insurance capacity.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokenholder_ Address of new tokenholder.
     */
    function removeTokenholder(address tokenholder_) external override onlyGovernance {
        bool success = _tokenholders.remove(tokenholder_);
        if (!success) revert TokenholderNotPresent();
        emit TokenholderRemoved(tokenholder_);
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
            _gauges[gaugeIDs_[i]].rateOnLine = SafeCast.toUint248(rateOnLines_[i]);
            emit RateOnLineSet(gaugeIDs_[i], rateOnLines_[i]);
        }
    }

    /**
     * @notice Updates gauge weights by processing votes for the last epoch.
     * @dev Can only be called to completion once per epoch.
     * @dev Requires all Voting contracts to had votes processed for this epoch
     * @dev This function design is not compatible with ReentrancyGuard.sol. Because the Reentrancy lock is only released once the full function body has been executed, but if we do an early return it will remain locked.
     * @dev So the question is, are we concerned about reentrancy in this function? There's no value transfer here as in the classic Reentrancy attack.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function updateGaugeWeights() external override onlyGovernance {
        uint256 epochStartTime = _getEpochStartTimestamp();
        if (lastTimeGaugeWeightsUpdated >= epochStartTime) revert GaugeWeightsAlreadyUpdated();
        uint256 startIndex_votingContracts = _updateInfo.finishedLastUpdate ? 0 : _updateInfo.savedIndexOfVotingContracts;
        uint256 startIndex_votes = _updateInfo.finishedLastUpdate ? 0 : _updateInfo.savedIndexOfVotesIndex;
        uint256 numVotingContracts = _votingContracts.length();

        // Iterate through voting contracts
        for(uint256 i = startIndex_votingContracts; i < numVotingContracts; i++) {
            address votingContract = _votingContracts.at(i);
            // Iterate through votes for each voting contract
            uint256 numVotesForContract = _votes[votingContract].length();
            for(uint256 j = startIndex_votes; j < numVotesForContract; j++) {
                // Measure for unbounded loop.
                // Use inline assembly to measure gas remaining => if insufficient, save progress and return.
                // Need to measure how much gas it takes minimum after this loop
                console.log("processVotes 1 %s" , gasleft());
                assembly {
                    if lt(gas(), 90000) {
                        // Use struct packing to make one sstore operation (vs 3 without)
                        let updateInfo
                        // updateInfo.finishedLastUpdate = [0:8] == false
                        updateInfo := or(updateInfo, and(0, 0xFF))

                        // We want to downcast uint256 i to uint120, and move the bits into [8:128] before bitwise-or with updateInfo
                        // shl(136, i) => Remove the 136 least-significant bits from i => i is uint120 in [136:256]
                        // shr(128, shl(136, i)) => uint120(i) is now in [8:128]
                        // updateInfo.savedIndexOfVotingContracts = [8:128] = uint120(i)
                        updateInfo := or(updateInfo, shr(128, shl(136, i)))

                        // shl(136, j) => Remove the 136 least-significant bits from j => j is uint120 in [136:256]
                        // shr(8, shl(136, j)) => uint120(j) is now in [128:248]
                        // [248:256] has been cleared
                        // updateInfo.savedIndexOfVotesIndex = [128:248] = uint120(j)
                        updateInfo := or(updateInfo, shr(8, shl(136, j)))
                        sstore(_updateInfo.slot, updateInfo)
                        return(0, 0)
                    }
                }
                console.log("processVotes 2 %s" , gasleft());

                (uint256 voteID, uint256 gaugeID) = _votes[votingContract].at(j);
                // Votes don't count if gauge paused => address edge case where someone votes when gauge is active (cannot vote for gauge when paused), gauge paused after, but they will still be paying for the vote for a paused gauge
                if (!_gauges[gaugeID].active) {
                    IGaugeVoter(votingContract).setLastProcessedVotePower(voteID, gaugeID, 0);
                    continue;
                }
                uint256 votePower = IGaugeVoter(votingContract).getVotePower(voteID);
                if (votePower == 0) {voteIDsToRemove.push(voteID);}
                _votePowerOfGaugeForEpoch[epochStartTime][gaugeID] += votePower; // This part is susceptible to re-entrancy
                IGaugeVoter(votingContract).setLastProcessedVotePower(voteID, gaugeID, votePower);
            }

            // Remove dead voteIDs after iteration through EnumerableMap.
            // Avoid removing during iteration to avoid side effect from iterating through a collection that we are mutating during iteration.
            while (voteIDsToRemove.length > 0) {
                _votes[votingContract].remove(voteIDsToRemove[voteIDsToRemove.length - 1]);
                voteIDsToRemove.pop();
            }
        }
        
        _updateInfo.finishedLastUpdate = true;
        lastTimeGaugeWeightsUpdated = epochStartTime;
        emit GaugeWeightsUpdated(epochStartTime);
        console.log("processVotes 3 %s" , gasleft());
    }
}