// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./IFarm.sol";


/**
 * @title IErc20Farm: The base type of Master ERC20 farms.
 * @author solace.fi
 */
interface IErc20Farm is IFarm {

    // Emitted when tokens are deposited onto the farm.
    event Deposit(address indexed _user, uint256 _amount);
    // Emitted when tokens are withdrawn from the farm.
    event Withdraw(address indexed _user, uint256 _amount);

    /**
     * @notice Deposit some tokens.
     * User will receive accumulated rewards if any.
     * @param _amount The deposit amount.
     */
    function deposit(uint256 _amount) external;

    /**
     * @notice Withdraw some ERC20 tokens.
     * User will receive _amount of deposited tokens and accumulated rewards.
     * @param _amount The withdraw amount.
     */
    function withdraw(uint256 _amount) external;
}
