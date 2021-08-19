// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IVault.sol";
import "./../SOLACE.sol";
import "./IFarm.sol";


/**
 * @title ICpFarm
 * @author solace.fi
 * @notice The base type of Master Capital Provider farms.
 */
interface ICpFarm is IFarm {

    /// @notice Emitted when CP tokens are deposited onto the farm.
    event CpDeposited(address indexed _user, uint256 _amount);
    /// @notice Emitted when ETH is deposited onto the farm.
    event EthDeposited(address indexed _user, uint256 _amount);
    /// @notice Emitted when a user compounds their rewards.
    event RewardsCompounded(address indexed _user);
    /// @notice Emitted when CP tokens are withdrawn from the farm.
    event CpWithdrawn(address indexed _user, uint256 _amount);
    /// @notice Emitted when a user is rewarded.
    event UserRewarded(address indexed _user, uint256 _amount);
    /// @notice Emitted when block reward is changed.
    event RewardsSet(uint256 _blockReward);
    /// @notice Emitted when the end block is changed.
    event FarmEndSet(uint256 _endBlock);

    /**
     * Receive function. Deposits eth. User will receive accumulated rewards if any.
     */
    receive () external payable;

    /**
     * Fallback function. Deposits eth. User will receive accumulated rewards if any.
     */
    fallback () external payable;

    /**
     * @notice Deposit some CP tokens.
     * User will receive accumulated rewards if any.
     * @param _amount The deposit amount.
     */
    function depositCp(uint256 _amount) external;

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
    function depositCpSigned(address _depositor, uint256 _amount, uint256 _deadline, uint8 v, bytes32 r, bytes32 s) external;

    /**
     * @notice Deposit some ETH.
     * User will receive accumulated rewards if any.
     */
    function depositEth() external payable;

    /**
     * Your money already makes you money. Now make your money make more money!
     * @notice Withdraws your SOLACE rewards, swaps it for WETH, then deposits that WETH onto the farm.
     */
    function compoundRewards() external;

    /**
     * @notice Withdraw some CP tokens.
     * User will receive _amount of deposited tokens and accumulated rewards.
     * @param _amount The withdraw amount.
     */
    function withdrawCp(uint256 _amount) external;

    /// @notice Vault contract.
    function vault() external view returns (IVault);

    /// @notice Last time rewards were distributed or farm was updated.
    function lastRewardBlock() external view returns (uint256);

    /// @notice Accumulated rewards per share, times 1e12.
    function accRewardPerShare() external view returns (uint256);

    /// @notice Value of tokens staked by all farmers.
    function valueStaked() external view returns (uint256);
}
