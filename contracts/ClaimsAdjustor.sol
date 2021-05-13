// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IRegistry.sol";
import "./interface/IVault.sol";

contract ClaimsAdjustor {
    using Address for address;

    /// @notice Governor.
    address public governance;

    /// @notice Governance to take over.
    address public newGovernance;

    /// Registry of protocol contract addresses
    IRegistry public registry;

    event ClaimApproved(address indexed claimant, uint256 indexed amount);
    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);

    constructor (address _registry) {
        governance = msg.sender;
        registry = IRegistry(_registry);
    }

    /**
     * @notice Approves a claim and processes claim amount from Vault into Escrow
     * Only callable by the governer
     * @param _claimant Address of the claimant
     * @param _amount Amount to payout
     */
    function approveClaim(address _claimant, uint256 _amount) external {
        require(msg.sender == governance, "!governance");

        IVault vault = IVault(registry.vault());
        vault.processClaim(_claimant, _amount);

        emit ClaimApproved(_claimant, _amount);
    }

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }
}
