// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Governable.sol";
import "./interface/IVault.sol";
import "./interface/ICpFarm.sol";
import "./interface/UniswapV3/ISwapRouter.sol";

/**
 * @title CpFarm
 * @author solace.fi
 * @notice Rewards [**Capital Providers**](/docs/user-guides/capital-provider/cp-role-guide) in [**SOLACE**](./SOLACE) for providing capital in the [`Vault`](./Vault).
 *
 * Over the course of `startBlock` to `endBlock`, the farm distributes `blockReward` [**SOLACE**](./SOLACE) per block to all farmers split relative to the amount of [**SCP**](./Vault) they have deposited.
 *
 * Users can become [**Capital Providers**](/docs/user-guides/capital-provider/cp-role-guide) by depositing **ETH** into the [`Vault`](./Vault), receiving [**SCP**](./Vault) in the process. [**Capital Providers**](/docs/user-guides/capital-provider/cp-role-guide) can then deposit their [**SCP**](./Vault) via [`depositCp()`](#depositcp) or [`depositCpSigned()`](#depositcpsigned). Alternatively users can bypass the [`Vault`](./Vault) and stake their **ETH** via [`depositEth()`](#depositeth).
 *
 * Users can withdraw their rewards via [`withdrawRewards()`](#withdrawrewards) and compound their rewards via [`compoundRewards()`](#compoundrewards).
 *
 * Users can withdraw their [**SCP**](./Vault) via [`withdrawCp()`](#withdrawcp).
 *
 * Note that transferring in **ETH** will mint you shares, but transferring in **WETH** or [**SCP**](./Vault) will not. These must be deposited via functions in this contract. Misplaced funds cannot be rescued.
 */
contract CpFarm is ICpFarm, ReentrancyGuard, Governable {
    using SafeERC20 for IERC20;
    using SafeERC20 for SOLACE;

    /// @notice A unique enumerator that identifies the farm type.
    uint256 public constant override farmType = 1;
    /// @notice Vault contract.
    IVault public override vault;
    /// @notice Native SOLACE Token.
    SOLACE public override solace;
    /// @notice Master contract.
    address public override master;
    /// @notice Amount of SOLACE distributed per block.
    uint256 public override blockReward;
    /// @notice When the farm will start.
    uint256 public override startBlock;
    /// @notice When the farm will end.
    uint256 public override endBlock;
    /// @notice Last time rewards were distributed or farm was updated.
    uint256 public override lastRewardBlock;
    /// @notice Accumulated rewards per share, times 1e12.
    uint256 public override accRewardPerShare;
    /// @notice Value of tokens staked by all farmers.
    uint256 public override valueStaked;

    // Info of each user.
    struct UserInfo {
        uint256 value;      // Value of user provided tokens.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 unpaidRewards; // Rewards that have not been paid.
        //
        // We do some fancy math here. Basically, any point in time, the amount of reward token
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.value * accRewardPerShare) - user.rewardDebt + user.unpaidRewards
        //
        // Whenever a user deposits or withdraws LP tokens to a farm. Here's what happens:
        //   1. The farm's `accRewardPerShare` and `lastRewardBlock` gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //      Unsent rewards will be accumulated in `unpaidRewards`.
        //   3. User's `value` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    /// @notice Information about each farmer.
    /// @dev user address => user info
    mapping(address => UserInfo) public userInfo;

    /// @notice Address of Uniswap router.
    ISwapRouter internal _swapRouter;

    // @notice WETH
    IERC20 public weth;

    /**
     * @notice Constructs the CpFarm.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param master_ Address of the [`Master`](./Master) contract.
     * @param vault_ Address of the [`Vault`](./Vault) contract.
     * @param solace_ Address of the [**SOLACE**](./SOLACE) token contract.
     * @param startBlock_ When farming will begin.
     * @param endBlock_ When farming will end.
     * @param swapRouter_ Address of [`Uniswap V3 SwapRouter`](https://docs.uniswap.org/protocol/reference/periphery/SwapRouter).
     * @param weth_ Address of **WETH**.
     */
    constructor(
        address governance_,
        address master_,
        address vault_,
        SOLACE solace_,
        uint256 startBlock_,
        uint256 endBlock_,
        address swapRouter_,
        address weth_
    ) Governable(governance_) {
        master = master_;
        vault = IVault(payable(vault_));
        solace = solace_;
        startBlock = startBlock_;
        endBlock = endBlock_;
        lastRewardBlock = Math.max(block.number, startBlock_);
        _swapRouter = ISwapRouter(swapRouter_);
        weth = IERC20(weth_);
        solace.approve(swapRouter_, type(uint256).max);
        weth.approve(vault_, type(uint256).max);
    }

    /**
     * Receive function. Deposits eth. User will receive accumulated rewards if any.
     */
    receive () external payable override {
        if (msg.sender != address(vault)) _depositEth();
    }

    /**
     * Fallback function. Deposits eth. User will receive accumulated rewards if any.
     */
    fallback () external payable override {
        if (msg.sender != address(vault)) _depositEth();
    }

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
     * @notice Deposit some [**CP tokens**](./Vault).
     * User will receive accumulated rewards if any.
     * User must `ERC20.approve()` first.
     * @param amount The deposit amount.
     */
    function depositCp(uint256 amount) external override {
        // pull tokens
        IERC20(vault).safeTransferFrom(msg.sender, address(this), amount);
        // accounting
        _depositCp(msg.sender, amount);
    }

    /**
     * @notice Deposit some [**CP tokens**](./Vault) using `ERC2612.permit()`.
     * User will receive accumulated rewards if any.
     * @param depositor The depositing user.
     * @param amount The deposit amount.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function depositCpSigned(address depositor, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external override {
        // permit
        vault.permit(depositor, address(this), amount, deadline, v, r, s);
        // pull tokens
        IERC20(vault).safeTransferFrom(depositor, address(this), amount);
        // accounting
        _depositCp(depositor, amount);
    }

    /**
     * @notice Deposit some **ETH**.
     * User will receive accumulated rewards if any.
     */
    function depositEth() external payable override {
        _depositEth();
    }

    /**
     * @notice Your money already makes you money. Now make your money make more money!
     * Withdraws your [**SOLACE**](./SOLACE) rewards, swaps it for **WETH**, then deposits that **WETH** onto the farm.
     */
    function compoundRewards() external override nonReentrant {
        // update farm
        updateFarm();
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // calculate pending rewards
        uint256 pending = user.value * accRewardPerShare / 1e12 - user.rewardDebt + user.unpaidRewards;
        if (pending == 0) return;
        // calculate safe swap amount
        uint256 balance = solace.balanceOf(master);
        uint256 solaceSwapAmount = Math.min(pending, balance);
        user.unpaidRewards = pending - solaceSwapAmount;
        // transfer solace from master
        solace.safeTransferFrom(master, address(this), solaceSwapAmount);
        // swap solace for weth
        uint256 wethDepositAmount = _swapRouter.exactInputSingle(ISwapRouter.ExactInputSingleParams({
            tokenIn: address(solace),
            tokenOut: address(weth),
            fee: 3000, // medium pool
            recipient: address(this),
            // solhint-disable-next-line not-rely-on-time
            deadline: block.timestamp,
            amountIn: solaceSwapAmount,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        }));
        // exchange weth for cp
        uint256 balanceBefore = vault.balanceOf(address(this));
        vault.depositWeth(wethDepositAmount);
        uint256 cpAmount = vault.balanceOf(address(this)) - balanceBefore;
        // accounting
        valueStaked += cpAmount;
        user.value += cpAmount;
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        emit RewardsCompounded(msg.sender);
    }

    /**
     * @notice Withdraw some [**CP tokens**](./Vault).
     * User will receive amount of deposited tokens and accumulated rewards.
     * Can only withdraw as many tokens as you deposited.
     * @param amount The withdraw amount.
     */
    function withdrawCp(uint256 amount) external override nonReentrant {
        // harvest and update farm
        _harvest(msg.sender);
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // accounting
        valueStaked -= amount;
        user.value -= amount; // also reverts overwithdraw
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        // return staked tokens
        IERC20(vault).safeTransfer(msg.sender, amount);
        emit CpWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Withdraw your rewards without unstaking your tokens.
     */
    function withdrawRewards() external override nonReentrant {
        // harvest
        _harvest(msg.sender);
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // accounting
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
    }

    /**
     * @notice Withdraw a users rewards without unstaking their tokens.
     * Can only be called by [`Master`](./Master) or the user.
     * @param user User to withdraw rewards for.
     */
    function withdrawRewardsForUser(address user) external override nonReentrant {
        require(msg.sender == master || msg.sender == user, "!master");
        // harvest
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
        if (valueStaked == 0) {
            lastRewardBlock = Math.min(block.number, endBlock);
            return;
        }
        // update math
        uint256 tokenReward = getMultiplier(lastRewardBlock, block.number);
        accRewardPerShare += tokenReward * 1e12 / valueStaked;
        lastRewardBlock = Math.min(block.number, endBlock);
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
        return userInfo_.value * accRewardPerShare_ / 1e12 - userInfo_.rewardDebt + userInfo_.unpaidRewards;
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
     * @notice Deposits some ether.
     */
    function _depositEth() internal nonReentrant {
        // harvest and update farm
        _harvest(msg.sender);
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // exchange eth for cp
        uint256 balanceBefore = vault.balanceOf(address(this));
        vault.depositEth{value:msg.value}();
        uint256 cpAmount = vault.balanceOf(address(this)) - balanceBefore;
        // accounting
        valueStaked += cpAmount;
        user.value += cpAmount;
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        emit EthDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Deposit some [**CP tokens**](./Vault).
     * User will receive accumulated rewards if any.
     * @param depositor The depositing user.
     * @param amount The deposit amount.
     */
    function _depositCp(address depositor, uint256 amount) internal nonReentrant {
        // harvest and update farm
        _harvest(depositor);
        // get farmer information
        UserInfo storage user = userInfo[depositor];
        // accounting
        valueStaked += amount;
        user.value += amount;
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        emit CpDeposited(depositor, amount);
    }

    /**
    * @notice Calculate and transfer a user's rewards.
    * @param user User to process rewards for.
    */
    function _harvest(address user) internal {
        // update farm
        updateFarm();
        // get farmer information
        UserInfo storage userInfo_ = userInfo[user];
        // transfer users pending rewards if nonzero
        uint256 pending = userInfo_.value * accRewardPerShare / 1e12 - userInfo_.rewardDebt + userInfo_.unpaidRewards;
        if (pending == 0) return;
        // safe transfer rewards
        uint256 balance = solace.balanceOf(master);
        uint256 transferAmount = Math.min(pending, balance);
        userInfo_.unpaidRewards = pending - transferAmount;
        IERC20(solace).safeTransferFrom(master, user, transferAmount);
        emit UserRewarded(user, transferAmount);
    }
}
