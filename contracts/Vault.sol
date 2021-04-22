// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IStrategy.sol";
import "./interface/IWETH10.sol";
import "./interface/IRegistry.sol";
import "./interface/IClaimsEscrow.sol";
import "./interface/IVault.sol";

/**
 * @title Vault
 * @author solace.fi
 * @notice Capital Providers can deposit ETH to mint shares of the Vault (CP tokens)
 */
contract Vault is ERC20Permit, IVault {
    using SafeERC20 for IERC20;
    using Address for address;
    /*
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
    */
    /*************
    GLOBAL CONSTANTS
    *************/

    uint256 constant DEGREDATION_COEFFICIENT = 10 ** 18;
    uint256 constant MAX_BPS = 10000; // 10k basis points (100%)
    uint256 constant SECS_PER_YEAR = 31556952; // 365.2425 days

    /*************
    GLOBAL VARIABLES
    *************/

    uint256 public activation;
    uint256 public delegatedAssets;
    uint256 public debtRatio; // Debt ratio for the Vault across all strategies (in BPS, <= 10k)
    uint256 public totalDebt; // Amount of tokens that all strategies have borrowed
    uint256 public lastReport; // block.timestamp of last report
    uint256 public lockedProfit; // how much profit is locked and cant be withdrawn
    uint256 public performanceFee;
    uint256 public lockedProfitDegration; // rate per block of degration. DEGREDATION_COEFFICIENT is 100% per block
    uint256 public minCapitalRequirement;

    uint256 public managementFee; // Governance Fee for management of Vault (given to `rewards`)

    bool public emergencyShutdown;

    /// WETH
    IERC20 public override token;

    /// address with rights to call governance functions
    address public governance;

    /// Rewards contract/wallet where Governance fees are sent to
    address public rewards;

    /// Registry of protocol contract addresses
    IRegistry public registry;

    /// @notice Determines the order of strategies to pull funds from. Managed by governance
    address[] public withdrawalQueue;

    /*************
    MAPPINGS
    *************/

    // TypeError: Overriding public state variable return types differ.
    //mapping (address => StrategyParams) public override strategies;
    mapping (address => StrategyParams) internal _strategies;
    function strategies(address _strategy) external view override returns (StrategyParams memory) {
        StrategyParams memory params = _strategies[_strategy];
        return params;
    }
    mapping (address => uint256) internal _strategyDelegatedAssets;

    /*************
    EVENTS
    *************/

    event StrategyAdded(
        address indexed strategy,
        uint256 debtRatio,
        uint256 minDebtPerHarvest,
        uint256 maxDebtPerHarvest,
        uint256 performanceFee
    );

    event StrategyReported(
        address indexed strategy,
        uint256 gain,
        uint256 loss,
        uint256 debtPaid,
        uint256 totalGain,
        uint256 totalLoss,
        uint256 totalDebt,
        uint256 debtAdded,
        uint256 debtRatio
    );

    event DepositMade(address indexed depositor, uint256 indexed amount, uint256 indexed shares);
    event WithdrawalMade(address indexed withdrawer, uint256 indexed value);
    event StrategyAddedToQueue(address indexed strategy);
    event StrategyRemovedFromQueue(address indexed strategy);
    event UpdateWithdrawalQueue(address[] indexed queue);
    event StrategyRevoked(address strategy);
    event EmergencyShutdown(bool active);
    event ClaimProcessed(address indexed claimant, uint256 indexed amount);
    event StrategyUpdateDebtRatio(address indexed strategy, uint256 indexed newDebtRatio);
    event StrategyUpdateMinDebtPerHarvest(address indexed strategy, uint256 indexed newMinDebtPerHarvest);
    event StrategyUpdateMaxDebtPerHarvest(address indexed strategy, uint256 indexed newMaxDebtPerHarvest);
    event StrategyUpdatePerformanceFee(address indexed strategy, uint256 indexed newPerformanceFee);

    constructor (address _registry, address _token) ERC20("Solace CP Token", "SCP") ERC20Permit("Solace CP Token") {
        governance = msg.sender;
        rewards = msg.sender; // set governance address as rewards destination for now

        registry = IRegistry(_registry);

        token = IERC20(_token);

        lastReport = block.timestamp;
        activation = block.timestamp;

        lockedProfitDegration = (DEGREDATION_COEFFICIENT * 46) / 10 ** 6; // 6 hours in blocks
    }

    /*************
    EXTERNAL FUNCTIONS
    *************/

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
     * @notice Changes the minimum capital requirement of the vault
     * Can only be called by the current governor.
     * During withdrawals, withdrawals are possible down to the Vault's MCR.
     * @param newMCR The new minimum capital requirement.
     */
    function setMinCapitalRequirement(uint256 newMCR) external {
        require(msg.sender == governance, "!governance");
        minCapitalRequirement = newMCR;
    }

    /**
     * @notice Changes the performanceFee of the Vault. 
     * Can only be called by the current governor.
     * @param fee New performanceFee to use
     */
    function setPerformanceFee(uint256 fee) external {
        require(msg.sender == governance, "!governance");
        require(fee <= MAX_BPS, "cannot exceed MAX_BPS");
        performanceFee = fee;
    }

    /**
     * @notice Activates or deactivates Vault mode where all Strategies go into full withdrawal.
     * Can only be called by the current governor.
     * During Emergency Shutdown:
     * 1. No Users may deposit into the Vault (but may withdraw as usual.)
     * 2. Governance may not add new Strategies.
     * 3. Each Strategy must pay back their debt as quickly as reasonable to minimally affect their position.
     * 4. Only Governance may undo Emergency Shutdown.
     * @param active If true, the Vault goes into Emergency Shutdown.
     * If false, the Vault goes back into Normal Operation.
    */
    function setEmergencyShutdown(bool active) external {
        require(msg.sender == governance, "!governance");
        emergencyShutdown = active;
        emit EmergencyShutdown(active);
    }

    /**
     * @notice Sets `withdrawalQueue` to be in the order specified by input array
     * @dev Specify addresses in the order in which funds should be withdrawn.
     * The ordering should be least impactful (the Strategy whose core positions will be least impacted by
     * having funds removed) first, with the next least impactful second, etc.
     * @param _queue array of addresses of strategy contracts
     */
    function setWithdrawalQueue(address[] memory _queue) external {
        require(msg.sender == governance, "!governance");
        // check that each entry in input array is an active strategy
        for (uint256 i = 0; i < _queue.length; i++) {
            require(_strategies[_queue[i]].activation > 0, "must be a current strategy");
        }
        // set input to be the new queue
        withdrawalQueue = _queue;

        emit UpdateWithdrawalQueue(_queue);
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
        require(!emergencyShutdown, "vault is in emergency shutdown");
        require(_strategy != address(0), "strategy cannot be set to zero address");
        require(debtRatio + _debtRatio <= MAX_BPS, "debtRatio exceeds MAX BPS");
        require(_performanceFee <= MAX_BPS - performanceFee, "invalid performance fee");
        require(_minDebtPerHarvest <= _maxDebtPerHarvest, "minDebtPerHarvest exceeds maxDebtPerHarvest");

        // Add strategy to approved strategies
        _strategies[_strategy] = StrategyParams({
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
     * @notice Adds `_strategy` to `withdrawalQueue`
     * Can only be called by the current governor.
     * @param _strategy address of the strategy to add
     */
    function addStrategyToQueue(address _strategy) external {

        require(msg.sender == governance, "!governance");
        require(_strategies[_strategy].activation > 0, "must be a current strategy");

        // check that strategy is not already in the queue
        for (uint256 i = 0; i < withdrawalQueue.length; i++) {
            require(withdrawalQueue[i] != _strategy, "strategy already in queue");
        }

        withdrawalQueue.push(_strategy);

        emit StrategyAddedToQueue(_strategy);
    }

    /**
     * @notice Remove `_strategy` from `withdrawalQueue`
     * Can only be called by the current governor.
     * Can only be called on an active strategy (added using addStrategy)
     * `_strategy` cannot already be in the queue
     * @param _strategy address of the strategy to remove
     */
    function removeStrategyFromQueue(address _strategy) external {

        require(msg.sender == governance, "!governance");
        require(_strategies[_strategy].activation > 0, "must be a current strategy");

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
     * @notice Revoke a Strategy, setting its debt limit to 0 and preventing any future deposits.
     * Should only be used in the scenario where the Strategy is being retired
     * but no migration of the positions are possible, or in the
     * extreme scenario that the Strategy needs to be put into "Emergency Exit"
     * mode in order for it to exit as quickly as possible. The latter scenario
     * could be for any reason that is considered "critical" that the Strategy
     * exits its position as fast as possible, such as a sudden change in market
     * conditions leading to losses, or an imminent failure in an external
     * dependency.
     * This may only be called by governance or the Strategy itself.
     * A Strategy will only revoke itself during emergency shutdown.
     * @param strategy The Strategy to revoke.
    */
    function revokeStrategy(address strategy) external override {
        require(msg.sender == governance ||
            _strategies[msg.sender].activation > 0, "must be called by governance or strategy to be revoked"
        );
        _revokeStrategy(strategy);
    }

    /**
     * @notice Allows the Claims Adjustor contract to process a claim
     * Only callable by the ClaimsAdjustor contract
     * Sends claimed `amount` to Escrow, where it is withdrawable by the claimant after a cooldown period
     * @param claimant Address of the claimant
     * @param amount Amount to pay out
     * Reverts if Vault is in Emergency Shutdown
     */
    function processClaim(address claimant, uint256 amount) external override {
        require(!emergencyShutdown, "cannot process claim when vault is in emergency shutdown");
        require(msg.sender == registry.claimsAdjustor(), "!claimsAdjustor");

        // unwrap some WETH to make ETH available for claims payout
        IWETH10(address(token)).withdraw(amount);

        IClaimsEscrow escrow = IClaimsEscrow(registry.claimsEscrow());
        escrow.receiveClaim{value: amount}(claimant);

        emit ClaimProcessed(claimant, amount);
    }

    /**
     * @notice Change the quantity of assets `strategy` may manage.
     * Can only be called by the current governor.
     * Can only be called on an active strategy (added using addStrategy)
     * @param _strategy address of the strategy to update
     * @param _debtRatio The new `debtRatio` of Strategy (quantity of assets it can manage)
     */
    function updateStrategyDebtRatio(address _strategy, uint256 _debtRatio) external {
        require(msg.sender == governance, "!governance");
        require(_strategies[_strategy].activation > 0, "must be a current strategy");

        debtRatio -= _strategies[_strategy].debtRatio;
        _strategies[_strategy].debtRatio = _debtRatio;
        debtRatio += _debtRatio;

        require(debtRatio <= MAX_BPS, "Vault debt ratio cannot exceed MAX_BPS");
        
        emit StrategyUpdateDebtRatio(_strategy, _debtRatio);
    }

    /**
     * @notice Change the quantity assets per block this Vault may deposit to or
     * withdraw from `strategy`.
     * Can only be called by the current governor.
     * Can only be called on an active strategy (added using addStrategy)
     * @param _strategy Address of the strategy to update
     * @param _minDebtPerHarvest New lower limit on the increase of debt since last harvest
     */
    function updateStrategyMinDebtPerHarvest(address _strategy, uint256 _minDebtPerHarvest) external {
        require(msg.sender == governance, "!governance");
        require(_strategies[_strategy].activation > 0, "must be a current strategy");
        require(_strategies[_strategy].maxDebtPerHarvest >= _minDebtPerHarvest, "cannot exceed Strategy maxDebtPerHarvest");

        _strategies[_strategy].minDebtPerHarvest = _minDebtPerHarvest;

        emit StrategyUpdateMinDebtPerHarvest(_strategy, _minDebtPerHarvest);
    }

    /**
     * @notice Change the quantity assets per block this Vault may deposit to or
     * withdraw from `strategy`.
     * Can only be called by the current governor.
     * Can only be called on an active strategy (added using addStrategy)
     * @param _strategy Address of the strategy to update
     * @param _maxDebtPerHarvest New upper limit on the increase of debt since last harvest
     */
    function updateStrategyMaxDebtPerHarvest(address _strategy, uint256 _maxDebtPerHarvest) external {
        require(msg.sender == governance, "!governance");
        require(_strategies[_strategy].activation > 0, "must be a current strategy");
        require(_strategies[_strategy].minDebtPerHarvest <= _maxDebtPerHarvest, "cannot be lower than Strategy maxDebtPerHarvest");

        _strategies[_strategy].maxDebtPerHarvest = _maxDebtPerHarvest;

        emit StrategyUpdateMaxDebtPerHarvest(_strategy, _maxDebtPerHarvest);
    }

    /**
     * @notice Change the fee the strategist will receive based on this Vault's performance
     * Can only be called by the current governor.
     * Can only be called on an active strategy (added using addStrategy)
     * @param _strategy Address of the strategy to update
     * @param _performanceFee The new fee the strategist will receive.
     */
    function updateStrategyPerformanceFee(address _strategy, uint256 _performanceFee) external {
        require(msg.sender == governance, "!governance");
        require(_strategies[_strategy].activation > 0, "must be a current strategy");
        require(_performanceFee <= MAX_BPS - performanceFee, "cannot exceed MAX_BPS after Vault performanceFee is deducted");

        _strategies[_strategy].performanceFee = _performanceFee;

        emit StrategyUpdatePerformanceFee(_strategy, _performanceFee);
    }

    /**
     * @notice Allows a user to deposit ETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minteed to caller
     * Called when Vault receives ETH
     * Deposits `_amount` `token`, issuing shares to `recipient`.
     * Reverts if Vault is in Emergency Shutdown
     */
    function deposit() public payable override {
        require(!emergencyShutdown, "cannot deposit when vault is in emergency shutdown");
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
    function withdraw(uint256 shares, uint256 maxLoss) external override returns (uint256) {

        require(shares <= balanceOf(msg.sender), "cannot redeem more shares than you own");

        uint256 value = _shareValue(shares);
        uint256 totalLoss;

        // Stop withdrawal if process brings the Vault's `totalAssets` value below minimum capital requirement
        require(_totalAssets() - value >= minCapitalRequirement, "withdrawal brings Vault assets below MCR");

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
                if (_strategies[withdrawalQueue[i]].totalDebt < amountNeeded) {
                    amountNeeded = _strategies[withdrawalQueue[i]].totalDebt;
                }

                // if there is nothing to withdraw from this Strategy, move on to the next one
                if (amountNeeded == 0) continue;

                uint256 loss = IStrategy(withdrawalQueue[i]).withdraw(amountNeeded);
                uint256 withdrawn = token.balanceOf(address(this)) - vaultBalance;

                // Withdrawer incurs any losses from liquidation
                if (loss > 0) {
                    value -= loss;
                    totalLoss += loss;
                    _strategies[withdrawalQueue[i]].totalLoss += loss;
                }

                // Reduce the Strategy's debt by the amount withdrawn ("realized returns")
                // This doesn't add to returns as it's not earned by "normal means"
                _strategies[withdrawalQueue[i]].totalDebt -= withdrawn + loss;
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
     * @notice Reports the amount of assets the calling Strategy has free (usually in terms of ROI).
     * The performance fee is determined here, off of the strategy's profits (if any), and sent to governance.
     * The strategist's fee is also determined here (off of profits), to be handled according
     * to the strategist on the next harvest.
     * This may only be called by a Strategy managed by this Vault.
     * @dev For approved strategies, this is the most efficient behavior.
     * The Strategy reports back what it has free, then Vault "decides"
     * whether to take some back or give it more. Note that the most it can
     * take is `gain + _debtPayment`, and the most it can give is all of the
     * remaining reserves. Anything outside of those bounds is abnormal behavior.
     * All approved strategies must have increased diligence around
     * calling this function, as abnormal behavior could become catastrophic.
     * @param gain Amount Strategy has realized as a gain on it's investment since its
     * last report, and is free to be given back to Vault as earnings
     * @param loss Amount Strategy has realized as a loss on it's investment since its
     * last report, and should be accounted for on the Vault's balance sheet
     * @param _debtPayment Amount Strategy has made available to cover outstanding debt
     * @return Amount of debt outstanding (if totalDebt > debtLimit or emergency shutdown).
    */
    function report(uint256 gain, uint256 loss, uint256 _debtPayment) external override returns (uint256) {
        require(_strategies[msg.sender].activation > 0, "must be called by an active strategy");
        require(token.balanceOf(msg.sender) >= gain + _debtPayment, "need to have available tokens to withdraw");

        // Report loss before rest of calculations if possible
        if (loss > 0) _reportLoss(msg.sender, loss);

        // Assess both management fee and performance fee, and issue both as shares of the vault
        _assessFees(msg.sender, gain);

        // Returns are always "realized gains"
        _strategies[msg.sender].totalGain += gain;

        // Outstanding debt the Strategy wants to take back from the Vault (if any)
        // NOTE: debtOutstanding <= StrategyParams.totalDebt
        uint256 debt = _debtOutstanding(msg.sender);
        uint256 debtPayment;
        if (debt < _debtPayment) {
            debtPayment = debt;
        } else {
            debtPayment = _debtPayment;
        }

        if (debtPayment > 0) {
            _strategies[msg.sender].totalDebt -= debtPayment;
            totalDebt -= debtPayment;
            debt -= debtPayment; // `debt` is being tracked for later
        }

        // Compute the line of credit the Vault is able to offer the Strategy (if any)
        uint256 credit = _creditAvailable(msg.sender);

        // Update the actual debt based on the full credit we are extending to the Strategy
        // or the returns if we are taking funds back
        // NOTE: credit + _strategies[msg.sender].totalDebt is always < debtLimit
        // NOTE: At least one of `credit` or `debt` is always 0 (both can be 0)
        if (credit > 0) {
            _strategies[msg.sender].totalDebt += credit;
            totalDebt += credit;
        }

        // Give/take balance to Strategy, based on the difference between the reported gains
        // (if any), the debt payment (if any), the credit increase we are offering (if any),
        // and the debt needed to be paid off (if any)
        // NOTE: This is just used to adjust the balance of tokens between the Strategy and
        // the Vault based on the Strategy's debt limit (as well as the Vault's).
        uint256 totalAvail = gain + debtPayment;
        if (totalAvail < credit){  // credit surplus, give to Strategy
            SafeERC20.safeTransfer(token, msg.sender, credit - totalAvail);
        } else if (totalAvail > credit) {  // credit deficit, take from Strategy
            SafeERC20.safeTransferFrom(token, msg.sender, address(this), totalAvail - credit);
        }
        // else, don't do anything because it is balanced

        // Update cached value of delegated assets (used to properly account for mgmt fee in `_assessFees`)
        delegatedAssets -= _strategyDelegatedAssets[msg.sender];

        // NOTE: Take the min of totalDebt and delegatedAssets) to guard against improper computation
        uint256 strategyDelegatedAssets;
        if (_strategies[msg.sender].totalDebt < IStrategy(msg.sender).delegatedAssets()) {
            strategyDelegatedAssets = _strategies[msg.sender].totalDebt;
        } else {
            strategyDelegatedAssets = IStrategy(msg.sender).delegatedAssets();
        }
        delegatedAssets += strategyDelegatedAssets;
        _strategyDelegatedAssets[msg.sender] = delegatedAssets;

        // Update reporting time
        _strategies[msg.sender].lastReport = block.timestamp;
        lastReport = block.timestamp;
        // profit is locked and gradually released per block
        lockedProfit = gain;

        emit StrategyReported(
            msg.sender,
            gain,
            loss,
            debtPayment,
            _strategies[msg.sender].totalGain,
            _strategies[msg.sender].totalLoss,
            _strategies[msg.sender].totalDebt,
            credit,
            _strategies[msg.sender].debtRatio
        );

        if (_strategies[msg.sender].debtRatio == 0 || emergencyShutdown) {
            // Take every last penny the Strategy has (Emergency Exit/revokeStrategy)
            // NOTE: This is different than `debt` in order to extract *all* of the returns
            return IStrategy(msg.sender).estimatedTotalAssets();
        } else {
            // Otherwise, just return what we have as debt outstanding
            return debt;
        }
    }

    /*************
    EXTERNAL VIEW FUNCTIONS
    *************/

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

    /**
    * @notice Provide an accurate expected value for the return this `strategy`
    * would provide to the Vault the next time `report()` is called
    * (since the last time it was called).
    * @param strategy The Strategy to determine the expected return for. Defaults to caller.
    * @return The anticipated amount `strategy` should make on its investment
    * since its last report.
    */
    function expectedReturn(address strategy) external view returns (uint256) {
        _expectedReturn(strategy);
    }

    /**
    * @notice Returns the maximum redeemable shares by the `user` such that Vault does not go under MCR
    * @param user Address of user to check
    * @return Max redeemable shares by the user
    */
    function maxRedeemableShares(address user) external view returns (uint256) {
        uint256 userBalance = balanceOf(user);
        uint256 vaultBalanceAfterWithdraw = _totalAssets() - _shareValue(userBalance);

        // if user's CP token balance takes Vault `totalAssets` below MCP,
        //... return the difference between totalAsset and MCP (in # shares)
        if (vaultBalanceAfterWithdraw < minCapitalRequirement) {
            uint256 diff = _totalAssets() - minCapitalRequirement;
            return _sharesForAmount(_shareValue(diff));
        } else {
            // else, user can withdraw up to their balance of CP tokens
            return userBalance;
        }
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
     * @notice Determines if `strategy` is past its debt limit and if any tokens
     * should be withdrawn to the Vault.
     * @param strategy The Strategy to check. Defaults to the caller.
     * @return The quantity of tokens to withdraw.
    */
    function debtOutstanding(address strategy) external view override returns (uint256) {
        return _debtOutstanding(strategy);
    }

    /*************
    INTERNAL FUNCTIONS
    *************/

    function _revokeStrategy(address strategy) internal {
        debtRatio -= _strategies[strategy].debtRatio;
        _strategies[strategy].debtRatio = 0;
        emit StrategyRevoked(strategy);
    }

    function _reportLoss(address strategy, uint256 loss) internal {
        uint256 strategyTotalDebt = _strategies[strategy].totalDebt;
        require(strategyTotalDebt >= loss, "loss can only be up the amount of debt issued to strategy");
        _strategies[strategy].totalLoss += loss;
        _strategies[strategy].totalDebt = strategyTotalDebt - loss;
        totalDebt -= loss;

        // Also, make sure we reduce our trust with the strategy by the same amount
        uint256 strategyDebtRatio = _strategies[strategy].debtRatio;

        uint256 ratioChange;

        if (loss * MAX_BPS / _totalAssets() < strategyDebtRatio) {
            ratioChange = loss * MAX_BPS / _totalAssets();
        } else {
            ratioChange = strategyDebtRatio;
        }
        _strategies[strategy].debtRatio -= ratioChange;
        debtRatio -= ratioChange;
    }

    /**
     * @notice Issue new shares to cover fees
     * In effect, this reduces overall share price by the combined fee
     * may throw if Vault.totalAssets() > 1e64, or not called for more than a year
     */
    function _assessFees(address strategy, uint256 gain) internal {
        uint256 governanceFee = (
            (
                (totalDebt - delegatedAssets)
                * (block.timestamp - lastReport)
                * managementFee
            )
            / MAX_BPS
            / SECS_PER_YEAR
        );

        // Strategist fee only applies in certain conditions
        uint256 strategistFee = 0;

        // NOTE: Applies if Strategy is not shutting down, or it is but all debt paid off
        // NOTE: No fee is taken when a Strategy is unwinding it's position, until all debt is paid
        if (gain > 0) {
            // NOTE: Unlikely to throw unless strategy reports >1e72 harvest profit
            strategistFee = (gain * _strategies[strategy].performanceFee) / MAX_BPS;
            governanceFee += gain * performanceFee / MAX_BPS;
        }

        // NOTE: This must be called prior to taking new collateral, or the calculation will be wrong!
        // NOTE: This must be done at the same time, to ensure the relative ratio of governance_fee : strategist_fee is kept intact
        uint256 totalFee = governanceFee + strategistFee;

        if (totalFee > 0) {
            // issue shares as reward
            uint256 reward;
            if (totalSupply() == 0) {
                reward = totalFee;
            } else {
                reward = (totalFee * totalSupply()) / _totalAssets();
            }

            // Issuance of shares needs to be done before taking the deposit
            _mint(address(this), reward);

            // Send the rewards out as new shares in this Vault
            if (strategistFee > 0) {
                // NOTE: Unlikely to throw unless sqrt(reward) >>> 1e39
                uint256 strategistReward = (strategistFee * reward) / totalFee;
                _transfer(address(this), strategy, strategistReward);
                // NOTE: Strategy distributes rewards at the end of harvest()
            }

            // Governance earns any dust leftovers from flooring math above
            if (balanceOf(address(this)) > 0) {
                _transfer(address(this), rewards, balanceOf(address(this)));
            }
        }
    }

    /*************
    INTERNAL VIEW FUNCTIONS
    *************/

    /**
     * @notice Quantity of all assets under control of this Vault, including those loaned out to Strategies
     */
    function _totalAssets() internal view returns (uint256) {
        return token.balanceOf(address(this)) + totalDebt;
    }

    function _creditAvailable(address _strategy) internal view returns (uint256) {
        if (emergencyShutdown) return 0;

        uint256 vaultTotalAssets = _totalAssets();
        uint256 vaultDebtLimit = (debtRatio * vaultTotalAssets) / MAX_BPS;
        uint256 strategyDebtLimit = (_strategies[_strategy].debtRatio * vaultTotalAssets) / MAX_BPS;

        // No credit available to issue if credit line has been exhasted
        if (vaultDebtLimit <= totalDebt || strategyDebtLimit <= _strategies[_strategy].totalDebt) return 0;

        uint256 available = strategyDebtLimit - _strategies[_strategy].totalDebt;

        // Adjust by the global debt limit left
        if (vaultDebtLimit - totalDebt < available) available = vaultDebtLimit - totalDebt;

        // Can only borrow up to what the contract has in reserve
        if (token.balanceOf(address(this)) < available) available = token.balanceOf(address(this));

        if (available < _strategies[_strategy].minDebtPerHarvest) return 0;

        if (_strategies[_strategy].maxDebtPerHarvest < available) return _strategies[_strategy].maxDebtPerHarvest;

        return available;
    }

    function _expectedReturn(address strategy) internal view returns (uint256) {
        uint256 strategyLastReport = _strategies[strategy].lastReport;
        uint256 timeSinceLastHarvest = block.timestamp - strategyLastReport;
        uint256 totalHarvestTime = strategyLastReport - _strategies[strategy].activation;

        // NOTE: If either `timeSinceLastHarvest` or `totalHarvestTime` is 0, we can short-circuit to `0`
        if (timeSinceLastHarvest > 0 && totalHarvestTime > 0 && IStrategy(strategy).isActive()) {
            // NOTE: Unlikely to throw unless strategy accumalates >1e68 returns
            // NOTE: Calculate average over period of time where harvests have occured in the past
            return (_strategies[strategy].totalGain * timeSinceLastHarvest) / totalHarvestTime;
        } else {
            // Covers the scenario when block.timestamp == activation
            return 0;
        }
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

    function _debtOutstanding(address strategy) internal view returns (uint256) {
        uint256 strategyDebtLimit = _strategies[strategy].debtRatio * _totalAssets() / MAX_BPS;
        uint256 strategyTotalDebt = _strategies[strategy].totalDebt;

        if (emergencyShutdown) {
            return strategyTotalDebt;
        } else if (strategyTotalDebt <= strategyDebtLimit) {
            return 0;
        } else {
            return strategyTotalDebt - strategyDebtLimit;
        }
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
