// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Governable.sol";
import "./interface/IxsLocker.sol";
import "./interface/IStakingRewards.sol";


/**
 * @title
 * @author solace.fi
 * @notice
 */
contract StakingRewards is IStakingRewards, ReentrancyGuard, Governable {

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice **SOLACE** token.
    address public override solace;
    /// @notice **xsLocker**.
    address public override xsLocker;
    /// @notice Amount of SOLACE distributed per second.
    uint256 public override rewardPerSecond;
    /// @notice When the farm will start.
    uint256 public override startTime;
    /// @notice When the farm will end.
    uint256 public override endTime;
    /// @notice Last time rewards were distributed or farm was updated.
    uint256 public override lastRewardTime;
    /// @notice Accumulated rewards per share, times 1e12.
    uint256 public override accRewardPerShare;
    /// @notice Value of tokens staked by all farmers.
    uint256 public override valueStaked;

    /// @notice Information about each farmer.
    /// @dev user address => user info
    mapping(address => UserInfo) private _userInfo;

    uint256 public constant MAX_LOCK_DURATION = 4 * 365 days; // 4 years
    uint256 public constant MAX_LOCK_MULTIPLIER_BPS = 25000;  // 2.5X
    uint256 internal constant MAX_BPS = 10000;

    /**
     * @notice Constructs the StakingRewards contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).

     * @param startTime_ When farming will begin.
     * @param endTime_ When farming will end.
     */
    constructor(
        address governance_,
        address solace_,
        address xsLocker_,
        uint256 startTime_,
        uint256 endTime_,
        uint256 rewardPerSecond_
    ) Governable(governance_) {
        require(solace_ != address(0x0), "zero address solace");
        solace = solace_;
        require(xsLocker_ != address(0x0), "zero address xslocker");
        xsLocker = xsLocker_;
        require(startTime_ <= endTime_, "invalid window");
        startTime = startTime_;
        endTime = endTime_;
        rewardPerSecond = rewardPerSecond_;
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Information about each farmer.
    /// @dev user address => user info
    function userInfo(address user) external view override returns (UserInfo memory) {
        return _userInfo[user];
    }

    /**
     * @notice Calculates the accumulated balance of [**SOLACE**](./SOLACE) for specified user.
     * @param user The user for whom unclaimed tokens will be shown.
     * @return reward Total amount of withdrawable reward tokens.
     */
    function pendingRewards(address user) external view override returns (uint256 reward) {
        // get farmer information
        UserInfo storage userInfo_ = _userInfo[user];
        // math
        uint256 accRewardPerShare_ = accRewardPerShare;
        if (block.timestamp > lastRewardTime && valueStaked != 0) {
            uint256 tokenReward = getRewardAmountDistributed(lastRewardTime, block.timestamp);
            accRewardPerShare_ += tokenReward * 1e12 / valueStaked;
        }
        return userInfo_.value * accRewardPerShare_ / 1e12 - userInfo_.rewardDebt + userInfo_.unpaidRewards;
    }

    /**
     * @notice Calculates the reward amount distributed between two timestamps.
     * @param from The start of the period to measure rewards for.
     * @param to The end of the period to measure rewards for.
     * @return amount The reward amount distributed in the given period.
     */
    function getRewardAmountDistributed(uint256 from, uint256 to) public view override returns (uint256 amount) {
        // validate window
        from = Math.max(from, startTime);
        to = Math.min(to, endTime);
        // no reward for negative window
        if (from > to) return 0;
        return (to - from) * rewardPerSecond;
    }

    function calculateUserStake(address user) public view returns (uint256 stake) {
        IxsLocker locker = IxsLocker(xsLocker);
        uint256 numOfLocks = locker.balanceOf(user);
        stake = 0;
        for (uint256 i = 0; i < numOfLocks; i++) {
            uint256 xsLockID = locker.tokenOfOwnerByIndex(user, i);
            Lock memory lock = locker.locks(xsLockID);
            uint256 lockValue = (lock.end <= block.timestamp)
                ? lock.amount
                : lock.amount * (lock.end - block.timestamp) * MAX_LOCK_MULTIPLIER_BPS / (MAX_LOCK_DURATION * MAX_BPS);
        }
        return stake;
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Called when an action is performed on a lock.
     * @dev Called on transfer, mint, burn, and update.
     * Either the owner will change or the lock will change, not both.
     * @param xsLockID The ID of the lock that was altered.
     * @param oldOwner The old owner of the lock.
     * @param newOwner The new owner of the lock.
     * @param oldLock The old lock data.
     * @param newLock The new lock data.
     */
    function registerLockEvent(uint256 xsLockID, address oldOwner, address newOwner, Lock calldata oldLock, Lock calldata newLock) external override {
        require(msg.sender == xsLocker, "Only xs lock contract can call this.");
        // get farmer information
        _harvest(user);
        UserInfo storage userInfo_ = _userInfo[user];
        // accounting
        uint256 oldValue = userInfo_.value;
        uint256 newValue = calculateUserStake(user);
        userInfo_.value = newValue;
        userInfo_.rewardDebt = newValue * accRewardPerShare / 1e12;
        valueStaked = valueStaked - oldValue + newValue;
        emit UserUpdated(user);
    }

    // used to decay user stake
    function updateUsers(address[] calldata users) external nonReentrant {
        update();
        uint256 accRewardPerShare_ = accRewardPerShare;
        for(uint256 i = 0; i < users.length; i++) {
            // get farmer information
            address user = users[i];
            UserInfo memory userInfo_ = _userInfo[user];
            // accumulate unpaid rewards
            userInfo_.unpaidRewards += userInfo_.value * accRewardPerShare_ / 1e12 - userInfo_.rewardDebt;
            // accounting
            uint256 oldValue = userInfo_.value;
            uint256 newValue = calculateUserStake(user);
            userInfo_.value = newValue;
            userInfo_.rewardDebt = newValue * accRewardPerShare / 1e12;
            valueStaked = valueStaked - oldValue + newValue;
            emit UserUpdated(user);
        }
    }

    /**
     * @notice Updates staking information.
     */
    function update() public override {
        // dont update needlessly
        if (block.timestamp <= lastRewardTime) return;
        if (valueStaked == 0) {
            lastRewardTime = Math.min(block.timestamp, endTime);
            return;
        }
        // update math
        uint256 tokenReward = getRewardAmountDistributed(lastRewardTime, block.timestamp);
        accRewardPerShare += tokenReward * 1e12 / valueStaked;
        lastRewardTime = Math.min(block.timestamp, endTime);
        emit Updated();
    }

    /**
     * @notice Updates and sends a user's rewards.
     * @param user User to process rewards for.
     */
    function harvest(address user) external override nonReentrant {
        _harvest(user);
        emit UserUpdated(user);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Updates and sends a user's rewards.
     * @param user User to process rewards for.
     */
    function _harvest(address user) internal {
        // update farm
        update();
        // get farmer information
        UserInfo storage userInfo_ = _userInfo[user];
        // accumulate unpaid rewards
        uint256 unpaidRewards = userInfo_.value * accRewardPerShare / 1e12 - userInfo_.rewardDebt + userInfo_.unpaidRewards;
        uint256 balance = IERC20(solace).balanceOf(address(this));
        uint256 transferAmount = Math.min(unpaidRewards, balance);
        userInfo_.unpaidRewards = unpaidRewards - transferAmount;
        SafeERC20.safeTransfer(IERC20(solace), user, transferAmount);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the amount of [**SOLACE**](./SOLACE) to distribute per second.
     * Only affects future rewards.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param rewardPerSecond_ Amount to distribute per second.
     */
    function setRewards(uint256 rewardPerSecond_) external override onlyGovernance {
        rewardPerSecond = rewardPerSecond;
        emit RewardsSet(rewardPerSecond_);
    }

    /**
     * @notice Sets the farm's end time. Used to extend the duration.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param endTime_ The new end time.
     */
    function setEnd(uint256 endTime_) external override onlyGovernance {
        endTime = endTime_;
        emit FarmEndSet(endTime_);
    }

    /**
     * @notice Rescues tokens that may have been accidentally transferred in.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param token The token to rescue.
     * @param amount Amount of the token to rescue.
     * @param receiver Account that will receive the tokens.
     */
    function rescueTokens(address token, uint256 amount, address receiver) external override onlyGovernance {
        SafeERC20.safeTransfer(IERC20(token), receiver, amount);
    }
}
