// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title IRiskManager
 * @author solace.fi
 * @notice
 */
interface IRiskManager {

    /**
     * @notice Sets the products and their weights.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param products_ The products.
     * @param weights_ The product weights.
     */
    function setProductWeights(address[] calldata products_, uint32[] calldata weights_) external;

    /**
     * @notice Sets the partial reserves factor.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param factor New partial reserves factor in BPS.
     */
    function setPartialReservesFactor(uint16 factor) external;

    /**
     * @notice The maximum amount of cover that a product can sell.
     * @param product The product that wants to sell cover.
     * @return The max amount of cover in wei.
     */
    function maxCoverAmount(address product) external view returns (uint256);

    /**
     * @notice The minimum amount of capital required to safely cover all policies.
     */
    function minCapitalRequirement() external view returns (uint256);

    /// @notice Multiplier for minimum capital requirement in BPS.
    function partialReservesFactor() external view returns (uint16);
}
