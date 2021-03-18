// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IStrategy.sol";
import "./interface/IWETH10.sol";

/**
 * @title Vault
 * @author solace.fi
 * @notice Capital Providers can deposit ETH to mint shares of the Vault (CP tokens)
 */
contract Vault is ERC20 {
    using SafeERC20 for IERC20;
    using Address for address;

    struct StrategyParams {
        uint256 performanceFee; // Strategist's fee (basis points)
        uint256 activation; // Activation block.timestamp
        uint256 debtRatio; // Maximum borrow amount (in BPS of total assets)
        uint256 minDebtPerHarvest; // Lower limit on the increase of debt since last harvest
        uint256 maxDebtPerHarvest; // Upper limit on the increase of debt since last harvest
        uint256 lastReport; // block.timestamp of the last time a report occured
        uint256 totalDebt; // Total outstanding debt that Strategy has
        uint256 totalGain; // Total returns that Strategy has realized for Vault
        uint256 totalLoss; // Total losses that Strategy has realized for Vault
    }

    // WETH
    IERC20 public token;

    address public governance;
    address public strategy;

    mapping (address => StrategyParams) public strategies;

    event StrategyAdded(address indexed strategy, uint256 debtRatio, uint256 minDebtPerHarvest, uint256 maxDebtPerHarvest, uint256 performanceFee);

    constructor (address _token) ERC20("Solace CP Token", "SCP") {
        governance = msg.sender;
        token = IERC20(_token);
    }

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
     * @notice Allows governance to move ETH to Investment contract to execute a strategy
     * Can only be called by the current governor.
     * @param _strategy address of strategy contract
     * @param _amount of token to move to Investment contract
     */
    function invest(address _strategy, uint256 _amount) public {
        require(msg.sender == governance, "!governance");
        require(strategies[_strategy].activation > 0, "must be an approved strategy");
        // send ETH to Investment
        token.safeTransfer(_strategy, _amount);
        IStrategy(_strategy).deposit();
    }

    /**
     * @notice Allows governance to approve a new Strategy
     * Can only be called by the current governor.
     * @param _strategy The address of Strategy contract to add
     * @param _debtRatio The share of the total assets in the `vault that the `strategy` has access to.
     * @param _minDebtPerHarvest Lower limit on the increase of debt since last harvest
     * @param _maxDebtPerHarvest Upper limit on the increase of debt since last harvest
     * @param _performanceFee The fee the strategist will receive based on this Vault's performance.
     */
    function addStrategy(
        address _strategy,
        uint256 _debtRatio,
        uint256 _minDebtPerHarvest,
        uint256 _maxDebtPerHarvest,
        uint256 _performanceFee
    ) external {
        require(msg.sender == governance, "!governance");
        require(_strategy != address(0), "strategy cannot be set to zero address");
        require(_minDebtPerHarvest <= _maxDebtPerHarvest, "minDebtPerHarvest exceeds maxDebtPerHarvest");
        
        // Add strategy to approved strategies
        strategies[_strategy] = StrategyParams({
            performanceFee: _performanceFee,
            activation: block.timestamp,
            debtRatio: _debtRatio,
            minDebtPerHarvest: _minDebtPerHarvest,
            maxDebtPerHarvest: _maxDebtPerHarvest,
            lastReport: block.timestamp,
            totalDebt: 0,
            totalGain: 0,
            totalLoss: 0
        });

        // TEMP as we have one strategy for now. need to implement withdrawalQueue in order to use mapping for withdraw
        strategy = _strategy;

        emit StrategyAdded(_strategy, _debtRatio, _minDebtPerHarvest, _maxDebtPerHarvest, _performanceFee);
    }   

    /**
     * @notice Allows a user to deposit ETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minteed to caller
     */
    function deposit() public payable {
        uint256 amount = msg.value;
        uint256 beforeBalance = token.balanceOf(address(this));
        IWETH10(address(token)).deposit{value: amount}();
        uint256 afterBalance = token.balanceOf(address(this));
        amount = afterBalance - beforeBalance;
        uint256 shares;
        if (totalSupply() == 0) {
            shares = amount;
        } else {
            shares = (amount * totalSupply()) / beforeBalance;
        }
        _mint(msg.sender, shares);
    }

    /**
     * @notice Allows a user to redeem shares for ETH
     * Burns CP tokens and transfers ETH to the CP
     * @param _amount of shares to redeem
     */
    function withdraw(uint256 _amount) public {
        uint256 redeemableAmount = ((token.balanceOf(address(this)) + token.balanceOf(address(strategy))) * _amount) / totalSupply();
        _burn(msg.sender, _amount);

        // If redeemable amount exceeds vaultBalance, withdraw ETH from Investment contract
        uint256 vaultBalance = token.balanceOf(address(this));
        if (vaultBalance < redeemableAmount) {
            uint256 _withdrawAmount = redeemableAmount - vaultBalance;
            IStrategy(strategy).withdraw(_withdrawAmount);
            uint256 _diff = token.balanceOf(address(this)) - vaultBalance;
            if (_diff < _withdrawAmount) {
                redeemableAmount = vaultBalance + _diff;
            }
        }
        IWETH10(address(token)).withdraw(redeemableAmount);
        payable(msg.sender).transfer(redeemableAmount);
    }

    /**
     * @notice Fallback function to allow contract to receive ETH
     * Mints CP tokens to caller if caller is not Vault or WETH
     */
    receive() external payable {
        if (msg.sender != address(token)) {
            deposit();
        }
    }

}