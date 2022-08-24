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
 * [Governance](/docs/protocol/governance) can add or remove price feeds via [`addPriceFeeds()`](#addpricefeeds) and [`removePriceFeeds()`](#removepricefeeds). Users can view price feeds via [`priceFeedForToken(address token)`](#pricefeedfortoken). Users can use the price feeds via [`valueOfTokens()`](#valueoftokens). Users can list price feeds via [`tokensLength()`](#tokenslength) and [`tokenByIndex()`](#tokenbyindex).
 */
contract FluxMegaOracle is IFluxMegaOracle, Governable {

    // token => data
    mapping(address => PriceFeedData) internal _priceFeeds;
    // index => token
    mapping(uint256 => address) internal _indexToToken;
    // token => index+1
    mapping(address => uint256) internal _tokenToIndex;
    uint256 internal _tokensLength;

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
     * @notice Lists the tokens in the oracle.
     * @dev Enumerable `[0,tokensLength]`
     * @param index The index to query.
     * @return token The address of the token at that index.
     */
    function tokenByIndex(uint256 index) external view override returns (address token) {
        require(index < _tokensLength, "index out of bounds");
        return _indexToToken[index];
    }

    /**
     * @notice The number of tokens with feeds in this oracle.
     * @return len The number of tokens.
     */
    function tokensLength() external view override returns (uint256 len) {
        return _tokensLength;
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
        if(feed.priceFeed == address(0x0)) return 0;
        int256 answer = IFluxPriceFeed(feed.priceFeed).latestAnswer();
        require(answer >= 0, "negative price");
        return (amount * uint256(answer) * 1 ether) / (10 ** (feed.tokenDecimals + feed.priceFeedDecimals));
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
        uint256 stLen = _tokensLength;
        uint256 stLen0 = stLen;
        for(uint256 i = 0; i < feeds.length; i++) {
            // add to feed mapping
            PriceFeedData memory feed = feeds[i];
            address token = feed.token;
            _priceFeeds[token] = feed;
            // add to token enumeration
            if(_tokenToIndex[token] == 0) {
                uint256 index = stLen++; // autoincrement from 0
                _indexToToken[index] = token;
                _tokenToIndex[token] = index + 1;
            }
            emit PriceFeedAdded(token);
        }
        if(stLen != stLen0) _tokensLength = stLen;
    }

    /**
     * @notice Removes price feeds.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of price feeds to remove.
     */
    function removePriceFeeds(address[] memory tokens) external override onlyGovernance {
        uint256 stLen = _tokensLength;
        uint256 stLen0 = stLen;
        for(uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            delete _priceFeeds[token];
            uint256 stIndex = _tokenToIndex[token];
            // token was not in pool anyways. skip
            if(stIndex == 0) continue;
            // token was at end of list. simple pop
            if(stIndex == stLen) {
                stLen--;
                delete _tokenToIndex[token];
                delete _indexToToken[stIndex-1];
            }
            // token was not at end of list. remove and shuffle
            else {
                stLen--;
                address otherToken = _indexToToken[stLen];
                _indexToToken[stIndex-1] = otherToken;
                delete _indexToToken[stLen];
                _tokenToIndex[otherToken] = stIndex;
                delete _tokenToIndex[token];
            }
            emit PriceFeedRemoved(token);
        }
        if(stLen != stLen0) _tokensLength = stLen;
    }
}
