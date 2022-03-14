// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./../utils/Governable.sol";
import "./../interfaces/products/ISolaceCoverMinutes.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../interfaces/products/ISolaceCoverTellerStables.sol";

/**
 * @title Solace Cover Teller - Stables
 * @author solace.fi
 * @notice A teller for Solace Cover Minutes that accepts stablecoins for payment.
 */
contract SolaceCoverTellerStables is ISolaceCoverTellerStables, Governable, ReentrancyGuard {

    /***************************************
    GLOBAL DATA
    ***************************************/

    /// @notice Solace Cover Minutes contract.
    address public override scm;

    /// @notice The premum pool.
    address public override premiumPool;

    /***************************************
    USER DEPOSIT DATA
    ***************************************/

    /// @dev user => token => amount deposited
    mapping(address => mapping(address => uint256)) public override deposits;

    /***************************************
    ACCEPTED TOKEN DATA
    ***************************************/

    bytes32 public constant override ZERO = 0x0000000000000000000000000000000000000000000000000000000000000000;
    bytes32 public constant override IS_ACCEPTED_MASK = 0x0000000000000000000000000000000000000000000000000000000000000001;
    bytes32 public constant override IS_PERMITTABLE_MASK = 0x0000000000000000000000000000000000000000000000000000000000000002;
    bytes32 public constant override IS_REFUNDABLE_MASK = 0x0000000000000000000000000000000000000000000000000000000000000004;

    mapping(address => bytes32) public override tokenFlags;
    mapping(address => uint256) public override tokenIndex;
    mapping(uint256 => address) public override tokenList;
    uint256 public override tokensLength;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the Solace Cover Teller - Stables contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     */
    constructor(address governance_, address registry_) Governable(governance_) {
        IRegistry reg = IRegistry(registry_);
        (bool success1, address scm_) = reg.tryGet("scm");
        require(success1, "zero address scm");
        scm = scm_;
        (bool success2, address premiumPool_) = reg.tryGet("premiumPool");
        require(success2, "zero address premium pool");
        premiumPool = premiumPool_;
    }

    /***************************************
    MONEY FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits tokens from msg.sender and credits them to recipient.
     * @param token The token to deposit.
     * @param recipient The recipient of Solace Cover Minutes.
     * @param amount Amount of token to deposit.
     */
    function deposit(
        address token,
        address recipient,
        uint256 amount
    ) external override nonReentrant {
        // checks
        bytes32 flags = tokenFlags[token];
        require((flags & IS_ACCEPTED_MASK) != ZERO, "token not accepted");
        // effects
        deposits[recipient][token] += amount;
        // interactions
        bool isRefundable = (flags & IS_REFUNDABLE_MASK) != ZERO;
        uint256 scmAmount = _convertDecimals(amount, token, scm);
        ISolaceCoverMinutes(scm).mint(recipient, scmAmount, isRefundable);
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, premiumPool, amount);
        emit TokenDeposited(token, msg.sender, recipient, amount);
    }

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
    ) external override nonReentrant {
        // checks
        bytes32 flags = tokenFlags[token];
        require((flags & IS_ACCEPTED_MASK) != ZERO, "token not accepted");
        require((flags & IS_PERMITTABLE_MASK) != ZERO, "token not permittable");
        // effects
        deposits[depositor][token] += amount;
        // interactions
        bool isRefundable = (flags & IS_REFUNDABLE_MASK) != ZERO;
        uint256 scmAmount = _convertDecimals(amount, token, scm);
        ISolaceCoverMinutes(scm).mint(depositor, scmAmount, isRefundable);
        IERC20Permit(token).permit(depositor, address(this), amount, deadline, v, r, s);
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, premiumPool, amount);
        emit TokenDeposited(token, depositor, depositor, amount);
    }

    /**
     * @notice Withdraws some of the user's deposit and sends it to `recipient`.
     * User must have deposited that token in at least that amount in the past.
     * User must have sufficient Solace Cover Minutes to withdraw.
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
    ) external override nonReentrant {
        // checks
        bytes32 flags = tokenFlags[token];
        require((flags & IS_REFUNDABLE_MASK) != ZERO, "token not refundable");
        uint256 deposited = deposits[msg.sender][token];
        require(deposited >= amount, "insufficient deposit");
        // effects
        uint256 scmAmount = _convertDecimals(amount, token, scm);
        ISolaceCoverMinutes(scm).withdraw(msg.sender, scmAmount);
        SafeERC20.safeTransferFrom(IERC20(token), premiumPool, recipient, amount);
        emit TokenWithdrawn(token, msg.sender, recipient, amount);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Converts an amount of tokens to another amount of decimals.
     * Great for converting between tokens with equal value eg USDC to DAI.
     * Does not handle different token values eg ETH to DAI.
     * @param amountIn The amount of tokens in.
     * @param tokenIn The input token.
     * @param tokenOut The output token.
     * @param amountOut The amount of tokens out.
     */
    function _convertDecimals(uint256 amountIn, address tokenIn, address tokenOut) internal view returns (uint256 amountOut) {
        // fetch decimals
        uint8 decIn = IERC20Metadata(tokenIn).decimals();
        uint8 decOut = IERC20Metadata(tokenOut).decimals();
        // convert
        return (decIn < decOut)
            ? amountIn * (10 ** (decOut - decIn)) // upscale
            : (decIn > decOut)
            ? amountIn / (10 ** (decIn - decOut)) // downscale
            : amountIn; // equal
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds or removes a set of accepted tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens Tokens to set.
     * @param flags Flags to set.
     */
    function setTokenFlags(address[] calldata tokens, bytes32[] calldata flags) external override onlyGovernance {
        uint256 len = tokens.length;
        require(flags.length == len, "length mismatch");
        for(uint256 i = 0; i < len; i++) {
            // if new token
            if(tokenIndex[tokens[i]] == 0) {
                // add to enumeration
                uint256 ti = ++tokensLength;
                tokenIndex[tokens[i]] = ti;
                tokenList[ti] = tokens[i];
            }
            // set status
            tokenFlags[tokens[i]] = flags[i];
            emit TokenFlagsSet(tokens[i], flags[i]);
        }
    }
}
