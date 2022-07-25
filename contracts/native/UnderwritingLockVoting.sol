// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./../utils/Governable.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../interfaces/staking/IUnderwritingLocker.sol";
import "./../interfaces/staking/IUnderwritingLockVoting.sol";

// TO-DO
// Custom Error types
// Formula for _calculateVotePower()
// Formula for _calculateVoteFee()

/**
 * @title UnderwritingLockVoting
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
contract UnderwritingLockVoting is IUnderwritingLockVoting, ReentrancyGuard, Governable {
    /***************************************
    GLOBAL VARIABLES
    ***************************************/
    using EnumerableMap for EnumerableMap.UintToUintMap;

    /// @notice Token locked in [`UnderwritingLocker`](./UnderwritingLocker).
    address public override token;

    /// @notice Revenue router address ($UWE voting fees will be transferred here).
    address public override revenueRouter;

    /// @notice Address of [`UnderwritingLocker`](./UnderwritingLocker)
    address public override underwritingLocker;

    /// @notice Registry address
    address public override registry;

    uint256 constant public override WEEK = 604800;

    /// @notice lockId => insurance gauge vote
    /// @dev Use an enumerable map so that governance can iterate through each vote after each epoch, and relay vote data to the GaugeController
    /// @dev Input validation for lockId will be performed in this contract
    /// @dev Input validation for insurance gauge vote will be performed in GaugeController.sol, when vote data is relayed at end of each epoch
    /// @dev If vote is invalid value, it will be skipped and ignored (rather than revert) 
    EnumerableMap.UintToAddressMap private _votes;

    // lockId => timestamp of last time (rounded down to weeks) that vote was processed via [`processVotes()`](#processvotes).
    mapping(uint256 => uint256) private _lastTimeVoteProcessed;

    /// @notice lockId => lockManager address
    /// @dev We have several mappings using lockId as the key, we may intuitively consider merging the values types into a struct and use a single mapping. 
    /// @dev One argument against this is that we need to iterate through each stored vote in [`processVotes()`](#processvotes), which is unbounded and thus runs the risk of exceeding the gas limit. 
    /// @dev By minimising the entry size of the mapping we iterate through, we minimise the risk of exceeding the gas limit. We also increase the ceiling on voteBatchSize value that we can use.
    mapping(uint256 => address) public override lockManagers;

    /// @notice Batch size of votes that will be processed in a single call of [`processVotes()`](#processvotes).
    uint256 public override voteBatchSize;

    /// @notice Epoch start timestamp (rounded to weeks) => gaugeID => total vote power
    mapping(uint256 => mapping(uint256 => uint256)) private override _votePowerOfGaugeForEpoch;

    /// @notice Last timestamp (rounded down to weeks) that all stored votes were processed
    uint256 public override lastTimeAllVotesProcessed;

    /**
     * @notice Constructs the UnderwritingLockVoting contract.
     * @dev Requires 'uwe', 'revenueRouter' and 'underwritingLocker' addresses to be set in the Registry.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param registry_ The [`Registry`](./Registry) contract address.
     */
    constructor(address governance_, address registry_) Governable(governance_) {
        // set registry
        _setRegistry(registry_);
        // Default value of 500 (experiment to find suitable default value)
        voteBatchSize = 500;
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get current information about a lock.
     * @param lockID The ID of the lock to query.
     * @return exists True if the lock exists.
     * @return owner The owner of the lock or the zero address if it doesn't exist.
     * @return amount Token amount staked in lock.
     * @return end Timestamp of lock end.
     */
    function _getLockInfo(uint256 lockID) internal view returns (bool exists, address owner, uint256 amount, uint256 end) {
        IUnderwritingLocker locker = IUnderwritingLocker(underwritingLocker);
        exists = locker.exists(lockID);
        if(exists) {
            owner = locker.ownerOf(lockID);
            (amount, end) = locker.locks(lockID);
        } else {
            owner = address(0x0);
            amount = 0;
            end = 0;
        }
        return (exists, owner, amount, end);
    }

    /**
     * @notice Calculates the vote power (for the current epoch) of a lock with specified `amount` and `end` values
     * @param amount The amount of token in the underwriting lock.
     * @param end The unlock timestamp of the lock.
     * @return votePower The vote power for the lock (for the current epoch)
     */
    function _calculateVotePower(uint256 amount, uint256 end) internal view returns (uint256 votePower) {
    }

    /**
     * @notice Computes voting fee (in token amount)
     * @dev Requires 'uwe', 'revenueRouter' and 'underwritingLocker' addresses to be set in the Registry.
     * @param _registry The registry address to set.
     */
    function _calculateVoteFee(uint256 amount, uint256 end) internal view returns (uint256 fee) {
    }

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

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Obtain vote power sum for a gauge for a given epoch
     * @param epochStartTimestamp The ID of the lock that was altered.
     * @param gaugeID The old owner of the lock.
     * @returns votePower
     */
    function getVotePowerOfGaugeForEpoch(uint256 epochStartTimestamp, uint256 gaugeID) external view override returns (uint256 votePower) {
        return _votePowerOfGaugeForEpoch[epochStartTimestamp][gaugeID];
    }

    /**
     * @notice Get vote power (for the current epoch) for a lock
     * @param lockID The ID of the lock to query.
     * @return votePower
     */
    function votePower(uint256 lockID) external view override returns (uint256 votePower) {
        // Expect revert if lockID doesn't exist
        (uint256 amount, uint256 end) = IUnderwritingLocker(underwritingLocker).lock(lockID);
        return _calculateVotePower(amount, end);
    }

    /**
     * @notice Get currently registered vote for a lockID.
     * @param lockID The ID of the lock to query.
     * @return gaugeID The ID of the gauge the lock has voted for, returns 0 if either lockID or vote doesn't exist
     */
    function getVote(uint256 lockID) external view override returns (uint256 gaugeID) {
        (bool success, gaugeID) = _votes.tryGet(lockID);
    }

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
    function getEpochEndTimestamp() public view override returns (uint256 timestamp) {
        _getEpochEndTimestamp();
    }

    /***************************************
    EXTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Register a vote for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or manager
     * @param lockID The ID of the lock to vote for.
     * @param gaugeID The ID of the gauge to vote for.
     */
    function vote(uint256 lockID, uint256 gaugeID) external override {
        // This require to deal with edge case where if a user puts a new vote in the time window between an epoch end and processVotes() returning true for that epoch, we do not know (with the current setup) whether that lockID has a previous vote or not (that then needs to be included in processVotes());
        require ( _getEpochStartTime() == lastTimeAllVotesProcessed, "votes not processed for last epoch");
        _vote(lockID, gaugeID);
    }

    /**
     * @notice Register multiple votes for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or manager
     * @param lockIDs Array of lockIDs to vote for.
     * @param gaugeIDs Array of gaugeIDs to vote for.
     */
    function voteMultiple(uint256[] calldata lockIDs, uint256[] calldata gaugeIDs) external override {
        require (lockIDs.length == gaugeIDs.length, "array length mismatch");
        require ( _getEpochStartTime() == lastTimeAllVotesProcessed, "votes not processed for last epoch");
        for (uint256 i = 0; i < lockIDs.length; i++) {
            _vote(lockIDs[i], gaugeIDs[i]);
        }
    }

    /**
     * @notice Set the manager for a given lock
     * Can only be called by the lock owner
     * To remove a manager, the manager can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockID The ID of the lock to set the manager of.
     * @param manager_ Address of intended lock manager
     */
    function setLockManager(uint256 lockID, address manager_) external override {
        require( IUnderwritingLock(underwritingLocker).ownerOf(lockID) == msg.sender, "not owner" );
        lockManagers[lockID] = manager_;
        emit LockManagerSet(lockID, manager_);
    }

    /***************************************
    INTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Sets registry and related contract addresses.
     * @dev Requires 'uwe', 'revenueRouter' and 'underwritingLocker' addresses to be set in the Registry.
     * @param _registry The registry address to set.
     */
    function _setRegistry(address _registry) internal {
        require(_registry != address(0x0), "zero address registry");
        registry = _registry;
        IRegistry reg = IRegistry(_registry);
        // set revenueRouter
        (, address revenueRouterAddr) = reg.tryGet("revenueRouter");
        require(revenueRouterAddr != address(0x0), "zero address revenueRouter");
        revenueRouter = revenueRouterAddr;
        // set token ($UWE)
        (, address uweAddr) = reg.tryGet("uwe");
        require(uweAddr != address(0x0), "zero address uwe");
        token = uweAddr;
        // set underwritingLocker
        (, address underwritingLockerAddr) = reg.tryGet("underwritingLocker");
        require(underwritingLockerAddr != address(0x0), "zero address underwritingLocker");
        underwritingLocker = underwritingLockerAddr;
        emit RegistrySet(_registry);
    }

    /**
     * @notice Register a vote for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or manager
     * @param lockID The ID of the lock to vote for.
     * @param gaugeID Address of intended lock manager
     */
    function _vote(uint256 lockID, uint256 gaugeID) internal  {
        require( IUnderwritingLock(underwritingLocker).ownerOf(lockID) == msg.sender || lockManagers[lockID] == msg.sender, "not owner or manager" );
        _votes.set(lockID, gaugeID);
        emit Vote(lockID, gaugeID, msg.sender, _getEpochEndTimestamp(), votePower(lockID));
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * @dev Requires 'uwe', 'revenueRouter' and 'underwritingLocker' addresses to be set in the Registry.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _registry The address of `Registry` contract.
     */
    function setRegistry(address _registry) external override onlyGovernance {
        _setRegistry(_registry);
    }

    /**
     * @notice Sets voteBatchSize
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _voteBatchSize Batch size of votes that will be processed in a single call of [`processVotes()`](#processvotes)
     */
    function setVoteBatchSize(uint256 _voteBatchSize) external override onlyGovernance {
        voteBatchSize = _voteBatchSize;
        emit VoteBatchSizeSet(_voteBatchSize);
    }

    /**
     * @notice Processes votes for the last epoch passed, batches $UWE voting fees and sends to RevenueRouter.sol, updates aggregate voting data (for each gauge) 
     * @dev Designed to be called multiple times until this function returns true (all stored votes are processed)
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Edge case when processVotes() is not called to completion for certain epochs - GaugeController only take vote power for lastTimeAllVotesProcessed
     * @return epochProcessed True if all stored votes are processed for the last epoch, false otherwise
     */
    function processVotes() external override onlyGovernance nonReentrant returns (bool epochProcessed) {
        require(lastTimeAllVotesProcessed != (block.timestamp * WEEK) / WEEK, "last epoch already processed")

        uint256 epochStartTimestamp = getEpochStartTimestamp();
        uint256 locks_processed = 0;
        uint256 sum_voting_fee = 0;
        let n_votes = _votes.length();
        let vote_index = 0; // Vote index starts from 0, and must be strictly less than n_votes

        // Iterate through each vote
        // This is still technically an unbounded loop because n_votes is unbounded, need to test what the limit is here.
        while locks_processed <= voteBatchSize && vote_index < n_votes {
            (uint256 lockID, uint256 gaugeID) = _votes.at(vote_index)

            // If lockID hasn't been processed for last epoch, then process the individual lcok
            if _lastTimeVoteProcessed[lockID] != epochStartTimestamp {
                (,,uint256 amount, uint256 end) = _getLockInfo(lockID);
                sum_voting_fee += _calculateVoteFee(amount, end);
                _votePowerOfGaugeForEpoch[epochStartTimestamp][gaugeID] += _calculateVotePower(amount, end);
                _lastTimeVoteProcessed[lockID] = epochStartTimestamp;
                locks_processed += 1;
                emit VoteProcessed(lockID, gaugeID, epochStartTimestamp);
            }
        }

        SafeERC20.safeTransferFrom(
            IERC20(IUnderwritingLocker(underwritingLocker).token()), 
            underwritingLocker, 
            revenueRouter,
            sum_voting_fee,
        );

        // If no locks processed in this invocation or we don't reach full batch size, make assumption that all locks have been processed
        if locks_processed != voteBatchSize && n_votes > 0 {
            lastTimeAllVotesProcessed = epochStartTimestamp;
            emit AllVotesProcessed(epochStartTimestamp);
            return true;
        }

        return false;
    }
}
