// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IVault.sol";
import "./../SOLACE.sol";
import "./IFarm.sol";


/**
 * @title CpFarm
 * @author solace.fi
 * @notice Rewards [**Capital Providers**](/docs/user-docs/Capital%20Providers) in [`SOLACE`](../SOLACE) for providing capital in the [`Vault`](../Vault).
 *
 * Over the course of `startBlock` to `endBlock`, the farm distributes `blockReward` [`SOLACE`](../SOLACE) per block to all farmers split relative to the amount of [`SCP`](../Vault) they have deposited.
 *
 * Users can become [**Capital Providers**](/docs/user-docs/Capital%20Providers) by depositing `ETH` into the [`Vault`](../Vault), receiving [`SCP`](../Vault) in the process. [**Capital Providers**](/docs/user-docs/Capital%20Providers) can then deposit their [`SCP`](../Vault) via [`depositCp()`](#depositcp) or [`depositCpSigned()`](#depositcpsigned). Users can bypass the [`Vault`](../Vault) and stake their `ETH` via [`depositEth()`](#depositeth).
 *
 * Users can withdraw their rewards via [`withdrawRewards()`](#withdrawrewards) and compound their rewards via [`compoundRewards()`](#compoundrewards).
 *
 * Users can withdraw their [`SCP`](../Vault) via [`withdrawCp()`](#withdrawcp).
 *
 * Note that transferring in `ETH` will mint you shares, but transferring in `WETH` or [`SCP`](../Vault) will not. These must be deposited via functions in this contract. Misplaced funds cannot be rescued.
 */
interface ICpFarm is IFarm {

    /// @notice Emitted when CP tokens are deposited onto the farm.
    event CpDeposited(address indexed user, uint256 amount);
    /// @notice Emitted when ETH is deposited onto the farm.
    event EthDeposited(address indexed user, uint256 amount);
    /// @notice Emitted when a user compounds their rewards.
    event RewardsCompounded(address indexed user);
    /// @notice Emitted when CP tokens are withdrawn from the farm.
    event CpWithdrawn(address indexed user, uint256 amount);
    /// @notice Emitted when a user is rewarded.
    event UserRewarded(address indexed user, uint256 amount);
    /// @notice Emitted when block reward is changed.
    event RewardsSet(uint256 blockReward);
    /// @notice Emitted when the end block is changed.
    event FarmEndSet(uint256 endBlock);

    /**
     * Receive function. Deposits eth. User will receive accumulated rewards if any.
     */
    receive () external payable;

    /**
     * Fallback function. Deposits eth. User will receive accumulated rewards if any.
     */
    fallback () external payable;

    /**
     * @notice Deposit some [`CP tokens`](../Vault).
     * User will receive accumulated rewards if any.
     * User must `ERC20.approve()` first.
     * @param amount The deposit amount.
     */
    function depositCp(uint256 amount) external;

    /**
     * @notice Deposit some [`CP tokens`](../Vault) using `ERC2612.permit()`.
     * User will receive accumulated rewards if any.
     * @param depositor The depositing user.
     * @param amount The deposit amount.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function depositCpSigned(address depositor, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;

    /**
     * @notice Deposit some `ETH`.
     * User will receive accumulated rewards if any.
     */
    function depositEth() external payable;

    /**
     * @notice Your money already makes you money. Now make your money make more money!
     * Withdraws your [`SOLACE`](../SOLACE) rewards, swaps it for `WETH`, then deposits that `WETH` onto the farm.
     */
    function compoundRewards() external;

    /**
     * @notice Withdraw some [`CP tokens`](../Vault).
     * User will receive amount of deposited tokens and accumulated rewards.
     * Can only withdraw as many tokens as you deposited.
     * @param amount The withdraw amount.
     */
    function withdrawCp(uint256 amount) external;

    /// @notice Vault contract.
    function vault() external view returns (IVault);

    /// @notice Last time rewards were distributed or farm was updated.
    function lastRewardBlock() external view returns (uint256);

    /// @notice Accumulated rewards per share, times 1e12.
    function accRewardPerShare() external view returns (uint256);

    /// @notice Value of tokens staked by all farmers.
    function valueStaked() external view returns (uint256);
}
