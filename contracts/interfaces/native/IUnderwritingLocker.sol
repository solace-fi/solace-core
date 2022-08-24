// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

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
 * Users can create locks via [`createLock()`](#createlock) or [`createLockSigned()`](#createlocksigned).
 * Users can deposit more $UWE into a lock via [`increaseAmount()`](#increaseamount), [`increaseAmountSigned()`] (#increaseamountsigned) or [`increaseAmountMultiple()`](#increaseamountmultiple).
 * Users can extend a lock via [`extendLock()`](#extendlock) or [`extendLockMultiple()`](#extendlockmultiple).
 * Users can withdraw from a lock via [`withdraw()`](#withdraw), [`withdrawInPart()`](#withdrawinpart), [`withdrawMultiple()`](#withdrawmultiple) or [`withdrawInPartMultiple()`](#withdrawinpartmultiple).
 *
 * Users and contracts may create a lock for another address.
 * Users and contracts may deposit into a lock that they do not own.
 * A portion (set by the funding rate) of withdraws will be burned. This is to incentivize longer staking periods - withdrawing later than other users will yield more tokens than withdrawing earlier.
 * Early withdrawls will incur an additional burn, which will increase with longer remaining lock duration.
 *
 * Any time a lock is minted, burned or otherwise modified it will notify the listener contracts.
 */
// solhint-disable-next-line contract-name-camelcase
interface IUnderwritingLocker is IERC721Enhanced {

    /***************************************
    CUSTOM ERRORS
    ***************************************/

    /// @notice Thrown when array arguments are mismatched in length (and need to have the same length);
    error ArrayArgumentsLengthMismatch();

    /// @notice Thrown when zero address is given as an argument.
    /// @param contractName Name of contract for which zero address was incorrectly provided.
    error ZeroAddressInput(string contractName);

    /// @notice Thrown when extend or withdraw is attempted by a party that is not the owner nor approved for a lock.
    error NotOwnerNorApproved();

    /// @notice Thrown when create lock is attempted with 0 deposit.
    error CannotCreateEmptyLock();

    /// @notice Thrown when a user attempts to create a new lock, when they already have MAX_NUM_LOCKS locks.
    error CreatedMaxLocks();

    /// @notice Thrown when createLock is attempted with lock duration < 6 months.
    error LockTimeTooShort();

    /// @notice Thrown when createLock or extendLock is attempted with lock duration > 4 years.
    error LockTimeTooLong();

    /// @notice Thrown when extendLock is attempted to shorten the lock duration.
    error LockTimeNotExtended();

    /// @notice Thrown when a withdraw is attempted for an `amount` that exceeds the lock balance.
    error ExcessWithdraw();

    /// @notice Thrown when funding rate is set above 100%
    error FundingRateAboveOne();

    /// @notice Emitted when chargePremium() is not called by the voting contract.
    error NotVotingContract();

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
    event Withdrawal(uint256 indexed lockID, uint256 requestedWithdrawAmount, uint256 actualWithdrawAmount, uint256 burnAmount);

    /// @notice Emitted when an early withdraw is made.
    event EarlyWithdrawal(uint256 indexed lockID, uint256 requestedWithdrawAmount, uint256 actualWithdrawAmount, uint256 burnAmount);

    /// @notice Emitted when a listener is added.
    event LockListenerAdded(address indexed listener);

    /// @notice Emitted when a listener is removed.
    event LockListenerRemoved(address indexed listener);

    /// @notice Emitted when the registry is set.
    event RegistrySet(address indexed registry);

    /// @notice Emitted when voting contract has been set
    event VotingContractSet(address indexed votingContract);

    /// @notice Emitted when funding rate is set.
    event FundingRateSet(uint256 indexed fundingRate);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Token locked in the underwriting lock.
    function token() external view returns (address);

    /// @notice Registry address
    function registry() external view returns (address);

    /// @notice UnderwriterLockVoting.sol address.
    function votingContract() external view returns (address);

    /// @notice The total number of locks that have been created.
    function totalNumLocks() external view returns (uint256);

    /// @notice Funding rate - amount that will be charged and burned from a regular withdraw.
    /// @dev Value of 1e18 => 100%.
    function fundingRate() external view returns (uint256);

    /// @notice The minimum lock duration that a new lock must be created with.
    function MIN_LOCK_DURATION() external view returns (uint256);

    /// @notice The maximum time into the future that a lock can expire.
    function MAX_LOCK_DURATION() external view returns (uint256);

    /// @notice The maximum number of locks one user can create.
    function MAX_NUM_LOCKS() external view returns (uint256);

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get `amount` and `end` values for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return lock_ Lock {uint256 amount, uint256 end}.
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
     * @notice Computes amount of token that will be transferred to the user on full withdraw.
     * @param lockID_ The ID of the lock to query.
     * @return withdrawAmount Token amount that will be withdrawn.
     */
    function getWithdrawAmount(uint256 lockID_) external view returns (uint256 withdrawAmount);

    /**
     * @notice Computes amount of token that will be transferred to the user on partial withdraw.
     * @param lockID_ The ID of the lock to query.
     * @param amount_ The requested amount to withdraw.
     * @return withdrawAmount Token amount that will be withdrawn.
     */
    function getWithdrawInPartAmount(uint256 lockID_, uint256 amount_) external view returns (uint256 withdrawAmount);

    /**
     * @notice Computes amount of token that will be burned on full withdraw.
     * @param lockID_ The ID of the lock to query.
     * @return burnAmount Token amount that will be burned on withdraw.
     */
    function getBurnOnWithdrawAmount(uint256 lockID_) external view returns (uint256 burnAmount);

    /**
     * @notice Computes amount of token that will be burned on partial withdraw.
     * @param lockID_ The ID of the lock to query.
     * @param amount_ The requested amount to withdraw.
     * @return burnAmount Token amount that will be burned on withdraw.
     */
    function getBurnOnWithdrawInPartAmount(uint256 lockID_, uint256 amount_) external view returns (uint256 burnAmount);

    /**
     * @notice Gets multiplier (applied for voting boost, and for early withdrawals).
     * @param lockID_ The ID of the lock to query.
     * @return multiplier 1e18 => 1x multiplier, 2e18 => 2x multiplier.
     */
    function getLockMultiplier(uint256 lockID_) external view returns (uint256 multiplier);

    /**
     * @notice Gets all active lockIDs for a user.
     * @param user_ The address of user to query.
     * @return lockIDs Array of active lockIDs.
     */
    function getAllLockIDsOf(address user_) external view returns (uint256[] memory lockIDs);

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
     * @dev recipient = msg.sender.
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
     * @dev If called before `end` timestamp, will incur additional burn amount.
     * @param lockID_ The ID of the lock to withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdraw(uint256 lockID_, address recipient_) external;

    /**
     * @notice Withdraw from a lock in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur additional burn amount.
     * @param lockID_ The ID of the lock to withdraw from.
     * @param amount_ The amount of token to withdraw.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawInPart(uint256 lockID_, uint256 amount_, address recipient_) external;

    /**
     * @notice Withdraw from multiple locks in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur additional burn amount.
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawMultiple(uint256[] calldata lockIDs_, address recipient_) external;

    /**
     * @notice Withdraw from multiple locks in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur additional burn amount.
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param amounts_ Array of token amounts to withdraw
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawInPartMultiple(uint256[] calldata lockIDs_, uint256[] calldata amounts_ ,address recipient_) external;

    /***************************************
    VOTING CONTRACT FUNCTIONS
    ***************************************/

    /**
     * @notice Perform accounting for voting premiums to be charged by UnderwritingLockVoting.chargePremiums().
     * @dev Can only be called by votingContract set in the registry.
     * @param lockID_ The ID of the lock to charge premium.
     * @param premium_ Amount of tokens to charge as premium.
     */
    function chargePremium(uint256 lockID_, uint256 premium_) external;

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
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function setVotingContract() external;

    /**
     * @notice Sets fundingRate.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param fundingRate_ Desired funding rate, 1e18 => 100%
     */
    function setFundingRate(uint256 fundingRate_) external;
}
