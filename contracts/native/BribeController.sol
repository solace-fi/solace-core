// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./../interfaces/native/IBribeController.sol";
import "./../interfaces/native/IUnderwritingLockVoting.sol";
import "./../interfaces/native/IGaugeController.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../utils/EnumerableMapS.sol";
import "./../utils/Governable.sol";
import "hardhat/console.sol";

contract BribeController is 
        IBribeController, 
        ReentrancyGuard, 
        Governable 
    {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableMapS for EnumerableMapS.AddressToUintMap;
    using EnumerableMapS for EnumerableMapS.UintToUintMap;

    /***************************************
    GLOBAL PUBLIC VARIABLES
    ***************************************/

    /// @notice Registry address
    address public override registry;

    /// @notice GaugeController.sol address
    address public override gaugeController;

    /// @notice UnderwriterLockVoting.sol address
    address public override votingContract;

    /// @notice Revenue router address
    address public override revenueRouter;

    /// @notice Updater address.
    /// @dev Second address that can call updateGaugeWeights (in addition to governance).
    address public override updater;

    /// @notice End timestamp for last epoch that bribes were processed for all stored votes.
    uint256 public override lastTimeBribesProcessed;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    /// @notice gaugeID => bribeToken => bribeAmount.
    mapping(uint256 => EnumerableMapS.AddressToUintMap) internal _providedBribes;

    /// @notice briber => bribeToken => lifetimeOfferedBribeAmount.
    mapping(address => EnumerableMapS.AddressToUintMap) internal _lifetimeProvidedBribes;

    /// @notice voter => bribeToken => claimableBribeAmount.
    mapping(address => EnumerableMapS.AddressToUintMap) internal _claimableBribes;

    /// @notice gaugeID => total vote power
    /// @dev We use this to i.) Store an enumerable collection of gauges with bribes, 
    /// @dev and ii.) Store total vote power chaisng bribes for each gauge.
    EnumerableMapS.UintToUintMap internal _gaugeToTotalVotePower;

    /// @notice gaugeID => voter => votePowerBPS.
    mapping(uint256 => EnumerableMapS.AddressToUintMap) internal _votes;

    /// @notice whitelist of tokens that can be accepted as bribes
    EnumerableSet.AddressSet internal _bribeTokenWhitelist;

    /// @notice State of last [`distributeBribes()`](#distributeBribes) call.
    GaugeStructs.UpdateInfo internal _updateInfo;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the UnderwritingLocker contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param registry_ The [`Registry`](./Registry) contract address.
     */
    constructor(address governance_, address registry_)
        Governable(governance_)
    {
        _setRegistry(registry_);
        _clearUpdateInfo();
        lastTimeBribesProcessed = _getEpochStartTimestamp();
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch.
     * @return timestamp
     */
    function _getEpochStartTimestamp() internal view returns (uint256 timestamp) {
        return IGaugeController(gaugeController).getEpochStartTimestamp();
    }

    /**
     * @notice Get timestamp for end of the current epoch.
     * @return timestamp
     */
    function _getEpochEndTimestamp() internal view returns (uint256 timestamp) {
        return IGaugeController(gaugeController).getEpochEndTimestamp();
    }

    /**
     * @notice Query whether msg.sender is either the governance or updater role.
     * @return True if msg.sender is either governor or updater roler, and contract govenance is not locked, false otherwise.
     */
    function _isUpdaterOrGovernance() internal view returns (bool) {
        return ( !this.governanceIsLocked() && ( msg.sender == updater || msg.sender == this.governance() ));
    }

    /**
     * @notice Get unused votePowerBPS for a voter.
     * @param voter_ The address of the voter to query for.
     * @return unusedVotePowerBPS
     */
    function _getUnusedVotePowerBPS(address voter_) internal view returns (uint256 unusedVotePowerBPS) {
        return (10000 - IUnderwritingLockVoting(votingContract).usedVotePowerBPSOf(voter_));
    }

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch.
     * @return timestamp
     */
    function getEpochStartTimestamp() external view override returns (uint256 timestamp) {
        return _getEpochStartTimestamp();
    }

    /**
     * @notice Get timestamp for end of the current epoch.
     * @return timestamp
     */
    function getEpochEndTimestamp() external view override returns (uint256 timestamp) {
        return _getEpochEndTimestamp();
    }

    /**
     * @notice Get unused votePowerBPS for a voter.
     * @param voter_ The address of the voter to query for.
     * @return unusedVotePowerBPS
     */
    function getUnusedVotePowerBPS(address voter_) external view override returns (uint256 unusedVotePowerBPS) {
        return _getUnusedVotePowerBPS(voter_);
    }

    /**
     * @notice Get list of whitelisted bribe tokens.
     * @return whitelist
     */
    function getBribeTokenWhitelist() external view override returns (address[] memory whitelist) {
        uint256 length = _bribeTokenWhitelist.length();
        whitelist = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            whitelist[i] = _bribeTokenWhitelist.at(i);
        }
    }

    /**
     * @notice Get claimable bribes for a given voter.
     * @param voter_ Voter to query for.
     * @return bribes Array of claimable bribes.
     */
    function getClaimableBribes(address voter_) external view override returns (Bribe[] memory bribes) {
        uint256 length = _claimableBribes[voter_].length();
        bribes = new Bribe[](length);
        for (uint256 i = 0; i < length; i++) {
            (address bribeToken, uint256 bribeAmount) = _claimableBribes[voter_].at(i);
            bribes[i] = Bribe(bribeToken, bribeAmount);
        }
        return bribes;
    }

    /**
     * @notice Get all gaugeIDs with bribe/s offered in the present epoch.
     * @return gauges Array of gaugeIDs with current bribe.
     */
    function getAllGaugesWithBribe() external view override returns (uint256[] memory gauges) {
        uint256 length = _gaugeToTotalVotePower.length();
        gauges = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            (uint256 gaugeID,) = _gaugeToTotalVotePower.at(i);
            gauges[i] = gaugeID;
        }
    }

    /**
     * @notice Get all bribes which have been offered for a given gauge.
     * @param gaugeID_ GaugeID to query for.
     * @return bribes Array of provided bribes.
     */
    function getProvidedBribesForGauge(uint256 gaugeID_) external view override returns (Bribe[] memory bribes) {
        uint256 length = _providedBribes[gaugeID_].length();
        bribes = new Bribe[](length);
        for (uint256 i = 0; i < length; i++) {
            (address bribeToken, uint256 bribeAmount) = _providedBribes[gaugeID_].at(i);
            bribes[i] = Bribe(bribeToken, bribeAmount);
        }
        return bribes;
    }

    /**
     * @notice Get lifetime provided bribes for a given briber.
     * @param briber_ Briber to query for.
     * @return bribes Array of lifetime provided bribes.
     */
    function getLifetimeProvidedBribes(address briber_) external view override returns (Bribe[] memory bribes) {
        uint256 length = _lifetimeProvidedBribes[briber_].length();
        bribes = new Bribe[](length);
        for (uint256 i = 0; i < length; i++) {
            (address bribeToken, uint256 bribeAmount) = _lifetimeProvidedBribes[briber_].at(i);
            bribes[i] = Bribe(bribeToken, bribeAmount);
        }
        return bribes;
    }

    /**
     * @notice Get all current voteForBribes for a given voter.
     * @dev Inefficient implementation to avoid 
     * @param voter_ Voter to query for.
     * @return votes Array of Votes {uint256 gaugeID, uint256 votePowerBPS}.
     */
    function getVotesForVoter(address voter_) external view override returns (GaugeStructs.Vote[] memory votes) {
        // Get num of votes
        uint256 numVotes = 0;

        // Iterate by gauge
        for (uint256 i = 0; i < _gaugeToTotalVotePower.length(); i++) {
            (uint256 gaugeID,) = _gaugeToTotalVotePower.at(i);
            // Iterate by vote
            for (uint256 j = 0; j < _votes[gaugeID].length(); j++) {
                (address voter,) = _votes[gaugeID].at(j);
                if (voter == voter_) numVotes += 1;
            }
        }

        // Define return array
        votes = new GaugeStructs.Vote[](numVotes);
        uint256 votes_index = 0;

        // Iterate by gauge
        for (uint256 i = 0; i < _gaugeToTotalVotePower.length(); i++) {
            (uint256 gaugeID,) = _gaugeToTotalVotePower.at(i);
            // Iterate by vote
            for (uint256 j = 0; j < _votes[gaugeID].length(); j++) {
                (address voter, uint256 votePowerBPS) = _votes[gaugeID].at(j);
                if (voter == voter_) {
                    votes[votes_index] = GaugeStructs.Vote(gaugeID, votePowerBPS);
                    votes_index += 1;
                    if (votes_index == numVotes) return votes;
                }
            }
        }
    }

    /**
     * @notice Get all current voteForBribes for a given gaugeID.
     * @param gaugeID_ GaugeID to query for.
     * @return votes Array of VoteForGauge {address voter, uint256 votePowerBPS}.
     */
    function getVotesForGauge(uint256 gaugeID_) external view override returns (VoteForGauge[] memory votes) {
        uint256 length = _votes[gaugeID_].length();
        votes = new VoteForGauge[](length);
        for (uint256 i = 0; i < length; i++) {
            (address voter, uint256 votePowerBPS) = _votes[gaugeID_].at(i);
            votes[i] = VoteForGauge(voter, votePowerBPS);
        }
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
        // set gaugeController
        (, address gaugeControllerAddr) = reg.tryGet("gaugeController");
        if(gaugeControllerAddr == address(0x0)) revert ZeroAddressInput("gaugeController");
        gaugeController = gaugeControllerAddr;
        // set votingContract
        (, address underwritingLockVoting) = reg.tryGet("underwritingLockVoting");
        if(underwritingLockVoting == address(0x0)) revert ZeroAddressInput("underwritingLockVoting");
        votingContract = underwritingLockVoting;
        // set revenueRouter
        (, address revenueRouterAddr) = reg.tryGet("revenueRouter");
        if(revenueRouterAddr == address(0x0)) revert ZeroAddressInput("revenueRouter");
        revenueRouter = revenueRouterAddr;
        emit RegistrySet(_registry);
    }

    /**
     * @notice Remove vote for gaugeID with bribe.
     * @param voter_ address of voter.
     * @param gaugeID_ The ID of the gauge to remove vote for.
     */
    function _removeVoteForBribe(address voter_, uint256 gaugeID_) internal {
        uint256[] memory gaugeIDs_ = new uint256[](1);
        uint256[] memory votePowerBPSs_ = new uint256[](1);
        gaugeIDs_[0] = gaugeID_;
        votePowerBPSs_[0] = 0;
        _voteForBribe(voter_, gaugeIDs_, votePowerBPSs_);
    }

    /**
     * @notice Add, change or remove vote for bribe.
     * Can only be called by the voter or their delegate.
     * @param voter_ The voter address.
     * @param gaugeIDs_ The array of gaugeIDs to vote for.
     * @param votePowerBPSs_ The corresponding array of votePowerBPS values. Can be from 0-10000.
     */
    function _voteForBribe(address voter_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) internal nonReentrant {
        // CHECKS
        if (voter_ != msg.sender && IUnderwritingLockVoting(votingContract).delegateOf(voter_) != msg.sender) revert NotOwnerNorDelegate();
        if (gaugeIDs_.length != votePowerBPSs_.length) revert ArrayArgumentsLengthMismatch();
        if ( _getEpochStartTimestamp() != lastTimeBribesProcessed) revert LastEpochBribesNotProcessed();

        for(uint256 i = 0; i < gaugeIDs_.length; i++) {
            uint256 gaugeID = gaugeIDs_[i];
            uint256 votePowerBPS = votePowerBPSs_[i];
            if (_providedBribes[gaugeID].length() == 0) revert NoBribesForSelectedGauge();
            // USE CHECKS IN EXTERNAL CALLS BEFORE FURTHER INTERNAL STATE MUTATIONS
            IUnderwritingLockVoting(votingContract).vote(voter_, gaugeID, votePowerBPS);
            (bool votePresent, uint256 oldVotePowerBPS) = _votes[gaugeID].tryGet(voter_);

            // If remove vote
            if (votePowerBPS == 0) {
                if (!votePresent) revert CannotRemoveNonExistentVote();
                _votes[gaugeID].remove(voter_);
                if (_votes[gaugeID].length() == 0) _gaugeToTotalVotePower.remove(gaugeID);
                emit VoteForBribeRemoved(voter_, gaugeID);
            } else {
                _gaugeToTotalVotePower.set(gaugeID, 0);
                _votes[gaugeID].set(voter_, votePowerBPS);

                // Change vote
                if(votePresent) {
                    emit VoteForBribeChanged(voter_, gaugeID, votePowerBPS, oldVotePowerBPS);
                // Add vote
                } else {
                    emit VoteForBribeAdded(voter_, gaugeID, votePowerBPS);
                }
            }
        }
    }

    /***************************************
    BRIBER FUNCTIONS
    ***************************************/

    /**
     * @notice Offer bribes.
     * @param bribeTokens_ Array of bribe token addresses.
     * @param bribeAmounts_ Array of bribe token amounts.
     * @param gaugeID_ Gauge ID to bribe for.
     */
    function offerBribes(
        address[] calldata bribeTokens_, 
        uint256[] calldata bribeAmounts_,
        uint256 gaugeID_
    ) external override nonReentrant {
        // CHECKS
        if (bribeTokens_.length != bribeAmounts_.length) revert ArrayArgumentsLengthMismatch();
        if (!IGaugeController(gaugeController).isGaugeActive(gaugeID_)) revert CannotBribeForInactiveGauge();
        if ( _getEpochStartTimestamp() != lastTimeBribesProcessed) revert LastEpochBribesNotProcessed();

        uint256 length = _bribeTokenWhitelist.length();
        for (uint256 i = 0; i < length; i++) {
            if (!_bribeTokenWhitelist.contains(bribeTokens_[i])) revert CannotBribeWithNonWhitelistedToken();
        }

        // INTERNAL STATE MUTATIONS
        for (uint256 i = 0; i < length; i++) {
            (,uint256 previousBribeSum) = _providedBribes[gaugeID_].tryGet(bribeTokens_[i]);
            _providedBribes[gaugeID_].set(bribeTokens_[i], previousBribeSum + bribeAmounts_[i]);
            (,uint256 lifetimeBribeTotal) = _lifetimeProvidedBribes[msg.sender].tryGet(bribeTokens_[i]);
            _lifetimeProvidedBribes[msg.sender].set(bribeTokens_[i], lifetimeBribeTotal + bribeAmounts_[i]);
        }

        // EXTERNAL CALLS + EVENTS
        for (uint256 i = 0; i < length; i++) {
            SafeERC20.safeTransferFrom(
                IERC20(bribeTokens_[i]),
                msg.sender,
                address(this),
                bribeAmounts_[i]
            );

            emit BribeProvided(msg.sender, gaugeID_, bribeTokens_[i], bribeAmounts_[i]);
        }
    }

    /***************************************
    VOTER FUNCTIONS
    ***************************************/

    /**
     * @notice Vote for gaugeID with bribe.
     * @param voter_ address of voter.
     * @param gaugeID_ gaugeID to vote for
     * @param votePowerBPS_ Vote power BPS to assign to this vote.
     */
    function voteForBribe(address voter_, uint256 gaugeID_, uint256 votePowerBPS_) external override {
        uint256[] memory gaugeIDs_ = new uint256[](1);
        uint256[] memory votePowerBPSs_ = new uint256[](1);
        gaugeIDs_[0] = gaugeID_;
        votePowerBPSs_[0] = votePowerBPS_;
        _voteForBribe(voter_, gaugeIDs_, votePowerBPSs_);
    }

    /**
     * @notice Vote for multiple gaugeIDs with bribes.
     * @param voter_ address of voter.
     * @param gaugeIDs_ Array of gaugeIDs to vote for
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteForMultipleBribes(address voter_, uint256[] calldata gaugeIDs_, uint256[] calldata votePowerBPSs_) external override {
        _voteForBribe(voter_, gaugeIDs_, votePowerBPSs_);
    }

    /**
     * @notice Register a single voting configuration for multiple voters.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voters.
     * @param gaugeIDs_ Array of gauge IDs to vote for.
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteForBribeForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) external override {
        uint256 length = voters_.length;
        for (uint256 i = 0; i < length; i++) {
            _voteForBribe(voters_[i], gaugeIDs_, votePowerBPSs_);
        }
    }

    /**
     * @notice Remove vote for gaugeID with bribe.
     * @param voter_ address of voter.
     * @param gaugeID_ The ID of the gauge to remove vote for.
     */
    function removeVoteForBribe(address voter_, uint256 gaugeID_) external override {
        _removeVoteForBribe(voter_, gaugeID_);
    }

    /**
     * @notice Remove multiple votes for bribes.
     * @param voter_ address of voter.
     * @param gaugeIDs_ Array of gaugeIDs to remove votes for
     */
    function removeVoteForMultipleBribes(address voter_, uint256[] calldata gaugeIDs_) external override {
        uint256[] memory votePowerBPSs_ = new uint256[](gaugeIDs_.length);
        for(uint256 i = 0; i < gaugeIDs_.length; i++) {votePowerBPSs_[i] = 0;}
        _voteForBribe(voter_, gaugeIDs_, votePowerBPSs_);
    }

    /**
     * @notice Remove gauge votes for multiple voters.
     * @notice Votes cannot be removed while voting is frozen.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voter addresses.
     * @param gaugeIDs_ Array of gauge IDs to remove votes for.
     */
    function removeVotesForBribeForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_) external override {
        uint256 length = voters_.length;
        uint256[] memory votePowerBPSs_ = new uint256[](gaugeIDs_.length);
        for(uint256 i = 0; i < gaugeIDs_.length; i++) {votePowerBPSs_[i] = 0;}
        for (uint256 i = 0; i < length; i++) {
            _voteForBribe(voters_[i], gaugeIDs_, votePowerBPSs_);
        }
    }

    // Should delegate also be able to claim bribes for user?
    /**
     * @notice Claim bribes.
     */
    function claimBribes() external override nonReentrant {
        uint256 length = _claimableBribes[msg.sender].length();
        if (length == 0) return;

        while (_claimableBribes[msg.sender].length() != 0) {
            (address bribeToken, uint256 bribeAmount) = _claimableBribes[msg.sender].at(0);
            _claimableBribes[msg.sender].remove(bribeToken);
            SafeERC20.safeTransfer(IERC20(bribeToken), msg.sender, bribeAmount);
            emit BribeClaimed(msg.sender, bribeToken, bribeAmount);
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
     * @notice Set updater address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param updater_ The address of the new updater.
     */
    function setUpdater(address updater_) external override onlyGovernance {
        updater = updater_;
        emit UpdaterSet(updater_);
    }

    /**
     * @notice Adds token to whitelist of accepted bribe tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param bribeToken_ Address of bribe token.
     */
    function addBribeToken(address bribeToken_) external override onlyGovernance {
        _bribeTokenWhitelist.add(bribeToken_);
        emit BribeTokenAdded(bribeToken_);
    }

    /**
     * @notice Removes tokens from whitelist of accepted bribe tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param bribeToken_ Address of bribe token.
     */
    function removeBribeToken(address bribeToken_) external override onlyGovernance {
        bool success = _bribeTokenWhitelist.remove(bribeToken_);
        if (!success) revert BribeTokenNotAdded();
        emit BribeTokenRemoved(bribeToken_);
    }

    // To get bribe allocated to a vote, need all votes allocated to the gauge to calculate total votepower allocated to that gauge

    // Need two iterations
    // 1.) Iterate to find total votepower to each gaugeID
    // 2.) Iterate to allocate bribes to each voter, also cleanup of _providedBribes, _voters and _votes enumerable collections
    // Leftover bribes to revenueRouter

    /**
     * @notice Processes bribes, and makes bribes claimable by eligible voters.
     * @dev Designed to be called in a while-loop with custom gas limit of 6M until `lastTimeBribesProcessed == epochStartTimestamp`.
     * Can only be called by the current [**governor**](/docs/protocol/governance) or the updater role.
     */
    function processBribes() external override {
        // CHECKS
        if (!_isUpdaterOrGovernance()) revert NotUpdaterNorGovernance();
        uint256 currentEpochStartTime = _getEpochStartTimestamp();
        // Require gauge weights to have been updated for this epoch => ensure state we are querying from is < 1 WEEK old.
        if(IUnderwritingLockVoting(votingContract).lastTimePremiumsCharged() != currentEpochStartTime) revert LastEpochPremiumsNotCharged();
        if (lastTimeBribesProcessed >= currentEpochStartTime) revert BribesAlreadyDistributed();

        // LOOP 1 - GET TOTAL VOTE POWER FOR EACH GAUGE 
        // Block-scope to avoid stack too deep error
        {
        uint256 numGauges = _gaugeToTotalVotePower.length();        
        // Iterate by gauge
        for (uint256 i = 0; i < numGauges; i++) {
            // Iterate by vote
            (uint256 gaugeID, uint256 runningVotePowerSum) = _gaugeToTotalVotePower.at(i);
            uint256 numVotes = _votes[gaugeID].length();

            for (uint256 j = 0; j < numVotes; j++) {
                (address voter, uint256 votePowerBPS) = _votes[gaugeID].at(j);
                uint256 votePower = IUnderwritingLockVoting(votingContract).getLastProcessedVotePowerOf(voter);
                // State mutation 1
                _gaugeToTotalVotePower.set(gaugeID, runningVotePowerSum + (votePower * votePowerBPS) / 10000);
            }
        }
        }

        // LOOP 2 - DO ACCOUNTING FOR _claimableBribes AND _providedBribes MAPPINGS
        // _gaugeToTotalVotePower, _votes, _voters, _votes and _providedBribes enumerable collections should be empty at the end.
        {
        // Iterate by gauge
        while (_gaugeToTotalVotePower.length() > 0) {
            (uint256 gaugeID, uint256 votePowerSum) = _gaugeToTotalVotePower.at(0);
            // Iterate by vote
            while(_votes[gaugeID].length() > 0) {
                (address voter, uint256 votePowerBPS) = _votes[gaugeID].at(0);
                uint256 bribeProportion = (IUnderwritingLockVoting(votingContract).getLastProcessedVotePowerOf(voter) * votePowerBPS / 10000) * 1e18 / votePowerSum;

                // Iterate by bribeToken
                uint256 numBribeTokens = _providedBribes[gaugeID].length();
                for (uint256 k = 0; k < numBribeTokens; k++) {
                    // State mutation 2
                    (address bribeToken, uint256 totalBribeAmount) = _providedBribes[gaugeID].at(k);
                    (, uint256 runningClaimableAmount) = _claimableBribes[voter].tryGet(bribeToken);
                    uint256 bribeAmount = totalBribeAmount * bribeProportion / 1e18;
                    _providedBribes[gaugeID].set(bribeToken, totalBribeAmount - bribeAmount); // Should not underflow as integers round down in Solidity.
                    _claimableBribes[voter].set(bribeToken, runningClaimableAmount + bribeAmount);
                }
                // Cleanup _votes, _gaugeToTotalVotePower enumerable collections.
                _removeVoteForBribe(voter, gaugeID);
            }

            // Cleanup _providedBribes enumerable collection.
            // Send leftover bribes to revenueRouter.
            while(_providedBribes[gaugeID].length() > 0) {
                (address bribeToken, uint256 remainingBribeAmount) = _providedBribes[gaugeID].at(0);
                SafeERC20.safeTransfer(IERC20(bribeToken), revenueRouter, remainingBribeAmount);
                _providedBribes[gaugeID].remove(bribeToken);
            }
        }
        }

        emit BribesDistributed(currentEpochStartTime);
        _clearUpdateInfo();
    }

    /***************************************
     distributeBribes() HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Save state of updating gauge weights to _updateInfo.
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
        emit IncompleteBribeProcessing();
    }

    /// @notice Reset _updateInfo to starting state.
    /// @dev Avoid zero-value of storage slot.
    function _clearUpdateInfo() internal {
        uint256 bitmap = type(uint256).max;
        assembly {
            sstore(_updateInfo.slot, bitmap)
        }
    }
}