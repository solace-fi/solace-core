// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./interface/IVault.sol";
import "./interface/IRegistry.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IRiskManager.sol";


/**
 * @title RiskManager
 * @author solace.fi
 * @notice Calculates the acceptable risk, sellable cover, and capital requirements of Solace products and capital pool.
 *
 * Governance can reallocate capital towards different products and change the partial reserves factor for leverage.
 */
contract RiskManager is IRiskManager, Governable {

    /// @notice Multiplier for minimum capital requirement in BPS.
    uint16 public override partialReservesFactor;

    uint32 public weightSum;
    address[] public products;
    mapping(address => uint32) public weights;

    /// @notice Registry
    IRegistry public registry;

    /**
     * @notice Constructs the risk manager contract.
     * @param governance_ The address of the [governor](/docs/user-docs/Governance).
     * @param registry_ Address of registry.
     */
    constructor(address governance_, address registry_) Governable(governance_) {
        registry = IRegistry(registry_);
        weightSum = type(uint32).max; // no div by zero
        partialReservesFactor = 10000;
    }

    /**
     * @notice Sets the products and their weights.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param products_ The products.
     * @param weights_ The product weights.
     */
    function setProductWeights(address[] calldata products_, uint32[] calldata weights_) external override onlyGovernance {
        // check recipient - weight map
        require(products_.length == weights_.length, "length mismatch");
        // delete old products
        while(products.length > 0) {
            address product = products[products.length-1];
            delete weights[product];
            products.pop();
        }
        // add new products
        uint32 sum = 0;
        uint256 length = products_.length;
        for(uint256 i = 0; i < length; i++) {
            require(weights[products_[i]] == 0, "duplicate product");
            weights[products_[i]] = weights_[i];
            sum += weights_[i];
        }
        require(sum > 0, "1/0");
        weightSum = sum;
        products = products_;
    }

    /**
     * @notice Sets the partial reserves factor.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param factor New partial reserves factor in BPS.
     */
    function setPartialReservesFactor(uint16 factor) external override onlyGovernance {
        partialReservesFactor = factor;
    }

    /**
     * @notice The maximum amount of cover that a product can sell.
     * @param product The product that wants to sell cover.
     * @return The max amount of cover in wei.
     */
    function maxCoverAmount(address product) external view override returns (uint256) {
        return IVault(registry.vault()).totalAssets() * weights[product] / weightSum;
    }

    /**
     * @notice The minimum amount of capital required to safely cover all policies.
     */
    function minCapitalRequirement() external view override returns (uint256) {
        return IPolicyManager(registry.policyManager()).activeCoverAmount() * partialReservesFactor / 10000;
    }
}
