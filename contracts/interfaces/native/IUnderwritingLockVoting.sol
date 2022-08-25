// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IGaugeVoter.sol";
import "./GaugeStructs.sol";

/**
 * @title IUnderwritingLockVoting
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
interface IUnderwritingLockVoting is IGaugeVoter {

    /***************************************
    CUSTOM ERRORS
    ***************************************/

    /// @notice Thrown when zero address is given as an argument.
    /// @param contractName Name of contract for which zero address was incorrectly provided.
    error ZeroAddressInput(string contractName);

    /// @notice Thrown when array arguments are mismatched in length (and need to have the same length);
    error ArrayArgumentsLengthMismatch();

    /// @notice Thrown when setDelegate() attempted for a non-owner.
    error NotOwner();

    /// @notice Thrown when vote is attempted before last epoch's premiums have been successfully charged.
    error LastEpochPremiumsNotCharged();

    /// @notice Thrown when vote() attempted by a non-owner or non-delegate.
    error NotOwnerNorDelegate();

    /// @notice Thrown when vote is attempted for voter with no underwriting locks.
    error VoterHasNoLocks();

    /// @notice Thrown if attempt to vote with single vote having votePowerBPS > 10000.
    error SingleVotePowerBPSOver10000();

    /// @notice Thrown if attempt to vote with total votePowerBPS > 10000.
    error TotalVotePowerBPSOver10000();

    /// @notice Thrown when non-gaugeController attempts to call setLastRecordedVotePower().
    error NotGaugeController();

    /// @notice Thrown when chargePremiums is attempted before the last epoch's votes have been successfully processed through gaugeController.updateGaugeWeights().
    error GaugeWeightsNotYetUpdated();

    /// @notice Thrown when chargePremiums() attempted when all premiums have been charged for the last epoch.
    /// @param epochTime Timestamp of endtime for epoch already processed.
    error LastEpochPremiumsAlreadyProcessed(uint256 epochTime);

    /// @notice Thrown when chargePremiums() is called by neither governance nor updater, or governance is locked.
    error NotUpdaterNorGovernance();

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a delegate is set for a voter.
    event DelegateSet(address indexed voter, address indexed delegate);

    /// @notice Emitted when the Registry is set.
    event RegistrySet(address indexed registry);

    /// @notice Emitted when the Updater is set.
    event UpdaterSet(address indexed updater);

    /// @notice Emitted when a vote is added.
    event VoteAdded(address indexed voter, uint256 indexed gaugeID, uint256 votePowerBPS);

    /// @notice Emitted when a vote is added.
    event VoteChanged(address indexed voter, uint256 indexed gaugeID, uint256 newVotePowerBPS, uint256 oldVotePowerBPS);

    /// @notice Emitted when a vote is removed.
    event VoteRemoved(address indexed voter, uint256 indexed gaugeID);

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

    /// @notice Address of [`GaugeController`](./GaugeController).
    function gaugeController() external view returns (address);

    /// @notice Registry address
    function registry() external view returns (address);

    /// @notice Updater address.
    function updater() external view returns (address);

    /**
     * @notice End timestamp for last epoch that premiums were charged for all stored votes.
     * @return timestamp_
     */
    function lastTimePremiumsCharged() external view returns (uint256 timestamp_);

    /**
     * @notice Get delegate for a given voter.
     * @param voter_ The address of the voter to query for.
     * @return delegate Zero address if no lock delegate.
     */
    function delegateOf(address voter_) external view returns (address delegate);

    /**
     * @notice voter => used voting power percentage (max of 10000 BPS)
     * @param voter_ The address of the voter to query for.
     * @return usedVotePowerBPS Total usedVotePowerBPS.
     */
    function usedVotePowerBPSOf(address voter_) external view returns (uint256 usedVotePowerBPS);

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get all current votes for a voter.
     * @param voter_ Address of voter to query for.
     * @return votes Array of Vote{gaugeID, votePowerBPS}.
     */
    function getVotes(address voter_) external view returns (GaugeStructs.Vote[] memory votes);

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
     * @notice Query whether voting is currently open.
     * @return True if voting is open for this epoch, false otherwise.
     */
    function isVotingOpen() external view returns (bool);

    /**
     * @notice Get array of voters who have delegated their vote to a given address.
     * @param delegate_ Address to query array of voting delegators for.
     * @return votingDelegators Array of voting delegators.
     */
    function getVotingDelegatorsOf(address delegate_) external view returns (address[] memory votingDelegators);

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
    function vote(address voter_, uint256 gaugeID_, uint256 votePowerBPS_) external;

    /**
     * @notice Register multiple gauge votes.
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeIDs_ Array of gauge IDs to vote for.
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteMultiple(address voter_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) external;

    /**
     * @notice Register a single voting configuration for multiple voters.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voters.
     * @param gaugeIDs_ Array of gauge IDs to vote for.
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) external;

    /**
     * @notice Removes a vote.
     * @notice Votes cannot be removed while voting is frozen.
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeID_ The ID of the gauge to remove vote for.
     */
    function removeVote(address voter_, uint256 gaugeID_) external;

    /**
     * @notice Remove multiple gauge votes.
     * @notice Votes cannot be removed while voting is frozen.
     * Can only be called by the voter or vote delegate.
     * @param voter_ The voter address.
     * @param gaugeIDs_ Array of gauge IDs to remove votes for.
     */
    function removeVoteMultiple(address voter_, uint256[] memory gaugeIDs_) external;

    /**
     * @notice Remove gauge votes for multiple voters.
     * @notice Votes cannot be removed while voting is frozen.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voter addresses.
     * @param gaugeIDs_ Array of gauge IDs to remove votes for.
     */
    function removeVotesForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_) external;

    /**
     * @notice Set the voting delegate for the caller.
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000.
     * @param delegate_ Address of intended delegate
     */
    function setDelegate(address delegate_) external;

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
     * @notice Set updater address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param updater_ The address of the new updater.
     */
    function setUpdater(address updater_) external;

    /**
     * @notice Charge premiums for votes.
     * @dev Designed to be called in a while-loop with the condition being `lastTimePremiumsCharged != epochStartTimestamp` and using the maximum custom gas limit.
     * @dev Requires GaugeController.updateGaugeWeights() to be run to completion for the last epoch.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function chargePremiums() external;
}
