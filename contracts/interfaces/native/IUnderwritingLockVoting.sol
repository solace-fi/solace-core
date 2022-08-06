// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IGaugeVoter.sol";
import "./GaugeStructs.sol";

/**
 * @title IUnderwritingLockVoting
 * @author solace.fi
 * @notice Manages individual votes in Solace Native insurance gauges for owners and delegates of [`UnderwritingLocker`](./UnderwritingLocker).
 * 
 * Each underwriting lock entitles the owner to a vote for a Solace Native insurance gauge.
 * Votes will count only for the current epoch (one week), and a new vote will need to be registered for the next epoch.
 * Each vote will stream $UWE to the revenue router.
 * 
 * The `votePower` of an underwriting lock scales with i.) locked amount, and ii.) lock duration
 * `votePower` can be viewed with [`getVotePower()`](#getVotePower)
 * 
 * Underwriting lock owners can call [`setLockDelegate()`](#setlockdelegate) to assign a manger who can place votes on behalf of the lock owner
 * Underwriting lock delegates cannot interact with [`UnderwritingLocker`](./UnderwritingLocker) to do the following for a lock they do not own:
 * extendLock, withdraw, emergencyWithdraw, or transfer the underwriting lock
 * 
 * To cast a vote for the current epoch, either the underwriting lock owner or delegate can call [`vote()`](#vote) or [`voteMultiple()`](#voteMultiple)
 *
 * After every epoch, governance needs to make two functions calls:
 * i.) [`processVotes()`](#processvotes) which will iterate through each stored vote, batch $UWE voting fees and send to the RevenueRouter, and update aggregate voting data for the last epoch
 * ii.) Call updateWeights() on GaugeController.sol. This will pull aggregate voting data from each Voting contract and update insurance gauge weights.
 *
 * There are two benefits to this voting data flow
 * i.) It removes GaugeController.sol as a dependency to deploy this contract
 * ii.) It is possible that in the future there will be more than one source of voting data to GaugeController.sol, i.e. owners of xsLocks may also have voting rights. 
 * One drawback is that it requires two regular function calls, rather than one.
 */
interface IUnderwritingLockVoting is IGaugeVoter {

    /***************************************
    CUSTOM ERRORS
    ***************************************/

    /// @notice Thrown when zero address is given as an argument.
    /// @param contractName Name of contract for which zero address was incorrectly provided.
    error ZeroAddressInput(string contractName);

    /// @notice Thrown when processVote() attempted when all stored votes have already been processed for the last epoch.
    /// @param epochTime Timestamp of endtime for epoch already processed.
    error LastEpochVotesAlreadyProcessed(uint256 epochTime);

    /// @notice Thrown when chargePremiums() attempted when all premiums have been charged for the last epoch.
    /// @param epochTime Timestamp of endtime for epoch already processed.
    error LastEpochPremiumsAlreadyProcessed(uint256 epochTime);

    /// @notice Thrown when setLockDelegate() attempted for a non-owner.
    error NotOwner();

    /// @notice Thrown when vote() attempted by a non-owner or non-delegate.
    error NotOwnerNorDelegate();

    /// @notice Thrown when array arguments are mismatched in length (and need to have the same length);
    error ArrayArgumentsLengthMismatch();

    /// @notice Thrown when chargePremiums is attempted before last epoch's votes have been successfully processed through gaugeController.updateGaugeWeights().
    error GaugeWeightsNotYetUpdated();

    /// @notice Thrown when vote is attempted before last epoch's premiums have been successfully charged.
    error LastEpochPremiumsNotCharged();

    /// @notice Thrown when getVote() cannot get a vote for a given lockID. Either the lockID, the vote for the lockID, or both don't exist.
    error VoteNotFound();

    /// @notice Thrown when non-gauge controller attempts to call setLastRecordedVotePower().
    error NotGaugeController();

    /// @notice Thrown when vote is attempted for voter with no underwriting locks.
    error VoterHasNoLocks();

    /// @notice Thrown if attempt to vote with single vote having votePowerBPS > 10000
    error SingleVotePowerBPSOver10000();

    /// @notice Thrown if attempt to vote with total votePowerBPS > 10000
    error TotalVotePowerBPSOver10000();

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a delegate is set for a voter.
    event LockDelegateSet(address indexed voter, address indexed delegate);

    /// @notice Emitted when the Registry is set.
    event RegistrySet(address indexed registry);

    /// @notice Emitted when the Vote is registered.
    /// epochTimestamp is the timestamp for the epoch (rounded down to weeks) that the vote counts for
    event Vote(uint256 indexed lockID, uint256 indexed gaugeID, address voter, uint256 indexed epochTimestamp, uint256 votePower);

    /// @notice Emitted when a vote is added.
    event VoteAdded(address indexed voter, uint256 indexed gaugeID, uint256 votePowerBPS);

    /// @notice Emitted when a vote is added.
    event VoteChanged(address indexed voter, uint256 indexed gaugeID, uint256 newVotePowerBPS, uint256 oldVotePowerBPS);

    /// @notice Emitted when a vote is removed.
    event VoteRemoved(address indexed voter, uint256 indexed gaugeID);

    /// @notice Emitted a premium is charged.
    event PremiumCharged(uint256 indexed lockID, uint256 indexed epochStartTimestamp, uint256 premium);

    /// @notice Emitted all stored votes for an epoch have been processed.
    event AllVotesProcessed(uint256 indexed epochTimestamp);

    /// @notice Emitted when chargePremiums was partially completed and needs to be called again.
    event IncompletePremiumsCharge();

    /// @notice Emitted when premiums for all stored votes have been processed in an epoch.
    event AllPremiumsCharged(uint256 indexed epochTimestamp);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Revenue router address ($UWE voting fees will be transferred here).
    function revenueRouter() external view returns (address);

    /// @notice Address of [`UnderwritingLocker`](./UnderwritingLocker)
    function underwritingLocker() external view returns (address);

    /// @notice Gauge controller address.
    function gaugeController() external view returns (address);

    /// @notice Registry address
    function registry() external view returns (address);

    /**
     * @notice Get delegate for a given voter.
     * @param voter_ The address of the voter to query for.
     * @return delegate Zero address if no lock delegate.
     */
    function lockDelegateOf(address voter_) external view returns (address delegate);

    /**
     * @notice Obtain end timestamp (rounded down to weeks) for the epoch where all premiums were charged.
     * @return timestamp_
     */
    function lastTimePremiumsCharged() external view returns (uint256 timestamp_);

    function WEEK() external view returns (uint256);
    function MONTH() external view returns (uint256);
    function YEAR() external view returns (uint256);

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get votes for a voter.
     * @param voter_ Address of voter to query for.
     * @return votes Array of votes{gaugeID, votePowerBPS}.
     */
    function getVotes(address voter_) external view returns (GaugeStructs.Vote[] memory votes);

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
     * @notice Query whether voting is open.
     * @return True if voting is open for this epoch, false otherwise.
     */
    function isVotingOpen() external view returns (bool);

    /***************************************
    EXTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Directly register a single vote for a gauge. Can either add or change a vote.
     * @notice Can also technically remove a vote (votePowerBPS_ == 0), however the difference with removeVote() is that vote() will revert if the voter has no locks (no locks => no right to vote, but may have dead locks created previously).
     * @notice GaugeController.updateGaugeWeights() will remove these dead locks, however the user can also preemptively remove dead locks through removeVote().
     * @notice Votes cannot be added or modified before all stored votes have been processed for the epoch (GaugeController.updateGaugeWeights() => UnderwritingLockVoting.chargePremiums())
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeID_ The ID of the gauge to vote for.
     * @param votePowerBPS_ Vote power BPS to assign to this vote
     */
    function vote(address voter_, uint256 gaugeID_, uint256 votePowerBPS_) external;

    /**
     * @notice Directly register multiple gauge votes. Can either add or change votes.
     * @notice Can also technically remove votes (votePowerBPS_ == 0), however the difference with removeVoteMultiple() is that voteMultiple() will revert if the voter has no locks (no locks => no right to vote, but may have dead locks created previously).
     * @notice GaugeController.updateGaugeWeights() will remove these dead locks, however the user can also preemptively remove dead locks through removeVote().
     * @notice Votes cannot be added or modified before all stored votes have been processed for the epoch (GaugeController.updateGaugeWeights() => UnderwritingLockVoting.chargePremiums())
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeIDs_ Array of gauge IDs to vote for.
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteMultiple(address voter_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) external;

    /**
     * @notice Removes a vote.
     * @notice Votes cannot be removed before all stored votes have been processed for the epoch (GaugeController.updateGaugeWeights() => UnderwritingLockVoting.chargePremiums()).
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeID_ The ID of the gauge to remove vote for.
     */
    function removeVote(address voter_, uint256 gaugeID_) external;

    /**
     * @notice Remove multiple gauge votes.
     * @notice Votes cannot be removed before all stored votes have been processed for the epoch (GaugeController.updateGaugeWeights() => UnderwritingLockVoting.chargePremiums()).
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeIDs_ Array of gauge IDs to remove votes for.
     */
    function removeVoteMultiple(address voter_, uint256[] memory gaugeIDs_) external;

    /**
     * @notice Set the voting delegate for the caller.
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param delegate_ Address of intended delegate
     */
    function setLockDelegate(address delegate_) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * @dev Requires 'uwe', 'revenueRouter' and 'underwritingLocker' addresses to be set in the Registry.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
     */
    function setRegistry(address registry_) external;

    /**
     * @notice Charge premiums for votes.
     * @dev Requires all votes to be processed for the last epochProcesses votes for the last epoch passed, batches $UWE voting fees and sends to RevenueRouter.sol, updates aggregate voting data (for each gauge) 
     * @dev Designed to be called multiple times until this function returns true (all stored votes are processed)
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function chargePremiums() external;
}
