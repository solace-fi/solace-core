// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./../interfaces/native/IBribeController.sol";
import "./../interfaces/native/IUnderwritingLockVoting.sol";
import "./../interfaces/native/IGaugeController.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../utils/EnumerableMapS.sol";
import "./../utils/Governable.sol";

contract BribeController is 
        IBribeController, 
        ReentrancyGuard, 
        Governable 
    {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableMapS for EnumerableMapS.AddressToUintMap;
    using EnumerableMapS for EnumerableMapS.UintToUintMap;

    /***************************************
    GLOBAL PUBLIC VARIABLES
    ***************************************/

    /// @notice Registry address
    address public override registry;

    /// @notice GaugeController.sol address
    address public override gaugeController;

    /// @notice UnderwriterLockVoting.sol address
    address public override votingContract;

    /// @notice End timestamp for last epoch that bribes were processed for all stored votes.
    uint256 public override lastTimeBribesProcessed;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    /// @notice gaugeID => bribeToken => bribeAmount.
    mapping(uint256 => EnumerableMapS.AddressToUintMap) internal _providedBribes;

    /// @notice briber => bribeToken => lifetimeOfferedBribeAmount.
    mapping(address => EnumerableMapS.AddressToUintMap) internal _lifetimeProvidedBribes;

    /// @notice voter => bribeToken => claimableBribeAmount.
    mapping(address => EnumerableMapS.AddressToUintMap) internal _claimableBribes;

    /// @notice gaugeID => total vote power
    EnumerableMapS.UintToUintMap internal _gaugeToTotalVotePower;

    /// @notice Collection of gauges with current bribes.
    EnumerableSet.UintSet internal _gaugesWithBribes;

    /// @notice gaugeID => voter => votePowerBPS.
    mapping(uint256 => EnumerableMapS.AddressToUintMap) internal _votes;

    /// @notice Address => gaugeID => votePowerBPS
    /// @dev _votes will be cleaned up in processBribes(), _votesMirror will not be.
    /// @dev This will enable _voteForBribe to remove previous epoch's voteForBribes.
    mapping(address => EnumerableMapS.UintToUintMap) internal _votesMirror;

    /// @notice whitelist of tokens that can be accepted as bribes
    EnumerableSet.AddressSet internal _bribeTokenWhitelist;

    /// @notice State of last [`distributeBribes()`](#distributeBribes) call.
    GaugeStructs.UpdateInfo internal _updateInfo;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the UnderwritingLocker contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param registry_ The [`Registry`](./Registry) contract address.
     */
    constructor(address governance_, address registry_)
        Governable(governance_)
    {
        _setRegistry(registry_);
        _clearUpdateInfo();
        lastTimeBribesProcessed = _getEpochStartTimestamp();
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch.
     * @return timestamp
     */
    function _getEpochStartTimestamp() internal view returns (uint256 timestamp) {
        return IGaugeController(gaugeController).getEpochStartTimestamp();
    }

    /**
     * @notice Get timestamp for end of the current epoch.
     * @return timestamp
     */
    function _getEpochEndTimestamp() internal view returns (uint256 timestamp) {
        return IGaugeController(gaugeController).getEpochEndTimestamp();
    }

    /**
     * @notice Get unused votePowerBPS for a voter.
     * @param voter_ The address of the voter to query for.
     * @return unusedVotePowerBPS
     */
    function _getUnusedVotePowerBPS(address voter_) internal view returns (uint256 unusedVotePowerBPS) {
        return (10000 - IUnderwritingLockVoting(votingContract).usedVotePowerBPSOf(voter_));
    }

    /**
     * @notice Get votePowerBPS available for voteForBribes.
     * @param voter_ The address of the voter to query for.
     * @return availableVotePowerBPS
     */
    function _getAvailableVotePowerBPS(address voter_) internal view returns (uint256 availableVotePowerBPS) {
        (,uint256 epochEndTimestamp) = _votesMirror[voter_].tryGet(0);
        if (epochEndTimestamp == _getEpochEndTimestamp()) {
            return _getUnusedVotePowerBPS(voter_);
        } else {
            uint256 length = _votesMirror[voter_].length();
            uint256 staleVotePowerBPS = 0;
            for (uint256 i = 0; i < length; i++) {
                (uint256 gaugeID, uint256 votePowerBPS) = _votesMirror[voter_].at(i);
                if (gaugeID != 0) {staleVotePowerBPS += votePowerBPS;}
            }
            return (10000 - IUnderwritingLockVoting(votingContract).usedVotePowerBPSOf(voter_) + staleVotePowerBPS);
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
     * @notice Get unused votePowerBPS for a voter.
     * @param voter_ The address of the voter to query for.
     * @return unusedVotePowerBPS
     */
    function getUnusedVotePowerBPS(address voter_) external view override returns (uint256 unusedVotePowerBPS) {
        return _getUnusedVotePowerBPS(voter_);
    }

    /**
     * @notice Get votePowerBPS available for voteForBribes.
     * @param voter_ The address of the voter to query for.
     * @return availableVotePowerBPS
     */
    function getAvailableVotePowerBPS(address voter_) external view override returns (uint256 availableVotePowerBPS) {
        return _getAvailableVotePowerBPS(voter_);
    }

    /**
     * @notice Get list of whitelisted bribe tokens.
     * @return whitelist
     */
    function getBribeTokenWhitelist() external view override returns (address[] memory whitelist) {
        uint256 length = _bribeTokenWhitelist.length();
        whitelist = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            whitelist[i] = _bribeTokenWhitelist.at(i);
        }
    }

    /**
     * @notice Get claimable bribes for a given voter.
     * @param voter_ Voter to query for.
     * @return bribes Array of claimable bribes.
     */
    function getClaimableBribes(address voter_) external view override returns (Bribe[] memory bribes) {
        uint256 length = _claimableBribes[voter_].length();
        uint256 bribesLength = 0;
        for (uint256 i = 0; i < length; i++) {
            (, uint256 bribeAmount) = _claimableBribes[voter_].at(i);
            if (bribeAmount != type(uint256).max) {bribesLength += 1;}
        }
        bribes = new Bribe[](bribesLength);
        for (uint256 i = 0; i < length; i++) {
            (address bribeToken, uint256 bribeAmount) = _claimableBribes[voter_].at(i);
            if (bribeAmount == type(uint256).max) {continue;}
            bribes[i] = Bribe(bribeToken, bribeAmount);
        }
        return bribes;
    }

    /**
     * @notice Get all gaugeIDs with bribe/s offered in the present epoch.
     * @return gauges Array of gaugeIDs with current bribe.
     */
    function getAllGaugesWithBribe() external view override returns (uint256[] memory gauges) {
        uint256 length = _gaugesWithBribes.length();
        gauges = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            gauges[i] = _gaugesWithBribes.at(i);
        }
    }

    /**
     * @notice Get all bribes which have been offered for a given gauge.
     * @param gaugeID_ GaugeID to query for.
     * @return bribes Array of provided bribes.
     */
    function getProvidedBribesForGauge(uint256 gaugeID_) external view override returns (Bribe[] memory bribes) {
        uint256 length = _providedBribes[gaugeID_].length();
        bribes = new Bribe[](length);
        for (uint256 i = 0; i < length; i++) {
            (address bribeToken, uint256 bribeAmount) = _providedBribes[gaugeID_].at(i);
            bribes[i] = Bribe(bribeToken, bribeAmount);
        }
        return bribes;
    }

    /**
     * @notice Get lifetime provided bribes for a given briber.
     * @param briber_ Briber to query for.
     * @return bribes Array of lifetime provided bribes.
     */
    function getLifetimeProvidedBribes(address briber_) external view override returns (Bribe[] memory bribes) {
        uint256 length = _lifetimeProvidedBribes[briber_].length();
        bribes = new Bribe[](length);
        for (uint256 i = 0; i < length; i++) {
            (address bribeToken, uint256 bribeAmount) = _lifetimeProvidedBribes[briber_].at(i);
            bribes[i] = Bribe(bribeToken, bribeAmount);
        }
        return bribes;
    }

    /**
     * @notice Get all current voteForBribes for a given voter.
     * @dev Inefficient implementation to avoid 
     * @param voter_ Voter to query for.
     * @return votes Array of Votes {uint256 gaugeID, uint256 votePowerBPS}.
     */
    function getVotesForVoter(address voter_) external view override returns (GaugeStructs.Vote[] memory votes) {
        // Get num of votes
        uint256 numVotes = 0;

        // Iterate by gauge
        for (uint256 i = 0; i < _gaugeToTotalVotePower.length(); i++) {
            (uint256 gaugeID,) = _gaugeToTotalVotePower.at(i);
            // Iterate by vote
            for (uint256 j = 0; j < _votes[gaugeID].length(); j++) {
                (address voter,) = _votes[gaugeID].at(j);
                if (voter == voter_) numVotes += 1;
            }
        }

        // Define return array
        votes = new GaugeStructs.Vote[](numVotes);
        uint256 votes_index = 0;

        // Iterate by gauge
        for (uint256 i = 0; i < _gaugeToTotalVotePower.length(); i++) {
            (uint256 gaugeID,) = _gaugeToTotalVotePower.at(i);
            // Iterate by vote
            for (uint256 j = 0; j < _votes[gaugeID].length(); j++) {
                (address voter, uint256 votePowerBPS) = _votes[gaugeID].at(j);
                if (voter == voter_) {
                    votes[votes_index] = GaugeStructs.Vote(gaugeID, votePowerBPS);
                    votes_index += 1;
                    if (votes_index == numVotes) return votes;
                }
            }
        }
    }

    /**
     * @notice Get all current voteForBribes for a given gaugeID.
     * @param gaugeID_ GaugeID to query for.
     * @return votes Array of VoteForGauge {address voter, uint256 votePowerBPS}.
     */
    function getVotesForGauge(uint256 gaugeID_) external view override returns (VoteForGauge[] memory votes) {
        uint256 length = _votes[gaugeID_].length();
        votes = new VoteForGauge[](length);
        for (uint256 i = 0; i < length; i++) {
            (address voter, uint256 votePowerBPS) = _votes[gaugeID_].at(i);
            votes[i] = VoteForGauge(voter, votePowerBPS);
        }
    }

    /**
     * @notice Query whether bribing is currently open.
     * @return True if bribing is open for this epoch, false otherwise.
     */
    function isBribingOpen() external view override returns (bool) {
        uint256 epochStartTime = _getEpochStartTimestamp();
        return (epochStartTime == IGaugeController(gaugeController).lastTimeGaugeWeightsUpdated() 
        && epochStartTime == IUnderwritingLockVoting(votingContract).lastTimePremiumsCharged() 
        && epochStartTime == lastTimeBribesProcessed);
    }

    /***************************************
    INTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Sets registry and related contract addresses.
     * @dev Requires 'uwe' and 'underwritingLocker' addresses to be set in the Registry.
     * @param _registry The registry address to set.
     */
    function _setRegistry(address _registry) internal {
        if(_registry == address(0x0)) revert ZeroAddressInput("registry");
        registry = _registry;
        IRegistry reg = IRegistry(_registry);
        // set gaugeController
        (, address gaugeControllerAddr) = reg.tryGet("gaugeController");
        if(gaugeControllerAddr == address(0x0)) revert ZeroAddressInput("gaugeController");
        gaugeController = gaugeControllerAddr;
        // set votingContract
        (, address underwritingLockVoting) = reg.tryGet("underwritingLockVoting");
        if(underwritingLockVoting == address(0x0)) revert ZeroAddressInput("underwritingLockVoting");
        votingContract = underwritingLockVoting;
        emit RegistrySet(_registry);
    }

    /**
     * @notice Remove vote for gaugeID with bribe.
     * @param voter_ address of voter.
     * @param gaugeID_ The ID of the gauge to remove vote for.
     */
    function _removeVoteForBribeInternal(address voter_, uint256 gaugeID_) internal {
        uint256[] memory gaugeIDs_ = new uint256[](1);
        uint256[] memory votePowerBPSs_ = new uint256[](1);
        gaugeIDs_[0] = gaugeID_;
        votePowerBPSs_[0] = 0;
        _voteForBribe(voter_, gaugeIDs_, votePowerBPSs_, true);
    }

    /**
     * @notice Add, change or remove vote for bribe.
     * Can only be called by the voter or their delegate.
     * @dev Remove NonReentrant modifier from internal function => 5K gas cost saving
     * @param voter_ The voter address.
     * @param gaugeIDs_ The array of gaugeIDs to vote for.
     * @param votePowerBPSs_ The corresponding array of votePowerBPS values. Can be from 0-10000.
     * @param isInternalCall_ True if called through processBribes, false otherwise.
     */
    function _voteForBribe(address voter_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_, bool isInternalCall_) internal {
        // CHECKS
        if (gaugeIDs_.length != votePowerBPSs_.length) revert ArrayArgumentsLengthMismatch();

        // ENABLE INTERNAL CALL TO SKIP CHECKS (which otherwise block processBribes)
        if (!isInternalCall_) {
            if (_getEpochStartTimestamp() > lastTimeBribesProcessed) revert LastEpochBribesNotProcessed();
            if (voter_ != msg.sender && IUnderwritingLockVoting(votingContract).delegateOf(voter_) != msg.sender) revert NotOwnerNorDelegate();

            // If stale _votesMirror, empty _votesMirror and do external calls to remove vote
            if (_votesMirror[voter_].length() != 0) {
                (,uint256 epochEndTimestamp) = _votesMirror[voter_].tryGet(0);
                if (epochEndTimestamp < _getEpochEndTimestamp()) {
                    while(_votesMirror[voter_].length() > 0) {
                        (uint256 gaugeID, uint256 votePowerBPS) = _votesMirror[voter_].at(0);
                        _votesMirror[voter_].remove(gaugeID);
                        // 'Try' here for edge case where premiums charged => voter removes vote via UnderwritingLockVoting => bribe processed => Vote exists in BribeController.sol, but not in GaugeController.sol => Following call can fail.
                        if (gaugeID != 0) {try IUnderwritingLockVoting(votingContract).vote(voter_, gaugeID, 0) {} catch {}}
                    }
                }
            }   
        }

        for(uint256 i = 0; i < gaugeIDs_.length; i++) {
            uint256 gaugeID = gaugeIDs_[i];
            uint256 votePowerBPS = votePowerBPSs_[i];
            if (_providedBribes[gaugeID].length() == 0) revert NoBribesForSelectedGauge();
            // USE CHECKS IN EXTERNAL CALLS BEFORE FURTHER INTERNAL STATE MUTATIONS
            (, uint256 oldVotePowerBPS) = _votes[gaugeID].tryGet(voter_);
            if(!isInternalCall_) {IUnderwritingLockVoting(votingContract).vote(voter_, gaugeID, votePowerBPS);}
            // If remove vote
            if (votePowerBPS == 0) {
                if(!isInternalCall_) _votesMirror[voter_].remove(gaugeID);
                _votes[gaugeID].remove(voter_); // This step costs 15-25K gas, wonder if more efficient implementation.
                if (_votes[gaugeID].length() == 0) _gaugeToTotalVotePower.remove(gaugeID); // This step can cost up to 20K gas
                if(!isInternalCall_) {emit VoteForBribeRemoved(voter_, gaugeID);} // 5K gas cost to emit, avoid in unbounded loop
            } else {
                _gaugeToTotalVotePower.set(gaugeID, 1); // Do not set to 0 to avoid SSTORE penalty for 0 slot in processBribes().
                _votes[gaugeID].set(voter_, votePowerBPS);
                if ( _votesMirror[voter_].length() == 0) _votesMirror[voter_].set(0, _getEpochEndTimestamp());
                _votesMirror[voter_].set(gaugeID, votePowerBPS);
                // Change vote
                if(oldVotePowerBPS > 0) {
                    emit VoteForBribeChanged(voter_, gaugeID, votePowerBPS, oldVotePowerBPS);
                // Add vote
                } else {
                    _preInitializeClaimableBribes(gaugeID, voter_);
                    emit VoteForBribeAdded(voter_, gaugeID, votePowerBPS);
                }
            }
        }
    }

    /**
     * @notice Pre-initialize claimableBribes mapping to save SSTORE cost for zero-slot in processBribes()
     * @dev ~5% gas saving in processBribes().
     * @param gaugeID_ GaugeID.
     * @param voter_ Voter.
     */
    function _preInitializeClaimableBribes(uint256 gaugeID_, address voter_) internal {
        uint256 numBribeTokens = _providedBribes[gaugeID_].length();
        for (uint256 i = 0; i < numBribeTokens; i++) {
            (address bribeToken, ) = _providedBribes[gaugeID_].at(i);
            _claimableBribes[voter_].set(bribeToken, type(uint256).max);
        }
    }

    /***************************************
    BRIBER FUNCTIONS
    ***************************************/

    /**
     * @notice Provide bribe/s.
     * @param bribeTokens_ Array of bribe token addresses.
     * @param bribeAmounts_ Array of bribe token amounts.
     * @param gaugeID_ Gauge ID to bribe for.
     */
    function provideBribes(
        address[] calldata bribeTokens_, 
        uint256[] calldata bribeAmounts_,
        uint256 gaugeID_
    ) external override nonReentrant {
        // CHECKS
        if (_getEpochStartTimestamp() > lastTimeBribesProcessed) revert LastEpochBribesNotProcessed();
        if (bribeTokens_.length != bribeAmounts_.length) revert ArrayArgumentsLengthMismatch();
        try IGaugeController(gaugeController).isGaugeActive(gaugeID_) returns (bool gaugeActive) {
            if (!gaugeActive) revert CannotBribeForInactiveGauge();
        } catch {
            revert CannotBribeForNonExistentGauge();
        }

        uint256 length = bribeTokens_.length;
        for (uint256 i = 0; i < length; i++) {
            if (!_bribeTokenWhitelist.contains(bribeTokens_[i])) revert CannotBribeWithNonWhitelistedToken();
        }
        
        // INTERNAL STATE MUTATIONS
        _gaugesWithBribes.add(gaugeID_);

        for (uint256 i = 0; i < length; i++) {
            (,uint256 previousBribeSum) = _providedBribes[gaugeID_].tryGet(bribeTokens_[i]);
            _providedBribes[gaugeID_].set(bribeTokens_[i], previousBribeSum + bribeAmounts_[i]);
            (,uint256 lifetimeBribeTotal) = _lifetimeProvidedBribes[msg.sender].tryGet(bribeTokens_[i]);
            _lifetimeProvidedBribes[msg.sender].set(bribeTokens_[i], lifetimeBribeTotal + bribeAmounts_[i]);
        }

        // EXTERNAL CALLS + EVENTS
        for (uint256 i = 0; i < length; i++) {
            SafeERC20.safeTransferFrom(
                IERC20(bribeTokens_[i]),
                msg.sender,
                address(this),
                bribeAmounts_[i]
            );

            emit BribeProvided(msg.sender, gaugeID_, bribeTokens_[i], bribeAmounts_[i]);
        }
    }

    /***************************************
    VOTER FUNCTIONS
    ***************************************/

    /**
     * @notice Vote for gaugeID with bribe.
     * @param voter_ address of voter.
     * @param gaugeID_ gaugeID to vote for
     * @param votePowerBPS_ Vote power BPS to assign to this vote.
     */
    function voteForBribe(address voter_, uint256 gaugeID_, uint256 votePowerBPS_) external override nonReentrant {
        uint256[] memory gaugeIDs_ = new uint256[](1);
        uint256[] memory votePowerBPSs_ = new uint256[](1);
        gaugeIDs_[0] = gaugeID_;
        votePowerBPSs_[0] = votePowerBPS_;
        _voteForBribe(voter_, gaugeIDs_, votePowerBPSs_, false);
    }

    /**
     * @notice Vote for multiple gaugeIDs with bribes.
     * @param voter_ address of voter.
     * @param gaugeIDs_ Array of gaugeIDs to vote for
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteForMultipleBribes(address voter_, uint256[] calldata gaugeIDs_, uint256[] calldata votePowerBPSs_) external override nonReentrant {
        _voteForBribe(voter_, gaugeIDs_, votePowerBPSs_, false);
    }

    /**
     * @notice Register a single voting configuration for multiple voters.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voters.
     * @param gaugeIDs_ Array of gauge IDs to vote for.
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteForBribeForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) external override nonReentrant {
        uint256 length = voters_.length;
        for (uint256 i = 0; i < length; i++) {
            _voteForBribe(voters_[i], gaugeIDs_, votePowerBPSs_, false);
        }
    }

    /**
     * @notice Remove vote for gaugeID with bribe.
     * @param voter_ address of voter.
     * @param gaugeID_ The ID of the gauge to remove vote for.
     */
    function removeVoteForBribe(address voter_, uint256 gaugeID_) external override nonReentrant {
        uint256[] memory gaugeIDs_ = new uint256[](1);
        uint256[] memory votePowerBPSs_ = new uint256[](1);
        gaugeIDs_[0] = gaugeID_;
        votePowerBPSs_[0] = 0;
        _voteForBribe(voter_, gaugeIDs_, votePowerBPSs_, false);
    }

    /**
     * @notice Remove multiple votes for bribes.
     * @param voter_ address of voter.
     * @param gaugeIDs_ Array of gaugeIDs to remove votes for
     */
    function removeVotesForMultipleBribes(address voter_, uint256[] calldata gaugeIDs_) external override nonReentrant {
        uint256[] memory votePowerBPSs_ = new uint256[](gaugeIDs_.length);
        for(uint256 i = 0; i < gaugeIDs_.length; i++) {votePowerBPSs_[i] = 0;}
        _voteForBribe(voter_, gaugeIDs_, votePowerBPSs_, false);
    }

    /**
     * @notice Remove gauge votes for multiple voters.
     * @notice Votes cannot be removed while voting is frozen.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voter addresses.
     * @param gaugeIDs_ Array of gauge IDs to remove votes for.
     */
    function removeVotesForBribeForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_) external override nonReentrant {
        uint256 length = voters_.length;
        uint256[] memory votePowerBPSs_ = new uint256[](gaugeIDs_.length);
        for(uint256 i = 0; i < gaugeIDs_.length; i++) {votePowerBPSs_[i] = 0;}
        for (uint256 i = 0; i < length; i++) {
            _voteForBribe(voters_[i], gaugeIDs_, votePowerBPSs_, false);
        }
    }

    // Should delegate also be able to claim bribes for user?
    /**
     * @notice Claim bribes.
     */
    function claimBribes() external override nonReentrant {
        uint256 length = _claimableBribes[msg.sender].length();
        if (length == 0) revert NoClaimableBribes();
        while (_claimableBribes[msg.sender].length() != 0) {
            (address bribeToken, uint256 bribeAmount) = _claimableBribes[msg.sender].at(0);
            _claimableBribes[msg.sender].remove(bribeToken);
            if (bribeAmount == type(uint256).max) {continue;}
            SafeERC20.safeTransfer(IERC20(bribeToken), msg.sender, bribeAmount);
            emit BribeClaimed(msg.sender, bribeToken, bribeAmount);
        }
    }

    /***************************************
    RECEIVE NOTIFICATION HOOK
    ***************************************/

    /**
     * @notice Hook that enables this contract to be informed of votes made via UnderwritingLockVoting.sol.
     * @dev Required to prevent edge case where voteForBribe made via BribeController, is then modified via this contract, and the vote modifications are not reflected in BribeController _votes and _votesMirror storage data structures.
     * @dev The above will result in an edge case where a voter can claim more bribes than they are actually eligible for (votePowerBPS in BribeController _votes data structure that is processed in processBribes(), will be higher than actual votePowerBPS used.)
     * @param voter_ The voter address.
     * @param gaugeID_ The gaugeID to vote for.
     * @param votePowerBPS_ votePowerBPS value. Can be from 0-10000.
     */
    function receiveVoteNotification(address voter_, uint256 gaugeID_, uint256 votePowerBPS_) external override {
        if (msg.sender != votingContract) revert NotVotingContract();

        // Check if vote exists in _votes.
        if(_votes[gaugeID_].contains(voter_)) _votes[gaugeID_].set(voter_, votePowerBPS_);

        // Check if vote exists in _votesMirror.
        if(_votesMirror[voter_].contains(gaugeID_)) _votesMirror[voter_].set(gaugeID_, votePowerBPS_);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * @dev Requires 'uwe' and 'underwritingLocker' addresses to be set in the Registry.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
     */
    function setRegistry(address registry_) external override onlyGovernance {
        _setRegistry(registry_);
    }

    /**
     * @notice Adds token to whitelist of accepted bribe tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param bribeToken_ Address of bribe token.
     */
    function addBribeToken(address bribeToken_) external override onlyGovernance {
        _bribeTokenWhitelist.add(bribeToken_);
        emit BribeTokenAdded(bribeToken_);
    }

    /**
     * @notice Removes tokens from whitelist of accepted bribe tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param bribeToken_ Address of bribe token.
     */
    function removeBribeToken(address bribeToken_) external override onlyGovernance {
        bool success = _bribeTokenWhitelist.remove(bribeToken_);
        if (!success) revert BribeTokenNotAdded();
        emit BribeTokenRemoved(bribeToken_);
    }

    /**
     * @notice Rescues misplaced and remaining bribes (from Solidity rounding down, and bribing rounds with no voters).
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens_ Array of tokens to rescue.
     * @param receiver_ The receiver of the tokens.
     */
    function rescueTokens(address[] memory tokens_, address receiver_) external override onlyGovernance {
        uint256 length = tokens_.length;
        for(uint256 i = 0; i < length; i++) {
            IERC20 token = IERC20(tokens_[i]);
            uint256 balance = token.balanceOf(address(this));
            SafeERC20.safeTransfer(token, receiver_, balance);
            emit TokenRescued(address(token), receiver_, balance);
        }
    }

    /********************************************
     UPDATER FUNCTION TO BE RUN AFTER EACH EPOCH
    ********************************************/

    /**
     * @notice Processes bribes, and makes bribes claimable by eligible voters.
     * @dev Designed to be called in a while-loop with custom gas limit of 6M until `lastTimeBribesProcessed == epochStartTimestamp`.
     */
    function processBribes() external override {
        // CHECKS
        uint256 currentEpochStartTime = _getEpochStartTimestamp();
        if (lastTimeBribesProcessed >= currentEpochStartTime) revert BribesAlreadyProcessed();
        // Require gauge weights to have been updated for this epoch => ensure state we are querying from is < 1 WEEK old.
        if (IUnderwritingLockVoting(votingContract).lastTimePremiumsCharged() < currentEpochStartTime) revert LastEpochPremiumsNotCharged();

        // If no votes to process 
        // => early cleanup of _gaugesWithBribes and _providedBribes mappings
        // => bribes stay custodied on bribing contract
        // => early return
        if (_gaugeToTotalVotePower.length() == 0) {return _concludeProcessBribes(currentEpochStartTime);}

        // LOOP 1 - GET TOTAL VOTE POWER CHASING BRIBES FOR EACH GAUGE 
        // Block-scope to avoid stack too deep error
        {
        uint256 numGauges = _gaugeToTotalVotePower.length();        
        // Iterate by gauge
        for (uint256 i = _updateInfo.index1 == type(uint80).max ? 0 : _updateInfo.index1; i < numGauges; i++) {
            // Iterate by vote
            (uint256 gaugeID,) = _gaugeToTotalVotePower.at(i);
            uint256 numVotes = _votes[gaugeID].length();
            
            // 7-13K gas per loop
            for (uint256 j = _updateInfo.index2 == type(uint88).max || i != _updateInfo.index1 ? 0 : _updateInfo.index2; j < numVotes; j++) {
                // Checkpoint 1
                if (gasleft() < 20000) {return _saveUpdateState(i, j, type(uint88).max);}
                uint256 runningVotePowerSum = _gaugeToTotalVotePower.get(gaugeID);
                (address voter, uint256 votePowerBPS) = _votes[gaugeID].at(j);
                uint256 votePower = IUnderwritingLockVoting(votingContract).getLastProcessedVotePowerOf(voter);
                // State mutation 1
                _gaugeToTotalVotePower.set(gaugeID, runningVotePowerSum + (votePower * votePowerBPS) / 10000);
            }
        }
        }

        // LOOP 2 - DO ACCOUNTING FOR _claimableBribes AND _providedBribes MAPPINGS
        // _gaugeToTotalVotePower, _votes and _providedBribes enumerable collections should be empty at the end.
        {
        // Iterate by gauge
        while (_gaugeToTotalVotePower.length() > 0) {
            (uint256 gaugeID, uint256 votePowerSum) = _gaugeToTotalVotePower.at(0);

            // Iterate by vote - 30-60K gas per loop
            while(_votes[gaugeID].length() > 0) {
                (address voter, uint256 votePowerBPS) = _votes[gaugeID].at(0);
                // `votePowerSum - 1` to nullify initiating _gaugeToTotalVotePower values at 1 rather than 0.
                uint256 bribeProportion = 1e18 * (IUnderwritingLockVoting(votingContract).getLastProcessedVotePowerOf(voter) * votePowerBPS / 10000) / (votePowerSum - 1);

                // Iterate by bribeToken
                uint256 numBribeTokens = _providedBribes[gaugeID].length();
                for (uint256 k = _updateInfo.index3 == type(uint88).max ? 0 : _updateInfo.index3; k < numBribeTokens; k++) {
                    // Checkpoint 2
                    if (gasleft() < 120000) {
                        return _saveUpdateState(type(uint80).max - 1, type(uint88).max - 1, k);
                    }
                    (address bribeToken, uint256 totalBribeAmount) = _providedBribes[gaugeID].at(k);
                    (, uint256 runningClaimableAmount) = _claimableBribes[voter].tryGet(bribeToken);
                    if (runningClaimableAmount == type(uint256).max) {runningClaimableAmount = 0;}
                    uint256 bribeAmount = totalBribeAmount * bribeProportion / 1e18;
                    // State mutation 2
                    _claimableBribes[voter].set(bribeToken, runningClaimableAmount + bribeAmount);
                }
                if (_updateInfo.index3 != 0) {_updateInfo.index3 = type(uint88).max;}
                // Cleanup _votes, _gaugeToTotalVotePower enumerable collections.
                if (gasleft() < 110000) {return _saveUpdateState(type(uint80).max - 1, type(uint88).max - 1, type(uint88).max - 1);}
                _removeVoteForBribeInternal(voter, gaugeID); // 20-30K gas per call
            }
        }
        }

        // Cleanup _gaugesWithBribes and _providedBribes enumerable collections.
        return _concludeProcessBribes(currentEpochStartTime);
    }

    /***************************************
     processBribes() HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Save state of processing bribes to _updateInfo.
     * @param loop1GaugeIndex_ Current index of _gaugeToTotalVotePower in loop 1.
     * @param loop1VoteIndex_ Current index of _votes[gaugeID] in loop 1.
     * @param loop2BribeTokenIndex_ Current index of _providedBribes[gaugeID] in loop 2.
     */
    function _saveUpdateState(uint256 loop1GaugeIndex_, uint256 loop1VoteIndex_, uint256 loop2BribeTokenIndex_) internal {
        assembly {
            let updateInfo
            updateInfo := or(updateInfo, shr(176, shl(176, loop1GaugeIndex_))) // [0:80] => votingContractsIndex_
            updateInfo := or(updateInfo, shr(88, shl(168, loop1VoteIndex_))) // [80:168] => votersIndex_
            updateInfo := or(updateInfo, shl(168, loop2BribeTokenIndex_)) // [168:256] => votesIndex_
            sstore(_updateInfo.slot, updateInfo) 
        }
        emit IncompleteBribesProcessing();
    }

    /// @notice Reset _updateInfo to starting state.
    /// @dev Avoid zero-value of storage slot.
    function _clearUpdateInfo() internal {
        uint256 bitmap = type(uint256).max;
        assembly {
            sstore(_updateInfo.slot, bitmap)
        }
    }

    /// @notice Finishing code block of processBribes.
    /// @param currentEpochStartTime_ Current epoch start timestamp.
    function _concludeProcessBribes(uint256 currentEpochStartTime_) internal {
        while(_gaugesWithBribes.length() > 0) {
            uint256 gaugeID = _gaugesWithBribes.at(0);
            while(_providedBribes[gaugeID].length() > 0) {
                if (gasleft() < 45000) {return _saveUpdateState(type(uint80).max - 1, type(uint88).max - 1, type(uint88).max - 1);}
                (address bribeToken,) = _providedBribes[gaugeID].at(0);
                _providedBribes[gaugeID].remove(bribeToken);
            }
            _gaugesWithBribes.remove(gaugeID);
        }

        lastTimeBribesProcessed = currentEpochStartTime_;
        emit BribesProcessed(currentEpochStartTime_);
        _clearUpdateInfo();
    }
}