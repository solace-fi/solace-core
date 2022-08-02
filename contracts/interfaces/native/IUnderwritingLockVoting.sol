// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IGaugeVoter.sol";

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

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a delegate is set for a lock.
    event LockDelegateSet(uint256 indexed lockID, address indexed delegate);

    /// @notice Emitted when the Registry is set.
    event RegistrySet(address indexed registry);

    /// @notice Emitted when the Vote is registered.
    /// epochTimestamp is the timestamp for the epoch (rounded down to weeks) that the vote counts for
    event Vote(uint256 indexed lockID, uint256 indexed gaugeID, address voter, uint256 indexed epochTimestamp, uint256 votePower);

    /// @notice Emitted when the Vote processed by GaugeController.
    /// epochTimestamp is the timestamp for the epoch (rounded down to weeks) that the vote counts for
    event VoteProcessed(uint256 indexed lockID, uint256 indexed gaugeID, uint256 indexed epochTimestamp, uint256 votePower);

    /// @notice Emitted a premium is charged.
    event PremiumCharged(uint256 indexed lockID, uint256 indexed epochStartTimestamp, uint256 premium);

    /// @notice Emitted all stored votes for an epoch have been processed.
    event AllVotesProcessed(uint256 indexed epochTimestamp);

    /// @notice Emitted when premiiums for all stored votes have been processed in an epoch.
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
     * @notice Get lockDelegate for a given lockId.
     * @param lockID_ The ID of the lock to query for.
     * @return lockDelegate Zero address if no lock delegate.
     */
    function lockDelegateOf(uint256 lockID_) external view returns (address lockDelegate);

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
     * @notice Get currently registered vote for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return gaugeID The ID of the gauge the lock has voted for, returns 0 if either lockID or vote doesn't exist
     */
    function getVote(uint256 lockID_) external view returns (uint256 gaugeID);

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
     * @notice Register a vote for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or delegate
     * @param lockID_ The ID of the lock to vote for.
     * @param gaugeID_ Address of intended lock delegate
     */
    function vote(uint256 lockID_, uint256 gaugeID_) external;

    /**
     * @notice Register multiple votes for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or delegate
     * @param lockIDs_ Array of lockIDs to vote for.
     * @param gaugeIDs_ Array of gaugeIDs to vote for.
     */
    function voteMultiple(uint256[] calldata lockIDs_, uint256[] calldata gaugeIDs_) external;

    /**
     * @notice Set the delegate for a given lock
     * Can only be called by the lock owner
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockID_ The ID of the lock to set the delegate of.
     * @param delegate_ Address of intended lock delegate
     */
    function setLockDelegate(uint256 lockID_, address delegate_) external;

    /**
     * @notice Set delegates for multiple lock
     * Can only be called by the lock owner
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockIDs_ Array of lock IDs.
     * @param delegates_ Array of addresses of intended lock delegates.
     */
    function setLockDelegateMultiple(uint256[] calldata lockIDs_, address[] calldata delegates_) external;

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
