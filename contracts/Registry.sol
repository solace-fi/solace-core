// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interface/IRegistry.sol";


/**
 * @title Registry
 * @author solace.fi
 * @notice Tracks the contracts in the Solaverse.
 */
contract Registry is IRegistry {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Governor.
    address public override governance;
    /// @notice Solace Token.
    address public override solace;
    /// @notice Master contract.
    address public override master;
    /// @notice Vault contract.
    address public override vault;
    /// @notice Treasury contract.
    address public override treasury;
    /// @notice Locker contract.
    address public override locker;
    /// @notice Claims Adjustor contract.
    address public override claimsAdjustor;
    /// @notice Claims Escrow contract.
    address public override claimsEscrow;
    // Set of products.
    EnumerableSet.AddressSet private products;

    // events
    // Emitted when Governance is set
    event GovernanceSet(address _governance);
    // Emitted when Solace Token is set
    event SolaceSet(address _solace);
    // Emitted when Master is set
    event MasterSet(address _master);
    // Emitted when Vault is set
    event VaultSet(address _vault);
    // Emitted when Treasury is set
    event TreasurySet(address _treasury);
    // Emitted when Locker is set
    event LockerSet(address _locker);
    // Emitted when ClaimsAdjustor is set
    event ClaimsAdjustorSet(address _claimsAdjustor);
    // Emitted when ClaimsEscrow is set
    event ClaimsEscrowSet(address _claimsEscrow);
    // Emitted when a Product is added
    event ProductAdded(address _product);
    // Emitted when a Product is removed
    event ProductRemoved(address _product);

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
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        governance = _governance;
        emit GovernanceSet(_governance);
    }

    /**
     * @notice Sets the solace token contract.
     * Can only be called by the current governor.
     * @param _solace The solace token address.
     */
    function setSolace(address _solace) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        solace = _solace;
        emit SolaceSet(_solace);
    }

    /**
     * @notice Sets the master contract.
     * Can only be called by the current governor.
     * @param _master The master contract address.
     */
    function setMaster(address _master) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        master = _master;
        emit MasterSet(_master);
    }

    /**
     * @notice Sets the Claims Adjustor contract.
     * Can only be called by the current governor.
     * @param _claimsAdjustor The Claims Adjustor address.
     */
    function setClaimsAdjustor(address _claimsAdjustor) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        claimsAdjustor = _claimsAdjustor;
        emit ClaimsAdjustorSet(_claimsAdjustor);
    }

    /**
     * @notice Sets the Claims Escrow contract.
     * Can only be called by the current governor.
     * @param _claimsEscrow The sClaims Escrow address.
     */
    function setClaimsEscrow(address _claimsEscrow) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        claimsEscrow = _claimsEscrow;
        emit ClaimsEscrowSet(_claimsEscrow);
    }

    /**
     * @notice Sets the vault contract.
     * Can only be called by the current governor.
     * @param _vault The vault contract address.
     */
    function setVault(address _vault) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        vault = _vault;
        emit VaultSet(_vault);
    }

    /**
     * @notice Sets the treasury contract.
     * Can only be called by the current governor.
     * @param _treasury The treasury contract address.
     */
    function setTreasury(address _treasury) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    /**
     * @notice Sets the locker contract.
     * Can only be called by the current governor.
     * @param _locker The locker address.
     */
    function setLocker(address _locker) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        locker = _locker;
        emit LockerSet(_locker);
    }

    /**
     * @notice Adds a new product.
     * Can only be called by the current governor.
     * @param _product The product to add.
     */
    function addProduct(address _product) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        products.add(_product);
        emit ProductAdded(_product);
    }

    /**
     * @notice Removes a product.
     * Can only be called by the current governor.
     * @param _product The product to remove.
     */
    function removeProduct(address _product) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        products.remove(_product);
        emit ProductRemoved(_product);
    }

    /**
     * @notice Returns the number of products.
     * @return The number of products.
     */
    function numProducts() external override view returns (uint256) {
        return products.length();
    }

    /**
     * @notice Returns the product at the given index.
     * @param _productNum The index to query.
     * @return The address of the product.
     */
    function getProduct(uint256 _productNum) external override view returns (address) {
        return products.at(_productNum);
    }

    /**
     * @notice Returns true if the given address is a product.
     * @param _product The address to query.
     * @return True if the address is a product.
     */
    function isProduct(address _product) external override view returns (bool) {
        return products.contains(_product);
    }
}
