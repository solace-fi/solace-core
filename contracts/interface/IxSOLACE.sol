// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IxsLocker.sol";
import "./IxsListener.sol";

struct Point {
    int128 bias;
    int128 slope;
    uint256 timestamp;
}

interface IxSOLACE is IERC20, IxsListener {

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the amount of **SOLACE** the user has staked.
     * @param account The account to query.
     * @return balance The user's balance.
     */
    function stakedBalance(address account) external view returns (uint256 balance);

    /**
     * @notice Returns the user's **xSOLACE** balance.
     * @param account The account to query.
     * @return balance The user's balance.
     */
    function balanceOf(address account) external view override returns (uint256 balance);

    /**
     * @notice Returns the user's **xSOLACE** balance at some point in the past.
     * @param account The account to query.
     * @param timestamp The time to query.
     * @return balance The user's balance.
     */
    function balanceOfAt(address account, uint256 timestamp) external view returns (uint256 balance);

    /**
     * @notice Returns the **xSOLACE** balance of a lock.
     * @param xsLockID The lock to query.
     * @return balance The locks's balance.
     */
    function balanceOfLock(uint256 xsLockID) external view returns (uint256 balance);

    /**
     * @notice Returns the **xSOLACE** balance of a lock at some point in the past.
     * @param xsLockID The lock to query.
     * @param timestamp The time to query.
     * @return balance The lock's balance.
     */
    function balanceOfLockAt(uint256 xsLockID, uint256 timestamp) external view returns (uint256 balance);

    /**
     * @notice Returns the total supply of **xSOLACE**.
     * @return supply The total supply.
     */
    function totalSupply() external view override returns (uint256 supply);

    /**
     * @notice Returns the total supply of **xSOLACE** at some point in the past.
     * @param timestamp The time to query.
     * @return supply The total supply.
     */
    function totalSupplyAt(uint256 timestamp) external view returns (uint256 supply);

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     *
     */
    function checkpoint(uint256 maxRecord) external;
}
