// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IRegistry
 * @author solace.fi
 * @notice Tracks the contracts of the Solaverse.
 *
 * [**Governance**](/docs/user-docs/Governance) can set the contract addresses and anyone can look them up.
 *
 * Note that `Registry` doesn't track all Solace contracts. Farms are tracked in [`Master`](../Master), Products are tracked in [`PolicyManager`](../PolicyManager), and the `Registry` is untracked.
 */
interface IRegistry {

    /***************************************
    EVENTS
    ***************************************/

    // Emitted when WETH is set.
    event WethSet(address weth);
    // Emitted when Vault is set.
    event VaultSet(address vault);
    // Emitted when ClaimsEscrow is set.
    event ClaimsEscrowSet(address claimsEscrow);
    // Emitted when Treasury is set.
    event TreasurySet(address treasury);
    // Emitted when PolicyManager is set.
    event PolicyManagerSet(address policyManager);
    // Emitted when RiskManager is set.
    event RiskManagerSet(address riskManager);
    // Emitted when Solace Token is set.
    event SolaceSet(address solace);
    // Emitted when Master is set.
    event MasterSet(address master);
    // Emitted when Locker is set.
    event LockerSet(address locker);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Gets the [**WETH**](../WETH9) contract.
     * @return weth_ The address of the [**WETH**](../WETH9) contract.
     */
    function weth() external view returns (address);

    /**
     * @notice Gets the [`Vault`](../Vault) contract.
     * @return vault_ The address of the [`Vault`](../Vault) contract.
     */
    function vault() external view returns (address);

    /**
     * @notice Gets the [`ClaimsEscrow`](../ClaimsEscrow) contract.
     * @return claimsEscrow_ The address of the [`ClaimsEscrow`](../ClaimsEscrow) contract.
     */
    function claimsEscrow() external view returns (address);

    /**
     * @notice Gets the [`Treasury`](../Treasury) contract.
     * @return treasury_ The address of the [`Treasury`](../Treasury) contract.
     */
    function treasury() external view returns (address);

    /**
     * @notice Gets the [`PolicyManager`](../PolicyManager) contract.
     * @return policyManager_ The address of the [`PolicyManager`](../PolicyManager) contract.
     */
    function policyManager() external view returns (address);

    /**
     * @notice Gets the [`RiskManager`](../RiskManager) contract.
     * @return riskManager_ The address of the [`RiskManager`](../RiskManager) contract.
     */
    function riskManager() external view returns (address);

    /**
     * @notice Gets the [**SOLACE**](../SOLACE) contract.
     * @return solace_ The address of the [**SOLACE**](../SOLACE) contract.
     */
    function solace() external view returns (address);

    /**
     * @notice Gets the [`Master`](../Master) contract.
     * @return master_ The address of the [`Master`](../Master) contract.
     */
    function master() external view returns (address);

    /**
     * @notice Gets the [`Locker`](../Locker) contract.
     * @return locker_ The address of the [`Locker`](../Locker) contract.
     */
    function locker() external view returns (address);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [**WETH**](../WETH9) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param weth_ The address of the [**WETH**](../WETH9) contract.
     */
    function setWeth(address weth_) external;

    /**
     * @notice Sets the [`Vault`](../Vault) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param vault_ The address of the [`Vault`](../Vault) contract.
     */
    function setVault(address vault_) external;

    /**
     * @notice Sets the [`Claims Escrow`](../ClaimsEscrow) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param claimsEscrow_ The address of the [`Claims Escrow`](../ClaimsEscrow) contract.
     */
    function setClaimsEscrow(address claimsEscrow_) external;

    /**
     * @notice Sets the [`Treasury`](../Treasury) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param treasury_ The address of the [`Treasury`](../Treasury) contract.
     */
    function setTreasury(address treasury_) external;

    /**
     * @notice Sets the [`Policy Manager`](../PolicyManager) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param policyManager_ The address of the [`Policy Manager`](../PolicyManager) contract.
     */
    function setPolicyManager(address policyManager_) external;

    /**
     * @notice Sets the [`Risk Manager`](../RiskManager) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param riskManager_ The address of the [`Risk Manager`](../RiskManager) contract.
     */
    function setRiskManager(address riskManager_) external;

    /**
     * @notice Sets the [**SOLACE**](../SOLACE) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param solace_ The address of the [**SOLACE**](../SOLACE) contract.
     */
    function setSolace(address solace_) external;

    /**
     * @notice Sets the [`Master`](../Master) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param master_ The address of the [`Master`](../Master) contract.
     */
    function setMaster(address master_) external;

    /**
     * @notice Sets the [`Locker`](../Locker) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param locker_ The address of the [`Locker`](../Locker) contract.
     */
    function setLocker(address locker_) external;
}
