// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./IFarm.sol";


/**
 * @title ICpFarm: The base type of Master Capital Provider farms.
 * @author solace.fi
 */
interface ICpFarm is IFarm {

    // Emitted when CP tokens are deposited onto the farm.
    event DepositCp(address indexed _user, uint256 _amount);
    // Emitted when ETH is deposited onto the farm.
    event DepositEth(address indexed _user, uint256 _amount);
    // Emitted when CP tokens are withdrawn from the farm.
    event WithdrawCp(address indexed _user, uint256 _amount);
    // Emitted when ETH is withdrawn from the farm.
    event WithdrawEth(address indexed _user, uint256 _amount);

    /**
     * Receive function. Deposits eth.
     */
    receive () external payable;

    /**
     * Fallback function. Deposits eth.
     */
    fallback () external payable;

    /**
     * @notice Deposit some CP tokens.
     * User will receive accumulated rewards if any.
     * @param _amount The deposit amount.
     */
    function depositCp(uint256 _amount) external;

    /**
     * @notice Deposit some ETH.
     * User will receive accumulated rewards if any.
     */
    function depositEth() external payable;

    /**
     * @notice Withdraw some CP tokens.
     * User will receive _amount of deposited tokens and accumulated rewards.
     * @param _amount The withdraw amount.
     */
    function withdrawCp(uint256 _amount) external;

    /**
     * @notice Withdraw some Eth.
     * `_amount` is denominated in CP tokens, which are converted to eth then returned to the user.
     * User will receive _amount of deposited tokens converted to eth and accumulated rewards.
     * @param _amount The withdraw amount.
     * @param _maxLoss The acceptable amount of loss.
     */
    function withdrawEth(uint256 _amount, uint256 _maxLoss) external;
}
