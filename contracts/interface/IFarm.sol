// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IFarmController.sol";


/**
 * @title IFarm
 * @author solace.fi
 * @notice Rewards investors in [**SOLACE**](../SOLACE).
 */
interface IFarm {

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice [`IFarmController`](../FarmController) contract.
    function farmController() external view returns (address);

    /// @notice A unique enumerator that identifies the farm type.
    function farmType() external view returns (uint256);

    /// @notice Amount of [**SOLACE**](../SOLACE) distributed per second.
    function rewardPerSecond() external view returns (uint256);

    /// @notice When the farm will start.
    function startTime() external view returns (uint256);

    /// @notice When the farm will end.
    function endTime() external view returns (uint256);

    /**
     * @notice Calculates the accumulated balance of [**SOLACE**](../SOLACE) for specified user.
     * @param user The user for whom unclaimed tokens will be shown.
     * @return reward Total amount of withdrawable SOLACE.
     */
    function pendingRewards(address user) external view returns (uint256 reward);

    /**
     * @notice Calculates the reward multiplier over the given `from` until `to` timestamps.
     * @param from The start of the period to measure rewards for.
     * @param to The end of the period to measure rewards for.
     * @return multiplier The weighted multiplier for the given period.
     */
    function getMultiplier(uint256 from, uint256 to) external view returns (uint256 multiplier);

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Withdraw your rewards without unstaking your tokens.
     */
    function withdrawRewards() external;

    /**
     * @notice Withdraw a users rewards without unstaking their tokens.
     * Can only be called by [`FarmController`](./FarmController).
     * @param user User to withdraw rewards for.
     * @return rewardAmount The amount of rewards the user earned on this farm.
     */
    function withdrawRewardsForUser(address user) external returns (uint256 rewardAmount);

    /**
     * @notice Updates farm information to be up to date to the current time.
     */
    function updateFarm() external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the amount of [**SOLACE**](../SOLACE) to distribute per second.
     * Only affects future rewards.
     * Can only be called by [`Master`](../Master).
     * @param rewardPerSecond_ Amount to distribute per second.
     */
    function setRewards(uint256 rewardPerSecond_) external;

    /**
     * @notice Sets the farm's end time. Used to extend the duration.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param endTime_ The new end time.
     */
    function setEnd(uint256 endTime_) external;
}
