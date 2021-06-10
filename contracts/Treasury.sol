// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/ISwapRouter.sol";
import "./SOLACE.sol";
import "./interface/IWETH10.sol";
import "./interface/ITreasury.sol";


/**
 * @title Treasury
 * @author solace.
 * @notice The war chest of Castle Solace.
 */
contract Treasury is ITreasury {
    using SafeERC20 for IERC20;

    /// @notice Native SOLACE Token.
    SOLACE public solace;

    /// @notice Governor.
    address public governance;

    /// @notice Address of Uniswap router.
    ISwapRouter public swapRouter;

    /// @notice Wrapped ether.
    IWETH10 public weth;

    /// @notice Given a token, what swap path should it take.
    mapping(address => bytes) public paths;

    // events
    // Emitted when eth is deposited
    event DepositEth(uint256 _amount);
    // Emitted when a token is deposited
    event DepositToken(address _token, uint256 _amount);
    // Emitted when a token is spent
    event Spend(address _token, uint256 _amount, address _recipient);
    // Emitted when a token swap path is set
    event PathSet(address _token, bytes _path);

    /**
     * @notice Constructs the treasury contract.
     * @param _solace Address of the solace token.
     * @param _swapRouter Address of uniswap router.
     * @param _weth Address of wrapped ether.
     */
    constructor(SOLACE _solace, address _swapRouter, address _weth) {
        solace = _solace;
        swapRouter = ISwapRouter(_swapRouter);
        weth = IWETH10(_weth);
        governance = msg.sender;
    }

    /**
     * Receive function. Deposits eth.
     */
    receive () external payable override {
        _depositEth();
    }


    /**
     * Fallback function. Deposits eth.
     */
    fallback () external payable override {
        _depositEth();
    }

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // set governance
        governance = _governance;
    }

    /**
     * @notice Sets the swap path for a token.
     * Can only be called by the current governor.
     * @dev Also adds or removes infinite approval of the token for the router.
     * @param _token The token to set the path for.
     * @param _path The path to take.
     */
    function setPath(address _token, bytes calldata _path) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // set path
        paths[_token] = _path;
        // infinite or zero approval
        IERC20(_token).approve(address(swapRouter), _path.length == 0 ? 0 : type(uint256).max);
        // emit event
        emit PathSet(_token, _path);
    }

    /**
     * @notice Deposits some ether.
     */
    function depositEth() external override payable {
        _depositEth();
    }

    /**
     * @notice Deposit some ERC20 token.
     * @param _token The address of the token to deposit.
     * @param _amount The amount of the token to deposit.
     */
    function depositToken(address _token, uint256 _amount) external override {
        // receive token
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        // perform swap
        _swap(_token);
        // emit event
        emit DepositToken(_token, _amount);
    }

    /**
     * @notice Spends some tokens.
     * Can only be called by the current governor.
     * @param _token The address of the token to spend.
     * @param _amount The amount of the token to spend.
     * @param _recipient The address of the token receiver.
     */
    function spend(address _token, uint256 _amount, address _recipient) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // transfer
        IERC20(_token).safeTransfer(_recipient, _amount);
        // emit event
        emit Spend(_token, _amount, _recipient);
    }

    /**
     * @notice Manually swaps a token.
     * Can only be called by the current governor.
     * @dev Swaps the entire balance in case some tokens were unknowingly received.
     * Reverts if the swap was unsuccessful.
     * @param _token The address of the token to swap.
     * @param _path The path of pools to take.
     * @param _amountIn The amount to swap.
     * @param _amountOutMinimum The minimum about to receive.
     */
    function swap(address _token, bytes calldata _path, uint256 _amountIn, uint256 _amountOutMinimum) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
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

    // used in Product
    function refund(address _user, uint256 _amount) external override {
        // TODO: implement
    }

    /**
     * @notice Deposits some ether.
     */
    function _depositEth() internal {
        // swap entire balance from eth to weth
        weth.deposit{ value: address(this).balance }();
        // perform swap
        _swap(address(weth));
        // emit event
        emit DepositEth(msg.value);
    }

    /**
     * @notice Swaps a token using a predefined path.
     * @dev Swaps the entire balance in case some tokens were unknowingly received.
     * Does not revert if the swap is unsuccessful.
     * @param _token The address of the token to swap.
     * @return _success True if swap was successful.
     */
    function _swap(address _token) internal returns (bool _success) {
        // get route
        bytes memory path = paths[_token];
        // hold token if no route
        if (path.length == 0) return false;
        // get token balance
        uint256 balance = IERC20(_token).balanceOf(address(this));
        // construct call data
        bytes memory data = abi.encodeWithSelector(swapRouter.exactInput.selector, ISwapRouter.ExactInputParams({
            path: path,
            recipient: address(this),
            // solhint-disable-next-line not-rely-on-time
            deadline: block.timestamp,
            amountIn: balance,
            amountOutMinimum: 0
        }));
        // low level call
        (_success, ) = address(swapRouter).call(data);
    }
}