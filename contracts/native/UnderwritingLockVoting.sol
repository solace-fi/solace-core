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
// import "./../interfaces/native/GaugeStructs.sol";
import "hardhat/console.sol";

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

    /// @notice voter => delegate
    mapping(address => address) public override lockDelegateOf;

    /// @notice voter => used voting power percentage (max of 10000 BPS)
    /// @dev Is a cache for sum of used voting power bps. Otherwise gotten by iterating through a voter's votes.
    /// @dev Potentially unbounded loop if we iterate through voter's votes, and we require this value for input validation in _vote()
    /// @dev Therefore justified to store cache, and maintain cache accuracy for with actual value.
    mapping(address => uint256) public override usedVotePowerBPSOf;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/
    /// @notice Total premium amount due to the revenueRouter.
    /// @dev Should == 0 at most times. Only time it should be non-zero is when an incomplete chargePremium() call is made.
    /// @dev Originally a local function variable, but need to save state between two function calls.
    uint256 internal totalPremiumDue;

    /// @notice voter => last processed vote power.
    /// @dev Cache for getVotePowerOf() call for most recent complete GaugeController.updateGaugeWeights().
    /// @dev Empirically _getVotePowerOfLock() expends ~30K gas per lock, we prefer ~5K gas per user SSTORE + SLOAD to this cache.
    /// @dev This mapping is only intended to be used by chargePremiums(), after complete GaugeController.updateGaugeWeights().
    mapping (address => uint256) internal _lastProcessedVotePowerOf;

    GaugeStructs.UpdateInfo internal _updateInfo;

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
    function _getVotePowerOfLock(uint256 lockID_) internal view returns (uint256 votePower) {
        try IUnderwritingLocker(underwritingLocker).locks(lockID_) returns (Lock memory lock) {
            return ( lock.amount * IUnderwritingLocker(underwritingLocker).getLockMultiplier(lockID_) ) / 1e18;
        } catch {
            return 0;
        }
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
     * @notice Get vote power for a voter.
     * @param voter_ The address of the voter to query.
     * @return votePower
     */
    function getVotePowerOf(address voter_) external view override returns (uint256 votePower) {
        uint256 numVoterLocks = IUnderwritingLocker(underwritingLocker).balanceOf(voter_);
        if (numVoterLocks == 0) return 0;
        uint256[] memory lockIDs = new uint256[](numVoterLocks);
        lockIDs = IUnderwritingLocker(underwritingLocker).getAllLockIDsOf(voter_);
        for (uint256 i = 0; i < numVoterLocks; i++) {votePower += _getVotePowerOfLock(lockIDs[i]);}
        return votePower;
    }

    /**
     * @notice Get votes for a voter.
     * @param voter_ Address of voter to query for.
     * @return votes Array of votes{gaugeID, votePowerBPS}.
     */
    function getVotes(address voter_) external view override returns (GaugeStructs.Vote[] memory votes) {
        return IGaugeController(gaugeController).getVotes(address(this), voter_);
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
     * @notice Set the voting delegate for the caller.
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param delegate_ Address of intended delegate
     */
    function _setLockDelegate(address delegate_) internal {
        lockDelegateOf[msg.sender] = delegate_;
        emit LockDelegateSet(msg.sender, delegate_);
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
     * @notice Add, change or remove votes
     * @notice No votes can be added or modified, before all stored votes have been registered for the previous epoch (via governor invoking [`processVotes()`](#processvotes)).
     * Can only be called by the voter or their delegate.
     * @param voter_ The voter address.
     * @param gaugeIDs_ The array of gaugeIDs to vote for.
     * @param votePowerBPSs_ The corresponding array of votePowerBPS values. Can be from 0 - 10000.
     */
    function _vote(address voter_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) internal {
        // Disable voting if votes not yet processed or premiums not yet charged for this epoch
        if ( _getEpochStartTimestamp() != lastTimePremiumsCharged) revert LastEpochPremiumsNotCharged();
        if( voter_ != msg.sender && lockDelegateOf[voter_] != msg.sender) revert NotOwnerNorDelegate();
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
     * @notice Directly register a single vote for a gauge. Can either add or change a vote.
     * @notice Can also technically remove a vote (votePowerBPS_ == 0), however the difference with removeVote() is that vote() will revert if the voter has no locks (no locks => no right to vote, but may have dead locks created previously).
     * @notice GaugeController.updateGaugeWeights() will remove these dead locks, however the user can also preemptively remove dead locks through removeVote().
     * @notice Votes cannot be added or modified before all stored votes have been processed for the epoch (GaugeController.updateGaugeWeights() => UnderwritingLockVoting.chargePremiums())
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
     * @notice Directly register multiple gauge votes. Can either add or change votes.
     * @notice Can also technically remove votes (votePowerBPS_ == 0), however the difference with removeVoteMultiple() is that voteMultiple() will revert if the voter has no locks (no locks => no right to vote, but may have dead locks created previously).
     * @notice GaugeController.updateGaugeWeights() will remove these dead locks, however the user can also preemptively remove dead locks through removeVote().
     * @notice Votes cannot be added or modified before all stored votes have been processed for the epoch (GaugeController.updateGaugeWeights() => UnderwritingLockVoting.chargePremiums())
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
     * @notice Removes a vote.
     * @notice Votes cannot be removed before all stored votes have been processed for the epoch (GaugeController.updateGaugeWeights() => UnderwritingLockVoting.chargePremiums()).
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
     * @notice Votes cannot be removed before all stored votes have been processed for the epoch (GaugeController.updateGaugeWeights() => UnderwritingLockVoting.chargePremiums()).
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
     * @notice Set the voting delegate for the caller.
     * To remove a delegate, the delegate can be set to the ZERO_ADDRESS - 0x0000000000000000000000000000000000000000
     * @param delegate_ Address of intended delegate
     */
    function setLockDelegate(address delegate_) external override {
        _setLockDelegate(delegate_);
    }

    /***************************************
    GAUGE CONTROLLER FUNCTIONS
    ***************************************/

    /**
     * @notice Cache last processed vote power for a vote ID.
     * @dev Can only be called by the gaugeController contract.
     * @dev For chargePremiums() calculations.
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
     * @notice Charge premiums for votes.
     * @dev Requires all votes to be processed for the last epochProcesses votes for the last epoch passed, batches $UWE voting fees and sends to RevenueRouter.sol, updates aggregate voting data (for each gauge) 
     * @dev Designed to be called multiple times until this function returns true (all stored votes are processed)
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function chargePremiums() external override onlyGovernance {
    //     uint256 epochStartTimestamp = _getEpochStartTimestamp();
    //     if(_getLastTimeGaugesUpdated() != epochStartTimestamp) revert GaugeWeightsNotYetUpdated();
    //     if(lastTimePremiumsCharged == epochStartTimestamp) revert LastEpochPremiumsAlreadyProcessed({epochTime: epochStartTimestamp});

    //     uint256 startIndex_lastProcessedVotePowerOf = _updateInfo.finishedLastUpdate ? 0 : _updateInfo.savedIndexOfLastProcessedVotePowerOf;
    //     uint256 insuranceCapacity = IGaugeController(gaugeController).getInsuranceCapacity();
    //     uint256 totalVotes = _lastProcessedVotePowerOf.length();

    //     // Iterate through votes
    //     for(uint256 i = startIndex_lastProcessedVotePowerOf; i < totalVotes; i++) {
    //         // Check if we are at risk of running out of gas.
    //         // If yes, save progress and return.
    //         console.log("chargePremium 1 %s" , gasleft());
    //         assembly {
    //             if lt(gas(), 60000) {
    //                 // Start with empty word
    //                 let updateInfo

    //                 // False = 0x00000000
    //                 // Set 0x00000000 as bits [0:8] of updateInfo => Set false as _updateInfo.finishedLastUpdate
    //                 updateInfo := or(updateInfo, and(0, 0xFF))

    //                 // We are downcasting i from uint256 to uint248
    //                 // So uint248(i) is initially stored in [0:248]
    //                 // Left bitwise shift of 8 moves to [8:256]
    //                 // Bitwise-or sets bits [8:256] of updateInfo => Set uint248(i) as _updateInfo.savedIndexOfLastProcessedVotePowerOf
    //                 updateInfo := or(updateInfo, shl(8, i))

    //                 // Now for updateInfo: [0:8] == false, [8:256] == uint248(i)
    //                 // So overwrite _updateInfo storage slot with new struct values
    //                 // Point of this exercise was to make single sstore operation (vs two if we didn't struct pack).
    //                 sstore(_updateInfo.slot, updateInfo)

    //                 // We are making an assumption that this function can only save state changes made at two points
    //                 // i.) Here at this return statement, or ii.) we successfully get to the end of the function body
    //                 // If there is another condition under which state changes can be saved, that will cause bugs.
    //                 return(0, 0)
    //             }
    //         }
    //         console.log("chargePremium 2 %s" , gasleft());

    //         (uint256 lockID,) = _lastProcessedVotePowerOf.at(i);
    //         uint256 premium = _calculateVotePremium(lockID, insuranceCapacity);
    //         if (premium == 0) {lockIDsToRemove.push(lockID);}
    //         // Could put next 3 lines in an else block for gas efficiency, but makes it harder to debug.
    //         totalPremiumDue += premium;
    //         IUnderwritingLocker(underwritingLocker).chargePremium(lockID, premium);
    //         emit PremiumCharged(lockID, epochStartTimestamp, premium);
    //     }

    //     // Remove dead votes from EnumerableMap
    //     while (lockIDsToRemove.length > 0) {
    //         _lastProcessedVotePowerOf.remove(lockIDsToRemove[lockIDsToRemove.length - 1]);
    //         lockIDsToRemove.pop();
    //     }

    //     SafeERC20.safeTransferFrom(
    //         IERC20(IUnderwritingLocker(underwritingLocker).token()), 
    //         underwritingLocker, 
    //         revenueRouter,
    //         totalPremiumDue
    //     );

    //     totalPremiumDue = 0; // Reset total premiium due
    //     _updateInfo.finishedLastUpdate = true;
    //     lastTimePremiumsCharged = epochStartTimestamp;
    //     emit AllPremiumsCharged(epochStartTimestamp);
    //     console.log("chargePremium 3 %s" , gasleft());
    }

    /***************************************
     updateGaugeWeights() HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Save state of updating gauge weights to _updateInfo
     * @param votingContractsIndex_ Current index of _votingContracts.
     * @param votersIndex_ Current index of _voters[votingContractsIndex_].
     * @param votesIndex_ Current index of _votes[votingContractsIndex_][votersIndex_]
     */
    function _saveUpdateState(uint256 votingContractsIndex_, uint256 votersIndex_, uint256 votesIndex_) internal {
        assembly {
            let updateInfo
            updateInfo := or(updateInfo, shr(176, shl(176, votingContractsIndex_))) // [0:80] => votingContractsIndex_
            updateInfo := or(updateInfo, shr(88, shl(168, votersIndex_))) // [80:168] => votersIndex_
            updateInfo := or(updateInfo, shl(168, votesIndex_)) // [168:256] => votesIndex_
            sstore(_updateInfo.slot, updateInfo) 
        }
    }

    /// @notice Reset _updateInfo to starting state.
    /// @dev We are setting all the bits of _updateInfo to 1.
    /// @dev The naive approach here is to reset all the bits to 0. However the EVM imposes a 20K gas fee for 
    /// @dev `rewarming` a cold slot (setting from 0 to 1) vs keeping it warm (changing from non-zero to non-zero value).
    function _clearUpdateInfo() internal {
        uint256 bitmap = type(uint256).max;
        assembly {
            sstore(_updateInfo.slot, bitmap)
        }
    }

    /**
     * @notice Computes voting premium for voter.
     * @param voter_ Address of voter.
     * @param insuranceCapacity_ Solace insurance capacity. Placed as parameter to reduce external view calls in each chargePremiums() iteration.
     * @return premium Premium for voter.
     */
    function _calculateVotePremium(address voter_, uint256 insuranceCapacity_) internal view returns (uint256 premium) {
        GaugeStructs.Vote[] memory votes = IGaugeController(gaugeController).getVotes(address(this), voter_);
        uint256 voteCount = votes.length;

        if (voteCount > 0) {
            uint256 accummulator;
            uint256 global_numerator = _lastProcessedVotePowerOf[voter_] * insuranceCapacity_ * WEEK;
            // rateOnLine scaled to correct fraction for week => multiply by (WEEK / YEAR) * (1 / 1e18)
            // votePowerBPS scaled to correct fraction => multiply by (1 / 10000)
            uint256 global_denominator = IGaugeController(gaugeController).getVotePowerSum() * YEAR * 1e18 * 10000;
            for (uint256 i = 0 ; i < voteCount; i++) {
                accummulator += IGaugeController(gaugeController).getRateOnLineOfGauge(votes[i].gaugeID) * votes[i].votePowerBPS;
            }
            return accummulator * global_numerator / global_denominator;
        } else {
            return 0;
        }
    }
}
