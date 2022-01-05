// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IxsListener.sol";


/**
 * @title
 * @author solace.fi
 * @notice
 */
interface IStakingRewards is IxsListener {

    /// @notice Emitted when the global information is updated.
    event Updated();
    /// @notice Emitted when a users information is updated.
    event UserUpdated(address indexed user);
    /// @notice Emitted when the reward rate is set.
    event RewardsSet(uint256 rewardPerSecond);
    /// @notice Emitted when the farm end is set.
    event FarmEndSet(uint256 endTime);

    /// @notice **SOLACE** token.
    function solace() external returns (address);
    /// @notice **xSOLACE** token.
    function xsolace() external returns (address);
    /// @notice Amount of SOLACE distributed per second.
    function rewardPerSecond() external returns (uint256);
    /// @notice When the farm will start.
    function startTime() external returns (uint256);
    /// @notice When the farm will end.
    function endTime() external returns (uint256);
    /// @notice Last time rewards were distributed or farm was updated.
    function lastRewardTime() external returns (uint256);
    /// @notice Accumulated rewards per share, times 1e12.
    function accRewardPerShare() external returns (uint256);
    /// @notice Value of tokens staked by all farmers.
    function valueStaked() external returns (uint256);

    // Info of each user.
    struct UserInfo {
        uint256 value;         // Value of user provided tokens.
        uint256 rewardDebt;    // Reward debt. See explanation below.
        uint256 unpaidRewards; // Rewards that have not been paid.
        //
        // We do some fancy math here. Basically, any point in time, the amount of reward token
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.value * accRewardPerShare) - user.rewardDebt + user.unpaidRewards
        //
        // Whenever a user deposits or withdraws CP tokens to a farm. Here's what happens:
        //   1. The farm's `accRewardPerShare` and `lastRewardTime` gets updated.
        //   2. Users pending rewards accumulate in `unpaidRewards`.
        //   3. User's `value` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    /// @notice Information about each farmer.
    /// @dev user address => user info
    //function userInfo(address user) external view returns (UserInfo memory);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Calculates the accumulated balance of [**SOLACE**](./SOLACE) for specified user.
     * @param user The user for whom unclaimed tokens will be shown.
     * @return reward Total amount of withdrawable reward tokens.
     */
    function pendingRewards(address user) external view returns (uint256 reward);

    /**
     * @notice Calculates the reward amount distributed between two timestamps.
     * @param from The start of the period to measure rewards for.
     * @param to The end of the period to measure rewards for.
     * @return amount The reward amount distributed in the given period.
     */
    function getRewardAmountDistributed(uint256 from, uint256 to) external view returns (uint256 amount);

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Updates staking information.
     */
    function update() external;

    /**
     * @notice Updates and sends a user's rewards.
     * @param user User to process rewards for.
     */
    function harvest(address user) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the amount of [**SOLACE**](./SOLACE) to distribute per second.
     * Only affects future rewards.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param rewardPerSecond_ Amount to distribute per second.
     */
    function setRewards(uint256 rewardPerSecond_) external;

    /**
     * @notice Sets the farm's end time. Used to extend the duration.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param endTime_ The new end time.
     */
    function setEnd(uint256 endTime_) external;

    /**
     * @notice Rescues tokens that may have been accidentally transferred in.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param token The token to rescue.
     * @param amount Amount of the token to rescue.
     * @param receiver Account that will receive the tokens.
     */
    function rescueTokens(address token, uint256 amount, address receiver) external;
}
