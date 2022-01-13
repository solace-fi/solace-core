// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IxsListener.sol";


/**
 * @title Staking Rewards
 * @author solace.fi
 * @notice Rewards users for staking in [`xsLocker`](./../../staking/xsLocker).
 *
 * Deposits and withdrawls are made to [`xsLocker`](./../../staking/xsLocker) and rewards come from `StakingRewards`. All three are paid in [**SOLACE**](./../../SOLACE). `StakingRewards` will be registered as an [`xsListener`](./IxsListener). Any time a lock is updated [`registerLockEvent()`](#registerlockevent) will be called and the staking information of that lock will be updated.
 *
 * Over the course of `startTime` to `endTime`, the farm distributes `rewardPerSecond` [**SOLACE**](./../../SOLACE) to all lock holders split relative to the value of their locks. The base value of a lock is its `amount` of [**SOLACE**](./../../SOLACE). Its multiplier is 2.5x when `end` is 4 years from now, 1x when unlocked, and linearly decreasing between the two. The value of a lock is its base value times its multiplier.
 *
 * Note that transferring [**SOLACE**](./../../SOLACE) to this contract will not give you any rewards. You should deposit your [**SOLACE**](./../../SOLACE) into [`xsLocker`](./../../staking/xsLocker) via `createLock()`.
 *
 * @dev Lock information is stored in [`xsLocker`](./../../staking/xsLocker) and mirrored here for bookkeeping and efficiency. Should that information differ, [`xsLocker`](./../../staking/xsLocker) is the ground truth and this contract will attempt to sync with it.
 */
interface IStakingRewards is IxsListener {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when the global information is updated.
    event Updated();
    /// @notice Emitted when a locks information is updated.
    event LockUpdated(uint256 indexed xsLockID);
    /// @notice Emitted when the reward rate is set.
    event RewardsSet(uint256 rewardPerSecond);
    /// @notice Emitted when the farm end is set.
    event FarmEndSet(uint256 endTime);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice The maximum duration of a lock in seconds.
    function MAX_LOCK_DURATION() external view returns (uint256);
    /// @notice The vote power multiplier at max lock in bps.
    function MAX_LOCK_MULTIPLIER_BPS() external view returns (uint256);
    /// @notice The vote power multiplier when unlocked in bps.
    function UNLOCKED_MULTIPLIER_BPS() external view returns (uint256);
    /// @notice [**SOLACE**](./../../SOLACE) token.
    function solace() external view returns (address);
    /// @notice The [`xsLocker`](./../../staking/xsLocker) contract.
    function xsLocker() external view returns (address);
    /// @notice Amount of [**SOLACE**](./../../SOLACE) distributed per second.
    function rewardPerSecond() external view returns (uint256);
    /// @notice When the farm will start.
    function startTime() external view returns (uint256);
    /// @notice When the farm will end.
    function endTime() external view returns (uint256);
    /// @notice Last time rewards were distributed or farm was updated.
    function lastRewardTime() external view returns (uint256);
    /// @notice Accumulated rewards per share, times 1e12.
    function accRewardPerShare() external view returns (uint256);
    /// @notice Value of tokens staked by all farmers.
    function valueStaked() external view returns (uint256);

    // Info of each lock.
    struct StakedLockInfo {
        uint256 value;         // Value of user provided tokens.
        uint256 rewardDebt;    // Reward debt. See explanation below.
        uint256 unpaidRewards; // Rewards that have not been paid.
        address owner;         // Account that owns the lock.
        //
        // We do some fancy math here. Basically, any point in time, the amount of reward token
        // entitled to the owner of a lock but is pending to be distributed is:
        //
        //   pending reward = (lockInfo.value * accRewardPerShare) - lockInfo.rewardDebt + lockInfo.unpaidRewards
        //
        // Whenever a user updates a lock, here's what happens:
        //   1. The farm's `accRewardPerShare` and `lastRewardTime` gets updated.
        //   2. Users pending rewards accumulate in `unpaidRewards`.
        //   3. User's `value` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Information about each lock.
    /// @dev lock id => lock info
    function stakedLockInfo(uint256 xsLockID) external view returns (StakedLockInfo memory);

    /**
     * @notice Calculates the accumulated balance of [**SOLACE**](./../../SOLACE) for specified user.
     * @param user The user for whom unclaimed tokens will be shown.
     * @return reward Total amount of withdrawable reward tokens.
     */
    function pendingRewardsOfUser(address user) external view returns (uint256 reward);

    /**
     * @notice Calculates the accumulated balance of [**SOLACE**](./../../SOLACE) for specified lock.
     * @param xsLockID The ID of the lock to query rewards for.
     * @return reward Total amount of withdrawable reward tokens.
     */
    function pendingRewardsOfLock(uint256 xsLockID) external view returns (uint256 reward);

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
    function harvestUser(address user) external;

    /**
     * @notice Updates and sends a lock's rewards.
     * @param xsLockID The ID of the lock to process rewards for.
     */
    function harvestLock(uint256 xsLockID) external;

    /**
     * @notice Updates and sends multiple lock's rewards.
     * @param xsLockIDs The IDs of the locks to process rewards for.
     */
    function harvestLocks(uint256[] memory xsLockIDs) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the amount of [**SOLACE**](./../../SOLACE) to distribute per second.
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
