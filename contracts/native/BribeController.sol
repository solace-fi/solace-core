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

// ? PROVIDE WITHDRAW BRIBE FUNCTION?

contract BribeController is 
        IBribeController, 
        ReentrancyGuard, 
        Governable 
    {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableMapS for EnumerableMapS.AddressToUintMap;

    /***************************************
    GLOBAL PUBLIC VARIABLES
    ***************************************/

    /// @notice Registry address
    address public override registry;

    /// @notice GaugeController.sol address
    address public override gaugeController;

    /// @notice UnderwriterLockVoting.sol address
    address public override votingContract;

    /// @notice Updater address.
    /// @dev Second address that can call updateGaugeWeights (in addition to governance).
    address public override updater;

    /// @notice End timestamp for last epoch that bribes were distributed for all stored votes.
    uint256 public override lastTimeBribesDistributed;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    uint256 constant internal WEEK = 604800;

    /// @notice epochEndTimeStamp => gaugeID => bribeToken => totalBribeAmount.
    mapping(uint256 => mapping(uint256 => EnumerableMapS.AddressToUintMap)) internal _providedBribesA;

    /// @notice gaugeID => bribeToken => bribeAmount.
    mapping(uint256 => EnumerableMapS.AddressToUintMap) internal _providedBribes;

    /// @notice voter => Vote (gaugeID => votePowerBPS).
    mapping(address => EnumerableMapS.UintToUintMap) internal _votes;

    /// @notice voter => bribeToken => claimableBribeAmount.
    mapping(address => EnumerableMapS.AddressToUintMap) internal _claimableBribes;

    /// @notice briber => bribeToken => claimableBribeAmount.
    mapping(address => EnumerableMapS.AddressToUintMap) internal _lifetimeProvidedBribes;

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
        lastTimeBribesDistributed = _getEpochStartTimestamp();
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
     * @notice Get bribes which have been provided for the current epoch for a given gauge.
     * @param gaugeID_ GaugeID to query for.
     * @return bribes Array of provided bribes.
     */
    function getProvidedBribesForCurrentEpoch(uint256 gaugeID_) external view override returns (Bribe[] memory bribes) {
        uint256 epochStartTimeStamp = _getEpochStartTimestamp();
        uint256 length = _providedBribesA[epochStartTimeStamp][gaugeID_].length();
        bribes = new Bribe[](length);
        for (uint256 i = 0; i < length; i++) {
            (address bribeToken, uint256 bribeAmount) = _providedBribesA[epochStartTimeStamp][gaugeID_].at(i);
            bribes[i] = Bribe(bribeToken, bribeAmount);
        }
        return bribes;
    }

    /**
     * @notice Get bribes which have been provided for the next epoch for a given gauge.
     * @param gaugeID_ GaugeID to query for.
     * @return bribes Array of provided bribes.
     */
    function getProvidedBribesForNextEpoch(uint256 gaugeID_) external view override returns (Bribe[] memory bribes) {
        uint256 epochEndTimeStamp = _getEpochEndTimestamp();
        uint256 length = _providedBribesA[epochEndTimeStamp][gaugeID_].length();
        bribes = new Bribe[](length);
        for (uint256 i = 0; i < length; i++) {
            (address bribeToken, uint256 bribeAmount) = _providedBribesA[epochEndTimeStamp][gaugeID_].at(i);
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
        emit RegistrySet(_registry);
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
     */
    function voteForBribe(address voter_, uint256 gaugeID_) external override nonReentrant {
        // CHECKS
        if (voter_ != msg.sender && IUnderwritingLockVoting(votingContract).delegateOf(voter_) != msg.sender) revert NotOwnerNorDelegate();
        if (_providedBribes[gaugeID_].length() == 0) revert NoBribesForSelectedGauge();



        // uint256 length = _claimableBribes[msg.sender].length();
        // if (length == 0) return;

        // while (_claimableBribes[msg.sender].length() != 0) {
        //     (address bribeToken, uint256 bribeAmount) = _claimableBribes[msg.sender].at(0);
        //     _claimableBribes[msg.sender].remove(bribeToken);
        //     SafeERC20.safeTransfer(IERC20(bribeToken), msg.sender, bribeAmount);
        //     emit BribeClaimed(msg.sender, bribeToken, bribeAmount);
        // }
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

    // IDEAL FLOW is gaugeController.updateGaugeWeights() => BribeController.distributeBribes() => UnderwritingLockVoting.chargePremiums()
    // We don't have an onchain mechanism to enforce this flow in the current implementation.
    // However to calculate bribes accurately, we need individual votes, individual vote power, and vote power for each gauge from the same state. And this can only be guaranteed in with the flow above.

    // Very cumbersome to enforce this flow on-chain, should re-architect as being completed in one function in an stateless off-chain node.

    /**
     * @notice Processes bribes, and makes bribes claimable by eligible voters.
     * @dev Designed to be called in a while-loop with custom gas limit of 6M until `lastTimeBribesDistributed == epochStartTimestamp`.
     * Can only be called by the current [**governor**](/docs/protocol/governance) or the updater role.
     */
    function processBribes() external override {
        // CHECKS
        if (!_isUpdaterOrGovernance()) revert NotUpdaterNorGovernance();
        uint256 currentEpochStartTime = _getEpochStartTimestamp();
        // Require gauge weights to have been updated for this epoch => ensure state we are querying from is < 1 WEEK old.
        if(IGaugeController(gaugeController).lastTimeGaugeWeightsUpdated() != currentEpochStartTime) revert GaugeWeightsNotYetUpdated();
        if (lastTimeBribesDistributed >= currentEpochStartTime) revert BribesAlreadyDistributed();

        // GET REQUIRED EXTERNAL DATA
        uint256 votePowerSum = IGaugeController(gaugeController).getVotePowerSum();
        uint256[] memory gaugeVotePower = IGaugeController(gaugeController).getAllGaugeWeights();

        for (uint256 i = 0; i < gaugeVotePower.length; i++) {
            // Convert from gaugeWeight to votePower.
            // Reassign variable instead of using new variable to save stack space.
            gaugeVotePower[i] = gaugeVotePower[i] * votePowerSum / 1e18; 
        }

        // INTERNAL STATE MUTATIONS
        // ITERATE THROUGH EPOCHS, FROM `lastTimeBribesDistributed + WEEK` TO `currentEpochStartTime`
        while (lastTimeBribesDistributed < currentEpochStartTime) {
            lastTimeBribesDistributed += WEEK;

            // ITERATE THROUGH VOTERS
            address[] memory voters = IGaugeController(gaugeController).getVoters(votingContract);
            for(uint256 i = _updateInfo._votersIndex == type(uint88).max ? 0 : _updateInfo._votersIndex ; i < voters.length; i++) {

                // ITERATE THROUGH VOTES
                GaugeStructs.Vote[] memory votes = IGaugeController(gaugeController).getVotes(votingContract, voters[i]);

                for(uint256 j = _updateInfo._votesIndex == type(uint88).max || i != _updateInfo._votersIndex ? 0 : _updateInfo._votesIndex; j < votes.length; j++) {

                    if (gaugeVotePower[votes[j].gaugeID] > 0) {
                        // ITERATE THROUGH BRIBE TOKENS
                        for(uint256 k = _updateInfo._votingContractsIndex == type(uint80).max || j != _updateInfo._votesIndex ? 0 : _updateInfo._votingContractsIndex; k < _providedBribesA[lastTimeBribesDistributed][votes[j].gaugeID].length(); k++) {
                            // CHECKPOINT
                            if (gasleft() < 30000) {return _saveUpdateState(k, i, j);}

                            (address bribeToken, uint256 totalBribeAmount) = _providedBribesA[lastTimeBribesDistributed][votes[j].gaugeID].at(k);
                            uint256 proportionalBribeAmount = totalBribeAmount * IUnderwritingLockVoting(votingContract).getLastProcessedVotePowerOf(voters[i]) / gaugeVotePower[votes[j].gaugeID];
                            (,uint256 runningBribeTotalForVoter) = _claimableBribes[voters[i]].tryGet(bribeToken);
                            // STATE CHANGE 1 - ADD TO CLAIMABLE BRIBES OF USER
                            _claimableBribes[voters[i]].set(bribeToken, runningBribeTotalForVoter + proportionalBribeAmount);
                        }
                    }
                }
            }

            emit BribesDistributed(lastTimeBribesDistributed);
        }

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
        emit IncompleteBribeDistribution();
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