// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./../utils/IGovernable.sol";

/**
 * @title Solace Cover Teller - Stables
 * @author solace.fi
 * @notice A teller for [**Solace Cover Dollars**](./ISCD) that accepts stablecoins for payment.
 *
 * Users can call [`deposit()`](#deposit) or [`depositSigned()`](#depositsigned) to deposit any accepted stablecoin and receive [**SCD**](./ISCD). Cover products may deduct from a user's [**SCD**](./ISCD) balance to pay for coverage. Users can call [`withdraw()`](#withdraw) to redeem their [**SCD**](./ISCD) for stablecoins that they deposited as long as they're refundable and not required by a cover product. Deposited tokens are sent to and withdrawn from the premium pool.
 *
 * This teller assumes that accepted tokens are sufficiently pegged to **USD**, for example **USDC**, **DAI**, and Aave's interest bearing **aDAI** but not Yearn's interest bearing **yDAI**. Users cannot withdraw tokens they did not deposit, in other words this cannot be used to freely exchange **DAI** for **USDC** unless they previously deposited **USDC**. Token balances are automatically converted to the appropriate amount of decimals.
 *
 * [**Governance**](/docs/protocol/governance) can add new tokens and set their flags. Flags determine how a user can use a token to interact with the teller, the most important are `IS_ACCEPTED`, `IS_PERMITTABLE`, and `IS_REFUNDABLE`. Governance can also set the address of the premium pool. The address of [**SCD**](./ISCD) is set during construction and cannot be modified.
 */
interface ISCDTellerStables is IGovernable {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a token is deposited.
    event TokenDeposited(address indexed token, address indexed depositor, address indexed receiver, uint256 amount);
    /// @notice Emitted when a token is withdrawn.
    event TokenWithdrawn(address indexed token, address indexed depositor, address indexed receiver, uint256 amount);
    /// @notice Emitted when token flags are set.
    event TokenFlagsSet(address indexed token, bytes32 flags);
    /// @notice Emitted when the premium pool is set.
    event PremiumPoolSet(address pool);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice [**Solace Cover Dollars**](./ISCD) contract.
    function scd() external view returns (address);

    /// @notice The premum pool.
    function premiumPool() external view returns (address);

    /// @notice The amount of a token that an account is credited for depositing.
    function deposits(address account, address token) external view returns (uint256 amount);

    /// @notice Returns a token's flags.
    function tokenFlags(address token) external view returns (bytes32 flags);

    /// @notice Returns a token's flags.
    function getTokenFlags(address token) external view returns (bool isKnown, bool isAccepted, bool isPermittable, bool isRefundable);

    /// @notice Returns the number of tokens that have been added.
    function tokensLength() external view returns (uint256 length);

    /// @notice Returns the token at `index`.
    function tokenList(uint256 index) external view returns (address token);

    /***************************************
    MONEY FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits tokens from msg.sender and credits them to recipient.
     * @param token The token to deposit.
     * @param recipient The recipient of Solace Cover Dollars.
     * @param amount Amount of token to deposit.
     */
    function deposit(address token, address recipient, uint256 amount) external;

    /**
     * @notice Deposits tokens from depositor using permit.
     * @param token The token to deposit.
     * @param depositor The depositor and recipient of Solace Cover Dollars.
     * @param amount Amount of token to deposit.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function depositSigned(
        address token,
        address depositor,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Withdraws some of the user's deposit and sends it to `recipient`.
     * User must have deposited that token in at least that amount in the past.
     * User must have sufficient Solace Cover Dollars to withdraw.
     * Token must be refundable.
     * Premium pool must have the tokens to return.
     * @param token The token to withdraw.
     * @param amount The amount of to withdraw.
     * @param recipient The receiver of funds.
     */
    function withdraw(
        address token,
        uint256 amount,
        address recipient
    ) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the premium pool.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param pool Address of the new pool.
     */
    function setPremiumPool(address pool) external;

    /**
     * @notice Adds or removes a set of accepted tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens Tokens to set.
     * @param flags Flags to set.
     */
    function setTokenFlags(address[] calldata tokens, bytes32[] calldata flags) external;
}
