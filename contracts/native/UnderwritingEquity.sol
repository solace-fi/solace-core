// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../utils/Governable.sol";
import "../interfaces/native/IUnderwritingEquity.sol";


/**
 * @title UnderwritingEquity
 * @author solace.fi
 * @notice Equity of the [Underwriting Pool](./UnderwritingPool) that can be used in Solace Native.
 *
 * Users can deposit [`UWP`](./UnderwritingPool) via [`deposit()`](#deposit) which mints `UWE`. Users can redeem `UWE` for [`UWP`](./UnderwritingPool) via [`withdraw()`](#withdraw). Note that deposits must be made via [`deposit()`](#deposit). Simply transferring [`UWP`](./UnderwritingPool) to this contract will not mint `UWE`.
 *
 * Solace may charge a protocol fee as a fraction of the mint amount [`issueFee()`](#issuefee).
 *
 * Solace may lend some of the underlying [`UWP`](./UnderwritingPool) to a lending module and borrow stables against it to pay claims via [`lend()`](#lend).
 *
 * [Governance](/docs/protocol/governance) can pause and unpause [`deposit()`](#deposit), [`withdraw()`](#withdraw), and [`lend()`](#lend).
 */
contract UnderwritingEquity is IUnderwritingEquity, ERC20Permit, ReentrancyGuard, Governable {

    /***************************************
    STATE VARIABLES
    ***************************************/

    // underwriting pool token
    address internal _uwp;

    // issue fee in 18 decimals. default zero
    uint256 internal _issueFee;
    // receiver of issue fee
    address internal _issueFeeTo;
    // true if deposit is paused. default false
    bool internal _depositIsPaused;
    // true if withdraw is paused. default false
    bool internal _withdrawIsPaused;
    // true if lend is paused. default false
    bool internal _lendIsPaused;

    /**
     * @notice Constructs the `UnderwritingEquity` contract.
     * @param governance_ The address of the governor.
     */
    // solhint-disable-next-line no-empty-blocks
    constructor (address governance_, address uwp_) ERC20("Solace Native Underwriting Equity", "UWE") ERC20Permit("Solace Native Underwriting Equity") Governable(governance_) {
        require(uwp_ != address(0x0), "zero address uwp");
        _uwp = uwp_;
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Address of the [`underwriting pool`](./UnderwritingPool).
     * @return uwp The underwriting pool.
     */
    function underwritingPool() external view override returns (address uwp) {
        return _uwp;
    }

    /**
     * @notice The fraction of `UWE` that are charged as a protocol fee on mint.
     * @return fee The fee as a fraction with 18 decimals.
     */
    function issueFee() external view override returns (uint256 fee) {
        return _issueFee;
    }

    /**
     * @notice The receiver of issue fees.
     * @return receiver The receiver of the fee.
     */
    function issueFeeTo() external view override returns (address receiver) {
        return _issueFeeTo;
    }

    /**
     * @notice Returns true if functionality of the contract is paused.
     * @return depositIsPaused Returns true if depositing is paused.
     * @return withdrawIsPaused Returns true if withdrawing is paused.
     * @return lendIsPaused Returns true if lending is paused.
     */
    function isPaused() external view override returns (bool depositIsPaused, bool withdrawIsPaused, bool lendIsPaused) {
        return (_depositIsPaused, _withdrawIsPaused, _lendIsPaused);
    }

    /**
     * @notice Calculates the amount of `UWE` minted for an amount of [`UWP`](./UnderwritingPool) deposited.
     * @param uwpAmount The amount of [`UWP`](./UnderwritingPool) to deposit.
     * @return uweAmount The amount of `UWE` that will be minted to the receiver.
     */
    function calculateDeposit(uint256 uwpAmount) external view override returns (uint256 uweAmount) {
        // get state
        uint256 ts = totalSupply();
        IERC20 uwp = IERC20(_uwp);
        uint256 bal = uwp.balanceOf(address(this));
        // calculate uwe amount
        uweAmount = ((ts == 0 || bal == 0)
          ? uwpAmount
          : ((uwpAmount * ts) / bal) );
        uint256 fee = uweAmount * _issueFee / 1 ether;
        if(fee > 0) {
            uweAmount -= fee;
        }
        return uweAmount;
    }

    /**
     * @notice Calculates the amount of [`UWP`](./UnderwritingPool) returned for an amount of `UWE` withdrawn.
     * @param uweAmount The amount of `UWE` to redeem.
     * @return uwpAmount The amount of [`UWP`](./UnderwritingPool) that will be returned to the receiver.
     */
    function calculateWithdraw(uint256 uweAmount) external view override returns (uint256 uwpAmount) {
        // get state
        uint256 ts = totalSupply();
        require(uweAmount <= ts, "withdraw amount exceeds supply");
        IERC20 uwp = IERC20(_uwp);
        uint256 bal = uwp.balanceOf(address(this));
        // calculate uwp amount
        uwpAmount = ((ts == 0)
            ? 0
            : ((uweAmount * bal) / ts) );
        return uwpAmount;
    }

    /***************************************
    MODIFIER FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits [`UWP`](./UnderwritingPool) into `UWE`.
     * @param uwpAmount The amount of [`UWP`](./UnderwritingPool) to deposit.
     * @param receiver The address to send newly minted `UWE` to.
     * @return uweAmount The amount of `UWE` minted.
     */
    function deposit(uint256 uwpAmount, address receiver) external override nonReentrant returns (uint256 uweAmount) {
        require(!_depositIsPaused, "deposit is paused");
        // get state
        uint256 ts = totalSupply();
        IERC20 uwp = IERC20(_uwp);
        uint256 bal = uwp.balanceOf(address(this));
        // transfer in uwp
        SafeERC20.safeTransferFrom(uwp, msg.sender, address(this), uwpAmount);
        // calculate uwe amount
        uweAmount = ((ts == 0 || bal == 0)
          ? uwpAmount
          : ((uwpAmount * ts) / bal) );
        uint256 fee = uweAmount * _issueFee / 1 ether;
        if(fee > 0) {
            _mint(_issueFeeTo, fee);
            uweAmount -= fee;
        }
        // mint uwe
        _mint(receiver, uweAmount);
        emit DepositMade(msg.sender, uwpAmount, uweAmount);
        return uweAmount;
    }

    /**
     * @notice Redeems some `UWE` for [`UWP`](./UnderwritingPool).
     * @param uweAmount The amount of `UWE` to burn.
     * @param receiver The address to receive [`UWP`](./UnderwritingPool).
     * @return uwpAmount The amount of [`UWP`](./UnderwritingPool) received.
     */
    function withdraw(uint256 uweAmount, address receiver) external override nonReentrant returns (uint256 uwpAmount) {
        require(!_withdrawIsPaused, "withdraw is paused");
        // get state
        uint256 ts = totalSupply();
        IERC20 uwp = IERC20(_uwp);
        uint256 bal = uwp.balanceOf(address(this));
        // calculate uwp amount
        uwpAmount = ((ts == 0)
            ? 0
            : ((uweAmount * bal) / ts) );
        // burn uwe
        _burn(msg.sender, uweAmount);
        // transfer out uwp
        SafeERC20.safeTransfer(IERC20(_uwp), receiver, uwpAmount);
        emit WithdrawMade(msg.sender, uwpAmount, uweAmount);
        return uwpAmount;
    }

    /**
     * @notice Burns some `UWE` from `msg.sender`.
     * @param uweAmount The amount of `UWE` to burn.
     */
    function burn(uint256 uweAmount) external override {
        _burn(msg.sender, uweAmount);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Rescues misplaced tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of tokens to rescue.
     * @param receiver The receiver of the tokens.
     */
    function rescueTokens(address[] memory tokens, address receiver) external override onlyGovernance {
        address uwp_ = _uwp;
        // for each requested token
        uint256 len = tokens.length;
        for(uint256 index = 0; index < len; index++) {
            address token = tokens[index];
            // cannot rescue valued underlying tokens
            require(token != uwp_, "cannot rescue uwp");
            // send balance to receiver
            IERC20 tkn = IERC20(token);
            uint256 balance = tkn.balanceOf(address(this));
            SafeERC20.safeTransfer(tkn, receiver, balance);
        }
    }

    /**
     * @notice Lends out [`UWP`](./UnderwritingPool) to pay claims.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param uwpAmount The amount of [`UWP`](./UnderwritingPool) to lend.
     * @param receiver The receiver of [`UWP`](./UnderwritingPool).
     */
    function lend(uint256 uwpAmount, address receiver) external override onlyGovernance {
        require(!_lendIsPaused, "lend is paused");
        SafeERC20.safeTransfer(IERC20(_uwp), receiver, uwpAmount);
        emit UwpLoaned(uwpAmount, receiver);
    }

    /**
     * @notice Sets the issue fee and receiver.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param fee The fee as a fraction with 18 decimals.
     * @param receiver The receiver of the fee.
     */
    function setIssueFee(uint256 fee, address receiver) external override onlyGovernance {
        require(fee <= 1 ether, "invalid issue fee");
        require(fee == 0 || receiver != address(0x0), "invalid issue fee to");
        _issueFee = fee;
        _issueFeeTo = receiver;
        emit IssueFeeSet(fee, receiver);
    }

    /**
     * @notice Pauses or unpauses contract functionality.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param depositIsPaused True to pause deposit, false to unpause.
     * @param withdrawIsPaused True to pause withdraw, false to unpause.
     * @param lendIsPaused True to pause lend, false to unpause.
     */
    function setPause(bool depositIsPaused, bool withdrawIsPaused, bool lendIsPaused) external override onlyGovernance {
        _depositIsPaused = depositIsPaused;
        _withdrawIsPaused = withdrawIsPaused;
        _lendIsPaused = lendIsPaused;
        emit PauseSet(depositIsPaused, withdrawIsPaused, lendIsPaused);
    }

    /**
     * @notice Upgrades the [`UWP`](./UnderwritingPool) contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param uwp_ The address of the new [`UWP`](./UnderwritingPool).
     */
    function setUwp(address uwp_) external override onlyGovernance {
        require(uwp_ != address(0x0), "zero address uwp");
        _uwp = uwp_;
        emit UwpSet(uwp_);
    }
}
