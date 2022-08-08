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

    /// @notice voter => delegate
    mapping(address => address) public override lockDelegateOf;

    /// @notice voter => used voting power percentage (max of 10000 BPS)
    /// @dev Technically a cache for sum of used votingPowerBPS for a user. Required for input validation in _vote()
    /// @dev which will otherwise encounter a potentially unbounded loop to get first-hand data.
    mapping(address => uint256) public override usedVotePowerBPSOf;

    uint256 constant public override WEEK = 604800;
    uint256 constant public override MONTH = 2628000;
    uint256 constant public override YEAR = 31536000;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/
    /// @notice Total premium amount due to the revenueRouter.
    /// @dev Should == type(uint256).max when in-between complete chargePremiums() call
    /// @dev Keep this slot warm, avoid cost of re-warming a cold storage slot.
    /// @dev Originally a local function variable, but need to save state between two function calls.
    uint256 internal _totalPremiumDue;

    /// @notice voter => last processed vote power.
    /// @dev Cache for getVotePower() call for most recent complete GaugeController.updateGaugeWeights().
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
        // Initialize totalPremiumDue and _updateInfo as warm non-zero storage slots.
        _totalPremiumDue = type(uint256).max;
        _clearUpdateInfo();
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
    function getVotePower(address voter_) external view override returns (uint256 votePower) {
        uint256[] memory lockIDs = IUnderwritingLocker(underwritingLocker).getAllLockIDsOf(voter_);
        uint256 numVoterLocks = lockIDs.length;
        for (uint256 i = 0; i < numVoterLocks; i++) {votePower += _getVotePowerOfLock(lockIDs[i]);}
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
     * @dev Designed to be called in a while-loop until this `lastTimePremiumsCharged == epochStartTimestamp`
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function chargePremiums() external override onlyGovernance {
        uint256 epochStartTimestamp = _getEpochStartTimestamp();
        if(_getLastTimeGaugesUpdated() != epochStartTimestamp) revert GaugeWeightsNotYetUpdated();
        if(lastTimePremiumsCharged == epochStartTimestamp) revert LastEpochPremiumsAlreadyProcessed({epochTime: epochStartTimestamp});

        // Make single call for universal charge premium parameters.
        uint256 insuranceCapacity = IGaugeController(gaugeController).getInsuranceCapacity();
        uint256 votePowerSum = IGaugeController(gaugeController).getVotePowerSum();

        // Iterate through voters
        address[] memory voters = IGaugeController(gaugeController).getVoters(address(this));
        for(uint256 i = _updateInfo._votersIndex == type(uint88).max ? 0 : _updateInfo._votersIndex ; i < voters.length; i++) {
            console.log("chargePremiums 1 %s" , gasleft());    
            // Short-circuit operator, need at least 30K gas for getVoteCount() call
            if (gasleft() < 30000 || gasleft() < 10000 * IGaugeController(gaugeController).getVoteCount(address(this), voters[i])) {return _saveUpdateState(0, i, 0);}        
            // Need to test if unbounded loop of SLOADs and external calls can be a DDOS issue, if so need to have 4 update variables vs 2.
            // Unbounded loop for SLOAD and CALL - unbounded with votes
            uint256 premium = _calculateVotePremium(voters[i], insuranceCapacity, votePowerSum); // 87K gas for 10 votes
            console.log("chargePremiums 2 %s" , gasleft());
            uint256[] memory lockIDs = IUnderwritingLocker(underwritingLocker).getAllLockIDsOf(voters[i]);
            console.log("chargePremiums 3 %s" , gasleft());
            uint256 numLocks = lockIDs.length;

            // Iterate through locks
            // Using _votesIndex as _lockIndex
            for(uint256 j = _updateInfo._votesIndex == type(uint88).max ? 0 : _updateInfo._votesIndex; j < numLocks; j++) {
                console.log("chargePremiums 4 %s" , gasleft());            
                if (gasleft() < 20000) {return _saveUpdateState(0, i, j);}
                // Split premium amongst each lock equally.
                IUnderwritingLocker(underwritingLocker).chargePremium(lockIDs[j], premium / numLocks);
                console.log("chargePremiums 5 %s" , gasleft());
            }
            _totalPremiumDue -= premium;
        }

        SafeERC20.safeTransferFrom(
            IERC20(IUnderwritingLocker(underwritingLocker).token()), 
            underwritingLocker, 
            revenueRouter,
            type(uint256).max - _totalPremiumDue // Avoid _totalPremiumDue being zero.
        );

        _clearUpdateInfo();
        _totalPremiumDue = type(uint256).max; // Reinitialize _totalPremiumDue.
        lastTimePremiumsCharged = epochStartTimestamp;
        emit AllPremiumsCharged(epochStartTimestamp);
        console.log("chargePremiums 6 %s" , gasleft());            
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
        emit IncompletePremiumsCharge();
        console.log("------");
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
     * @param votePowerSum_ Solace Native total vote power sum.
     * @return premium Premium for voter.
     */
    function _calculateVotePremium(address voter_, uint256 insuranceCapacity_, uint256 votePowerSum_) internal view returns (uint256 premium) {
        GaugeStructs.Vote[] memory votes = IGaugeController(gaugeController).getVotes(address(this), voter_);
        uint256 voteCount = votes.length;

        if (voteCount > 0) {
            uint256 accummulator;
            uint256 globalNumerator = _lastProcessedVotePowerOf[voter_] * insuranceCapacity_ * WEEK;
            // rateOnLine scaled to correct fraction for week => multiply by (WEEK / YEAR) * (1 / 1e18)
            // votePowerBPS scaled to correct fraction => multiply by (1 / 10000)
            uint256 globalDenominator = votePowerSum_ * YEAR * 1e18 * 10000;
            for (uint256 i = 0 ; i < voteCount; i++) {
                accummulator += IGaugeController(gaugeController).getRateOnLineOfGauge(votes[i].gaugeID) * votes[i].votePowerBPS;
            }
            return accummulator * globalNumerator / globalDenominator;
        } else {
            return 0;
        }
    }
}
