// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "./interface/IxsLocker.sol";
import "./interface/IxSOLACE.sol";


/**
 * @title xSolace Token (xSOLACE)
 * @author solace.fi
 * @notice V2 of the [**SOLACE**](./SOLACE) staking contract.
 */
contract xSOLACE is IxSOLACE {

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice The maximum duration of a lock in seconds.
    uint256 public constant override MAX_LOCK_DURATION = 4 * 365 days; // 4 years
    /// @notice The vote power multiplier at max lock in bps.
    uint256 public constant override MAX_LOCK_MULTIPLIER_BPS = 40000;  // 4X
    /// @notice The vote power multiplier when unlocked in bps.
    uint256 public constant override UNLOCK_MULTIPLIER_BPS = 10000; // 1X
    // 1 bps = 1/10000
    uint256 internal constant MAX_BPS = 10000;

    /// @notice The [**xsLocker**](./xsLocker) contract.
    address public override xsLocker;

    /**
     * @notice Constructs the **xSOLACE** contract.
     * @param xsLocker_ The [**xsLocker**](./xsLocker) contract.
     */
    constructor(address xsLocker_) {
        require(xsLocker_ != address(0x0), "zero address xslocker");
        xsLocker = xsLocker_;
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the user's **xSOLACE** balance.
     * @param account The account to query.
     * @return balance The user's balance.
     */
    function balanceOf(address account) external view override returns (uint256 balance) {
        IERC721Enumerable locker = IERC721Enumerable(xsLocker);
        uint256 numOfLocks = locker.balanceOf(account);
        balance = 0;
        for (uint256 i = 0; i < numOfLocks; i++) {
            uint256 xsLockID = locker.tokenOfOwnerByIndex(account, i);
            balance += balanceOfLock(xsLockID);
        }
        return balance;
    }

    /**
     * @notice Returns the **xSOLACE** balance of a lock.
     * @param xsLockID The lock to query.
     * @return balance The locks's balance.
     */
    function balanceOfLock(uint256 xsLockID) public view override returns (uint256 balance) {
        IxsLocker locker = IxsLocker(xsLocker);
        Lock memory lock = locker.locks(xsLockID);
        uint256 base = lock.amount * UNLOCK_MULTIPLIER_BPS / MAX_BPS;
        uint256 bonus = (lock.end <= block.timestamp)
            ? 0 // unlocked
            : lock.amount * (block.timestamp - lock.end) * (MAX_LOCK_MULTIPLIER_BPS - UNLOCK_MULTIPLIER_BPS) / (MAX_LOCK_DURATION * MAX_BPS); // locked
        return base + bonus;
    }

    /**
     * @notice Returns the total supply of **xSOLACE**.
     * @return supply The total supply.
     */
    function totalSupply() external view override returns (uint256 supply) {
        IERC721Enumerable locker = IERC721Enumerable(xsLocker);
        uint256 numOfLocks = locker.totalSupply();
        supply = 0;
        for (uint256 i = 0; i < numOfLocks; i++) {
            uint256 xsLockID = locker.tokenByIndex(i);
            supply += balanceOfLock(xsLockID);
        }
        return supply;
    }

    /**
     * @notice Returns the name of the token.
     */
    function name() external view override returns (string memory) {
        return "xsolace";
    }

    /**
     * @notice Returns the symbol of the token.
     */
    function symbol() external view override returns (string memory) {
        return "xSOLACE";
    }

    /**
     * @notice Returns the number of decimals used to get its user representation.
     */
    function decimals() external view override returns (uint8) {
        return 18;
    }

    /**
     * @notice Returns the remaining number of tokens that `spender` will be allowed to spend on behalf of `owner` through `transferFrom`.
     */
    function allowance(address owner, address spender) external view override returns (uint256) {
        return 0;
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice In a normal ERC20 contract this would move `amount` tokens from the caller's account to `recipient`.
     * This version reverts because **xSOLACE** is non-transferrable.
     * @param recipient The user to send tokens to.
     * @param amount The amount of tokens to send.
     * @return success False.
     */
    function transfer(address recipient, uint256 amount) external override returns (bool success) {
        revert("xSOLACE transfer not allowed");
        return false;
    }

    /**
     * @notice In a normal ERC20 contract this would move `amount` tokens from `sender` to `recipient` using allowance.
     * This version reverts because **xSOLACE** is non-transferrable.
     * @param recipient The user to send tokens to.
     * @param amount The amount of tokens to send.
     * @return success False.
     */
    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool success) {
        revert("xSOLACE transfer not allowed");
        return false;
    }

    /**
     * @notice In a normal ERC20 contract this would set `amount` as the allowance of `spender` over the caller's tokens.
     * This version reverts because **xSOLACE** is non-transferrable.
     * @param spender The user to assign allowance.
     * @param amount The amount of tokens to send.
     * @return success False.
     */
    function approve(address spender, uint256 amount) external override returns (bool success) {
        revert("xSOLACE transfer not allowed");
        return false;
    }

    /**
     * @notice In a normal ERC20 contract this would increase the allowance of `spender` over the caller's tokens by `addedValue`.
     * This version reverts because **xSOLACE** is non-transferrable.
     * @param spender The user to increase allowance.
     * @param addedValue The amount to increase allowance.
     * @return success False.
     */
    function increaseAllowance(address spender, uint256 addedValue) external override returns (bool success) {
        revert("xSOLACE transfer not allowed");
        return false;
    }

    /**
     * @notice In a normal ERC20 contract this would decrease the allowance of `spender` over the caller's tokens by `subtractedValue`.
     * This version reverts because **xSOLACE** is non-transferrable.
     * @param spender The user to decrease allowance.
     * @param subtractedValue The amount to decrease allowance.
     * @return success False.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) external override returns (bool success) {
        revert("xSOLACE transfer not allowed");
        return false;
    }
}
