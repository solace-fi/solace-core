// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./interface/IVault.sol";
import "./interface/IRegistry.sol";
import "./interface/IRiskManager.sol";


/**
 * @title Risk Manager
 * @author solace.fi
 * @notice
 */
contract RiskManager is IRiskManager {

    /// @notice Governor.
    address public override governance;

    /// @notice Governance to take over.
    address public override newGovernance;

    /// @notice Registry
    IRegistry public registry;

    address[] public products;
    mapping(address => uint32) public weights;
    uint32 public weightSum;

    /**
     * @notice Constructs the risk manager contract.
     * @param _governance Address of the governor.
     * @param _registry Address of registry.
     */
    constructor(address _governance, address _registry) public {
        governance = _governance;
        registry = IRegistry(_registry);
        weightSum = type(uint32).max; // no div by zero
    }

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external override {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Sets the products and their weights.
     * Can only be called by the current governor.
     * @param _products The products.
     * @param _weights The product weights.
     */
    function setProductWeights(address[] calldata _products, uint32[] calldata _weights) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
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
     * @notice The maximum amount of cover that a product can sell.
     * @param _product The product that wants to sell cover.
     * @return The max amount of cover in wei.
     */
    function maxCoverAmount(address _product) external view override returns (uint256) {
        return IVault(registry.vault()).totalAssets() * weights[_product] / weightSum;
    }

}
