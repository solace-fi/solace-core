// SPDX-License-Identifier: GPL-2.0-or-later
// code borrowed from @uniswap/v3-periphery
pragma solidity 0.8.0;

import "./IUniswapV3SwapCallback.sol";


/// @title Router token swapping functionality
/// @notice Functions for swapping tokens via Uniswap V3
interface ISwapRouter is IUniswapV3SwapCallback {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    struct ExactOutputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
    }

    /// @notice Swaps `amountIn` of one token for as much as possible of another along the specified path
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);

    /// @notice Swaps as little as possible of one token for `amountOut` of another along the specified path (reversed)
    function exactOutput(ExactOutputParams calldata params) external payable returns (uint256 amountIn);
}
