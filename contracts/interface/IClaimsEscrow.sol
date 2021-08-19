// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title IClaimsEscrow
 * @author solace.fi
 * @notice The holder of claims. Policy holders can submit claims through their policy's product contract, in the process burning the policy and converting it to a claim. The policy holder will then need to wait for a cooldown period after which they can withdraw the payout.
 */
interface IClaimsEscrow {

    /// @notice Emitted when a new claim is received.
    event ClaimReceived(uint256 indexed _claimID, address indexed _claimant, uint256 indexed _amount);
    /// @notice Emitted when a claim is paid out.
    event ClaimWithdrawn(uint256 indexed _claimID, address indexed _claimant, uint256 indexed _amount);

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
     * @param _policyID ID of policy to claim.
     * @param _claimant Address of the claimant.
     * @param _amount Amount of ETH to claim.
     */
    function receiveClaim(uint256 _policyID, address _claimant, uint256 _amount) external payable;

    /**
     * @notice Allows claimants to withdraw their claims payout.
     * Will attempt to withdraw the full amount then burn the claim if successful.
     * Only callable by the claimant.
     * Only callable after the cooldown period has elapsed (from the time the claim was approved and processed).
     * @param _claimID The id of the claim to withdraw payout for.
     */
    function withdrawClaimsPayout(uint256 _claimID) external;

    /**
     * @notice Adjusts the value of a claim.
     * Can only be called by the current governor.
     * @param _claimID The claim to adjust.
     * @param _value The new payout of the claim.
     */
    function adjustClaim(uint256 _claimID, uint256 _value) external;

    /**
     * @notice Rescues misplaced tokens.
     * Can only be called by the current governor.
     * @param _token Token to pull.
     * @param _amount Amount to pull.
     * @param _dst Destination for tokens.
     */
    function sweep(address _token, uint256 _amount, address _dst) external;

    /// @notice Claim struct.
    struct Claim {
        uint256 amount;
        uint256 receivedAt; // used to determine withdrawability after cooldown period
    }

    /**
     * @notice Gets information about a claim.
     * @param _claimID Claim to query.
     * @return _info Claim info as struct.
     */
    function claim(uint256 _claimID) external view returns (Claim memory _info);

    /**
     * @notice Gets information about a claim.
     * @param _claimID Claim to query.
     * @return _amount Claim amount in ETH.
     * @return _receivedAt Time claim was received at.
     */
    function getClaim(uint256 _claimID) external view returns (uint256 _amount, uint256 _receivedAt);

    /// @notice The duration of time in seconds the user must wait between submitting a claim and withdrawing the payout.
    function cooldownPeriod() external view returns (uint256);

    /**
     * @notice Set the cooldown duration.
     * Can only be called by the current governor.
     * @param _period New cooldown duration in seconds
     */
    function setCooldownPeriod(uint256 _period) external;

    /**
     * @notice Returns true if the claim exists.
     * @param _claimID The id to check.
     * @return _status True if it exists, false if not.
     */
    function exists(uint256 _claimID) external view returns (bool _status);

    /**
     * @notice Returns true if the payout of the claim can be withdrawn.
     * @param _claimID The id to check.
     * @return _status True if it is withdrawable, false if not.
     */
    function isWithdrawable(uint256 _claimID) external view returns (bool _status);

    /**
     * @notice The amount of time left until the payout is withdrawable.
     * @param _claimID The id to check.
     * @return _time The duration in seconds.
     */
    function timeLeft(uint256 _claimID) external view returns (uint256 _time);

    /**
     * @notice List a user's claims.
     * @param _claimant User to check.
     * @return _claimIDs List of claimIDs.
     */
    function listClaims(address _claimant) external view returns (uint256[] memory _claimIDs);
}
