// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../utils/Governable.sol";
import "../interfaces/native/ISolaceMegaOracle.sol";


/**
 * @title SolaceMegaOracle
 * @author solace.fi
 * @notice An oracle that consumes data from Solace updaters and returns it in a useable format.
 *
 * [Governance](/docs/protocol/governance) can add or remove updater bots via [`setUpdaterStatuses()`](#setupdaterstatuses). Users can view updater status via [`isUpdater()`](#isupdater).
 */
contract SolaceMegaOracle is ISolaceMegaOracle, Governable {

    /***************************************
    STATE VARIABLES
    ***************************************/

    // token => data
    mapping(address => PriceFeedData) internal _priceFeeds;
    // index => token
    mapping(uint256 => address) internal _indexToToken;
    // token => index+1
    mapping(address => uint256) internal _tokenToIndex;
    // number of tokens known
    uint256 internal _tokensLength;

    // updater => status
    mapping(address => bool) internal _isUpdater;

    /**
     * @notice Constructs the `SolaceMegaOracle` contract.
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
        return (amount * feed.latestPrice * 1 ether) / (10 ** (feed.tokenDecimals + feed.priceFeedDecimals));
    }

    /**
     * @notice Returns the status of an updater.
     * @param updater The account to query.
     * @return status True if the account has the updater role, false otherwise.
     */
    function isUpdater(address updater) external view override returns (bool status) {
        return _isUpdater[updater];
    }

    /***************************************
    UPDATER FUNCTIONS
    ***************************************/

    /**
     * @notice Sets metadata for each token and adds it to the token enumeration.
     * Can only be called by an `updater`.
     * @param feeds The list of feeds to set.
     */
    function addPriceFeeds(PriceFeedData[] memory feeds) external override {
        require(_isUpdater[msg.sender], "!updater");
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
     * @notice Sets latest price for each token.
     * Can only be called by an `updater`.
     * @param tokens The list of token addresses to set prices for.
     * @param prices The list of prices for each token.
     */
    function transmit(address[] memory tokens, uint256[] memory prices) external override {
        require(_isUpdater[msg.sender], "!updater");
        uint256 len = tokens.length;
        require(len == prices.length, "length mismatch");
        for(uint256 i = 0; i < len; i++) {
            _priceFeeds[tokens[i]].latestPrice = prices[i];
            emit PriceTransmitted(tokens[i], prices[i]);
        }
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds or removes updaters.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param updaters The list of updater addresses to add or remove.
     * @param statuses A list of true to set as updater false otherwise.
     */
    function setUpdaterStatuses(address[] memory updaters, bool[] memory statuses) external override onlyGovernance {
        uint256 len = updaters.length;
        require(len == statuses.length, "length mismatch");
        for(uint256 i = 0; i < len; i++) {
            _isUpdater[updaters[i]] = statuses[i];
            emit UpdaterSet(updaters[i], statuses[i]);
        }
    }
}
