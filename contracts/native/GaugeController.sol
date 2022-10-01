// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./../utils/EnumerableMapS.sol";
import "./../utils/Governable.sol";
import "./../utils/SafeCastS.sol";
import "./../interfaces/native/IGaugeVoter.sol";
import "./../interfaces/native/IGaugeController.sol";

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
// solhint-disable-next-line contract-name-camelcase
contract GaugeController is
        IGaugeController,
        ReentrancyGuard,
        Governable
    {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableMapS for EnumerableMapS.UintToUintMap;

    /***************************************
    GLOBAL PUBLIC VARIABLES
    ***************************************/

    /// @notice Underwriting equity token
    address public override token;

    /// @notice Insurance leverage factor.
    /// @dev 1e18 => 100%.
    uint256 public override leverageFactor;

    /// @notice The total number of gauges that have been created.
    uint256 public override totalGauges;

    /// @notice End timestamp for last epoch that all stored votes were processed.
    uint256 public override lastTimeGaugeWeightsUpdated;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    uint256 constant internal WEEK = 604800;

    /// @notice The total number of paused gauges.
    uint256 internal _pausedGaugesCount;

    /// @notice gaugeID => total vote power from last time the gauge weights were updated.
    mapping(uint256 => uint256) internal _votePowerOfGauge;

    /// @notice Array of Gauge {string name, bool active}
    GaugeStructs.Gauge[] internal _gauges;

    /// @notice Set of addresses from which getInsuranceCapacity() will tally UWE supply from.
    EnumerableSet.AddressSet internal _tokenholders;

    /// @notice Set of voting contracts conforming to IGaugeVoting.sol interface that can call [`vote()`](#vote).
    EnumerableSet.AddressSet internal _votingContracts;

    /// @notice votingContract => voters.
    mapping(address => EnumerableSet.AddressSet) internal _voters;

    /// @notice votingContract => voter => gaugeID => votePowerBPS
    mapping(address => mapping(address => EnumerableMapS.UintToUintMap)) internal _votes;

    /// @notice Dynamic array of dead voters to remove.
    address[] internal _votersToRemove;

    /// @notice State of last [`updateGaugeWeights()`](#updategaugeweights) call.
    GaugeStructs.UpdateInfo internal _updateInfo;

    /// @notice Epoch length, default is 1 week.
    uint256 internal _epochLength;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the UnderwritingLocker contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param token_ The address of the underwriting equity token.
     */
    constructor(address governance_, address token_)
        Governable(governance_)
    {
        if (token_ == address(0x0)) revert ZeroAddressInput("token");
        token = token_;
        leverageFactor = 1e18; // Default 1x leverage.
        // Pre-fill slot 0 of _gauges, ensure gaugeID 1 maps to _gauges[1]
        _gauges.push(GaugeStructs.Gauge(false, 0, "")); 
        _clearUpdateInfo();
        _epochLength = WEEK;
        lastTimeGaugeWeightsUpdated = _getEpochStartTimestamp();
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch.
     * @return timestamp
     */
    function _getEpochStartTimestamp() internal view returns (uint256 timestamp) {
        return ( (block.timestamp / _epochLength) * _epochLength );
    }

    /**
     * @notice Get timestamp for end of the current epoch.
     * @return timestamp
     */
    function _getEpochEndTimestamp() internal view returns (uint256 timestamp) {
        return ( (block.timestamp / _epochLength) * _epochLength ) + _epochLength;
    }

    /**
     * @notice Get vote power sum across all gauges.
     * @return votePowerSum
     */
    function _getVotePowerSum() internal view returns (uint256 votePowerSum) {
        for(uint256 i = 1; i < totalGauges + 1; i++) {
            if (_gauges[i].active) {
                votePowerSum += _votePowerOfGauge[i];
            }
        }
    }

    /**
     * @notice Get current gauge weight for a single gauge ID.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @param gaugeID_ The ID of the gauge to query.
     * @return weight
     */
    function _getGaugeWeight(uint256 gaugeID_) internal view returns (uint256 weight) {
        if (!_gauges[gaugeID_].active) return 0;
        uint256 votePowerSum = _getVotePowerSum();
        if (votePowerSum == 0) return 0; // Avoid divide by 0 error
        else {return 1e18 * _votePowerOfGauge[gaugeID_] / votePowerSum;}
    }

    /**
     * @notice Get all gauge weights.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @dev weights[0] will always be 0, so that weights[1] maps to the weight of gaugeID 1.
     * @return weights
     */
    function _getAllGaugeWeights() internal view returns (uint256[] memory weights) {
        weights = new uint[](totalGauges + 1);
        weights[0] = 0;
        uint256 votePowerSum = _getVotePowerSum();

        for(uint256 i = 1; i < totalGauges + 1; i++) {
            if (votePowerSum > 0 && _gauges[i].active) {
                weights[i] = (1e18 * _votePowerOfGauge[i] / votePowerSum);
            } else {
                weights[i] = 0;
            }
        }
    }

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch.
     * @return timestamp
     */
    function getEpochStartTimestamp() external view override returns (uint256 timestamp) {
        return _getEpochStartTimestamp();
    }

    /**
     * @notice Get timestamp for end of the current epoch.
     * @return timestamp
     */
    function getEpochEndTimestamp() external view override returns (uint256 timestamp) {
        return _getEpochEndTimestamp();
    }

    /**
     * @notice Get current gauge weight of single gauge ID.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @param gaugeID_ The ID of the gauge to query.
     * @return weight
     */
    function getGaugeWeight(uint256 gaugeID_) external view override returns (uint256 weight) {
        return _getGaugeWeight(gaugeID_);
    }

    /**
     * @notice Get all gauge weights.
     * @dev Gauge weights must sum to 1e18, so a weight of 1e17 == 10% weight.
     * @dev weights[0] will always be 0, so that weights[1] maps to the weight of gaugeID 1.
     * @return weights
     */
    function getAllGaugeWeights() external view override returns (uint256[] memory weights) {
        return _getAllGaugeWeights();
    }

    /**
     * @notice Get number of active gauges.
     * @return numActiveGauges
     */
    function getNumActiveGauges() external view override returns (uint256 numActiveGauges) {
        return (totalGauges - _pausedGaugesCount);
    }

    /**
     * @notice Get number of paused gauges.
     * @return numPausedGauges
     */
    function getNumPausedGauges() external view override returns (uint256 numPausedGauges) {
        return _pausedGaugesCount;
    }

    /**
     * @notice Get gauge name.
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
     * @return rateOnLine_ Annual rate on line, 1e18 => 100%.
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
        uint256 numTokenholders = _tokenholders.length();
        if (numTokenholders == 0) revert NoTokenholdersAdded();
        uint256 tokenBalance;
        for (uint256 i = 0; i < numTokenholders; i++) {
            tokenBalance += IERC20(token).balanceOf(_tokenholders.at(i));
        }
        return (leverageFactor * tokenBalance / 1e18);
    }

    /**
     * @notice Get vote power sum for all gauges.
     * @return votePowerSum
     */
    function getVotePowerSum() external view override returns (uint256 votePowerSum) {
        return _getVotePowerSum();
    }

    /**
     * @notice Get all votes for a given voter and voting contract.
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @param voter_ Address of voter.
     * @return votes Array of Vote {gaugeID, votePowerBPS}
     */
    function getVotes(address votingContract_, address voter_) external view override returns (GaugeStructs.Vote[] memory votes) {
        if ( !_votingContracts.contains(votingContract_) || !_voters[votingContract_].contains(voter_) ) {
            votes = new GaugeStructs.Vote[](0);
        } else {
            uint256 voteCount = _votes[votingContract_][voter_].length();
            votes = new GaugeStructs.Vote[](voteCount);
            for (uint256 i = 0; i < voteCount; i++) {
                (uint256 gaugeID, uint256 votingPowerBPS) = _votes[votingContract_][voter_].at(i);
                votes[i] = GaugeStructs.Vote(gaugeID, votingPowerBPS);
            }
        }
    }

    /**
     * @notice Get all voters for a given voting contract.
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @return voters Array of voters.
     */
    function getVoters(address votingContract_) external view override returns (address[] memory voters) {
        if ( !_votingContracts.contains(votingContract_) ) {
            voters = new address[](0);
        } else {
            uint256 votersCount = _voters[votingContract_].length();
            voters = new address[](votersCount);
            for (uint256 i = 0; i < votersCount; i++) {
                voters[i] = _voters[votingContract_].at(i);
            }
        }
    }

    /**
     * @notice Get number of votes for a given voter and voting contract.
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @param voter_ Address of voter.
     * @return voteCount Number of votes.
     */
    function getVoteCount(address votingContract_, address voter_) external view override returns (uint256 voteCount) {
        if ( !_votingContracts.contains(votingContract_) || !_voters[votingContract_].contains(voter_) ) {
            return 0;
        } else {
            return _votes[votingContract_][voter_].length();
        }
    }

    /**
     * @notice Get number of voters for a voting contract.
     * @param votingContract_ Address of voting contract  - must have been added via addVotingContract().
     * @return votersCount Number of votes.
     */
    function getVotersCount(address votingContract_) external view override returns (uint256 votersCount) {
        if ( !_votingContracts.contains(votingContract_) ) {
            return 0;
        } else {
            return _voters[votingContract_].length();
        }
    }

    /**
     * @notice Get current epoch length in seconds.
     * @return epochLength
     */
    function getEpochLength() external view override returns (uint256 epochLength) {
        return _epochLength;
    }
    
    /***************************************
    INTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Internal mutator function to add, modify or remove vote
     * @param votingContract_ Address of voting contract - must have been added via addVotingContract().
     * @param voter_ Address of voter.
     * @param gaugeID_ ID of gauge to add, modify or remove vote for.
     * @param newVotePowerBPS_ New votePowerBPS value.
     * @return oldVotePowerBPS Old votePowerBPS value.
     */
    function _vote(address votingContract_, address voter_, uint256 gaugeID_, uint256 newVotePowerBPS_) internal returns (uint256 oldVotePowerBPS) {
        // Check if need to add new voter.
        // Use `newVotePowerBPS_ > 0` to short circuit and avoid SLOAD for removing vote operations.
        if ( newVotePowerBPS_ > 0 && !_voters[votingContract_].contains(voter_) ) {
            _voters[votingContract_].add(voter_);
        }

        // If adding new vote
        if ( newVotePowerBPS_ > 0 && !_votes[votingContract_][voter_].contains(gaugeID_) ) {
            _votes[votingContract_][voter_].set(gaugeID_, newVotePowerBPS_);
            return 0;
        // Else if removing vote
        } else if (newVotePowerBPS_ == 0) {
            oldVotePowerBPS = _votes[votingContract_][voter_].get(gaugeID_);
            _votes[votingContract_][voter_].remove(gaugeID_);
            // Check if need to remove voter
            if ( _votes[votingContract_][voter_].length() == 0 ) {_voters[votingContract_].remove(voter_);}
            return oldVotePowerBPS;
        // Else modify vote
        } else {
            oldVotePowerBPS = _votes[votingContract_][voter_].get(gaugeID_);
            _votes[votingContract_][voter_].set(gaugeID_, newVotePowerBPS_);
            return oldVotePowerBPS;
        }
    }

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
    function vote(address voter_, uint256 gaugeID_, uint256 newVotePowerBPS_) external override returns (uint256 oldVotePowerBPS) {
        if (gaugeID_ == 0) revert CannotVoteForGaugeID0();
        if (_getEpochStartTimestamp() > lastTimeGaugeWeightsUpdated) revert GaugeWeightsNotYetUpdated();
        if (gaugeID_ + 1 > _gauges.length) revert GaugeIDNotExist();
        if (!_votingContracts.contains(msg.sender)) revert NotVotingContract();
        // Can remove votes while gauge paused
        if (newVotePowerBPS_ > 0 && !_gauges[gaugeID_].active) revert GaugeIDPaused();
        return _vote(msg.sender, voter_, gaugeID_, newVotePowerBPS_);
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
        if (!_votingContracts.contains(votingContract_)) revert VotingContractNotAdded();
        _votingContracts.remove(votingContract_);
        emit VotingContractRemoved(votingContract_);
    }

    /**
     * @notice Adds an insurance gauge
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeName_ Gauge name.
     * @param rateOnLine_ Annual rate on line (1e18 => 100%)
     */
    function addGauge(string calldata gaugeName_, uint256 rateOnLine_) external override onlyGovernance {
        uint256 gaugeID = ++totalGauges;
        GaugeStructs.Gauge memory newGauge = GaugeStructs.Gauge(true, SafeCastS.toUint248(rateOnLine_), gaugeName_);
        _gauges.push(newGauge);
        assert(_gauges.length - 1 == totalGauges); // Uphold invariant, should not be violated. -1 because we already added _gauges[0] in constructor.
        emit GaugeAdded(gaugeID, rateOnLine_, gaugeName_);
    }

    /**
     * @notice Pauses an insurance gauge
     * @notice Paused gauges cannot have votes added or modified, and votes for a paused gauge will not be counted
     * in the next updateGaugeWeights() call.
     * @dev We do not include a removeGauge function as this would distort the order of the _gauges array
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeID_ ID of gauge to pause
     */
    function pauseGauge(uint256 gaugeID_) external override onlyGovernance {
        if(_gauges[gaugeID_].active == false) revert GaugeAlreadyPaused({gaugeID: gaugeID_});
        _pausedGaugesCount += 1;
        _gauges[gaugeID_].active = false;
        emit GaugePaused(gaugeID_, _gauges[gaugeID_].name);
    }

    /**
     * @notice Unpauses an insurance gauge.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeID_ ID of gauge to pause.
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
     * @param token_ The address of the new underwriting token
     */
    function setToken(address token_) external override onlyGovernance {
        token = token_;
        emit TokenSet(token_);
    }

    /**
     * @notice Set epoch length (as an integer multiple of 1 week).
     * @dev Advise caution for timing of this function call. If reducing epoch length, voting may then become closed because lastTimeGaugeWeightsUpdated < epochStartTime.
     * @dev If the above case occurs, will need to run updateGaugeWeights to re-open voting.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param weeks_ Integer multiple of 1 week, to set epochLength to.
     */
    function setEpochLengthInWeeks(uint256 weeks_) external override onlyGovernance {
        if(weeks_ == 0) revert CannotSetEpochLengthTo0();
        _epochLength = weeks_ * WEEK;
        emit EpochLengthSet(weeks_);
    }

    /**
     * @notice Adds address to tokenholders set - these addresses will be queried for $UWE token balance and summed to determine the Solace Native insurance capacity.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokenholder_ Address of new tokenholder
     */
    function addTokenholder(address tokenholder_) external override onlyGovernance {
        _tokenholders.add(tokenholder_);
        emit TokenholderAdded(tokenholder_);
    }

    /**
     * @notice Removes an address from the tokenholder set - these addresses will be queried for $UWE token balance and summed to determine the Solace Native insurance capacity.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokenholder_ Address of new tokenholder.
     */
    function removeTokenholder(address tokenholder_) external override onlyGovernance {
        bool success = _tokenholders.remove(tokenholder_);
        if (!success) revert TokenholderNotPresent();
        emit TokenholderRemoved(tokenholder_);
    }

    /**
     * @notice Set annual rate-on-line for selected gaugeIDs
     * @dev 1e18 => 100%
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param gaugeIDs_ Array of gaugeIDs.
     * @param rateOnLines_ Array of corresponding annual rate on lines.
     */
    function setRateOnLine(uint256[] calldata gaugeIDs_, uint256[] calldata rateOnLines_) external override onlyGovernance {
        if (gaugeIDs_.length != rateOnLines_.length) revert ArrayArgumentsLengthMismatch();
        for (uint256 i = 0; i < gaugeIDs_.length; i++) {
            _gauges[gaugeIDs_[i]].rateOnLine = SafeCastS.toUint248(rateOnLines_[i]);
            emit RateOnLineSet(gaugeIDs_[i], rateOnLines_[i]);
        }
    }

    /********************************************
     UPDATER FUNCTION TO BE RUN AFTER EACH EPOCH
    ********************************************/

    /**
     * @notice Updates gauge weights by processing votes for the last epoch.
     * @dev Designed to be called in a while-loop with custom gas limit of 6M until `lastTimePremiumsCharged == epochStartTimestamp`.
     */
    function updateGaugeWeights() external override {
        if ( _updateInfo.index3 == type(uint88).max ) {_resetVotePowerOfGaugeMapping();} // If first call for epoch, reset _votePowerOfGauge
        uint256 epochStartTime = _getEpochStartTimestamp();
        if (lastTimeGaugeWeightsUpdated >= epochStartTime) revert GaugeWeightsAlreadyUpdated();
        uint256 numVotingContracts = _votingContracts.length();

        // Iterate through voting contracts
        // Use ternary operator to initialise loop, to avoid setting stack-too deep error from too many local variables.
        for(uint256 i = _updateInfo.index1 == type(uint80).max ? 0 : _updateInfo.index1; i < numVotingContracts; i++) {
            address votingContract = _votingContracts.at(i);
            uint256 numVoters = _voters[votingContract].length();

            // Iterate through voters
            for(uint256 j = _updateInfo.index2 == type(uint88).max || i != _updateInfo.index1 ? 0 : _updateInfo.index2 ; j < numVoters; j++) {
                if (gasleft() < 200000) {return _saveUpdateState(i, j, 0);}
                address voter = _voters[votingContract].at(j);
                uint256 numVotes = _votes[votingContract][voter].length();
                uint256 votePower = IGaugeVoter(votingContract).getVotePower(voter); // Expensive computation here. ~150K gas for user with max cap of 10 locks.
                if (votePower == 0) {
                    _votersToRemove.push(voter);
                    continue;
                }
                // If votePower == 0, we don't need to cache the result because voter will be removed from _voters EnumerableSet
                // => chargePremiums() will not iterate through it
                IGaugeVoter(votingContract).cacheLastProcessedVotePower(voter, votePower);

                // Iterate through votes
                for(uint256 k = _updateInfo.index3 == type(uint88).max || j != _updateInfo.index2 || i != _updateInfo.index1 ? 0 : _updateInfo.index3; k < numVotes; k++) {    
                    if (gasleft() < 15000) {return _saveUpdateState(i, j, k);}
                    (uint256 gaugeID, uint256 votingPowerBPS) = _votes[votingContract][voter].at(k);
                    // Address edge case where vote placed before gauge is paused, will be counted
                    if (!_gauges[gaugeID].active) {continue;}
                    _votePowerOfGauge[gaugeID] += votePower * votingPowerBPS / 10000;
                }
            }

            // Remove dead voters - unbounded SSTORE loop.
            while (_votersToRemove.length > 0) {
                // Subtle bug, don't set _updateInfo._votesIndex to type(uint88).max or else you actually don't skip votes iteration
                if (gasleft() < 15000) {
                    return _saveUpdateState(i, type(uint88).max - 1, type(uint88).max - 1);
                }
                _voters[votingContract].remove(_votersToRemove[_votersToRemove.length - 1]);
                _votersToRemove.pop();
            }
        }

        _adjustVotePowerOfGaugeMapping();
        _clearUpdateInfo();
        lastTimeGaugeWeightsUpdated = epochStartTime;
        emit GaugeWeightsUpdated(epochStartTime);
    }

    /***************************************
     updateGaugeWeights() HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Save state of updating gauge weights to _updateInfo.
     * @param votingContractsIndex_ Current index of _votingContracts.
     * @param votersIndex_ Current index of _voters[votingContractsIndex_].
     * @param votesIndex_ Current index of _votes[votingContractsIndex_][votersIndex_]
     */
    function _saveUpdateState(uint256 votingContractsIndex_, uint256 votersIndex_, uint256 votesIndex_) internal {
        assembly {
            let updateInfo
            updateInfo := or(updateInfo, shr(176, shl(176, votingContractsIndex_))) // [0:80] => votingContractsIndex_
            updateInfo := or(updateInfo, shr(88, shl(168, votersIndex_))) // [80:168] => votersIndex_
            updateInfo := or(updateInfo, shl(168, votesIndex_)) // [168:256] => votesIndex_
            sstore(_updateInfo.slot, updateInfo)
        }
        emit IncompleteGaugeUpdate();
    }

    /// @notice Reset _updateInfo to starting state.
    /// @dev Avoid zero-value of storage slot.
    function _clearUpdateInfo() internal {
        uint256 bitmap = type(uint256).max;
        assembly {
            sstore(_updateInfo.slot, bitmap)
        }
    }

    /// @notice Reset _votePowerOfGauge on first updateGaugeWeights() call for the epoch.
    /// @dev Avoid zero value of storage slots
    function _resetVotePowerOfGaugeMapping() internal {
        for (uint256 i = 1; i < totalGauges + 1; i++) {
            _votePowerOfGauge[i] = 1;
        }
    }

    /// @notice Adjust _votePowerOfGauge for _resetVotePowerOfGaugeMapping call() done this epoch.
    function _adjustVotePowerOfGaugeMapping() internal {
        for (uint256 i = 1; i < totalGauges + 1; i++) {
            if ( _gauges[i].active ) {
                _votePowerOfGauge[i] -= 1;
            }
        }
    }
}
