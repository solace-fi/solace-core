// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./interface/IOneSplitView.sol";
import "./interface/IExchangeQuoter.sol";


/**
 * @title ExchangeQuoter
 * @author solace.
 * @notice Calculates exchange rates for trades between ERC20 tokens.
 */
contract ExchangeQuoter is IExchangeQuoter {

    IOneSplitView public oneSplitView;
    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /**
     * @notice Constructs the ExchangeQuoter contract.
     * @param _oneSplitView Address of the 1inch router.
     */
    constructor(address _oneSplitView) {
        oneSplitView = IOneSplitView(_oneSplitView);
    }

    /**
     * @notice Calculates the exchange rate for an _amount of _token to eth.
     * @param _token The token to give.
     * @param _amount The amount to give.
     * @return The amount of eth received.
     */
    function tokenToEth(address _token, uint256 _amount) public view override returns (uint256) {
        // call one inch
        (uint256 returnAmount, ) = oneSplitView.getExpectedReturn(_token, ETH_ADDRESS, _amount, 1, 0);
        return returnAmount;
        // TODO: possibly switch to chainlink oracle and 1 inch v3
    }
}
