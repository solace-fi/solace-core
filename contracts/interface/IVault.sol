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
    function setCooldownWindow(uint40 _min, uint40 _max) external;

    /**
     * @notice Adds or removes requesting rights.
     * Can only be called by the current governor.
     * @param _dst The requestor.
     * @param _status True to add or false to remove rights.
     */
    function setRequestor(address _dst, bool _status) external;

    /**
     * @notice Allows a user to deposit ETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minted to caller
     * Called when Vault receives ETH
     * Deposits `_amount` `token`, issuing shares to `recipient`.
     * Reverts if Vault is in Emergency Shutdown
     * @return Number of shares minted.
     */
    function depositEth() external payable returns (uint256);

    /**
     * @notice Allows a user to deposit WETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minted to caller
     * Deposits `_amount` `token`, issuing shares to `recipient`.
     * Reverts if Vault is in Emergency Shutdown
     * @param _amount Amount of weth to deposit.
     * @return Number of shares minted.
     */
    function depositWeth(uint256 _amount) external returns (uint256);

    /**
     * @notice Starts the cooldown.
     */
    function startCooldown() external;

    /**
     * @notice Stops the cooldown.
     */
    function stopCooldown() external;

    /**
     * @notice Allows a user to redeem shares for ETH
     * Burns CP tokens and transfers ETH to the CP
     * @param _shares amount of shares to redeem
     * @return value in ETH that the shares where redeemed for
     */
    function withdrawEth(uint256 _shares) external returns (uint256);

    /**
     * @notice Allows a user to redeem shares for ETH
     * Burns CP tokens and transfers WETH to the CP
     * @param _shares amount of shares to redeem
     * @return value in WETH that the shares where redeemed for
     */
    function withdrawWeth(uint256 _shares) external returns (uint256);

    /**
     * @notice Sends ETH to other users or contracts.
     * Can only be called by authorized requestors.
     * @param _amount Amount of ETH wanted.
     * @return Amount of ETH sent.
     */
    function requestEth(uint256 _amount) external returns (uint256);

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
    function cooldownMin() external view returns (uint40);

    /// @notice The maximum amount of time a user must wait to withdraw funds.
    function cooldownMax() external view returns (uint40);

    /**
     * @notice The timestamp that a depositor's cooldown started.
     * @param _user The depositor.
     * @return The timestamp in seconds.
     */
    function cooldownStart(address _user) external view returns (uint40);

    /**
     * @notice Returns true if the user is allowed to receive or send vault shares.
     * @param _user User to query.
     * return status True if can transfer.
     */
    function canTransfer(address _user) external view returns (bool status);

    /**
     * @notice Returns true if the user is allowed to withdraw vault shares.
     * @param _user User to query.
     * return status True if can withdraw.
     */
    function canWithdraw(address _user) external view returns (bool status);

    /**
     * @notice Returns true if the destination is authorized to request ETH.
     */
    function isRequestor(address _dst) external view returns (bool);
}
