// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title IFarmController
 * @author solace.fi
 * @notice Controls the allocation of rewards across multiple farms.
 */
interface IFarmController {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a farm is created.
    event FarmCreated(uint256 indexed farmID, address indexed farmAddress);
    /// @notice Emitted when SOLACE per second is changed.
    event RewardsSet(uint256 solacePerSecond);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Total solace distributed per second across all farms.
    function solacePerSecond() external view returns (uint256);

    /// @notice Total allocation points across all farms.
    function totalAllocPoints() external view returns (uint256);

    /// @notice The number of farms that have been created.
    function numFarms() external view returns (uint256);

    /// @notice Given a farm ID, return its address.
    /// @dev Indexable 1-numFarms, 0 is null farm.
    function farmAddresses(uint256 farmID) external view returns (address);

    /// @notice Given a farm address, returns its ID.
    /// @dev Returns 0 for not farms and unregistered farms.
    function farmIndices(address farmAddress) external view returns (uint256);

    /// @notice Given a farm ID, how many points the farm was allocated.
    function allocPoints(uint256 farmID) external view returns (uint256);

    /**
     * @notice Calculates the accumulated balance of [**SOLACE**](../SOLACE) for specified user.
     * @param user The user for whom unclaimed tokens will be shown.
     * @return reward Total amount of withdrawable SOLACE.
     */
    function pendingRewards(address user) external view returns (uint256 reward);

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Updates all farms to be up to date to the current second.
     */
    function massUpdateFarms() external;

    /**
     * @notice Withdraw your rewards from all farms and create an Option.
     * @return optionID The ID of the new Option.
     */
    function farmOptionMulti() external returns (uint256 optionID);

    /**
     * @notice Creates an Option for the given `rewardAmount`.
     * Must be called by a farm.
     * @param rewardAmount The amount to reward in the Option.
     * @return optionID The ID of the new Option.
     */
    function createOption(uint256 rewardAmount) external returns (uint256 optionID);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Registers a farm.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * Cannot register a farm more than once.
     * @param farmAddress The farm's address.
     * @param allocPoints How many points to allocate this farm.
     * @return farmID The farm ID.
     */
    function registerFarm(address farmAddress, uint256 allocPoints) external returns (uint256 farmID);

    /**
     * @notice Sets a farm's allocation points.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param farmID The farm to set allocation points.
     * @param allocPoints_ How many points to allocate this farm.
     */
    function setAllocPoints(uint256 farmID, uint256 allocPoints_) external;

    /**
     * @notice Sets the Solace reward distribution across all farms.
     * Optionally updates all farms.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param solacePerSecond_ Amount of solace to distribute per second.
     */
    function setSolacePerSecond(uint256 solacePerSecond_) external;
}
