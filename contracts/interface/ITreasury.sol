// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title ITreasury
 * @author solace.fi
 * @notice The interface of the war chest of Castle Solace.
 */
interface ITreasury {

    // events
    // Emitted when eth is deposited
    event EthDeposited(uint256 amount);
    // Emitted when a token is deposited
    event TokenDeposited(address token, uint256 amount);
    // Emitted when a token is spent
    event FundsSpent(address token, uint256 amount, address recipient);

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     */
    receive() external payable;

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     */
    fallback () external payable;

    /**
     * @notice Deposits **ETH**.
     */
    function depositEth() external payable;

    /**
     * @notice Deposits an **ERC20** token.
     * @param token The address of the token to deposit.
     * @param amount The amount of the token to deposit.
     */
    function depositToken(address token, uint256 amount) external;

    /**
     * @notice Spends an **ERC20** token or **ETH**.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param token The address of the token to spend.
     * @param amount The amount of the token to spend.
     * @param recipient The address of the token receiver.
     */
    function spend(address token, uint256 amount, address recipient) external;

    /**
     * @notice Manually swaps a token.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param path The path of pools to take.
     * @param amountIn The amount to swap.
     * @param amountOutMinimum The minimum about to receive.
     */
    function swap(bytes memory path, uint256 amountIn, uint256 amountOutMinimum) external;

    /**
     * @notice Sets the premium recipients and their weights.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param recipients The premium recipients, plus an implicit `address(this)` at the end.
     * @param weights The recipient weights.
     */
    function setPremiumRecipients(address payable[] calldata recipients, uint32[] calldata weights) external;

    /**
     * @notice Routes the **premiums** to the `recipients`.
     */
    function routePremiums() external payable;

    /**
     * @notice Wraps some **ETH** into **WETH**.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param amount The amount to wrap.
     */
    function wrap(uint256 amount) external;

    /**
     * @notice Unwraps some **WETH** into **ETH**.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param amount The amount to unwrap.
     */
    function unwrap(uint256 amount) external;

    /**
     * @notice Refunds some **ETH** to the user.
     * Will attempt to send the entire `amount` to the `user`.
     * If there is not enough available at the moment, it is recorded and can be pulled later via [`withdraw()`](#withdraw).
     * Can only be called by active products.
     * @param user The user address to send refund amount.
     * @param amount The amount to send the user.
     */
    function refund(address user, uint256 amount) external;

    /**
     * @notice The amount of **ETH** that a user is owed if any.
     * @param user The user.
     * @return The amount.
     */
    function unpaidRefunds(address user) external view returns (uint256);

    /**
     * @notice Transfers the unpaid refunds to the user.
     */
    function withdraw() external;
}
