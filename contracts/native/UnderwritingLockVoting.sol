// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./../utils/Governable.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../interfaces/native/IUnderwritingLocker.sol";
import "./../interfaces/native/IUnderwritingLockVoting.sol";
import "./../interfaces/native/IGaugeController.sol";

/**
 * @title UnderwritingLockVoting
 * @author solace.fi
 * @notice Enables individual votes in Solace Native insurance gauges for owners of [`UnderwritingLocker`](./UnderwritingLocker).
 *
 * Any address owning an underwriting lock can vote and will have a votePower that can be viewed with [`getVotePower()`](#getVotePower)
 * An address' vote power is the sum of the vote power of its owned locks.
 * A lock's vote power scales linearly with locked amount, and through a sqrt formula with lock duration
 * Users cannot view the vote power of an individual lock through this contract, only the total vote power of an address.
 * This is an intentional design choice to abstract locks away from address-based voting.
 *
 * Voters can set a delegate who can vote on their behalf via [`setDelegate()`](#setDelegate).
 *
 * To cast a vote, either the voter or their delegate can call [`vote()`](#vote) or [`voteMultiple()`](#voteMultiple).
 * Votes can be cast among existing gaugeIDs (set in GaugeController.sol), and voters/delegates can set a custom proportion
 * of their total voting power for different gauges.
 * Voting power proportion is measured in bps, and total used voting power bps for a voter cannot exceed 10000.
 *
 * Votes are saved, so a vote today will count as the voter's vote for all future epochs until the voter modifies their votes.
 *
 * After each epoch (one-week) has passed, voting is frozen until governance has processed all the votes.
 * This is a two-step process:
 * GaugeController.updateGaugeWeights() - this will aggregate individual votes and update gauge weights accordingly
 * [`chargePremiums()`](#chargepremiums) - this will charge premiums for every vote. There is a voting premium
 * to be paid every epoch, this gets sent to the revenue router.
 */
contract UnderwritingLockVoting is
        IUnderwritingLockVoting,
        ReentrancyGuard,
        Governable
    {
    using EnumerableSet for EnumerableSet.AddressSet;

    /***************************************
    GLOBAL PUBLIC VARIABLES
    ***************************************/

    /// @notice Revenue router address (Voting premiums will be transferred here).
    address public override revenueRouter;

    /// @notice Address of [`UnderwritingLocker`](./UnderwritingLocker).
    address public override underwritingLocker;

    /// @notice Address of [`GaugeController`](./GaugeController).
    address public override gaugeController;

    /// @notice Registry address
    address public override registry;

    /// @notice Updater address.
    /// @dev Second address that can call chargePremiums (in addition to governance).
    address public override updater;

    /// @notice End timestamp for last epoch that premiums were charged for all stored votes.
    uint256 public override lastTimePremiumsCharged;

    /// @notice voter => delegate.
    mapping(address => address) public override delegateOf;

    /// @notice voter => used voting power percentage (max of 10000 bps).
    mapping(address => uint256) public override usedVotePowerBPSOf;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    uint256 constant internal YEAR = 31536000;

    /// @notice Total premium due to the revenueRouter.
    /// @dev Avoid this storage slot being 0, avoid SSTORE cost from 0 to nonzero value.
    uint256 internal _totalPremiumDue;

    /// @notice voter => last processed vote power.
    /// @dev Cache for getVotePower() result for most recent GaugeController.updateGaugeWeights() call.
    mapping (address => uint256) internal _lastProcessedVotePowerOf;

    /// @notice State of last [`chargePremiums()`](#chargepremiums) call.
    GaugeStructs.UpdateInfo internal _updateInfo;

    /// @notice delegate => voters.
    mapping(address => EnumerableSet.AddressSet) internal _votingDelegatorsOf;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the UnderwritingLockVoting contract.
     * @dev Requires 'uwe', 'revenueRouter', 'underwritingLocker' and 'gaugeController' addresses to be set in the Registry.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param registry_ The [`Registry`](./Registry) contract address.
     */
    constructor(address governance_, address registry_) Governable(governance_) {
        _setRegistry(registry_);
        // Initialize as non-zero storage slots.
        _totalPremiumDue = type(uint256).max;
        _clearUpdateInfo();
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get vote power for a lock.
     * @dev Need try-catch block, otherwise revert for burned lock will deadlock updateGaugeWeight() call.
     * @param lockID_ The ID of the lock to query.
     * @return votePower
     */
    function _getVotePowerOfLock(uint256 lockID_) internal view returns (uint256 votePower) {
        try IUnderwritingLocker(underwritingLocker).locks(lockID_) returns (Lock memory lock) {
            return ( lock.amount * IUnderwritingLocker(underwritingLocker).getLockMultiplier(lockID_) ) / 1e18;
        } catch {
            return 0;
        }
    }

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
     * @notice Get end timestamp for last epoch that all stored votes were processed.
     * @return timestamp
     */
    function _getLastTimeGaugesUpdated() internal view returns (uint256 timestamp) {
        return IGaugeController(gaugeController).lastTimeGaugeWeightsUpdated();
    }

    /**
     * @notice Query whether msg.sender is either the governance or updater role.
     * @return True if msg.sender is either governor or updater roler, and contract govenance is not locked, false otherwise.
     */
    function _isUpdaterOrGovernance() internal view returns (bool) {
        return ( !this.governanceIsLocked() && ( msg.sender == updater || msg.sender == this.governance() ));
    }

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get vote power for a voter.
     * @param voter_ The address of the voter to query.
     * @return votePower
     */
    function getVotePower(address voter_) external view override returns (uint256 votePower) {
        uint256[] memory lockIDs = IUnderwritingLocker(underwritingLocker).getAllLockIDsOf(voter_);
        uint256 numVoterLocks = lockIDs.length;
        for (uint256 i = 0; i < numVoterLocks; i++) {votePower += _getVotePowerOfLock(lockIDs[i]);}
    }

    /**
     * @notice Get all current votes for a voter.
     * @param voter_ Address of voter to query for.
     * @return votes Array of Vote{gaugeID, votePowerBPS}.
     */
    function getVotes(address voter_) external view override returns (GaugeStructs.Vote[] memory votes) {
        return IGaugeController(gaugeController).getVotes(address(this), voter_);
    }

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
     * @notice Query whether voting is currently open.
     * @return True if voting is open for this epoch, false otherwise.
     */
    function isVotingOpen() external view override returns (bool) {
        uint256 epochStartTime = _getEpochStartTimestamp();
        return epochStartTime == lastTimePremiumsCharged && epochStartTime == _getLastTimeGaugesUpdated();
    }

    /**
     * @notice Get array of voters who have delegated their vote to a given address.
     * @param delegate_ Address to query array of voting delegators for.
     * @return votingDelegators Array of voting delegators.
     */
    function getVotingDelegatorsOf(address delegate_) external view override returns (address[] memory votingDelegators) {
        uint256 length = _votingDelegatorsOf[delegate_].length();
        votingDelegators = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            votingDelegators[i] = _votingDelegatorsOf[delegate_].at(i);
        }
    }

    /**
     * @notice Get last processed vote power for given voter.
     * @param voter_ Address of voter to query for.
     * @return lastProcessedVotePower
     */
    function getLastProcessedVotePowerOf(address voter_) external view override returns (uint256 lastProcessedVotePower) {
        return _lastProcessedVotePowerOf[voter_];
    }

    /***************************************
    INTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Set the voting delegate for the caller.
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param delegate_ Address of intended delegate
     */
    function _setDelegate(address delegate_) internal {
        address oldDelegate = delegateOf[msg.sender];
        if (oldDelegate != address(0)) _votingDelegatorsOf[oldDelegate].remove(msg.sender);
        if (delegate_ != address(0)) _votingDelegatorsOf[delegate_].add(msg.sender);
        delegateOf[msg.sender] = delegate_;
        emit DelegateSet(msg.sender, delegate_);
    }

    /**
     * @notice Sets registry and related contract addresses.
     * @dev Requires 'uwe', 'revenueRouter' and 'underwritingLocker' addresses to be set in the Registry.
     * @param _registry The registry address to set.
     */
    function _setRegistry(address _registry) internal {
        if(_registry == address(0x0)) revert ZeroAddressInput("registry");
        registry = _registry;
        IRegistry reg = IRegistry(_registry);
        // set revenueRouter
        (, address revenueRouterAddr) = reg.tryGet("revenueRouter");
        if(revenueRouterAddr == address(0x0)) revert ZeroAddressInput("revenueRouter");
        revenueRouter = revenueRouterAddr;
        // set underwritingLocker
        (, address underwritingLockerAddr) = reg.tryGet("underwritingLocker");
        if(underwritingLockerAddr == address(0x0)) revert ZeroAddressInput("underwritingLocker");
        underwritingLocker = underwritingLockerAddr;
        // set gaugeController
        (, address gaugeControllerAddr) = reg.tryGet("gaugeController");
        if(gaugeControllerAddr == address(0x0)) revert ZeroAddressInput("gaugeController");
        gaugeController = gaugeControllerAddr;
        emit RegistrySet(_registry);
    }

    /**
     * @notice Add, change or remove votes.
     * Can only be called by the voter or their delegate.
     * @param voter_ The voter address.
     * @param gaugeIDs_ The array of gaugeIDs to vote for.
     * @param votePowerBPSs_ The corresponding array of votePowerBPS values. Can be from 0-10000.
     */
    function _vote(address voter_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) internal {
        // Disable voting if votes not yet processed or premiums not yet charged for this epoch
        if ( _getEpochStartTimestamp() != lastTimePremiumsCharged) revert LastEpochPremiumsNotCharged();
        if( voter_ != msg.sender && delegateOf[voter_] != msg.sender) revert NotOwnerNorDelegate();
        if (gaugeIDs_.length != votePowerBPSs_.length) revert ArrayArgumentsLengthMismatch();

        for(uint256 i = 0; i < gaugeIDs_.length; i++) {
            uint256 gaugeID = gaugeIDs_[i];
            uint256 votePowerBPS = votePowerBPSs_[i];
            if (votePowerBPS > 10000) revert SingleVotePowerBPSOver10000();

            // If remove vote
            if ( votePowerBPS == 0 ) {
                uint256 oldVotePowerBPS = IGaugeController(gaugeController).vote(voter_, gaugeID, votePowerBPS);
                usedVotePowerBPSOf[voter_] -= oldVotePowerBPS;
                emit VoteRemoved(voter_, gaugeID);
            } else {
                uint256 oldVotePowerBPS = IGaugeController(gaugeController).vote(voter_, gaugeID, votePowerBPS);
                // Add vote
                if (oldVotePowerBPS == 0) {
                    usedVotePowerBPSOf[voter_] += votePowerBPS;
                    emit VoteAdded(voter_, gaugeID, votePowerBPS);
                // Else modify vote
                } else {
                    usedVotePowerBPSOf[voter_] += votePowerBPS;
                    usedVotePowerBPSOf[voter_] -= oldVotePowerBPS;
                    emit VoteChanged(voter_, gaugeID, votePowerBPS, oldVotePowerBPS);
                }
            }
        }

        if (usedVotePowerBPSOf[voter_] > 10000) revert TotalVotePowerBPSOver10000();
    }

    /***************************************
    EXTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Register a single vote for a gauge. Can either add or change a vote.
     * @notice Can also remove a vote (votePowerBPS_ == 0), the difference with removeVote() is that
     * vote() will revert if the voter has no locks (no locks => no right to vote, but may have votes from
     * locks that have since been burned).
     * @notice GaugeController.updateGaugeWeights() will remove voters with no voting power, however voters can
     * preemptively 'clean' the system.
     * @notice Votes are frozen after the end of every epoch, and resumed when all stored votes have been processed.
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeID_ The ID of the gauge to vote for.
     * @param votePowerBPS_ Vote power BPS to assign to this vote
     */
    function vote(address voter_, uint256 gaugeID_, uint256 votePowerBPS_) external override {
        if ( IUnderwritingLocker(underwritingLocker).balanceOf(voter_) == 0 ) revert VoterHasNoLocks();
        uint256[] memory gaugeIDs_ = new uint256[](1);
        uint256[] memory votePowerBPSs_ = new uint256[](1);
        gaugeIDs_[0] = gaugeID_;
        votePowerBPSs_[0] = votePowerBPS_;
        _vote(voter_, gaugeIDs_, votePowerBPSs_);
    }

    /**
     * @notice Register multiple gauge votes.
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeIDs_ Array of gauge IDs to vote for.
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteMultiple(address voter_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) external override {
        if ( IUnderwritingLocker(underwritingLocker).balanceOf(voter_) == 0 ) revert VoterHasNoLocks();
        _vote(voter_, gaugeIDs_, votePowerBPSs_);
    }

    /**
     * @notice Register a single voting configuration for multiple voters.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voters.
     * @param gaugeIDs_ Array of gauge IDs to vote for.
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) external override {
        uint256 length = voters_.length;
        for (uint256 i = 0; i < length; i++) {
            if ( IUnderwritingLocker(underwritingLocker).balanceOf(voters_[i]) == 0 ) revert VoterHasNoLocks();
            _vote(voters_[i], gaugeIDs_, votePowerBPSs_);
        }
    }

    /**
     * @notice Removes a vote.
     * @notice Votes cannot be removed while voting is frozen.
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeID_ The ID of the gauge to remove vote for.
     */
    function removeVote(address voter_, uint256 gaugeID_) external override {
        uint256[] memory gaugeIDs_ = new uint256[](1);
        uint256[] memory votePowerBPSs_ = new uint256[](1);
        gaugeIDs_[0] = gaugeID_;
        votePowerBPSs_[0] = 0;
        _vote(voter_, gaugeIDs_, votePowerBPSs_);
    }

    /**
     * @notice Remove multiple gauge votes.
     * @notice Votes cannot be removed while voting is frozen.
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeIDs_ Array of gauge IDs to remove votes for.
     */
    function removeVoteMultiple(address voter_, uint256[] memory gaugeIDs_) external override {
        uint256[] memory votePowerBPSs_ = new uint256[](gaugeIDs_.length);
        for(uint256 i = 0; i < gaugeIDs_.length; i++) {votePowerBPSs_[i] = 0;}
        _vote(voter_, gaugeIDs_, votePowerBPSs_);
    }

    /**
     * @notice Remove gauge votes for multiple voters.
     * @notice Votes cannot be removed while voting is frozen.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voter addresses.
     * @param gaugeIDs_ Array of gauge IDs to remove votes for.
     */
    function removeVotesForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_) external override {
        uint256 length = voters_.length;
        uint256[] memory votePowerBPSs_ = new uint256[](gaugeIDs_.length);
        for(uint256 i = 0; i < gaugeIDs_.length; i++) {votePowerBPSs_[i] = 0;}
        for (uint256 i = 0; i < length; i++) {
            _vote(voters_[i], gaugeIDs_, votePowerBPSs_);
        }
    }

    /**
     * @notice Set the voting delegate for the caller.
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000.
     * @param delegate_ Address of intended delegate
     */
    function setDelegate(address delegate_) external override {
        _setDelegate(delegate_);
    }

    /***************************************
    GAUGE CONTROLLER FUNCTIONS
    ***************************************/

    /**
     * @notice Cache last processed vote power for a voter.
     * @dev Can only be called by the gaugeController contract.
     * @dev Assist gas efficiency of chargePremiums().
     * @param voter_ Address of voter.
     * @param votePower_ Vote power.
     */
    function cacheLastProcessedVotePower(address voter_, uint256 votePower_) external override {
        if (msg.sender != gaugeController) revert NotGaugeController();
        _lastProcessedVotePowerOf[voter_] = votePower_;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * @dev Requires 'uwe', 'revenueRouter' and 'underwritingLocker' addresses to be set in the Registry.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
     */
    function setRegistry(address registry_) external override onlyGovernance {
        _setRegistry(registry_);
    }

    /**
     * @notice Set updater address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param updater_ The address of the new updater.
     */
    function setUpdater(address updater_) external override onlyGovernance {
        updater = updater_;
        emit UpdaterSet(updater_);
    }

    /**
     * @notice Charge premiums for votes.
     * @dev Designed to be called in a while-loop with the condition being `lastTimePremiumsCharged != epochStartTimestamp` and using the maximum custom gas limit.
     * @dev Requires GaugeController.updateGaugeWeights() to be run to completion for the last epoch.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function chargePremiums() external override {
        if (!_isUpdaterOrGovernance()) revert NotUpdaterNorGovernance();
        uint256 epochStartTimestamp = _getEpochStartTimestamp();
        if(_getLastTimeGaugesUpdated() != epochStartTimestamp) revert GaugeWeightsNotYetUpdated();
        if(lastTimePremiumsCharged == epochStartTimestamp) revert LastEpochPremiumsAlreadyProcessed({epochTime: epochStartTimestamp});

        // Single call for universal multipliers in premium computation.
        uint256 insuranceCapacity = IGaugeController(gaugeController).getInsuranceCapacity();
        uint256 votePowerSum = IGaugeController(gaugeController).getVotePowerSum();
        uint256 epochLength = IGaugeController(gaugeController).getEpochLength();

        // Iterate through voters
        address[] memory voters = IGaugeController(gaugeController).getVoters(address(this));
        for(uint256 i = _updateInfo._votersIndex == type(uint88).max ? 0 : _updateInfo._votersIndex ; i < voters.length; i++) {
            // _saveUpdateState(0, i, 0);
            // Short-circuit operator - need at least 30K gas for getVoteCount() call
            if (gasleft() < 40000 || gasleft() < 10000 * IGaugeController(gaugeController).getVoteCount(address(this), voters[i])) {
                return _saveUpdateState(0, i, 0);
            }
            // Unbounded loop since # of votes (gauges) unbounded
            uint256 premium = _calculateVotePremium(voters[i], insuranceCapacity, votePowerSum, epochLength); // 87K gas for 10 votes
            uint256[] memory lockIDs = IUnderwritingLocker(underwritingLocker).getAllLockIDsOf(voters[i]);
            uint256 numLocks = lockIDs.length;

            // Iterate through locks
            // Using _votesIndex as _lockIndex
            // If either votesIndex slot is cleared, or we aren't on the same voter as when we last saved, start from index 0.
            for(uint256 j = _updateInfo._votesIndex == type(uint88).max || i != _updateInfo._votersIndex ? 0 : _updateInfo._votesIndex; j < numLocks; j++) {
                if (gasleft() < 20000) {return _saveUpdateState(0, i, j);}
                // Split premium amongst each lock equally.
                IUnderwritingLocker(underwritingLocker).chargePremium(lockIDs[j], premium / numLocks);
            }

            _totalPremiumDue -= premium;
        }

        SafeERC20.safeTransferFrom(
            IERC20(IUnderwritingLocker(underwritingLocker).token()),
            underwritingLocker,
            revenueRouter,
            type(uint256).max - _totalPremiumDue // Avoid _totalPremiumDue being zero.
        );

        _clearUpdateInfo();
        _totalPremiumDue = type(uint256).max; // Reinitialize _totalPremiumDue.
        lastTimePremiumsCharged = epochStartTimestamp;
        emit AllPremiumsCharged(epochStartTimestamp);
    }

    /***************************************
     updateGaugeWeights() HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Save state of charging premium to _updateInfo
     * @param empty_ Empty index (should be 0).
     * @param votersIndex_ Current index of _voters[votingContractsIndex_].
     * @param lockIndex_ Current index of _votes[votingContractsIndex_][votersIndex_]
     */
    function _saveUpdateState(uint256 empty_, uint256 votersIndex_, uint256 lockIndex_) internal {
        assembly {
            let updateInfo
            updateInfo := or(updateInfo, shr(176, shl(176, empty_))) // [0:80] => empty_
            updateInfo := or(updateInfo, shr(88, shl(168, votersIndex_))) // [80:168] => votersIndex_
            updateInfo := or(updateInfo, shl(168, lockIndex_)) // [168:256] => lockIndex_
            sstore(_updateInfo.slot, updateInfo)
        }
        emit IncompletePremiumsCharge();
    }

    /// @notice Reset _updateInfo to starting state.
    /// @dev Avoid zero-value of storage slot.
    function _clearUpdateInfo() internal {
        uint256 bitmap = type(uint256).max;
        assembly {
            sstore(_updateInfo.slot, bitmap)
        }
    }

    /**
     * @notice Computes voting premium for voter.
     * @param voter_ Address of voter.
     * @param insuranceCapacity_ Solace Native insurance capacity.
     * @param votePowerSum_ Solace Native vote power sum.
     * @return premium Premium for voter.
     */
    function _calculateVotePremium(address voter_, uint256 insuranceCapacity_, uint256 votePowerSum_, uint256 epochLength_) internal view returns (uint256 premium) {
        GaugeStructs.Vote[] memory votes = IGaugeController(gaugeController).getVotes(address(this), voter_);
        uint256 voteCount = votes.length;

        if (voteCount > 0) {
            uint256 accummulator;
            uint256 globalNumerator = _lastProcessedVotePowerOf[voter_] * insuranceCapacity_ * epochLength_;
            // rateOnLine scaled to correct fraction for week => multiply by (WEEK / YEAR) * (1 / 1e18)
            // votePowerBPS scaled to correct fraction => multiply by (1 / 10000)
            uint256 globalDenominator = votePowerSum_ * YEAR * 1e18 * 10000;
            for (uint256 i = 0 ; i < voteCount; i++) {
                accummulator += IGaugeController(gaugeController).getRateOnLineOfGauge(votes[i].gaugeID) * votes[i].votePowerBPS;
            }
            return accummulator * globalNumerator / globalDenominator;
        } else {
            return 0;
        }
    }
}
