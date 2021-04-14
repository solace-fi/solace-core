// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IRegistry.sol";

contract ClaimsEscrow {
    using Address for address;

    struct Claim {
        address claimant;
        uint256 amount;
        uint256 receivedAt; // used to determine withdrawability after cooldown period
    }

    address public governance;

    uint256 constant COOLDOWN_PERIOD = 1209600; // 14 days

    uint256 private _claimId;

    /// Registry of protocol contract addresses
    IRegistry public registry;

    /// mapping of claimId to Claim object
    mapping (uint256 => Claim) public claims;

    event ClaimWithdrawn(uint256 indexed claimId, address indexed claimant, uint256 indexed amount);

    constructor (address _registry) {
        governance = msg.sender;
        registry = IRegistry(_registry);
        _claimId = 0;
    }

    /**
     * @notice Receives ETH from the Vault for a claim
     * Only callable by the Vault contract
     * @param _claimant Address of the claimant
     * @return claimId The id of the claim received
     */
    function receiveClaim(address _claimant) external payable returns (uint256 claimId) {
        require(msg.sender == registry.vault(), "!vault");

        uint256 claimId = _claimId;
        
        // Add claim to claims mapping
        claims[claimId] = Claim({
            claimant: _claimant,
            amount: msg.value,
            receivedAt: block.timestamp
        });

        // increment claimId
        _claimId += 1;
    }

    /**
     * @notice Allows claimants to withdraw their claims payout
     * Only callable by the claimant
     * Only callable after the cooldown period has elapsed (from the time the claim was approved and processed)
     * @param claimId The id of the claim to withdraw payout for
     */
    function withdrawClaimsPayout(uint256 claimId) external {
        require(msg.sender == claims[claimId].claimant, "!claimant");
        require(block.timestamp >= claims[claimId].receivedAt + COOLDOWN_PERIOD, "cooldown period has not elapsed");

        uint256 amount = claims[claimId].amount;

        delete claims[claimId];

        payable(msg.sender).transfer(amount);

        emit ClaimWithdrawn(claimId, msg.sender, amount);
    }
}