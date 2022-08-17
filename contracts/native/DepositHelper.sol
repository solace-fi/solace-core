// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./../interfaces/native/IUnderwritingPool.sol";
import "./../interfaces/native/IUnderwritingEquity.sol";
import "./../interfaces/native/IUnderwritingLocker.sol";
import "./../interfaces/native/IDepositHelper.sol";


/**
 * @title DepositHelper
 * @author solace.fi
 * @notice The process of depositing into Solace Native requires multiple steps across multiple contracts. This helper contract allows users to deposit with a single transaction.
 */
contract DepositHelper is IDepositHelper, ReentrancyGuard {

    /***************************************
    STATE VARIABLES
    ***************************************/

    address internal _uwp;
    address internal _uwe;
    address internal _locker;

    constructor(address uwp_, address uwe_, address locker_) {
        require(uwp_ != address(0x0), "zero address uwp");
        require(uwe_ != address(0x0), "zero address uwe");
        require(locker_ != address(0x0), "zero address locker");
        _uwp = uwp_;
        _uwe = uwe_;
        _locker = locker_;
        IERC20(uwp_).approve(uwe_, type(uint256).max);
        IERC20(uwe_).approve(locker_, type(uint256).max);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Address of the [underwriting pool](./../../native/UnderwritingPool).
     * @return uwp The underwriting pool.
     */
    function underwritingPool() external view override returns (address uwp) {
        return _uwp;
    }

    /**
     * @notice Address of [underwriting equity](./../../native/UnderwritingEquity).
     * @return uwe The underwriting equity.
     */
    function underwritingEquity() external view override returns (address uwe) {
        return _uwe;
    }

    /**
     * @notice Address of [underwriting locker](./../../native/UnderwritingLocker).
     * @return locker The underwriting locker.
     */
    function underwritingLocker() external view override returns (address locker) {
        return _locker;
    }

    /**
     * @notice Calculates the amount of [`UWE`](./../../native/UnderwritingEquity) minted for an amount of a token deposited.
     * The deposit token may be one of the tokens in [`UWP`](./../../native/UnderwritingPool) or [`UWP`](./../../native/UnderwritingPool) itself.
     * @param depositToken The address of the token to deposit.
     * @param depositAmount The amount of the token to deposit.
     * @return uweAmount The amount of `UWE` that will be minted to the receiver.
     */
    function calculateDeposit(address depositToken, uint256 depositAmount) external view override returns (uint256 uweAmount) {
        address uwp_ = _uwp;
        address uwe_ = _uwe;
        uint256 amount = depositAmount;
        // if deposit token is not uwp nor uwe
        // likely token is member of set
        if(depositToken != uwp_ && depositToken != uwe_) {
            // deposit token into set, receive uwp. reverts if token not in set
            address[] memory tokens = new address[](1);
            uint256[] memory amounts = new uint256[](1);
            tokens[0] = depositToken;
            amounts[0] = depositAmount;
            amount = IUnderwritingPool(uwp_).calculateIssue(tokens, amounts);
        }
        // if deposit token is not uwe
        if(depositToken != uwe_) {
            // deposit uwp into uwe
            amount = IUnderwritingEquity(uwe_).calculateDeposit(amount);
        }
        return amount;
    }

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
    ) external override nonReentrant returns (uint256 lockID) {
        // pull tokens from msg.sender, convert to uwe
        uint256 uweAmount = _tokenToUwe(depositToken, depositAmount);
        // deposit uwe into new lock
        lockID = IUnderwritingLocker(_locker).createLock(msg.sender, uweAmount, lockExpiry);
        return lockID;
    }

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
    ) external override nonReentrant {
        // pull tokens from msg.sender, convert to uwe
        uint256 uweAmount = _tokenToUwe(depositToken, depositAmount);
        // deposit uwe into existing lock
        IUnderwritingLocker(_locker).increaseAmount(lockID, uweAmount);
    }

    /***************************************
    INTERNAL FUNCTIONS
    ***************************************/

    /**
     * @notice Given a deposit token and amount, pulls the token from `msg.sender` and converts it to an amount of `UWE`.
     * @param depositToken Address of the token to deposit.
     * @param depositAmount Amount of the token to deposit.
     * @return uweAmount Amount of `UWE` that was minted.
     */
    function _tokenToUwe(
        address depositToken,
        uint256 depositAmount
    ) internal returns (uint256 uweAmount) {
        address uwp_ = _uwp;
        address uwe_ = _uwe;
        uint256 amount = depositAmount;
        IERC20 tkn = IERC20(depositToken);
        // pull tokens from msg.sender
        SafeERC20.safeTransferFrom(tkn, msg.sender, address(this), amount);
        // if deposit token is not uwp nor uwe
        // likely token is member of set
        if(depositToken != uwp_ && depositToken != uwe_) {
            // deposit token into set, receive uwp. reverts if token not in set
            if(tkn.allowance(address(this), uwp_) < amount) tkn.approve(uwp_, type(uint256).max);
            address[] memory tokens = new address[](1);
            uint256[] memory amounts = new uint256[](1);
            tokens[0] = depositToken;
            amounts[0] = depositAmount;
            amount = IUnderwritingPool(uwp_).issue(tokens, amounts, address(this));
        }
        // if deposit token is not uwe
        if(depositToken != uwe_) {
            // deposit uwp into uwe
            amount = IUnderwritingEquity(uwe_).deposit(amount, address(this));
        }
        return amount;
    }
}
