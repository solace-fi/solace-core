// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./interface/IRegistry.sol";

/**
 * @title Registry
 * @author solace.fi
 * @notice The `Registry` is an  upgradeable proxy contract that tracks the contracts in the Solaverse. 
 * It inherits from `UUPSUpgradeable` contract. Please refer  [**OpenZeppelin Docs**](https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable) to learn more about upgradeable proxies.
 */
contract Registry is IRegistry, Initializable, UUPSUpgradeable {

    /// @notice Admin to upgrade contract
    address public admin;
    /// @notice Governor.
    address public override governance;
    /// @notice Governance to take over.
    address public override newGovernance;
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
     * @notice Initialize function for the registry contract.
     * Only called once in contract deployment to initialize `governor` and `admin`. 
     * @param _governance Address of the governor.
     */
    function initialize(address _governance) public initializer {
        governance = _governance;
        admin = msg.sender;
    }

    /**
     * @notice Allows governance to be transferred to a new `governor`.
     * Can only be called by the current `governor`.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new `governor`.
     */
    function acceptGovernance() external override {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Sets the [`Solace Token`](./SOLACE.md) contract.
     * Can only be called by the current `governor`.
     * @param _solace The `SOLACE` token address.
     */
    function setSolace(address _solace) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        solace = _solace;
        emit SolaceSet(_solace);
    }

    /**
     * @notice Sets the [`Master`](./Master.md) contract.
     * Can only be called by the current `governor`.
     * @param _master The contract address of the `Master` contract.
     */
    function setMaster(address _master) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        master = _master;
        emit MasterSet(_master);
    }

    /**
     * @notice Sets the [`Claims Escrow`](./ClaimsEscrow.md) contract.
     * Can only be called by the current `governor`.
     * @param _claimsEscrow The contract address of the `ClaimsEscrow` contract.
     */
    function setClaimsEscrow(address _claimsEscrow) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        claimsEscrow = _claimsEscrow;
        emit ClaimsEscrowSet(_claimsEscrow);
    }

    /**
     * @notice Sets the [`Vault`](./Vault.md) contract.
     * Can only be called by the current `governor`.
     * @param _vault The contract address of the `Vault` contract.
     */
    function setVault(address _vault) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        vault = _vault;
        emit VaultSet(_vault);
    }

    /**
     * @notice Sets the [`Treasury`](./Treasury.md) contract.
     * Can only be called by the current `governor`.
     * @param _treasury The contract address of the `Treasury` contract.
     */
    function setTreasury(address _treasury) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    /**
     * @notice Sets the [`Locker`](./Locker.md) contract.
     * Can only be called by the current `governor`.
     * @param _locker The contract address of the `Locker` contract.
     */
    function setLocker(address _locker) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        locker = _locker;
        emit LockerSet(_locker);
    }

    /**
     * @notice Sets the [`Policy Manager`](./PolicyManager.md) contract.
     * Can only be called by the current `governor`.
     * @param _policyManager The contract address of the `PolicyManager` contract.
     */
    function setPolicyManager(address _policyManager) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        policyManager = _policyManager;
        emit PolicyManagerSet(_policyManager);
    }

    /** 
     * @notice Sets the [`Risk Manager`](./RiskManager.md) contract.
     * Can only be called by the current `governor`.
     * @param _riskManager The contract address of the `RiskManager` contract.
     */
    function setRiskManager(address _riskManager) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        riskManager = _riskManager;
        emit RiskManagerSet(_riskManager);
    }

    /**
    * @notice To authorize the `admin` to upgrade the `Registry` contract.
    * It is called when upgrading the `Registry` contract to security check.
    */
    function _authorizeUpgrade(address) internal override {
        require(admin == msg.sender, "!admin");
    }
}
