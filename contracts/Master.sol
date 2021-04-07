// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./SOLACE.sol";
import "./interface/INftAppraiser.sol";
import "./interface/IMaster.sol";


/**
 * @title Master: Distributor of solace.fi
 * @author solace.fi
 * @notice This contract is the SOLACE token distributor.
 */
contract Master is IMaster {
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 value;                            // Value of user provided tokens.
        uint256 rewardDebt;                       // Reward debt. See explanation below.
        mapping(uint256 => bool) tokensDeposited; // If an ERC721 farm, which tokens have been deposited.
        mapping(uint256 => uint256) tokenValues;  // If an ERC721 farm, the value of deposited tokens.
        //
        // We do some fancy math here. Basically, any point in time, the amount of SOLACE
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.value * farm.accSolacePerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a farm. Here's what happens:
        //   1. The farm's `accSolacePerShare` and `lastRewardBlock` gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `value` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each farm.
    struct FarmInfo {
        address token;             // Address of token contract.
        address appraiser;         // If an ERC721 farm, address of the appraiser contract.
        uint256 allocPoints;       // How many allocation points assigned to this farm.
        uint256 startBlock;        // When the farm will start.
        uint256 endBlock;          // When the farm will end.
        uint256 lastRewardBlock;   // Last time rewards were distributed or farm was updated.
        uint256 accSolacePerShare; // Accumulated rewards per share, times 1e12.
        uint256 valueStaked;       // Value of tokens staked by all farmers.
    }

    /// @notice Native SOLACE Token.
    SOLACE public solace;

    /// @notice Total solace distributed per block across all farms.
    uint256 public solacePerBlock;

    /// @notice Total allocation points across all farms.
    uint256 public totalAllocPoints;

    /// @notice Information about each farm.
    /// @dev farm id => farm info
    mapping(uint256 => FarmInfo) public farmInfo;

    /// @notice Information about each farmer.
    /// @dev farm id => user address => user info
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    // track farm ids and types
    /// @notice Returns true if farming ERC20 tokens.
    mapping(uint256 => bool) public farmIsErc20;
    /// @notice Returns true if farming ERC721 tokens.
    mapping(uint256 => bool) public farmIsErc721;

    /// @notice The number of farms that have been created.
    uint256 public numFarms;

    // events
    // Emitted when an ERC20 farm is created.
    event Erc20FarmCreated(uint256 indexed _farmId);
    // Emitted when an ERC721 farm is created.
    event Erc721FarmCreated(uint256 indexed _farmId);
    // Emitted when ERC20 tokens are deposited onto a farm.
    event DepositErc20(address indexed _user, uint256 indexed _farmId, uint256 _amount);
    // Emitted when an ERC721 token is deposited onto a farm.
    event DepositErc721(address indexed _user, uint256 indexed _farmId, uint256 _token);
    // Emitted when ERC20 tokens are withdrawn from a farm.
    event WithdrawErc20(address indexed _user, uint256 indexed _farmId, uint256 _amount);
    // Emitted when an ERC721 token is withdrawn from a farm.
    event WithdrawErc721(address indexed _user, uint256 indexed _farmId, uint256 _token);

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
     * @notice Constructs a new farm for an ERC20 token.
     * @param _token The token to deposit.
     * @param _allocPoints Relative amount of solace rewards to distribute per block.
     * @param _startBlock When the farm will start.
     * @param _endBlock When the farm will end.
     * @return ID of the new farm.
     */
    function createFarmErc20(
        address _token,
        uint256 _allocPoints,
        uint256 _startBlock,
        uint256 _endBlock
    )
        external override returns (uint256)
    {
        // leaving input validation to governor
        // require(_token != address(0x0), "cannot farm the null token");
        // require(_startBlock < _endBlock, "duration must be positive");
        // require(_allocPoints > 0, "will not farm for no reward");

        // can only be called by governor
        require(msg.sender == governance, "!governance");

        // accounting
        uint256 farmId = numFarms++;
        farmIsErc20[farmId] = true;
        totalAllocPoints += _allocPoints;
        // create farm info
        farmInfo[farmId] = FarmInfo({
            token: _token,
            appraiser: address(0),
            startBlock: _startBlock,
            endBlock: _endBlock,
            allocPoints: _allocPoints,
            lastRewardBlock: Math.max(block.number, _startBlock),
            accSolacePerShare: 0,
            valueStaked: 0
        });
        emit Erc20FarmCreated(farmId);
        return farmId;
    }

    /**
     * @notice Constructs a new farm for an ERC721 token.
     * @param _token The token to deposit.
     * @param _appraiser The appraiser contract.
     * @param _allocPoints Relative amount of solace rewards to distribute per block.
     * @param _startBlock When the farm will start.
     * @param _endBlock When the farm will end.
     * @return ID of the new farm.
     */
    function createFarmErc721(
        address _token,
        address _appraiser,
        uint256 _allocPoints,
        uint256 _startBlock,
        uint256 _endBlock
    )
        external override returns (uint256)
    {
        // leaving input validation to governor
        // require(_token != address(0x0), "cannot farm the null token");
        // require(_appraiser != address(0x0), "must have an appraiser");
        // require(_startBlock < _endBlock, "duration must be positive");
        // require(_allocPoints > 0, "will not farm for no reward");

        // can only be called by governor
        require(msg.sender == governance, "!governance");

        // accounting
        uint256 farmId = numFarms++;
        farmIsErc721[farmId] = true;
        totalAllocPoints += _allocPoints;
        // create farm info
        farmInfo[farmId] = FarmInfo({
            token: _token,
            appraiser: _appraiser,
            startBlock: _startBlock,
            endBlock: _endBlock,
            allocPoints: _allocPoints,
            lastRewardBlock: Math.max(block.number, _startBlock),
            accSolacePerShare: 0,
            valueStaked: 0
        });
        emit Erc721FarmCreated(farmId);
        return farmId;
    }

    /**
     * @notice Sets the Solace reward distribution across all farms.
     * Optionally updates all farms.
     * @param _solacePerBlock Amount of solace to distribute per block.
     * @param _withUpdate If true, updates all farms.
     */
    function setSolacePerBlock(uint256 _solacePerBlock, bool _withUpdate) external override {
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
        external override
    {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // cannot set allocation for a non existant farm
        require(_farmId < numFarms, "farm does not exist");
        // optional update
        if (_withUpdate) massUpdateFarms();
        // accounting
        totalAllocPoints = totalAllocPoints + _allocPoints - farmInfo[_farmId].allocPoints;
        farmInfo[_farmId].allocPoints = _allocPoints;
        farmInfo[_farmId].endBlock = _endBlock;
    }

    /**
     * @notice Deposit some ERC20 tokens.
     * User will receive accumulated Solace rewards if any.
     * @param _farmId The farm to deposit to.
     * @param _amount The deposit amount.
     */
    function depositErc20(uint256 _farmId, uint256 _amount) external override {
        // cannot deposit onto a non existant farm
        require(farmIsErc20[_farmId], "not an erc20 farm");
        // get farm and farmer information
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][msg.sender];
        // harvest
        _harvest(_farmId);
        // pull tokens
        IERC20(farm.token).safeTransferFrom(address(msg.sender), address(this), _amount);
        // accounting
        farm.valueStaked += _amount;
        user.value += _amount;
        user.rewardDebt = user.value * farm.accSolacePerShare / 1e12;
        emit DepositErc20(msg.sender, _farmId, _amount);
    }

    /**
     * @notice Deposit an ERC721 token.
     * User will receive accumulated Solace rewards if any.
     * @param _farmId The farm to deposit to.
     * @param _token The deposit token.
     */
    function depositErc721(uint256 _farmId, uint256 _token) external override {
        // cannot deposit onto a non existant farm
        require(farmIsErc721[_farmId], "not an erc721 farm");
        // get farm and farmer information
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][msg.sender];
        // harvest
        _harvest(_farmId);
        // pull tokens
        IERC721(farm.token).transferFrom(address(msg.sender), address(this), _token);
        // accounting
        uint256 value = INftAppraiser(farm.appraiser).appraise(_token);
        farm.valueStaked += value;
        user.value += value;
        user.rewardDebt = user.value * farm.accSolacePerShare / 1e12;
        user.tokensDeposited[_token] = true;
        user.tokenValues[_token] = value;
        emit DepositErc721(msg.sender, _farmId, _token);
    }

    /**
     * @notice Withdraw some ERC20 tokens.
     * User will receive _amount of CP/LP tokens and accumulated Solace rewards.
     * @param _farmId The farm to withdraw from.
     * @param _amount The withdraw amount.
     */
    function withdrawErc20(uint256 _farmId, uint256 _amount) external override {
        // cannot deposit onto a non existant farm
        require(farmIsErc20[_farmId], "not an erc20 farm");
        // get farm and farmer information
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][msg.sender];
        // harvest
        _harvest(_farmId);
        // accounting
        farm.valueStaked -= _amount;
        user.value -= _amount; // also reverts overwithdraw
        user.rewardDebt = user.value * farm.accSolacePerShare / 1e12;
        // return CP/LP tokens
        _safeTransfer(IERC20(farm.token), msg.sender, _amount);
        emit WithdrawErc20(msg.sender, _farmId, _amount);
    }

    /**
     * @notice Withdraw an ERC721 token.
     * User will receive _token and accumulated Solace rewards.
     * @param _farmId The farm to withdraw from.
     * @param _token The withdraw token.
     */
    function withdrawErc721(uint256 _farmId, uint256 _token) external override {
        // cannot deposit onto a non existant farm
        require(farmIsErc721[_farmId], "not an erc721 farm");
        // get farm and farmer information
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][msg.sender];
        // harvest
        _harvest(_farmId);
        // cannot withdraw a token you didnt deposit
        require(user.tokensDeposited[_token], "not your token");
        // accounting
        uint256 tokenValue = user.tokenValues[_token];
        farm.valueStaked -= tokenValue;
        user.value -= tokenValue;
        user.rewardDebt = user.value * farm.accSolacePerShare / 1e12;
        user.tokensDeposited[_token] = false;
        // return CP/LP tokens
        IERC721(farm.token).safeTransferFrom(address(this), msg.sender, _token);
        emit WithdrawErc721(msg.sender, _farmId, _token);
    }

    /**
     * Withdraw your pending rewards without unstaking your tokens.
     * @param _farmId The farm to withdraw rewards from.
     */
    function withdrawRewards(uint256 _farmId) external override {
        // cannot get rewards for a non existant farm
        require(_farmId < numFarms, "farm does not exist");
        // harvest
        _harvest(_farmId);
        // get farm and farmer information
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][msg.sender];
        // accounting
        user.rewardDebt = user.value * farm.accSolacePerShare / 1e12;
    }

    /**
     * @notice Calculates the accumulated balance of reward token for specified user.
     * @param _farmId The farm to measure rewards for.
     * @param _user The user for whom unclaimed tokens will be shown.
     * @return Total amount of withdrawable reward tokens.
     */
    function pendingReward(uint256 _farmId, address _user) external view override returns (uint256) {
        // no rewards for a non existant farm
        if (_farmId >= numFarms) return 0;
        // get farm and farmer information
        FarmInfo storage farm = farmInfo[_farmId];
        UserInfo storage user = userInfo[_farmId][_user];
        // math
        uint256 accSolacePerShare = farm.accSolacePerShare;
        if (block.number > farm.lastRewardBlock && farm.valueStaked != 0 && totalAllocPoints != 0) {
            uint256 multiplier = getMultiplier(_farmId, farm.lastRewardBlock, block.number);
            uint256 tokenReward = multiplier * solacePerBlock * farm.allocPoints / totalAllocPoints;
            accSolacePerShare += tokenReward * 1e12 / farm.valueStaked;
        }
        return user.value * accSolacePerShare / 1e12 - user.rewardDebt;
    }

    /**
     * @notice Updates farm information to be up to date to the current block.
     * @param _farmId The farm to update.
     */
    function updateFarm(uint256 _farmId) public override {
        // dont update a non existant farm
        if (_farmId >= numFarms) return;
        // get farm information
        FarmInfo storage farm = farmInfo[_farmId];
        // dont update needlessly
        if (block.number <= farm.lastRewardBlock) return;
        if (farm.valueStaked == 0 || totalAllocPoints == 0) {
            farm.lastRewardBlock = Math.min(block.number, farm.endBlock);
            return;
        }
        // update math
        uint256 multiplier = getMultiplier(_farmId, farm.lastRewardBlock, block.number);
        uint256 tokenReward = multiplier * solacePerBlock * farm.allocPoints / totalAllocPoints;
        farm.accSolacePerShare += tokenReward * 1e12 / farm.valueStaked;
        farm.lastRewardBlock = Math.min(block.number, farm.endBlock);
    }

    /**
     * @notice Updates all farms to be up to date to the current block.
     */
    function massUpdateFarms() public override {
        uint256 farmId;
        uint256 _numFarms = numFarms; // copy to memory to save gas
        for (farmId = 0; farmId < _numFarms; ++farmId) {
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
    function getMultiplier(uint256 _farmId, uint256 _from, uint256 _to) public view override returns (uint256) {
        // no reward for non existant farm
        if (_farmId >= numFarms) return 0;
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
    * Calculate and transfer a user's rewards.
    * @param _farmId The farm to withdraw rewards from.
    */
    function _harvest(uint256 _farmId) internal {
      // get farm and farmer information
      FarmInfo storage farm = farmInfo[_farmId];
      UserInfo storage user = userInfo[_farmId][msg.sender];
      // update farm
      updateFarm(_farmId);
      // transfer users pending rewards if nonzero
      uint256 pending = user.value * farm.accSolacePerShare / 1e12 - user.rewardDebt;
      if (pending > 0) _safeTransfer(solace, msg.sender, pending);
    }

    /**
     * @notice Safe ERC20 transfer function, just in case a rounding error causes farm to not have enough tokens.
     * @param _token Token address.
     * @param _to The user address to transfer tokens to.
     * @param _amount The total amount of tokens to transfer.
     */
    function _safeTransfer(IERC20 _token, address _to, uint256 _amount) internal {
        uint256 balance = _token.balanceOf(address(this));
        uint256 transferAmount = Math.min(_amount, balance);
        _token.safeTransfer(_to, transferAmount);
    }
}
