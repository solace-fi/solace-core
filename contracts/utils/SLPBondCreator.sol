// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.6;


import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./../interfaces/bonds/IBondTellerErc20.sol";

contract SLPBondCreator {

    address public immutable sushiswapRouterAddress;
    address public immutable usdcAddress;
    address public immutable solaceAddress;
    address public immutable slpAddress;
    address public immutable slpBondingAddress;

    constructor(address sushiswapRouterAddress_, address usdcAddress_, address solaceAddress_, address slpAddress_, address slpBondingAddress_) {
        require(sushiswapRouterAddress_ != address(0x0), "zero address router");
        require(usdcAddress_ != address(0x0), "zero address usdc");
        require(solaceAddress_ != address(0x0), "zero address solace");
        require(slpAddress_ != address(0x0), "zero address slp");
        require(slpBondingAddress_ != address(0x0), "zero address slp bonding");
        sushiswapRouterAddress = sushiswapRouterAddress_;
        usdcAddress = usdcAddress_;
        solaceAddress = solaceAddress_;
        slpAddress = slpAddress_;
        slpBondingAddress = slpBondingAddress_;
    }

    function createSLPTokens(uint256 timeNow) external returns (uint256 slp) {
        uint256 senderUSDCBalance = IERC20(usdcAddress).balanceOf(msg.sender);
        require(senderUSDCBalance > 0, "USDC balance = 0");
        require(_transferAllUSDCToThisAddress(senderUSDCBalance), "USDC transfer failure");
        uint256 halfUSDC = senderUSDCBalance/2;
        IERC20(usdcAddress).approve(sushiswapRouterAddress, senderUSDCBalance);
        uint256 solaceBalance = _buySolaceForUSDC(halfUSDC, timeNow)[1];
        IERC20(solaceAddress).approve(sushiswapRouterAddress, solaceBalance);
        uint slpBalance;
        ( , ,slpBalance)=_addLiquidity(halfUSDC, solaceBalance, timeNow);
        _refundDust(usdcAddress);
        _refundDust(solaceAddress);
        return slpBalance;
    }

    function createBondWithSLP() external {
        uint256 slpBalance = IERC20(slpAddress).balanceOf(msg.sender);
        require(IERC20(slpAddress).allowance(msg.sender, slpBondingAddress) >= slpBalance,
                "Approve total SLP balance");
        uint256 minAmountOut = IBondTellerErc20(slpBondingAddress).calculateAmountOut(slpBalance, false)*98/100;
        IBondTellerErc20(slpBondingAddress).deposit(
            slpBalance,
            minAmountOut,
            msg.sender,
            false
        );
    }

    function _refundDust(address token) private {
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        if(tokenBalance > 0) {
            IERC20(token).transfer(msg.sender, tokenBalance);
        }
    }

    function _transferAllUSDCToThisAddress(uint256 usdcBalance) private returns (bool success) {
        require(IERC20(usdcAddress).allowance(msg.sender, address(this)) >= usdcBalance,
                 "Approve total USDC balance");
        return IERC20(usdcAddress).transferFrom(msg.sender, address(this), usdcBalance);
    }

    function _buySolaceForUSDC(uint256 halfBalanceUSDC, uint256 timeNow) private returns (uint[] memory amounts){
        address[] memory path = _getPathForUSDCtoSOLACE();
        uint256 solaceMinAmount = IUniswapV2Router01(sushiswapRouterAddress).getAmountsOut(halfBalanceUSDC, path)[1]*98/100; //slippage 2%
        return IUniswapV2Router01(sushiswapRouterAddress).swapExactTokensForTokens(
            halfBalanceUSDC,
            solaceMinAmount,
            path,
            address(this),
            timeNow + 60
        );
    }

    function _getPathForUSDCtoSOLACE() private view returns (address[] memory) {
        address[] memory path = new address[](2);
        path[0] = usdcAddress;
        path[1] = solaceAddress;
        return path;
    }

    function _addLiquidity(uint256 usdcToLP, uint256 solaceToLP, uint256 timeNow) private returns (uint amountA, uint amountB, uint liquidity) {
        return IUniswapV2Router01(sushiswapRouterAddress).addLiquidity(
            usdcAddress,
            solaceAddress,
            usdcToLP,
            solaceToLP,
            usdcToLP*98/100,
            solaceToLP*98/100,
            msg.sender,
            timeNow+60
        );
    }
}