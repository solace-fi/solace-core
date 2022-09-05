// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./GaugeStructs.sol";

interface IBribeController {
    /***************************************
    STRUCTS
    ***************************************/

    struct Bribe {
        address bribeToken;
        uint256 bribeAmount;
    }

    struct VoteForGauge {
        address voter;
        uint256 votePowerBPS;
    }

    /***************************************
    CUSTOM ERRORS
    ***************************************/

    /// @notice Thrown when zero address is given as an argument.
    /// @param contractName Name of contract for which zero address was incorrectly provided.
    error ZeroAddressInput(string contractName);
    
    /// @notice Thrown when array arguments are mismatched in length;
    error ArrayArgumentsLengthMismatch();

    /// @notice Thrown when removeBribeToken() is attempted for non-whitelisted token.
    error BribeTokenNotAdded();

    /// @notice Thrown when provideBribe attempted for inactive gauge.
    error CannotBribeForInactiveGauge();

    /// @notice Thrown when provideBribe attempted for non-existing gauge.
    error CannotBribeForNonExistentGauge();

    /// @notice Thrown when provideBribe attempted unwhitelisted bribe token.
    error CannotBribeWithNonWhitelistedToken();

    /// @notice Thrown when attempt to claim bribes when no bribe rewards are claimable.
    error NoClaimableBribes();

    /// @notice Thrown when voteForBribe() attempted by a non-owner or non-delegate.
    error NotOwnerNorDelegate();

    /// @notice Thrown when voteForBribe() attempted for gauge without bribe.
    error NoBribesForSelectedGauge();

    /// @notice Thrown when offerBribe() or voteForBribe() attempted before last epoch bribes are processed.
    error LastEpochBribesNotProcessed();

    /// @notice Thrown if processBribes() is called after bribes have already been successfully processed in the current epoch.
    error BribesAlreadyProcessed();

    /// @notice Thrown when processBribes is attempted before the last epoch's premiums have been successfully charged through underwritingLockVoting.chargePremiums().
    error LastEpochPremiumsNotCharged();

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when bribe is provided.
    event BribeProvided(address indexed briber, uint256 indexed gaugeID, address indexed bribeToken, uint256 bribeAmount);

    /// @notice Emitted when a vote is added.
    event VoteForBribeAdded(address indexed voter, uint256 indexed gaugeID, uint256 votePowerBPS);

    /// @notice Emitted when a vote is added.
    event VoteForBribeChanged(address indexed voter, uint256 indexed gaugeID, uint256 newVotePowerBPS, uint256 oldVotePowerBPS);

    /// @notice Emitted when a vote is removed.
    event VoteForBribeRemoved(address indexed voter, uint256 indexed gaugeID);

    /// @notice Emitted when bribe is claimed.
    event BribeClaimed(address indexed briber, address indexed bribeToken, uint256 bribeAmount);

    /// @notice Emitted when registry set.
    event RegistrySet(address indexed registry);

    /// @notice Emitted when bribe token added to whitelist.
    event BribeTokenAdded(address indexed bribeToken);

    /// @notice Emitted when bribe token removed from whitelist.
    event BribeTokenRemoved(address indexed bribeToken);
    
    /// @notice Emitted when token rescued.
    event TokenRescued(address indexed token, address indexed receiver, uint256 balance);

    /// @notice Emitted when processBribes() does an incomplete update, and will need to be run again until completion.
    event IncompleteBribesProcessing();

    /// @notice Emitted when bribes distributed for an epoch.
    event BribesProcessed(uint256 indexed epochEndTimestamp);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Registry address.
    function registry() external view returns (address);

    /// @notice Address of GaugeController.sol.
    function gaugeController() external view returns (address);

    /// @notice Address of UnderwritingLockVoting.sol
    function votingContract() external view returns (address);

    /// @notice End timestamp for last epoch that bribes were processed for all stored votes.
    function lastTimeBribesProcessed() external view returns (uint256);

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get timestamp for the start of the current epoch.
     * @return timestamp
     */
    function getEpochStartTimestamp() external view returns (uint256 timestamp);

    /**
     * @notice Get timestamp for end of the current epoch.
     * @return timestamp
     */
    function getEpochEndTimestamp() external view returns (uint256 timestamp);

    /**
     * @notice Get unused votePowerBPS for a voter.
     * @param voter_ The address of the voter to query for.
     * @return unusedVotePowerBPS
     */
    function getUnusedVotePowerBPS(address voter_) external view returns (uint256 unusedVotePowerBPS);

    /**
     * @notice Get list of whitelisted bribe tokens.
     * @return whitelist
     */
    function getBribeTokenWhitelist() external view returns (address[] memory whitelist);

    /**
     * @notice Get claimable bribes for a given voter.
     * @param voter_ Voter to query for.
     * @return bribes Array of claimable bribes.
     */
    function getClaimableBribes(address voter_) external view returns (Bribe[] memory bribes);

    /**
     * @notice Get all gaugeIDs with bribe/s offered in the present epoch.
     * @return gauges Array of gaugeIDs with current bribe.
     */
    function getAllGaugesWithBribe() external view returns (uint256[] memory gauges);

    /**
     * @notice Get all bribes which have been offered for a given gauge.
     * @param gaugeID_ GaugeID to query for.
     * @return bribes Array of provided bribes.
     */
    function getProvidedBribesForGauge(uint256 gaugeID_) external view returns (Bribe[] memory bribes);

    /**
     * @notice Get lifetime provided bribes for a given briber.
     * @param briber_ Briber to query for.
     * @return bribes Array of lifetime provided bribes.
     */
    function getLifetimeProvidedBribes(address briber_) external view returns (Bribe[] memory bribes);

    /**
     * @notice Get all current voteForBribes for a given voter.
     * @param voter_ Voter to query for.
     * @return votes Array of Votes {uint256 gaugeID, uint256 votePowerBPS}.
     */
    function getVotesForVoter(address voter_) external view returns (GaugeStructs.Vote[] memory votes);

    /**
     * @notice Get all current voteForBribes for a given gaugeID.
     * @param gaugeID_ GaugeID to query for.
     * @return votes Array of VoteForGauge {address voter, uint256 votePowerBPS}.
     */
    function getVotesForGauge(uint256 gaugeID_) external view returns (VoteForGauge[] memory votes);

    /**
     * @notice Query whether bribing is currently open.
     * @return True if bribing is open for this epoch, false otherwise.
     */
    function isBribingOpen() external view returns (bool);

    /***************************************
    BRIBER FUNCTIONS
    ***************************************/

    /**
     * @notice Provide bribe/s.
     * @param bribeTokens_ Array of bribe token addresses.
     * @param bribeAmounts_ Array of bribe token amounts.
     * @param gaugeID_ Gauge ID to bribe for.
     */
    function provideBribes(
        address[] calldata bribeTokens_, 
        uint256[] calldata bribeAmounts_,
        uint256 gaugeID_
    ) external;

    /***************************************
    VOTER FUNCTIONS
    ***************************************/

    /**
     * @notice Vote for gaugeID with bribe.
     * @param voter_ address of voter.
     * @param gaugeID_ gaugeID to vote for
     * @param votePowerBPS_ Vote power BPS to assign to this vote.
     */
    function voteForBribe(address voter_, uint256 gaugeID_, uint256 votePowerBPS_) external;

    /**
     * @notice Vote for multiple gaugeIDs with bribes.
     * @param voter_ address of voter.
     * @param gaugeIDs_ Array of gaugeIDs to vote for
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteForMultipleBribes(address voter_, uint256[] calldata gaugeIDs_, uint256[] calldata votePowerBPSs_) external;

    /**
     * @notice Register a single voting configuration for multiple voters.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voters.
     * @param gaugeIDs_ Array of gauge IDs to vote for.
     * @param votePowerBPSs_ Array of corresponding vote power BPS values.
     */
    function voteForBribeForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_, uint256[] memory votePowerBPSs_) external;

    /**
     * @notice Remove vote for gaugeID with bribe.
     * @param voter_ address of voter.
     * @param gaugeID_ The ID of the gauge to remove vote for.
     */
    function removeVoteForBribe(address voter_, uint256 gaugeID_) external;

    /**
     * @notice Remove multiple votes for bribes.
     * @param voter_ address of voter.
     * @param gaugeIDs_ Array of gaugeIDs to remove votes for
     */
    function removeVotesForMultipleBribes(address voter_, uint256[] calldata gaugeIDs_) external;

    /**
     * @notice Remove gauge votes for multiple voters.
     * @notice Votes cannot be removed while voting is frozen.
     * Can only be called by the voter or vote delegate.
     * @param voters_ Array of voter addresses.
     * @param gaugeIDs_ Array of gauge IDs to remove votes for.
     */
    function removeVotesForBribeForMultipleVoters(address[] calldata voters_, uint256[] memory gaugeIDs_) external;

    /**
     * @notice Claim bribes.
     */
    function claimBribes() external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * @dev Requires 'uwe' and 'underwritingLocker' addresses to be set in the Registry.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
     */
    function setRegistry(address registry_) external;

    /**
     * @notice Adds token to whitelist of accepted bribe tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param bribeToken_ Address of bribe token.
     */
    function addBribeToken(address bribeToken_) external;

    /**
     * @notice Removes tokens from whitelist of accepted bribe tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param bribeToken_ Address of bribe token.
     */
    function removeBribeToken(address bribeToken_) external;

    /**
     * @notice Rescues misplaced and remaining bribes (from Solidity rounding down).
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens_ Array of tokens to rescue.
     * @param receiver_ The receiver of the tokens.
     */
    function rescueTokens(address[] memory tokens_, address receiver_) external;

    /***************************************
    UPDATER FUNCTION
    ***************************************/

    /**
     * @notice Processes bribes, and makes bribes claimable by eligible voters.
     * @dev Designed to be called in a while-loop with custom gas limit of 6M until `lastTimeBribesDistributed == epochStartTimestamp`.
     */
    function processBribes() external;
}