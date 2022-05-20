// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./../utils/IGovernable.sol";

/**
 * @title Solace Cover Payment Manager - Stables
 * @author solace.fi
 * @notice A teller for [**Solace Cover Points**](./ISCP) that accepts stablecoins for payment.
 *
 * Users can call [`deposit()`](#deposit) or [`depositSigned()`](#depositsigned) to deposit any accepted stablecoin and receive [**SCP**](./ISCP). Cover products may deduct from a user's [**SCP**](./ISCP) balance to pay for coverage. Users can call [`withdraw()`](#withdraw) to redeem their [**SCP**](./ISCP) for stablecoins that they deposited as long as they're refundable and not required by a cover product. Deposited tokens are sent to and withdrawn from the premium pool.
 *
 * This teller assumes that accepted tokens are sufficiently pegged to **USD**, for example **USDC**, **DAI**, and Aave's interest bearing **aDAI** but not Yearn's interest bearing **yDAI**. Users cannot withdraw tokens they did not deposit, in other words this cannot be used to freely exchange **DAI** for **USDC** unless they previously deposited **USDC**. Token balances are automatically converted to the appropriate amount of decimals.
 *
 * [**Governance**](/docs/protocol/governance) can add new tokens and set their flags. Flags determine how a user can use a token to interact with the teller, the most important are `IS_ACCEPTED`, `IS_PERMITTABLE`, and `IS_REFUNDABLE`. Governance can also set the address of the premium pool. The address of [**SCP**](./ISCP) is set during construction and cannot be modified.
 */
interface ICoverPaymentManager is IGovernable {
   
    /***************************************
    STRUCTS
    ***************************************/

    struct TokenInfo {
        address token;
        bool accepted;
        bool permittable;
        bool refundable;
        bool stable;
    }

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a token is deposited.
    event TokenDeposited(address indexed token, address indexed depositor, address indexed receiver, uint256 amount);
    
    /// @notice Emitted when a token is withdrawn.
    event TokenWithdrawn(address indexed depositor, address indexed receiver, uint256 amount);
   
    /// @notice Emitted when registry is set.
    event RegistrySet(address registry);

    /// @notice Emitted when a token is set.
    event TokenInfoSet(address token, bool accepted, bool permittable, bool refundable, bool stable);

    /// @notice Emitted when paused is set.
    event PauseSet(bool paused);


    /***************************************
    DEPOSIT FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits tokens from msg.sender and credits them to recipient.
     * @param token The token to deposit.
     * @param recipient The recipient of Solace Cover Points.
     * @param amount Amount of token to deposit.
    */
    function depositStable(
        address token,
        address recipient,
        uint256 amount
    ) external;

    /**
     * @notice Deposits tokens from depositor using permit.
     * @param token The token to deposit.
     * @param depositor The depositor and recipient of Solace Cover Points.
     * @param amount Amount of token to deposit.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
    */
    function depositSignedStable(
        address token,
        address depositor,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Deposits tokens from msg.sender and credits them to recipient.
     * @param token The token to deposit.
     * @param recipient The recipient of Solace Cover Points.
     * @param amount Amount of token to deposit.
     * @param price The `SOLACE` price in wei(usd).
     * @param priceDeadline The `SOLACE` price in wei(usd).
     * @param signature The `SOLACE` price signature.
    */
    function depositNonStable(
        address token,
        address recipient,
        uint256 amount,
        uint256 price,
        uint256 priceDeadline,
        bytes calldata signature
    ) external;

    /***************************************
    WITHDRAW FUNCTIONS
    ***************************************/

    /**
     * @notice Withdraws some of the user's deposit and sends it to `recipient`.
     * User must have deposited `SOLACE` in at least that amount in the past.
     * User must have sufficient Solace Cover Points to withdraw.
     * Token must be refundable.
     * Premium pool must have the tokens to return.
     * @param amount The amount of to withdraw.
     * @param recipient The receiver of funds.
     * @param price The `SOLACE` price in wei(usd).
     * @param priceDeadline The `SOLACE` price in wei(usd).
     * @param signature The `SOLACE` price signature.
    */
    function withdraw(
        uint256 amount,
        address recipient,
        uint256 price,
        uint256 priceDeadline,
        bytes calldata signature
    ) external;

    /***************************************
    VIEW FUNCTIONS
    ***************************************/
    /**
     * @notice Returns to token information for given token index.
     * @param index The token index.
    */
    function getTokenInfo(
        uint256 index
    ) external view returns (address token, bool accepted, bool permittable, bool refundable, bool stable);

    /**
     * @notice Calculates the refundable `SOLACE` amount.
     * @param depositor The ownder of funds.
     * @param price The `SOLACE` price in wei(usd).
     * @param priceDeadline The `SOLACE` price in wei(usd).
     * @param signature The `SOLACE` price signature.
     * @return solaceAmount
     *
    */
    function getRefundableSOLACEAmount(address depositor, uint256 price, uint256 priceDeadline, bytes calldata signature) external view returns (uint256 solaceAmount);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

   /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _registry The address of `Registry` contract.
    */
    function setRegistry(address _registry) external;

    /**
     * @notice Adds or removes a set of accepted tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens Tokens to set.
    */
    function setTokenInfo(TokenInfo[] calldata tokens) external;

    /**
     * @notice Pauses or unpauses contract..
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _paused True to pause, false to unpause.
    */
    function setPaused(bool _paused) external;
}
