// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./../utils/IGovernable.sol";

/**
 * @title Solace Cover Teller - Stables
 * @author solace.fi
 * @notice A teller for Solace Cover Minutes that accepts stablecoins for payment.
 */
interface ISolaceCoverTellerStables is IGovernable {

    /***************************************
    GLOBAL DATA
    ***************************************/

    /// @notice Solace Cover Minutes contract.
    function scm() external view returns (address);

    /// @notice The premum pool.
    function premiumPool() external view returns (address);

    /***************************************
    USER DEPOSIT DATA
    ***************************************/

    /// @notice Emitted when a token is deposited.
    event TokenDeposited(address indexed token, address indexed depositor, address indexed receiver, uint256 amount);

    /// @dev user => token => amount deposited
    function deposits(address user, address token) external view returns (uint256 amount);

    /***************************************
    ACCEPTED TOKEN DATA
    ***************************************/

    function ZERO() external view returns (bytes32);
    function IS_ACCEPTED_MASK() external view returns (bytes32);
    function IS_PERMITTABLE_MASK() external view returns (bytes32);

    event TokenFlagsSet(address indexed token, bytes32 flags);

    function tokenFlags(address token) external view returns (bytes32 flags);
    function tokenIndex(address token) external view returns (uint256 index);
    function tokenList(uint256 index) external view returns (address token);
    function tokensLength() external view returns (uint256 length);

    /***************************************
    MONEY FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits tokens from msg.sender and credits them to recipient.
     * @param token The token to deposit.
     * @param recipient The recipient of Solace Cover Minutes.
     * @param amount Amount of token to deposit.
     */
    function deposit(address token, address recipient, uint256 amount) external;

    /**
     * @notice Deposits tokens from depositor using permit.
     * @param token The token to deposit.
     * @param depositor The depositor and recipient of Solace Cover Minutes.
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

    // TODO: withdraw?

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds or removes a set of accepted tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens Tokens to set.
     * @param flags Flags to set.
     */
    function setTokenFlags(address[] calldata tokens, bytes32[] calldata flags) external;
}
