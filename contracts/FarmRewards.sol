// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Governable.sol";
import "./interface/IxSOLACE.sol";
import "./interface/IFarmController.sol";
//import "./interface/IFarmRewards.sol";


/**
 * @title FarmRewards
 * @author solace.fi
 * @notice Rewards farmers with [**SOLACE**](./SOLACE).
 *
 * Rewards were accumulated by farmers for participating in farms. Rewards will be unlocked linearly over six months and can be redeemed for [**SOLACE**](./SOLACE) by paying $0.03/[**SOLACE**](./SOLACE).
 */
contract FarmRewards is ReentrancyGuard, Governable {
    using SafeERC20 for IERC20;

    event ReceiverSet(address receiver);

    /// @notice Native SOLACE Token.
    address public solace;

    /// @notice xSOLACE Token.
    address public xsolace;

    /// @notice farm controller
    IFarmController public farmController;

    /// @notice receiver for payments
    address public receiver;

    /// @notice timestamp that rewards start vesting
    uint256 constant public vestingStart = 1638316800; // midnight UTC before December 1, 2021

    /// @notice timestamp that rewards finish vesting
    uint256 constant public vestingEnd = 1651363200; // midnight UTC before May 1, 2022

    /// @notice The stablecoins that can be used for payment.
    mapping(address => bool) public tokenInSupported;

    /// @notice The amount of **SOLACE** in the **xSOLACE** contract at construction. Used for reward math.
    uint256 public conversionSolace;

    /// @notice The total supply of **xSOLACE** at construction. Used for reward math.
    uint256 public conversionXSolace;

    /// @notice Redeemed rewards of a user.
    mapping(address => uint256) public redeemedRewards;

    /**
     * @notice Constructs the `FarmRewards` contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param farmController_ The address of the farm controller.
     * @param solace_ Address of [**SOLACE**](./solace).
     * @param xsolace_ Address of [**xSOLACE**](./xsolace).
     * @param receiver_ Address to send proceeds.
     */
    constructor(address governance_, address farmController_, address solace_, address xsolace_, address receiver_) Governable(governance_) {
        require(farmController_ != address(0x0), "zero address farmcontroller");
        require(solace_ != address(0x0), "zero address solace");
        require(xsolace_ != address(0x0), "zero address xsolace");
        require(receiver_ != address(0x0), "zero address receiver");
        farmController = IFarmController(farmController_);
        solace = solace_;
        xsolace = xsolace_;
        receiver = receiver_;
        conversionSolace = ERC20(solace_).balanceOf(xsolace_);
        conversionXSolace = ERC20(xsolace_).totalSupply();
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The amount of [**SOLACE**](./SOLACE) that a user has vested.
     * Does not include the amount they've already redeemed.
     * @param user The user to query.
     * @return amount The amount of vested [**SOLACE**](./SOLACE).
     */
    function vestedSolace(address user) public view returns (uint256 amount) {
        uint256 timestamp = block.timestamp;
        uint256 totalRewards = farmController.pendingRewards(user);
        uint256 totalVestedAmount = (timestamp >= vestingEnd)
            ? totalRewards // fully vested
            : (totalRewards * (timestamp - vestingStart) / (vestingEnd - vestingStart)); // partially vested
        amount = totalVestedAmount - redeemedRewards[user];
        return amount;
    }

    /**
     * @notice The amount of [**xSOLACE**](./xSOLACE) that a user has vested.
     * Does not include the amount they've already redeemed.
     * @param user The user to query.
     * @return amount The amount of vested [**xSOLACE**](./xSOLACE).
     */
    function vestedXSolace(address user) external view returns (uint256 amount) {
        return vestedSolace(user) * conversionXSolace / conversionSolace;
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Deposit tokens to redeem rewards.
     * @param tokenIn The token to use as payment.
     * @param amountIn The max amount to pay.
     */
    function redeem(address tokenIn, uint256 amountIn) external nonReentrant {
        // accounting
        amountIn = _redeem(tokenIn, amountIn, msg.sender);
        // pull tokens
        SafeERC20.safeTransferFrom(IERC20(tokenIn), msg.sender, receiver, amountIn);
    }

    /**
     * @notice Deposit tokens to redeem rewards.
     * @param tokenIn The token to use as payment.
     * @param amountIn The max amount to pay.
     * @param depositor The user that deposits.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function redeemSigned(address tokenIn, uint256 amountIn, address depositor, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        // permit
        ERC20Permit(tokenIn).permit(depositor, address(this), amountIn, deadline, v, r, s);
        // accounting
        amountIn = _redeem(tokenIn, amountIn, depositor);
        // pull tokens
        SafeERC20.safeTransferFrom(IERC20(tokenIn), depositor, receiver, amountIn);
    }

    /**
     * @notice Redeems a users rewards.
     * @param tokenIn The token to use as payment.
     * @param amountIn The max amount to pay.
     * @param depositor The user that deposits.
     * @return actualAmountIn The amount of tokens used.
     */
    function _redeem(address tokenIn, uint256 amountIn, address depositor) internal returns (uint256 actualAmountIn) {
        // check token support
        require(tokenInSupported[tokenIn], "token in not supported");
        // calculate solace out @ $0.03/SOLACE
        uint256 pricePerSolace = 3 * (10 ** (ERC20(tokenIn).decimals() - 2));
        uint256 solaceOut = amountIn * 1 ether / pricePerSolace;
        // verify solace rewards
        uint256 vestedSolace_ = vestedSolace(depositor);
        if(solaceOut > vestedSolace_) {
            solaceOut = vestedSolace_;
            // calculate amount in for max solace
            actualAmountIn = solaceOut * pricePerSolace / 1 ether;
        } else {
            actualAmountIn = amountIn;
        }
        // reward
        uint256 xsolaceOut = solaceOut * conversionXSolace / conversionSolace;
        SafeERC20.safeTransfer(IERC20(xsolace), depositor, xsolaceOut);
        // record
        redeemedRewards[depositor] += solaceOut;
        return actualAmountIn;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds support for tokens. Should be stablecoins.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The tokens to add support for.
     */
    function supportTokens(address[] calldata tokens) external onlyGovernance {
        for(uint256 i = 0; i < tokens.length; ++i) {
            address token = tokens[i];
            require(token != address(0x0), "zero address token");
            tokenInSupported[token] = true;
        }
    }

    /**
     * @notice Sets the recipient for proceeds.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param receiver_ The new recipient.
     */
    function setReceiver(address payable receiver_) external onlyGovernance {
        require(receiver_ != address(0x0), "zero address receiver");
        receiver = receiver_;
        emit ReceiverSet(receiver_);
    }

    /**
     * @notice Returns excess [**xSOLACE**](./xSOLACE).
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param amount Amount to send. Will be sent from this contract to `receiver`.
     */
    function returnXSolace(uint256 amount) external onlyGovernance {
        SafeERC20.safeTransfer(IERC20(xsolace), receiver, amount);
    }
}
