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
     * @param _oneSplitView The address of the 1inch router.
     */
    constructor(address _oneSplitView) {
        oneSplitView = IOneSplitView(_oneSplitView);
    }

    /**
     * @notice Calculates the exchange rate for an `_amount` of `_token` to **ETH**.
     * @param _token The token to give.
     * @param _amount The amount to give.
     * @return _amountOut The amount of **ETH** received.
     */
    function tokenToEth(address _token, uint256 _amount) public view override returns (uint256 _amountOut) {
        // call one inch
        (_amountOut, ) = oneSplitView.getExpectedReturn(_token, ETH_ADDRESS, _amount, 1, 0);
        return _amountOut;
    }
}
