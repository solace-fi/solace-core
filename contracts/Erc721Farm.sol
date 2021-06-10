// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./libraries/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./libraries/EnumerableMap.sol";
import "./interface/IErc721Farm.sol";


/**
 * @title Erc721Farm: A farm that allows for the staking of ERC721 tokens.
 * @author solace.fi
 */
contract Erc721Farm is IErc721Farm {
    using SafeERC20 for IERC20;
    using EnumerableMap for EnumerableMap.UintToUintMap;

    /// @notice A unique enumerator that identifies the farm type.
    uint256 public override farmType = 102;

    address public override stakeToken;        // Address of token to stake.
    address public override rewardToken;       // Address of token to receive.
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
        //
        // We do some fancy math here. Basically, any point in time, the amount of reward token
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.value * accRewardPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a farm. Here's what happens:
        //   1. The farm's `accRewardPerShare` and `lastRewardBlock` gets updated.
        //   2. User receives the pending reward sent to his/her address.
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

    // The ERC721 tokens that a user deposited and their values.
    // user address => token id => token value
    mapping(address => EnumerableMap.UintToUintMap) private depositedErc721sAndValues;

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
         uint256 _endBlock
     ) {
         master = _master;
         stakeToken = _stakeToken;
         rewardToken = _rewardToken;
         startBlock = _startBlock;
         endBlock = _endBlock;
         lastRewardBlock = Math.max(block.number, _startBlock);
         governance = msg.sender;
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
     * @notice Deposit an ERC721 token.
     * User will receive accumulated Solace rewards if any.
     * @param _token The deposit token.
     */
    function deposit(uint256 _token) external override {
        // harvest and update farm
        _harvest();
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // pull token
        IERC721(stakeToken).transferFrom(address(msg.sender), address(this), _token);
        // accounting
        uint256 tokenValue = appraise(_token);
        valueStaked += tokenValue;
        user.value += tokenValue;
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        depositedErc721sAndValues[msg.sender].set(_token, tokenValue);
        emit Deposit(msg.sender, _token);
    }

    /**
     * @notice Withdraw an ERC721 token.
     * User will receive _token and accumulated rewards.
     * @param _token The withdraw token.
     */
    function withdraw(uint256 _token) external override {
        // harvest and update farm
        _harvest();
        // get farmer information
        UserInfo storage user = userInfo[msg.sender];
        // cannot withdraw a token you didnt deposit
        require(depositedErc721sAndValues[msg.sender].contains(_token), "not your token");
        // accounting
        uint256 tokenValue = depositedErc721sAndValues[msg.sender].get(_token);
        valueStaked -= tokenValue;
        user.value -= tokenValue;
        user.rewardDebt = user.value * accRewardPerShare / 1e12;
        depositedErc721sAndValues[msg.sender].remove(_token);
        // return staked token
        IERC721(stakeToken).safeTransferFrom(address(this), msg.sender, _token);
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
        return user.value * _accRewardPerShare / 1e12 - user.rewardDebt;
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
     * @notice Appraises an NFT.
     * @param _token The id of the token.
     * @return The token's value.
     */
    function appraise(uint256 _token) public view returns (uint256) {
        // TODO: this is a token-specific method
        return 0;
    }

    /**
     * @notice Returns the count of ERC721s that a user has deposited onto a farm.
     * @param _user The user to check count for.
     * @return The count of deposited ERC721s.
     */
    function countDeposited(address _user) external view override returns (uint256) {
        return depositedErc721sAndValues[_user].length();
    }

    /**
     * @notice Returns the list of ERC721s that a user has deposited onto a farm and their values.
     * @param _user The user to list ERC721s.
     * @return The list of deposited ERC721s.
     * @return The values of the tokens.
     */
    function listDeposited(address _user) external view override returns (uint256[] memory, uint256[] memory) {
        uint256 length = depositedErc721sAndValues[_user].length();
        uint256[] memory tokens = new uint256[](length);
        uint256[] memory values = new uint256[](length);
        for(uint256 i = 0; i < length; ++i) {
            (uint256 _token, uint256 _value) = depositedErc721sAndValues[_user].at(i);
            tokens[i] = _token;
            values[i] = _value;
        }
        return (tokens, values);
    }

    /**
     * @notice Returns the id of an ERC721 that a user has deposited onto a farm and its value.
     * @param _user The user to get token id for.
     * @param _index The farm-based index of the token.
     * @return The id of the deposited ERC721.
     * @return The value of the token.
     */
    function getDeposited(address _user, uint256 _index) external view override returns (uint256, uint256) {
        (uint256 _token, uint256 _value) = depositedErc721sAndValues[_user].at(_index);
        return (_token, _value);
    }

    /**
     * @notice Returns true if a user has deposited a given ERC721.
     * @param _user The user to check.
     * @param _token The token to check.
     * @return True if the user has deposited the given ERC721.
     */
    function assertDeposited(address _user, uint256 _token) external view returns (bool) {
        return depositedErc721sAndValues[_user].contains(_token);
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
        uint256 pending = user.value * accRewardPerShare / 1e12 - user.rewardDebt;
        if (pending == 0) return;
        // safe transfer rewards
        uint256 balance = IERC20(rewardToken).balanceOf(master);
        uint256 transferAmount = Math.min(pending, balance);
        IERC20(rewardToken).safeTransferFrom(master, msg.sender, transferAmount);
    }
}
