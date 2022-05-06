// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./../utils/IGovernable.sol";

/**
 * @title Solace Cover Teller - SOLACE
 * @author solace.fi
 * @notice A teller for [**Solace Cover Points**](./ISCP) that accepts `SOLACE` for payment.
*/
interface ISCPTellerSOLACE is IGovernable {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a token is deposited.
    event SolaceDeposited(address indexed depositor, address indexed receiver, uint256 amount);

    /// @notice Emitted when a token is withdrawn.
    event SolaceWithdrawn(address indexed depositor, address indexed receiver, uint256 amount);
   
    /// @notice Emitted when the premium pool is set.
    event PremiumPoolSet(address pool);

    /// @notice Emitted when a price signer is added.
    event PriceSignerAdded(address signer);

    /// @notice Emitted when a price signer is removed.
    event PriceSignerRemoved(address signer);

    /// @notice Emitted when registry is set.
    event RegistrySet(address registry);

    /***************************************
    MUTUATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits tokens from msg.sender and credits them to recipient.
     * @param recipient The recipient of Solace Cover Points.
     * @param amount Amount of token to deposit.
     * @param price The `SOLACE` price in wei(usd).
     * @param signature The `SOLACE` price signature.
     */
     function deposit(
        address recipient,
        uint256 amount,
        uint256 price,
        bytes calldata signature
    ) external;

    /**
     * @notice Deposits tokens from depositor using permit.
     * @param depositor The depositor and recipient of Solace Cover Points.
     * @param amount Amount of token to deposit.
     * @param deadline Time the transaction must go through before.
     * @param price The `SOLACE` price in wei(usd).
     * @param signature The `SOLACE` price signature.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
     function depositSigned(
        address depositor,
        uint256 amount,
        uint256 deadline,
        uint256 price,
        bytes calldata signature,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Withdraws some of the user's deposit and sends it to `recipient`.
     * User must have deposited `SOLACE` in at least that amount in the past.
     * User must have sufficient Solace Cover Points to withdraw.
     * Premium pool must have the tokens to return.
     * @param amount The amount of to withdraw.
     * @param recipient The receiver of funds.
     * @param price The `SOLACE` price in wei(usd).
     * @param signature The `SOLACE` price signature.
     */
     function withdraw(
        uint256 amount,
        address recipient,
        uint256 price,
        bytes calldata signature
    ) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _registry The address of `Registry` contract.
     */
    function setRegistry(address _registry) external;
}
