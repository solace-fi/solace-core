// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "./../utils/IERC721Enhanced.sol";

/// @dev Defining Lock struct outside of the interface body causes this struct to be visible to contracts that import, but do not inherit, this file. If we otherwise define this struct in the interface body, it is only visible to contracts that both import and inherit this file.
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
 * Locked $UWE withdrawn before the `end` timestamp will incur a withdrawal penalty, which scales with remaining lock time.
 *
 * Users can create locks via [`createLock()`](#createlock) or [`createLockSigned()`](#createlocksigned).
 * Users can deposit more $UWE into a lock via [`increaseAmount()`](#increaseamount), [`increaseAmountSigned()`] (#increaseamountsigned) or [`increaseAmountMultiple()`](#increaseamountmultiple).
 * Users can extend a lock via [`extendLock()`](#extendlock) or [`extendLockMultiple()`](#extendlockmultiple).
 * Users can withdraw from a lock via [`withdraw()`](#withdraw), [`withdrawInPart()`](#withdrawinpart), [`withdrawMultiple()`](#withdrawmultiple) or [`withdrawInPartMultiple()`](#withdrawinpartmultiple).
 *
 * Users and contracts may create a lock for another address.
 * Users and contracts may deposit into a lock that they do not own.
 *
 * Any time a lock is minted, burned or otherwise modified it will notify the listener contracts.
 */
interface IUnderwritingLocker is IERC721Enhanced {

    /***************************************
    CUSTOM ERRORS
    ***************************************/

    /**
     * @notice Thrown when array arguments are mismatched in length (and need to have the same length);
     * @dev Should we use array of custom structs as the parameter type, instead of multiple array parameters for functions requiring this input validation?
     */
    error ArrayArgumentsLengthMismatch();

    /// @notice Thrown when zero address is given as an argument.
    /// @param contractName Name of contract for which zero address was incorrectly provided.
    error ZeroAddressInput(string contractName);

    /// @notice Thrown when extend or withdraw is attempted by a party that is not the owner nor approved for a lock.
    error NotOwnerNorApproved();

    /// @notice Thrown when create lock is attempted with 0 deposit.
    error CannotCreateEmptyLock();

    /// @notice Thrown when createLock is attempted with lock duration < 6 months.
    error LockTimeTooShort();

    /// @notice Thrown when createLock or extendLock is attempted with lock duration > 4 years.
    error LockTimeTooLong();

    /// @notice Thrown when extendLock is attempted to shorten the lock duration.
    error LockTimeNotExtended();

    /// @notice Thrown when transfer is attempted while locked.
    error CannotTransferWhileLocked();

    /**
     * @notice Thrown when a withdraw is attempted for an `amount` that exceeds the lock balance.
     * @param lockID The ID of the lock
     * @param lockAmount Balance of the lock
     * @param attemptedWithdrawAmount Attempted withdraw amount
     */
    error ExcessWithdraw(uint256 lockID, uint256 lockAmount, uint256 attemptedWithdrawAmount);

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

    /// @notice Emitted when an early withdraw is made.
    event EarlyWithdrawal(uint256 indexed lockID, uint256 totalWithdrawAmount, uint256 penaltyAmount);

    /// @notice Emitted when a listener is added.
    event LockListenerAdded(address indexed listener);

    /// @notice Emitted when a listener is removed.
    event LockListenerRemoved(address indexed listener);

    /// @notice Emitted when the registry is set.
    event RegistrySet(address indexed registry);

    /// @notice Emitted when voting contract has been set
    event VotingContractSet(address indexed votingContract);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Token locked in the underwriting lock.
    function token() external view returns (address);

    /// @notice Revenue router address (Early withdraw penalties will be transferred here).
    function revenueRouter() external view returns (address);

    /// @notice Registry address
    function registry() external view returns (address);

    /// @notice UnderwriterLockVoting.sol address
    function votingContract() external view returns (address);

    /// @notice The minimum lock duration that a new lock must be created with.
    function MIN_LOCK_DURATION() external view returns (uint256);

    /// @notice The maximum time into the future that a lock can expire.
    function MAX_LOCK_DURATION() external view returns (uint256);

    /// @notice The total number of locks that have been created.
    /// @dev Difference with totalSupply is that totalNumLocks does not decrement when locks are burned.
    function totalNumLocks() external view returns (uint256);

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get `amount` and `end` values for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return lock_ Lock {uint256 amount, uint256 end}
     */
    function locks(uint256 lockID_) external view returns (Lock memory lock_);


    /**
     * @notice Determines if the lock is currently locked.
     * @param lockID_ The ID of the lock to query.
     * @return locked True if the lock is locked, false if unlocked.
     */
    function isLocked(uint256 lockID_) external view returns (bool locked);

    /**
     * @notice Determines the time left until the lock unlocks.
     * @param lockID_ The ID of the lock to query.
     * @return time The time left in seconds, 0 if unlocked.
     */
    function timeLeft(uint256 lockID_) external view returns (uint256 time);

    /**
     * @notice Returns the total token amount that the user has staked in underwriting locks.
     * @param account_ The account to query.
     * @return balance The user's total staked token amount.
     */
    function totalStakedBalance(address account_) external view returns (uint256 balance);

    /**
     * @notice The list of contracts that are listening to lock updates.
     * @return listeners_ The list as an array.
     */
    function getLockListeners() external view returns (address[] memory listeners_);

    /**
     * @notice Computes current penalty for early complete withdrawal from a specified lock.
     * @param lockID_ The ID of the lock to compute early withdraw penalty.
     * @return penaltyAmount Token amount that will be paid to RevenueRouter.sol as a penalty for early complete withdrawal.
     */
    function getEarlyWithdrawPenalty(uint256 lockID_) external returns (uint256 penaltyAmount);

    /**
     * @notice Computes current penalty for early partial withdrawal from a specified lock.
     * @param lockID_ The ID of the lock to compute early withdraw penalty.
     * @param amount_ The amount to withdraw.
     * @return penaltyAmount Token amount that will be paid to RevenueRouter.sol as a penalty for early partial withdrawal.
     */
    function getEarlyWithdrawInPartPenalty(uint256 lockID_, uint256 amount_) external returns (uint256 penaltyAmount);

    /***************************************
    EXTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Deposit token to create a new lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @param recipient_ The account that will receive the lock.
     * @param amount_ The amount of token to deposit.
     * @param end_ The timestamp the lock will unlock.
     * @return lockID The ID of the newly created lock.
     */
    function createLock(address recipient_, uint256 amount_, uint256 end_) external returns (uint256 lockID);

    /**
     * @notice Deposit token to create a new lock.
     * @dev Token is transferred from msg.sender using ERC20Permit.
     * @dev recipient = msg.sender
     * @param amount_ The amount of token to deposit.
     * @param end_ The timestamp the lock will unlock.
     * @param deadline_ Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     * @return lockID The ID of the newly created lock.
     */
    function createLockSigned(uint256 amount_, uint256 end_, uint256 deadline_, uint8 v, bytes32 r, bytes32 s) external returns (uint256 lockID);

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID_ The ID of the lock to update.
     * @param amount_ The amount of token to deposit.
     */
    function increaseAmount(uint256 lockID_, uint256 amount_) external;

    /**
     * @notice Deposit token to increase the value of multiple existing locks.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev If a lockID does not exist, the corresponding amount will be refunded to msg.sender.
     * @dev Anyone (not just the lock owner) can call increaseAmountMultiple() and deposit to existing locks.
     * @param lockIDs_ Array of lock IDs to update.
     * @param amounts_ Array of token amounts to deposit.
     */
    function increaseAmountMultiple(uint256[] calldata lockIDs_, uint256[] calldata amounts_) external;

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender using ERC20Permit.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID_ The ID of the lock to update.
     * @param amount_ The amount of token to deposit.
     * @param deadline_ Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function increaseAmountSigned(uint256 lockID_, uint256 amount_, uint256 deadline_, uint8 v, bytes32 r, bytes32 s) external;

    /**
     * @notice Extend a lock's duration.
     * @dev Can only be called by the lock owner or approved.
     * @param lockID_ The ID of the lock to update.
     * @param end_ The new time for the lock to unlock.
     */
    function extendLock(uint256 lockID_, uint256 end_) external;

    /**
     * @notice Extend multiple locks' duration.
     * @dev Can only be called by the lock owner or approved.
     * @dev If non-existing lockIDs are entered, these will be skipped.
     * @param lockIDs_ Array of lock IDs to update.
     * @param ends_ Array of new unlock times.
     */
    function extendLockMultiple(uint256[] calldata lockIDs_, uint256[] calldata ends_) external;

    /**
     * @notice Withdraw from a lock in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockID_ The ID of the lock to withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdraw(uint256 lockID_, address recipient_) external;

    /**
     * @notice Withdraw from a lock in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockID_ The ID of the lock to withdraw from.
     * @param amount_ The amount of token to withdraw.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawInPart(uint256 lockID_, uint256 amount_, address recipient_) external;

    /**
     * @notice Withdraw from multiple locks in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawMultiple(uint256[] calldata lockIDs_, address recipient_) external;

    /**
     * @notice Withdraw from multiple locks in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param amounts_ Array of token amounts to withdraw
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawInPartMultiple(uint256[] calldata lockIDs_, uint256[] calldata amounts_ ,address recipient_) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener_ The listener to add.
     */
    function addLockListener(address listener_) external;

    /**
     * @notice Removes a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener_ The listener to remove.
     */
    function removeLockListener(address listener_) external;

    /**
     * @notice Sets the base URI for computing `tokenURI`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param baseURI_ The new base URI.
     */
    function setBaseURI(string memory baseURI_) external;

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
     */
    function setRegistry(address registry_) external;

    /**
     * @notice Sets votingContract and enable safeTransferFrom call by `underwritingLockVoting` address stored in Registry.
     * @dev Hacky fix to the issue that [`UnderwritingLockVoting`](./UnderwritingLockVoting) needs token transfer approval, but will be deployed after this contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function setVotingContract() external;
}
