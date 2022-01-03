// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Governable.sol";
import "./interface/IxSOLACE.sol";


/**
 * @title xSolace Token (xSOLACE)
 * @author solace.fi
 * @notice V2 of the **SOLACE** staking contract.
 *
 * Users can stake **SOLACE** and receive
 */
contract xSOLACE is /*IxSOLACE,*/ /*ERC20Permit,*/ ReentrancyGuard, Governable {

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Locked(address indexed user, uint256 lockExpiry);
    event Updated();
    event Harvested(address indexed user);
    event Compounded(address indexed user);
    event RewardsSet(uint256 rewardPerSecond);
    event FarmEndSet(uint256 endTime);

    uint256 public constant MIN_LOCK_DURATION = 1 weeks;
    uint256 public constant MAX_LOCK_DURATION = 4 * 365 days;
    uint256 public constant MAX_LOCK_MULTIPLIER_BPS = 10000;
    uint256 public constant MAX_BPS = 10000;

    uint256 public epochDuration;               // the length of one epoch
    uint256 public maxLockDuration;             // the max amount of time users can lock
    uint256 public unlockedEpochCompoundRate;   // the rate that the users value increases per epoch
    uint256 public maxLockEpochCompoundRate;    // the rate that the users value increases per epoch
    uint256 internal constant PRECISION = 1e36; // rates are stored and calculated with 36 decimals of precision

    address public solace;
    /// @notice When the farm will start.
    uint256 public startTime;
    /// @notice When the farm will end.
    uint256 public endTime;
    /// @notice Value of tokens staked by all farmers.
    uint256 public valueStaked;

    // Info of each user.
    struct UserInfo {
        uint256 value;             // Value of user provided tokens.
        uint256 epochCompoundRate; // the rate that the users value increases per epoch
        uint256 lockExpiry;        // The timestamp that a user's lock expires.
        uint256 lastUpdate;        // The timestamp the users stake was last updated.
    }

    /// @notice Information about each farmer.
    /// @dev user address => user info
    mapping(address => UserInfo) public userInfo;

    /**
     * @notice Constructs the xSOLACE Token contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param solace_ Address of the **SOLACE** contract.
     */
    constructor(address governance_, address solace_, uint256 startTime_, uint256 endTime_, uint256 epochDuration_, uint256 maxLockDuration_, uint256 unlockedEpochCompoundRate_, uint256 maxLockEpochCompoundRate_) Governable(governance_) {
        require(solace_ != address(0x0), "zero address solace");
        solace = solace_;
        require(startTime_ <= endTime_, "invalid window");
        startTime = startTime_;
        endTime = endTime_;
        lastRewardTime = Math.max(block.timestamp, startTime_);
        require(epochDuration_ > 0);
        require(maxLockDuration_ > 0);
        require(unlockedEpochCompoundRate_ > 0);
        require(maxLockEpochCompoundRate_ > 0);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the total amount of **SOLACE** owed to a user (deposit + rewards).
     * @param user User to query.
     * @return amount Amount of **SOLACE** owed.
     */
    function solaceBalance(address user) external view returns (uint256 amount) {
        // get farmer information
        UserInfo storage userInfo_ = userInfo[user];
        // short circuit
        if(block.timestamp <= startTime || block.timestamp <= userInfo_.lastUpdate || endTime <= userInfo_.lastUpdate) return userInfo_.value;
        // locked
        uint256 nextTime = userInfo_.lastUpdate;
        uint256 newValue = userInfo_.value;
        if(userInfo_.lockExpiry > userInfo_.lastUpdate) {
            nextTime = Math.min(userInfo_.lockExpiry, Math.min(block.timestamp, endTime));
            newValue = compound(newValue, userInfo_.epochCompoundRate, nextTime-userInfo_.lastUpdate); // p, r, t
        }
        // unlocked
        if(nextTime < block.timestamp) {
            uint256 nextTime2 = Math.min(block.timestamp, endTime);
            newValue = compound(newValue, unlockedEpochCompoundRate, nextTime2-nextTime);
        }
        return newValue;
    }

    /**
     * @notice Returns the amount of vote tokens owned by `user`.
     * @param user User balance to query.
     * @return amount The amount of **xSOLACE** owned by `user`.
     */
    function balanceOf(address user) external view returns (uint256 amount) {
        // get farmer information
        UserInfo storage userInfo_ = userInfo[user];
        // fetch time vars
        uint256 timestamp = block.timestamp;
        uint256 lockExpiry = userInfo_.lockExpiry;
        // 0 if unlocked
        if(lockExpiry <= timestamp) return 0;
        // multiplier increases with amount of weeks left in lock
        uint256 timeLeft = lockExpiry - timestamp;
        return (amount * timeLeft * MAX_LOCK_MULTIPLIER_BPS) / (MAX_LOCK_DURATION * MAX_BPS);
    }

    /**
     * @notice Returns the multiplier a user receives in their vote power from locking.
     * @param user User multiplier to query.
     * @return multiplier_ The multiplier with 18 decimals.
     */
    function multiplier(address user) external view returns (uint256 multiplier_) {
        // get farmer information
        UserInfo storage userInfo_ = userInfo[user];
        // fetch time vars
        uint256 timestamp = block.timestamp;
        uint256 lockExpiry = userInfo_.lockExpiry;
        // 0 if unlocked
        if(lockExpiry <= timestamp) return 0;
        // multiplier increases with amount of weeks left in lock
        uint256 timeLeft = lockExpiry - timestamp;
        return (1e18 * timeLeft * MAX_LOCK_MULTIPLIER_BPS) / (MAX_LOCK_DURATION * MAX_BPS);
    }

    /**
     * @notice Returns true if the user's deposit is locked.
     * @param user User to query.
     * @return locked True if the user's deposit is locked.
     */
    function isLocked(address user) external view returns (bool locked) {
        uint256 lockExpiry = userInfo[user].lockExpiry;
        uint256 timestamp = block.timestamp;
        return (lockExpiry > timestamp);
    }

    /**
     * @notice Returns the amount of time left in the user's lock.
     * @param user User to query.
     * @return timeLeft The amount of time left in seconds, 0 if unlocked.
     */
    function lockTimeLeft(address user) external view returns (uint256 timeLeft) {
        uint256 lockExpiry = userInfo[user].lockExpiry;
        uint256 timestamp = block.timestamp;
        return (lockExpiry > timestamp)
            ? (timestamp - lockExpiry) // locked
            : 0; // unlocked
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Allows a user to deposit **SOLACE**.
     * @param amount The amount of **SOLACE** to deposit.
     */
    function deposit(uint256 amount) external {
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(solace), msg.sender, address(this), amount);
        // accounting
        _compound(msg.sender);
        _deposit(msg.sender, amount);
    }

    /**
     * @notice Allows a user to deposit **SOLACE**.
     * @param receiver The user that deposit will be credited towards.
     * @param amount The amount of **SOLACE** to deposit.
     */
    function depositFor(address receiver, uint256 amount) external {
        // TODO: add lock duration as parameter?
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(solace), msg.sender, address(this), amount);
        // accounting
        _compound(receiver);
        _deposit(receiver, amount);
    }

    /**
     * @notice Allows a user to deposit and lock **SOLACE**.
     * @param amount The amount of **SOLACE** to deposit.
     * @param duration The amount of time to lock in seconds.
     */
    function depositAndLock(uint256 amount, uint256 duration) external {
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(solace), msg.sender, address(this), amount);
        // accounting
        _compound(msg.sender);
        _deposit(msg.sender, amount);
        // lock
        _lock(msg.sender, duration);
    }

    /**
     * @notice Allows a user to deposit **SOLACE**.
     * @param depositor The depositing user.
     * @param amount The amount of **SOLACE** to deposit.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function depositSigned(address depositor, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        // permit
        IERC20Permit(solace).permit(depositor, address(this), amount, deadline, v, r, s);
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(solace), depositor, address(this), amount);
        // accounting
        _compound(depositor);
        _deposit(depositor, amount);
    }

    /**
     * @notice Allows a user to deposit and lock **SOLACE**.
     * @param amount The amount of **SOLACE** to deposit.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     * @param duration The amount of time to lock in seconds.
     */
    function depositAndLockSigned(address depositor, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s, uint256 duration /*uint8 v2, bytes32 r2, bytes32 s2*/) external {
        // permit
        IERC20Permit(solace).permit(depositor, address(this), amount, deadline, v, r, s);
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(solace), depositor, address(this), amount);
        // accounting
        _compound(depositor);
        _deposit(depositor, amount);
        // lock. check signature?
        _lock(depositor, duration);
    }

    /**
     * @notice Withdraws all of `msg.sender`s **SOLACE**.
     * Reverts if locked.
     */
    function withdraw() external {
        _compound(msg.sender);
        _withdraw(userInfo[msg.sender].value);
    }

    /**
     * @notice Withdraws some of `msg.sender`s **SOLACE**.
     * Reverts if locked.
     * @param amount The amount of **SOLACE** to withdraw.
     */
    function withdraw(uint256 amount) external {
        _compound(msg.sender);
        _withdraw(amount);
    }

    /**
     * @notice Lock your deposit to receive **xSOLACE** the vote token.
     * @param duration The amount of time to lock in seconds.
     */
    function lock(uint256 duration) external {
        _compound(msg.sender);
        _lock(msg.sender, duration);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Allows a user to deposit **SOLACE**.
     * @param receiver The user that deposit will be credited towards.
     * @param amount The amount of **SOLACE** to deposit.
     */
    function _deposit(address receiver, uint256 amount) internal {
        // get farmer information
        UserInfo storage userInfo_ = userInfo[receiver];
        // accounting
        valueStaked += amount;
        userInfo_.value += amount;
        emit Deposited(receiver, amount);
    }

    /**
     * @notice Withdraws some of `msg.sender`s **SOLACE**.
     * Reverts if locked.
     * @param amount The amount of **SOLACE** to withdraw.
     */
    function _withdraw(uint256 amount) internal {
        // get farmer information
        UserInfo storage userInfo_ = userInfo[msg.sender];
        // fetch vars
        uint256 timestamp = block.timestamp;
        uint256 lockExpiry = userInfo_.lockExpiry;
        // verify unlock
        require(lockExpiry <= timestamp, "xSOLACE: locked");
        // update deposit amount
        userInfo_.value -= amount; // safemath
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Lock your deposit to receive **xSOLACE** the vote token.
     * @param user The user to lock.
     * @param duration The amount of time to lock in seconds.
     */
    function _lock(address user, uint256 duration) internal {
        require(duration >= MIN_LOCK_DURATION, "xSOLACE: under min lock duration");
        require(duration <= MAX_LOCK_DURATION, "xSOLACE: over max lock duration");
        uint256 timestamp = block.timestamp;
        uint256 newLockExpiry = timestamp + duration;
        // existing lock
        UserInfo storage userInfo_ = userInfo[user];
        uint256 lockExpiry = userInfo_.lockExpiry; // existing lock
        require(newLockExpiry >= lockExpiry, "xSOLACE: existing lock exceeds new lock");
        // new lock
        userInfo_.lockExpiry = newLockExpiry;
        emit Locked(user, newLockExpiry);
    }

    /**
     * @notice Update farm and compound a user's rewards.
     * @param user User to process rewards for.
     */
    function _compound(address user) internal {
        // get farmer information
        UserInfo storage userInfo_ = userInfo[user];
        // short circuit
        if(block.timestamp <= startTime || block.timestamp <= userInfo_.lastUpdate || endTime <= userInfo_.lastUpdate) return;
        // locked
        uint256 nextTime = userInfo_.lastUpdate;
        uint256 newValue = userInfo_.value;
        if(userInfo_.lockExpiry > userInfo_.lastUpdate) {
            nextTime = Math.min(userInfo_.lockExpiry, Math.min(block.timestamp, endTime));
            newValue = compound(newValue, userInfo_.epochCompoundRate, nextTime-userInfo_.lastUpdate); // p, r, t
        }
        // unlocked
        if(nextTime < block.timestamp) {
            uint256 nextTime2 = Math.min(block.timestamp, endTime);
            newValue = compound(newValue, unlockedEpochCompoundRate, nextTime2-nextTime);
        }
        return newValue;
        // TODO: new math, write to userinfo
        emit Compounded(user);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the amount of [**SOLACE**](./SOLACE) to distribute per second.
     * Only affects future rewards.
     * Can only be called by [`FarmController`](./FarmController).
     * @param rewardPerSecond_ Amount to distribute per second.
     */
    function setRewards(uint256 rewardPerSecond_) external onlyGovernance {
        // TODO: new variables
        // accounting
        rewardPerSecond = rewardPerSecond_;
        emit RewardsSet(rewardPerSecond_);
    }

    /**
     * @notice Sets the farm's end time. Used to extend the duration.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param endTime_ The new end time.
     */
    function setEnd(uint256 endTime_) external onlyGovernance {
        // accounting
        endTime = endTime_;
        // update
        emit FarmEndSet(endTime_);
    }
}
