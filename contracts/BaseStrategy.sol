// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/IVault.sol";

/**
 * @title BaseStrategy
 * @author solace.fi
 * @notice To be inherited by individual Strategy contracts to execute on for investing pooled CP funds.
 */
abstract contract BaseStrategy {
    using Address for address;
    using SafeERC20 for IERC20;

    address public governance;
    IVault public vault;
    IERC20 public want;

    constructor (address _vault) {
        governance = msg.sender;

        vault = IVault(_vault);

        // setting want per strategy as Vault wants ETH
        want = IERC20(vault.token());
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
     *  NOTE: The invariant `_liquidatedAmount + _loss <= _amountNeeded` should always be maintained
     */
    function liquidatePosition(uint256 _amountNeeded) internal virtual returns (uint256 _liquidatedAmount, uint256 _loss);

    /**
     * @notice
     *  Provide an accurate estimate for the total amount of assets
     *  (principle + return) that this Strategy is currently managing,
     *  denominated in terms of `want` tokens.
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
    function estimatedTotalAssets() public virtual view returns (uint256);

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance the new governor
     */
    function setGovernance(address _governance) public {
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    /**
     * @notice Allows governance to set address for a new Vault contract
     * Can only be called by the current governor.
     * @param _vault address of the Vault contract
     */
    function setVault(address _vault) public {
        require(msg.sender == governance, "!governance");
        vault = IVault(_vault);
    }

    /**
     * @notice Receives funds from the Vault to execute on investment Strategy
     * Can only be called by the vault contract.
     */
    function deposit() external {
        require(msg.sender == address(vault), "!vault");
    }

    /**
     * @notice Transfers an amount of ETH to the Vault
     * Can only be called by the vault contract.
     * @param _amountNeeded amount needed by Vault
     */
    function withdraw(uint256 _amountNeeded) external returns (uint256 _loss) {
        require(msg.sender == address(vault), "!vault");
        // Liquidate to `want`, up to `_amountNeeded`
        uint256 amountFreed;
        (amountFreed, _loss) = liquidatePosition(_amountNeeded);
        want.safeTransfer(msg.sender, amountFreed);
    }

}