// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interface/ISwapRouter.sol";
import "./SOLACE.sol";
import "contracts/mocks/WETH9.sol";
import "./interface/ITreasury.sol";


/**
 * @title Treasury
 * @author solace.
 * @notice The war chest of Castle Solace.
 */
contract Treasury is ITreasury, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Native SOLACE Token.
    SOLACE public solace;

    /// @notice Governor.
    address public override governance;

    /// @notice Governance to take over.
    address public override newGovernance;

    /// @notice Address of Uniswap router.
    ISwapRouter public swapRouter;

    /// @notice Wrapped ether.
    WETH9 public weth;

    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address[] public premiumRecipients;
    uint32[] public recipientWeights;
    uint32 public weightSum;

    /**
     * @notice Constructs the treasury contract.
     * @param _governance Address of the governor.
     * @param _solace Address of the solace token.
     * @param _swapRouter Address of uniswap router.
     * @param _weth Address of wrapped ether.
     */
    constructor(address _governance, SOLACE _solace, address _swapRouter, address _weth) public {
        governance = _governance;
        solace = _solace;
        swapRouter = ISwapRouter(_swapRouter);
        weth = WETH9(payable(_weth));
    }

    /**
     * Receive function. Deposits eth.
     */
    receive () external payable override {
        emit EthDeposited(msg.value);
    }


    /**
     * Fallback function. Deposits eth.
     */
    fallback () external payable override {
        emit EthDeposited(msg.value);
    }

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external override {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Deposits some ether.
     */
    function depositEth() external override payable {
        // emit event
        emit EthDeposited(msg.value);
    }

    /**
     * @notice Deposit some ERC20 token.
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
     * @notice Spends some tokens.
     * Can only be called by the current governor.
     * @param _token The address of the token to spend.
     * @param _amount The amount of the token to spend.
     * @param _recipient The address of the token receiver.
     */
    function spend(address _token, uint256 _amount, address _recipient) external override nonReentrant {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // transfer eth
        if(_token == ETH_ADDRESS) payable(_recipient).transfer(_amount);
        // transfer token
        else IERC20(_token).safeTransfer(_recipient, _amount);
        // emit event
        emit FundsSpent(_token, _amount, _recipient);
    }

    /**
     * @notice Manually swaps a token.
     * Can only be called by the current governor.
     * @dev Swaps the entire balance in case some tokens were unknowingly received.
     * Reverts if the swap was unsuccessful.
     * @param _path The path of pools to take.
     * @param _amountIn The amount to swap.
     * @param _amountOutMinimum The minimum about to receive.
     */
    function swap(bytes memory _path, uint256 _amountIn, uint256 _amountOutMinimum) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
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
     * Can only be called by the current governor.
     * @param _recipients The premium recipients.
     * @param _weights The recipient weights.
     */
    function setPremiumRecipients(address[] calldata _recipients, uint32[] calldata _weights) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // check recipient - weight map
        require(_recipients.length + 1 == _weights.length, "length mismatch");
        uint32 sum = 0;
        uint256 length = _weights.length;
        for(uint256 i = 0; i < length; i++) sum += _weights[i];
        weightSum = sum;
        premiumRecipients = _recipients;
        recipientWeights = _weights;
    }

    /**
     * @notice Routes the premiums to the recipients
     * Can only be called by the current governor.
     */
    function routePremiums() external override nonReentrant {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        uint256 div = weightSum;
        // assumes that premiums and nothing else are stored as eth
        uint256 balance = address(this).balance;
        uint256 length = premiumRecipients.length;
        // transfer to all recipients
        for(uint i = 0; i < length; i++) {
            uint256 amount = balance * recipientWeights[i] / div;
            if(amount > 0) payable(premiumRecipients[i]).transfer(amount);
        }
        // hold treasury share as weth
        balance = address(this).balance;
        if(balance > 0) weth.deposit{value: balance}();
    }

    /**
     * @notice Wraps some eth into weth.
     * Can only be called by the current governor.
     * @param _amount The amount to wrap.
     */
    function wrap(uint256 _amount) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        weth.deposit{value: _amount}();
    }

    /**
     * @notice Unwraps some weth into eth.
     * Can only be called by the current governor.
     * @param _amount The amount to unwrap.
     */
    function unwrap(uint256 _amount) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        weth.withdraw(_amount);
    }

    // used in Product
    function refund(address _user, uint256 _amount) external override {
      // TODO: implement
    }
}
