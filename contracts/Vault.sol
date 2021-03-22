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

    uint256 constant MAXIMUM_STRATEGIES = 2;
    uint256 constant DEGREDATION_COEFFICIENT = 10 ** 18;
    uint256 constant MAX_BPS = 10000; // 10k basis points (100%)

    uint256 public activation;
    uint256 public debtRatio; // Debt ratio for the Vault across all strategies (in BPS, <= 10k)
    uint256 public totalDebt; // Amount of tokens that all strategies have borrowed
    uint256 public lastReport; // block.timestamp of last report
    uint256 public lockedProfit; // how much profit is locked and cant be withdrawn
    uint256 public lockedProfitDegration; // rate per block of degration. DEGREDATION_COEFFICIENT is 100% per block

    // WETH
    IERC20 public token;

    // address with rights to call governance functions
    address public governance;
    
    /// @notice Determines the order of strategies to pull funds from. Managed by governance
    address[MAXIMUM_STRATEGIES] public withdrawalQueue;

    mapping (address => StrategyParams) public strategies;

    event StrategyAdded(
        address indexed strategy,
        uint256 debtRatio,
        uint256 minDebtPerHarvest,
        uint256 maxDebtPerHarvest,
        uint256 performanceFee
    );

    event DepositMade(address indexed depositor, uint256 indexed amount);
    event WithdrawalMade(address indexed withdrawer, uint256 indexed value);
    event InvestmentMade(address indexed strategy, uint256 indexed amount);
    event StrategyAddedToQueue(address indexed strategy);
    event StrategyRemovedFromQueue(address indexed strategy);
    event UpdateWithdrawalQueue(address[MAXIMUM_STRATEGIES] indexed queue);

    constructor (address _token) ERC20("Solace CP Token", "SCP") {
        governance = msg.sender;
        token = IERC20(_token);

        lastReport = block.timestamp;
        activation = block.timestamp;
        
        lockedProfitDegration = (DEGREDATION_COEFFICIENT * 46) / 10 ** 6; // 6 hours in blocks
    }

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance the new governor
     */
    function setGovernance(address _governance) external {
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    /**
     * @notice Returns the total quantity of all assets under control of this
        Vault, including those loaned out to a Strategy as well as those currently
        held in the Vault.
     * @return The total assets under control of this vault.
    */
    function totalAssets() external view returns (uint256) {
        return _totalAssets();
    }

    /**
     * @notice Allows governance to move ETH to Investment contract to execute a strategy
     * Can only be called by the current governor.
     * @param _strategy address of strategy contract
     * @param _amount of token to move to Investment contract
     */
    function invest(address _strategy, uint256 _amount) external {
        require(msg.sender == governance, "!governance");
        require(strategies[_strategy].activation > 0, "must be a current strategy");
        // send ETH to Strategy contract to execute on investment strategy
        token.safeTransfer(_strategy, _amount);
        IStrategy(_strategy).deposit();

        emit InvestmentMade(_strategy, _amount);
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

        
        // Append strategy to withdrawal queue
        withdrawalQueue[MAXIMUM_STRATEGIES - 1] = _strategy;
        _organizeWithdrawalQueue();

        emit StrategyAdded(_strategy, _debtRatio, _minDebtPerHarvest, _maxDebtPerHarvest, _performanceFee);
    }

    /**
     * @notice Sets `withdrawalQueue` to be in the order specified by input array
     * Can only be called by the current governor.
     * @dev Specify addresses in the order in which funds should be withdrawn.
     * The ordering should be least impactful (the Strategy whose core positions will be least impacted by
     * having funds removed) first, with the next least impactful second, etc.
     * @param _queue array of addresses of strategy contracts
     */
    function setWithdrawalQueue(address[MAXIMUM_STRATEGIES] memory _queue) external {
        
        require(msg.sender == governance, "!governance");
        
        for (uint256 i = 0; i < MAXIMUM_STRATEGIES; i++) {
            if (_queue[i] == address(0) && withdrawalQueue[i] == address(0)) {
                break;
            }
            require(strategies[_queue[i]].activation > 0, "must be a current strategy");
            withdrawalQueue[i] = _queue[i];
        }
        emit UpdateWithdrawalQueue(_queue);
    }

    /**
     * @notice Remove `_strategy` from `withdrawalQueue`
     * Can only be called by the current governor.
     * @param _strategy address of the strategy to remove
     */
    function addStrategyToQueue(address _strategy) external {
        
        require(msg.sender == governance, "!governance");
        require(strategies[_strategy].activation > 0, "must be a current strategy");
        
        uint256 last_index;
        
        for (uint256 i = 0; i < MAXIMUM_STRATEGIES; i++) {
            
            if (withdrawalQueue[i] == address(0)) {
                break;
            }

            require(withdrawalQueue[i] != _strategy, "strategy already in queue");
            last_index = i;
        }
        
        require(last_index < MAXIMUM_STRATEGIES, "queue is full");

        withdrawalQueue[MAXIMUM_STRATEGIES - 1] = _strategy;

        _organizeWithdrawalQueue();
        emit StrategyAddedToQueue(_strategy);
    }

    /**
     * @notice Adds `_strategy` to `withdrawalQueue`
     * Can only be called by the current governor.
     * @param _strategy address of the strategy to add
     */
    function removeStrategyFromQueue(address _strategy) external {
        
        require(msg.sender == governance, "!governance");
        require(strategies[_strategy].activation > 0, "must be a current strategy");
        
        for (uint256 i = 0; i < MAXIMUM_STRATEGIES; i++) {
            if (withdrawalQueue[i] == _strategy) {
                withdrawalQueue[i] = address(0);
                _organizeWithdrawalQueue();
                emit StrategyRemovedFromQueue(_strategy);
                return;
            }
        }
        revert("strategy not in queue");
    }

    /**
     * @notice Allows a user to deposit ETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minteed to caller
     */
    function deposit() public payable {
        uint256 amount = msg.value;
        uint256 shares;
        if (totalSupply() == 0) {
            shares = amount;
        } else {
            shares = (amount * totalSupply()) / _totalAssets();
        }
        
        // Issuance of shares needs to be done before taking the deposit
        _mint(msg.sender, shares);

        // Wrap the depositor's ETH to add WETH to the vault
        IWETH10(address(token)).deposit{value: amount}();

        emit DepositMade(msg.sender, amount);
    }

    /**
     * @notice Allows a user to redeem shares for ETH
     * Burns CP tokens and transfers ETH to the CP
     * @param shares amount of shares to redeem
     * @return value in ETH that the shares where redeemed for
     */
    function withdraw(uint256 shares, uint256 maxLoss) external returns (uint256) {
        
        uint256 value = _shareValue(shares);
        uint256 totalLoss;

        // If redeemable amount exceeds vaultBalance, withdraw funds from strategies in the withdrawal queue
        uint256 vaultBalance = token.balanceOf(address(this));
        
        if (vaultBalance < value) {

            for (uint256 i = 0; i < withdrawalQueue.length; i++) {
                
                // Break if we have run out of strategies in the queue
                if (withdrawalQueue[i] == address(0)) {
                    break;
                }
                
                // Break if we are done withdrawing from strategies
                vaultBalance = token.balanceOf(address(this));
                if (value <= vaultBalance) {
                    break;
                }

                uint256 amountNeeded = value - vaultBalance;

                // Do not withdraw more than the Strategy's debt so that it can still work based on the profits it has
                if (strategies[withdrawalQueue[i]].totalDebt < amountNeeded) {
                    amountNeeded = strategies[withdrawalQueue[i]].totalDebt;
                }

                // if there is nothing to withdraw from this Strategy, move on to the next one
                if (amountNeeded == 0) continue;

                uint256 loss = IStrategy(withdrawalQueue[i]).withdraw(amountNeeded);
                uint256 withdrawn = token.balanceOf(address(this)) - vaultBalance;

                // Withdrawer incurs any losses from liquidation
                if (loss > 0) {
                    value -= loss;
                    totalLoss += loss;
                    strategies[withdrawalQueue[i]].totalLoss += loss;
                }

                // Reduce the Strategy's debt by the amount withdrawn ("realized returns")
                // NOTE: This doesn't add to returns as it's not earned by "normal means"
                strategies[withdrawalQueue[i]].totalDebt -= withdrawn + loss;
                totalDebt -= withdrawn + loss;
            }
        }

        vaultBalance = token.balanceOf(address(this));
        if (vaultBalance < value) {
            value = vaultBalance;
            shares = _sharesForAmount(value + totalLoss);
        }
        assert(totalLoss <= maxLoss * (value + totalLoss) / MAX_BPS);

        // burn shares and transfer ETH to withdrawer
        _burn(msg.sender, shares);
        IWETH10(address(token)).withdraw(value);
        payable(msg.sender).transfer(value);

        return value;
    }

    /**
     * @notice Reorganize `withdrawalQueue` based on premise that if there is an
     * empty value between two actual values, then the empty value should be
     * replaced by the later value. Relative ordering of non-zero values is maintained.
     */
    function _organizeWithdrawalQueue() internal {
        uint256 offset;
        for (uint256 i = 0; i < MAXIMUM_STRATEGIES; i++) {
            address strategy = withdrawalQueue[i];
            if (strategy == address(0)) {
                offset += 1;
            } else if (offset > 0) {
                withdrawalQueue[i - offset] = strategy;
                withdrawalQueue[i] = address(0);
            }
        }
    }

    /**
     * @notice Determines the current value of `shares`
     * replaced by the later value. Relative ordering of non-zero values is maintained.
     */
    function _shareValue(uint256 shares) internal view returns (uint256) {

        // If sqrt(Vault.totalAssets()) >>> 1e39, this could potentially revert
        uint256 lockedFundsRatio = (block.timestamp - lastReport) * lockedProfitDegration;
        uint256 freeFunds = _totalAssets();

        if (lockedFundsRatio < DEGREDATION_COEFFICIENT) {
            freeFunds -= (lockedProfit - (lockedFundsRatio * lockedProfit / DEGREDATION_COEFFICIENT));
        }

        // using 1e3 for extra precision here when decimals is low
        return ((10 ** 3 * (shares * freeFunds)) / totalSupply()) / 10 ** 3;
        
    }

    /**
     * @notice Determines how many shares `amount` of token would receive.
     * @param amount of tokens to calculate number of shares for
     */
    function _sharesForAmount(uint256 amount) internal view returns (uint256) {
        if (_totalAssets() > 0) {
            // NOTE: if sqrt(token.totalSupply()) > 1e37, this could potentially revert
            return ((10 ** 3 * (amount * totalSupply())) / _totalAssets()) / 10 ** 3;
        } else {
            return 0;
        }
    }

    /**
     * @notice Quantity of all assets under control of this Vault, including those loaned out to Strategies
     */
    function _totalAssets() internal view returns (uint256) {
        return token.balanceOf(address(this)) + totalDebt;
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