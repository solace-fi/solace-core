// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title IDepositHelper
 * @author solace.fi
 * @notice The process of depositing into Solace Native requires multiple steps across multiple contracts. This helper contract allows users to deposit with a single transaction.
 */
interface IDepositHelper {

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Address of the [underwriting pool](./../../native/UnderwritingPool).
     * @return uwp The underwriting pool.
     */
    function underwritingPool() external view returns (address uwp);

    /**
     * @notice Address of [underwriting equity](./../../native/UnderwritingEquity).
     * @return uwe The underwriting equity.
     */
    function underwritingEquity() external view returns (address uwe);

    /**
     * @notice Address of [underwriting locker](./../../native/UnderwritingLocker).
     * @return locker The underwriting locker.
     */
    function underwritingLocker() external view returns (address locker);

    /**
     * @notice Calculates the amount of [`UWE`](./../../native/UnderwritingEquity) minted for an amount of a token deposited.
     * The deposit token may be one of the tokens in [`UWP`](./../../native/UnderwritingPool) or [`UWP`](./../../native/UnderwritingPool) itself.
     * @param depositToken The address of the token to deposit.
     * @param depositAmount The amount of the token to deposit.
     * @return uweAmount The amount of `UWE` that will be minted to the receiver.
     */
    function calculateDeposit(address depositToken, uint256 depositAmount) external view returns (uint256 uweAmount);

    /***************************************
    DEPOSIT FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits tokens into [`UWE`](./../../native/UnderwritingEquity) and deposits [`UWE`](./../../native/UnderwritingEquity) into a new [`UWE Lock`](./../../native/UnderwritingLocker).
     * @param depositToken Address of the token to deposit.
     * @param depositAmount Amount of the token to deposit.
     * @param lockExpiry The timestamp the lock will unlock.
     * @return lockID The ID of the newly created `UWE Lock`.
     */
    function depositAndLock(
        address depositToken,
        uint256 depositAmount,
        uint256 lockExpiry
    ) external returns (uint256 lockID);

    /**
     * @notice Deposits tokens into [`UWE`](./../../native/UnderwritingEquity) and deposits [`UWE`](./../../native/UnderwritingEquity) into an existing [`UWE Lock`](./../../native/UnderwritingLocker)
     * @param depositToken Address of the token to deposit.
     * @param depositAmount Amount of the token to deposit.
     * @param lockID The ID of the [`UWE Lock`](./../../native/UnderwritingLocker) to deposit into.
     */
    function depositToLock(
        address depositToken,
        uint256 depositAmount,
        uint256 lockID
    ) external;
}
