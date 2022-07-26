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
import "./../interfaces/native/IUnderwritingLocker.sol";
import "./../interfaces/native/IUnderwritingLockVoting.sol";

// TO-DO
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
contract UnderwritingLockVoting is 
        IUnderwritingLockVoting, 
        ReentrancyGuard, 
        Governable 
    {
    using EnumerableMap for EnumerableMap.UintToUintMap;

    /***************************************
    GLOBAL PUBLIC VARIABLES
    ***************************************/

    /// @notice Token locked in [`UnderwritingLocker`](./UnderwritingLocker).
    address public override token;

    /// @notice Revenue router address ($UWE voting fees will be transferred here).
    address public override revenueRouter;

    /// @notice Address of [`UnderwritingLocker`](./UnderwritingLocker)
    address public override underwritingLocker;

    /// @notice Registry address
    address public override registry;

    /// @notice Batch size of votes that will be processed in a single call of [`processVotes()`](#processvotes).
    uint256 public override voteBatchSize;

    /// @notice End timestamp (rounded down to weeks) for epoch for which all stored votes were processed in full
    uint256 public override lastTimeAllVotesProcessed;

    uint256 constant public override WEEK = 604800;

    /// @notice lockId => lockManager address
    /// @dev We have several mappings using lockId as the key, we may intuitively consider merging the values types into a struct and use a single mapping. 
    /// @dev One argument against this is that we need to iterate through each stored vote in [`processVotes()`](#processvotes), which is unbounded and thus runs the risk of exceeding the gas limit. 
    /// @dev By minimising the entry size of the mapping we iterate through, we minimise the risk of exceeding the gas limit. We also increase the ceiling on voteBatchSize value that we can use.
    mapping(uint256 => address) public override lockManagers;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    // Ideally we would like an EnumerableMap of (lockId => {gaugeID, lastTimeVoteProcessed, lockManager}) to merge lockManagers, _votes and _lastTimeVoteProcessed mappings. We would need to create a custom data structure to do this.

    /// @notice lockId => insurance gauge vote
    /// @dev Use an enumerable map so that governance can iterate through each vote after each epoch, and relay vote data to the GaugeController
    /// @dev Input validation for lockId will be performed in this contract
    /// @dev Input validation for insurance gauge vote will be performed in GaugeController.sol, when vote data is relayed at end of each epoch
    /// @dev If vote is invalid value, it will be skipped and ignored (rather than revert) 
    EnumerableMap.UintToUintMap internal _votes;

    // lockId => timestamp of last time (rounded down to weeks) that vote was processed via [`processVotes()`](#processvotes).
    mapping(uint256 => uint256) internal _lastTimeVoteProcessed;

    /// @notice Epoch start timestamp (rounded to weeks) => gaugeID => total vote power
    mapping(uint256 => mapping(uint256 => uint256)) internal _votePowerOfGaugeForEpoch;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the UnderwritingLockVoting contract.
     * @dev Requires 'uwe', 'revenueRouter' and 'underwritingLocker' addresses to be set in the Registry.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param registry_ The [`Registry`](./Registry) contract address.
     */
    constructor(address governance_, address registry_) Governable(governance_) {
        _setRegistry(registry_);
        // Default value of 500 (experiment to find suitable default value)
        voteBatchSize = 500;
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get current information about a lock.
     * @param lockID_ The ID of the lock to query.
     * @return exists True if the lock exists.
     * @return owner The owner of the lock or the zero address if it doesn't exist.
     * @return amount Token amount staked in lock.
     * @return end Timestamp of lock end.
     */
    function _getLockInfo(uint256 lockID_) internal view returns (bool exists, address owner, uint256 amount, uint256 end) {
        IUnderwritingLocker locker = IUnderwritingLocker(underwritingLocker);
        exists = locker.exists(lockID_);
        if(exists) {
            owner = locker.ownerOf(lockID_);
            Lock memory lock = locker.locks(lockID_);
            amount = lock.amount;
            end = lock.end;
        } else {
            owner = address(0x0);
            amount = 0;
            end = 0;
        }
        return (exists, owner, amount, end);
    }

    /**
     * @notice Calculates the vote power (for the current epoch) of a lock with specified `amount` and `end` values
     * @param amount_ The amount of token in the underwriting lock.
     * @param end_ The unlock timestamp of the lock.
     * @return votePower The vote power for the lock (for the current epoch)
     */
    function _calculateVotePower(uint256 amount_, uint256 end_) internal view returns (uint256 votePower) {
        return 1; // dummy return for contract compile
    }

    /**
     * @notice Get vote power (for the current epoch) for a lock
     * @param lockID_ The ID of the lock to query.
     * @return votePower
     */
    function _votePower(uint256 lockID_) internal view returns (uint256 votePower) {
        // Expect revert if lockID doesn't exist
        Lock memory lock = IUnderwritingLocker(underwritingLocker).locks(lockID_);
        return _calculateVotePower(lock.amount, lock.end);
    }


    /**
     * @notice Computes voting fee (in token amount)
     * @param amount_ The amount of token in the underwriting lock.
     * @param end_ The unlock timestamp of the lock.
     */
    function _calculateVoteFee(uint256 amount_, uint256 end_) internal view returns (uint256 fee) {
        return 1; // dummy return for contract compile
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
     * @param epochStartTimestamp_ Start timestamp for epoch.
     * @param gaugeID_ Gauge ID to query.
     * @return votePower
     */
    function getVotePowerOfGaugeForEpoch(uint256 epochStartTimestamp_, uint256 gaugeID_) external view override returns (uint256 votePower) {
        return _votePowerOfGaugeForEpoch[epochStartTimestamp_][gaugeID_];
    }

    /**
     * @notice Get vote power (for the current epoch) for a lock
     * @param lockID_ The ID of the lock to query.
     * @return votePower
     */
    function votePower(uint256 lockID_) external view override returns (uint256 votePower) {
        return _votePower(lockID_);
    }

    /**
     * @notice Get currently registered vote for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return gaugeID The ID of the gauge the lock has voted for, returns 0 if either lockID or vote doesn't exist
     */
    function getVote(uint256 lockID_) external view override returns (uint256 gaugeID) {
        (,gaugeID) = _votes.tryGet(lockID_);
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
    function getEpochEndTimestamp() external view override returns (uint256 timestamp) {
        return _getEpochEndTimestamp();
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

        if(_registry == address(0x0)) revert ZeroAddressInput("registry");
        registry = _registry;
        IRegistry reg = IRegistry(_registry);
        // set revenueRouter
        (, address revenueRouterAddr) = reg.tryGet("revenueRouter");
        if(revenueRouterAddr == address(0x0)) revert ZeroAddressInput("revenueRouter");
        revenueRouter = revenueRouterAddr;
        // set token ($UWE)
        (, address uweAddr) = reg.tryGet("uwe");
        if(uweAddr == address(0x0)) revert ZeroAddressInput("uwe");
        token = uweAddr;
        // set underwritingLocker
        (, address underwritingLockerAddr) = reg.tryGet("underwritingLocker");
        if(underwritingLockerAddr == address(0x0)) revert ZeroAddressInput("underwritingLocker");
        underwritingLocker = underwritingLockerAddr;
        emit RegistrySet(_registry);
    }

    /**
     * @notice Register a vote for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or manager
     * @param lockID_ The ID of the lock to vote for.
     * @param gaugeID_ Address of intended lock manager
     */
    function _vote(uint256 lockID_, uint256 gaugeID_) internal  {
        if( IUnderwritingLocker(underwritingLocker).ownerOf(lockID_) != msg.sender && lockManagers[lockID_] != msg.sender) revert NotOwnerNorManager();
        _votes.set(lockID_, gaugeID_);
        emit Vote(lockID_, gaugeID_, msg.sender, _getEpochEndTimestamp(), _votePower(lockID_));
    }

    /***************************************
    EXTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Register a vote for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or manager
     * @param lockID_ The ID of the lock to vote for.
     * @param gaugeID_ The ID of the gauge to vote for.
     */
    function vote(uint256 lockID_, uint256 gaugeID_) external override {
        // This require to deal with edge case where if a user puts a new vote in the time window between an epoch end and processVotes() returning true for that epoch, we do not know (with the current setup) whether that lockID has a previous vote or not (that then needs to be included in processVotes());
        if ( _getEpochStartTimestamp() != lastTimeAllVotesProcessed) revert LastEpochVotesNotProcessed();
        _vote(lockID_, gaugeID_);
    }

    /**
     * @notice Register multiple votes for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or manager
     * @param lockIDs_ Array of lockIDs to vote for.
     * @param gaugeIDs_ Array of gaugeIDs to vote for.
     */
    function voteMultiple(uint256[] calldata lockIDs_, uint256[] calldata gaugeIDs_) external override {
        if (lockIDs_.length != gaugeIDs_.length) revert ArrayArgumentsLengthMismatch();
        if ( _getEpochStartTimestamp() != lastTimeAllVotesProcessed) revert LastEpochVotesNotProcessed();
        for (uint256 i = 0; i < lockIDs_.length; i++) {
            _vote(lockIDs_[i], gaugeIDs_[i]);
        }
    }

    /**
     * @notice Set the manager for a given lock
     * Can only be called by the lock owner
     * To remove a manager, the manager can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockID_ The ID of the lock to set the manager of.
     * @param manager_ Address of intended lock manager
     */
    function setLockManager(uint256 lockID_, address manager_) external override {
        if( IUnderwritingLocker(underwritingLocker).ownerOf(lockID_) != msg.sender) revert NotOwner();
        lockManagers[lockID_] = manager_;
        emit LockManagerSet(lockID_, manager_);
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
     * @notice Sets voteBatchSize
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param voteBatchSize_ Batch size of votes that will be processed in a single call of [`processVotes()`](#processvotes)
     */
    function setVoteBatchSize(uint256 voteBatchSize_) external override onlyGovernance {
        voteBatchSize = voteBatchSize_;
        emit VoteBatchSizeSet(voteBatchSize_);
    }

    /**
     * @notice Processes votes for the last epoch passed, batches $UWE voting fees and sends to RevenueRouter.sol, updates aggregate voting data (for each gauge) 
     * @dev Designed to be called multiple times until this function returns true (all stored votes are processed)
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Edge case when processVotes() is not called to completion for certain epochs - GaugeController only take vote power for lastTimeAllVotesProcessed
     * @return epochProcessed True if all stored votes are processed for the last epoch, false otherwise
     */
    function processVotes() external override onlyGovernance nonReentrant returns (bool epochProcessed) {
        uint256 epochStartTimestamp = _getEpochStartTimestamp();
        if(lastTimeAllVotesProcessed == epochStartTimestamp) revert LastEpochAlreadyProcessed({epochTime: epochStartTimestamp});    
        uint256 n_votes = _votes.length();
        uint256 vote_index;
        uint256 locks_processed;
        uint256 sum_voting_fee;

        // Iterate through each vote
        // This is still technically an unbounded loop because n_votes is unbounded, need to test what the limit is here.
        while (locks_processed <= voteBatchSize && vote_index < n_votes) {
            (uint256 lockID, uint256 gaugeID) = _votes.at(vote_index);

            // If lockID hasn't been processed for last epoch, then process the individual lcok
            if (_lastTimeVoteProcessed[lockID] != epochStartTimestamp) {
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
            sum_voting_fee
        );

        // If no locks processed in this invocation or we don't reach full batch size, make assumption that all locks have been processed
        if (locks_processed != voteBatchSize && n_votes > 0) {
            lastTimeAllVotesProcessed = epochStartTimestamp;
            emit AllVotesProcessed(epochStartTimestamp);
            return true;
        }

        return false;
    }
}
