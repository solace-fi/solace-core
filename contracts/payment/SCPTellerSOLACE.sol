// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./../utils/Governable.sol";
import "./../interfaces/utils/ISOLACEPriceVerifier.sol";
import "./../interfaces/payment/ISCP.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../interfaces/payment/ISCPTellerSOLACE.sol";


/**
 * @title Solace Cover Points Teller - SOLACE
 * @author solace.fi
 * @notice A teller for [**Solace Cover Points**](./SCP) that accepts `SOLACE` token for payment.
 */
contract SCPTellerSOLACE is ISCPTellerSOLACE, Governable, ReentrancyGuard {

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

    /// @notice The `SOLACE` token price verifier.
    address public priceVerifier;

    /// @notice The amount of a token that an account is credited for depositing.
    mapping(address => uint256) public depositsOf;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the Solace Cover Teller - Stables contract.
     * @param _governance The address of the [governor](/docs/protocol/governance).
     * @param _registry The address of the registry contract.
     */
    constructor(address _governance, address _registry) Governable(_governance) {
        _setRegistry(_registry);
    }

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
    ) external override nonReentrant {
        require(ISOLACEPriceVerifier(priceVerifier).verifyPrice(price, signature), "invalid price");
        depositsOf[recipient] += amount;
        uint256 scpAmount = (amount * price) / 10**18;
       
        SafeERC20.safeTransferFrom(IERC20(solace), msg.sender, premiumPool, amount);
        ISCP(scp).mint(recipient, scpAmount, true);
        emit SolaceDeposited(msg.sender, recipient, scpAmount);
    }

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
    ) external override nonReentrant {
        require(ISOLACEPriceVerifier(priceVerifier).verifyPrice(price, signature), "invalid price");
        depositsOf[depositor] += amount;
        uint256 scpAmount = (amount * price) / 10**18;

        IERC20Permit(solace).permit(depositor, address(this), amount, deadline, v, r, s);
        SafeERC20.safeTransferFrom(IERC20(solace), msg.sender, premiumPool, amount);
        ISCP(scp).mint(depositor, scpAmount, true);
        emit SolaceDeposited(depositor, depositor, amount);
    }

    /**
     * @notice Withdraws some of the user's deposit and sends it to `recipient`.
     * User must have deposited `SOLACE` in at least that amount in the past.
     * User must have sufficient Solace Cover Points to withdraw.
     * Token must be refundable.
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
    ) external override nonReentrant {
        require(ISOLACEPriceVerifier(priceVerifier).verifyPrice(price, signature), "invalid price");

        // check deposited balance
        uint256 deposited = depositsOf[msg.sender];
        require(deposited >= amount, "insufficient deposit");

        // check scp balance
        uint256 scpBalance = ISCP(scp).balanceOf(msg.sender);
        uint256 requiredScp = ISCP(scp).minScpRequired(msg.sender);
        require(scpBalance > requiredScp, "insufficient scp balance");
        uint256 rbalance = scpBalance - requiredScp;

        // check withdraw amount
        uint256 scpAmount = (amount * price) / 10**18;
        require(scpAmount >= rbalance, "withdraw amount exceeds balance");

        depositsOf[msg.sender] -= amount;
        ISCP(scp).withdraw(msg.sender, scpAmount);
        SafeERC20.safeTransferFrom(IERC20(solace), premiumPool, recipient, amount);
        emit SolaceWithdrawn(msg.sender, recipient, amount);
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

        (, address solacePriceVerifierAddr) = reg.tryGet("solacePriceVerifier");
        require(solacePriceVerifierAddr != address(0x0), "zero address price verifier");
        priceVerifier = solacePriceVerifierAddr;
        emit RegistrySet(_registry);
    }
}
