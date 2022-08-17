// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


/**
 * @title IUnderwritingPool
 * @author solace.fi
 * @notice The underwriting pool of Solace Native.
 *
 * In Solace Native risk is backed by a basket of assets known as the underwriting pool (UWP). Shares of the pool are known as `UWP` and are represented as an ERC20 token. [Governance](/docs/protocol/governance) can add or remove tokens from the basket and set their parameters (min and max in USD, price oracle) via [`addTokensToPool()`](#addtokenstopool) and [`removeTokensFromPool()`](#removetokensfrompool).
 *
 * Users can view tokens in the pool via [`tokensLength()`](#tokenslength), [`tokenData(address token)`](#tokendata), and [`tokenList(uint256 index)`](#tokenlist).
 *
 * Anyone can mint `UWP` by calling [`issue()`](#issue) and depositing any of the tokens in the pool. Note that
 * - You will not be credited `UWP` for raw transferring tokens to this contract. Use [`issue()`](#issue) instead.
 * - You do not need to deposit all of the tokens in the pool. Most users will deposit a single token.
 * - To manage risk, each token has a corresponding `min` and `max` measured in USD. Deposits must keep the pool within these bounds.
 * - Solace may charge a protocol fee as a fraction of the mint amount [`issueFee()`](#issuefee).
 *
 * Anyone can redeem their `UWP` for tokens in the pool by calling [`redeem()`](#redeem). You will receive a fair portion of all assets in the pool.
 *
 * [Governance](/docs/protocol/governance) can pause and unpause [`issue()`](#issue). The other functions cannot be paused.
 */
interface IUnderwritingPool is IERC20Metadata {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a token is added to the pool.
    event TokenAdded(address indexed token);
    /// @notice Emitted when a token is removed from the pool.
    event TokenRemoved(address indexed token);
    /// @notice Emitted when uwp is issued.
    event IssueMade(address user, uint256 amount);
    /// @notice Emitted when uwp is redeemed.
    event RedeemMade(address user, uint256 amount);
    /// @notice Emitted when issue fee is set.
    event IssueFeeSet(uint256 fee, address receiver);
    /// @notice Emitted when pause is set.
    event PauseSet(bool issueIsPaused);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    struct TokenData {
        address token;
        address oracle;
        uint256 min;
        uint256 max;
    }

    /**
     * @notice The number of tokens in the pool.
     * @return length The number of tokens in the pool.
     */
    function tokensLength() external view returns (uint256 length);

    /**
     * @notice Information about a token in the pool.
     * @param token The address of the token to query.
     * @return data Information about the token.
     */
    function tokenData(address token) external view returns (TokenData memory data);

    /**
     * @notice The list of tokens in the pool.
     * @dev Iterable `[0, tokensLength)`.
     * @param index The index of the list to query.
     * @return data Information about the token.
     */
    function tokenList(uint256 index) external view returns (TokenData memory data);

    /**
     * @notice The fraction of `UWP` that are charged as a protocol fee on mint.
     * @return fee The fee as a fraction with 18 decimals.
     */
    function issueFee() external view returns (uint256 fee);

    /**
     * @notice The receiver of issue fees.
     * @return receiver The receiver of the fee.
     */
    function issueFeeTo() external view returns (address receiver);

    /**
     * @notice Returns true if issue is paused.
     * @return paused Returns true if issue is paused.
     */
    function isPaused() external view returns (bool paused);

    /**
     * @notice Calculates the value of all assets in the pool in `USD`.
     * @return valueInUSD The value of the pool in `USD` with 18 decimals.
     */
    function valueOfPool() external view returns (uint256 valueInUSD);

    /**
     * @notice Calculates the value of an amount of `UWP` shares in `USD`.
     * @param shares The amount of shares to query.
     * @return valueInUSD The value of the shares in `USD` with 18 decimals.
     */
    function valueOfShares(uint256 shares) external view returns (uint256 valueInUSD);

    /**
     * @notice Calculates the value of a holders `UWP` shares in `USD`.
     * @param holder The holder to query.
     * @return valueInUSD The value of the users shares in `USD` with 18 decimals.
     */
    function valueOfHolder(address holder) external view returns (uint256 valueInUSD);

    /**
     * @notice Determines the amount of tokens that would be minted for a given deposit.
     * @param depositTokens The list of tokens to deposit.
     * @param depositAmounts The amount of each token to deposit.
     * @return amount The amount of `UWP` minted.
     */
    function calculateIssue(address[] memory depositTokens, uint256[] memory depositAmounts) external view returns (uint256 amount);

    /**
     * @notice Determines the amount of underlying tokens that would be received for an amount of `UWP`.
     * @param amount The amount of `UWP` to burn.
     * @return amounts The amount of each token received.
     */
    function calculateRedeem(uint256 amount) external view returns (uint256[] memory amounts);

    /***************************************
    MODIFIER FUNCTIONS
    ***************************************/

    /**
     * @notice Deposits one or more tokens into the pool.
     * @param depositTokens The list of tokens to deposit.
     * @param depositAmounts The amount of each token to deposit.
     * @param receiver The address to send newly minted `UWP` to.
     * @return amount The amount of `UWP` minted.
     */
    function issue(address[] memory depositTokens, uint256[] memory depositAmounts, address receiver) external returns (uint256 amount);

    /**
     * @notice Redeems some `UWP` for some of the tokens in the pool.
     * @param amount The amount of `UWP` to burn.
     * @param receiver The address to receive underlying tokens.
     * @return amounts The amount of each token received.
     */
    function redeem(uint256 amount, address receiver) external returns (uint256[] memory amounts);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds tokens to the pool. If the token is already in the pool, sets its oracle, min, and max.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of tokens to add.
     */
    function addTokensToPool(TokenData[] memory tokens) external;

    /**
     * @notice Removes tokens from the pool.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of tokens to remove.
     */
    function removeTokensFromPool(address[] memory tokens) external;

    /**
     * @notice Rescues misplaced tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of tokens to rescue.
     * @param receiver The receiver of the tokens.
     */
    function rescueTokens(address[] memory tokens, address receiver) external;

    /**
     * @notice Sets the issue fee and receiver.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param fee The fee as a fraction with 18 decimals.
     * @param receiver The receiver of the fee.
     */
    function setIssueFee(uint256 fee, address receiver) external;

    /**
     * @notice Pauses or unpauses issue.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param pause True to pause issue, false to unpause.
     */
    function setPause(bool pause) external;
}
