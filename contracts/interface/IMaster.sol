// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./../SOLACE.sol";


/**
 * @title Master
 * @author solace.fi
 * @notice The distributor of [**SOLACE** token](../SOLACE).
 */
interface IMaster {

    /// @notice Native SOLACE Token.
    function solace() external view returns (SOLACE);

    /// @notice Total solace distributed per block across all farms.
    function solacePerBlock() external view returns (uint256);

    /// @notice Total allocation points across all farms.
    function totalAllocPoints() external view returns (uint256);

    /// @notice The number of farms that have been created.
    function numFarms() external view returns (uint256);

    /// @notice Given a farm id, return its address.
    /// @dev Indexable 1-numFarms, 0 is null farm.
    function farmAddresses(uint256) external view returns (address);

    /// @notice Given a farm address, returns its id.
    /// @dev Returns 0 for not farms and unregistered farms.
    function farmIndices(address) external view returns (uint256);

    /// @notice Given a farm id, how many points the farm was allocated.
    function allocPoints(uint256) external view returns (uint256);

    // events
    /// @notice Emitted when a farm is created.
    event FarmCreated(uint256 indexed _farmId, address indexed _farmAddress);
    /// @notice Emitted when SOLACE per block is changed.
    event RewardsSet(uint256 _solacePerBlock);

    /**
     * @notice Registers a farm.
     * Can only be called by the current governor.
     * Cannot register a farm more than once.
     * @param _farmAddress The farm's address.
     * @param _allocPoints How many points to allocate this farm.
     * @return _farmId The farm id.
     */
    function registerFarm(address _farmAddress, uint256 _allocPoints) external returns (uint256 _farmId);

    /**
     * @notice Sets a farm's allocation points.
     * Can only be called by the current governor.
     * @param _farmId The farm to set allocation points.
     * @param _allocPoints How many points to allocate this farm.
     */
    function setAllocPoints(uint256 _farmId, uint256 _allocPoints) external;

    /**
     * @notice Sets the Solace reward distribution across all farms.
     * Optionally updates all farms.
     * @param _solacePerBlock Amount of solace to distribute per block.
     */
    function setSolacePerBlock(uint256 _solacePerBlock) external;

    /**
     * @notice Updates all farms to be up to date to the current block.
     */
    function massUpdateFarms() external;

    /**
     * @notice Withdraw your rewards from all farms.
     */
    function withdrawRewards() external;
}
