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

    uint256 constant DEGREDATION_COEFFICIENT = 10 ** 18;
    uint256 constant MAX_BPS = 10000; // 10k basis points (100%)

    uint256 public activation;
    uint256 public debtRatio; // Debt ratio for the Vault across all strategies (in BPS, <= 10k)
    uint256 public totalDebt; // Amount of tokens that all strategies have borrowed
    uint256 public lastReport; // block.timestamp of last report
    uint256 public lockedProfit; // how much profit is locked and cant be withdrawn
    uint256 public performanceFee;
    uint256 public lockedProfitDegration; // rate per block of degration. DEGREDATION_COEFFICIENT is 100% per block

    // WETH
    IERC20 public token;

    // address with rights to call governance functions
    address public governance;
    
    // @notice Determines the order of strategies to pull funds from. Managed by governance
    address[] public withdrawalQueue;

    mapping (address => StrategyParams) public strategies;

    event StrategyAdded(
        address indexed strategy,
        uint256 debtRatio,
        uint256 minDebtPerHarvest,
        uint256 maxDebtPerHarvest,
        uint256 performanceFee
    );

    event DepositMade(address indexed depositor, uint256 indexed amount, uint256 indexed shares);
    event WithdrawalMade(address indexed withdrawer, uint256 indexed value);
    event InvestmentMade(address indexed strategy, uint256 indexed amount);
    event StrategyAddedToQueue(address indexed strategy);
    event StrategyRemovedFromQueue(address indexed strategy);
    event UpdateWithdrawalQueue(address[] indexed queue);

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
     * @notice Changes the locked profit degration. 
     * Can only be called by the current governor.
     * @param degration rate of degration in percent per second scaled to 1e18.
     */
    function setLockedProfitDegration(uint256 degration) external {
        require(msg.sender == governance, "!governance");
        lockedProfitDegration = degration;
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

        // uint256 credit = _creditAvailable(_strategy);

        // if (credit > 0) {
        strategies[_strategy].totalDebt += _amount;
        totalDebt += _amount;
        // }

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
        require(debtRatio + _debtRatio <= MAX_BPS, "debtRatio exceeds MAX BPS");
        require(_performanceFee <= MAX_BPS - performanceFee, "invalid performance fee");
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
        withdrawalQueue.push(_strategy);

        debtRatio += _debtRatio;

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
    function setWithdrawalQueue(address[] memory _queue) external {
        
        require(msg.sender == governance, "!governance");
        
        // check that each entry in input array is an active strategy
        for (uint256 i = 0; i < _queue.length; i++) {
            require(strategies[_queue[i]].activation > 0, "must be a current strategy");
        }

        // set input to be the new queue
        withdrawalQueue = _queue;

        emit UpdateWithdrawalQueue(_queue);
    }

    /**
     * @notice Amount of tokens in Vault a Strategy has access to as a credit line.
     * Check the Strategy's debt limit, as well as the tokens available in the Vault,
     * and determine the maximum amount of tokens (if any) the Strategy may draw on.
     * In the rare case the Vault is in emergency shutdown this will return 0.
     * @param strategy The Strategy to check. Defaults to caller.
     * @return The quantity of tokens available for the Strategy to draw on.
     */
    function creditAvailable(address strategy) external view returns (uint256) {
        return _creditAvailable(strategy);
    }

    function _creditAvailable(address _strategy) internal view returns (uint256) {
        uint256 vaultTotalAssets = _totalAssets();
        uint256 vaultDebtLimit = (debtRatio * vaultTotalAssets) / MAX_BPS;
        uint256 vaultTotalDebt = totalDebt;
        uint256 strategyDebtLimit = (strategies[_strategy].debtRatio * vaultTotalAssets) / MAX_BPS;
        uint256 strategyTotalDebt = strategies[_strategy].totalDebt;
        uint256 strategyMinDebtPerHarvest = strategies[_strategy].minDebtPerHarvest;
        uint256 strategyMaxDebtPerHarvest = strategies[_strategy].maxDebtPerHarvest;

        // no credit available if credit line has been exhasted
        if (vaultDebtLimit <= vaultTotalDebt || strategyDebtLimit <= strategyTotalDebt) return 0;

        uint256 available = strategyDebtLimit - strategyTotalDebt;

        // Adjust by the global debt limit left
        if (vaultDebtLimit - vaultTotalDebt < available) available = vaultDebtLimit - vaultTotalDebt;

        // Can only borrow up to what the contract has in reserve
        if (token.balanceOf(address(this)) < available) available = token.balanceOf(address(this));

        if (available < strategyMinDebtPerHarvest) return 0;

        if (strategyMaxDebtPerHarvest < available) return strategyMaxDebtPerHarvest;
    
        return available;

    }

    /**
     * @notice Remove `_strategy` from `withdrawalQueue`
     * Can only be called by the current governor.
     * Can only be called on an active strategy (added using addStrategy)
     * `_strategy` cannot already be in the queue
     * @param _strategy address of the strategy to remove
     */
    function addStrategyToQueue(address _strategy) external {
        
        require(msg.sender == governance, "!governance");
        require(strategies[_strategy].activation > 0, "must be a current strategy");
        
        // check that strategy is not already in the queue
        for (uint256 i = 0; i < withdrawalQueue.length; i++) {
            require(withdrawalQueue[i] != _strategy, "strategy already in queue");
        }

        withdrawalQueue.push(_strategy);

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

        address[] storage newQueue;
        
        for (uint256 i = 0; i < withdrawalQueue.length; i++) {
            if (withdrawalQueue[i] != _strategy) {
                newQueue.push(withdrawalQueue[i]);
            }
        }

        // we added all the elements back in the queue
        if (withdrawalQueue.length == newQueue.length) revert("strategy not in queue");

        // set withdrawalQueue to be the new one without the removed strategy
        withdrawalQueue = newQueue;
        emit StrategyRemovedFromQueue(_strategy);
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

        emit DepositMade(msg.sender, amount, shares);
    }

    /**
     * @notice Allows a user to redeem shares for ETH
     * Burns CP tokens and transfers ETH to the CP
     * @param shares amount of shares to redeem
     * @return value in ETH that the shares where redeemed for
     */
    function withdraw(uint256 shares, uint256 maxLoss) external returns (uint256) {

        require(shares <= balanceOf(msg.sender), "cannot redeem more shares than you own");
        
        uint256 value = _shareValue(shares);
        uint256 totalLoss;

        // If redeemable amount exceeds vaultBalance, withdraw funds from strategies in the withdrawal queue
        uint256 vaultBalance = token.balanceOf(address(this));
        
        if (value > vaultBalance) {

            for (uint256 i = 0; i < withdrawalQueue.length; i++) {

                // Break if we are done withdrawing from Strategies
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
                // This doesn't add to returns as it's not earned by "normal means"
                strategies[withdrawalQueue[i]].totalDebt -= withdrawn + loss;
                totalDebt -= withdrawn + loss;
            }
        }

        vaultBalance = token.balanceOf(address(this));

        if (vaultBalance < value) {
            value = vaultBalance;
            shares = _sharesForAmount(value + totalLoss);
        }

        // revert if losses from withdrawing are more than what is considered acceptable.
        assert(totalLoss <= maxLoss * (value + totalLoss) / MAX_BPS);

        // burn shares and transfer ETH to withdrawer
        _burn(msg.sender, shares);
        IWETH10(address(token)).withdraw(value);
        payable(msg.sender).transfer(value);

        emit WithdrawalMade(msg.sender, value);

        return value;
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
     * @notice Determines the current value of `shares`
     * @param shares amount of shares to calculate value for.
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