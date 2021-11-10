// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./RiskStrategy.sol";
import "./interface/IVault.sol";
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
        _weightSum = type(uint32).max; // no div by zero
        _partialReservesFactor = MAX_BPS;
    }

    /***************************************
    RISK STRATEGY FUNCTIONS
    ***************************************/
    /**
     * @notice Creates a new `Risk Strategy`.
     * @param products    The strategy products.
     * @param weights     The weights of the strategy products.
     * @param prices      The prices of the strategy products.
     * @param divisors    The divisors(max cover per policy divisor) of the strategy products. 
     * @return strategy   The address of newly created strategy.
    */
    function createRiskStrategy(
            address[] memory products,
            uint32[] memory weights,
            uint24[] memory prices,
            uint16[] memory divisors) external override returns (address strategy) {
        RiskStrategy riskStrategy = new RiskStrategy(
                this.governance(),
                address(this),
                msg.sender,
                products,
                weights,
                prices,
                divisors
        );
        _strategies[address(riskStrategy)] = Strategy({
            id: ++_strategyCount,
            strategy: address(riskStrategy),
            strategist: msg.sender,
            weight: 0,
            status: StrategyStatus.CREATED
        });
        _strategyToIndex[address(riskStrategy)] = _strategyCount;
        _indexToStrategy[_strategyCount] = address(riskStrategy);
        emit StrategyCreated(address(riskStrategy), msg.sender);
        return address(riskStrategy);
    }

    /***************************************
    MAX COVER VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Given a request for coverage, determines if that risk is acceptable and if so at what price.
     * @param strategy The risk strategy for the product.
     * @param prod The product that wants to sell coverage.
     * @param currentCover If updating an existing policy's cover amount, the current cover amount, otherwise 0.
     * @param newCover The cover amount requested.
     * @return acceptable True if risk of the new cover is acceptable, false otherwise.
     * @return price The price in wei per 1e12 wei of coverage per block.
     */
    function assessRisk(address strategy, address prod, uint256 currentCover, uint256 newCover) external view override returns (bool acceptable, uint24 price) {
        require(strategyIsActive(strategy), "inactive strategy!");
        return IRiskStrategy(strategy).assessRisk(prod, currentCover, newCover);
    }

    /**
     * @notice The maximum amount of cover that Solace as a whole can sell.
     * @return cover The max amount of cover in wei.
     */
    function maxCover() public view override returns (uint256 cover) {
        return IVault(payable(_registry.vault())).totalAssets() * MAX_BPS / _partialReservesFactor;
    }

    /**
     * @notice The maximum amount of cover that a product can sell in total.
     * @param strategy The risk strategy for the product.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in wei.
     */
    function maxCoverPerProduct(address strategy, address prod) public view override returns (uint256 cover) {
        require(strategyIsActive(strategy), "inactive strategy!");
        return IRiskStrategy(strategy).maxCoverPerProduct(prod);
    }

    /**
     * @notice The amount of cover that a product can still sell.
     * @param strategy The risk strategy for the product.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in wei.
     */
    function sellableCoverPerProduct(address strategy, address prod) external view override returns (uint256 cover) {
        require(strategyIsActive(strategy), "inactive strategy!");
        return IRiskStrategy(strategy).sellableCoverPerProduct(prod);
    }

    /**
     * @notice The maximum amount of cover that a product can sell in a single policy.
     * @param strategy The risk strategy for the product.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in wei.
     */
    function maxCoverPerPolicy(address strategy, address prod) external view override returns (uint256 cover) {
        require(strategyIsActive(strategy), "inactive strategy!");
        return IRiskStrategy(strategy).maxCoverPerPolicy(prod);
    }

    /**
     * @notice Checks is an address is an active product.
     * @param strategy The risk strategy for the product.
     * @param prod The product to check.
     * @return status Returns true if the product is active.
     */
    function productIsActive(address strategy, address prod) external view override returns (bool status) {
        require(strategyIsActive(strategy), "inactive strategy!");
        return IRiskStrategy(strategy).productIsActive(prod);
    }

    /**
     * @notice Checks if the given risk strategy is active.
     * @param strategy The risk strategy.
     * @return status True if the strategy is active.
     */
     function strategyIsActive(address strategy) public view override returns (bool status) {
         return _strategies[strategy].status == StrategyStatus.ENABLED;
     }

    /**
     * @notice Return the number of registered products for given risk strategy.
     * @param strategy The risk strategy.
     * @return count Number of products.
     */
    function numProducts(address strategy) external view override returns (uint256 count) {
        require(strategyIsActive(strategy), "inactive strategy!");
        return IRiskStrategy(strategy).numProducts();
    }

    /**
     * @notice Return the strategy at an index.
     * @dev Enumerable `[1, numStrategies]`.
     * @param index Index to query.
     * @return strategy The product address.
     */
    function strategyAt(uint256 index) external view override returns (address strategy) {
        return _indexToStrategy[index];
    }

    /**
     * @notice Returns a product's risk parameters.
     * The product must be active.
     * @param strategy The risk strategy.
     * @param prod The product to get parameters for.
     * @return weight The weighted allocation of this product vs other products.
     * @return price The price in wei per 1e12 wei of coverage per block.
     * @return divisor The max cover amount divisor for per policy. (maxCover / divisor = maxCoverPerPolicy).
     */
    function productRiskParams(address strategy, address prod) external view override returns (uint32 weight, uint24 price, uint16 divisor) {
        require(strategyIsActive(strategy), "inactive strategy!");
        return IRiskStrategy(strategy).productRiskParams(prod);
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
    function minCapitalRequirementPerStrategy(address strategy) external view override returns (uint256 smcr) {
        // TODO: Implement the logic per strategy
        return IPolicyManager(_registry.policyManager()).activeCoverAmount() * _partialReservesFactor / MAX_BPS;
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
}
