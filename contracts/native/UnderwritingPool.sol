// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../utils/Governable.sol";
import "../interfaces/native/IPriceOracle.sol";
import "../interfaces/native/IUnderwritingPool.sol";


/**
 * @title IUnderwritingPool
 * @author solace.fi
 * @notice The underwriting pool of Solace Native.
 *
 * In Solace Native risk is backed by a basket of assets known as the underwriting pool (UWP). Shares of the pool are known as $UWP. [Governance](/docs/protocol/governance) can add or remove tokens from the basket and set their parameters (min and max in USD, price oracle) via [`addTokensToPool()`](#addtokenstopool) and [`removeTokensFromPool()`](#removetokensfrompool).
 *
 * Users can view tokens in the pool via [`tokensLength()`](#tokenslength), [`tokenData(address token)`](#tokendata), and [`tokenList(uint256 index)`](#tokenlist).
 *
 * Anyone can mint $UWP by calling [`issue()`](#issue) and depositing any of the tokens in the pool. Note that
 * - You will not be credited $UWP for raw transferring tokens to this contract. Use [`issue()`](#issue) instead.
 * - You do not need to deposit all of the tokens in the pool. Most users will deposit a single token.
 * - To manage risk, each token has a corresponding `min` and `max` measured in USD. Deposits must keep the pool within these bounds.
 * - Solace may charge a protocol fee as a fraction of the mint amount [`issueFee()`](#issuefee).
 *
 * Anyone can redeem their $UWP for tokens in the pool by calling [`redeem()`](#redeem). You will receive a fair portion of all assets in the pool.
 *
 * [Governance](/docs/protocol/governance) can pause and unpause [`issue()`](#issue). The other functions cannot be paused.
 */
contract UnderwritingPool is IUnderwritingPool, ERC20Permit, ReentrancyGuard, Governable {
    // dev: 'Len' and 'Index' may be prefixed with 'in' for input or 'st' for storage

    /***************************************
    STATE VARIABLES
    ***************************************/

    // amount of tokens in pool
    uint256 internal _tokensLength;

    // map of index to token and oracle
    mapping(uint256 => TokenData) internal _tokens;
    // map of token to index+1. if mapping returns zero, token is not in pool
    mapping(address => uint256) internal _tokenIndices;

    // issue fee in 18 decimals
    uint256 internal _issueFee;
    // receiver of issue fee
    address internal _issueFeeTo;
    // true if issue is paused. default false
    bool internal _isPaused;

    /**
     * @notice Constructs the `UnderwritingPool` contract.
     * @param governance_ The address of the governor.
     */
    // solhint-disable-next-line no-empty-blocks
    constructor (address governance_) ERC20("Solace Native Underwriting Pool", "UWP") ERC20Permit("Solace Native Underwriting Pool") Governable(governance_) { }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The number of tokens in the pool.
     * @return length The number of tokens in the pool.
     */
    function tokensLength() external view override returns (uint256 length) {
        return _tokensLength;
    }

    /**
     * @notice Information about a token in the pool.
     * @dev Returns a zero struct if token is not in the pool.
     * @param token The address of the token to query.
     * @return data Information about the token.
     */
    function tokenData(address token) external view override returns (TokenData memory data) {
        uint256 stIndex = _tokenIndices[token];
        if(stIndex == 0) return TokenData({
            token: address(0x0),
            oracle: address(0x0),
            min: 0,
            max: 0
        });
        return _tokens[stIndex-1];
    }

    /**
     * @notice The list of tokens in the pool.
     * @dev Iterable `[0, tokensLength)`.
     * @param index The index of the list to query.
     * @return data Information about the token.
     */
    function tokenList(uint256 index) external view override returns (TokenData memory data) {
        require(index < _tokensLength, "index out of bounds");
        return _tokens[index];
    }

    /**
     * @notice The fraction of `UWP` that are charged as a protocol fee on mint.
     * @return fee The fee as a fraction with 18 decimals.
     */
    function issueFee() external view override returns (uint256 fee) {
        return _issueFee;
    }

    /**
     * @notice The receiver of issue fees.
     * @return receiver The receiver of the fee.
     */
    function issueFeeTo() external view override returns (address receiver) {
        return _issueFeeTo;
    }

    /**
     * @notice Returns true if issue is paused.
     * @return paused Returns true if issue is paused.
     */
    function isPaused() external view override returns (bool paused) {
        return _isPaused;
    }

    /**
     * @notice Calculates the value of all assets in the pool in `USD`.
     * @return valueInUSD The value of the pool in `USD` with 18 decimals.
     */
    function valueOfPool() external view override returns (uint256 valueInUSD) {
        return _valueOfPool();
    }

    /**
     * @notice Calculates the value of one `UWP` in `USD`.
     * @return valueInUSD The value of one token in `USD` with 18 decimals.
     */
    function valuePerShare() external view override returns (uint256 valueInUSD) {
        uint256 ts = totalSupply();
        if(ts == 0) return 0;
        return _valueOfPool() * 1 ether / ts;
    }

    /**
     * @notice Determines the amount of tokens that would be minted for a given deposit.
     * @param depositTokens The list of tokens to deposit.
     * @param depositAmounts The amount of each token to deposit.
     * @return amount The amount of `UWP` minted.
     */
    function calculateIssue(address[] memory depositTokens, uint256[] memory depositAmounts) external view override returns (uint256 amount) {
        // checks
        uint256 inLen = depositTokens.length;
        require(inLen == depositAmounts.length, "length mismatch");
        // step 1: calculate the value of the pool
        uint256 poolValue = 0;
        uint256 stLen = _tokensLength;
        uint256[] memory tokenValues = new uint256[](stLen);
        // for each token in pool
        for(uint256 stIndex = 0; stIndex < stLen; stIndex++) {
            // get token and oracle
            TokenData storage data = _tokens[stIndex];
            address token = data.token;
            address oracle = data.oracle;
            // get value
            uint256 balance = IERC20(token).balanceOf(address(this));
            uint256 tokenValue = IPriceOracle(oracle).valueOfTokens(token, balance);
            // accumulate
            tokenValues[stIndex] = tokenValue;
            poolValue += tokenValue;
        }
        // step 2: pull tokens from msg.sender, calculate value
        uint256 depositValue = 0;
        // for each token to deposit
        for(uint256 inIndex = 0; inIndex < inLen; inIndex++) {
            address token = depositTokens[inIndex];
            uint256 stIndex = _tokenIndices[token];
            require(stIndex != 0, "token not in pool");
            stIndex--;
            TokenData storage data = _tokens[stIndex];
            // pull tokens
            uint256 depositAmount = depositAmounts[inIndex];
            // calculate value
            address oracle = data.oracle;
            uint256 tokenValue = IPriceOracle(oracle).valueOfTokens(token, depositAmount);
            depositValue += tokenValue;
            tokenValue += tokenValues[stIndex];
            tokenValues[stIndex] = tokenValue;
            // check min, max
            require(tokenValue >= data.min, "deposit too small");
            require(tokenValue <= data.max, "deposit too large");
        }
        // step 3: issue
        uint256 ts = totalSupply();
        uint256 mintAmount = (ts == 0 || poolValue == 0)
            ? depositValue
            : (ts * depositValue / poolValue);
        uint256 fee = mintAmount * _issueFee / 1 ether;
        if(fee > 0) {
            mintAmount -= fee;
        }
        return mintAmount;
    }

    /**
     * @notice Determines the amount of underlying tokens that would be received for an amount of `UWP`.
     * @param amount The amount of `UWP` to burn.
     * @return amounts The amount of each token received.
     */
    function calculateRedeem(uint256 amount) external view override returns (uint256[] memory amounts) {
        uint256 ts = totalSupply();
        require(amount <= ts, "redeem amount exceeds supply");
        uint256 stLen = _tokensLength;
        amounts = new uint256[](stLen);
        // for each token in pool
        for(uint256 stIndex = 0; stIndex < stLen; stIndex++) {
            // get token
            TokenData storage data = _tokens[stIndex];
            IERC20 token = IERC20(data.token);
            // get balance
            uint256 balance = token.balanceOf(address(this));
            // transfer out fair portion
            uint256 amt = balance * amount / ts;
            amounts[stIndex] = amt;
        }
        return amounts;
    }

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
    function issue(address[] memory depositTokens, uint256[] memory depositAmounts, address receiver) external override nonReentrant returns (uint256 amount) {
        // checks
        uint256 inLen = depositTokens.length;
        require(inLen == depositAmounts.length, "length mismatch");
        require(!_isPaused, "issue is paused");
        // step 1: calculate the value of the pool
        uint256 poolValue = 0;
        uint256 stLen = _tokensLength;
        uint256[] memory tokenValues = new uint256[](stLen);
        // for each token in pool
        for(uint256 stIndex = 0; stIndex < stLen; stIndex++) {
            // get token and oracle
            TokenData storage data = _tokens[stIndex];
            address token = data.token;
            address oracle = data.oracle;
            // get value
            uint256 balance = IERC20(token).balanceOf(address(this));
            uint256 tokenValue = IPriceOracle(oracle).valueOfTokens(token, balance);
            // accumulate
            tokenValues[stIndex] = tokenValue;
            poolValue += tokenValue;
        }
        // step 2: pull tokens from msg.sender, calculate value
        uint256 depositValue = 0;
        // for each token to deposit
        for(uint256 inIndex = 0; inIndex < inLen; inIndex++) {
            address token = depositTokens[inIndex];
            uint256 stIndex = _tokenIndices[token];
            require(stIndex != 0, "token not in pool");
            stIndex--;
            TokenData storage data = _tokens[stIndex];
            // pull tokens
            uint256 depositAmount = depositAmounts[inIndex];
            SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), depositAmount);
            // calculate value
            address oracle = data.oracle;
            uint256 tokenValue = IPriceOracle(oracle).valueOfTokens(token, depositAmount);
            depositValue += tokenValue;
            tokenValue += tokenValues[stIndex];
            tokenValues[stIndex] = tokenValue;
            // check min, max
            require(tokenValue >= data.min, "deposit too small");
            require(tokenValue <= data.max, "deposit too large");
        }
        // step 3: issue
        uint256 ts = totalSupply();
        uint256 mintAmount = (ts == 0 || poolValue == 0)
            ? depositValue
            : (ts * depositValue / poolValue);
        uint256 fee = mintAmount * _issueFee / 1 ether;
        if(fee > 0) {
            _mint(_issueFeeTo, fee);
            mintAmount -= fee;
        }
        _mint(receiver, mintAmount);
        emit IssueMade(msg.sender, mintAmount);
        return mintAmount;
    }

    /**
     * @notice Redeems some `UWP` for some of the tokens in the pool.
     * @param amount The amount of `UWP` to burn.
     * @param receiver The address to receive underlying tokens.
     * @return amounts The amount of each token received.
     */
    function redeem(uint256 amount, address receiver) external override nonReentrant returns (uint256[] memory amounts) {
        uint256 ts = totalSupply();
        _burn(msg.sender, amount);
        uint256 stLen = _tokensLength;
        amounts = new uint256[](stLen);
        // for each token in pool
        for(uint256 stIndex = 0; stIndex < stLen; stIndex++) {
            // get token
            TokenData storage data = _tokens[stIndex];
            IERC20 token = IERC20(data.token);
            // get balance
            uint256 balance = token.balanceOf(address(this));
            // transfer out fair portion
            uint256 amt = balance * amount / ts;
            amounts[stIndex] = amt;
            SafeERC20.safeTransfer(token, receiver, amt);
        }
        emit RedeemMade(msg.sender, amount);
        return amounts;
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Calculates the value of all assets in the pool in `USD`.
     * @return valueInUSD The value of the pool in `USD` with 18 decimals.
     */
    function _valueOfPool() internal view returns (uint256 valueInUSD) {
        valueInUSD = 0;
        uint256 stLen = _tokensLength;
        // for each token in pool
        for(uint256 stIndex = 0; stIndex < stLen; stIndex++) {
            // get token and oracle
            TokenData storage data = _tokens[stIndex];
            address token = data.token;
            address oracle = data.oracle;
            // get value
            uint256 balance = IERC20(token).balanceOf(address(this));
            uint256 tokenValue = IPriceOracle(oracle).valueOfTokens(token, balance);
            // accumulate
            valueInUSD += tokenValue;
        }
        return valueInUSD;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds tokens to the pool. If the token is already in the pool, sets its oracle, min, and max.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of tokens to add.
     */
    function addTokensToPool(TokenData[] memory tokens) external override onlyGovernance {
        uint256 inLen = tokens.length;
        uint256 stLen = _tokensLength;
        uint256 stLen0 = stLen;
        // for each token to add
        for(uint256 inIndex = 0; inIndex < inLen; inIndex++) {
            address token = tokens[inIndex].token;
            uint256 stIndex = _tokenIndices[token];
            // token not in pool. add new
            if(stIndex == 0) {
                stIndex = stLen;
                _tokens[stIndex] = tokens[inIndex];
                _tokenIndices[token] = stIndex + 1;
                stLen++;
            }
            // token already in pool. set oracle, min, max
            else {
                _tokens[stIndex-1] = tokens[inIndex];
            }
            emit TokenAdded(token);
        }
        if(stLen != stLen0) _tokensLength = stLen;
    }

    /**
     * @notice Removes tokens from the pool.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of tokens to remove.
     */
    function removeTokensFromPool(address[] memory tokens) external override onlyGovernance {
        uint256 inLen = tokens.length;
        uint256 stLen = _tokensLength;
        uint256 stLen0 = stLen;
        // for each token to remove
        for(uint256 inIndex = 0; inIndex < inLen; inIndex++) {
            address token = tokens[inIndex];
            uint256 stIndex = _tokenIndices[token];
            // token was not in pool anyways. skip
            if(stIndex == 0) continue;
            // token was at end of list. simple pop
            if(stIndex == stLen) {
                stLen--;
                delete _tokens[stLen];
                delete _tokenIndices[token];
            }
            // token was not at end of list. remove and shuffle
            else {
                stLen--;
                _tokenIndices[_tokens[stLen].token] = stIndex;
                _tokens[stIndex-1] = _tokens[stLen];
                delete _tokens[stLen];
                delete _tokenIndices[token];
            }
            emit TokenRemoved(token);
        }
        if(stLen != stLen0) _tokensLength = stLen;
    }

    /**
     * @notice Rescues misplaced tokens.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The list of tokens to rescue.
     * @param receiver The receiver of the tokens.
     */
    function rescueTokens(address[] memory tokens, address receiver) external override nonReentrant onlyGovernance {
        // for each requested token
        uint256 inLen = tokens.length;
        for(uint256 inIndex = 0; inIndex < inLen; inIndex++) {
            address token = tokens[inIndex];
            // cannot rescue valued underlying tokens
            require(_tokenIndices[token] == 0, "cannot rescue that token");
            // send balance to receiver
            IERC20 tkn = IERC20(token);
            uint256 balance = tkn.balanceOf(address(this));
            SafeERC20.safeTransfer(tkn, receiver, balance);
        }
    }

    /**
     * @notice Sets the issue fee and receiver.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param fee The fee as a fraction with 18 decimals.
     * @param receiver The receiver of the fee.
     */
    function setIssueFee(uint256 fee, address receiver) external override onlyGovernance {
        require(fee <= 1 ether, "invalid issue fee");
        require(fee == 0 || receiver != address(0x0), "invalid issue fee to");
        _issueFee = fee;
        _issueFeeTo = receiver;
        emit IssueFeeSet(fee, receiver);
    }

    /**
     * @notice Pauses or unpauses issue.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param pause True to pause issue, false to unpause.
     */
    function setPause(bool pause) external override onlyGovernance {
        _isPaused = pause;
        emit PauseSet(pause);
    }
}
