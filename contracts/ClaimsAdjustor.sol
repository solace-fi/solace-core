// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IRegistry.sol";
import "./interface/IVault.sol";

contract ClaimsAdjustor {
    using Address for address;

    address public governance;

    /// Registry of protocol contract addresses
    IRegistry public registry;

    event ClaimApproved(address indexed claimant, uint256 indexed amount);

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

}