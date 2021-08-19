// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../SOLACE.sol";


/**
 * @title IFarm
 * @author solace.fi
 * @notice The base type of Master farms.
 */
interface IFarm {

    /// @notice Master contract.
    function master() external view returns (address);

    /// @notice Native SOLACE Token.
    function solace() external view returns (SOLACE);

    /// @notice A unique enumerator that identifies the farm type.
    function farmType() external view returns (uint256);

    /// @notice Amount of rewardToken distributed per block.
    function blockReward() external view returns (uint256);

    /// @notice When the farm will start.
    function startBlock() external view returns (uint256);

    /// @notice When the farm will end.
    function endBlock() external view returns (uint256);

    /**
     * @notice Sets the amount of reward token to distribute per block.
     * Can only be called by Master.
     * @param _blockReward Amount to distribute per block.
     */
    function setRewards(uint256 _blockReward) external;

    /**
     * @notice Sets the farm's end block. Used to extend the duration.
     * Can only be called by the current governor.
     * @param _endBlock The new end block.
     */
    function setEnd(uint256 _endBlock) external;

    /**
     * @notice Withdraw your rewards without unstaking your tokens.
     */
    function withdrawRewards() external;

    /**
     * @notice Withdraw a users rewards without unstaking their tokens.
     * Can only be called by Master.
     */
    function withdrawRewardsForUser(address _user) external;

    /**
     * @notice Calculates the accumulated balance of reward token for specified user.
     * @param _user The user for whom unclaimed tokens will be shown.
     * @return Total amount of withdrawable reward tokens.
     */
    function pendingRewards(address _user) external view returns (uint256);

    /**
     * @notice Updates farm information to be up to date to the current block.
     */
    function updateFarm() external;

    /**
     * @notice Calculates the reward multiplier over the given _from until _to block.
     * @param _from The start of the period to measure rewards for.
     * @param _to The end of the period to measure rewards for.
     * @return The weighted multiplier for the given period.
     */
    function getMultiplier(uint256 _from, uint256 _to) external view returns (uint256);
}
