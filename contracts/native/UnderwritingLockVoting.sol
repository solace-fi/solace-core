// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "hardhat/console.sol";
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
import "./../interfaces/native/IGaugeController.sol";

// TO-DO
// vote gaugeID = 0 -> retract vote (no $UWE charge)
// Is processVotes DDOS resistant?

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
 * `votePower` can be viewed with [`getVotePower()`](#getVotePower)
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

    /// @notice Revenue router address ($UWE voting fees will be transferred here).
    address public override revenueRouter;

    /// @notice Address of [`UnderwritingLocker`](./UnderwritingLocker)
    address public override underwritingLocker;

    /// @notice Gauge controller address.
    address public override gaugeController;

    /// @notice Registry address
    address public override registry;

    /// @notice Batch size of votes that will be processed in a single call of [`processVotes()`](#processvotes).
    uint256 public override voteBatchSize;

    /// @notice End timestamp (rounded down to weeks) for epoch for which all stored votes were processed in full
    uint256 public override lastTimeAllVotesProcessed;

    /// @notice End timestamp (rounded down to weeks) for epoch for which all stored votes were charged.
    uint256 public override lastTimePremiumsCharged;

    uint256 constant public override WEEK = 604800;
    uint256 constant public override MONTH = 2628000;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    // Ideally we would like an EnumerableMap of (lockId => {gaugeID, lockManager, lastTimeVoteProcessed, lastTimeCharged}) to merge _votes and _voteInfoOfLock mappings. We would need to create a custom data structure to do this.

    /// @notice lockId => insurance gauge vote
    /// @dev Use an enumerable map so that governance can iterate through each vote after each epoch, and relay vote data to the GaugeController
    /// @dev Input validation for lockId will be performed in this contract
    /// @dev Input validation for insurance gauge vote will be performed in GaugeController.sol, when vote data is relayed at end of each epoch
    /// @dev If vote is invalid value, it will be skipped and ignored (rather than revert) 
    EnumerableMap.UintToUintMap internal _votes;

    // lockId => LockVoteInfo {address lockManager, uint256 lastTimeVoteProcessed, uint256 lastTimeCharged, uint256 lastProcessedVotePower}.
    mapping(uint256 => LockVoteInfo) internal _voteInfoOfLock;

    /// @notice Epoch start timestamp (rounded to weeks) => gaugeID => total vote power
    mapping(uint256 => mapping(uint256 => uint256)) internal _votePowerOfGaugeForEpoch;

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
     * @notice Get vote power (for the current epoch) for a lock
     * @dev Can do this function with a single lockID_ parameter, however this introduces an extra external call which may be an issue in the unbounded loop of processVotes()
     * @param amount_ Lock amount
     * @param lockID_ The ID of the lock to query.
     * @return votePower
     */
    function _getVotePower(uint256 amount_, uint256 lockID_) internal view returns (uint256 votePower) {
        // Expect revert if lockID doesn't exist
        return ( amount_ * IUnderwritingLocker(underwritingLocker).getLockMultiplier(lockID_) ) / 1e18;   
    }

    /**
     * @notice Computes voting premium for vote.
     * @param lockID_ The ID of the lock to query.
     * @param insuranceCapacity_ Solace insurance capacity. Placed as parameter to reduce external view calls in each chargePremiums() iteration.
     * @return premium Premium for vote.
     */
    function _calculateVotePremium(uint256 lockID_, uint256 insuranceCapacity_) internal view returns (uint256 premium) {
        uint256 rateOnLine = IGaugeController(gaugeController).getRateOnLineOfGauge(_getVote(lockID_));
        uint256 votePowerSum = IGaugeController(gaugeController).getVotePowerSum();
        return insuranceCapacity_ * rateOnLine * _voteInfoOfLock[lockID_].lastProcessedVotePower / votePowerSum;
    }

    /**
     * @notice Get currently registered vote for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return gaugeID The ID of the gauge the lock has voted for, returns 0 if either lockID or vote doesn't exist
     */
    function _getVote(uint256 lockID_) internal view returns (uint256 gaugeID) {
        (bool success, uint256 gaugeID) = _votes.tryGet(lockID_);
        if (!success) revert VoteNotFound();
        else return gaugeID;
    }

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

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Obtain vote power sum for a gauge for a given epoch.
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
    function getVotePower(uint256 lockID_) external view override returns (uint256 votePower) {
        Lock memory lock = IUnderwritingLocker(underwritingLocker).locks(lockID_);
        return _getVotePower(lock.amount, lockID_);
    }

    /**
     * @notice Get currently registered vote for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return gaugeID The ID of the gauge the lock has voted for, returns 0 if either lockID or vote doesn't exist
     */
    function getVote(uint256 lockID_) external view override returns (uint256 gaugeID) {
        (bool success, uint256 gaugeID) = _votes.tryGet(lockID_);
        if (!success) revert VoteNotFound();
        else return gaugeID;
    }

    /**
     * @notice Get lockManager for a given lockId.
     * @param lockID_ The ID of the lock to query for.
     * @return lockManager Zero address if no lock manager.
     */
    function lockManagerOf(uint256 lockID_) external view override returns (address lockManager) {
        return _voteInfoOfLock[lockID_].lockManager;
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
     * @notice Register a vote for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or manager
     * @param lockID_ The ID of the lock to vote for.
     * @param gaugeID_ Address of intended lock manager
     */
    function _vote(uint256 lockID_, uint256 gaugeID_) internal  {
        if( IUnderwritingLocker(underwritingLocker).ownerOf(lockID_) != msg.sender && _voteInfoOfLock[lockID_].lockManager != msg.sender) revert NotOwnerNorManager();
        _votes.set(lockID_, gaugeID_);
        Lock memory lock = IUnderwritingLocker(underwritingLocker).locks(lockID_);
        emit Vote(lockID_, gaugeID_, msg.sender, _getEpochEndTimestamp(), _getVotePower(lock.amount, lockID_));
    }

    /**
     * @notice Set the manager for a given lock
     * Can only be called by the lock owner
     * To remove a manager, the manager can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockID_ The ID of the lock to set the manager of.
     * @param manager_ Address of intended lock manager
     */
    function _setLockManager(uint256 lockID_, address manager_) internal {
        if( IUnderwritingLocker(underwritingLocker).ownerOf(lockID_) != msg.sender) revert NotOwner();
        _voteInfoOfLock[lockID_].lockManager = manager_;
        emit LockManagerSet(lockID_, manager_);
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
        if ( _getEpochStartTimestamp() != lastTimePremiumsCharged) revert LastEpochPremiumsNotCharged();
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
        _setLockManager(lockID_, manager_);
    }

    /**
     * @notice Set managers for multiple lock
     * Can only be called by the lock owner
     * To remove a manager, the manager can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockIDs_ Array of lock IDs.
     * @param managers_ Array of addresses of intended lock managers.
     */
    function setLockManagerMultiple(uint256[] calldata lockIDs_, address[] calldata managers_) external override {
        if (lockIDs_.length != managers_.length) revert ArrayArgumentsLengthMismatch();
        for (uint256 i = 0; i < lockIDs_.length; i++) {
            _setLockManager(lockIDs_[i], managers_[i]);
        }
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

    // Governance run this after every epoch
    // Iterate through every stored vote - possible unbounded loop, so we limit loop size and 'save our progress' if we haven't iterated through every vote
    // Once completed iteration and sure that _votePowerOfGaugeForEpoch is updated for this epoch, update FLAG for this epoch
    // Re-iterate through every vote (same provision for possible unbounded loop), to process premiums for this voting round
    // Need second iteration, because second iteration depends on data that can only be gotten from an initial iteration
    // Second iteration also solves the 'free first epoch' issue.
    // 

    /**
     * @notice Processes votes for the last epoch passed, batches $UWE voting fees and sends to RevenueRouter.sol, updates aggregate voting data (for each gauge) 
     * @dev Designed to be called multiple times until this function returns true (all stored votes are processed)
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Edge case when processVotes() is not called to completion for certain epochs - GaugeController only take vote power for lastTimeAllVotesProcessed
     */
    function processVotes() external override onlyGovernance nonReentrant {
        uint256 epochStartTimestamp = _getEpochStartTimestamp();
        if(lastTimeAllVotesProcessed == epochStartTimestamp) revert LastEpochVotesAlreadyProcessed({epochTime: epochStartTimestamp});  

        uint256 totalVotes = _votes.length();
        uint256 voteIndex;
        uint256 numOfLocksProcessed;

        // Iterate through each vote
        // This is still technically an unbounded loop because n_votes is unbounded, need to test what the limit is here.
        while (numOfLocksProcessed <= voteBatchSize && voteIndex < totalVotes) {
            (uint256 lockID, uint256 gaugeID) = _votes.at(voteIndex);
            // If lockID hasn't been processed for last epoch, then process the individual lcok
            if (uint256(_voteInfoOfLock[lockID].lastTimeVoteProcessed) != epochStartTimestamp) {
                voteIndex += 1;
                _voteInfoOfLock[lockID].lastTimeVoteProcessed = uint48(epochStartTimestamp);
                if (gaugeID == 0) {continue;}
                (,,uint256 amount,) = _getLockInfo(lockID);
                uint256 votePower = _getVotePower(amount, lockID);
                _votePowerOfGaugeForEpoch[epochStartTimestamp][gaugeID] += votePower;
                _voteInfoOfLock[lockID].lastProcessedVotePower = votePower;
                numOfLocksProcessed += 1;
                emit VoteProcessed(lockID, gaugeID, epochStartTimestamp, votePower);
            }
        }

        // If full vote batch size not reached, assume completed processing;
        if (numOfLocksProcessed < voteBatchSize) {
            lastTimeAllVotesProcessed = epochStartTimestamp;
            emit AllVotesProcessed(epochStartTimestamp);
        }
    }

    /**
     * @notice Charge premiums for votes.
     * @dev Requires all votes to be processed for the last epochProcesses votes for the last epoch passed, batches $UWE voting fees and sends to RevenueRouter.sol, updates aggregate voting data (for each gauge) 
     * @dev Designed to be called multiple times until this function returns true (all stored votes are processed)
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function chargePremiums() external override onlyGovernance nonReentrant {
        uint256 epochStartTimestamp = _getEpochStartTimestamp();
        if(lastTimeAllVotesProcessed != epochStartTimestamp) revert LastEpochVotesNotProcessed();
        if(lastTimePremiumsCharged == epochStartTimestamp) revert LastEpochPremiumsAlreadyProcessed({epochTime: epochStartTimestamp}); 
        
        uint256 totalPremium;
        uint256 insuranceCapacity = IGaugeController(gaugeController).getInsuranceCapacity();
        uint256 totalVotes = _votes.length();
        uint256 voteIndex;
        uint256 numOfLocksProcessed;

        // Iterate through votes to collect premiums to charge
        // Skip gaugeID = 0 votes
        while (numOfLocksProcessed <= voteBatchSize && voteIndex < totalVotes) {
            (uint256 lockID, uint256 gaugeID) = _votes.at(voteIndex);
            // If lockID hasn't been processed for last epoch, then process the individual lcok
            if (uint256(_voteInfoOfLock[lockID].lastTimeCharged) != epochStartTimestamp) {
                // if gaugeID == 0, skip processing vote
                if (gaugeID == 0) {
                    // Technically not charged, however need to update flag.
                    _voteInfoOfLock[lockID].lastTimeCharged = uint48(epochStartTimestamp);
                    continue;
                }

                uint256 premium = _calculateVotePremium(lockID, insuranceCapacity);
                totalPremium += premium;
                _voteInfoOfLock[lockID].lastTimeCharged = uint48(epochStartTimestamp);
                numOfLocksProcessed += 1;
                emit PremiumCharged(lockID, gaugeID, epochStartTimestamp, premium);
            }
        }

        SafeERC20.safeTransferFrom(
            IERC20(IUnderwritingLocker(underwritingLocker).token()), 
            underwritingLocker, 
            revenueRouter,
            totalPremium
        );

        // If full vote batch size not reached, assume completed processing;
        if (numOfLocksProcessed < voteBatchSize) {
            lastTimePremiumsCharged = epochStartTimestamp;
            emit AllPremiumsCharged(epochStartTimestamp);
        }
    }

}
