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

    /// @notice The amount of eth that a user is owed if any.
    mapping(address => uint256) public override unpaidRefunds;

    /**
     * @notice Constructs the treasury contract.
     * @param _governance Address of the governor.
     * @param _swapRouter Address of uniswap router.
     * @param _weth Address of wrapped ether.
     * @param _registry Address of registry.
     */
    constructor(address _governance, address _swapRouter, address _weth, address _registry) Governable(_governance) {
        swapRouter = ISwapRouter(_swapRouter);
        weth = IWETH9(payable(_weth));
        registry = IRegistry(_registry);

        if (_registry != address(0) && registry.vault() != address(0)) {
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
     * @notice Deposits **ETH**. The amount is given by `msg.value`.
     */
    function depositEth() external override payable {
        // emit event
        emit EthDeposited(msg.value);
    }

    /**
     * @notice Deposits `ERC20` token.
     * @param _token The address of the token to deposit.
     * @param _amount The amount of the token to deposit.
     */
    function depositToken(address _token, uint256 _amount) external override nonReentrant {
        // receive token
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        // emit event
        emit TokenDeposited(_token, _amount);
    }

    /**
     * @notice Spends `ERC20` token or `ETH`. Can only be called by the current `governor`.
     * @param _token The address of the token to spend.
     * @param _amount The amount of the token to spend.
     * @param _recipient The address of the token receiver.
     */
    function spend(address _token, uint256 _amount, address _recipient) external override nonReentrant onlyGovernance {
        // transfer eth
        if(_token == ETH_ADDRESS) payable(_recipient).transfer(_amount);
        // transfer token
        else IERC20(_token).safeTransfer(_recipient, _amount);
        // emit event
        emit FundsSpent(_token, _amount, _recipient);
    }

    /**
     * @notice Manually swaps a token. Can only be called by the current `governor`.
     * It swaps the entire balance in case some tokens were unknowingly received. Reverts if the swap was unsuccessful.
     * @param _path The path of pools to take.
     * @param _amountIn The amount to swap.
     * @param _amountOutMinimum The minimum about to receive.
     */
    function swap(bytes memory _path, uint256 _amountIn, uint256 _amountOutMinimum) external override onlyGovernance {
        // check allowance
        address tokenAddr;
        assembly {
            tokenAddr := div(mload(add(add(_path, 0x20), 0)), 0x1000000000000000000000000)
        }
        IERC20 token = IERC20(tokenAddr);
        if(token.allowance(address(this), address(swapRouter)) < _amountIn) {
            token.approve(address(swapRouter), type(uint256).max);
        }
        // swap
        swapRouter.exactInput(ISwapRouter.ExactInputParams({
            path: _path,
            recipient: address(this),
            // solhint-disable-next-line not-rely-on-time
            deadline: block.timestamp,
            amountIn: _amountIn,
            amountOutMinimum: _amountOutMinimum
        }));
    }

    /**
     * @notice Sets the premium recipients and their weights.
     * Can only be called by the current `governor`.
     * @param _recipients The premium recipients, plus an implicit `address(this)` at the end.
     * @param _weights The recipient weights.
     */
    function setPremiumRecipients(address payable[] calldata _recipients, uint32[] calldata _weights) external override onlyGovernance {
        // check recipient - weight map
        require(_recipients.length + 1 == _weights.length, "length mismatch");
        uint32 sum = 0;
        uint256 length = _weights.length;
        for(uint256 i = 0; i < length; i++) sum += _weights[i];
        if(length > 1) require(sum > 0, "1/0");
        weightSum = sum;
        premiumRecipients = _recipients;
        recipientWeights = _weights;
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
                premiumRecipients[i].call{value: amount}(""); // call may fail, let it
            }
        }
        // hold treasury share as eth
    }

    /**
     * @notice Wraps some **ETH** into **WETH**.
     * Can only be called by the current `governor`.
     * @param _amount The amount to wrap.
     */
    function wrap(uint256 _amount) external override onlyGovernance {
        weth.deposit{value: _amount}();
    }

    /**
     * @notice Unwraps some **WETH** into **ETH**.
     * Can only be called by the current `governor`.
     * @param _amount The amount to unwrap.
     */
    function unwrap(uint256 _amount) external override onlyGovernance {
        weth.withdraw(_amount);
    }

    /**
     * @notice The function refunds the given amount to the user. It is called by `products` in **Solace Protocol**.
     * @param _user The user address to send refund amount.
     * @param _amount The amount to send the user.
     */
    function refund(address _user, uint256 _amount) external override nonReentrant {
        // check if from active product
        require(IPolicyManager(registry.policyManager()).productIsActive(msg.sender), "!product");
        transferEth(_user, _amount);
    }

    /**
     * @notice The function transfers the unpaid refunds to the user. It is called by `products` in **Solace Protocol**.
     */
    function withdraw() external override nonReentrant {
        transferEth(msg.sender, 0);
    }

    /**
     * @notice The internal function transfers **ETH** to the user. It's called by **refund()** and **withdraw()** functions in the contract.
     * Also adds on their unpaid refunds, and stores new unpaid refunds if necessary.
     * @param _user The user to pay.
     * @param _amount The amount to pay **before** unpaid funds.
     */
    function transferEth(address _user, uint256 _amount) internal {
        // account for unpaid rewards
        _amount += unpaidRefunds[_user];
        // transfer amount from vault
        if (registry.vault() != address(0)) IVault(registry.vault()).requestEth(_amount);

        if(_amount == 0) return;
        // unwrap weth if necessary
        if(address(this).balance < _amount) {
            uint256 diff = _amount - address(this).balance;
            weth.withdraw(min(weth.balanceOf(address(this)), diff));
        }
        // send eth
        uint256 transferAmount = min(address(this).balance, _amount);
        unpaidRefunds[_user] = _amount - transferAmount;
        payable(_user).transfer(transferAmount);
    }

    /**
     * @notice Internal function that returns the minimum value between two values.
     * @param _a  The first value.
     * @param _b  The second value.
     * @return _c The minimum value.
     */
    function min(uint256 _a, uint256 _b) internal pure returns (uint256 _c) {
        return _a <= _b ? _a : _b;
    }
}
