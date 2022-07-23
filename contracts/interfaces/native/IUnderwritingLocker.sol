// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "./../utils/IERC721Enhanced.sol";

struct Lock {
    uint256 amount;
    uint256 end;
}

/**
 * @title IUnderwritingLocker
 * @author solace.fi
 * @notice Having an underwriting lock is a requirement to vote on Solace Native insurance gauges.
 * To create an underwriting lock, $UWE must be locked for a minimum of 6 months.
 * 
 * Locks are ERC721s and can be viewed with [`locks()`](#locks). 
 * Each lock has an `amount` of locked $UWE, and an `end` timestamp.
 * Locks have a maximum duration of four years.
 *
 * Locked $UWE can be withdrawn without penalty via [`withdraw()`](#withdraw) only after the `end` timestamp
 * Locked $UWE withdrawn before the `end` timestamp via [`emergencyWithdraw()`](#emergencyWithdraw) will incur 
 * a withdrawal penalty, which increases with remaining lock time.
 *
 * Users can create locks via [`createLock()`](#createlock) or [`createLockSigned()`](#createlocksigned)
 * Users can deposit more $UWE into a lock via [`increaseAmount()`](#increaseamount), [`increaseAmountSigned()`] (#increaseamountsigned) or [`increaseAmountMultiple()`](#increaseamountmultiple)
 * Users can extend a lock via [`extendLock()`](#extendlock) or [`extendLockMultiply()`](#extendlockmultiple)
 * Users can withdraw from a lock via [`withdraw()`](#withdraw), [`withdrawInPart()`](#withdrawinpart), or [`withdrawMultiple()`](#withdrawmultiple).
 * Users can emergency withdraw from a lock via [`emergencyWithdraw()`](#emergencywithdraw), [`emergencyWithdrawInPart()`](#emergencywithdrawinpart), or [`emergencyWithdrawMultiple()`](#emergencywithdrawmultiple).
 *
 * Users and contracts may deposit into a lock that they do not own.
 *
 * Any time a lock is minted, burned or otherwise modified it will notify the listener contracts (eg UnderwriterLockVoting.sol).
 *
 */
interface IUnderwritingLocker is IERC721Enhanced {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a lock is created.
    event LockCreated(uint256 indexed lockID);

    /// @notice Emitted when a new deposit is made into an existing lock.
    event LockIncreased(uint256 indexed lockID, uint256 newTotalAmount, uint256 depositAmount);

    /// @notice Emitted when a new deposit is made into an existing lock.
    event LockExtended(uint256 indexed lockID, uint256 newEndTimestamp);

    /// @notice Emitted when a lock is updated.
    event LockUpdated(uint256 indexed lockID, uint256 amount, uint256 end);

    /// @notice Emitted when a lock is withdrawn from.
    event Withdrawal(uint256 indexed lockID, uint256 amount);

    /// @notice Emitted when an emergency withdraw is made from a lock.
    event EmergencyWithdrawal(uint256 indexed lockID, uint256 totalWithdrawAmount, uint256 penaltyAmount);

    /// @notice Emitted when a listener is added.
    event LockListenerAdded(address indexed listener);

    /// @notice Emitted when a listener is removed.
    event LockListenerRemoved(address indexed listener);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Token locked in the underwriting lock.
    function token() external view returns (address);

    /// @notice Revenue router address (Emergency withdraw penalties will be transferred here).
    function revenueRouter() external view returns (address);

    /// @notice The minimum lock duration that a new lock must be created with.
    function MIN_LOCK_DURATION() external view returns (uint256);

    /// @notice The maximum time into the future that a lock can expire.
    function MAX_LOCK_DURATION() external view returns (uint256);

    /// @notice The total number of locks that have been created.
    function totalNumLocks() external view returns (uint256);

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get `amount` and `end` values for a lockID.
     * @param lockID The ID of the lock to query.
     * @return lock_ Lock {uint256 amount, uint256 end}
     */
    function locks(uint256 lockID) external view returns (Lock memory lock_);


    /**
     * @notice Determines if the lock is currently locked.
     * @param lockID The ID of the lock to query.
     * @return locked True if the lock is locked, false if unlocked.
     */
    function isLocked(uint256 lockID) external view returns (bool locked);

    /**
     * @notice Determines the time left until the lock unlocks.
     * @param lockID The ID of the lock to query.
     * @return time The time left in seconds, 0 if unlocked.
     */
    function timeLeft(uint256 lockID) external view returns (uint256 time);

    /**
     * @notice Returns the total token amount that the user has staked in underwriting locks.
     * @param account The account to query.
     * @return balance The user's total staked token amount.
     */
    function totalStakedBalance(address account) external view returns (uint256 balance);

    /**
     * @notice The list of contracts that are listening to lock updates.
     * @return listeners_ The list as an array.
     */
    function getLockListeners() external view returns (address[] memory listeners_);

    /**
     * @notice Computes current penalty (as a % of emergency withdrawn amount) for emergency withdrawing from a specified lock.
     * @dev penaltyPercentage == 1e18 means 100% penalty percentage. Similarly 1e17 => 10% penalty percentage.
     * @param lockID The ID of the lock to compute emergency withdraw penalty.
     * @return penaltyAmount Token amount that will be paid to RevenueRouter.sol as a penalty for emergency withdrawing.
     */
    function getEmergencyWithdrawPenaltyPercentage(uint256 lockID) external view returns (uint256 penaltyAmount);

    /***************************************
    EXTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Deposit token to create a new lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @param recipient The account that will receive the lock.
     * @param amount The amount of token to deposit.
     * @param end The timestamp the lock will unlock.
     * @return lockID The ID of the newly created lock.
     */
    function createLock(address recipient, uint256 amount, uint256 end) external returns (uint256 lockID);

    /**
     * @notice Deposit token to create a new lock.
     * @dev Token is transferred from msg.sender using ERC20Permit.
     * @dev recipient = msg.sender
     * @param amount The amount of token to deposit.
     * @param end The timestamp the lock will unlock.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     * @return lockID The ID of the newly created lock.
     */
    function createLockSigned(uint256 amount, uint256 end, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external returns (uint256 lockID);

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID The ID of the lock to update.
     * @param amount The amount of token to deposit.
     */
    function increaseAmount(uint256 lockID, uint256 amount) external;

    /**
     * @notice Deposit token to increase the value of multiple existing locks.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev If a lockID does not exist, the corresponding amount will be refunded to msg.sender.
     * @dev Anyone (not just the lock owner) can call increaseAmountMultiple() and deposit to existing locks.
     * @param lockIDs Array of lock IDs to update.
     * @param amounts Array of token amounts to deposit.
     */
    function increaseAmountMultiple(uint256[] calldata lockIDs, uint256[] calldata amounts) external;

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender using ERC20Permit.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID The ID of the lock to update.
     * @param amount The amount of token to deposit.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function increaseAmountSigned(uint256 lockID, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;

    /**
     * @notice Extend a lock's duration.
     * @dev Can only be called by the lock owner or approved.
     * @param lockID The ID of the lock to update.
     * @param end The new time for the lock to unlock.
     */
    function extendLock(uint256 lockID, uint256 end) external;

    /**
     * @notice Extend multiple locks' duration.
     * @dev Can only be called by the lock owner or approved.
     * @dev If non-existing lockIDs are entered, these will be skipped.
     * @param lockIDs Array of lock IDs to update.
     * @param ends Array of new unlock times.
     */
    function extendLockMultiple(uint256[] calldata lockIDs, uint256[] calldata ends) external;

    /**
     * @notice Withdraw from a lock in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockID The ID of the lock to withdraw from.
     * @param recipient The user to receive the lock's token.
     */
    function withdraw(uint256 lockID, address recipient) external;

    /**
     * @notice Withdraw from a lock in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockID The ID of the lock to withdraw from.
     * @param recipient The user to receive the lock's token.
     * @param amount The amount of token to withdraw.
     */
    function withdrawInPart(uint256 lockID, address recipient, uint256 amount) external;
    /**
     * @notice Withdraw from multiple locks in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockIDs The ID of the locks to withdraw from.
     * @param recipient The user to receive the lock's token.
     */
    function withdrawMultiple(uint256[] calldata lockIDs, address recipient) external;

    /**
     * @notice Withdraw from multiple locks in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockIDs The ID of the locks to withdraw from.
     * @param recipient The user to receive the lock's token.
     * @param amounts Array of token amounts to withdraw
     */
    function withdrawInPartMultiple(uint256[] calldata lockIDs, address recipient, uint256[] calldata amounts) external;

    /**
     * @notice Emergency withdraw from a lock in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockID The ID of the lock to emergency withdraw from.
     * @param recipient The user to receive the lock's token.
     */
    function emergencyWithdraw(uint256 lockID, address recipient) external;

    /**
     * @notice Emergency withdraw from a lock in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockID The ID of the lock to emergency withdraw from.
     * @param recipient The user to receive the lock's token.
     * @param amount The amount of token to withdraw.
     */
    function emergencyWithdrawInPart(uint256 lockID, address recipient, uint256 amount) external;

    /**
     * @notice Emergency withdraw from multiple locks in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockIDs The ID of the locks to withdraw from.
     * @param recipient The user to receive the lock's token.
     */
    function emergencyWithdrawMultiple(uint256[] calldata lockIDs, address recipient) external;

    /**
     * @notice Emergency withdraw from multiple locks in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockIDs The ID of the locks to withdraw from.
     * @param recipient The user to receive the lock's token.
     * @param amounts Array of token amounts to emergency withdraw
     */
    function emergencyWithdrawInPartMultiple(uint256[] calldata lockIDs, address recipient) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener The listener to add.
     */
    function addLockListener(address listener) external;

    /**
     * @notice Removes a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener The listener to remove.
     */
    function removeLockListener(address listener) external;

    /**
     * @notice Sets the base URI for computing `tokenURI`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param baseURI_ The new base URI.
     */
    function setBaseURI(string memory baseURI_) external;
}
