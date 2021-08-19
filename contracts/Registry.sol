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
     * @param _governance Address of the governor.
     */
    constructor(address _governance) Governable(_governance) { }

    /**
     * @notice Sets the [`Solace Token`](./SOLACE) contract.
     * Can only be called by the current `governor`.
     * @param _solace The `SOLACE` token address.
     */
    function setSolace(address _solace) external override onlyGovernance {
        solace = _solace;
        emit SolaceSet(_solace);
    }

    /**
     * @notice Sets the [`Master`](./Master) contract.
     * Can only be called by the current `governor`.
     * @param _master The contract address of the `Master` contract.
     */
    function setMaster(address _master) external override onlyGovernance {
        master = _master;
        emit MasterSet(_master);
    }

    /**
     * @notice Sets the [`Claims Escrow`](./ClaimsEscrow) contract.
     * Can only be called by the current `governor`.
     * @param _claimsEscrow The contract address of the `ClaimsEscrow` contract.
     */
    function setClaimsEscrow(address _claimsEscrow) external override onlyGovernance {
        claimsEscrow = _claimsEscrow;
        emit ClaimsEscrowSet(_claimsEscrow);
    }

    /**
     * @notice Sets the [`Vault`](./Vault) contract.
     * Can only be called by the current `governor`.
     * @param _vault The contract address of the `Vault` contract.
     */
    function setVault(address _vault) external override onlyGovernance {
        vault = _vault;
        emit VaultSet(_vault);
    }

    /**
     * @notice Sets the [`Treasury`](./Treasury) contract.
     * Can only be called by the current `governor`.
     * @param _treasury The contract address of the `Treasury` contract.
     */
    function setTreasury(address _treasury) external override onlyGovernance {
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    /**
     * @notice Sets the [`Locker`](./Locker) contract.
     * Can only be called by the current `governor`.
     * @param _locker The contract address of the `Locker` contract.
     */
    function setLocker(address _locker) external override onlyGovernance {
        locker = _locker;
        emit LockerSet(_locker);
    }

    /**
     * @notice Sets the [`Policy Manager`](./PolicyManager) contract.
     * Can only be called by the current `governor`.
     * @param _policyManager The contract address of the `PolicyManager` contract.
     */
    function setPolicyManager(address _policyManager) external override onlyGovernance {
        policyManager = _policyManager;
        emit PolicyManagerSet(_policyManager);
    }

    /**
     * @notice Sets the [`Risk Manager`](./RiskManager) contract.
     * Can only be called by the current `governor`.
     * @param _riskManager The contract address of the `RiskManager` contract.
     */
    function setRiskManager(address _riskManager) external override onlyGovernance {
        riskManager = _riskManager;
        emit RiskManagerSet(_riskManager);
    }
}
