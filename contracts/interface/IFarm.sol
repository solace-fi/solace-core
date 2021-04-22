// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;


/**
 * @title IFarm: The base type of Master farms.
 * @author solace.fi
 */
interface IFarm {

    /// @notice Governor.
    function governance() external view returns (address);

    /// @notice Master contract.
    function master() external view returns (address);

    /// @notice A unique enumerator that identifies the farm type.
    function farmType() external view returns (uint256);

    function stakeToken() external view returns (address);        // Address of token to stake.
    function rewardToken() external view returns (address);       // Address of token to receive.
    function blockReward() external view returns (uint256);       // Amount of rewardToken distributed per block.
    function startBlock() external view returns (uint256);        // When the farm will start.
    function endBlock() external view returns (uint256);          // When the farm will end.
    function lastRewardBlock() external view returns (uint256);   // Last time rewards were distributed or farm was updated.
    function accRewardPerShare() external view returns (uint256); // Accumulated rewards per share, times 1e12.
    function valueStaked() external view returns (uint256);       // Value of tokens staked by all farmers.

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external;

    /**
     * Sets the amount of reward token to distribute per block.
     * @param _blockReward Amount to distribute per block.
     */
    function setRewards(uint256 _blockReward) external;

    /**
     * Sets the farm's end block. Used to extend the duration.
     * @param _endBlock The new end block.
     */
    function setEnd(uint256 _endBlock) external;

    /**
     * Withdraw your rewards without unstaking your tokens.
     */
    function withdrawRewards() external;

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
