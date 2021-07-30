// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/IVault.sol";
import "./interface/IStrategy.sol";

/**
 * @title BaseStrategy
 * @author solace.fi
 * @notice To be inherited by individual Strategy contracts to execute on for investing pooled CP funds.
 */
abstract contract BaseStrategy is IStrategy {
    using Address for address;
    using SafeERC20 for IERC20;

    /// @notice Governor.
    address public governance;

    /// @notice Governance to take over.
    address public newGovernance;

    IVault public vault;
    IERC20 public want;

    bool public emergencyExit;

    event EmergencyExitEnabled();
    event Harvested(uint256 profit, uint256 loss, uint256 debtPayment, uint256 debtOutstanding);
    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);

    constructor (address _vault) {
        governance = msg.sender;

        vault = IVault(_vault);

        // setting want per strategy as Vault wants ETH
        want = IERC20(vault.token());

        // Give Vault unlimited access to `want` so that WETH can be transferred during `vault.report()`
        SafeERC20.safeApprove(want, _vault, type(uint256).max);
    }

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Allows governance to set address for a new Vault contract
     * Can only be called by the current governor.
     * @param _vault address of the Vault contract
     */
    function setVault(address _vault) external {
        require(msg.sender == governance, "!governance");
        vault = IVault(_vault);
    }

    /**
     * @notice Activates emergency exit. Once activated, the Strategy will exit its
     *  position upon the next harvest, depositing all funds into the Vault as
     *  quickly as is reasonable given on-chain conditions.
     *  Can only be called by the current governor.
     * @dev See `vault.setEmergencyShutdown()` and `harvest()` for further details.
     */
    function setEmergencyExit() external {
        require(msg.sender == governance, "!governance");
        emergencyExit = true;
        vault.revokeStrategy(address(this));
        emit EmergencyExitEnabled();
    }

    /**
     * @notice Transfers an amount of ETH to the Vault
     * Can only be called by the vault contract.
     * @param _amountNeeded amount needed by Vault
     * @return _loss Any realized losses
     */
    function withdraw(uint256 _amountNeeded) external override returns (uint256 _loss) {
        require(msg.sender == address(vault), "!vault");
        // Liquidate to `want`, up to `_amountNeeded`
        uint256 amountFreed;
        (amountFreed, _loss) = liquidatePosition(_amountNeeded);
        want.safeTransfer(msg.sender, amountFreed);
    }

    /**
     * @notice
     *  Harvests the Strategy, recognizing any profits or losses and adjusting
     *  the Strategy's position.
     *
     *  In the rare case the Strategy is in emergency shutdown, this will exit
     *  the Strategy's position.
     *
     *  Can only be called by the current governor (as well as strategist or keeper in the future).
     * @dev
     *  When `harvest()` is called, the Strategy reports to the Vault (via
     *  `vault.report()`), so in some cases `harvest()` must be called in order
     *  to take in profits, to borrow newly available funds from the Vault, or
     *  otherwise adjust its position. In other cases `harvest()` must be
     *  called to report to the Vault on the Strategy's position, especially if
     *  any losses have occurred.
    */
    function harvest() external override {
        require(msg.sender == governance, "!governance");
        uint256 profit = 0;
        uint256 loss = 0;
        uint256 debtOutstanding = vault.debtOutstanding(address(this));
        uint256 debtPayment = 0;
        if (emergencyExit) {
            // Free up as much capital as possible
            uint256 totalAssets = estimatedTotalAssets();
            // NOTE: use the larger of total assets or debt outstanding to book losses properly
            (debtPayment, loss) = liquidatePosition(totalAssets > debtOutstanding ? totalAssets : debtOutstanding);
            // NOTE: take up any remainder here as profit
            if (debtPayment > debtOutstanding) {
                profit = debtPayment - debtOutstanding;
                debtPayment = debtOutstanding;
            }
        } else {
            // Free up returns for Vault to pull
            (profit, loss, debtPayment) = prepareReturn(debtOutstanding);
        }

        // Allow Vault to take up to the "harvested" balance of this contract,
        // which is the amount it has earned since the last time it reported to
        // the Vault.
        debtOutstanding = vault.report(profit, loss, debtPayment);

        // Check if free returns are left, and re-invest them
        adjustPosition(debtOutstanding);

        emit Harvested(profit, loss, debtPayment, debtOutstanding);
    }

    /**
     * @notice
     *  The amount (priced in want) of the total assets managed by this strategy should not count
     *  towards Solace TVL calculations.
     * @dev
     *  You can override this field to set it to a non-zero value should some of the assets of this
     *  Strategy is somehow delegated inside another part of of Solace's ecosystem e.g. another Vault.
     *  This value must be strictly less than or equal to the amount provided by `estimatedTotalAssets()`,
     *  as the TVL calc will be total assets minus delegated assets.
     *  Also note that this value is used to determine the total assets under management by this
     *  strategy, for the purposes of computing the management fee in `Vault`
     * @return
     *  The amount of assets this strategy manages that should not be included in Solace's Total Value
     *  Locked (TVL) calculation across it's ecosystem.
     */
    function delegatedAssets() external virtual override view returns (uint256) {
        return 0;
    }

    /**
     * @notice
     *  Provide an accurate estimate for the total amount of assets
     *  (principle + return) that this Strategy is currently managing,
     *  denominated in `want` tokens.
     *
     *  This total should be realizable from this Strategy if it
     *  were to divest its entire position based on current on-chain conditions.
     * @dev
     *  This function relies on external systems, which could be manipulated by
     *  the attacker to give an inflated (or reduced) value produced by this function,
     *  based on current on-chain conditions (e.g. this function is possible to influence
     *  through flashloan attacks, oracle manipulations, or other DeFi attack mechanisms).
     * @return The estimated total assets in this Strategy.
     */
    function estimatedTotalAssets() public virtual override view returns (uint256);

    /**
     * @notice
     *  Provide an indication of whether this strategy is currently "active"
     *  in that it is managing an active position, or will manage a position in
     *  the future. This should correlate to `harvest()` activity, so that Harvest
     *  events can be tracked externally by indexing agents.
     * @return True if the strategy is actively managing a position.
     */
    function isActive() public view override returns (bool) {
        return vault.strategies(address(this)).debtRatio > 0 || estimatedTotalAssets() > 0;
    }

    /**
     * @notice
     *  Liquidate up to `_amountNeeded` of `want` of this strategy's positions,
     *  irregardless of slippage. Any excess will be re-invested with `adjustPosition()`.
     * @dev
    *   This function should return the amount of `want` tokens made available by the
     *  liquidation. If there is a difference between them, `_loss` indicates whether the
     *  difference is due to a realized loss, or if there is some other sitution at play
     *  (e.g. locked funds) where the amount made available is less than what is needed.
     *
     *  NOTE: The invariant `_liquidatedAmount + _loss <= _amountNeeded` should always be maintained
     */
    function liquidatePosition(uint256 _amountNeeded) internal virtual returns (uint256 _liquidatedAmount, uint256 _loss);

    /**
     * Perform any adjustments to the core position(s) of this Strategy given
     * what change the Vault made in the "investable capital" available to the
     * Strategy.
     * NOTE: all "free capital" in the Strategy after the report
     * was made is available for reinvestment. Also note that this number
     * could be 0, and you should handle that scenario accordingly.
     *
     * See comments regarding `_debtOutstanding` on `prepareReturn()`.
     */
    function adjustPosition(uint256 _debtOutstanding) internal virtual;

    /**
     * @notice
     * Perform any Strategy unwinding or other calls necessary to capture the
     * "free return" this Strategy has generated since the last time its core
     * position(s) were adjusted. Examples include unwrapping extra rewards.
     * @dev
     * This call is only used during "normal operation" of a Strategy, and
     * should be optimized to minimize losses as much as possible.
     *
     * This method returns any realized profits and/or realized losses
     * incurred, and should return the total amounts of profits/losses/debt
     * payments (in `want` tokens) for the Vault's accounting (e.g.
     * `want.balanceOf(this) >= _debtPayment + _profit - _loss`).
     *
     * `_debtOutstanding` will be 0 if the Strategy is not past the configured
     * debt limit, otherwise its value will be how far past the debt limit
     * the Strategy is. The Strategy's debt limit is configured in the Vault.
     *
     * NOTE: `_debtPayment` should be less than or equal to `_debtOutstanding`.
     *       It is okay for it to be less than `_debtOutstanding`, as that
     *       should only used as a guide for how much is left to pay back.
     *       Payments should be made to minimize loss from slippage, debt,
     *       withdrawal fees, etc.
     *
     * See `vault.debtOutstanding()`.
     */
    function prepareReturn(uint256 _debtOutstanding)
        internal
        virtual
        returns (
            uint256 _profit,
            uint256 _loss,
            uint256 _debtPayment
        );

}
