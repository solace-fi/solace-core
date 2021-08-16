// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./interface/IVault.sol";
import "./interface/IRegistry.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IRiskManager.sol";


/**
 * @title Risk Manager
 * @author solace.fi
 * @notice
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
     * @param _governance Address of the governor.
     * @param _registry Address of registry.
     */
    constructor(address _governance, address _registry) Governable(_governance) {
        registry = IRegistry(_registry);
        weightSum = type(uint32).max; // no div by zero
        partialReservesFactor = 10000;
    }

    /**
     * @notice Sets the products and their weights.
     * Can only be called by the current governor.
     * @param _products The products.
     * @param _weights The product weights.
     */
    function setProductWeights(address[] calldata _products, uint32[] calldata _weights) external override onlyGovernance {
        // check recipient - weight map
        require(_products.length == _weights.length, "length mismatch");
        // delete old products
        while(products.length > 0) {
            address product = products[products.length-1];
            delete weights[product];
            products.pop();
        }
        // add new products
        uint32 sum = 0;
        uint256 length = _products.length;
        for(uint256 i = 0; i < length; i++) {
            require(weights[_products[i]] == 0, "duplicate product");
            weights[_products[i]] = _weights[i];
            sum += _weights[i];
        }
        require(sum > 0, "1/0");
        weightSum = sum;
        products = _products;
    }

    /**
     * @notice Sets the partial reserves factor.
     * Can only be called by the current governor.
     * @param _factor New partial reserves factor in BPS.
     */
    function setPartialReservesFactor(uint16 _factor) external override onlyGovernance {
        partialReservesFactor = _factor;
    }

    /**
     * @notice The maximum amount of cover that a product can sell.
     * @param _product The product that wants to sell cover.
     * @return The max amount of cover in wei.
     */
    function maxCoverAmount(address _product) external view override returns (uint256) {
        return IVault(registry.vault()).totalAssets() * weights[_product] / weightSum;
    }

    /**
     * @notice The minimum amount of capital required to safely cover all policies.
     */
    function minCapitalRequirement() external view override returns (uint256) {
        return IPolicyManager(registry.policyManager()).activeCoverAmount() * partialReservesFactor / 10000;
    }
}
