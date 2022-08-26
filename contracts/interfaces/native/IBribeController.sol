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

    /// @notice Thrown when provideBribe attempted unwhitelisted bribe token.
    error CannotBribeWithNonWhitelistedToken();

    /// @notice Thrown when voteForBribe() attempted by a non-owner or non-delegate.
    error NotOwnerNorDelegate();

    /// @notice Thrown when voteForBribe() attempted for gauge without bribe.
    error NoBribesForSelectedGauge();

    /// @notice Thrown when distributeBribes() is called by neither governance nor updater, or governance is locked.
    error NotUpdaterNorGovernance();

    /// @notice Thrown if distributeBribes() is called after bribes have already been successfully distributed in the current epoch.
    error BribesAlreadyDistributed();

    /// @notice Thrown when distributeBribes is attempted before the last epoch's votes have been successfully processed through gaugeController.updateGaugeWeights().
    error GaugeWeightsNotYetUpdated();

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when bribe is provided.
    event BribeProvided(address indexed briber, uint256 indexed gaugeID, address indexed bribeToken, uint256 bribeAmount);

    /// @notice Emitted when bribe is claimed.
    event BribeClaimed(address indexed briber, address indexed bribeToken, uint256 bribeAmount);

    /// @notice Emitted when registry set.
    event RegistrySet(address indexed registry);

    /// @notice Emitted when the Updater is set.
    event UpdaterSet(address indexed updater);

    /// @notice Emitted when bribe token added to whitelist.
    event BribeTokenAdded(address indexed bribeToken);

    /// @notice Emitted when bribe token removed from whitelist.
    event BribeTokenRemoved(address indexed bribeToken);

    /// @notice Emitted when distributeBribes() does an incomplete update, and will need to be run again until completion.
    event IncompleteBribeDistribution();

    /// @notice Emitted when bribes distributed for an epoch.
    event BribesDistributed(uint256 indexed epochEndTimestamp);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Registry address.
    function registry() external view returns (address);

    /// @notice Address of GaugeController.sol.
    function gaugeController() external view returns (address);

    /// @notice Address of UnderwritingLockVoting.sol
    function votingContract() external view returns (address);

    /// @notice Updater address.
    function updater() external view returns (address);

    /// @notice End timestamp for last epoch that bribes were distributed for all stored votes.
    function lastTimeBribesDistributed() external view returns (uint256);

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
     * @notice Get bribes which have been provided for the current epoch for a given gauge.
     * @param gaugeID_ GaugeID to query for.
     * @return bribes Array of provided bribes.
     */
    function getProvidedBribesForCurrentEpoch(uint256 gaugeID_) external view returns (Bribe[] memory bribes);

    /**
     * @notice Get bribes which have been provided for the next epoch for a given gauge.
     * @param gaugeID_ GaugeID to query for.
     * @return bribes Array of provided bribes.
     */
    function getProvidedBribesForNextEpoch(uint256 gaugeID_) external view returns (Bribe[] memory bribes);
    /**
     * @notice Get lifetime provided bribes for a given briber.
     * @param briber_ Briber to query for.
     * @return bribes Array of lifetime provided bribes.
     */
    function getLifetimeProvidedBribes(address briber_) external view returns (Bribe[] memory bribes);

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
    ) external;

    /***************************************
    VOTER FUNCTIONS
    ***************************************/

    /**
     * @notice Vote for gaugeID with bribe.
     * @param voter_ address of voter.
     * @param gaugeID_ gaugeID to vote for
     */
    function voteForBribe(address voter_, uint256 gaugeID_) external;
    /**
     * @notice Claim bribes.
     */
    function claimBribes() external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * @dev Requires 'uwe', 'revenueRouter' and 'underwritingLocker' addresses to be set in the Registry.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
     */
    function setRegistry(address registry_) external;

    /**
     * @notice Set updater address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param updater_ The address of the new updater.
     */
    function setUpdater(address updater_) external;

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
     * @notice Processes bribes, and makes bribes claimable by eligible voters.
     * @dev Designed to be called in a while-loop with custom gas limit of 6M until `lastTimeBribesDistributed == epochStartTimestamp`.
     * Can only be called by the current [**governor**](/docs/protocol/governance) or the updater role.
     */
    function processBribes() external;
}