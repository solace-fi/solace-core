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
import "hardhat/console.sol";

// TO-DO
// vote gaugeID = 0 -> retract vote (no $UWE charge)
// Is processVotes DDOS resistant?

/**
 * @title UnderwritingLockVoting
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
    uint256 constant public override YEAR = 31536000;

    /// @notice lockID => lock delegate
    mapping(uint256 => address) public override lockDelegateOf;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    /// @dev Struct pack into single 32-byte word
    /// @param finishedLastUpdate True if last call to updateGaugeWeights() resulted in complete update, false otherwise.
    /// @param savedIndexOfLastProcessedVotePowerOf Index for _votingContracts for last incomplete updateGaugeWeights() call.
    struct UpdateInfo {
        bool finishedLastUpdate; // bool stored in 8 bits [0:8]
        uint248 savedIndexOfLastProcessedVotePowerOf; // uint248 stored in [8:256]
    }

    UpdateInfo internal _updateInfo;

    /// @notice lockId => last processed vote power
    /// @dev Use an enumerable map so that governance can iterate through each vote after each epoch, and relay vote data to the GaugeController
    /// @dev If vote is invalid value, it will be skipped and ignored (rather than revert) 
    EnumerableMap.UintToUintMap internal _lastProcessedVotePowerOf;

    /// @notice Dynamic array of dead lockIDs to remove from _lastProcessedVotePowerOf EnumerableMap.
    /// @dev Unfortunately Solidity doesn't allow dynamic arrays in memory, and I don't see a space-efficient way of creating a fixed-length array for this problem.
    uint256[] internal lockIDsToRemove;

    /// @notice Total premium amount due to the revenueRouter.
    /// @dev Should == 0 at most times. Only time it should be non-zero is when an incomplete chargePremium() call is made.
    /// @dev Originally a local function variable, but need to save state between two function calls.
    uint256 internal totalPremiumDue;

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
     * @dev Need try-catch block instead of revert, or else edge case of vote with a lock, burn the lock before epoch end => updateGaugeWeights() will always revert.
     * @param lockID_ The ID of the lock to query.
     * @return votePower
     */
    function _getVotePower(uint256 lockID_) internal view returns (uint256 votePower) {
        try IUnderwritingLocker(underwritingLocker).locks(lockID_) returns (Lock memory lock) {
            return ( lock.amount * IUnderwritingLocker(underwritingLocker).getLockMultiplier(lockID_) ) / 1e18;
        } catch {
            return 0;
        }
    }

    /**
     * @notice Computes voting premium for vote.
     * @param lockID_ The ID of the lock to query.
     * @param insuranceCapacity_ Solace insurance capacity. Placed as parameter to reduce external view calls in each chargePremiums() iteration.
     * @return premium Premium for vote.
     */
    function _calculateVotePremium(uint256 lockID_, uint256 insuranceCapacity_) internal view returns (uint256 premium) {
        try IGaugeController(gaugeController).getVote(address(this), lockID_) returns (uint256 gaugeID) {
            try IGaugeController(gaugeController).getRateOnLineOfGauge(gaugeID) returns (uint256 rateOnLine) {
                uint256 votePowerSum = IGaugeController(gaugeController).getVotePowerSum();
                // insuranceCapacity_ from gaugeController.getInsuranceCapacity() is already scaled.
                // Need to convert rateOnLine from annual rate in 1e18 terms, to weekly rate in fraction terms. Hence `WEEK / (YEAR * 1e18)
                return insuranceCapacity_ * rateOnLine * WEEK * _lastProcessedVotePowerOf.get(lockID_) / (votePowerSum * YEAR * 1e18);
            } catch {
                return 0;
            }
        } catch {
            return 0;
        }
        // try IGaugeController(gaugeController).getRateOnLineOfGauge(_getVote(lockID_)) returns (uint256 rateOnLine) {
        //     uint256 votePowerSum = IGaugeController(gaugeController).getVotePowerSum();
        //     // insuranceCapacity_ from gaugeController.getInsuranceCapacity() is already scaled.
        //     // Need to convert rateOnLine from annual rate in 1e18 terms, to weekly rate in fraction terms. Hence `WEEK / (YEAR * 1e18)
        //     return insuranceCapacity_ * rateOnLine * WEEK * _lastProcessedVotePowerOf.get(lockID_) / (votePowerSum * YEAR * 1e18);
        // } catch {
        //     return 0;
        // }
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

    /**
     * @notice Query whether voting is open.
     * @return True if voting is open for this epoch, false otherwise.
     */
    function isVotingOpen() external view override returns (bool) {
        uint256 epochStartTime = _getEpochStartTimestamp();
        return epochStartTime == lastTimePremiumsCharged && epochStartTime == _getLastTimeGaugesUpdated();
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
     * Can only be called by the lock owner or delegate
     * @param lockID_ The ID of the lock to vote for.
     * @param gaugeID_ Address of intended lock delegate
     */
    function _vote(uint256 lockID_, uint256 gaugeID_) internal  {
        // This require to deal with edge case where if a user puts a new vote in the time window between an epoch end and processVotes() returning true for that epoch, we do not know (with the current setup) whether that lockID has a previous vote or not (that then needs to be included in processVotes());
        if ( _getEpochStartTimestamp() != lastTimePremiumsCharged) revert LastEpochPremiumsNotCharged();
        if( IUnderwritingLocker(underwritingLocker).ownerOf(lockID_) != msg.sender && lockDelegateOf[lockID_] != msg.sender) revert NotOwnerNorDelegate();
        IGaugeController(gaugeController).vote(lockID_, gaugeID_);
        emit Vote(lockID_, gaugeID_, msg.sender, _getEpochEndTimestamp(), _getVotePower(lockID_));
    }

    /**
     * @notice Remove a vote.
     * Can only be called by the lock owner or delegate
     * @param lockID_ The ID of the lock to remove the vote for.
     */
    function _removeVote(uint256 lockID_) internal  {
        if( IUnderwritingLocker(underwritingLocker).ownerOf(lockID_) != msg.sender && lockDelegateOf[lockID_] != msg.sender) revert NotOwnerNorDelegate();
        // Edge case, what if lockID is non-existent in chargePremium set?
        _lastProcessedVotePowerOf.remove(lockID_);
        IGaugeController(gaugeController).removeVote(lockID_);
        emit VoteRemoved(lockID_, msg.sender);
    }

    /**
     * @notice Set the delegate for a given lock
     * Can only be called by the lock owner
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockID_ The ID of the lock to set the delegate of.
     * @param delegate_ Address of intended lock delegate
     */
    function _setLockDelegate(uint256 lockID_, address delegate_) internal {
        if( IUnderwritingLocker(underwritingLocker).ownerOf(lockID_) != msg.sender) revert NotOwner();
        lockDelegateOf[lockID_] = delegate_;
        emit LockDelegateSet(lockID_, delegate_);
    }

    /***************************************
    EXTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Register a vote for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or delegate
     * @param lockID_ The ID of the lock to vote for.
     * @param gaugeID_ The ID of the gauge to vote for.
     */
    function vote(uint256 lockID_, uint256 gaugeID_) external override {
        _vote(lockID_, gaugeID_);
    }

    /**
     * @notice Register multiple votes for a gauge
     * @notice Each underwriting lock is entitled to a single vote
     * @notice A new vote cannot be registered before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the lock owner or delegate
     * @param lockIDs_ Array of lockIDs to vote for.
     * @param gaugeIDs_ Array of gaugeIDs to vote for.
     */
    function voteMultiple(uint256[] calldata lockIDs_, uint256[] calldata gaugeIDs_) external override {
        if (lockIDs_.length != gaugeIDs_.length) revert ArrayArgumentsLengthMismatch();
        for (uint256 i = 0; i < lockIDs_.length; i++) {
            _vote(lockIDs_[i], gaugeIDs_[i]);
        }
    }

    /**
     * @notice Remove a vote for a lockID.
     * Can only be called by the lock owner or delegate
     * @param lockID_ The ID of the lock to remove the vote for.
     */
    function removeVote(uint256 lockID_) external override {
        _removeVote(lockID_);
    }

    /**
     * @notice Remove votes for multiple underwriting locks.
     * Can only be called by the lock owner or delegate
     * @param lockIDs_ Array of lockIDs to vote for.
     */
    function removeVoteMultiple(uint256[] calldata lockIDs_) external override {
        for (uint256 i = 0; i < lockIDs_.length; i++) {
            _removeVote(lockIDs_[i]);
        }
    }

    /**
     * @notice Set the delegate for a given lock
     * Can only be called by the lock owner
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockID_ The ID of the lock to set the delegate of.
     * @param delegate_ Address of intended lock delegate
     */
    function setLockDelegate(uint256 lockID_, address delegate_) external override {
        _setLockDelegate(lockID_, delegate_);
    }

    /**
     * @notice Set delegates for multiple lock
     * Can only be called by the lock owner
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param lockIDs_ Array of lock IDs.
     * @param delegates_ Array of addresses of intended lock delegates.
     */
    function setLockDelegateMultiple(uint256[] calldata lockIDs_, address[] calldata delegates_) external override {
        if (lockIDs_.length != delegates_.length) revert ArrayArgumentsLengthMismatch();
        for (uint256 i = 0; i < lockIDs_.length; i++) {
            _setLockDelegate(lockIDs_[i], delegates_[i]);
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
     * @param gaugeID_ GaugeID of vote.
     * @param votePower_ Vote power.
     */
    function setLastProcessedVotePower(uint256 lockID_, uint256 gaugeID_, uint256 votePower_) external override {
        if (msg.sender != gaugeController) revert NotGaugeController();
        _lastProcessedVotePowerOf.set(lockID_, votePower_);
        emit VoteProcessed(lockID_, gaugeID_, _getEpochStartTimestamp(), votePower_);
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
    function chargePremiums() external override onlyGovernance {
        uint256 epochStartTimestamp = _getEpochStartTimestamp();
        if(_getLastTimeGaugesUpdated() != epochStartTimestamp) revert GaugeWeightsNotYetUpdated();
        if(lastTimePremiumsCharged == epochStartTimestamp) revert LastEpochPremiumsAlreadyProcessed({epochTime: epochStartTimestamp});

        uint256 startIndex_lastProcessedVotePowerOf = _updateInfo.finishedLastUpdate ? 0 : _updateInfo.savedIndexOfLastProcessedVotePowerOf;
        uint256 insuranceCapacity = IGaugeController(gaugeController).getInsuranceCapacity();
        uint256 totalVotes = _lastProcessedVotePowerOf.length();

        // Iterate through votes
        for(uint256 i = startIndex_lastProcessedVotePowerOf; i < totalVotes; i++) {
            // Check if we are at risk of running out of gas.
            // If yes, save progress and return.
            console.log("chargePremium 1 %s" , gasleft());
            assembly {
                if lt(gas(), 60000) {
                    // Start with empty word
                    let updateInfo

                    // False = 0x00000000
                    // Set 0x00000000 as bits [0:8] of updateInfo => Set false as _updateInfo.finishedLastUpdate
                    updateInfo := or(updateInfo, and(0, 0xFF))

                    // We are downcasting i from uint256 to uint248
                    // So uint248(i) is initially stored in [0:248]
                    // Left bitwise shift of 8 moves to [8:256]
                    // Bitwise-or sets bits [8:256] of updateInfo => Set uint248(i) as _updateInfo.savedIndexOfLastProcessedVotePowerOf
                    updateInfo := or(updateInfo, shl(8, i))

                    // Now for updateInfo: [0:8] == false, [8:256] == uint248(i)
                    // So overwrite _updateInfo storage slot with new struct values
                    // Point of this exercise was to make single sstore operation (vs two if we didn't struct pack).
                    sstore(_updateInfo.slot, updateInfo)

                    // We are making an assumption that this function can only save state changes made at two points
                    // i.) Here at this return statement, or ii.) we successfully get to the end of the function body
                    // If there is another condition under which state changes can be saved, that will cause bugs.
                    return(0, 0)
                }
            }
            console.log("chargePremium 2 %s" , gasleft());

            (uint256 lockID,) = _lastProcessedVotePowerOf.at(i);
            uint256 premium = _calculateVotePremium(lockID, insuranceCapacity);
            if (premium == 0) {lockIDsToRemove.push(lockID);}
            // Could put next 3 lines in an else block for gas efficiency, but makes it harder to debug.
            totalPremiumDue += premium;
            IUnderwritingLocker(underwritingLocker).chargePremium(lockID, premium);
            emit PremiumCharged(lockID, epochStartTimestamp, premium);
        }

        // Remove dead votes from EnumerableMap
        while (lockIDsToRemove.length > 0) {
            _lastProcessedVotePowerOf.remove(lockIDsToRemove[lockIDsToRemove.length - 1]);
            lockIDsToRemove.pop();
        }

        SafeERC20.safeTransferFrom(
            IERC20(IUnderwritingLocker(underwritingLocker).token()), 
            underwritingLocker, 
            revenueRouter,
            totalPremiumDue
        );

        totalPremiumDue = 0; // Reset total premiium due
        _updateInfo.finishedLastUpdate = true;
        lastTimePremiumsCharged = epochStartTimestamp;
        emit AllPremiumsCharged(epochStartTimestamp);
        console.log("chargePremium 3 %s" , gasleft());
    }
}
