// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IUnderwritingLocker.sol";

/**
 * @title IUnderwritingLockListener
 * @author solace.fi
 * @notice A standard interface for notifying a contract about an action in another contract.
 */
interface IUnderwritingLockListener {
    /**
     * @notice Called when an action is performed on a lock.
     * @dev Called on transfer, mint, burn, and update.
     * Either the owner will change or the lock will change, not both.
     * @param lockID_ The ID of the lock that was altered.
     * @param oldOwner_ The old owner of the lock.
     * @param newOwner_ The new owner of the lock.
     * @param oldLock_ The old lock data.
     * @param newLock_ The new lock data.
     */
    function registerLockEvent(uint256 lockID_, address oldOwner_, address newOwner_, Lock memory oldLock_, Lock memory newLock_) external;
}
