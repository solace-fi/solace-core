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
    /*
    /// @notice Solace Cover Minutes contract.
    address public scm;

    /// @notice The premum pool.
    address public premiumPool;
    */
    /***************************************
    USER DEPOSIT DATA
    ***************************************/

    /// @notice Emitted when a token is deposited.
    event TokenDeposited(address indexed token, address indexed depositor, address indexed receiver, uint256 amount);
    /*
    /// @dev user => token => amount deposited
    mapping(address => mapping(address => uint256)) public deposits;
    */
    /***************************************
    ACCEPTED TOKEN DATA
    ***************************************/

    /*
    bytes32 public constant ZERO = 0x0000000000000000000000000000000000000000000000000000000000000000;
    bytes32 public constant IS_ACCEPTED_FLAG = 0x0000000000000000000000000000000000000000000000000000000000000001;
    bytes32 public constant IS_PERMITTABLE_FLAG = 0x0000000000000000000000000000000000000000000000000000000000000002;
    */
    event TokenFlagsSet(address indexed token, bytes32 flags);
    /*
    mapping(address => bytes32) public tokenFlags;
    mapping(address => uint256) public tokenIndex;
    mapping(uint256 => address) public tokenList;
    uint256 public tokensLength;
    */

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
