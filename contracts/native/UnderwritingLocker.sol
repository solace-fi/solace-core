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
import "./../interfaces/native/IUnderwritingLocker.sol";

// TODO
// Need formula for _getEmergencyWithdrawPenaltyPercentage
// $UWE needs to inherit ERC20Permit, or we remove ...Signed methods from this contract
// Custom Error types

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
contract UnderwritingLocker is IUnderwritingLocker, ERC721Enhanced, ReentrancyGuard, Governable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Token locked in the underwriting lock.
    address public override token;

    /// @notice Revenue router address (Emergency withdraw penalties will be transferred here).
    address public override revenueRouter;

    /// @notice Registry address
    address public override registry;

    /// @notice The minimum lock duration (six months) that a new lock must be created with.
    uint256 public constant override MIN_LOCK_DURATION = (365 days) / 2;

    /// @notice The maximum time (four years) into the future that a lock can expire.
    uint256 public constant override MAX_LOCK_DURATION = 4 * (365 days);

    /// @notice The total number of locks that have been created.
    uint256 public override totalNumLocks;

    // lockId => Lock {uint256 amount, uint256 end}
    mapping(uint256 => Lock) private _locks;

    // Contracts that listen for lock changes
    EnumerableSet.AddressSet private _lockListeners;

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
     * @param lockID The ID of the lock to compute emergency withdraw penalty.
     * @return penaltyAmount Token amount that will be paid to RevenueRouter.sol as a penalty for emergency withdrawing.
     */
    function _getEmergencyWithdrawPenaltyPercentage(uint256 lockID) internal view returns (uint256 penaltyPercentage) {
        // uint256 end = _locks[lockID].end;
        // Insert formula for computing penalty
        return 1; // dummy return for contract compile
    }

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get `amount` and `end` values for a lockID.
     * @param lockID The ID of the lock to query.
     * @return lock_ Lock {uint256 amount, uint256 end}
     */
    function locks(uint256 lockID) external view override tokenMustExist(lockID) returns (Lock memory lock_) {
        return _locks[lockID];
    }

    /**
     * @notice Determines if the lock is currently locked.
     * @param lockID The ID of the lock to query.
     * @return locked True if the lock is locked, false if unlocked.
     */
    function isLocked(uint256 lockID) external view override tokenMustExist(lockID) returns (bool locked) {
        // solhint-disable-next-line not-rely-on-time
        return _locks[lockID].end > block.timestamp;
    }

    /**
     * @notice Determines the time left until the lock unlocks.
     * @param lockID The ID of the lock to query.
     * @return time The time left in seconds, 0 if unlocked.
     */
    function timeLeft(uint256 lockID) external view override tokenMustExist(lockID) returns (uint256 time) {
        // solhint-disable-next-line not-rely-on-time
        return (_locks[lockID].end > block.timestamp)
            // solhint-disable-next-line not-rely-on-time
            ? _locks[lockID].end - block.timestamp // locked
            : 0; // unlocked
    }

    /**
     * @notice Returns the total token amount that the user has staked in underwriting locks.
     * @param account The account to query.
     * @return balance The user's total staked token amount.
     */
    function totalStakedBalance(address account) external view override returns (uint256 balance) {
        uint256 numOfLocks = balanceOf(account);
        balance = 0;
        for (uint256 i = 0; i < numOfLocks; i++) {
            uint256 lockID = tokenOfOwnerByIndex(account, i);
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
     * @notice Computes current penalty (as a % of emergency withdrawn amount) for emergency withdrawing from a specified lock.
     * @dev penaltyPercentage == 1e18 means 100% penalty percentage. Similarly 1e17 => 10% penalty percentage.
     * @param lockID The ID of the lock to compute emergency withdraw penalty.
     * @return penaltyAmount Token amount that will be paid to RevenueRouter.sol as a penalty for emergency withdrawing.
     */
    function getEmergencyWithdrawPenaltyPercentage(uint256 lockID) external view override tokenMustExist(lockID) returns (uint256 penaltyAmount) {
        return _getEmergencyWithdrawPenaltyPercentage(lockID);
    }

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
    function createLock(address recipient, uint256 amount, uint256 end) external override nonReentrant returns (uint256 lockID) {
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        // accounting
        return _createLock(recipient, amount, end);
    }

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
    function createLockSigned(uint256 amount, uint256 end, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external override nonReentrant returns (uint256 lockID) {
        // permit
        IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s);
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        // accounting
        return _createLock(msg.sender, amount, end);
    }

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID The ID of the lock to update.
     * @param amount The amount of token to deposit.
     */
    function increaseAmount(uint256 lockID, uint256 amount) external override nonReentrant tokenMustExist(lockID) {
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        // accounting
        _increaseAmount(lockID, amount);
    }

    /**
     * @notice Deposit token to increase the value of multiple existing locks.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev If a lockID does not exist, the corresponding amount will be refunded to msg.sender.
     * @dev Anyone (not just the lock owner) can call increaseAmountMultiple() and deposit to existing locks.
     * @param lockIDs Array of lock IDs to update.
     * @param amounts Array of token amounts to deposit.
     */
    function increaseAmountMultiple(uint256[] calldata lockIDs, uint256[] calldata amounts) external override nonReentrant {
        require (lockIDs.length == amounts.length, "array length mismatch");
        uint256 refundAmount = 0;
        for (uint256 i = 0; i < lockIDs.length; i++) {
            // Guard against revert for non-existing lockIDs
            if ( _exists(lockIDs[i]) ) {
                increaseAmount(lockIDs[i], amounts[i]);
            } else {
                refundAmount += amounts[i];
            }
        }
        SafeERC20.safeTransfer(IERC20(token), msg.sender, refundAmount);
    }

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
    function increaseAmountSigned(uint256 lockID, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external override nonReentrant tokenMustExist(lockID) {
        // permit
        IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s);
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        // accounting
        _increaseAmount(lockID, amount);
    }

    /**
     * @notice Extend a lock's duration.
     * @dev Can only be called by the lock owner or approved.
     * @param lockID The ID of the lock to update.
     * @param end The new time for the lock to unlock.
     */
    function extendLock(uint256 lockID, uint256 end) external override nonReentrant onlyOwnerOrApproved(lockID) {
        // solhint-disable-next-line not-rely-on-time
        require(end <= block.timestamp + MAX_LOCK_DURATION, "Max lock is 4 years");
        require(_locks[lockID].end <= end, "not extended");
        _updateLock(lockID, _locks[lockID].amount, end);
        emit LockExtended(lockID, end);
    }

    /**
     * @notice Extend multiple locks' duration.
     * @dev Can only be called by the lock owner or approved.
     * @dev If non-existing lockIDs are entered, these will be skipped.
     * @param lockIDs Array of lock IDs to update.
     * @param ends Array of new unlock times.
     */
    function extendLockMultiple(uint256[] calldata lockIDs, uint256[] calldata ends) external override nonReentrant onlyOwnerOrApproved(lockID) {
        require (lockIDs.length == ends.length, "array length mismatch");

        for (uint256 i = 0; i < lockIDs.length; i++) {
            // Guard against revert for non-existing lockIDs
            if ( _exists(lockIDs[i]) ) {
                extendLock(lockIDs[i], amounts[i]);
            }
        }
    }

    /**
     * @notice Withdraw from a lock in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockID The ID of the lock to withdraw from.
     * @param recipient The user to receive the lock's token.
     */
    function withdraw(uint256 lockID, address recipient) external override nonReentrant onlyOwnerOrApproved(lockID) {
        uint256 amount = _locks[lockID].amount;
        _withdraw(lockID, amount);
        // transfer token
        SafeERC20.safeTransfer(IERC20(token), recipient, amount);
    }

    /**
     * @notice Withdraw from a lock in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockID The ID of the lock to withdraw from.
     * @param recipient The user to receive the lock's token.
     * @param amount The amount of token to withdraw.
     */
    function withdrawInPart(uint256 lockID, address recipient, uint256 amount) external override nonReentrant onlyOwnerOrApproved(lockID) {
        require(amount <= _locks[lockID].amount, "excess withdraw");
        _withdraw(lockID, amount);
        // transfer token
        SafeERC20.safeTransfer(IERC20(token), recipient, amount);
    }

    /**
     * @notice Withdraw from multiple locks in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockIDs The ID of the locks to withdraw from.
     * @param recipient The user to receive the lock's token.
     */
    function withdrawMultiple(uint256[] calldata lockIDs, address recipient) external override nonReentrant {
        uint256 len = lockIDs.length;
        uint256 totalWithdrawAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs[i];
            require(_isApprovedOrOwner(msg.sender, lockID), "only owner or approved");
            uint256 singleLockAmount = _locks[lockID].amount;
            totalWithdrawAmount += singleLockAmount;
            _withdraw(lockID, singleLockAmount);
        }
        // batched token transfer
        SafeERC20.safeTransfer(IERC20(token), recipient, totalWithdrawAmount);
    }

    /**
     * @notice Withdraw from multiple locks in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev Can only be called if unlocked.
     * @param lockIDs The ID of the locks to withdraw from.
     * @param recipient The user to receive the lock's token.
     * @param amounts Array of token amounts to withdraw
     */
    function withdrawInPartMultiple(uint256[] calldata lockIDs, address recipient, uint256[] calldata amounts) external override nonReentrant {
        require (lockIDs.length == amounts.length, "array length mismatch");
        uint256 len = lockIDs.length;
        uint256 totalWithdrawAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs[i];
            require(_isApprovedOrOwner(msg.sender, lockID), "only owner or approved");
            uint256 singleLockAmount = amounts[i];
            require(singleLockAmount <= _locks[lockID].amount, "excess withdraw");
            totalWithdrawAmount += singleLockAmount;
            _withdraw(lockID, singleLockAmount);
        }
        // batched token transfer
        SafeERC20.safeTransfer(IERC20(token), recipient, totalWithdrawAmount);
    }

    /**
     * @notice Emergency withdraw from a lock in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockID The ID of the lock to emergency withdraw from.
     * @param recipient The user to receive the lock's token.
     */
    function emergencyWithdraw(uint256 lockID, address recipient) external override nonReentrant onlyOwnerOrApproved(lockID) {
        uint256 amount = _locks[lockID].amount;
        // Accounting
        uint256 penalty = _emergencyWithdraw(lockID, amount);
        // Token transfers
        SafeERC20.safeTransfer(IERC20(token), revenueRouter, penalty);
        SafeERC20.safeTransfer(IERC20(token), recipient, amount - penalty);
    }

    /**
     * @notice Emergency withdraw from a lock in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockID The ID of the lock to emergency withdraw from.
     * @param recipient The user to receive the lock's token.
     * @param amount The amount of token to withdraw.
     */
    function emergencyWithdrawInPart(uint256 lockID, address recipient, uint256 amount) external override nonReentrant onlyOwnerOrApproved(lockID) {
        require(amount <= _locks[lockID].amount, "excess withdraw");
        uint256 penalty = _emergencyWithdraw(lockID, amount);
        SafeERC20.safeTransfer(IERC20(token), revenueRouter, penalty);
        SafeERC20.safeTransfer(IERC20(token), recipient, amount - penalty);
    }

    /**
     * @notice Emergency withdraw from multiple locks in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockIDs The ID of the locks to withdraw from.
     * @param recipient The user to receive the lock's token.
     */
    function emergencyWithdrawMultiple(uint256[] calldata lockIDs, address recipient) external override nonReentrant {
        uint256 len = lockIDs.length;
        uint256 totalWithdrawAmount = 0;
        uint256 totalPenaltyAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs[i];
            require(_isApprovedOrOwner(msg.sender, lockID), "only owner or approved");
            uint256 singleLockAmount = _locks[lockID].amount;
            uint256 penalty = _emergencyWithdraw(lockID, singleLockAmount);
            totalPenaltyAmount += penalty;
            totalWithdrawAmount += (singleLockAmount - penalty);
        }
        // batched token transfer
        SafeERC20.safeTransfer(IERC20(token), revenueRouter, totalPenaltyAmount);
        SafeERC20.safeTransfer(IERC20(token), recipient, totalWithdrawAmount);
    }

    /**
     * @notice Emergency withdraw from multiple locks in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur a penalty
     * @param lockIDs The ID of the locks to withdraw from.
     * @param amounts Array of token amounts to emergency withdraw
     * @param recipient The user to receive the lock's token.
     */
    function emergencyWithdrawInPartMultiple(uint256[] calldata lockIDs, uint256[] amounts, address recipient) external override nonReentrant {
        uint256 len = lockIDs.length;
        uint256 totalWithdrawAmount = 0;
        uint256 totalPenaltyAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs[i];
            require(_isApprovedOrOwner(msg.sender, lockID), "only owner or approved");
            uint256 singleLockAmount = amounts[i];
            require(singleLockAmount <= _locks[lockID].amount, "excess withdraw");
            uint256 penalty = _emergencyWithdraw(lockID, singleLockAmount);
            totalPenaltyAmount += penalty;
            totalWithdrawAmount += (singleLockAmount - penalty);
        }
        // batched token transfer
        SafeERC20.safeTransfer(IERC20(token), revenueRouter, totalPenaltyAmount);
        SafeERC20.safeTransfer(IERC20(token), recipient, totalWithdrawAmount);
    }

    /***************************************
    INTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Creates a new lock.
     * @param recipient The user that the lock will be minted to.
     * @param amount The amount of token in the lock.
     * @param end The end of the lock.
     * @return lockID The ID of the new lock.
     */
    function _createLock(address recipient, uint256 amount, uint256 end) internal returns (uint256 lockID) {
        // solhint-disable-next-line not-rely-on-time
        require(end >= block.timestamp + MIN_LOCK_DURATION, "Min lock is 6 months");
        // solhint-disable-next-line not-rely-on-time
        require(end <= block.timestamp + MAX_LOCK_DURATION, "Max lock is 4 years");
        lockID = ++totalNumLocks;
        Lock memory newLock = Lock(amount, end);
        // accounting
        _locks[lockID] = newLock;
        _safeMint(recipient, lockID);
        emit LockCreated(lockID);
    }

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID The ID of the lock to update.
     * @param amount The amount of token to deposit.
     */
    function _increaseAmount(uint256 lockID, uint256 amount) internal {
        uint256 newAmount = _locks[lockID].amount + amount;
        _updateLock(lockID, newAmount, _locks[lockID].end);
        emit LockIncreased(lockID, newAmount, amount);
    }


    /**
     * @notice Updates an existing lock.
     * @param lockID The ID of the lock to update.
     * @param amount The amount of token now in the lock.
     * @param end The end of the lock.
     */
    function _updateLock(uint256 lockID, uint256 amount, uint256 end) internal {
        // checks
        Lock memory prevLock = _locks[lockID];
        Lock memory newLock = Lock(amount, end); // end was sanitized before passed in
        // accounting
        _locks[lockID] = newLock;
        address owner = ownerOf(lockID);
        _notify(lockID, owner, owner, prevLock, newLock);
        emit LockUpdated(lockID, amount, newLock.end);
    }

    /**
     * @notice Withdraws from a lock.
     * @param lockID The ID of the lock to withdraw from.
     * @param amount The amount of token to withdraw.
     */
    function _withdraw(uint256 lockID, uint256 amount) internal {
        // solhint-disable-next-line not-rely-on-time
        require(_locks[lockID].end <= block.timestamp, "locked"); // cannot withdraw while locked
        // accounting
        if(amount == _locks[lockID].amount) {
            _burn(lockID);
            delete _locks[lockID];
        }
        else {
            Lock memory oldLock = _locks[lockID];
            Lock memory newLock = Lock(oldLock.amount-amount, oldLock.end);
            _locks[lockID].amount -= amount;
            address owner = ownerOf(lockID);
            _notify(lockID, owner, owner, oldLock, newLock);
        }
        emit Withdrawal(lockID, amount);
    }

    /**
     * @notice Emergency withdraws from a lock.
     * @param lockID The ID of the lock to emergency withdraw from.
     * @param amount The amount of token to emergency withdraw.
     * @return penalty Token amount that will be paid to RevenueRouter as a penalty for emergency withdraw
     */
    function _emergencyWithdraw(uint256 lockID, uint256 amount) internal returns (uint256 penalty) {
        // Make _getEmergencyWithdrawPenaltyPercentage query before lockID is potentially deleted
        uint256 penalty = _getEmergencyWithdrawPenaltyPercentage(lockID);
        penalty = amount * penaltyPercentage / 1e18;
        // accounting
        if(amount == _locks[lockID].amount) {
            _burn(lockID);
            delete _locks[lockID];
        }
        else {
            Lock memory oldLock = _locks[lockID];
            Lock memory newLock = Lock(oldLock.amount-amount, oldLock.end);
            _locks[lockID].amount -= amount;
            address owner = ownerOf(lockID);
            _notify(lockID, owner, owner, oldLock, newLock);
        }
        emit EmergencyWithdrawal(lockID, amount, penalty);
    }


    /**
     * @notice Hook that is called after any token transfer. This includes minting and burning.
     * @param from The user that sends the token, or zero if minting.
     * @param to The zero that receives the token, or zero if burning.
     * @param lockID The ID of the token being transferred.
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 lockID
    ) internal override {
        super._afterTokenTransfer(from, to, lockID);
        Lock memory lock = _locks[lockID];
        // notify listeners
        if(from == address(0x0)) _notify(lockID, from, to, Lock(0, 0), lock); // mint
        else if(to == address(0x0)) _notify(lockID, from, to, lock, Lock(0, 0)); // burn
        else { // transfer
            // solhint-disable-next-line not-rely-on-time
            require(lock.end <= block.timestamp, "locked"); // cannot transfer while locked
            _notify(lockID, from, to, lock, lock);
        }
    }

    /**
     * @notice Notify the listeners of any updates.
     * @dev Called on transfer, mint, burn, and update.
     * Either the owner will change or the lock will change, not both.
     * @param lockID The ID of the lock that was altered.
     * @param oldOwner The old owner of the lock.
     * @param newOwner The new owner of the lock.
     * @param oldLock The old lock data.
     * @param newLock The new lock data.
     */
    function _notify(uint256 lockID, address oldOwner, address newOwner, Lock memory oldLock, Lock memory newLock) internal {
        // register action with listener
        uint256 len = _lockListeners.length();
        for(uint256 i = 0; i < len; i++) {
            IxsListener(_lockListeners.at(i)).registerLockEvent(lockID, oldOwner, newOwner, oldLock, newLock);
        }
    }

    /**
     * @notice Sets registry and related contract addresses.
     * @dev Requires 'uwe' and 'revenueRouter' addresses to be set in the Registry.
     * @param _registry The registry address to set.
     */
    function _setRegistry(address _registry) internal {
        require(_registry != address(0x0), "zero address registry");
        registry = _registry;
        IRegistry reg = IRegistry(_registry);
        // set revenueRouter
        (, address revenueRouterAddr) = reg.tryGet("revenueRouter");
        require(revenueRouterAddr != address(0x0), "zero address revenueRouter");
        revenueRouter = revenueRouterAddr;
        // set token ($UWE)
        (, address uweAddr) = reg.tryGet("uwe");
        require(uweAddr != address(0x0), "zero address uwe");
        token = uweAddr;
        emit RegistrySet(_registry);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener The listener to add.
     */
    function addLockListener(address listener) external override onlyGovernance {
        _lockListeners.add(listener);
        emit LockListenerAdded(listener);
    }

    /**
     * @notice Removes a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener The listener to remove.
     */
    function removeLockListener(address listener) external override onlyGovernance {
        _lockListeners.remove(listener);
        emit LockListenerRemoved(listener);
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
     * @param _registry The address of `Registry` contract.
     */
    function setRegistry(address _registry) external override onlyGovernance {
        _setRegistry(_registry);
    }

    /**
     * @notice Approves [`UnderwritingLockVoting`](./UnderwritingLockVoting) to transfer token from this contract
     * @dev Hacky fix to the issue that [`UnderwritingLockVoting`](./UnderwritingLockVoting) needs token transfer approval, but will be deployed after this contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _votingContract The address of `Registry` contract.
     */
    function setVotingContractApproval(address _votingContract) external override onlyGovernance {
        SafeERC20.safeApprove(IERC20(token), _votingContract, type(uint256).max);
    }
}
