// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;


/**
 * @title IClaimsEscrow: Escrow Contract for solace.fi claims
 * @author solace.fi
 * @notice The interface for the Claims Escrow contract.
 */
interface IClaimsEscrow {
    function receiveClaim(address _claimant) external payable returns (uint256 claimId);
}