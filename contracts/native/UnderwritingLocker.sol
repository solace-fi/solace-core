// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./../utils/ERC721Enhanced.sol";
import "./../utils/Governable.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../interfaces/native/IUnderwritingLockListener.sol";
import "./../interfaces/native/IUnderwritingLocker.sol";

// TODO
// Need formula for _getEmergencyWithdrawPenaltyPercentage
// $UWE needs to inherit ERC20Permit, or we remove ...Signed methods from this contract

/**
 * @title UnderwritingLocker
 * @author solace.fi
 * @notice Having an underwriting lock is a requirement to vote on Solace Native insurance gauges.
 * To create an underwriting lock, $UWE must be locked for a minimum of 6 months.
 * 
 * Locks are ERC721s and can be viewed with [`locks()`](#locks). 
 * Each lock has an `amount` of locked $UWE, and an `end` timestamp.
 * Locks have a maximum duration of four years.
 *
 * Locked $UWE can be withdrawn without penalty via [`withdraw()`](#withdraw) only after the `end` timestamp
 * Locked $UWE withdrawn before the `end` timestamp via [`emergencyWithdraw()`](#emergencywithdraw) will incur 
 * a withdrawal penalty, which increases with remaining lock time.
 *
 * Users can create locks via [`createLock()`](#createlock) or [`createLockSigned()`](#createlocksigned)
 * Users can deposit more $UWE into a lock via [`increaseAmount()`](#increaseamount), [`increaseAmountSigned()`] (#increaseamountsigned) or [`increaseAmountMultiple()`](#increaseamountmultiple)
 * Users can extend a lock via [`extendLock()`](#extendlock) or [`extendLockMultiply()`](#extendlockmultiple)
 * Users can withdraw from a lock via [`withdraw()`](#withdraw), [`withdrawInPart()`](#withdrawinpart), or [`withdrawmultiple()`](#withdrawmultiple).
 * Users can emergency withdraw from a lock via [`emergencyWithdraw()`](#emergencywithdraw), [`emergencywithdrawinpart()`](#emergencywithdrawinpart), or [`emergencyWithdrawMultiple()`](#emergencywithdrawmultiple).
 *
 * Users and contracts may deposit into a lock that they do not own.
 *
 * Any time a lock is minted, burned or otherwise modified it will notify the listener contracts.
 *
 */
// solhint-disable-next-line contract-name-camelcase
contract UnderwritingLocker is 
        IUnderwritingLocker, 
        ERC721Enhanced, 
        ReentrancyGuard, 
        Governable 
    {    
    using EnumerableSet for EnumerableSet.AddressSet;

    /***************************************
    GLOBAL PUBLIC VARIABLES
    ***************************************/

    /// @notice Token locked in the underwriting lock.
    address public override token;

    /// @notice Revenue router address (Emergency withdraw penalties will be transferred here).
    address public override revenueRouter;

    /// @notice Registry address
    address public override registry;

    /// @notice The total number of locks that have been created.
    uint256 public override totalNumLocks;

    /// @notice The minimum lock duration (six months) that a new lock must be created with.
    uint256 public constant override MIN_LOCK_DURATION = (365 days) / 2;

    /// @notice The maximum time (four years) into the future that a lock can expire.
    uint256 public constant override MAX_LOCK_DURATION = 4 * (365 days);

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    // lockId => Lock {uint256 amount, uint256 end}
    mapping(uint256 => Lock) internal _locks;

    // Contracts that listen for lock changes
    EnumerableSet.AddressSet internal _lockListeners;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Construct the UnderwritingLocker contract.
     * @dev Requires 'uwe' and 'revenueRouter' addresses to be set in the Registry.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param registry_ The [`Registry`](./Registry) contract address.
     */
    constructor(address governance_, address registry_)
        ERC721Enhanced("Underwriting Lock", "UnderwritingLock")
        Governable(governance_)
    {
        _setRegistry(registry_);
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Computes current penalty (as a % of emergency withdrawn amount) for emergency withdrawing from a specified lock.
     * @dev penaltyPercentage == 1e18 means 100% penalty percentage. Similarly 1e17 => 10% penalty percentage.
     * @param end_ Timestamp when lock unlocks
     * @return penaltyPercentage Penalty percentage that will be paid to RevenueRouter.sol for emergency withdrawing.
     */
    function _getEmergencyWithdrawPenaltyPercentage(uint256 end_) internal view returns (uint256 penaltyPercentage) {
        // uint256 end = _locks[lockID].end;
        // Insert formula for computing penalty
        return 1; // dummy return for contract compile
    }

    /**
     * @notice Computes current penalty for emergency withdrawing from a specified lock.
     * @param lockID_ The ID of the lock to compute emergency withdraw penalty.
     * @return penaltyAmount Token amount that will be paid to RevenueRouter.sol as a penalty for emergency withdrawing.
     */
    function _getEmergencyWithdrawPenalty(uint256 lockID_) internal view returns (uint256 penaltyAmount) {
        Lock memory lock = _locks[lockID_];
        uint256 penaltyPercentage = _getEmergencyWithdrawPenaltyPercentage(lock.end);
        return (penaltyPercentage * lock.amount) / 1e18;
    }

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get `amount` and `end` values for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return lock Lock {uint256 amount, uint256 end}
     */
    function locks(uint256 lockID_) external view override tokenMustExist(lockID_) returns (Lock memory lock) {
        return _locks[lockID_];
    }

    /**
     * @notice Determines if the lock is currently locked.
     * @param lockID_ The ID of the lock to query.
     * @return locked True if the lock is locked, false if unlocked.
     */
    function isLocked(uint256 lockID_) external view override tokenMustExist(lockID_) returns (bool locked) {
        // solhint-disable-next-line not-rely-on-time
        return _locks[lockID_].end > block.timestamp;
    }

    /**
     * @notice Determines the time left until the lock unlocks.
     * @param lockID_ The ID of the lock to query.
     * @return time The time left in seconds, 0 if unlocked.
     */
    function timeLeft(uint256 lockID_) external view override tokenMustExist(lockID_) returns (uint256 time) {
        // solhint-disable-next-line not-rely-on-time
        return (_locks[lockID_].end > block.timestamp)
            // solhint-disable-next-line not-rely-on-time
            ? _locks[lockID_].end - block.timestamp // locked
            : 0; // unlocked
    }

    /**
     * @notice Returns the total token amount that the user has staked in underwriting locks.
     * @param account_ The account to query.
     * @return balance The user's total staked token amount.
     */
    function totalStakedBalance(address account_) external view override returns (uint256 balance) {
        uint256 numOfLocks = balanceOf(account_);
        balance = 0;
        for (uint256 i = 0; i < numOfLocks; i++) {
            uint256 lockID = tokenOfOwnerByIndex(account_, i);
            balance += _locks[lockID].amount;
        }
        return balance;
    }

    /**
     * @notice The list of contracts that are listening to lock updates.
     * @return listeners_ The list as an array.
     */
    function getLockListeners() external view override returns (address[] memory listeners_) {
        uint256 len = _lockListeners.length();
        listeners_ = new address[](len);
        for(uint256 index = 0; index < len; index++) {
            listeners_[index] = _lockListeners.at(index);
        }
        return listeners_;
    }

    /**
     * @notice Computes current penalty for emergency withdrawing from a specified lock.
     * @param lockID_ The ID of the lock to compute emergency withdraw penalty.
     * @return penaltyAmount Token amount that will be paid to RevenueRouter.sol as a penalty for emergency withdrawing.
     */
    function getEmergencyWithdrawPenalty(uint256 lockID_) external view override returns (uint256 penaltyAmount) {
        return _getEmergencyWithdrawPenalty(lockID_);
    }

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
    function createLock(address recipient_, uint256 amount_, uint256 end_) external override nonReentrant returns (uint256 lockID) {
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount_);
        // accounting
        return _createLock(recipient_, amount_, end_);
    }

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
    function createLockSigned(uint256 amount_, uint256 end_, uint256 deadline_, uint8 v, bytes32 r, bytes32 s) external override nonReentrant returns (uint256 lockID) {
        // permit
        IERC20Permit(token).permit(msg.sender, address(this), amount_, deadline_, v, r, s);
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount_);
        // accounting
        return _createLock(msg.sender, amount_, end_);
    }

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID_ The ID of the lock to update.
     * @param amount_ The amount of token to deposit.
     */
    function increaseAmount(uint256 lockID_, uint256 amount_) external override nonReentrant tokenMustExist(lockID_) {
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount_);
        // accounting
        _increaseAmount(lockID_, amount_);
    }

    /**
     * @notice Deposit token to increase the value of multiple existing locks.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev If a lockID does not exist, the corresponding amount will be refunded to msg.sender.
     * @dev Anyone (not just the lock owner) can call increaseAmountMultiple() and deposit to existing locks.
     * @param lockIDs_ Array of lock IDs to update.
     * @param amounts_ Array of token amounts to deposit.
     */
    function increaseAmountMultiple(uint256[] calldata lockIDs_, uint256[] calldata amounts_) external override nonReentrant {
        if (lockIDs_.length != amounts_.length) revert ArrayArgumentsLengthMismatch();
        uint256 refundAmount = 0;
        for (uint256 i = 0; i < lockIDs_.length; i++) {
            // Guard against revert for non-existing lockIDs
            if ( _exists(lockIDs_[i]) ) {
                _increaseAmount(lockIDs_[i], amounts_[i]);
            } else {
                refundAmount += amounts_[i];
            }
        }
        SafeERC20.safeTransfer(IERC20(token), msg.sender, refundAmount);
    }

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
    function increaseAmountSigned(uint256 lockID_, uint256 amount_, uint256 deadline_, uint8 v, bytes32 r, bytes32 s) external override nonReentrant tokenMustExist(lockID_) {
        // permit
        IERC20Permit(token).permit(msg.sender, address(this), amount_, deadline_, v, r, s);
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount_);
        // accounting
        _increaseAmount(lockID_, amount_);
    }

    /**
     * @notice Extend a lock's duration.
     * @dev Can only be called by the lock owner or approved.
     * @param lockID_ The ID of the lock to update.
     * @param end_ The new time for the lock to unlock.
     */
    function extendLock(uint256 lockID_, uint256 end_) external override nonReentrant onlyOwnerOrApproved(lockID_) {
        _extendLock(lockID_, end_);
    }

    /**
     * @notice Extend multiple locks' duration.
     * @dev Can only be called by the lock owner or approved.
     * @dev If non-existing lockIDs are entered, these will be skipped.
     * @param lockIDs_ Array of lock IDs to update.
     * @param ends_ Array of new unlock times.
     */
    function extendLockMultiple(uint256[] calldata lockIDs_, uint256[] calldata ends_) external override nonReentrant {
        if (lockIDs_.length != ends_.length) revert ArrayArgumentsLengthMismatch();

        for (uint256 i = 0; i < lockIDs_.length; i++) {
            // Guard against revert for non-existing lockIDs
            if ( _exists(lockIDs_[i]) ) {
                _extendLock(lockIDs_[i], ends_[i]);
            }
        }
    }

    /**
     * @notice Withdraw from a lock in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockID_ The ID of the lock to withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdraw(uint256 lockID_, address recipient_) external override nonReentrant onlyOwnerOrApproved(lockID_) {
        uint256 amount = _locks[lockID_].amount;
        _withdraw(lockID_, amount);
        // transfer token
        SafeERC20.safeTransfer(IERC20(token), recipient_, amount);
    }

    /**
     * @notice Withdraw from a lock in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockID_ The ID of the lock to withdraw from.
     * @param amount_ The amount of token to withdraw.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawInPart(uint256 lockID_, uint256 amount_, address recipient_) external override nonReentrant onlyOwnerOrApproved(lockID_) {
        if (amount_ > _locks[lockID_].amount) revert ExcessWithdraw(lockID_, _locks[lockID_].amount, amount_);
        _withdraw(lockID_, amount_);
        // transfer token
        SafeERC20.safeTransfer(IERC20(token), recipient_, amount_);
    }

    /**
     * @notice Withdraw from multiple locks in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawMultiple(uint256[] calldata lockIDs_, address recipient_) external override nonReentrant {
        uint256 len = lockIDs_.length;
        uint256 totalWithdrawAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs_[i];
            if (!_isApprovedOrOwner(msg.sender, lockID)) revert NotOwnerNorApproved();
            uint256 singleLockAmount = _locks[lockID].amount;
            totalWithdrawAmount += singleLockAmount;
            _withdraw(lockID, singleLockAmount);
        }
        // batched token transfer
        SafeERC20.safeTransfer(IERC20(token), recipient_, totalWithdrawAmount);
    }

    /**
     * @notice Withdraw from multiple locks in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param amounts_ Array of token amounts to withdraw
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawInPartMultiple(uint256[] calldata lockIDs_, uint256[] calldata amounts_ ,address recipient_) external override nonReentrant {
        if (lockIDs_.length != amounts_.length) revert ArrayArgumentsLengthMismatch();
        uint256 len = lockIDs_.length;
        uint256 totalWithdrawAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs_[i];
            if (!_isApprovedOrOwner(msg.sender, lockID)) revert NotOwnerNorApproved();
            uint256 singleLockAmount = amounts_[i];
            if (singleLockAmount > _locks[lockID].amount) revert ExcessWithdraw(lockID, _locks[lockID].amount, singleLockAmount);
            totalWithdrawAmount += singleLockAmount;
            _withdraw(lockID, singleLockAmount);
        }
        // batched token transfer
        SafeERC20.safeTransfer(IERC20(token), recipient_, totalWithdrawAmount);
    }

    /**
     * @notice Emergency withdraw from a lock in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockID_ The ID of the lock to emergency withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function emergencyWithdraw(uint256 lockID_, address recipient_) external override nonReentrant onlyOwnerOrApproved(lockID_) {
        uint256 amount = _locks[lockID_].amount;
        // Accounting
        uint256 penalty = _emergencyWithdraw(lockID_, amount);
        // Token transfers
        SafeERC20.safeTransfer(IERC20(token), revenueRouter, penalty);
        SafeERC20.safeTransfer(IERC20(token), recipient_, amount - penalty);
    }

    /**
     * @notice Emergency withdraw from a lock in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockID_ The ID of the lock to emergency withdraw from.
     * @param amount_ The amount of token to withdraw.
     * @param recipient_ The user to receive the lock's token.
     */
    function emergencyWithdrawInPart(uint256 lockID_, uint256 amount_, address recipient_) external override nonReentrant onlyOwnerOrApproved(lockID_) {
        if (amount_ > _locks[lockID_].amount) revert ExcessWithdraw(lockID_, _locks[lockID_].amount, amount_);
        uint256 penalty = _emergencyWithdraw(lockID_, amount_);
        SafeERC20.safeTransfer(IERC20(token), revenueRouter, penalty);
        SafeERC20.safeTransfer(IERC20(token), recipient_, amount_ - penalty);
    }

    /**
     * @notice Emergency withdraw from multiple locks in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function emergencyWithdrawMultiple(uint256[] calldata lockIDs_, address recipient_) external override nonReentrant {
        uint256 len = lockIDs_.length;
        uint256 totalWithdrawAmount = 0;
        uint256 totalPenaltyAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs_[i];
            if (!_isApprovedOrOwner(msg.sender, lockID)) revert NotOwnerNorApproved();
            uint256 singleLockAmount = _locks[lockID].amount;
            uint256 penalty = _emergencyWithdraw(lockID, singleLockAmount);
            totalPenaltyAmount += penalty;
            totalWithdrawAmount += (singleLockAmount - penalty);
        }
        // batched token transfer
        SafeERC20.safeTransfer(IERC20(token), revenueRouter, totalPenaltyAmount);
        SafeERC20.safeTransfer(IERC20(token), recipient_, totalWithdrawAmount);
    }

    /**
     * @notice Emergency withdraw from multiple locks in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param amounts_ Array of token amounts to emergency withdraw
     * @param recipient_ The user to receive the lock's token.
     */
    function emergencyWithdrawInPartMultiple(uint256[] calldata lockIDs_, uint256[] calldata amounts_, address recipient_) external override nonReentrant {
        if (lockIDs_.length != amounts_.length) revert ArrayArgumentsLengthMismatch();
        uint256 len = lockIDs_.length;
        uint256 totalWithdrawAmount = 0;
        uint256 totalPenaltyAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs_[i];
            if (!_isApprovedOrOwner(msg.sender, lockID)) revert NotOwnerNorApproved();
            uint256 singleLockAmount = amounts_[i];
            if (singleLockAmount > _locks[lockID].amount) revert ExcessWithdraw(lockID, _locks[lockID].amount, singleLockAmount);
            uint256 penalty = _emergencyWithdraw(lockID, singleLockAmount);
            totalPenaltyAmount += penalty;
            totalWithdrawAmount += (singleLockAmount - penalty);
        }
        // batched token transfer
        SafeERC20.safeTransfer(IERC20(token), revenueRouter, totalPenaltyAmount);
        SafeERC20.safeTransfer(IERC20(token), recipient_, totalWithdrawAmount);
    }

    /***************************************
    INTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Creates a new lock.
     * @param recipient_ The user that the lock will be minted to.
     * @param amount_ The amount of token in the lock.
     * @param end_ The end of the lock.
     * @return lockID The ID of the new lock.
     */
    function _createLock(address recipient_, uint256 amount_, uint256 end_) internal returns (uint256 lockID) {
        // solhint-disable-next-line not-rely-on-time
        if(end_ < block.timestamp + MIN_LOCK_DURATION) revert LockTimeTooShort();
        // solhint-disable-next-line not-rely-on-time
        if(end_ > block.timestamp + MAX_LOCK_DURATION) revert LockTimeTooLong();
        lockID = ++totalNumLocks;
        Lock memory newLock = Lock(amount_, end_);
        // accounting
        _locks[lockID] = newLock;
        _safeMint(recipient_, lockID);
        emit LockCreated(lockID);
    }

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID_ The ID of the lock to update.
     * @param amount_ The amount of token to deposit.
     */
    function _increaseAmount(uint256 lockID_, uint256 amount_) internal {
        uint256 newAmount = _locks[lockID_].amount + amount_;
        _updateLock(lockID_, newAmount, _locks[lockID_].end);
        emit LockIncreased(lockID_, newAmount, amount_);
    }


    /**
     * @notice Updates an existing lock.
     * @param lockID_ The ID of the lock to update.
     * @param amount_ The amount of token now in the lock.
     * @param end_ The end of the lock.
     */
    function _updateLock(uint256 lockID_, uint256 amount_, uint256 end_) internal {
        // checks
        Lock memory prevLock = _locks[lockID_];
        Lock memory newLock = Lock(amount_, end_); // end was sanitized before passed in
        // accounting
        _locks[lockID_] = newLock;
        address owner = ownerOf(lockID_);
        _notify(lockID_, owner, owner, prevLock, newLock);
        emit LockUpdated(lockID_, amount_, newLock.end);
    }

    /**
     * @notice Withdraws from a lock.
     * @param lockID_ The ID of the lock to withdraw from.
     * @param amount_ The amount of token to withdraw.
     */
    function _withdraw(uint256 lockID_, uint256 amount_) internal {
        // solhint-disable-next-line not-rely-on-time
        if(_locks[lockID_].end > block.timestamp) revert CannotWithdrawWhileLocked(); // cannot withdraw while locked
        // accounting
        if(amount_ == _locks[lockID_].amount) {
            _burn(lockID_);
            delete _locks[lockID_];
        }
        else {
            Lock memory oldLock = _locks[lockID_];
            Lock memory newLock = Lock(oldLock.amount - amount_, oldLock.end);
            _locks[lockID_].amount -= amount_;
            address owner = ownerOf(lockID_);
            _notify(lockID_, owner, owner, oldLock, newLock);
        }
        emit Withdrawal(lockID_, amount_);
    }

    /**
     * @notice Extend a lock's duration.
     * @dev Can only be called by the lock owner or approved.
     * @param lockID_ The ID of the lock to update.
     * @param end_ The new time for the lock to unlock.
     */
    function _extendLock(uint256 lockID_, uint256 end_) internal nonReentrant onlyOwnerOrApproved(lockID_) {
        // solhint-disable-next-line not-rely-on-time
        if(end_ > block.timestamp + MAX_LOCK_DURATION) revert LockTimeTooLong();
        if(_locks[lockID_].end > end_) revert LockTimeNotExtended();
        _updateLock(lockID_, _locks[lockID_].amount, end_);
        emit LockExtended(lockID_, end_);
    }

    /**
     * @notice Emergency withdraws from a lock.
     * @param lockID_ The ID of the lock to emergency withdraw from.
     * @param amount_ The amount of token to emergency withdraw.
     * @return penalty Token amount that will be paid to RevenueRouter as a penalty for emergency withdraw
     */
    function _emergencyWithdraw(uint256 lockID_, uint256 amount_) internal returns (uint256 penalty) {
        // Make _getEmergencyWithdrawPenaltyPercentage query before lockID is potentially deleted
        uint256 penaltyPercentage = _getEmergencyWithdrawPenaltyPercentage(lockID_);
        penalty = amount_ * penaltyPercentage / 1e18;
        // accounting
        if(amount_ == _locks[lockID_].amount) {
            _burn(lockID_);
            delete _locks[lockID_];
        }
        else {
            Lock memory oldLock = _locks[lockID_];
            Lock memory newLock = Lock(oldLock.amount - amount_, oldLock.end);
            _locks[lockID_].amount -= amount_;
            address owner = ownerOf(lockID_);
            _notify(lockID_, owner, owner, oldLock, newLock);
        }
        emit EmergencyWithdrawal(lockID_, amount_, penalty);
    }

    /**
     * @notice Hook that is called after any token transfer. This includes minting and burning.
     * @param from_ The user that sends the token, or zero if minting.
     * @param to_ The zero that receives the token, or zero if burning.
     * @param lockID_ The ID of the token being transferred.
     */
    function _afterTokenTransfer(
        address from_,
        address to_,
        uint256 lockID_
    ) internal override {
        super._afterTokenTransfer(from_, to_, lockID_);
        Lock memory lock = _locks[lockID_];
        // notify listeners
        if(from_ == address(0x0)) _notify(lockID_, from_, to_, Lock(0, 0), lock); // mint
        else if(to_ == address(0x0)) _notify(lockID_, from_, to_, lock, Lock(0, 0)); // burn
        else { // transfer
            // solhint-disable-next-line not-rely-on-time
            if(lock.end > block.timestamp) revert CannotTransferWhileLocked();
            _notify(lockID_, from_, to_, lock, lock);
        }
    }

    /**
     * @notice Notify the listeners of any updates.
     * @dev Called on transfer, mint, burn, and update.
     * Either the owner will change or the lock will change, not both.
     * @param lockID_ The ID of the lock that was altered.
     * @param oldOwner_ The old owner of the lock.
     * @param newOwner_ The new owner of the lock.
     * @param oldLock_ The old lock data.
     * @param newLock_ The new lock data.
     */
    function _notify(uint256 lockID_, address oldOwner_, address newOwner_, Lock memory oldLock_, Lock memory newLock_) internal {
        // register action with listener
        uint256 len = _lockListeners.length();
        for(uint256 i = 0; i < len; i++) {
            IUnderwritingLockListener(_lockListeners.at(i)).registerLockEvent(lockID_, oldOwner_, newOwner_, oldLock_, newLock_);
        }
    }

    /**
     * @notice Sets registry and related contract addresses.
     * @dev Requires 'uwe' and 'revenueRouter' addresses to be set in the Registry.
     * @param registry_ The registry address to set.
     */
    function _setRegistry(address registry_) internal {
        // set registry        
        if(registry_ == address(0x0)) revert ZeroAddressInput("registry");
        registry = registry_;
        IRegistry reg = IRegistry(registry_);
        // set revenueRouter
        (, address revenueRouterAddr) = reg.tryGet("revenueRouter");
        if(revenueRouterAddr == address(0x0)) revert ZeroAddressInput("revenueRouter");
        revenueRouter = revenueRouterAddr;
        // set token ($UWE)
        (, address uweAddr) = reg.tryGet("uwe");
        if(uweAddr == address(0x0)) revert ZeroAddressInput("uwe");
        token = uweAddr;
        emit RegistrySet(registry_);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener_ The listener to add.
     */
    function addLockListener(address listener_) external override onlyGovernance {
        _lockListeners.add(listener_);
        emit LockListenerAdded(listener_);
    }

    /**
     * @notice Removes a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener_ The listener to remove.
     */
    function removeLockListener(address listener_) external override onlyGovernance {
        _lockListeners.remove(listener_);
        emit LockListenerRemoved(listener_);
    }

    /**
     * @notice Sets the base URI for computing `tokenURI`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param baseURI_ The new base URI.
     */
    function setBaseURI(string memory baseURI_) external override onlyGovernance {
        _setBaseURI(baseURI_);
    }

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * @dev Requires 'uwe' and 'revenueRouter' addresses to be set in the Registry.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
     */
    function setRegistry(address registry_) external override onlyGovernance {
        _setRegistry(registry_);
    }

    /**
     * @notice Approves [`UnderwritingLockVoting`](./UnderwritingLockVoting) to transfer token from this contract
     * @dev Hacky fix to the issue that [`UnderwritingLockVoting`](./UnderwritingLockVoting) needs token transfer approval, but will be deployed after this contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param votingContract_ The address of `LockUnderwritingVoting` contract.
     */
    function setVotingContractApproval(address votingContract_) external override onlyGovernance {
        SafeERC20.safeApprove(IERC20(token), votingContract_, type(uint256).max);
    }
}
