// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./interface/IRegistry.sol";

/**
 * @title Registry
 * @author solace.fi
 * @notice Tracks the contracts of the Solaverse.
 *
 * [**Governance**](/docs/user-docs/Governance) can set the contract addresses and anyone can look them up.
 *
 * Note that `Registry` doesn't track all Solace contracts. Farms are tracked in [`Master`](../Master), Products are tracked in [`PolicyManager`](../PolicyManager), and the `Registry` is untracked.
 */
contract Registry is IRegistry, Governable {

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    // WETH contract.
    address internal _weth;
    // Vault contract.
    address internal _vault;
    // Claims Escrow contract.
    address internal _claimsEscrow;
    // Treasury contract.
    address internal _treasury;
    // Policy Manager contract.
    address internal _policyManager;
    // Risk Manager contract.
    address internal _riskManager;
    // SOLACE contract.
    address internal _solace;
    // Master contract.
    address internal _master;
    // Locker contract.
    address internal _locker;

    /**
     * @notice Constructs the registry contract.
     * @param governance_ The address of the [governor](/docs/user-docs/Governance).
     */
    constructor(address governance_) Governable(governance_) { }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Gets the [**WETH**](./WETH9) contract.
     * @return weth_ The address of the [**WETH**](./WETH9) contract.
     */
    function weth() external view override returns (address weth_) { return _weth; }

    /**
     * @notice Gets the [`Vault`](./Vault) contract.
     * @return vault_ The address of the [`Vault`](./Vault) contract.
     */
    function vault() external view override returns (address) { return _vault; }

    /**
     * @notice Gets the [`ClaimsEscrow`](./ClaimsEscrow) contract.
     * @return claimsEscrow_ The address of the [`ClaimsEscrow`](./ClaimsEscrow) contract.
     */
    function claimsEscrow() external view override returns (address) { return _claimsEscrow; }

    /**
     * @notice Gets the [`Treasury`](./Treasury) contract.
     * @return treasury_ The address of the [`Treasury`](./Treasury) contract.
     */
    function treasury() external view override returns (address) { return _treasury; }

    /**
     * @notice Gets the [`PolicyManager`](./PolicyManager) contract.
     * @return policyManager_ The address of the [`PolicyManager`](./PolicyManager) contract.
     */
    function policyManager() external view override returns (address) { return _policyManager; }

    /**
     * @notice Gets the [`RiskManager`](./RiskManager) contract.
     * @return riskManager_ The address of the [`RiskManager`](./RiskManager) contract.
     */
    function riskManager() external view override returns (address) { return _riskManager; }

    /**
     * @notice Gets the [**SOLACE**](./SOLACE) contract.
     * @return solace_ The address of the [**SOLACE**](./SOLACE) contract.
     */
    function solace() external view override returns (address) { return _solace; }

    /**
     * @notice Gets the [`Master`](./Master) contract.
     * @return master_ The address of the [`Master`](./Master) contract.
     */
    function master() external view override returns (address) { return _master; }

    /**
     * @notice Gets the [`Locker`](./Locker) contract.
     * @return locker_ The address of the [`Locker`](./Locker) contract.
     */
    function locker() external view override returns (address) { return _locker; }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [**WETH**](./WETH9) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param weth_ The address of the [**WETH**](./WETH9) contract.
     */
    function setWeth(address weth_) external override onlyGovernance {
      _weth = weth_;
      emit WethSet(weth_);
    }

    /**
     * @notice Sets the [`Vault`](./Vault) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param vault_ The address of the [`Vault`](./Vault) contract.
     */
    function setVault(address vault_) external override onlyGovernance {
        _vault = vault_;
        emit VaultSet(vault_);
    }

    /**
     * @notice Sets the [`Claims Escrow`](./ClaimsEscrow) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param claimsEscrow_ The address of the [`Claims Escrow`](./ClaimsEscrow) contract.
     */
    function setClaimsEscrow(address claimsEscrow_) external override onlyGovernance {
        _claimsEscrow = claimsEscrow_;
        emit ClaimsEscrowSet(claimsEscrow_);
    }

    /**
     * @notice Sets the [`Treasury`](./Treasury) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param treasury_ The address of the [`Treasury`](./Treasury) contract.
     */
    function setTreasury(address treasury_) external override onlyGovernance {
        _treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    /**
     * @notice Sets the [`Policy Manager`](./PolicyManager) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param policyManager_ The address of the [`Policy Manager`](./PolicyManager) contract.
     */
    function setPolicyManager(address policyManager_) external override onlyGovernance {
        _policyManager = policyManager_;
        emit PolicyManagerSet(policyManager_);
    }

    /**
     * @notice Sets the [`Risk Manager`](./RiskManager) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param riskManager_ The address of the [`Risk Manager`](./RiskManager) contract.
     */
    function setRiskManager(address riskManager_) external override onlyGovernance {
        _riskManager = riskManager_;
        emit RiskManagerSet(riskManager_);
    }

    /**
     * @notice Sets the [**SOLACE**](./SOLACE) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param solace_ The address of the [**SOLACE**](./SOLACE) contract.
     */
    function setSolace(address solace_) external override onlyGovernance {
        _solace = solace_;
        emit SolaceSet(solace_);
    }

    /**
     * @notice Sets the [`Master`](./Master) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param master_ The address of the [`Master`](./Master) contract.
     */
    function setMaster(address master_) external override onlyGovernance {
        _master = master_;
        emit MasterSet(master_);
    }

    /**
     * @notice Sets the [`Locker`](./Locker) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param locker_ The address of the [`Locker`](./Locker) contract.
     */
    function setLocker(address locker_) external override onlyGovernance {
        _locker = locker_;
        emit LockerSet(locker_);
    }
}
