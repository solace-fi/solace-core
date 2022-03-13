// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./../utils/IGovernable.sol";

/**
 * @title Solace Cover Minutes
 * @author solace.fi
 * @notice
 */
interface ISolaceCoverMinutes is IERC20, IERC20Metadata, IGovernable {

    event BalanceManagerStatusSet(address indexed balanceManager, bool status);

    function isBalanceManager(address bm) external view returns (bool status);
    function balanceManagerIndex(address bm) external view returns (uint256 index);
    function balanceManagers(uint256 index) external view returns (address bm);
    function balanceManagersLength() external view returns (uint256 length);

    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function mint(address account, uint256 amount) external;

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function burn(address account, uint256 amount) external;

    /**
     * @dev Sets the balance of an account.
     * @param account The account to change balance.
     * @param amount The new balance of the account.
     */
    function setBalance(address account, uint256 amount) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds or removes a set of balance managers.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param bms List of balance managers to set.
     * @param statuses Statuses to set.
     */
    function setBalanceManagerStatuses(address[] calldata bms, bool[] calldata statuses) external;
}
