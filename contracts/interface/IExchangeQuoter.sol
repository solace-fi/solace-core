// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title IExchangeQuoter
 * @author solace.fi
 * @notice Calculates exchange rates for trades between ERC20 tokens and Ether.
 */
interface IExchangeQuoter {
    /**
     * @notice Calculates the exchange rate for an amount of token to eth.
     * @param token The token to give.
     * @param amount The amount to give.
     * @return amountOut The amount of eth received.
     */
    function tokenToEth(address token, uint256 amount) external view returns (uint256 amountOut);
}
