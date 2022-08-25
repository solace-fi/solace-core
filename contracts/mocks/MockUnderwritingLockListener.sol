// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;

import "./../interfaces/native/IUnderwritingLockListener.sol";

/**
 * @title MockUnderwritingLockListener
 * @author solace.fi
 * @notice Mock listener for testing UnderwritingLock.
 */
contract MockUnderwritingLockListener is IUnderwritingLockListener {

  event Updated(uint256 blocknum, address caller, uint256 lockID);

  struct LastUpdate {
      uint256 blocknum;
      address caller;
      uint256 lockID;
      address oldOwner;
      address newOwner;
      Lock oldLock;
      Lock newLock;
  }

  LastUpdate public lastUpdate;

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
    function registerLockEvent(uint256 lockID_, address oldOwner_, address newOwner_, Lock memory oldLock_, Lock memory newLock_) external override {
      lastUpdate = LastUpdate({
          blocknum: block.number,
          caller: msg.sender,
          lockID: lockID_,
          oldOwner: oldOwner_,
          newOwner: newOwner_,
          oldLock: oldLock_,
          newLock: newLock_
      });
      emit Updated(block.number, msg.sender, lockID_);
    }
}
