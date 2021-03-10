// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SolaceToken.sol";

/// @title Master: owner of solace.fi
/// @author Nikita S. Buzov
/// @notice This contract is the SOLACE token distributor.

contract Master is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ========== STRUCTS ========== */

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of SOLACE
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accSolacePerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accSolacePerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. SOLACE to distribute per block.
        uint256 lastRewardBlock; // Last block number that SUSHIs distribution occurs.
        uint256 accSolacePerShare; // Accumulated SOLACE per share, times 1e12. See below.
    }

    /* ========== STATE VARIABLES ========== */

    /// @notice Native SOLACE Token
    SolaceToken public _solace;
    /// @notice Developer's address (our MultiSig)
    adress public devaddress;

    /* ========== EVENTS ========== */

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);

    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);

    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    /* ========== CONSTRUCTOR ========== */

    constructor(
        SolaceToken _solace,
        address _devaddr,
    ) public {

    }

    /* ========== VIEWS ========== */



    /* ========== MUTATIVE FUNCTIONS ========== */



    /* ========== RESTRICTED FUNCTIONS ========== */



    /* ========== MODIFIERS ========== */


}
