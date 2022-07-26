// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IGaugeVoter.sol";

/**
 * @title IUnderwritingLockVoting
 * @author solace.fi
 * @notice Manages individual votes in Solace Native insurance gauges for owners and managers of [`UnderwritingLocker`](./UnderwritingLocker).
 * 
 * Each underwriting lock entitles the owner to a vote for a Solace Native insurance gauge.
 * Votes will count only for the current epoch (one week), and a new vote will need to be registered for the next epoch.
 * Each vote will stream $UWE to the revenue router.
 * 
 * The `votePower` of an underwriting lock scales with i.) locked amount, and ii.) lock duration
 * `votePower` can be viewed with [`votePower()`](#votePower)
 * 
 * Underwriting lock owners can call [`setLockManager()`](#setlockmanager) to assign a manger who can place votes on behalf of the lock owner
 * Underwriting lock managers cannot interact with [`UnderwritingLocker`](./UnderwritingLocker) to do the following for a lock they do not own:
 * extendLock, withdraw, emergencyWithdraw, or transfer the underwriting lock
 * 
 * To cast a vote for the current epoch, either the underwriting lock owner or manager can call [`vote()`](#vote) or [`voteMultiple()`](#voteMultiple)
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
    error LastEpochAlreadyProcessed(uint256 epochTime);

    /// @notice Thrown when setLockManager() attempted for a non-owner.
    error NotOwner();

    /// @notice Thrown when vote() attempted by a non-owner or non-manager.
    error NotOwnerNorManager();

    /// @notice Thrown when array arguments are mismatched in length (and need to have the same length);
    error ArrayArgumentsLengthMismatch();

    /// @notice Thrown when vote is attempted before last epoch's votes have been successfully processed.
    error LastEpochVotesNotProcessed();

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a manager is set for a lock.
    event LockManagerSet(uint256 indexed lockID, address indexed manager);

    /// @notice Emitted when the Registry is set.
    event RegistrySet(address indexed registry);

    /// @notice Emitted when the Vote is registered.
    /// epochTimestamp is the timestamp for the epoch (rounded down to weeks) that the vote counts for
    event Vote(uint256 indexed lockID, uint256 indexed gaugeID, address voter, uint256 indexed epochTimestamp, uint256 votePower);

    /// @notice Emitted when voteBatchSize is set.
    event VoteBatchSizeSet(uint256 indexed voteBatchSize);

    /// @notice Emitted a vote for an epoch has been processed
    event VoteProcessed(uint256 indexed lockID, uint256 indexed gaugeID, uint256 indexed epochStartTimestamp);

    /// @notice Emitted all stored votes for an epoch have been processed.
    event AllVotesProcessed(uint256 indexed epochTimestamp);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Token locked in [`UnderwritingLocker`](./UnderwritingLocker).
    function token() external view returns (address);

    /// @notice Revenue router address ($UWE voting fees will be transferred here).
    function revenueRouter() external view returns (address);

    /// @notice Address of [`UnderwritingLocker`](./UnderwritingLocker)
    function underwritingLocker() external view returns (address);

    /// @notice Registry address
    function registry() external view returns (address);

    /// @notice Batch size of votes that will be processed in a single call of [`processVotes()`](#processvotes).
    function voteBatchSize() external view returns (uint256);

    function WEEK() external view returns (uint256);

    /// @notice Get lockManager for a given lockId
    /// @param lockID_ The ID of the lock to query for
    /// @return lockManager
    function lockManagers(uint256 lockID_) external view returns (address lockManager);

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/
    /**
     * @notice Get vote power (for the current epoch) for a lock
     * @param lockID_ The ID of the lock to query.
     * @return votePower
     */
    function votePower(uint256 lockID_) external view returns (uint256 votePower);

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

    /***************************************
    EXTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Register a vote for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or manager
     * @param lockID_ The ID of the lock to vote for.
     * @param gaugeID_ Address of intended lock manager
     */
    function vote(uint256 lockID_, uint256 gaugeID_) external;

    /**
     * @notice Register multiple votes for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or manager
     * @param lockIDs_ Array of lockIDs to vote for.
     * @param gaugeIDs_ Array of gaugeIDs to vote for.
     */
    function voteMultiple(uint256[] calldata lockIDs_, uint256[] calldata gaugeIDs_) external;

    /**
     * @notice Set the manager for a given lock
     * Can only be called by the lock owner
     * To remove a manager, the manager can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockID_ The ID of the lock to set the manager of.
     * @param manager_ Address of intended lock manager
     */
    function setLockManager(uint256 lockID_, address manager_) external;

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
     * @notice Sets voteBatchSize
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param voteBatchSize_ Batch size of votes that will be processed in a single call of [`processVotes()`](#processvotes)
     */
    function setVoteBatchSize(uint256 voteBatchSize_) external;
    /**
     * @notice Processes votes for the last epoch passed, batches $UWE voting fees and sends to RevenueRouter.sol, updates aggregate voting data (for each gauge) 
     * @dev Designed to be called multiple times until this function returns true (all stored votes are processed)
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Edge case when processVotes() is not called to completion for certain epochs - GaugeController only take vote power for lastTimeAllVotesProcessed
     * @return epochProcessed True if all stored votes are processed for the last epoch, false otherwise
     */
    function processVotes() external returns (bool epochProcessed);
}
