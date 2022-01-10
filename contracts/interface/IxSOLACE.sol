// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


interface IxSOLACE is IERC20Metadata {

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice The maximum duration of a lock in seconds.
    function MAX_LOCK_DURATION() external view returns (uint256);
    /// @notice The vote power multiplier at max lock in bps.
    function MAX_LOCK_MULTIPLIER_BPS() external view returns (uint256);
    /// @notice The vote power multiplier when unlocked in bps.
    function UNLOCKED_MULTIPLIER_BPS() external view returns (uint256);

    /// @notice The [**xsLocker**](./xsLocker) contract.
    function xsLocker() external view returns (address);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the **xSOLACE** balance of a lock.
     * @param xsLockID The lock to query.
     * @return balance The locks's balance.
     */
    function balanceOfLock(uint256 xsLockID) external view returns (uint256 balance);

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice In a normal ERC20 contract this would increase the allowance of `spender` over the caller's tokens by `addedValue`.
     * This version reverts because **xSOLACE** is non-transferrable.
     * @param spender The user to increase allowance.
     * @param addedValue The amount to increase allowance.
     * @return success False.
     */
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool success);

    /**
     * @notice In a normal ERC20 contract this would decrease the allowance of `spender` over the caller's tokens by `subtractedValue`.
     * This version reverts because **xSOLACE** is non-transferrable.
     * @param spender The user to decrease allowance.
     * @param subtractedValue The amount to decrease allowance.
     * @return success False.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool success);
}
