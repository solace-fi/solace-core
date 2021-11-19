// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title IRiskManager
 * @author solace.fi
 * @notice Calculates the acceptable risk, sellable cover, and capital requirements of Solace products and capital pool.
 *
 * The total amount of sellable coverage is proportional to the assets in the [**risk backing capital pool**](../Vault). The max cover is split amongst products in a weighting system. [**Governance**](/docs/protocol/governance). can change these weights and with it each product's sellable cover.
 *
 * The minimum capital requirement is proportional to the amount of cover sold to [active policies](../PolicyManager).
 *
 * Solace can use leverage to sell more cover than the available capital. The amount of leverage is stored as [`partialReservesFactor`](#partialreservesfactor) and is settable by [**governance**](/docs/protocol/governance).
 */
interface IRiskManager {

    /***************************************
    TYPE DEFINITIONS
    ***************************************/

    enum StrategyStatus {
        CREATED,
        VOTING,
        ACCEPTED,
        ENABLED,
        DISABLED
    }

    struct Strategy {
        uint256 id;
        address strategy;
        address strategist;
        uint32 weight;
        StrategyStatus status; 
    }

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when new strategy is created.
    event StrategyAdded(address strategy);

    /// @notice Emitted when strategy status is updated.
    event StrategyStatusUpdated(address strategy, uint8 status);

    /// @notice Emitted when strategy's allocation weight is increased.
    event RiskStrategyWeightAllocationIncreased(address strategy, uint32 weight);

    /// @notice Emitted when strategy's allocation weight is decreased.
    event RiskStrategyWeightAllocationDecreased(address strategy, uint32 weight);

    /// @notice Emitted when strategy's allocation weight is set.
    event RiskStrategyWeightAllocationSet(address strategy, uint32 weight);

    /// @notice Emitted when the partial reserves factor is set.
    event PartialReservesFactorSet(uint16 partialReservesFactor);

    /***************************************
    RISK STRATEGY FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a new `Risk Strategy` to the `Risk Manager`. The community votes the strategy for coverage weight allocation.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param strategy_ The address of the risk strategy.
     * @return index The index of the risk strategy.
    */
    function addRiskStrategy(address strategy_) external returns (uint256 index);

    /**
     * @notice Checks is an address is an active strategy.
     * @param strategy_ The risk strategy.
     * @return status True if the strategy is active.
    */
    function strategyIsActive(address strategy_) external view returns (bool status);

     /**
      * @notice Return the strategy at an index.
      * @dev Enumerable `[1, numStrategies]`.
      * @param index_ Index to query.
      * @return strategy The product address.
    */
    function strategyAt(uint256 index_) external view returns (address strategy);

    /**
     * @notice Sets the weight of the `Risk Strategy`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param strategy_ The address of the risk strategy.
     * @param weight_ The value to set.
    */
    function setWeightAllocation(address strategy_, uint32 weight_) external;

    /**
     * @notice Sets the status of the `Risk Strategy`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param strategy_ The address of the risk strategy.
     * @param status_ The status to set.
    */
    function setStrategyStatus(address strategy_, uint8 status_) external;

    /**
     * @notice Returns the number of registered strategies..
     * @return count The number of strategies.
    */
    function numStrategies() external view returns (uint256 count);

    /***************************************
    MAX COVER VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The maximum amount of cover that Solace as a whole can sell.
     * @return cover The max amount of cover in wei.
     */
    function maxCover() external view returns (uint256 cover);

    /**
     * @notice Returns the sum of allocation weights for all strategies.
     * @return sum WeightSum.
     */
    function weightSum() external view returns (uint32 sum);

    /***************************************
    MIN CAPITAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The minimum amount of capital required to safely cover all policies.
     * @return mcr The minimum capital requirement.
     */
    function minCapitalRequirement() external view returns (uint256 mcr);

    /**
     * @notice The minimum amount of capital required to safely cover all policies.
     * @param strategy_ The risk strategy.
     * @return mcr The minimum capital requirement.
     */
    function minCapitalRequirementPerStrategy(address strategy_) external view returns (uint256 mcr);

    /**
     * @notice Multiplier for minimum capital requirement.
     * @return factor Partial reserves factor in BPS.
     */
    function partialReservesFactor() external view returns (uint16 factor);

    /**
     * @notice Sets the partial reserves factor.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param partialReservesFactor_ New partial reserves factor in BPS.
     */
    function setPartialReservesFactor(uint16 partialReservesFactor_) external;
}
