// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IPriceOracle.sol";

/**
 * @title IFluxMegaOracle
 * @author solace.fi
 * @notice An oracle that consumes data from [Flux](https://fluxprotocol.org) and returns it in a useable format.
 *
 * [Governance](/docs/protocol/governance) can add or remove price feeds via [`addPriceFeeds()`](#addpricefeeds) and [`removePriceFeeds()`](#removepricefeeds). Users can view price feeds via [`priceFeedForToken(address token)`](#pricefeedfortoken). Users can use the price feeds via [`valueOfTokens()`](#valueoftokens).
 */
interface IFluxMegaOracle is IPriceOracle {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a price feed is added.
    event PriceFeedAdded(address indexed token);
    /// @notice Emitted when a price feed is removed.
    event PriceFeedRemoved(address indexed token);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    struct PriceFeedData {
        address token;
        address oracle;
        uint8 tokenDecimals;
        uint8 oracleDecimals;
    }

    /**
     * @notice Returns information about the price feed for a token.
     * @dev Returns a zero struct if no known price feed.
     * @param token The token to query price feed data of.
     * @return data Information about te price feed.
     */
    function priceFeedForToken(address token) external view returns (PriceFeedData memory data);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds price feeds.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param feeds The list of price feeds to add.
     */
    function addPriceFeeds(PriceFeedData[] memory feeds) external;

    /**
     * @notice Removes price feeds.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of price feeds to remove.
     */
    function removePriceFeeds(address[] memory tokens) external;
}
