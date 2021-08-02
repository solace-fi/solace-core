// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";

/**
 * @title Vault interface
 * @author solace.fi
 * @notice Interface for Vault contract
 */

struct StrategyParams {
    uint256 performanceFee;
    uint256 activation;
    uint256 debtRatio;
    uint256 minDebtPerHarvest;
    uint256 maxDebtPerHarvest;
    uint256 lastReport;
    uint256 totalDebt;
    uint256 totalGain;
    uint256 totalLoss;
}

interface IVault is IERC20, IERC20Permit {

    // Emitted when a user deposits funds.
    event DepositMade(address indexed depositor, uint256 indexed amount, uint256 indexed shares);
    // Emitted when a user withdraws funds.
    event WithdrawalMade(address indexed withdrawer, uint256 indexed value);
    // Emitted when funds are sent to escrow.
    event FundsSent(uint256 value);
    // Emitted when emergency shutdown mode is toggled.
    event EmergencyShutdown(bool active);
    // Emitted when Governance is set.
    event GovernanceTransferred(address _newGovernance);

    /// @notice Governance.
    function governance() external view returns (address);

    /// @notice Governance to take over.
    function newGovernance() external view returns (address);

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external;

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external;

    /**
     * @notice Activates or deactivates emergency shutdown.
     * Can only be called by the current governor.
     * During Emergency Shutdown:
     * 1. No users may deposit into the Vault.
     * 2. Withdrawls can bypass cooldown.
     * 3. Only Governance may undo Emergency Shutdown.
     * @param active If true, the Vault goes into Emergency Shutdown.
     * If false, the Vault goes back into Normal Operation.
    */
    function setEmergencyShutdown(bool active) external;

    /**
     * @notice Sets the minimum and maximum amount of time a user must wait to withdraw funds.
     * Can only be called by the current governor.
     * @param _min Minimum time in seconds.
     * @param _max Maximum time in seconds.
     */
    function setCooldownWindow(uint64 _min, uint64 _max) external;

    /**
     * @notice Allows a user to deposit ETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minted to caller
     * Called when Vault receives ETH
     * Deposits `_amount` `token`, issuing shares to `recipient`.
     * Reverts if Vault is in Emergency Shutdown
     */
    function deposit() external payable;

    /**
     * @notice Allows a user to deposit WETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minted to caller
     * Deposits `_amount` `token`, issuing shares to `recipient`.
     * Reverts if Vault is in Emergency Shutdown
     * @param amount Amount of weth to deposit.
     */
    function depositWeth(uint256 amount) external;

    /**
     * @notice Starts the cooldown.
     */
    function startCooldown() external;

    /**
     * @notice Allows a user to redeem shares for ETH
     * Burns CP tokens and transfers ETH to the CP
     * @param shares amount of shares to redeem
     * @return value in ETH that the shares where redeemed for
     */
    function withdraw(uint256 shares) external returns (uint256);

    /**
     * @notice Sends ETH to ClaimsEscrow to pay out claims.
     * Can only be called by ClaimsEscrow.
     * @param amount Amount of ETH wanted
     * @return Amount of ETH sent
     */
    function requestEth(uint256 amount) external returns (uint256);

    // weth
    function token() external view returns (IERC20);

    /**
    * @notice Returns the maximum redeemable shares by the `user` such that Vault does not go under MCR
    * @param user Address of user to check
    * @return Max redeemable shares by the user
    */
    function maxRedeemableShares(address user) external view returns (uint256);

    /**
     * @notice Returns the total quantity of all assets under control of this
        Vault, including those loaned out to a Strategy as well as those currently
        held in the Vault.
     * @return The total assets under control of this vault.
    */
    function totalAssets() external view returns (uint256);

    /// @notice The minimum amount of time a user must wait to withdraw funds.
    function cooldownMin() external view returns (uint64);

    /// @notice The maximum amount of time a user must wait to withdraw funds.
    function cooldownMax() external view returns (uint64);

    /**
     * @notice The timestamp that a depositor's cooldown started.
     * @param _user The depositor.
     * @return The timestamp in seconds.
     */
    function cooldownStart(address _user) external view returns (uint64);
}
