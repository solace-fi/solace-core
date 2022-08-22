// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IPriceOracle.sol";

/**
 * @title ISolaceMegaOracle
 * @author solace.fi
 * @notice An oracle that consumes data from Solace updaters and returns it in a useable format.
 *
 * [Governance](/docs/protocol/governance) can add or remove updater bots via [`setUpdaterStatuses()`](#setupdaterstatuses). Users can view updater status via [`isUpdater()`](#isupdater). Updaters can update prices via [`transmit()`](#transmit).
 *
 * price feeds via [`priceFeedForToken(address token)`](#pricefeedfortoken). Users can use the price feeds via [`valueOfTokens()`](#valueoftokens). Users can list price feeds via [`tokensLength()`](#tokenslength) and [`tokenByIndex()`](#tokenbyindex).
 */
interface ISolaceMegaOracle is IPriceOracle {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a price feed metadata is set.
    event PriceFeedAdded(address indexed token);
    /// @notice Emitted when a price is transmitted.
    event PriceTransmitted(address indexed token, uint256 price);
    /// @notice Emitted when an updater is added or removed.
    event UpdaterSet(address indexed updater, bool status);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    struct PriceFeedData {
        uint256 latestPrice;
        address token;
        uint8 tokenDecimals;
        uint8 priceFeedDecimals;
    }

    /**
     * @notice Returns information about the price feed for a token.
     * @dev Returns a zero struct if no known price feed.
     * @param token The token to query price feed data of.
     * @return data Information about te price feed.
     */
    function priceFeedForToken(address token) external view returns (PriceFeedData memory data);

    /**
     * @notice Lists the tokens in the oracle.
     * @dev Enumerable `[0,tokensLength]`
     * @param index The index to query.
     * @return token The address of the token at that index.
     */
    function tokenByIndex(uint256 index) external view returns (address token);

    /**
     * @notice The number of tokens with feeds in this oracle.
     * @return len The number of tokens.
     */
    function tokensLength() external view returns (uint256 len);

    /**
     * @notice Returns the status of an updater.
     * @param updater The account to query.
     * @return status True if the account has the updater role, false otherwise.
     */
    function isUpdater(address updater) external view returns (bool status);

    /***************************************
    UPDATER FUNCTIONS
    ***************************************/

    /**
     * @notice Sets metadata for each token and adds it to the token enumeration.
     * Can only be called by an `updater`.
     * @param feeds The list of feeds to set.
     */
    function addPriceFeeds(PriceFeedData[] memory feeds) external;

    /**
     * @notice Sets latest price for each token.
     * Can only be called by an `updater`.
     * @param tokens The list of token addresses to set prices for.
     * @param prices The list of prices for each token.
     */
    function transmit(address[] memory tokens, uint256[] memory prices) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds or removes updaters.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param updaters The list of updater addresses to add or remove.
     * @param statuses A list of true to set as updater false otherwise.
     */
    function setUpdaterStatuses(address[] memory updaters, bool[] memory statuses) external;
}
