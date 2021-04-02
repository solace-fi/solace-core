// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;


/**
 * @title ITreasury
 * @author solace.fi
 * @notice The interface of the war chest of Castle Solace.
 */
interface ITreasury {

    /**
     * @notice Deposits some ether.
     */
    function depositEth() external payable;

    /**
     * @notice Deposit some ERC20 token.
     * @param _token The address of the token to deposit.
     * @param _amount The amount of the token to deposit.
     */
    function depositToken(address _token, uint256 _amount) external;

    /**
     * @notice Spends some tokens.
     * Can only be called by the current governor.
     * @param _token The address of the token to spend.
     * @param _amount The amount of the token to spend.
     * @param _recipient The address of the token receiver.
     */
    function spend(address _token, uint256 _amount, address _recipient) external;

    /**
     * @notice Swaps a token using a predefined path.
     * Can only be called by the current governor.
     * @dev Swaps the entire balance in case some tokens were unknowingly received.
     */
    function swap(address _token) external;
}
