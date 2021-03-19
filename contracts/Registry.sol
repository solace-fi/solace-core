// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";


/**
 * @title Registry
 * @author solace.fi
 * @notice Tracks the contracts in the Solaverse.
 */
contract Registry {
    using EnumerableSet for EnumerableSet.AddressSet;
    
    /// @notice Governor.
    address public governance;
    /// @notice Solace Token.
    address public solace;
    /// @notice Master contract.
    address public master;
    /// @notice Vault contract.
    address public vault;
    /// @notice Treasury contract.
    address public treasury;
    /// @notice Product Factory contract.
    address public productFactory;
    /// @notice Locker contract.
    address public locker;
    // Set of strategies.
    EnumerableSet.AddressSet private strategies;
    // Set of products.
    EnumerableSet.AddressSet private products;
    // Set of policies.
    EnumerableSet.AddressSet private policies;

    /**
     * @notice Constructs the registry contract.
     */
    constructor() public {
        governance = msg.sender;
    }

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    /**
     * @notice Sets the solace token contract.
     * Can only be called by the current governor.
     * @param _solace The solace token address.
     */
    function setSolace(address _solace) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        solace = _solace;
    }

    /**
     * @notice Sets the master contract.
     * Can only be called by the current governor.
     * @param _master The master contract address.
     */
    function setMaster(address _master) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        master = _master;
    }

    /**
     * @notice Sets the vault contract.
     * Can only be called by the current governor.
     * @param _vault The vault contract address.
     */
    function setVault(address _vault) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        vault = _vault;
    }

    /**
     * @notice Sets the treasury contract.
     * Can only be called by the current governor.
     * @param _treasury The treasury contract address.
     */
    function setTreasury(address _treasury) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        treasury = _treasury;
    }

    /**
     * @notice Sets the product factory contract.
     * Can only be called by the current governor.
     * @param _productFactory The prodyct factory address.
     */
    function setProductFactory(address _productFactory) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        productFactory = _productFactory;
    }

    /**
     * @notice Sets the locker contract.
     * Can only be called by the current governor.
     * @param _locker The locker address.
     */
    function setLocker(address _locker) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        locker = _locker;
    }

    /**
     * @notice Adds a new strategy.
     * Can only be called by the current governor or the vault.
     * @param _strategy The strategy to add.
     */
    function addStrategy(address _strategy) external {
        // can only be called by governor or the vault
        require(msg.sender == governance || msg.sender == vault, "!manager");
        strategies.add(_strategy);
    }

    /**
     * @notice Removes a strategy.
     * Can only be called by the current governor or the vault.
     * @param _strategy The strategy to remove.
     */
    function removeStrategy(address _strategy) external {
        // can only be called by governor or the vault
        require(msg.sender == governance || msg.sender == vault, "!manager");
        strategies.remove(_strategy);
    }

    /**
     * @notice Adds a new product.
     * Can only be called by the current governor or the factory.
     * @param _product The product to add.
     */
    function addProduct(address _product) external {
        // can only be called by governor or the factory
        require(msg.sender == governance || msg.sender == productFactory, "!manager");
        products.add(_product);
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current governor or the factory.
     * @param _product The product to remove.
     */
    function removeProduct(address _product) external {
        // can only be called by governor or the factory
        require(msg.sender == governance || msg.sender == productFactory, "!manager");
        products.remove(_product);
    }

    /**
     * @notice Adds a new policy.
     * Can only be called by the current governor or a product.
     * @param _policy The policy to add.
     */
    function addPolicy(address _policy) external {
        // can only be called by governor or a product
        require(msg.sender == governance || products.contains(msg.sender), "!manager");
        policies.add(_policy);
    }

    /**
     * @notice Removes a policy.
     * Can only be called by the current governor or a product.
     * @param _policy The policy to remove.
     */
    function removePolicy(address _policy) external {
        // can only be called by governor or a product
        require(msg.sender == governance || products.contains(msg.sender), "!manager");
        policies.remove(_policy);
    }

    /**
     * @notice Returns the number of strategies.
     * @return The number of strategies.
     */
    function numStrategies() external view returns (uint256) {
        return strategies.length();
    }

    /**
     * @notice Returns the strategy at the given index.
     * @param _strategyNum The index to query.
     * @return The address of the strategy.
     */
    function getStrategy(uint256 _strategyNum) external view returns (address) {
        return strategies.at(_strategyNum);
    }

    /**
     * @notice Returns true if the given address is a strategy.
     * @param _strategy The address to query.
     * @return True if the address is a strategy.
     */
    function isStrategy(address _strategy) external view returns (bool) {
        return strategies.contains(_strategy);
    }

    /**
     * @notice Returns the number of products.
     * @return The number of products.
     */
    function numProducts() external view returns (uint256) {
        return products.length();
    }

    /**
     * @notice Returns the product at the given index.
     * @param _productNum The index to query.
     * @return The address of the product.
     */
    function getProduct(uint256 _productNum) external view returns (address) {
        return products.at(_productNum);
    }

    /**
     * @notice Returns true if the given address is a product.
     * @param _product The address to query.
     * @return True if the address is a product.
     */
    function isProduct(address _product) external view returns (bool) {
        return products.contains(_product);
    }

    /**
     * @notice Returns the number of policies.
     * @return The number of policies.
     */
    function numPolicies() external view returns (uint256) {
        return policies.length();
    }

    /**
     * @notice Returns the policy at the given index.
     * @param _policyNum The index to query.
     * @return The address of the policy.
     */
    function getPolicy(uint256 _policyNum) external view returns (address) {
        return policies.at(_policyNum);
    }

    /**
     * @notice Returns true if the given address is a policy.
     * @param _policy The address to query.
     * @return True if the address is a policy.
     */
    function isPolicy(address _policy) external view returns (bool) {
        return policies.contains(_policy);
    }
}
