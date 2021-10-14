// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./libraries/TickBitmap.sol";
import "./Governable.sol";
import "./interface/UniswapV3/IUniswapLpToken.sol";
import "./interface/UniswapV3/IUniswapV3Pool.sol";
import "./interface/ILpAppraisor.sol";
import "./interface/ISolaceEthLpFarm.sol";


/**
 * @title SolaceEthLpFarm
 * @author solace.fi
 * @notice Rewards [**Liquidity Providers**](/docs/user-guides/liquidity-provider/lp-role-guide) in [**SOLACE**](./SOLACE) for providing liquidity in the [**SOLACE**](./SOLACE)-**ETH** [**Uniswap V3 Pool**](https://docs.uniswap.org/protocol/reference/core/UniswapV3Pool).
 *
 * Over the course of `startBlock` to `endBlock`, the farm distributes `blockReward` [**SOLACE**](./SOLACE) per block to all farmers split relative to the value of their deposited tokens.
 */
contract SolaceEthLpFarm is ISolaceEthLpFarm, ReentrancyGuard, Governable {
    using Address for address;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;
    using TickBitmap for mapping(int16 => uint256);

    /// @notice A unique enumerator that identifies the farm type.
    uint256 public override farmType = 3;

    /// @notice [**Uniswap V3 LP Token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
    IUniswapLpToken public override lpToken;
    /// @notice Native [**SOLACE**](./SOLACE) Token.
    SOLACE public override solace;
    /// @notice WETH.
    IWETH9 public override weth;
    /// @notice Amount of rewardToken distributed per block.
    uint256 public override blockReward;
    /// @notice When the farm will start.
    uint256 public override startBlock;
    /// @notice When the farm will end.
    uint256 public override endBlock;
    /// @notice Last time rewards were distributed or farm was updated.
    uint256 public override lastRewardBlock;
    /// @notice Accumulated rewards per share, times 1e12.
    uint256 public override accRewardPerShare;
    /// @notice Value of tokens currently in range.
    uint256 public override valueStaked;

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

    /// @notice Uniswap V3 Position Appraisor
    ILpAppraisor public appraisor;

    /**
     * @notice Constructs the farm.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param master_ Address of the [`Master`](./Master) contract.
     * @param lpToken_ Address of the [**Uniswap NonFungiblePositionManager**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) contract.
     * @param solace_ Address of the [**SOLACE**](./SOLACE) token contract.
     * @param startBlock_ When farming will begin.
     * @param endBlock_ When farming will end.
     * @param pool_ Address of the [**Uniswap V3 Pool**](https://docs.uniswap.org/protocol/reference/core/UniswapV3Pool).
     */
    constructor(
        address governance_,
        address master_,
        address lpToken_,
        SOLACE solace_,
        uint256 startBlock_,
        uint256 endBlock_,
        address pool_,
        address weth_,
        address appraisor_
    ) Governable(governance_) {
        // copy params
        master = master_;
        lpToken = IUniswapLpToken(lpToken_);
        solace = solace_;
        startBlock = startBlock_;
        endBlock = endBlock_;
        lastRewardBlock = Math.max(block.number, startBlock_);
        weth = IWETH9(payable(weth_));
        appraisor = ILpAppraisor(appraisor_);
        // get pool data
        pool = IUniswapV3Pool(pool_);
        token0 = pool.token0();
        token1 = pool.token1();
        fee = pool.fee();
        tickSpacing = pool.tickSpacing();
        ( , lastTick, , , , , ) = pool.slot0();
        // inf allowance to nft manager
        solace.approve(lpToken_, type(uint256).max);
        weth.approve(lpToken_, type(uint256).max);
    }

    receive () external payable {}

    fallback () external payable {}

    /**
     * @notice Sets the amount of [**SOLACE**](./SOLACE) to distribute per block.
     * Only affects future rewards.
     * Can only be called by [`Master`](./Master).
     * @param blockReward_ Amount to distribute per block.
     */
    function setRewards(uint256 blockReward_) external override {
        // can only be called by master contract
        require(msg.sender == master, "!master");
        // update
        updateFarm();
        // accounting
        blockReward = blockReward_;
        emit RewardsSet(blockReward_);
    }

    /**
     * @notice Sets the farm's end block. Used to extend the duration.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param endBlock_ The new end block.
     */
    function setEnd(uint256 endBlock_) external override onlyGovernance {
        // accounting
        endBlock = endBlock_;
        // update
        updateFarm();
        emit FarmEndSet(endBlock_);
    }

    /**
     * @notice Sets the appraisal function.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param appraisor_ The new appraisor.
     */
    function setAppraisor(address appraisor_) external override onlyGovernance {
        appraisor = ILpAppraisor(appraisor_);
    }

    /**
     * @notice Deposit a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
     * User will receive accumulated [**SOLACE**](./SOLACE) rewards if any.
     * User must `ERC721.approve()` or `ERC721.setApprovalForAll()` first.
     * @param tokenID The ID of the token to deposit.
     */
    function depositLp(uint256 tokenID) external override nonReentrant {
        // pull token
        lpToken.transferFrom(msg.sender, address(this), tokenID);
        // accounting
        _deposit(msg.sender, tokenID);
    }

    /**
     * @notice Deposit a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) using permit.
     * User will receive accumulated [**SOLACE**](./SOLACE) rewards if any.
     * @param depositor The depositing user.
     * @param tokenID The ID of the token to deposit.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function depositLpSigned(address depositor, uint256 tokenID, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external override nonReentrant {
        // permit
        lpToken.permit(address(this), tokenID, deadline, v, r, s);
        // pull token
        lpToken.transferFrom(depositor, address(this), tokenID);
        // accounting
        _deposit(depositor, tokenID);
    }

    /**
     * @notice Mint a new [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) then deposit it.
     * User will receive accumulated [**SOLACE**](./SOLACE) rewards if any.
     * @param params parameters
     * @return tokenID The newly minted token ID.
     */
    function mintAndDeposit(MintAndDepositParams calldata params) external payable override nonReentrant returns (uint256 tokenID) {
        // permit solace
        solace.permit(params.depositor, address(this), params.amountSolace, params.deadline, params.v, params.r, params.s);
        // pull solace
        IERC20(solace).safeTransferFrom(params.depositor, address(this), params.amountSolace);
        // wrap eth
        weth.deposit{value: msg.value}();
        // mint token
        uint128 liquidity;
        uint256 amount0;
        uint256 amount1;
        ( tokenID, liquidity, amount0, amount1 ) = lpToken.mint(IUniswapLpToken.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            amount0Desired: params.amount0Desired,
            amount1Desired: params.amount1Desired,
            amount0Min: params.amount0Min,
            amount1Min: params.amount1Min,
            recipient: address(this),
            deadline: params.deadline
        }));
        // pay back depositor excess solace
        uint256 solaceReturnAmount = ((token0 == address(solace))
            ? params.amountSolace - amount0
            : params.amountSolace - amount1);
        if (solaceReturnAmount > 0) IERC20(solace).safeTransfer(params.depositor, solaceReturnAmount);
        // pay back sender excess eth
        uint256 ethReturnAmount = ((token0 == address(solace))
            ? msg.value - amount1
            : msg.value - amount0);
        if (ethReturnAmount > 0) {
          weth.withdraw(ethReturnAmount);
          Address.sendValue(payable(msg.sender), ethReturnAmount);
        }
        // accounting
        _deposit(params.depositor, tokenID);
    }

    /**
     * @notice Withdraw a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
     * User will receive `tokenID` and accumulated rewards.
     * Can only withdraw tokens you deposited.
     * @param tokenID The ID of the token to withdraw.
     */
    function withdrawLp(uint256 tokenID) external override nonReentrant {
        // harvest and update farm
        _harvest(msg.sender);
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // get token info
        TokenInfo memory tokenInfo_ = tokenInfo[tokenID];
        // cannot withdraw a token you didnt deposit
        require(tokenInfo_.depositor == msg.sender, "not your token");
        // accounting
        if (tokenInfo_.tickLower <= lastTick && lastTick < tokenInfo_.tickUpper) {
          // remove if in range
          user.value -= tokenInfo_.value;
          valueStaked -= tokenInfo_.value;
        }
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        userDeposited[msg.sender].remove(tokenID);
        // remove position from tick lower
        ticks[tokenInfo_.tickLower].tokens.remove(tokenID);
        ticks[tokenInfo_.tickLower].valueNet -= int256(tokenInfo_.value);
        if (ticks[tokenInfo_.tickLower].tokens.length() == 0) tickBitmap.flipTick(tokenInfo_.tickLower, tickSpacing);
        // remove position from tick upper
        ticks[tokenInfo_.tickUpper].tokens.remove(tokenID);
        ticks[tokenInfo_.tickUpper].valueNet += int256(tokenInfo_.value);
        if (ticks[tokenInfo_.tickUpper].tokens.length() == 0) tickBitmap.flipTick(tokenInfo_.tickUpper, tickSpacing);
        // delete token info
        delete tokenInfo[tokenID];
        // return staked token
        lpToken.safeTransferFrom(address(this), msg.sender, tokenID);
        // emit event
        emit TokenWithdrawn(msg.sender, tokenID);
    }

    /**
     * @notice Withdraw your rewards without unstaking your tokens.
     */
    function withdrawRewards() external override nonReentrant {
        // harvest and update farm
        _harvest(msg.sender);
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // accounting
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
    }

    /**
     * @notice Withdraw a users rewards without unstaking their tokens.
     * Can only be called by ['Master`](./Master) or the user.
     * @param user User to withdraw rewards for.
     */
    function withdrawRewardsForUser(address user) external override nonReentrant {
        require(msg.sender == master || msg.sender == user, "!master");
        // harvest and update farm
        _harvest(user);
        // get farmer information
        UserInfo storage userInfo_ = userInfo[user];
        // accounting
        userInfo_.rewardDebt = userInfo_.value * accRewardPerShare / 1e12;
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
                uint256 tokenID = tokens.at(i);
                // get position
                TokenInfo memory tokenInfo_ = tokenInfo[tokenID];
                // if tickLower, adding liquidity
                if (nextTick == tokenInfo_.tickLower) {
                    userInfo[tokenInfo_.depositor].value += tokenInfo_.value;
                    userInfo[tokenInfo_.depositor].unpaidRewards -= int256(tokenInfo_.value * accRewardPerShare / 1e12);
                }
                // if tickUpper, removing liquidity
                if (nextTick == tokenInfo_.tickUpper) {
                    userInfo[tokenInfo_.depositor].value -= tokenInfo_.value;
                    userInfo[tokenInfo_.depositor].unpaidRewards += int256(tokenInfo_.value * accRewardPerShare / 1e12);
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
                uint256 tokenID = tokens.at(i);
                // get position
                TokenInfo memory tokenInfo_ = tokenInfo[tokenID];
                // if tickUpper, adding liquidity
                if (nextTick == tokenInfo_.tickUpper) {
                    userInfo[tokenInfo_.depositor].value += tokenInfo_.value;
                    userInfo[tokenInfo_.depositor].unpaidRewards -= int256(tokenInfo_.value * accRewardPerShare / 1e12);
                }
                // if tickLower, removing liquidity
                if (nextTick == tokenInfo_.tickLower) {
                    userInfo[tokenInfo_.depositor].value -= tokenInfo_.value;
                    userInfo[tokenInfo_.depositor].unpaidRewards += int256(tokenInfo_.value * accRewardPerShare / 1e12);
                }
            }
            curTick = nextTick;
        }
        valueStaked = newActiveValueStaked;
        lastTick = curTick;
    }

    /**
     * @notice Calculates the accumulated balance of [**SOLACE**](./SOLACE) for specified user.
     * @param user The user for whom unclaimed tokens will be shown.
     * @return reward Total amount of withdrawable reward tokens.
     */
    function pendingRewards(address user) external view override returns (uint256 reward) {
        // get farmer information
        UserInfo storage userInfo_ = userInfo[user];
        // math
        uint256 accRewardPerShare_ = accRewardPerShare;
        if (block.number > lastRewardBlock && valueStaked != 0) {
            uint256 tokenReward = getMultiplier(lastRewardBlock, block.number);
            accRewardPerShare_ += tokenReward * 1e12 / valueStaked;
        }
        return uint256(int256(userInfo_.value * accRewardPerShare_ / 1e12 - userInfo_.rewardDebt) + userInfo_.unpaidRewards);
    }

    /**
     * @notice Calculates the reward multiplier over the given `from` until `to` block.
     * @param from The start of the period to measure rewards for.
     * @param to The end of the period to measure rewards for.
     * @return multiplier The weighted multiplier for the given period.
     */
    function getMultiplier(uint256 from, uint256 to) public view override returns (uint256 multiplier) {
        // validate window
        from = Math.max(from, startBlock);
        to = Math.min(to, endBlock);
        // no reward for negative window
        if (from > to) return 0;
        return (to - from) * blockReward;
    }

    /**
     * @notice Returns the count of [**Uniswap LP tokens**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) that a user has deposited onto the farm.
     * @param user The user to check count for.
     * @return count The count of deposited Uniswap LP tokens.
     */
    function countDeposited(address user) external view override returns (uint256 count) {
        return userDeposited[user].length();
    }

    /**
     * @notice Returns the list of [**Uniswap LP tokens**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) that a user has deposited onto the farm and their values.
     * @param user The user to list Uniswap LP tokens.
     * @return tokenIDs The list of deposited Uniswap LP tokens.
     * @return tokenValues The values of the tokens.
     */
    function listDeposited(address user) external view override returns (uint256[] memory tokenIDs, uint256[] memory tokenValues) {
        uint256 length = userDeposited[user].length();
        tokenIDs = new uint256[](length);
        tokenValues = new uint256[](length);
        for(uint256 i = 0; i < length; ++i) {
            uint256 tokenID = userDeposited[user].at(i);
            tokenIDs[i] = tokenID;
            tokenValues[i] = tokenInfo[tokenID].value;
        }
        return (tokenIDs, tokenValues);
    }

    /**
     * @notice Returns the ID of a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) that a user has deposited onto a farm and its value.
     * @param user The user to get token ID for.
     * @param index The farm-based index of the token.
     * @return tokenID The ID of the deposited [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
     * @return tokenValue The value of the token.
     */
    function getDeposited(address user, uint256 index) external view override returns (uint256 tokenID, uint256 tokenValue) {
        tokenID = userDeposited[user].at(index);
        tokenValue = tokenInfo[tokenID].value;
        return (tokenID, tokenValue);
    }

    /**
     * @notice Appraise a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
     * Token must exist and must exist in the correct pool.
     * @param tokenID The ID of the token to appraise.
     * @return tokenValue The token's value.
     */
    function appraise(uint256 tokenID) external view override returns (uint256 tokenValue) {
        return appraisor.appraise(tokenID);
    }

    /**
    * @notice Calculate and transfer a user's rewards.
    */
    function _harvest(address user) internal {
        // update farm
        updateFarm();
        // get farmer information
        UserInfo storage userInfo_ = userInfo[user];
        // transfer users pending rewards if nonzero
        uint256 pending = uint256(int256(userInfo_.value * accRewardPerShare / 1e12 - userInfo_.rewardDebt) + userInfo_.unpaidRewards);
        // safe transfer rewards
        if (pending == 0) return;
        uint256 balance = solace.balanceOf(master);
        uint256 transferAmount = Math.min(pending, balance);
        userInfo_.unpaidRewards = int256(pending - transferAmount);
        IERC20(solace).safeTransferFrom(master, user, transferAmount);
        emit UserRewarded(user, transferAmount);
    }

    /**
     * @notice Performs the internal accounting for a deposit.
     * @param depositor The depositing user.
     * @param tokenID The ID of the token to deposit.
     */
    function _deposit(address depositor, uint256 tokenID) internal {
        // get position
        ( , , address token0_, address token1_, uint24 fee_, int24 tickLower, int24 tickUpper, uint128 liquidity, , , , )
        = lpToken.positions(tokenID);
        // check if correct pool
        require((fee == fee_) && (token0 == token0_) && (token1 == token1_), "wrong pool");
        // harvest and update farm
        _harvest(depositor);
        // get farmer information
        UserInfo storage user = userInfo[depositor];
        // record position
        TokenInfo memory tokenInfo_ = TokenInfo({
            depositor: depositor,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity,
            value: appraisor.appraise(tokenID)
        });
        tokenInfo[tokenID] = tokenInfo_;
        // accounting
        if (tokenInfo_.tickLower <= lastTick && lastTick < tokenInfo_.tickUpper) {
            // add if in range
            user.value += tokenInfo_.value;
            valueStaked += tokenInfo_.value;
        }
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        userDeposited[depositor].add(tokenID);
        // add position to tick lower
        if (ticks[tokenInfo_.tickLower].tokens.length() == 0) tickBitmap.flipTick(tokenInfo_.tickLower, tickSpacing);
        ticks[tokenInfo_.tickLower].tokens.add(tokenID);
        ticks[tokenInfo_.tickLower].valueNet += int256(tokenInfo_.value);
        // add position to tick upper
        if (ticks[tokenInfo_.tickUpper].tokens.length() == 0) tickBitmap.flipTick(tokenInfo_.tickUpper, tickSpacing);
        ticks[tokenInfo_.tickUpper].tokens.add(tokenID);
        ticks[tokenInfo_.tickUpper].valueNet -= int256(tokenInfo_.value);
        // emit event
        emit TokenDeposited(depositor, tokenID);
    }

    /**
     * @notice Adds two numbers.
     * @param a The first number as a uint256.
     * @param b The second number as an int256.
     * @return c The sum as a uint256.
     */
    function _add(uint256 a, int256 b) internal pure returns (uint256 c) {
        return (b > 0)
            ? (a + uint256(b))
            : (a - uint256(-b));
    }
}
