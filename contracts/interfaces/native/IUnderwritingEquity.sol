// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


/**
 * @title IUnderwritingEquity
 * @author solace.fi
 * @notice
 */
interface IUnderwritingEquity is IERC20Metadata {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a deposit is made.
    event DepositMade(address user, uint256 uwpAmount, uint256 uweAmount);
    /// @notice Emitted when a withdraw is made.
    event WithdrawMade(address user, uint256 uwpAmount, uint256 uweAmount);
    /// @notice Emitted when uwp is loaned.
    event UwpLoaned(uint256 uwpAmount, address receiver);
    /// @notice Emitted when issue fee is set.
    event IssueFeeSet(uint256 fee, address receiver);
    /// @notice Emitted when pause is set.
    event PauseSet(bool depositIsPaused, bool withdrawIsPaused, bool lendIsPaused);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Address of the [underwriting pool](./../../native/UnderwritingPool).
     * @return uwp The underwriting pool.
     */
    function underwritingPool() external view returns (address uwp);

    /**
     * @notice The fraction of `UWE` that are charged as a protocol fee on mint.
     * @return fee The fee as a fraction with 18 decimals.
     */
    function issueFee() external view returns (uint256 fee);

    /**
     * @notice The receiver of issue fees.
     * @return receiver The receiver of the fee.
     */
    function issueFeeTo() external view returns (address receiver);

    /**
     * @notice Returns true if functionality of the contract is paused.
     * @return depositIsPaused Returns true if depositing is paused.
     * @return withdrawIsPaused Returns true if withdrawing is paused.
     * @return lendIsPaused Returns true if lending is paused.
     */
    function isPaused() external view returns (bool depositIsPaused, bool withdrawIsPaused, bool lendIsPaused);

    /**
     * @notice Calculates the amount of `UWE` minted for an amount of [`UWP`](./../../native/UnderwritingPool) deposited.
     * @param uwpAmount The amount of [`UWP`](./../../native/UnderwritingPool) to deposit.
     * @return uweAmount The amount of `UWE` that will be minted to the receiver.
     */
    function calculateDeposit(uint256 uwpAmount) external view returns (uint256 uweAmount);

    /**
     * @notice Calculates the amount of [`UWP`](./../../native/UnderwritingPool) returned for an amount of `UWE` withdrawn.
     * @param uweAmount The amount of `UWE` to redeem.
     * @return uwpAmount The amount of [`UWP`](./../../native/UnderwritingPool) that will be returned to the receiver.
     */
    function calculateWithdraw(uint256 uweAmount) external view returns (uint256 uwpAmount);

    /***************************************
    MODIFIER FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits [`UWP`](./../../native/UnderwritingPool) into `UWE`.
     * @param uwpAmount The amount of [`UWP`](./../../native/UnderwritingPool) to deposit.
     * @param receiver The address to send newly minted `UWE` to.
     * @return uweAmount The amount of `UWE` minted.
     */
    function deposit(uint256 uwpAmount, address receiver) external returns (uint256 uweAmount);

    /**
     * @notice Redeems some `UWE` for [`UWP`](./../../native/UnderwritingPool).
     * @param uweAmount The amount of `UWE` to burn.
     * @param receiver The address to receive [`UWP`](./../../native/UnderwritingPool).
     * @return uwpAmount The amount of [`UWP`](./../../native/UnderwritingPool) received.
     */
    function withdraw(uint256 uweAmount, address receiver) external returns (uint256 uwpAmount);

    /**
     * @notice Burns some `UWE` from `msg.sender`.
     * @param uweAmount The amount of `UWE` to burn.
     */
    function burn(uint256 uweAmount) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Rescues misplaced tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of tokens to rescue.
     * @param receiver The receiver of the tokens.
     */
    function rescueTokens(address[] memory tokens, address receiver) external;

    /**
     * @notice Lends out [`UWP`](./../../native/UnderwritingPool) to pay claims.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param uwpAmount The amount of [`UWP`](./../../native/UnderwritingPool) to lend.
     * @param receiver The receiver of [`UWP`](./../../native/UnderwritingPool).
     */
    function lend(uint256 uwpAmount, address receiver) external;

    /**
     * @notice Sets the issue fee and receiver.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param fee The fee as a fraction with 18 decimals.
     * @param receiver The receiver of the fee.
     */
    function setIssueFee(uint256 fee, address receiver) external;

    /**
     * @notice Pauses or unpauses contract functionality.
     * @param depositIsPaused True to pause deposit, false to unpause.
     * @param withdrawIsPaused True to pause withdraw, false to unpause.
     * @param lendIsPaused True to pause lend, false to unpause.
     */
    function setPause(bool depositIsPaused, bool withdrawIsPaused, bool lendIsPaused) external;
}
