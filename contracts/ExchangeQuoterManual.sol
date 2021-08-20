// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./interface/IExchangeQuoter.sol";


/**
 * @title ExchangeQuoterManual
 * @author solace.
 * @notice Calculates exchange rates for trades between ERC20 tokens and Ether. This version uses rates set by governance.
 */
contract ExchangeQuoterManual is IExchangeQuoter, Governable {

    /// @notice given a token, how much eth could one token buy (respecting decimals)
    mapping(address => uint256) public rates;

    /**
     * @notice Constructs the ExchangeQuoter contract.
     * @param governance_ The address of the [governor](/docs/user-docs/Governance).
     */
    constructor(address governance_) Governable(governance_) { }

    /**
     * @notice Sets the exchange rates.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param tokens The tokens to set.
     * @param newRates The rates to set.
     */
    function setRates(address[] calldata tokens, uint256[] calldata newRates) external onlyGovernance {
        uint256 length = tokens.length;
        require(length == newRates.length, "unequal lengths");
        for(uint256 i = 0; i < length; ++i) {
            rates[tokens[i]] = newRates[i];
        }
    }

    /**
     * @notice Calculates the exchange rate for an amount of token to eth.
     * @param token The token to give.
     * @param amount The amount to give.
     * @return amountOut The amount of eth received.
     */
    function tokenToEth(address token, uint256 amount) external view override returns (uint256 amountOut) {
        return amount * rates[token] / (10 ** IERC20Metadata(token).decimals());
    }
}
