// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./interface/IRegistry.sol";

/**
 * @title Registry
 * @author solace.fi
 * @notice Tracks the contracts in the Solaverse.
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
     * @notice initialize function for the registry contract.
     * Only called once in contract deployment to initialize governor and admin. 
     * @param _governance Address of the governor.
     */
    function initialize(address _governance) public initializer {
        governance = _governance;
        admin = msg.sender;
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
     * @notice Sets the PolicyManager contract.
     * Can only be called by the current governor.
     * @param _policyManager The policy manager address.
     */
    function setPolicyManager(address _policyManager) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        policyManager = _policyManager;
        emit PolicyManagerSet(_policyManager);
    }

    /** 
     * @notice Sets the RiskManager contract.
     * Can only be called by the current governor.
     * @param _riskManager The risk manager address.
     */
    function setRiskManager(address _riskManager) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        riskManager = _riskManager;
        emit RiskManagerSet(_riskManager);
    }

    /**
    * @notice To authorize the admin to upgrade the contract.
    */
    function _authorizeUpgrade(address) internal override {
        require(admin == msg.sender, "!admin");
    }
}
