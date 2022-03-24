// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./ISCDRetainer.sol";
import "./../utils/IGovernable.sol";

/**
 * @title Solace Cover Dollars (SCD)
 * @author solace.fi
 * @notice **SCD** is a stablecoin pegged to **USD**. It is used to pay for coverage.
 *
 * **SCD** conforms to the ERC20 standard but cannot be minted or transferred by most users. Balances can only be modified by "SCD movers" such as SCD Tellers and coverage contracts. In some cases the user may be able to exchange **SCD** for the payment token, if not the balance will be marked non refundable. Some coverage contracts may have a minimum balance required to prevent abuse - these are called "SCD retainers" and may block [`withdraw()`](#withdraw).
 *
 * [**Governance**](/docs/protocol/governance) can add and remove SCD movers and retainers. SCD movers can modify token balances via [`mint()`](#mint), [`burn()`](#burn), [`transfer()`](#transfer), [`transferFrom()`](#transferfrom), and [`withdraw()`](#withdraw).
 */
interface ISCD is IERC20, IERC20Metadata, ISCDRetainer, IGovernable {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when the status of an SCD mover is set.
    event ScdMoverStatusSet(address indexed scdMover, bool status);
    /// @notice Emitted when the status of an SCD retainer is set.
    event ScdRetainerStatusSet(address indexed scdRetainer, bool status);

    /***************************************
    ERC20 FUNCTIONS
    ***************************************/

    /**
     * @notice Creates `amount` tokens and assigns them to `account`, increasing the total supply.
     * Requirements:
     * - `account` cannot be the zero address.
     */
    function mint(address account, uint256 amount, bool isRefundable) external;

    /**
     * @notice Destroys `amount` tokens from `account`, reducing the total supply.
     * Requirements:
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function burn(address account, uint256 amount) external;

    /**
     * @notice Withdraws funds from an account.
     * @dev Same as burn() except uses refundable amount and checks min scd required.
     * The user must have sufficient refundable balance.
     * @param account The account to withdraw from.
     * @param amount The amount to withdraw.
     */
    function withdraw(address account, uint256 amount) external;

    /***************************************
    MOVER AND RETAINER FUNCTIONS
    ***************************************/

    /// @notice Returns true if `account` has permissions to move balances.
    function isScdMover(address account) external view returns (bool status);
    /// @notice Returns the number of scd movers.
    function scdMoverLength() external view returns (uint256 length);
    /// @notice Returns the scd mover at `index`.
    function scdMoverList(uint256 index) external view returns (address scdMover);

    /// @notice Returns true if `account` may need to retain scd on behalf of a user.
    function isScdRetainer(address account) external view returns (bool status);
    /// @notice Returns the number of scd retainers.
    function scdRetainerLength() external view returns (uint256 length);
    /// @notice Returns the scd retainer at `index`.
    function scdRetainerList(uint256 index) external view returns (address scdRetainer);

    /// @notice The amount of tokens owned by account that cannot be withdrawn.
    function balanceOfNonRefundable(address account) external view returns (uint256);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds or removes a set of scd movers.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param scdMovers List of scd movers to set.
     * @param statuses Statuses to set.
     */
    function setScdMoverStatuses(address[] calldata scdMovers, bool[] calldata statuses) external;

    /**
     * @notice Adds or removes a set of scd retainers.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param scdRetainers List of scd retainers to set.
     * @param statuses Statuses to set.
     */
    function setScdRetainerStatuses(address[] calldata scdRetainers, bool[] calldata statuses) external;
}
