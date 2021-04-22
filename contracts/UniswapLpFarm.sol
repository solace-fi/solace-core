// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./libraries/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./libraries/TickBitmap.sol";
import "./interface/IUniswapLpToken.sol";
import "./interface/IUniswapV3Pool.sol";
import "./interface/IUniswapLpFarm.sol";

/**
 * @title UniswapLpFarm: A farm that allows for the staking of Uniswap LP tokens.
 * @author solace.fi
 */
contract UniswapLpFarm is IUniswapLpFarm {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;
    using TickBitmap for mapping(int16 => uint256);

    /// @notice A unique enumerator that identifies the farm type.
    uint256 public override farmType = 2;

    address public override stakeToken;        // Address of token to stake.
    IUniswapLpToken public override lpToken;   // LP Token interface.
    address public override rewardToken;       // Address of token to receive.
    uint256 public override blockReward;       // Amount of rewardToken distributed per block.
    uint256 public override startBlock;        // When the farm will start.
    uint256 public override endBlock;          // When the farm will end.
    uint256 public override lastRewardBlock;   // Last time rewards were distributed or farm was updated.
    uint256 public override accRewardPerShare; // Accumulated rewards per share, times 1e12.
    uint256 public override valueStaked;       // Value of tokens currently in range.

    // Info of each user.
    struct UserInfo {
        uint256 value;        // Value of active user provided tokens.
        uint256 rewardDebt;   // Reward debt. See explanation below.
        int256 unpaidRewards; // Rewards that have not been paid.
        //
        // We do some fancy math here. Basically, any point in time, the amount of reward token
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.value * accRewardPerShare) - user.rewardDebt + user.unpaidRewards
        //
        // Whenever a user deposits or withdraws LP tokens to a farm, here's what happens:
        //   1. The farm's `accRewardPerShare` and `lastRewardBlock` get updated.
        //   2. User receives the pending reward sent to his/her address.
        //      Unsent rewards will be accumulated in `unpaidRewards`.
        //   3. User's `value` gets updated.
        //   4. User's `rewardDebt` gets updated.
        //
        // The farm may lag behind its underlying pool.
        // If a swap occurred in the pool that caused it to cross a tick that is initialized in the farm, here's what happens:
        //   1. The farm's `accRewardPerShare` and `lastRewardBlock` get updated according to the farm's last recorded tick.
        //   2. LP tokens are activated or deactivated as necessary.
        //      LP tokens that are deactivated incur a debt, subtracted from `unpaidRewards`.
        //      LP tokens that are activated receive a bonus, added to `unpaidRewards`.
    }

    /// @notice Information about each farmer.
    /// @dev user address => user info
    mapping(address => UserInfo) public userInfo;

    struct TickInfo {
        int256 valueNet;              // The value of the tokens to activate (deactivate) when crossing the tick left to right (right to left).
        EnumerableSet.UintSet tokens; // The set of tokens with one side of their tick range at this tick.
    }

    mapping(int24 => TickInfo) private ticks;    // Tick number to tick info.
    mapping(int16 => uint256) private tickBitmap; // Track tick activation status.

    struct TokenInfo {
        address depositor;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 value;
    }

    mapping(uint256 => TokenInfo) public tokenInfo;

    /// @notice Governor.
    address public override governance;

    /// @notice Master contract.
    address public override master;

    // Pool variables.
    IUniswapV3Pool public pool;
    address public token0;
    address public token1;
    uint24 public fee;
    int24 public tickSpacing;
    int24 public lastTick;

    // list of tokens deposited by user
    mapping(address => EnumerableSet.UintSet) private userDeposited;

    /**
     * @notice Constructs the farm.
     * @param _rewardToken Address of the reward token.
     * @param _master Address of the Master contract.
     */
    constructor(
        address _master,
        address _stakeToken,
        address _rewardToken,
        uint256 _startBlock,
        uint256 _endBlock,
        address _pool
    ) public {
        // copy params
        master = _master;
        stakeToken = _stakeToken;
        lpToken = IUniswapLpToken(_stakeToken);
        rewardToken = _rewardToken;
        startBlock = _startBlock;
        endBlock = _endBlock;
        lastRewardBlock = Math.max(block.number, _startBlock);
        governance = msg.sender;
        // get pool data
        pool = IUniswapV3Pool(_pool);
        token0 = pool.token0();
        token1 = pool.token1();
        fee = pool.fee();
        tickSpacing = pool.tickSpacing();
        ( , lastTick, , , , , ) = pool.slot0();
    }

     /**
      * @notice Transfers the governance role to a new governor.
      * Can only be called by the current governor.
      * @param _governance The new governor.
      */
     function setGovernance(address _governance) external override {
         // can only be called by governor
         require(msg.sender == governance, "!governance");
         governance = _governance;
     }

     /**
      * Sets the amount of reward token to distribute per block.
      * @param _blockReward Amount to distribute per block.
      */
     function setRewards(uint256 _blockReward) external override {
         // can only be called by master contract
         require(msg.sender == master, "!master");
         // update
         updateFarm();
         // accounting
         blockReward = _blockReward;
     }

     /**
      * Sets the farm's end block. Used to extend the duration.
      * @param _endBlock The new end block.
      */
     function setEnd(uint256 _endBlock) external override {
         // can only be called by governor
         require(msg.sender == governance, "!governance");
         // update
         updateFarm();
         // accounting
         endBlock = _endBlock;
     }

    /**
     * @notice Deposit a Uniswap LP token.
     * User will receive accumulated Solace rewards if any.
     * @param _token The deposit token.
     */
    function deposit(uint256 _token) external override {
        // harvest and update farm
        _harvest();
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // get position
        ( , , address _token0, address _token1, uint24 _fee, int24 tickLower, int24 tickUpper, uint128 liquidity, , , , )
        = lpToken.positions(_token);
        require(token0 == _token0 && token1 == _token1 && fee == _fee, "wrong pool");
        // record position
        TokenInfo memory _tokenInfo = TokenInfo({
            depositor: msg.sender,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity,
            value: _appraise(liquidity, tickLower, tickUpper)
        });
        tokenInfo[_token] = _tokenInfo;
        // pull token
        lpToken.transferFrom(msg.sender, address(this), _token);
        // accounting
        if (_tokenInfo.tickLower <= lastTick && lastTick < _tokenInfo.tickUpper) {
            // add if in range
            user.value += _tokenInfo.value;
            valueStaked += _tokenInfo.value;
        }
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        userDeposited[msg.sender].add(_token);
        // add position to tick lower
        if (ticks[_tokenInfo.tickLower].tokens.length() == 0) tickBitmap.flipTick(_tokenInfo.tickLower, tickSpacing);
        ticks[_tokenInfo.tickLower].tokens.add(_token);
        ticks[_tokenInfo.tickLower].valueNet += int256(_tokenInfo.value);
        // add position to tick upper
        if (ticks[_tokenInfo.tickUpper].tokens.length() == 0) tickBitmap.flipTick(_tokenInfo.tickUpper, tickSpacing);
        ticks[_tokenInfo.tickUpper].tokens.add(_token);
        ticks[_tokenInfo.tickUpper].valueNet -= int256(_tokenInfo.value);
        // emit event
        emit Deposit(msg.sender, _token);
    }

    /**
     * @notice Withdraw a Uniswap LP token.
     * User will receive _token and accumulated rewards.
     * @param _token The withdraw token.
     */
    function withdraw(uint256 _token) external override {
        // harvest and update farm
        _harvest();
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // get token info
        TokenInfo memory _tokenInfo = tokenInfo[_token];
        // cannot withdraw a token you didnt deposit
        require(_tokenInfo.depositor == msg.sender, "not your token");
        // accounting
        if (_tokenInfo.tickLower <= lastTick && lastTick < _tokenInfo.tickUpper) {
          // remove if in range
          user.value -= _tokenInfo.value;
          valueStaked -= _tokenInfo.value;
        }
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        userDeposited[msg.sender].remove(_token);
        // remove position from tick lower
        ticks[_tokenInfo.tickLower].tokens.remove(_token);
        ticks[_tokenInfo.tickLower].valueNet -= int256(_tokenInfo.value);
        if (ticks[_tokenInfo.tickLower].tokens.length() == 0) tickBitmap.flipTick(_tokenInfo.tickLower, tickSpacing);
        // remove position from tick upper
        ticks[_tokenInfo.tickUpper].tokens.remove(_token);
        ticks[_tokenInfo.tickUpper].valueNet += int256(_tokenInfo.value);
        if (ticks[_tokenInfo.tickUpper].tokens.length() == 0) tickBitmap.flipTick(_tokenInfo.tickUpper, tickSpacing);
        // delete token info
        delete tokenInfo[_token];
        // return staked token
        lpToken.safeTransferFrom(address(this), msg.sender, _token);
        // emit event
        emit Withdraw(msg.sender, _token);
    }

    /**
    * Withdraw your rewards without unstaking your tokens.
    */
    function withdrawRewards() external override {
        // harvest and update farm
        _harvest();
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // accounting
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
    }

    /**
     * @notice Updates farm information to be up to date to the current block.
     */
    function updateFarm() public override {
        // dont update needlessly
        if (block.number <= lastRewardBlock) return;
        // update math
        uint256 tokenReward = getMultiplier(lastRewardBlock, block.number);
        if (valueStaked != 0) accRewardPerShare += tokenReward * 1e12 / valueStaked;
        lastRewardBlock = Math.min(block.number, endBlock);
        // cross ticks
        int24 curTick = lastTick;
        ( , int24 newTick, , , , , ) = pool.slot0();
        // dont update needlessly
        if (curTick == newTick) return;
        uint256 newActiveValueStaked = valueStaked;
        // moving left to right
        while (curTick < newTick) {
            // get next tick
            (int24 nextTick, bool initialized) = tickBitmap.nextInitializedTickWithinOneWord(curTick, tickSpacing, false);
            // must be initialized, dont overshoot
            if (!initialized || nextTick > newTick) {
                curTick = newTick;
                break;
            }
            newActiveValueStaked = _add(newActiveValueStaked, ticks[nextTick].valueNet);
            EnumerableSet.UintSet storage tokens = ticks[nextTick].tokens;
            uint256 length = tokens.length();
            for (uint256 i = 0; i < length; ++i) {
                uint256 tokenId = tokens.at(i);
                // get position
                TokenInfo memory _tokenInfo = tokenInfo[tokenId];
                // if tickLower, adding liquidity
                if (nextTick == _tokenInfo.tickLower) {
                    userInfo[_tokenInfo.depositor].value += _tokenInfo.value;
                    userInfo[_tokenInfo.depositor].unpaidRewards -= int256(_tokenInfo.value * accRewardPerShare / 1e12);
                }
                // if tickUpper, removing liquidity
                if (nextTick == _tokenInfo.tickUpper) {
                    userInfo[_tokenInfo.depositor].value -= _tokenInfo.value;
                    userInfo[_tokenInfo.depositor].unpaidRewards += int256(_tokenInfo.value * accRewardPerShare / 1e12);
                }
            }
            curTick = nextTick;
        }
        // moving right to left
        bool firstIter = true;
        while (curTick > newTick) {
            // nextInitializedTick(lte=true) may return itself, desirable at times
            int24 startTick = firstIter ? curTick : curTick - 1;
            if (firstIter) firstIter = false;
            // get next tick
            (int24 nextTick, bool initialized) = tickBitmap.nextInitializedTickWithinOneWord(startTick, tickSpacing, true);
            // must be initialized, dont overshoot
            if (!initialized || nextTick < newTick) {
                curTick = newTick;
                break;
            }
            newActiveValueStaked = _add(newActiveValueStaked, -ticks[nextTick].valueNet);
            EnumerableSet.UintSet storage tokens = ticks[nextTick].tokens;
            uint256 length = tokens.length();
            for (uint256 i = 0; i < length; ++i) {
                uint256 tokenId = tokens.at(i);
                // get position
                TokenInfo memory _tokenInfo = tokenInfo[tokenId];
                // if tickUpper, adding liquidity
                if (nextTick == _tokenInfo.tickUpper) {
                    userInfo[_tokenInfo.depositor].value += _tokenInfo.value;
                    userInfo[_tokenInfo.depositor].unpaidRewards -= int256(_tokenInfo.value * accRewardPerShare / 1e12);
                }
                // if tickLower, removing liquidity
                if (nextTick == _tokenInfo.tickLower) {
                    userInfo[_tokenInfo.depositor].value -= _tokenInfo.value;
                    userInfo[_tokenInfo.depositor].unpaidRewards += int256(_tokenInfo.value * accRewardPerShare / 1e12);
                }
            }
            curTick = nextTick;
        }
        valueStaked = newActiveValueStaked;
        lastTick = curTick;
    }

    /**
     * @notice Calculates the accumulated balance of reward token for specified user.
     * @param _user The user for whom unclaimed tokens will be shown.
     * @return Total amount of withdrawable reward tokens.
     */
    function pendingRewards(address _user) external view override returns (uint256) {
        // get farmer information
        UserInfo storage user = userInfo[_user];
        // math
        uint256 _accRewardPerShare = accRewardPerShare;
        if (block.number > lastRewardBlock && valueStaked != 0) {
            uint256 tokenReward = getMultiplier(lastRewardBlock, block.number);
            _accRewardPerShare += tokenReward * 1e12 / valueStaked;
        }
        return uint256(int256(user.value * _accRewardPerShare / 1e12 - user.rewardDebt) + user.unpaidRewards);
    }

    /**
     * @notice Calculates the reward multiplier over the given _from until _to block.
     * @param _from The start of the period to measure rewards for.
     * @param _to The end of the period to measure rewards for.
     * @return The weighted multiplier for the given period.
     */
    function getMultiplier(uint256 _from, uint256 _to) public view override returns (uint256) {
        // validate window
        uint256 from = Math.max(_from, startBlock);
        uint256 to = Math.min(_to, endBlock);
        // no reward for negative window
        if (from > to) return 0;
        return (to - from) * blockReward;
    }

    /**
     * @notice Returns the count of Uniswap LP tokens that a user has deposited onto a farm.
     * @param _user The user to check count for.
     * @return The count of deposited Uniswap LP tokens.
     */
    function countDeposited(address _user) external view override returns (uint256) {
        return userDeposited[_user].length();
    }

    /**
     * @notice Returns the list of Uniswap LP tokens that a user has deposited onto a farm and their values.
     * @param _user The user to list Uniswap LP tokens.
     * @return The list of deposited Uniswap LP tokens.
     * @return The values of the tokens.
     */
    function listDeposited(address _user) external view override returns (uint256[] memory, uint256[] memory) {
        //uint256 length = depositedErc721sAndValues[_user].length();
        uint256 length = userDeposited[_user].length();
        uint256[] memory tokens = new uint256[](length);
        uint256[] memory values = new uint256[](length);
        for(uint256 i = 0; i < length; ++i) {
            uint256 tokenId = userDeposited[_user].at(i);
            uint256 tokenValue = tokenInfo[tokenId].value;
            tokens[i] = tokenId;
            values[i] = tokenValue;
        }
        return (tokens, values);
    }

    /**
     * @notice Returns the id of a Uniswap LP that a user has deposited onto a farm and its value.
     * @param _user The user to get token id for.
     * @param _index The farm-based index of the token.
     * @return The id of the deposited Uniswap LP token.
     * @return The value of the token.
     */
    function getDeposited(address _user, uint256 _index) external view override returns (uint256, uint256) {
        uint256 tokenId = userDeposited[_user].at(_index);
        uint256 tokenValue = tokenInfo[tokenId].value;
        return (tokenId, tokenValue);
    }

    /**
     * @notice Appraise a Uniswap LP Token.
     * Token must exist and must exist in the correct pool.
     * @param _token The id of the token to appraise.
     * @return _value The token's value.
     */
    function appraise(uint256 _token) external view override returns (uint256 _value) {
        // get position
        ( , , address _token0, address _token1, uint24 _fee, int24 tickLower, int24 tickUpper, uint128 liquidity, , , , )
        = lpToken.positions(_token);
        require(token0 == _token0 && token1 == _token1 && fee == _fee, "wrong pool");
        // appraise
        _value = _appraise(liquidity, tickLower, tickUpper);
    }

    /*
     * The following variables can be used to tune the appraisal curve.
     * See the Solace.fi UniswapLpFarm blog for more info.
     */
    uint256 private constant APPRAISAL_A = 20000;
    uint256 private constant APPRAISAL_B = 40000;
    uint256 private constant APPRAISAL_B2 = APPRAISAL_B**2;

    /**
     * @notice Appraise a Uniswap LP token.
     * @param _liquidity The liquidity provided by the token.
     * @param _tickLower The token's lower tick.
     * @param _tickUpper The token's upper tick.
     * @return _value The token's value.
     */
    function _appraise(uint128 _liquidity, int24 _tickLower, int24 _tickUpper) internal pure returns (uint256 _value) {
        uint256 width = (uint256(int256(_tickUpper - _tickLower)));
        _value = _liquidity * width;
        if (width > APPRAISAL_A) {
            _value = _value * APPRAISAL_B2 / ( (width-APPRAISAL_A)**2 + APPRAISAL_B2);
        }
    }

    /**
    * @notice Calculate and transfer a user's rewards.
    */
    function _harvest() internal {
        // update farm
        updateFarm();
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // transfer users pending rewards if nonzero
        uint256 pending = uint256(int256(user.value * accRewardPerShare / 1e12 - user.rewardDebt) + user.unpaidRewards);
        // safe transfer rewards
        if (pending == 0) return;
        uint256 balance = IERC20(rewardToken).balanceOf(master);
        uint256 transferAmount = Math.min(pending, balance);
        user.unpaidRewards = int256(pending - transferAmount);
        IERC20(rewardToken).safeTransferFrom(master, msg.sender, transferAmount);
    }

    /**
     * @notice Adds two numbers.
     * @param _a The first number as a uint256.
     * @param _b The second number as an int256.
     * @return _c The sum as a uint256.
     */
    function _add(uint256 _a, int256 _b) internal pure returns (uint256 _c) {
        _c = (_b > 0)
            ? _a + uint256(_b)
            : _a - uint256(-_b);
    }
}
