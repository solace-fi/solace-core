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
    EVENTS
    ***************************************/

    /// @notice Emitted when a product's weight is modified.
    /// Includes adding and removing products.
    event ProductWeightSet(address product, uint32 weight);

    /***************************************
    MAX COVER VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The maximum amount of cover that Solace as a whole can sell.
     * @return cover The max amount of cover in wei.
     */
    function maxCover() external view returns (uint256 cover);

    /**
     * @notice The maximum amount of cover that a product can sell.
     * @param prod The product that wants to sell cover.
     * @return cover The max amount of cover in wei.
     */
    function maxCoverAmount(address prod) external view returns (uint256 cover);

    /**
     * @notice Return the number of registered products.
     * @return count Number of products.
     */
    function numProducts() external view returns (uint256 count);

    /**
     * @notice Return the product at an index.
     * @dev Enumerable `[1, numProducts]`.
     * @param index Index to query.
     * @return prod The product address.
     */
    function product(uint256 index) external view returns (address prod);

    /**
     * @notice Returns the weight of a product.
     * @param prod Product to query.
     * @return mass The product's weight.
     */
    function weight(address prod) external view returns (uint32 mass);

    /**
     * @notice Returns the sum of weights.
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
     * @notice Multiplier for minimum capital requirement.
     * @return factor Partial reserves factor in BPS.
     */
    function partialReservesFactor() external view returns (uint16 factor);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a new product and sets its weight.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param product_ Address of new product.
     * @param weight_ The products weight.
     */
    function addProduct(address product_, uint32 weight_) external;

    /**
     * @notice Removes a product.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param product_ Address of the product to remove.
     */
    function removeProduct(address product_) external;

    /**
     * @notice Sets the products and their weights.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param products_ The products.
     * @param weights_ The product weights.
     */
    function setProductWeights(address[] calldata products_, uint32[] calldata weights_) external;

    /**
     * @notice Sets the partial reserves factor.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param partialReservesFactor_ New partial reserves factor in BPS.
     */
    function setPartialReservesFactor(uint16 partialReservesFactor_) external;
}
