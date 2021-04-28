// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./libraries/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/IVault.sol";
import "./interface/ICpFarm.sol";


/**
 * @title CpFarm: A farm that allows for the staking of CP tokens.
 * @author solace.fi
 */
contract CpFarm is ICpFarm {
    using SafeERC20 for IERC20;

    /// @notice A unique enumerator that identifies the farm type.
    uint256 public override farmType = 1;

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

    /// @notice Master contract.
    address public override master;

    /**
     * @notice Constructs the farm.
     * @param _master Address of the Master contract.
     * @param _vault Address of the Vault contract.
     * @param _solace Address of the SOLACE token contract.
     * @param _startBlock When farming will begin.
     * @param _endBlock When farming will end.
     */
    constructor(
        address _master,
        address _vault,
        SOLACE _solace,
        uint256 _startBlock,
        uint256 _endBlock
    ) public {
        master = _master;
        vault = IVault(_vault);
        solace = _solace;
        startBlock = _startBlock;
        endBlock = _endBlock;
        lastRewardBlock = Math.max(block.number, _startBlock);
        governance = msg.sender;
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
     * @notice Withdraw some CP tokens.
     * User will receive _amount of deposited tokens and accumulated rewards.
     * @param _amount The withdraw amount.
     */
    function withdrawCp(uint256 _amount) external override {
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
        emit WithdrawCp(msg.sender, _amount);
    }

    /**
     * @notice Withdraw some Eth.
     * `_amount` is denominated in CP tokens, which are converted to eth then returned to the user.
     * User will receive _amount of deposited tokens converted to eth and accumulated rewards.
     * @param _amount The withdraw amount.
     * @param _maxLoss The acceptable amount of loss.
     */
    function withdrawEth(uint256 _amount, uint256 _maxLoss) external override {
        // harvest and update farm
        _harvest(msg.sender);
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // accounting
        valueStaked -= _amount;
        user.value -= _amount; // also reverts overwithdraw
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        uint256 ethAmount = vault.withdraw(_amount, _maxLoss);
        // return eth
        payable(msg.sender).transfer(ethAmount);
        emit WithdrawEth(msg.sender, _amount);
    }

    /**
     * Withdraw your rewards without unstaking your tokens.
     */
    function withdrawRewards() external override {
        // harvest
        _harvest(msg.sender);
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
    function _depositEth() internal {
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
        emit DepositEth(msg.sender, msg.value);
    }

    /**
     * @notice Deposit some CP tokens.
     * User will receive accumulated rewards if any.
     * @param _depositor The depositing user.
     * @param _amount The deposit amount.
     */
    function _depositCp(address _depositor, uint256 _amount) internal {
        // harvest and update farm
        _harvest(_depositor);
        // get farmer information
        UserInfo storage user = userInfo[_depositor];
        // accounting
        valueStaked += _amount;
        user.value += _amount;
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        emit DepositCp(_depositor, _amount);
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
    }
}
