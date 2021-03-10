// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SOLACE.sol";

/// @title Master: owner of solace.fi
/// @author solace.fi
/// @notice This contract is the SOLACE token distributor.

contract Master is Ownable, ReentrancyGuard {
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
        //   1. The farm's `accSolacePerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each farm.
    struct FarmInfo {
        IERC20 token;                          // address of CP or LP token contract
        uint256 startBlock;                    // when the farm will start
        uint256 endBlock;                      // when the farm will end
        uint256 blockReward;                   // rewards distributed per block
        uint256 lastRewardBlock;               // last time rewards were distributed / farm was updated
        uint256 accSolacePerShare;             // accumulated rewards per share, times 1e12
        uint256 numFarmers;                    // number of farmers
        uint256 tokensStaked;                  // number of tokens staked by all farmers
    }

    /// @notice Native SOLACE Token
    SOLACE public solace;

    /// @notice information about each farm
    FarmInfo[] public farmInfo;

    /// @notice information about each farmer
    /// @dev farm id => user address => user info
    mapping(address => UserInfo)[] public userInfo;

    event FarmCreated(uint256 indexed farmId);

    event Deposit(address indexed user, uint256 indexed farmId, uint256 amount);

    event Withdraw(address indexed user, uint256 indexed farmId, uint256 amount);

    /**
     * @notice Constructs the master contract
     * @param _solace address of the solace token
     */
    constructor(SOLACE _solace) public {
        solace = _solace;
    }

    /**
     * @notice The number of farms
     * @return number of farms
     */
    function farmLength() external view returns (uint256) {
        return farmInfo.length;
    }

    /**
     * @notice Calculates the reward multiplier over the given _from until _to block
     * @param _farmId the farm to measure rewards for
     * @param _from the start of the period to measure rewards for
     * @param _to the end of the period to measure rewards for
     * @return The weighted multiplier for the given period
     */
    function getMultiplier(uint256 _farmId, uint256 _from, uint256 _to) public view returns (uint256) {
        if (_farmId >= farmInfo.length) return 0;
        FarmInfo storage farm = farmInfo[_farmId];
        uint256 from = Math.max(_from, farm.startBlock);
        uint256 to = Math.min(_to, farm.endBlock);
        return to - from;
    }

    /**
     * @notice Calculates the accumulated balance of reward token for specified user
     * @param _farmId the farm to measure rewards for
     * @param _user the user for whom unclaimed tokens will be shown
     * @return total amount of withdrawable reward tokens
     */
    function pendingReward(uint256 _farmId, address _user) public view returns (uint256) {
        if (_farmId >= farmInfo.length) return 0;
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][_user];
        uint256 accSolacePerShare = farm.accSolacePerShare;
        if (block.number > farm.lastRewardBlock && farm.tokensStaked != 0) {
            uint256 multiplier = getMultiplier(_farmId, farm.lastRewardBlock, block.number);
            uint256 tokenReward = multiplier * farm.blockReward;
            accSolacePerShare += tokenReward * 1e12 / farm.tokensStaked;
        }
        return user.amount * accSolacePerShare / 1e12 - user.rewardDebt;
    }

    /**
     * @notice constructs a new farm
     * @param _token the token to deposit
     * @param _startBlock when the farm will start
     * @param _endBlock when the farm will end
     * @param _blockReward solace rewards to distribute per block
     * @return id of the new farm
     */
    function createFarm(
        address _token,
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _blockReward
    ) public onlyOwner returns (uint256) {
        // leaving input validation to owner
        // require(_token != address(0x0), "cannot farm the null token");
        // require(_startBlock < _endBlock, "duration must be positive");
        // require(_blockReward > 0, "will not farm for no reward");

        uint256 farmId = farmInfo.length;
        farmInfo.push(FarmInfo({
            token: IERC20(_token),
            startBlock: _startBlock,
            endBlock: _endBlock,
            blockReward: _blockReward,
            lastRewardBlock: Math.max(block.number, _startBlock),
            accSolacePerShare: 0,
            numFarmers: 0,
            tokensStaked: 0
        }));
        userInfo.push();
        emit FarmCreated(farmId);
        return farmId;
    }

    /**
     * @notice updates farm information to be up to date to the current block
     * @param _farmId the farm to update
     */
    function updateFarm(uint256 _farmId) public {
        if (_farmId >= farmInfo.length) return;
        FarmInfo storage farm = farmInfo[_farmId];
        if (block.number <= farm.lastRewardBlock) return;
        if (farm.tokensStaked == 0) {
            farm.lastRewardBlock = Math.min(block.number, farm.endBlock);
            return;
        }
        uint256 multiplier = getMultiplier(_farmId, farm.lastRewardBlock, block.number);
        uint256 tokenReward = multiplier * farm.blockReward;
        farm.accSolacePerShare = farm.accSolacePerShare + (tokenReward * 1e12 / farm.tokensStaked);
        farm.lastRewardBlock = Math.min(block.number, farm.endBlock);
    }

    /**
     * @notice updates all farms to be up to date to the current block
     */
    function massUpdateFarms() public {
        for (uint256 farmId = 0; farmId < farmInfo.length; ++farmId) {
            updateFarm(farmId);
        }
    }

    /**
     * @notice deposit token function for msg.sender
     * @param _farmId the farm to deposit to
     * @param _amount the deposit amount
     */
    function deposit(uint256 _farmId, uint256 _amount) public {
        require(_farmId < farmInfo.length, "farm does not exist");
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][msg.sender];
        updateFarm(_farmId);
        if (user.amount > 0) {
            uint256 pending = user.amount * farm.accSolacePerShare / 1e12 - user.rewardDebt;
            safeTransfer(solace, msg.sender, pending);
        }
        if (user.amount == 0 && _amount > 0) {
            farm.numFarmers++;
        }
        farm.token.safeTransferFrom(address(msg.sender), address(this), _amount);
        farm.tokensStaked += _amount;
        user.amount += _amount;
        user.rewardDebt = user.amount * farm.accSolacePerShare / 1e12;
        emit Deposit(msg.sender, _farmId, _amount);
    }

    /**
     * @notice withdraw token function for msg.sender
     * @param _farmId the farm to withdraw from
     * @param _amount the withdraw amount
     * Note: _amount will be deducted from amount deposited
     * user will receive _amount plus accumulated rewards
     */
    function withdraw(uint256 _farmId, uint256 _amount) public {
        require(_farmId < farmInfo.length, "farm does not exist");
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][msg.sender];
        require(user.amount >= _amount, "insufficient");
        updateFarm(_farmId);
        if (user.amount == _amount && _amount > 0) {
            farm.numFarmers--;
        }
        uint256 pendingSolace = user.amount * farm.accSolacePerShare / 1e12 - user.rewardDebt;
        safeTransfer(solace, msg.sender, pendingSolace);
        farm.tokensStaked -= _amount;
        user.amount -= _amount;
        user.rewardDebt = user.amount * farm.accSolacePerShare / 1e12;
        safeTransfer(farm.token, msg.sender, _amount);
        emit Withdraw(msg.sender, _farmId, _amount);
    }

    /**
     * @notice Safe transfer function, just in case a rounding error causes farm to not have enough tokens
     * @param _token token address
     * @param _to the user address to transfer tokens to
     * @param _amount the total amount of tokens to transfer
     */
    function safeTransfer(IERC20 _token, address _to, uint256 _amount) internal {
        uint256 rewardBal = _token.balanceOf(address(this));
        _token.safeTransfer(_to, Math.min(_amount, rewardBal));
    }
}
