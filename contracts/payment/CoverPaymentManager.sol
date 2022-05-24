// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./../utils/PriceVerifier.sol";
import "./../interfaces/payment/ISCP.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../interfaces/payment/ICoverPaymentManager.sol";
import "./../interfaces/utils/IPriceVerifier.sol";


/**
 * @title Cover Payment Manager
 * @author solace.fi
 * @notice A cover payment manager for [**Solace Cover Points**](./SCP) that accepts stablecoins  and `SOLACE` for payment.
 *
 */
contract CoverPaymentManager is ICoverPaymentManager, Multicall, PriceVerifier, ReentrancyGuard {

    /***************************************
    STATE VARIABLES
    ***************************************/

    /// @notice Registry address.
    address public registry;

    /// @notice SOLACE token address.
    address public solace;

    /// @notice Solace Cover Points contract.
    address public scp;

    /// @notice The premum pool.
    address public premiumPool;

    /// @notice Pause contract.(Default is False)
    bool public paused;

    /// @notice The mapping that holds token info.
    mapping(address => TokenInfo) public tokenInfo;

    /// @notice The mapping of token index to address.
    mapping(uint256 => address) private _indexToToken;

    /// @notice The number of tokens that have been added
    uint256 public tokensLength;

   /***************************************
    MODIFIERS
    ***************************************/

    modifier whileUnpaused() {
        require(!paused, "contract paused");
        _;
    }

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the Solace Cover Teller - Stables contract.
     * @param _governance The address of the [governor](/docs/protocol/governance).
     * @param _registry The address of the registry contract.
     */
    constructor(address _governance, address _registry) PriceVerifier(_governance) {
        _setRegistry(_registry);
    }

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
    ) external override nonReentrant whileUnpaused {
        // checks
        TokenInfo memory ti = tokenInfo[token];
        require(ti.accepted, "token not accepted");
        require(ti.stable,   "token not stable");

        // interactions
        uint256 scpAmount = _convertDecimals(amount, token, scp);
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, premiumPool, amount);
        ISCP(scp).mint(recipient, scpAmount, ti.refundable);
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
    function depositSignedStable(
        address token,
        address depositor,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override nonReentrant whileUnpaused {
        // checks
        TokenInfo memory ti = tokenInfo[token];
        require(ti.accepted, "token not accepted");
        require(ti.stable,   "token not stable");
        require(ti.permittable, "token not permittable");

        // interactions
        uint256 scpAmount = _convertDecimals(amount, token, scp);
        IERC20Permit(token).permit(depositor, address(this), amount, deadline, v, r, s);
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, premiumPool, amount);
        ISCP(scp).mint(depositor, scpAmount, ti.refundable);
        emit TokenDeposited(token, depositor, depositor, amount);
    }

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
    ) external override nonReentrant whileUnpaused {
        // checks
        TokenInfo memory ti = tokenInfo[token];
        require(ti.accepted,  "token not accepted");
        require(!ti.stable,   "token not non-stable");
        require(verifyPrice(token, price, priceDeadline, signature), "invalid token price");

        // interactions
        uint256 scpAmount = (_convertDecimals(amount, token, scp) * price) / 10**18;
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, premiumPool, amount);
        ISCP(scp).mint(recipient, scpAmount, true);
        emit TokenDeposited(token, msg.sender, recipient, amount);
    }


    /***************************************
    WITHDRAW FUNCTIONS
    ***************************************/

    /**
     * @notice Withdraws some of the user's deposit and sends it to `recipient`.
     * User must have sufficient Solace Cover Points to withdraw.
     * Premium pool must have the tokens to return.
     * @param amount The amount of `SOLACE` to withdraw.
     * @param recipient The receiver of funds.
     * @param priceDeadline The `SOLACE` price in wei(usd).
     * @param signature The `SOLACE` price signature.
     */
     function withdraw(
        uint256 amount,
        address recipient,
        uint256 price,
        uint256 priceDeadline,
        bytes calldata signature
    ) external override nonReentrant {
        require(amount > 0, "zero amount withdraw");
        require(verifyPrice(solace, price, priceDeadline, signature), "invalid solace price");
        uint256 refundableSolaceAmount = getRefundableSOLACEAmount(msg.sender, price, priceDeadline, signature);
        require(amount <= refundableSolaceAmount, "withdraw amount exceeds balance");

        uint256 scpAmount = (amount * price) / 10**18;
        ISCP(scp).withdraw(msg.sender, scpAmount);
        SafeERC20.safeTransferFrom(IERC20(solace), premiumPool, recipient, amount);
        emit TokenWithdrawn(msg.sender, recipient, amount);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns to token information for given token index.
     * @param index The token index.
    */
    function getTokenInfo(
        uint256 index
    ) external view override returns (address token, bool accepted, bool permittable, bool refundable, bool stable) {
        TokenInfo memory ti = tokenInfo[_indexToToken[index]];
        return (ti.token, ti.accepted, ti.permittable, ti.refundable, ti.stable);
    }

    /**
     * @notice Calculates the refundable `SOLACE` amount.
     * @param depositor The ownder of funds.
     * @param price The `SOLACE` price in wei(usd).
     * @param priceDeadline The deadline for the price.
     * @param signature The `SOLACE` price signature.
     * @return solaceAmount
    */
    function getRefundableSOLACEAmount(address depositor, uint256 price, uint256 priceDeadline, bytes calldata signature) public view override returns (uint256 solaceAmount) {
        // check price
        require(verifyPrice(solace, price, priceDeadline, signature), "invalid token price");
        uint256 scpBalance = ISCP(scp).balanceOf(depositor);
        uint256 requiredScp = ISCP(scp).minScpRequired(depositor);
        uint256 refundableScpBalance = scpBalance > requiredScp ? scpBalance - requiredScp : 0;
        solaceAmount = refundableScpBalance > 0 ? (refundableScpBalance * 10**18) / price : 0;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _registry The address of `Registry` contract.
    */
    function setRegistry(address _registry) external override onlyGovernance {
        _setRegistry(_registry);
    }

    /**
     * @notice Adds or removes a set of accepted tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens Tokens to set.
    */
    function setTokenInfo(TokenInfo[] calldata tokens) external override onlyGovernance {
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i].token;
            require(token != address(0x0), "zero address token");

            // new token
            if (tokenInfo[token].token == address(0x0)) {
                _indexToToken[tokensLength++] = token;
            } 
            tokenInfo[token] = tokens[i];
            emit TokenInfoSet(tokens[i].token, tokens[i].accepted, tokens[i].permittable, tokens[i].refundable, tokens[i].stable);
        }
    }

    /**
     * @notice Pauses or unpauses contract..
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _paused True to pause, false to unpause.
    */
    function setPaused(bool _paused) external override onlyGovernance {
        paused = _paused;
        emit PauseSet(_paused);
    }

    /***************************************
    INTERNAL FUNCTIONS
    ***************************************/

    /**
     * @notice Sets registry and related contract addresses.
     * @param _registry The registry address to set.
    */
    function _setRegistry(address _registry) internal {
        require(_registry != address(0x0), "zero address registry");
        IRegistry reg = IRegistry(_registry);
        registry = _registry;

        // set scp
        (, address scpAddr) = reg.tryGet("scp");
        require(scpAddr != address(0x0), "zero address scp");
        scp = scpAddr;

        // set solace
        (, address solaceAddr) = reg.tryGet("solace");
        require(solaceAddr != address(0x0), "zero address solace");
        solace = solaceAddr;

        (, address premiumPoolAddr) = reg.tryGet("premiumPool");
        require(premiumPoolAddr != address(0x0), "zero address premium pool");
        premiumPool = premiumPoolAddr;
        emit RegistrySet(_registry);
    }

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
}
