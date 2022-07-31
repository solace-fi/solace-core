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

    /// @notice End timestamp (rounded down to weeks) for epoch for which all stored votes were charged.
    uint256 public override lastTimePremiumsCharged;

    uint256 constant public override WEEK = 604800;
    uint256 constant public override MONTH = 2628000;

    /// @notice lockID => lock manager
    mapping(uint256 => address) public override lockManagerOf;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    /// @notice True if last call to updateGaugeWeights() resulted in complete update, false otherwise.
    bool internal _finishedLastUpdate;

    /// @notice Index for _votingContracts for last incomplete updateGaugeWeights() call.
    uint256 internal _saved_index_lastProcessedVotePowerOf;

    /// @notice lockId => last processed vote power
    /// @dev Use an enumerable map so that governance can iterate through each vote after each epoch, and relay vote data to the GaugeController
    /// @dev If vote is invalid value, it will be skipped and ignored (rather than revert) 
    EnumerableMap.UintToUintMap internal _lastProcessedVotePowerOf;

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
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get vote power (for the current epoch) for a lock
     * @dev Can do this function with a single lockID_ parameter, however this introduces an extra external call which may be an issue in the unbounded loop of processVotes()
     * @param lockID_ The ID of the lock to query.
     * @return votePower
     */
    function _getVotePower(uint256 lockID_) internal view returns (uint256 votePower) {
        // Expect revert if lockID doesn't exist
        Lock memory lock = IUnderwritingLocker(underwritingLocker).locks(lockID_);
        return ( lock.amount * IUnderwritingLocker(underwritingLocker).getLockMultiplier(lockID_) ) / 1e18;   
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
        return insuranceCapacity_ * rateOnLine * _lastProcessedVotePowerOf.get(lockID_) / votePowerSum;
    }

    /**
     * @notice Get currently registered vote for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return gaugeID The ID of the gauge the lock has voted for, returns 0 if either lockID or vote doesn't exist
     */
    function _getVote(uint256 lockID_) internal view returns (uint256 gaugeID) {
        return IGaugeController(gaugeController).getVote(address(this), lockID_);
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

    /**
     * @notice Get timestamp for end of the current epoch
     * @return timestamp
     */
    function _getLastTimeGaugesUpdated() internal view returns (uint256 timestamp) {
        return IGaugeController(gaugeController).lastTimeGaugeWeightsUpdated();
    }

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get vote power (for the current epoch) for a lock
     * @param lockID_ The ID of the lock to query.
     * @return votePower
     */
    function getVotePower(uint256 lockID_) external view override returns (uint256 votePower) {
        return _getVotePower(lockID_);
    }

    /**
     * @notice Get currently registered vote for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return gaugeID The ID of the gauge the lock has voted for, returns 0 if either lockID or vote doesn't exist
     */
    function getVote(uint256 lockID_) external view override returns (uint256 gaugeID) {
        return _getVote(lockID_);
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
        if( IUnderwritingLocker(underwritingLocker).ownerOf(lockID_) != msg.sender && lockManagerOf[lockID_] != msg.sender) revert NotOwnerNorManager();
        IGaugeController(gaugeController).vote(lockID_, gaugeID_);
        emit Vote(lockID_, gaugeID_, msg.sender, _getEpochEndTimestamp(), _getVotePower(lockID_));
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
        lockManagerOf[lockID_] = manager_;
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
        if ( _getEpochStartTimestamp() != _getLastTimeGaugesUpdated()) revert LastEpochVotesNotProcessed();
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
        if ( _getEpochStartTimestamp() != _getLastTimeGaugesUpdated()) revert LastEpochVotesNotProcessed();
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
    GAUGE CONTROLLER FUNCTIONS
    ***************************************/

    /**
     * @notice Set last processed vote power for a vote ID.
     * @dev Can only be called by the gaugeController contract.
     * @dev For chargePremiums() calculations.
     * @param lockID_ The ID of the lock to set last processed vote power for.
     * @param votePower_ Vote power.
     */
    function setLastProcessedVotePower(uint256 lockID_, uint256 votePower_) external override {
        if (msg.sender != gaugeController) revert NotGaugeController();
        _lastProcessedVotePowerOf.set(lockID_, votePower_);
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
     * @notice Charge premiums for votes.
     * @dev Requires all votes to be processed for the last epochProcesses votes for the last epoch passed, batches $UWE voting fees and sends to RevenueRouter.sol, updates aggregate voting data (for each gauge) 
     * @dev Designed to be called multiple times until this function returns true (all stored votes are processed)
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function chargePremiums() external override onlyGovernance nonReentrant {
        uint256 epochStartTimestamp = _getEpochStartTimestamp();
        if(_getLastTimeGaugesUpdated() != epochStartTimestamp) revert LastEpochVotesNotProcessed();
        if(lastTimePremiumsCharged == epochStartTimestamp) revert LastEpochPremiumsAlreadyProcessed({epochTime: epochStartTimestamp});

        uint256 startIndex_lastProcessedVotePowerOf = _finishedLastUpdate ? 0 : _saved_index_lastProcessedVotePowerOf;
        uint256 totalPremium;
        uint256 insuranceCapacity = IGaugeController(gaugeController).getInsuranceCapacity();
        uint256 totalVotes = _lastProcessedVotePowerOf.length();

        // Iterate through votes
        for(uint256 i = startIndex_lastProcessedVotePowerOf; i < totalVotes; i++) {
            assembly {
                if lt(gas(), 10000) {
                    sstore(_finishedLastUpdate.slot, 0)
                    sstore(_saved_index_lastProcessedVotePowerOf.slot, i)
                    return(0, 0)
                }
            }

            (uint256 lockID, uint256 votePower) = _lastProcessedVotePowerOf.at(i);
            uint256 premium = _calculateVotePremium(lockID, insuranceCapacity);
            totalPremium += premium;
            emit PremiumCharged(lockID, epochStartTimestamp, premium);
        }

        SafeERC20.safeTransferFrom(
            IERC20(IUnderwritingLocker(underwritingLocker).token()), 
            underwritingLocker, 
            revenueRouter,
            totalPremium
        );

        _finishedLastUpdate = true;
        lastTimePremiumsCharged = epochStartTimestamp;
        emit AllPremiumsCharged(epochStartTimestamp);
    }
}
