// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../utils/Governable.sol";
import "../interfaces/native/IFluxPriceFeed.sol";
import "../interfaces/native/IFluxMegaOracle.sol";


/**
 * @title FluxMegaOracle
 * @author solace.fi
 * @notice An oracle that consumes data from [Flux](https://fluxprotocol.org) and returns it in a useable format.
 *
 * [Governance](/docs/protocol/governance) can add or remove price feeds via [`addPriceFeeds()`](#addpricefeeds) and [`removePriceFeeds()`](#removepricefeeds). Users can view price feeds via [`priceFeedForToken(address token)`](#pricefeedfortoken). Users can use the price feeds via [`valueOfTokens()`](#valueoftokens).
 */
contract FluxMegaOracle is IFluxMegaOracle, Governable {

    mapping(address => PriceFeedData) internal _priceFeeds;

    /***************************************
    STATE VARIABLES
    ***************************************/

    /**
     * @notice Constructs the `FluxMegaOracle` contract.
     * @param governance_ The address of the governor.
     */
    // solhint-disable-next-line no-empty-blocks
    constructor (address governance_) Governable(governance_) { }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns information about the price feed for a token.
     * @dev Returns a zero struct if no known price feed.
     * @param token The token to query price feed data of.
     * @return data Information about te price feed.
     */
    function priceFeedForToken(address token) external view override returns (PriceFeedData memory data) {
        return _priceFeeds[token];
    }

    /**
     * @notice Given an amount of some token, calculates the value in `USD`.
     * @dev Returns zero if no known price feed for the token.
     * @param token The address of the token to price.
     * @param amount The amount of the token to price.
     * @return valueInUSD The value in `USD` with 18 decimals.
     */
    function valueOfTokens(address token, uint256 amount) external view override returns (uint256 valueInUSD) {
        PriceFeedData memory feed = _priceFeeds[token];
        if(feed.oracle == address(0x0)) return 0;
        int256 answer = IFluxPriceFeed(feed.oracle).latestAnswer();
        require(answer >= 0, "negative price");
        return (amount * uint256(answer) * 1 ether) / (10 ** (feed.tokenDecimals + feed.oracleDecimals));
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds price feeds.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param feeds The list of price feeds to add.
     */
    function addPriceFeeds(PriceFeedData[] memory feeds) external override onlyGovernance {
        for(uint256 i = 0; i < feeds.length; i++) {
            PriceFeedData memory feed = feeds[i];
            address token = feed.token;
            _priceFeeds[token] = feed;
            emit PriceFeedAdded(token);
        }
    }

    /**
     * @notice Removes price feeds.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of price feeds to remove.
     */
    function removePriceFeeds(address[] memory tokens) external override onlyGovernance {
        for(uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            delete _priceFeeds[token];
            emit PriceFeedRemoved(token);
        }
    }
}
