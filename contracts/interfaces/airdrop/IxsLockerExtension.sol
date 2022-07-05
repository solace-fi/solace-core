// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title xsLockerExtension
 * @author solace.fi
 * @notice A utility contract to distribute [**SOLACE**](./../../SOLACE) to multiple [**xslocks**](./../../staking/xsLocker).
 */
interface IxsLockerExtension {

    /**
     * @notice Deposit [**SOLACE**](./../../SOLACE) to increase the value of multiple existing locks.
     * @dev [**SOLACE**](./../../SOLACE) is transferred from msg.sender, assumes its already approved.
     * @param xsLockIDs Array of lock IDs to update.
     * @param amounts Array of [**SOLACE**](./../../SOLACE) amounts to deposit.
     */
    function increaseAmountMultiple(uint256[] calldata xsLockIDs, uint256[] calldata amounts) external;
}
