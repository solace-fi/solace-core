// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title IClaimsEscrow
 * @author solace.fi
 * @notice The holder of claims. Policy holders can submit claims through their policy's product contract, in the process burning the policy and converting it to a claim. The policy holder will then need to wait for a cooldown period after which they can withdraw the payout.
 */
interface IClaimsEscrow {

    /// @notice Emitted when a new claim is received.
    event ClaimReceived(uint256 indexed claimID, address indexed claimant, uint256 indexed amount);
    /// @notice Emitted when a claim is paid out.
    event ClaimWithdrawn(uint256 indexed claimID, address indexed claimant, uint256 indexed amount);

    /**
     * Receive function. Deposits eth.
     */
    receive() external payable;

    /**
     * Fallback function. Deposits eth.
     */
    fallback () external payable;

    /**
     * @notice Receives a claim.
     * The new claim will have the same ID that the policy had and will be withdrawable after a cooldown period.
     * Only callable by active products.
     * @param policyID ID of policy to claim.
     * @param claimant Address of the claimant.
     * @param amount Amount of ETH to claim.
     */
    function receiveClaim(uint256 policyID, address claimant, uint256 amount) external payable;

    /**
     * @notice Allows claimants to withdraw their claims payout.
     * Will attempt to withdraw the full amount then burn the claim if successful.
     * Only callable by the claimant.
     * Only callable after the cooldown period has elapsed (from the time the claim was approved and processed).
     * @param claimID The ID of the claim to withdraw payout for.
     */
    function withdrawClaimsPayout(uint256 claimID) external;

    /**
     * @notice Adjusts the value of a claim.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param claimID The claim to adjust.
     * @param value The new payout of the claim.
     */
    function adjustClaim(uint256 claimID, uint256 value) external;

    /**
     * @notice Rescues misplaced tokens.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param token Token to pull.
     * @param amount Amount to pull.
     * @param dst Destination for tokens.
     */
    function sweep(address token, uint256 amount, address dst) external;

    /// @notice Claim struct.
    struct Claim {
        uint256 amount;
        uint256 receivedAt; // used to determine withdrawability after cooldown period
    }

    /**
     * @notice Gets information about a claim.
     * @param claimID Claim to query.
     * @return info Claim info as struct.
     */
    function claim(uint256 claimID) external view returns (Claim memory info);

    /**
     * @notice Gets information about a claim.
     * @param claimID Claim to query.
     * @return amount Claim amount in ETH.
     * @return receivedAt Time claim was received at.
     */
    function getClaim(uint256 claimID) external view returns (uint256 amount, uint256 receivedAt);

    /// @notice The duration of time in seconds the user must wait between submitting a claim and withdrawing the payout.
    function cooldownPeriod() external view returns (uint256);

    /**
     * @notice Set the cooldown duration.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param period New cooldown duration in seconds
     */
    function setCooldownPeriod(uint256 period) external;

    /**
     * @notice Returns true if the claim exists.
     * @param claimID The ID to check.
     * @return status True if it exists, false if not.
     */
    function exists(uint256 claimID) external view returns (bool status);

    /**
     * @notice Returns true if the payout of the claim can be withdrawn.
     * @param claimID The ID to check.
     * @return status True if it is withdrawable, false if not.
     */
    function isWithdrawable(uint256 claimID) external view returns (bool status);

    /**
     * @notice The amount of time left until the payout is withdrawable.
     * @param claimID The ID to check.
     * @return time The duration in seconds.
     */
    function timeLeft(uint256 claimID) external view returns (uint256 time);

    /**
     * @notice List a user's claims.
     * @param claimant User to check.
     * @return claimIDs List of claimIDs.
     */
    function listClaims(address claimant) external view returns (uint256[] memory claimIDs);
}
