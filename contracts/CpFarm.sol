// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./libraries/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interface/IVault.sol";
import "./interface/ICpFarm.sol";
import "./interface/ISwapRouter.sol";

/**
 * @title CpFarm: A farm that allows for the staking of CP tokens.
 * @author solace.fi
 */
contract CpFarm is ICpFarm, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeERC20 for SOLACE;

    /// @notice A unique enumerator that identifies the farm type.
    uint256 public constant override farmType = 1;

    IVault public override vault;
    /// @notice Native SOLACE Token.
    SOLACE public override solace;
    uint256 public override blockReward;       // Amount of rewardToken distributed per block.
    uint256 public override startBlock;        // When the farm will start.
    uint256 public override endBlock;          // When the farm will end.
    uint256 public override lastRewardBlock;   // Last time rewards were distributed or farm was updated.
    uint256 public override accRewardPerShare; // Accumulated rewards per share, times 1e12.
    uint256 public override valueStaked;       // Value of tokens staked by all farmers.

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

    /// @notice Governor.
    address public override governance;

    /// @notice Governance to take over.
    address public override newGovernance;

    /// @notice Master contract.
    address public override master;

    /// @notice Address of Uniswap router.
    ISwapRouter public swapRouter;

    // @notice WETH
    IERC20 public weth;

    /**
     * @notice Constructs the farm.
     * @param _governance Address of the governor.
     * @param _master Address of the Master contract.
     * @param _vault Address of the Vault contract.
     * @param _solace Address of the SOLACE token contract.
     * @param _startBlock When farming will begin.
     * @param _endBlock When farming will end.
     * @param _swapRouter Address of uniswap router.
     * @param _weth Address of weth.
     */
    constructor(
        address _governance,
        address _master,
        address _vault,
        SOLACE _solace,
        uint256 _startBlock,
        uint256 _endBlock,
        address _swapRouter,
        address _weth
    ) {
        governance = _governance;
        master = _master;
        vault = IVault(_vault);
        solace = _solace;
        startBlock = _startBlock;
        endBlock = _endBlock;
        lastRewardBlock = Math.max(block.number, _startBlock);
        swapRouter = ISwapRouter(_swapRouter);
        weth = IERC20(_weth);
        solace.approve(_swapRouter, type(uint256).max);
        weth.approve(_vault, type(uint256).max);
    }

    /**
     * Receive function. Deposits eth.
     */
    receive () external payable override {
        if (msg.sender != address(vault)) _depositEth();
    }

    /**
     * Fallback function. Deposits eth.
     */
    fallback () external payable override {
        if (msg.sender != address(vault)) _depositEth();
    }

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external override {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Sets the amount of reward token to distribute per block.
     * Only affects future rewards.
     * Can only be called by Master.
     * @param _blockReward Amount to distribute per block.
     */
    function setRewards(uint256 _blockReward) external override {
        // can only be called by master contract
        require(msg.sender == master, "!master");
        // update
        updateFarm();
        // accounting
        blockReward = _blockReward;
        emit RewardsSet(_blockReward);
    }

    /**
     * @notice Sets the farm's end block. Used to extend the duration.
     * Can only be called by the current governor.
     * @param _endBlock The new end block.
     */
    function setEnd(uint256 _endBlock) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // accounting
        endBlock = _endBlock;
        // update
        updateFarm();
        emit FarmEndSet(_endBlock);
    }

    /**
     * @notice Deposit some CP tokens.
     * User will receive accumulated rewards if any.
     * @param _amount The deposit amount.
     */
    function depositCp(uint256 _amount) external override {
        // pull tokens
        IERC20(vault).safeTransferFrom(msg.sender, address(this), _amount);
        // accounting
        _depositCp(msg.sender, _amount);
    }

    /**
     * @notice Deposit some CP tokens using permit.
     * User will receive accumulated rewards if any.
     * @param _depositor The depositing user.
     * @param _amount The deposit amount.
     * @param _deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function depositCpSigned(address _depositor, uint256 _amount, uint256 _deadline, uint8 v, bytes32 r, bytes32 s) external override {
        // permit
        vault.permit(_depositor, address(this), _amount, _deadline, v, r, s);
        // pull tokens
        IERC20(vault).safeTransferFrom(_depositor, address(this), _amount);
        // accounting
        _depositCp(_depositor, _amount);
    }

    /**
     * @notice Deposit some ETH.
     * User will receive accumulated rewards if any.
     */
    function depositEth() external payable override {
        _depositEth();
    }

    /**
     * Your money already makes you money. Now make your money make more money!
     * @notice Withdraws your SOLACE rewards, swaps it for WETH, then deposits that WETH onto the farm.
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
        uint256 wethDepositAmount = swapRouter.exactInputSingle(ISwapRouter.ExactInputSingleParams({
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
     * @notice Withdraw some CP tokens.
     * User will receive _amount of deposited tokens and accumulated rewards.
     * @param _amount The withdraw amount.
     */
    function withdrawCp(uint256 _amount) external override nonReentrant {
        // harvest and update farm
        _harvest(msg.sender);
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // accounting
        valueStaked -= _amount;
        user.value -= _amount; // also reverts overwithdraw
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        // return staked tokens
        IERC20(vault).safeTransfer(msg.sender, _amount);
        emit CpWithdrawn(msg.sender, _amount);
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
     * Can only be called by Master.
     */
    function withdrawRewardsForUser(address _user) external override nonReentrant {
        require(msg.sender == master || msg.sender == _user, "!master");
        // harvest
        _harvest(_user);
        // get farmer information
        UserInfo storage user = userInfo[_user];
        // accounting
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
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
        return user.value * _accRewardPerShare / 1e12 - user.rewardDebt + user.unpaidRewards;
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
     * @notice Deposits some ether.
     */
    function _depositEth() internal nonReentrant {
        // harvest and update farm
        _harvest(msg.sender);
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // exchange eth for cp
        uint256 balanceBefore = vault.balanceOf(address(this));
        vault.deposit{value:msg.value}();
        uint256 cpAmount = vault.balanceOf(address(this)) - balanceBefore;
        // accounting
        valueStaked += cpAmount;
        user.value += cpAmount;
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        emit EthDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Deposit some CP tokens.
     * User will receive accumulated rewards if any.
     * @param _depositor The depositing user.
     * @param _amount The deposit amount.
     */
    function _depositCp(address _depositor, uint256 _amount) internal nonReentrant {
        // harvest and update farm
        _harvest(_depositor);
        // get farmer information
        UserInfo storage user = userInfo[_depositor];
        // accounting
        valueStaked += _amount;
        user.value += _amount;
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        emit CpDeposited(_depositor, _amount);
    }

    /**
    * @notice Calculate and transfer a user's rewards.
    */
    function _harvest(address _user) internal {
        // update farm
        updateFarm();
        // get farmer information
        UserInfo storage user = userInfo[_user];
        // transfer users pending rewards if nonzero
        uint256 pending = user.value * accRewardPerShare / 1e12 - user.rewardDebt + user.unpaidRewards;
        if (pending == 0) return;
        // safe transfer rewards
        uint256 balance = solace.balanceOf(master);
        uint256 transferAmount = Math.min(pending, balance);
        user.unpaidRewards = pending - transferAmount;
        IERC20(solace).safeTransferFrom(master, _user, transferAmount);
        emit UserRewarded(_user, transferAmount);
    }
}
