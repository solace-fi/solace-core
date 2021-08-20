// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./Governable.sol";
import "./interface/IWETH9.sol";
import "./interface/ISwapRouter.sol";
import "./interface/IRegistry.sol";
import "./interface/IPolicyManager.sol";
import "./interface/ITreasury.sol";
import "./interface/IVault.sol";

/**
 * @title Treasury
 * @author solace.fi
 * @notice The `Treasury` smart contract governs the finance related operations.
 */
contract Treasury is ITreasury, ReentrancyGuard, Governable {
    using SafeERC20 for IERC20;

    /// @notice Registry
    IRegistry public registry;

    /// @notice Address of Uniswap router.
    ISwapRouter public swapRouter;

    /// @notice Wrapped ether.
    IWETH9 public weth;

    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address payable[] public premiumRecipients;
    uint32[] public recipientWeights;
    uint32 public weightSum;

    /// @notice The amount of **ETH** that a user is owed if any.
    mapping(address => uint256) public override unpaidRefunds;

    /**
     * @notice Constructs the treasury contract.
     * @param governance_ The address of the [governor](/docs/user-docs/Governance).
     * @param swapRouter_ Address of uniswap router.
     * @param weth_ Address of wrapped ether.
     * @param registry_ Address of registry.
     */
    constructor(address governance_, address swapRouter_, address weth_, address registry_) Governable(governance_) {
        swapRouter = ISwapRouter(swapRouter_);
        weth = IWETH9(payable(weth_));
        registry = IRegistry(registry_);

        if (registry_ != address(0) && registry.vault() != address(0)) {
            premiumRecipients = [payable(registry.vault())];
            recipientWeights = [1,0];
            weightSum = 1;
        }
    }

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     */
    receive () external payable override {
        emit EthDeposited(msg.value);
    }

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     */
    fallback () external payable override {
        emit EthDeposited(msg.value);
    }

    /**
     * @notice Deposits **ETH**.
     */
    function depositEth() external override payable {
        // emit event
        emit EthDeposited(msg.value);
    }

    /**
     * @notice Deposits an **ERC20** token.
     * @param token The address of the token to deposit.
     * @param amount The amount of the token to deposit.
     */
    function depositToken(address token, uint256 amount) external override nonReentrant {
        // receive token
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        // emit event
        emit TokenDeposited(token, amount);
    }

    /**
     * @notice Spends an **ERC20** token or **ETH**.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param token The address of the token to spend.
     * @param amount The amount of the token to spend.
     * @param recipient The address of the token receiver.
     */
    function spend(address token, uint256 amount, address recipient) external override nonReentrant onlyGovernance {
        // transfer eth
        if(token == ETH_ADDRESS) payable(recipient).transfer(amount);
        // transfer token
        else IERC20(token).safeTransfer(recipient, amount);
        // emit event
        emit FundsSpent(token, amount, recipient);
    }

    /**
     * @notice Manually swaps a token.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param path The path of pools to take.
     * @param amountIn The amount to swap.
     * @param amountOutMinimum The minimum about to receive.
     */
    function swap(bytes memory path, uint256 amountIn, uint256 amountOutMinimum) external override onlyGovernance {
        // check allowance
        address tokenAddr;
        assembly {
            tokenAddr := div(mload(add(add(path, 0x20), 0)), 0x1000000000000000000000000)
        }
        IERC20 token = IERC20(tokenAddr);
        if(token.allowance(address(this), address(swapRouter)) < amountIn) {
            token.approve(address(swapRouter), type(uint256).max);
        }
        // swap
        swapRouter.exactInput(ISwapRouter.ExactInputParams({
            path: path,
            recipient: address(this),
            // solhint-disable-next-line not-rely-on-time
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum
        }));
    }

    /**
     * @notice Sets the premium recipients and their weights.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param recipients The premium recipients, plus an implicit `address(this)` at the end.
     * @param weights The recipient weights.
     */
    function setPremiumRecipients(address payable[] calldata recipients, uint32[] calldata weights) external override onlyGovernance {
        // check recipient - weight map
        require(recipients.length + 1 == weights.length, "length mismatch");
        uint32 sum = 0;
        uint256 length = weights.length;
        for(uint256 i = 0; i < length; i++) sum += weights[i];
        if(length > 1) require(sum > 0, "1/0");
        weightSum = sum;
        premiumRecipients = recipients;
        recipientWeights = weights;
    }

    /**
     * @notice Routes the **premiums** to the `recipients`.
     */
    function routePremiums() external payable override nonReentrant {
        uint256 div = weightSum;
        uint256 length = premiumRecipients.length;
        // transfer to all recipients
        for(uint i = 0; i < length; i++) {
            uint256 amount = msg.value * recipientWeights[i] / div;
            if (amount > 0) {
                // this call may fail. let it
                // funds will be safely stored in treasury
                premiumRecipients[i].call{value: amount}("");
            }
        }
        // hold treasury share as eth
    }

    /**
     * @notice Wraps some **ETH** into **WETH**.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param amount The amount to wrap.
     */
    function wrap(uint256 amount) external override onlyGovernance {
        weth.deposit{value: amount}();
    }

    /**
     * @notice Unwraps some **WETH** into **ETH**.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param amount The amount to unwrap.
     */
    function unwrap(uint256 amount) external override onlyGovernance {
        weth.withdraw(amount);
    }

    /**
     * @notice Refunds some **ETH** to the user.
     * Will attempt to send the entire `amount` to the `user`.
     * If there is not enough available at the moment, it is recorded and can be pulled later via [`withdraw()`](#withdraw).
     * Can only be called by active products.
     * @param user The user address to send refund amount.
     * @param amount The amount to send the user.
     */
    function refund(address user, uint256 amount) external override nonReentrant {
        // check if from active product
        require(IPolicyManager(registry.policyManager()).productIsActive(msg.sender), "!product");
        _transferEth(user, amount);
    }

    /**
     * @notice Transfers the unpaid refunds to the user.
     */
    function withdraw() external override nonReentrant {
        _transferEth(msg.sender, 0);
    }

    /**
     * @notice Transfers **ETH** to the user. It's called by [`refund()`](#refund) and [`withdraw()`](#withdraw) functions in the contract.
     * Also adds on their unpaid refunds, and stores new unpaid refunds if necessary.
     * @param user The user to pay.
     * @param amount The amount to pay _before_ unpaid funds.
     */
    function _transferEth(address user, uint256 amount) internal {
        // account for unpaid rewards
        uint256 unpaidRefunds1 = unpaidRefunds[user];
        amount += unpaidRefunds1;
        if(amount == 0) return;
        // transfer amount from vault
        if (registry.vault() != address(0)) IVault(registry.vault()).requestEth(amount);
        // unwrap weth if necessary
        if(address(this).balance < amount) {
            uint256 diff = amount - address(this).balance;
            weth.withdraw(min(weth.balanceOf(address(this)), diff));
        }
        // send eth
        uint256 transferAmount = min(address(this).balance, amount);
        uint256 unpaidRefunds2 = amount - transferAmount;
        if(unpaidRefunds2 != unpaidRefunds1) unpaidRefunds[user] = unpaidRefunds2;
        payable(user).transfer(transferAmount);
    }

    /**
     * @notice Internal function that returns the minimum value between two values.
     * @param a The first value.
     * @param b The second value.
     * @return c The minimum value.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256 c) {
        return a <= b ? a : b;
    }
}
