// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;


/**
 * @title IRegistry
 * @author solace.fi
 * @notice Tracks the contracts in the Solaverse.
 */
interface IRegistry {

    /// @notice Governance.
    function governance() external view returns (address);

    /// @notice Governance to take over.
    function newGovernance() external view returns (address);

    /// Protocol contract address getters
    function master() external returns (address);
    function vault() external returns (address);
    function treasury() external returns (address);
    function solace() external returns (address);
    function locker() external returns (address);
    function claimsAdjustor() external returns (address);
    function claimsEscrow() external returns (address);

    // events
    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);
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
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external;

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external;

    /**
     * @notice Sets the solace token contract.
     * Can only be called by the current governor.
     * @param _solace The solace token address.
     */
    function setSolace(address _solace) external;

    /**
     * @notice Sets the master contract.
     * Can only be called by the current governor.
     * @param _master The master contract address.
     */
    function setMaster(address _master) external;

    /**
     * @notice Sets the vault contract.
     * Can only be called by the current governor.
     * @param _vault The vault contract address.
     */
    function setVault(address _vault) external;

    /**
     * @notice Sets the treasury contract.
     * Can only be called by the current governor.
     * @param _treasury The treasury contract address.
     */
    function setTreasury(address _treasury) external;

    /**
     * @notice Sets the locker contract.
     * Can only be called by the current governor.
     * @param _locker The locker address.
     */
    function setLocker(address _locker) external;

        /**
     * @notice Sets the Claims Adjustor contract.
     * Can only be called by the current governor.
     * @param _claimsAdjustor The Claims Adjustor address.
     */
    function setClaimsAdjustor(address _claimsAdjustor) external;

    /**
     * @notice Sets the Claims Escrow contract.
     * Can only be called by the current governor.
     * @param _claimsEscrow The sClaims Escrow address.
     */
    function setClaimsEscrow(address _claimsEscrow) external;

    /**
     * @notice Adds a new product.
     * Can only be called by the current governor.
     * @param _product The product to add.
     */
    function addProduct(address _product) external;

    /**
     * @notice Removes a product.
     * Can only be called by the current governor.
     * @param _product The product to remove.
     */
    function removeProduct(address _product) external;

    /**
     * @notice Returns the number of products.
     * @return The number of products.
     */
    function numProducts() external view returns (uint256);

    /**
     * @notice Returns the product at the given index.
     * @param _productNum The index to query.
     * @return The address of the product.
     */
    function getProduct(uint256 _productNum) external view returns (address);

    /**
     * @notice Returns true if the given address is a product.
     * @param _product The address to query.
     * @return True if the address is a product.
     */
    function isProduct(address _product) external view returns (bool);
}
