// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./../SOLACE.sol";


/**
 * @title IMaster: Distributor of solace.fi
 * @author solace.fi
 * @notice The interface for the SOLACE token distributor.
 */
interface IMaster {

    /// @notice Governor.
    function governance() external view returns (address);

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
    event FarmCreated(uint256 indexed _farmId, address indexed _farmAddress);

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external;

    /**
     * @notice Registers a farm.
     * Can only be called by the current governor.
     * Cannot register a farm more than once.
     * @param _farmAddress The farm's address.
     * @param _allocPoints How many points to allocate this farm.
     * @return farmId The farm id.
     */
    function registerFarm(address _farmAddress, uint256 _allocPoints) external returns (uint256 farmId);

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
}