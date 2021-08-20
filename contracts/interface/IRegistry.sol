// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IRegistry
 * @author solace.fi
 * @notice Tracks the contracts in the Solaverse.
 */
interface IRegistry {

    /// Protocol contract address getters
    function master() external view returns (address);
    function vault() external view returns (address);
    function treasury() external view returns (address);
    function solace() external view returns (address);
    function locker() external view returns (address);
    function claimsEscrow() external view returns (address);
    function policyManager() external view returns (address);
    function riskManager() external view returns (address);

    // events
    // Emitted when Solace Token is set
    event SolaceSet(address solace);
    // Emitted when Master is set
    event MasterSet(address master);
    // Emitted when Vault is set
    event VaultSet(address vault);
    // Emitted when Treasury is set
    event TreasurySet(address treasury);
    // Emitted when Locker is set
    event LockerSet(address locker);
    // Emitted when ClaimsEscrow is set
    event ClaimsEscrowSet(address claimsEscrow);
    // Emitted when PolicyManager is set
    event PolicyManagerSet(address policyManager);
    // Emitted when RiskManager is set
    event RiskManagerSet(address riskManager);

    /**
     * @notice Sets the solace token contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param solace_ The solace token address.
     */
    function setSolace(address solace_) external;

    /**
     * @notice Sets the master contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param master_ The master contract address.
     */
    function setMaster(address master_) external;

    /**
     * @notice Sets the vault contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param vault_ The vault contract address.
     */
    function setVault(address vault_) external;

    /**
     * @notice Sets the treasury contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param treasury_ The treasury contract address.
     */
    function setTreasury(address treasury_) external;

    /**
     * @notice Sets the locker contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param locker_ The locker address.
     */
    function setLocker(address locker_) external;

    /**
     * @notice Sets the Claims Escrow contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param claimsEscrow_ The Claims Escrow address.
     */
    function setClaimsEscrow(address claimsEscrow_) external;

    /**
     * @notice Sets the PolicyManager contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param policyManager_ The PolicyManager address.
     */
    function setPolicyManager(address policyManager_) external;

    /**
     * @notice Sets the RiskManager contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param riskManager_ The RiskManager address.
     */
    function setRiskManager(address riskManager_) external;
}
