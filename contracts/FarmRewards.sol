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
 * @title OptionsFarming
 * @author solace.fi
 * @notice Distributes options to farmers.
 *
 * Rewards are accumulated by farmers for participating in farms. Rewards can be redeemed for options with 1:1 reward:[**SOLACE**](./SOLACE). Options can be exercised by paying `strike price` USD before `expiry`.
 *
 * The `strike price` is 0.03 cents in USD and can be paid in any supported stablecoin.
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

    /// @notice receiver for options payments
    address public receiver;

    /// @notice timestamp that bonds must be exercised before
    uint256 constant public expiry = 1646154000; // 5 PM UTC March 1, 2022

    /// @notice the duration of vesting in seconds
    uint256 constant public vestingTerm = 15552000; // 6 months

    /// @notice The stablecoins that can be used for payment.
    mapping(address => bool) public tokenInSupported;

    struct Option {
        uint256 totalSolaceRewards;  // amount of SOLACE purchased
        uint256 totalXSolaceRewards; // amount of xSOLACE staked
        uint256 redeemedXSolace;     // amount of xSOLACE rewarded
        uint256 startTime;           // timestamp that option was first exercised
    }

    /// @notice Options of a user.
    mapping(address => Option) public options;

    /**
     * @notice Constructs the `OptionsFarming` contract.
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
        farmController = IFarmController(farmController);
        solace = solace_;
        xsolace = xsolace_;
        receiver = receiver_;
        ERC20(solace_).approve(xsolace, type(uint256).max);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The amount of [**SOLACE**](./SOLACE) that a user is owed if any.
     * @param user The user.
     * @return amount The amount.
     */
    function unpaidSolace(address user) external view returns (uint256 amount) {
        if(block.timestamp > expiry) return 0;
        return farmController.pendingRewards(user) - options[user].totalSolaceRewards;
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Deposit tokens to create or increase an option.
     * @param tokenIn The token to use as payment.
     * @param amountIn The max amount to pay.
     */
    function deposit(address tokenIn, uint256 amountIn) external nonReentrant {
        // accounting
        amountIn = _createOption(tokenIn, amountIn, msg.sender);
        // pull tokens
        SafeERC20.safeTransferFrom(IERC20(tokenIn), msg.sender, receiver, amountIn);
    }

    /**
     * @notice Deposit tokens to create or increase an option.
     * @param tokenIn The token to use as payment.
     * @param amountIn The max amount to pay.
     * @param depositor The user that deposits.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function depositSigned(address tokenIn, uint256 amountIn, address depositor, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        // permit
        ERC20Permit(tokenIn).permit(depositor, address(this), amountIn, deadline, v, r, s);
        // accounting
        amountIn = _createOption(tokenIn, amountIn, depositor);
        // pull tokens
        SafeERC20.safeTransferFrom(IERC20(tokenIn), depositor, receiver, amountIn);
    }

    /**
     * @notice Creates or increases an option.
     * @param tokenIn The token to use as payment.
     * @param amountIn The max amount to pay.
     * @param depositor The user that deposits.
     * @return actualAmountIn The amount of tokens used.
     */
    function _createOption(address tokenIn, uint256 amountIn, address depositor) internal returns (uint256 actualAmountIn) {
        // check expiry
        require(block.timestamp <= expiry, "deposits expired");
        // check token support
        require(tokenInSupported[tokenIn], "token in not supported");
        // calculate solace out @ $0.03/SOLACE
        uint256 pricePerSolace = 3 * (10 ** (ERC20(tokenIn).decimals() - 2));
        uint256 solaceOut = amountIn * 1 ether / pricePerSolace;
        // verify solace rewards
        Option memory option = options[depositor];
        uint256 pendingRewards = farmController.pendingRewards(depositor) - option.totalSolaceRewards;
        if(solaceOut > pendingRewards) {
            solaceOut = pendingRewards;
            // calculate amount in for max solace
            actualAmountIn = solaceOut * pricePerSolace / 1 ether;
        } else {
            actualAmountIn = amountIn;
        }
        // stake
        uint256 xsolaceOut = IxSOLACE(xsolace).stake(solaceOut);
        // record
        option.totalSolaceRewards += solaceOut;
        option.totalXSolaceRewards += xsolaceOut;
        if(option.startTime == 0) option.startTime = block.timestamp;
        options[depositor] = option;
        return actualAmountIn;
    }

    /**
     * @notice Sends rewards to a user.
     * @param depositor The user to reward.
     */
    function redeemRewards(address depositor) external nonReentrant {
        Option memory option = options[depositor];
        if(option.totalSolaceRewards == 0) return;
        // calculate rewards
        uint256 timestamp = block.timestamp;
        uint256 redeemableAmount = (option.totalXSolaceRewards * (timestamp - option.startTime) / vestingTerm) - option.redeemedXSolace;
        // record
        options[depositor].redeemedXSolace += redeemableAmount;
        // send rewards
        SafeERC20.safeTransfer(IERC20(xsolace), depositor, redeemableAmount);
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
     * @notice Sets the recipient for Option payments.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param receiver_ The new recipient.
     */
    function setReceiver(address payable receiver_) external onlyGovernance {
        require(receiver_ != address(0x0), "zero address receiver");
        receiver = receiver_;
        emit ReceiverSet(receiver_);
    }

    /**
     * @notice Returns the unclaimed **SOLACE**.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function returnSolace() external onlyGovernance {
        require(block.timestamp > expiry, "deposits not expired");
        SafeERC20.safeTransfer(IERC20(solace), receiver, ERC20(solace).balanceOf(address(this)));
    }
}
