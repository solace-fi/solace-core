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
     * @notice Address of [underwriting lock voting](./../../native/UnderwritingLockVoting).
     * @return voting The underwriting lock voting.
     */
    function underwritingLockVoting() external view returns (address voting);

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
     * @notice Deposits tokens into `UWE`, deposits `UWE` into a new `UWE Lock`, and votes on a gauge.
     * @param depositToken Address of the token to deposit.
     * @param depositAmount Amount of the token to deposit.
     * @param lockExpiry The timestamp the lock will unlock.
     * @param gaugeID The ID of the gauge to vote on.
     * @return lockID The ID of the newly created `UWE Lock`.
     */
    function depositLockAndVote(
        address depositToken,
        uint256 depositAmount,
        uint256 lockExpiry,
        uint256 gaugeID
    ) external returns (uint256 lockID);

    /**
     * @notice Deposits tokens into `UWE` and deposits `UWE` into an existing `UWE Lock`
     * @param depositToken Address of the token to deposit.
     * @param depositAmount Amount of the token to deposit.
     * @param lockID The ID of the `uwe lock` to deposit into.
     */
    function depositToLock(
        address depositToken,
        uint256 depositAmount,
        uint256 lockID
    ) external;
}
