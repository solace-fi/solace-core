// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./RiskStrategy.sol";
import "./interface/ICoverageDataProvider.sol";
import "./interface/IRegistry.sol";
import "./interface/IProduct.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IRiskManager.sol";

/**
 * @title RiskManager
 * @author solace.fi
 * @notice Calculates the acceptable risk, sellable cover, and capital requirements of Solace products and capital pool.
 *
 * The total amount of sellable coverage is proportional to the assets in the [**risk backing capital pool**](./Vault). The max cover is split amongst products in a weighting system. [**Governance**](/docs/protocol/governance) can change these weights and with it each product's sellable cover.
 *
 * The minimum capital requirement is proportional to the amount of cover sold to [active policies](./PolicyManager).
 *
 * Solace can use leverage to sell more cover than the available capital. The amount of leverage is stored as [`partialReservesFactor`](#partialreservesfactor) and is settable by [**governance**](/docs/protocol/governance).
 */
contract RiskManager is IRiskManager, Governable {

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    mapping(address => uint256) internal _strategyToIndex;
    mapping(uint256 => address) internal _indexToStrategy;
    mapping(address => Strategy) internal _strategies;
    uint256 internal _strategyCount;
    uint32 internal _weightSum;

    // Multiplier for minimum capital requirement in BPS.
    uint16 internal _partialReservesFactor;
    // 10k basis points (100%)
    uint16 internal constant MAX_BPS = 10000;

    // Registry
    IRegistry internal _registry;

    /**
     * @notice Constructs the RiskManager contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param registry_ Address of registry.
     */
    constructor(address governance_, address registry_) Governable(governance_) {
        require(registry_ != address(0x0), "zero address registry");
        _registry = IRegistry(registry_);
        _partialReservesFactor = MAX_BPS;
    }

    /***************************************
    RISK STRATEGY FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a new `Risk Strategy` to the `Risk Manager`. The community votes the strategy for coverage weight allocation.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param strategy_ The address of the risk strategy.
     * @return index The index of the risk strategy.
    */
    function addRiskStrategy(address strategy_) external override onlyGovernance returns (uint256 index) {
        require(strategy_ != address(0x0), "zero address strategy");
        require(_strategyToIndex[strategy_] == 0, "duplicate strategy");

        uint256 strategyCount = _strategyCount;
        _strategies[strategy_] = Strategy({
            id: ++strategyCount,
            strategy: strategy_,
            strategist: IRiskStrategy(strategy_).strategist(),
            weight: 0,
            status: StrategyStatus.INACTIVE,
            timestamp: block.timestamp
        });
        _strategyToIndex[strategy_] = strategyCount;
        _indexToStrategy[strategyCount] = strategy_;
        _strategyCount = strategyCount;
        emit StrategyAdded(strategy_);
        return strategyCount;
    }

    /**
     * @notice Sets the weight of the `Risk Strategy`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param strategy_ The address of the risk strategy.
     * @param weight_ The value to set.
    */
    function setWeightAllocation(address strategy_, uint32 weight_) external override onlyGovernance {
        require(weight_ > 0, "invalid weight!");
        require(strategyIsActive(strategy_), "inactive strategy");
        require(isValidWeightAllocation(strategy_, weight_), "invalid weight allocation");
        Strategy storage riskStrategy = _strategies[strategy_];
        _weightSum = (_weightSum + weight_) - riskStrategy.weight;
        riskStrategy.weight = weight_;
        IRiskStrategy(strategy_).setWeightAllocation(weight_);
        emit RiskStrategyWeightAllocationSet(strategy_, weight_);
    }

    /**
     * @notice Sets the status of the `Risk Strategy`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param strategy_ The address of the risk strategy.
     * @param status_ The status to set.
    */
    function setStrategyStatus(address strategy_, uint8 status_) public override onlyGovernance {
        require(strategy_ != address(0x0), "zero address strategy");
        require(_strategyToIndex[strategy_] > 0, "non-exist strategy");
        Strategy storage riskStrategy = _strategies[strategy_];
        riskStrategy.status = StrategyStatus(status_);
        bool status = riskStrategy.status == StrategyStatus.ACTIVE ? true : false;
        IRiskStrategy(strategy_).setStatus(status);
        emit StrategyStatusUpdated(strategy_, status_);
    }

    /**
     * @notice Checks if the given risk strategy is active.
     * @param strategy_ The risk strategy.
     * @return status True if the strategy is active.
     */
    function strategyIsActive(address strategy_) public view override returns (bool status) {
        return _strategies[strategy_].status == StrategyStatus.ACTIVE;
    }

    /**
    * @notice Return the strategy at an index.
    * @dev Enumerable `[1, numStrategies]`.
    * @param index_ Index to query.
    * @return strategy The product address.
    */
    function strategyAt(uint256 index_) external view override returns (address strategy) {
       return _indexToStrategy[index_];
    }

    /**
     * @notice Returns the number of registered strategies..
     * @return count The number of strategies.
    */
    function numStrategies() external view override returns (uint256 count) {
        return _strategyCount;
    }

    /**
     * @notice Returns the risk strategy information.
     * @param strategy_ The risk strategy.
     * @return id The id of the risk strategy.
     * @return strategyAddress The address of the risk strategy.
     * @return strategist The address of the creator of the risk strategy.
     * @return weight The risk strategy weight allocation.
     * @return status The status of risk strategy.
     * @return timestamp The added time of the risk strategy.
     *
    */
    function strategyInfo(address strategy_) external view override returns (uint256 id, address strategyAddress, address strategist, uint32 weight, StrategyStatus status, uint256 timestamp) {
        Strategy memory strategy = _strategies[strategy_];
        return (strategy.id, strategy.strategy, strategy.strategist, strategy.weight, strategy.status, strategy.timestamp);
    }

    /***************************************
    RISK MANAGER VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The maximum amount of cover that Solace as a whole can sell.
     * @return cover The max amount of cover in wei.
     */
    function maxCover() public view override returns (uint256 cover) {
        return ICoverageDataProvider(_registry.coverageDataProvider()).maxCover() * MAX_BPS / _partialReservesFactor;
    }

    /**
     * @notice Returns the sum of allocation weights for all strategies.
     * @return sum WeightSum.
     */
    function weightSum() external view override returns (uint32 sum) {
        return _weightSum;
    }

    /***************************************
    MIN CAPITAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The minimum amount of capital required to safely cover all policies.
     * @return mcr The minimum capital requirement.
     */
    function minCapitalRequirement() external view override returns (uint256 mcr) {
        return IPolicyManager(_registry.policyManager()).activeCoverAmount() * _partialReservesFactor / MAX_BPS;
    }

    /**
     * @notice The minimum amount of capital required to safely cover all policies.
     * @dev The strategy could have active policies when it is disabled. Because of that
     * we are not adding "strategyIsActive()" require statement.
     * @param strategy The risk strategy.
     * @return smcr The strategy minimum capital requirement.
     */
    function minCapitalRequirementPerStrategy(address strategy) public view override returns (uint256 smcr) {
        return IPolicyManager(_registry.policyManager()).activeCoverAmountPerStrategy(strategy) * _partialReservesFactor / MAX_BPS;
    }

    /**
     * @notice Multiplier for minimum capital requirement.
     * @return factor Partial reserves factor in BPS.
     */
    function partialReservesFactor() external view override returns (uint16 factor) {
        return _partialReservesFactor;
    }

    /**
     * @notice Sets the partial reserves factor.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param partialReservesFactor_ New partial reserves factor in BPS.
     */
    function setPartialReservesFactor(uint16 partialReservesFactor_) external override onlyGovernance {
        _partialReservesFactor = partialReservesFactor_;
        emit PartialReservesFactorSet(partialReservesFactor_);
    }

    /**
     * @notice The function checks if the new weight allocation is valid.
     * @param strategy_ The strategy address.
     * @param weight_ The weight allocation to set.
     * @return status True if the weight allocation is valid.
    */
    function isValidWeightAllocation(address strategy_, uint32 weight_) private view returns(bool status) {
        Strategy memory riskStrategy = _strategies[strategy_];
        uint32 weightsum = _weightSum;

        // check if new allocation is valid for the strategy
        uint256 smcr = minCapitalRequirementPerStrategy(strategy_);
        uint256 mc = maxCover();
        weightsum = weightsum + weight_ - riskStrategy.weight;
        uint256 newAllocationAmount = (mc * weight_) / weightsum;
        if (newAllocationAmount < smcr) return false;
        console.log("New allocation amount:", newAllocationAmount);
        console.log("SMCR:", smcr);
        // check other risk strategies
        uint256 strategyCount = _strategyCount;
        for (uint256 i = strategyCount; i > 0; i--) {
            address strategy = _indexToStrategy[i];
            riskStrategy = _strategies[strategy];
            if (strategy == strategy_ || riskStrategy.weight == 0) continue;

            smcr = minCapitalRequirementPerStrategy(strategy);
            newAllocationAmount = (mc * riskStrategy.weight) / weightsum;
            if (newAllocationAmount < smcr) return false;
        }
        return true;
    }
}
