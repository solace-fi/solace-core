// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./interface/IRegistry.sol";

/**
 * @title Registry
 * @author solace.fi
 * @notice The `Registry` tracks the contracts in the Solaverse.
 */
contract Registry is IRegistry, Governable {

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
    /// @notice Claims Escrow contract.
    address public override claimsEscrow;
    /// @notice Policy Manager contract.
    address public override policyManager;
    /// @notice Risk Manager contract.
    address public override riskManager;

    /**
     * @notice Constructs the registry contract.
     * @param governance_ The address of the [governor](/docs/user-docs/Governance).
     */
    constructor(address governance_) Governable(governance_) { }

    /**
     * @notice Sets the [`Solace Token`](./SOLACE) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param solace_ The `SOLACE` token address.
     */
    function setSolace(address solace_) external override onlyGovernance {
        solace = solace_;
        emit SolaceSet(solace_);
    }

    /**
     * @notice Sets the [`Master`](./Master) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param master_ The contract address of the `Master` contract.
     */
    function setMaster(address master_) external override onlyGovernance {
        master = master_;
        emit MasterSet(master_);
    }

    /**
     * @notice Sets the [`Claims Escrow`](./ClaimsEscrow) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param claimsEscrow_ The contract address of the `ClaimsEscrow` contract.
     */
    function setClaimsEscrow(address claimsEscrow_) external override onlyGovernance {
        claimsEscrow = claimsEscrow_;
        emit ClaimsEscrowSet(claimsEscrow_);
    }

    /**
     * @notice Sets the [`Vault`](./Vault) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param vault_ The contract address of the `Vault` contract.
     */
    function setVault(address vault_) external override onlyGovernance {
        vault = vault_;
        emit VaultSet(vault_);
    }

    /**
     * @notice Sets the [`Treasury`](./Treasury) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param treasury_ The contract address of the `Treasury` contract.
     */
    function setTreasury(address treasury_) external override onlyGovernance {
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    /**
     * @notice Sets the [`Locker`](./Locker) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param locker_ The contract address of the `Locker` contract.
     */
    function setLocker(address locker_) external override onlyGovernance {
        locker = locker_;
        emit LockerSet(locker_);
    }

    /**
     * @notice Sets the [`Policy Manager`](./PolicyManager) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param policyManager_ The contract address of the `PolicyManager` contract.
     */
    function setPolicyManager(address policyManager_) external override onlyGovernance {
        policyManager = policyManager_;
        emit PolicyManagerSet(policyManager_);
    }

    /**
     * @notice Sets the [`Risk Manager`](./RiskManager) contract.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param riskManager_ The contract address of the `RiskManager` contract.
     */
    function setRiskManager(address riskManager_) external override onlyGovernance {
        riskManager = riskManager_;
        emit RiskManagerSet(riskManager_);
    }
}
