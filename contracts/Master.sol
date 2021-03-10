// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SOLACE.sol";

/// @title Master: owner of solace.fi
/// @author Nikita S. Buzov
/// @notice This contract is the SOLACE token distributor.

contract Master is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ========== STRUCTS ========== */

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
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
        IERC20 clpToken;           // Address of CP or LP token contract
        uint256 startBlock;        // when the farm will start
        uint256 endBlock;          // when the farm will end
        uint256 blockReward;       // rewards distributed per block
        uint256 lastRewardBlock;   // last time rewards were distributed / farm was updated
        uint256 accRewardPerShare; // Accumulated Rewards per share, times 1e12
        //uint256 farmableSupply;    // set in init, total amount of tokens farmable
        uint256 numFarmers;        // number of farmers
        uint256 tokensStaked;      // number of tokens staked by all farmers
    }

    /* ========== STATE VARIABLES ========== */

    /// @notice Native SOLACE Token
    SOLACE public solace;
    /// @notice Developer's address (our MultiSig)
    //adress public devaddress;

    /// @notice information about each farm
    FarmInfo[] public farmInfo;
    /// @notice information about each user on each farm
    /// @dev farm num => user address => user info
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    /* ========== EVENTS ========== */

    event FarmCreated(uint256 indexed farmId);

    event Deposit(address indexed user, uint256 indexed farmId, uint256 amount);

    event Withdraw(address indexed user, uint256 indexed farmId, uint256 amount);

    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed farmId,
        uint256 amount
    );

    /* ========== CONSTRUCTOR ========== */

    /**
     * @notice Constructs the master contract.
     * @param _solace address of the solace token
     */
    constructor(SOLACE _solace) public {
        solace = _solace;
    }

    /* ========== VIEWS ========== */

    /**
     * @notice The number of farms.
     * @return number of farms
     */
    function farmLength() external view returns (uint256) {
        return farmInfo.length;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

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
        //require(_token != address(0x0), "cannot farm the null token");
        //require(_startBlock < _endBlock, "time must be positive");
        //require(_blockReward > 0, "will not farm for no reward");

        uint256 farmId = farmInfo.length;
        farmInfo.push(Farm({
            clpToken: IERC20(_token),
            startBlock: _startBlock,
            endBlock: _endBlock,
            blockReward: _blockReward,
            lastRewardBlock: block.number > _startBlock ? block.number : _startBlock,
            accRewardPerShare: 0,
            numFarmers: 0,
            tokensStaked: 0
        }));
        emit FarmCreated(farmId);
        return farmId;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */



    /* ========== MODIFIERS ========== */


}
