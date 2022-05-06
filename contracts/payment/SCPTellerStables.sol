// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./../utils/Governable.sol";
import "./../interfaces/payment/ISCP.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../interfaces/payment/ISCPTellerStables.sol";


/**
 * @title Solace Cover Points Teller - Stables
 * @author solace.fi
 * @notice A teller for [**Solace Cover Points**](./SCP) that accepts stablecoins for payment.
 *
 * Users can call [`deposit()`](#deposit) or [`depositSigned()`](#depositsigned) to deposit any accepted stablecoin and receive [**SCP**](./SCP). Cover products may deduct from a user's [**SCP**](./SCP) balance to pay for coverage. Users can call [`withdraw()`](#withdraw) to redeem their [**SCP**](./SCP) for stablecoins that they deposited as long as they're refundable and not required by a cover product. Deposited tokens are sent to and withdrawn from the premium pool.
 *
 * This teller assumes that accepted tokens are sufficiently pegged to **USD**, for example **USDC**, **DAI**, and Aave's interest bearing **aDAI** but not Yearn's interest bearing **yDAI**. Users cannot withdraw tokens they did not deposit, in other words this cannot be used to freely exchange **DAI** for **USDC** unless they previously deposited **USDC**. Token balances are automatically converted to the appropriate amount of decimals.
 *
 * [**Governance**](/docs/protocol/governance) can add new tokens and set their flags. Flags determine how a user can use a token to interact with the teller, the most important are `IS_ACCEPTED`, `IS_PERMITTABLE`, and `IS_REFUNDABLE`. Governance can also set the address of the premium pool. The address of [**SCP**](./SCP) is set during construction and cannot be modified.
 */
contract SCPTellerStables is ISCPTellerStables, Multicall, Governable, ReentrancyGuard {

    /***************************************
    STORAGE
    ***************************************/

    // Solace Cover Points contract.
    address private _scp;

    // The premum pool.
    address private _premiumPool;

    // The amount of a token that an account is credited for depositing.
    // user => token => amount deposited
    mapping(address => mapping(address => uint256)) private _deposits;

    // a token's flags
    mapping(address => bytes32) private _tokenFlags;

    // the number of tokens that have been added
    uint256 private _tokensLength;

    // mapping of token index to address
    mapping(uint256 => address) private _tokenList;

    // used to convert a tokens flags into something useful
    bytes32 private constant ZERO                = 0x0000000000000000000000000000000000000000000000000000000000000000;
    bytes32 private constant IS_KNOWN_MASK       = 0x0000000000000000000000000000000000000000000000000000000000000001;
    bytes32 private constant IS_ACCEPTED_MASK    = 0x0000000000000000000000000000000000000000000000000000000000000002;
    bytes32 private constant IS_PERMITTABLE_MASK = 0x0000000000000000000000000000000000000000000000000000000000000004;
    bytes32 private constant IS_REFUNDABLE_MASK  = 0x0000000000000000000000000000000000000000000000000000000000000008;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the Solace Cover Teller - Stables contract.
     * @param _governance The address of the [governor](/docs/protocol/governance).
     * @param _registry The address of the registry contract.
     */
    constructor(address _governance, address _registry) Governable(_governance) {
        require(_registry != address(0x0), "zero address registry");
        IRegistry reg = IRegistry(_registry);

        (, address scpAddr) = reg.tryGet("scp");
        require(scpAddr != address(0x0), "zero address scp");
        _scp = scpAddr;

        (, address premiumPoolAddr) = reg.tryGet("premiumPool");
        require(premiumPoolAddr != address(0x0), "zero address premium pool");
        _premiumPool = premiumPoolAddr;
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice [**Solace Cover Points**](./SCP) contract.
    function scp() external view override returns (address) {
        return _scp;
    }

    /// @notice The premum pool.
    function premiumPool() external view override returns (address) {
        return _premiumPool;
    }

    /// @notice The amount of a token that an account is credited for depositing.
    function deposits(address account, address token) external view override returns (uint256 amount) {
        return _deposits[account][token];
    }

    /// @notice Returns a token's flags.
    function tokenFlags(address token) external view override returns (bytes32 flags) {
        return _tokenFlags[token];
    }

    /// @notice Returns a token's flags.
    function getTokenFlags(address token) external view override returns (bool isKnown, bool isAccepted, bool isPermittable, bool isRefundable) {
        bytes32 flags = _tokenFlags[token];
        isKnown = ((flags & IS_KNOWN_MASK) != ZERO);
        isAccepted = ((flags & IS_ACCEPTED_MASK) != ZERO);
        isPermittable = ((flags & IS_PERMITTABLE_MASK) != ZERO);
        isRefundable = ((flags & IS_REFUNDABLE_MASK) != ZERO);
    }

    /// @notice Returns the number of tokens that have been added.
    function tokensLength() external view override returns (uint256 length) {
        return _tokensLength;
    }

    /// @notice Returns the token at `index`.
    function tokenList(uint256 index) external view override returns (address token) {
        return _tokenList[index];
    }

    /***************************************
    MONEY FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits tokens from msg.sender and credits them to recipient.
     * @param token The token to deposit.
     * @param recipient The recipient of Solace Cover Points.
     * @param amount Amount of token to deposit.
     */
    function deposit(
        address token,
        address recipient,
        uint256 amount
    ) external override nonReentrant {
        // checks
        bytes32 flags = _tokenFlags[token];
        require((flags & IS_ACCEPTED_MASK) != ZERO, "token not accepted");

        // effects
        _deposits[recipient][token] += amount;

        // interactions
        bool isRefundable = (flags & IS_REFUNDABLE_MASK) != ZERO;
        uint256 scpAmount = _convertDecimals(amount, token, _scp);
        
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, _premiumPool, amount);
        ISCP(_scp).mint(recipient, scpAmount, isRefundable);
        emit TokenDeposited(token, msg.sender, recipient, amount);
    }

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
        bytes32 flags = _tokenFlags[token];
        require((flags & IS_ACCEPTED_MASK) != ZERO, "token not accepted");
        require((flags & IS_PERMITTABLE_MASK) != ZERO, "token not permittable");
        // effects
        _deposits[depositor][token] += amount;
        // interactions
        bool isRefundable = (flags & IS_REFUNDABLE_MASK) != ZERO;
        uint256 scpAmount = _convertDecimals(amount, token, _scp);
        IERC20Permit(token).permit(depositor, address(this), amount, deadline, v, r, s);
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, _premiumPool, amount);
        ISCP(_scp).mint(depositor, scpAmount, isRefundable);
        emit TokenDeposited(token, depositor, depositor, amount);
    }

    /**
     * @notice Withdraws some of the user's deposit and sends it to `recipient`.
     * User must have deposited that token in at least that amount in the past.
     * User must have sufficient Solace Cover Points to withdraw.
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
        bytes32 flags = _tokenFlags[token];
        require((flags & IS_REFUNDABLE_MASK) != ZERO, "token not refundable");
        uint256 deposited = _deposits[msg.sender][token];
        require(deposited >= amount, "insufficient deposit");
        // effects
        uint256 scpAmount = _convertDecimals(amount, token, _scp);
        ISCP(_scp).withdraw(msg.sender, scpAmount);
        SafeERC20.safeTransferFrom(IERC20(token), _premiumPool, recipient, amount);
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
     * @notice Sets the premium pool.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param pool Address of the new pool.
     */
    function setPremiumPool(address pool) external override onlyGovernance {
        _premiumPool = pool;
        emit PremiumPoolSet(pool);
    }

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
            //if(tokenIndex[tokens[i]] == 0) {
            bytes32 curFlags = _tokenFlags[tokens[i]];
            if((curFlags & IS_KNOWN_MASK) == ZERO) {
                // add to enumeration
                uint256 ti = _tokensLength++;
                //tokenIndex[tokens[i]] = ti;
                _tokenList[ti] = tokens[i];
            }
            // set status
            bytes32 newFlags = flags[i] | IS_KNOWN_MASK; // force IS_KNOWN = true
            _tokenFlags[tokens[i]] = newFlags;
            emit TokenFlagsSet(tokens[i], newFlags);
        }
    }
}
