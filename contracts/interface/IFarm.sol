// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../SOLACE.sol";


/**
 * @title IFarm
 * @author solace.fi
 * @notice Rewards investors in [`SOLACE`](../SOLACE).
 */
interface IFarm {

    /// @notice [`Master`](../Master) contract.
    function master() external view returns (address);

    /// @notice Native [`SOLACE`](../SOLACE) Token.
    function solace() external view returns (SOLACE);

    /// @notice A unique enumerator that identifies the farm type.
    function farmType() external view returns (uint256);

    /// @notice Amount of [`SOLACE`](../SOLACE) distributed per block.
    function blockReward() external view returns (uint256);

    /// @notice When the farm will start.
    function startBlock() external view returns (uint256);

    /// @notice When the farm will end.
    function endBlock() external view returns (uint256);

    /**
     * @notice Sets the amount of [`SOLACE`](../SOLACE) to distribute per block.
     * Only affects future rewards.
     * Can only be called by [`Master`](../Master).
     * @param newBlockReward Amount to distribute per block.
     */
    function setRewards(uint256 newBlockReward) external;

    /**
     * @notice Sets the farm's end block. Used to extend the duration.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param newEndBlock The new end block.
     */
    function setEnd(uint256 newEndBlock) external;

    /**
     * @notice Withdraw your rewards without unstaking your tokens.
     */
    function withdrawRewards() external;

    /**
     * @notice Withdraw a users rewards without unstaking their tokens.
     * Can only be called by ['Master`](../Master) or the user.
     * @param user User to withdraw rewards for.
     */
    function withdrawRewardsForUser(address user) external;

    /**
     * @notice Calculates the accumulated balance of [`SOLACE`](../SOLACE) for specified user.
     * @param user The user for whom unclaimed tokens will be shown.
     * @return reward Total amount of withdrawable SOLACE.
     */
    function pendingRewards(address user) external view returns (uint256 reward);

    /**
     * @notice Updates farm information to be up to date to the current block.
     */
    function updateFarm() external;

    /**
     * @notice Calculates the reward multiplier over the given `from` until `to` block.
     * @param from The start of the period to measure rewards for.
     * @param to The end of the period to measure rewards for.
     * @return multiplier The weighted multiplier for the given period.
     */
    function getMultiplier(uint256 from, uint256 to) external view returns (uint256 multiplier);
}
