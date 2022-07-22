// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./../utils/ERC721Enhanced.sol";
import "./../utils/Governable.sol";
import "./../interfaces/native/IUnderwriterLockerListener.sol";
import "./../interfaces/native/IUnderwriterLocker.sol";


// Should I add new events? LockIncreased

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
// solhint-disable-next-line contract-name-camelcase
contract UnderwritingLocker is IUnderwritingLocker, ERC721Enhanced, ReentrancyGuard, Governable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Token locked in the underwriting lock.
    address public override token;

    /// @notice The minimum time (six months) into the future that a lock can expire.
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
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param token _ Token to be locked
     */
    constructor(address governance_, address token_)
        ERC721Enhanced("Underwriting Lock", "UnderwritingLock")
        Governable(governance_)
    {
        require(token_ != address(0x0), "zero address token");
        token = token_;
    }

    /***************************************
    VIEW FUNCTIONS
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
     * @notice Returns the token amount that the user has staked.
     * @param account The account to query.
     * @return balance The user's balance.
     */
    function stakedBalance(address account) external view override returns (uint256 balance) {
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

    /***************************************
    MUTATOR FUNCTIONS
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
        // pull solace
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
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        // accounting
        return _createLock(msg.sender, amount, end);
    }

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @param lockID The ID of the lock to update.
     * @param amount The amount of token to deposit.
     */
    function increaseAmount(uint256 lockID, uint256 amount) external override nonReentrant tokenMustExist(lockID) {
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        // accounting
        uint256 newAmount = _locks[lockID].amount + amount;
        _updateLock(lockID, newAmount, _locks[lockID].end);
    }


    /**
     * @notice Deposit token to increase the value of multiple existing locks.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @param xsLockIDs Array of lock IDs to update.
     * @param amounts Array of token amounts to deposit.
     */
    function increaseAmountMultiple(uint256[] calldata xsLockIDs, uint256[] calldata amounts) external override nonReentrant {
        require (xsLockIDs.length == amounts.length, "array length mismatch");
        uint256 refundAmount = 0;
        for (uint256 i = 0; i < xsLockIDs.length; i++) {
            // Guard against revert for non-existing lockIDs
            if ( _exists(xsLockIDs[i]) ) {
                increaseAmount(xsLockIDs[i], amounts[i]);
            } else {
                refundAmount += amounts[i];
            }
        }
        SafeERC20.safeTransfer(IERC20(solace), msg.sender, refundAmount);
    }

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender using ERC20Permit.
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
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
        // accounting
        uint256 newAmount = _locks[lockID].amount + amount;
        _updateLock(lockID, newAmount, _locks[lockID].end);
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
        // transfer solace
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
        // transfer solace
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
        uint256 amount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs[i];
            require(_isApprovedOrOwner(msg.sender, lockID), "only owner or approved");
            uint256 amount_ = _locks[lockID].amount;
            amount += amount_;
            _withdraw(lockID, amount_);
        }
        // transfer solace
        SafeERC20.safeTransfer(IERC20(token), recipient, amount);
    }

    /***************************************
    INTERNAL FUNCTIONS
    ***************************************/

    /**
     * @notice Creates a new lock.
     * @param recipient The user that the lock will be minted to.
     * @param amount The amount of token in the lock.
     * @param end The end of the lock.
     * @param lockID The ID of the new lock.
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
        emit Withdrawl(lockID, amount);
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
}
