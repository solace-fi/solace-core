// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/IOneSplitView.sol";
import "../interface/IExchangeQuoter.sol";


/**
 * @title ExchangeQuoter1InchV1
 * @author solace.fi
 * @notice Calculates exchange rates for trades between ERC20 tokens and Ether. This version uses the [1inch on-chain DeFi aggregation protocol](https://github.com/1inch/1inchProtocol) that was used in [**Legacy 1Inch exchange**])https://legacy.1inch.exchange/).
 */
contract ExchangeQuoter1InchV1 is IExchangeQuoter {
    /// @notice IOneSplitView
    IOneSplitView public oneSplitView;
    // ETH_ADDRESS
    // solhint-disable-next-line var-name-mixedcase
    address internal _ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /**
     * @notice Constructs the ExchangeQuoter1InchV1 contract.
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
        if(token == _ETH_ADDRESS) return amount;
        // call one inch
        (amountOut, ) = oneSplitView.getExpectedReturn(token, _ETH_ADDRESS, amount, 1, 0);
        return amountOut;
    }
}
