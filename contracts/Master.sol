// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./SOLACE.sol";

/// @title Master: owner of solace.fi
/// @author solace.fi
/// @notice This contract is the SOLACE token distributor.

contract Master {
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many CP or LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of SOLACE
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * farm.accSolacePerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a farm. Here's what happens:
        //   1. The farm's `accSolacePerShare` and `lastRewardBlock` gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each farm.
    struct FarmInfo {
        IERC20 token;              // address of CP or LP token contract
        uint256 allocPoints;       // how many allocation points assigned to this farm
        uint256 startBlock;        // when the farm will start
        uint256 endBlock;          // when the farm will end
        uint256 lastRewardBlock;   // last time rewards were distributed or farm was updated
        uint256 accSolacePerShare; // accumulated rewards per share, times 1e12
        uint256 tokensStaked;      // number of tokens staked by all farmers
    }

    /// @notice Native SOLACE Token.
    SOLACE public solace;

    /// @notice Total solace distributed per block across all farms.
    uint256 public solacePerBlock;

    /// @notice Total allocation points across all farms.
    uint256 public totalAllocPoints = 0;

    /// @notice Information about each farm.
    FarmInfo[] public farmInfo;

    /// @notice Information about each farmer.
    /// @dev farm id => user address => user info
    mapping(address => UserInfo)[] public userInfo;

    event FarmCreated(uint256 indexed farmId);

    event Deposit(address indexed user, uint256 indexed farmId, uint256 amount);

    event Withdraw(address indexed user, uint256 indexed farmId, uint256 amount);

    /// @notice Governor.
    address public governance;

    /**
     * @notice Constructs the master contract.
     * @param _solace Address of the solace token.
     * @param _solacePerBlock Amount of solace to distribute per block.
     */
    constructor(SOLACE _solace, uint256 _solacePerBlock) public {
        solace = _solace;
        solacePerBlock = _solacePerBlock;
        governance = msg.sender;
    }

    /**
     * @notice Constructs a new farm.
     * @param _token The token to deposit.
     * @param _allocPoints Relative amount of solace rewards to distribute per block.
     * @param _startBlock When the farm will start.
     * @param _endBlock When the farm will end.
     * @return ID of the new farm.
     */
    function createFarm(
        address _token,
        uint256 _allocPoints,
        uint256 _startBlock,
        uint256 _endBlock
    )
        external returns (uint256)
    {
        // leaving input validation to governor
        // require(_token != address(0x0), "cannot farm the null token");
        // require(_startBlock < _endBlock, "duration must be positive");
        // require(_allocPoints > 0, "will not farm for no reward");

        // can only be called by governor
        require(msg.sender == governance, "!governance");

        // accounting
        uint256 farmId = farmInfo.length;
        totalAllocPoints += _allocPoints;
        // create farm info
        farmInfo.push(FarmInfo({
            token: IERC20(_token),
            startBlock: _startBlock,
            endBlock: _endBlock,
            allocPoints: _allocPoints,
            lastRewardBlock: Math.max(block.number, _startBlock),
            accSolacePerShare: 0,
            tokensStaked: 0
        }));
        // create user info
        userInfo.push();
        emit FarmCreated(farmId);
        return farmId;
    }

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    /**
     * @notice Sets the Solace reward distribution across all farms.
     * Optionally updates all farms.
     * @param _solacePerBlock Amount of solace to distribute per block.
     * @param _withUpdate If true, updates all farms.
     */
    function setSolacePerBlock(uint256 _solacePerBlock, bool _withUpdate) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // optional update
        if (_withUpdate) massUpdateFarms();
        // accounting
        solacePerBlock = _solacePerBlock;
    }

    /**
     * @notice Set a farm's allocation and end block.
     * Optionally updates all farms.
     * @dev This should be two methods, setAllocation() and setEndBlock().
     * It is more gas efficient to use a single method.
     * Need to set allocation of multiple farms?
     * Save even more gas by only using _withUpdate on the last farm.
     * @param _farmId The farm to set allocation for.
     * @param _allocPoints The farm's new allocation points.
     * @param _endBlock The farm's new end block.
     * @param _withUpdate If true, updates all farms.
     */
    function setFarmParams(
        uint256 _farmId,
        uint256 _allocPoints,
        uint256 _endBlock,
        bool _withUpdate
    )
        external
    {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // cannot set allocation for a non existant farm
        require(_farmId < farmInfo.length, "farm does not exist");
        // optional update
        if (_withUpdate) massUpdateFarms();
        // accounting
        totalAllocPoints = totalAllocPoints + _allocPoints - farmInfo[_farmId].allocPoints;
        farmInfo[_farmId].allocPoints = _allocPoints;
        farmInfo[_farmId].endBlock = _endBlock;
    }

    /**
     * @notice Deposit token function for msg.sender.
     * @param _farmId The farm to deposit to.
     * @param _amount The deposit amount.
     */
    function deposit(uint256 _farmId, uint256 _amount) external {
        // cannot deposit onto a non existant farm
        require(_farmId < farmInfo.length, "farm does not exist");
        // get farm and farmer information
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][msg.sender];
        // update farm
        updateFarm(_farmId);
        // transfer users pending rewards if nonzero
        if (user.amount > 0) {
            uint256 pending = user.amount * farm.accSolacePerShare / 1e12 - user.rewardDebt;
            safeTransfer(solace, msg.sender, pending);
        }
        // pull tokens
        farm.token.safeTransferFrom(address(msg.sender), address(this), _amount);
        // accounting
        farm.tokensStaked += _amount;
        user.amount += _amount;
        user.rewardDebt = user.amount * farm.accSolacePerShare / 1e12;
        emit Deposit(msg.sender, _farmId, _amount);
    }

    /**
     * @notice Withdraw token function for msg.sender.
     * @param _farmId The farm to withdraw from.
     * @param _amount The withdraw amount.
     * Note: _amount will be deducted from amount deposited.
     * User will receive _amount of CP/LP tokens and accumulated Solace rewards.
     */
    function withdraw(uint256 _farmId, uint256 _amount) external {
        // cannot withdraw from a non existant farm
        require(_farmId < farmInfo.length, "farm does not exist");
        // get farm and farmer information
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][msg.sender];
        // cannot withdraw more than deposited
        require(user.amount >= _amount, "insufficient");
        // update farm
        updateFarm(_farmId);
        // transfer users pending rewards
        uint256 pendingSolace = user.amount * farm.accSolacePerShare / 1e12 - user.rewardDebt;
        safeTransfer(solace, msg.sender, pendingSolace);
        // accounting
        farm.tokensStaked -= _amount;
        user.amount -= _amount;
        user.rewardDebt = user.amount * farm.accSolacePerShare / 1e12;
        // return CP/LP tokens
        safeTransfer(farm.token, msg.sender, _amount);
        emit Withdraw(msg.sender, _farmId, _amount);
    }

    /**
     * @notice Calculates the accumulated balance of reward token for specified user.
     * @param _farmId The farm to measure rewards for.
     * @param _user The user for whom unclaimed tokens will be shown.
     * @return Total amount of withdrawable reward tokens.
     */
    function pendingReward(uint256 _farmId, address _user) external view returns (uint256) {
        // no rewards for a non existant farm
        if (_farmId >= farmInfo.length) return 0;
        // get farm and farmer information
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][_user];
        // math
        uint256 accSolacePerShare = farm.accSolacePerShare;
        if (block.number > farm.lastRewardBlock && farm.tokensStaked != 0 && totalAllocPoints != 0) {
            uint256 multiplier = getMultiplier(_farmId, farm.lastRewardBlock, block.number);
            uint256 tokenReward = multiplier * solacePerBlock * farm.allocPoints / totalAllocPoints;
            accSolacePerShare += tokenReward * 1e12 / farm.tokensStaked;
        }
        return user.amount * accSolacePerShare / 1e12 - user.rewardDebt;
    }

    /**
     * @notice The number of farms.
     * @return The number of farms.
     */
    function farmLength() external view returns (uint256) {
        return farmInfo.length;
    }

    /**
     * @notice Updates farm information to be up to date to the current block.
     * @param _farmId The farm to update.
     */
    function updateFarm(uint256 _farmId) public {
        // dont update a non existant farm
        if (_farmId >= farmInfo.length) return;
        // get farm information
        FarmInfo storage farm = farmInfo[_farmId];
        // dont update needlessly
        if (block.number <= farm.lastRewardBlock) return;
        if (farm.tokensStaked == 0 || totalAllocPoints == 0) {
            farm.lastRewardBlock = Math.min(block.number, farm.endBlock);
            return;
        }
        // update math
        uint256 multiplier = getMultiplier(_farmId, farm.lastRewardBlock, block.number);
        uint256 tokenReward = multiplier * solacePerBlock * farm.allocPoints / totalAllocPoints;
        farm.accSolacePerShare += tokenReward * 1e12 / farm.tokensStaked;
        farm.lastRewardBlock = Math.min(block.number, farm.endBlock);
    }

    /**
     * @notice Updates all farms to be up to date to the current block.
     */
    function massUpdateFarms() public {
        uint256 length = farmInfo.length;
        for (uint256 farmId = 0; farmId < length; ++farmId) {
            updateFarm(farmId);
        }
    }

    /**
     * @notice Calculates the reward multiplier over the given _from until _to block.
     * @param _farmId The farm to measure rewards for.
     * @param _from The start of the period to measure rewards for.
     * @param _to The end of the period to measure rewards for.
     * @return The weighted multiplier for the given period.
     */
    function getMultiplier(uint256 _farmId, uint256 _from, uint256 _to) public view returns (uint256) {
        // no rewards for non existant farm
        if (_farmId >= farmInfo.length) return 0;
        // get farm information
        FarmInfo storage farm = farmInfo[_farmId];
        // validate window
        uint256 from = Math.max(_from, farm.startBlock);
        uint256 to = Math.min(_to, farm.endBlock);
        // no reward for negative window
        if (from > to) return 0;
        return to - from;
    }

    /**
     * @notice Safe transfer function, just in case a rounding error causes farm to not have enough tokens.
     * @param _token Token address.
     * @param _to The user address to transfer tokens to.
     * @param _amount The total amount of tokens to transfer.
     */
    function safeTransfer(IERC20 _token, address _to, uint256 _amount) internal {
        uint256 balance = _token.balanceOf(address(this));
        uint256 transferAmount = Math.min(_amount, balance);
        _token.safeTransfer(_to, transferAmount);
    }
}
