// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./interface/IOneSplitView.sol";
import "./interface/IExchangeQuoter.sol";


/**
 * @title ExchangeQuoter
 * @author solace.fi
 * @notice Calculates exchange rates for trades between ERC20 tokens and Ether. This version uses the [1inch on-chain DeFi aggregation protocol](https://github.com/1inch/1inchProtocol).
 */
contract ExchangeQuoter is IExchangeQuoter {
    /// @notice IOneSplitView
    IOneSplitView public oneSplitView;
    /// @notice ETH_ADDRESS
    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /**
     * @notice Constructs the ExchangeQuoter contract.
     * @param oneSplitView_ The address of the 1inch router.
     */
    constructor(address oneSplitView_) {
        oneSplitView = IOneSplitView(oneSplitView_);
    }

    /**
     * @notice Calculates the exchange rate for an `amount` of `token` to **ETH**.
     * @param token The token to give.
     * @param amount The amount to give.
     * @return amountOut The amount of **ETH** received.
     */
    function tokenToEth(address token, uint256 amount) public view override returns (uint256 amountOut) {
        // call one inch
        (amountOut, ) = oneSplitView.getExpectedReturn(token, ETH_ADDRESS, amount, 1, 0);
        return amountOut;
    }
}
