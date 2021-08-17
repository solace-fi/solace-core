// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./Governable.sol";
import "./interface/IRegistry.sol";
import "./interface/IVault.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IClaimsEscrow.sol";

/**
 * @title ClaimsEscrow
 * @author solace.fi
 * @notice The holder of claims. Policy holders can submit claims through their policy's product contract, in the process burning the policy and converting it to a claim.
 * The policy holder will then need to wait for a cooldown period after which they can withdraw the payout.
 */
contract ClaimsEscrow is ERC721Enumerable, IClaimsEscrow, Governable {
    using Address for address;
    using SafeERC20 for IERC20;

    /// @notice The duration of time in seconds the user must wait between submitting a claim and withdrawing the payout.
    uint256 public override cooldownPeriod = 3600; // one hour

    /// @notice Registry of protocol contract addresses.
    IRegistry public registry;

    /// @notice ETH_ADDRESS.
    address private constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice mapping of claimID to Claim object
    mapping (uint256 => Claim) internal _claims;

    /// @notice tracks how much is required to payout all claims
    uint256 public totalClaimsOutstanding;

    /**
     * @notice The constructor. It constructs the ClaimsEscrow contract.
     * @param _governance The address of the governor.
     * @param _registry The address of the registry.
     */
    constructor(address _governance, address _registry) ERC721("Solace Claim", "SCT") Governable(_governance) {
        registry = IRegistry(_registry);
    }

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     */
    receive () external payable override {}


    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     */
    fallback () external payable override {}

    /**
     * @notice Receives a claim.
     * Only callable by active products.
     * @dev claimID = policyID
     * @param _policyID The id of policy to claim.
     * @param _claimant The address of the claimant.
     * @param _amount The amount of **ETH** to claim.
     */
    function receiveClaim(uint256 _policyID, address _claimant, uint256 _amount) external payable override {
        require(IPolicyManager(registry.policyManager()).productIsActive(msg.sender), "!product");
        uint256 tco = totalClaimsOutstanding + _amount;
        totalClaimsOutstanding = tco;
        uint256 bal = address(this).balance;
        if(bal < tco) IVault(registry.vault()).requestEth(tco - bal);
        // Add claim to claims mapping
        _claims[_policyID] = Claim({
            amount: _amount,
            receivedAt: block.timestamp
        });
        _mint(_claimant, _policyID);
        emit ClaimReceived(_policyID, _claimant, _amount);
    }

    /**
     * @notice Allows claimants to withdraw their claims payout.
     * Only callable by the `claimant`.
     * Only callable after the cooldown period has elapsed (from the time the claim was approved and processed).
     * @param claimID The id of the claim to withdraw payout for.
     */
    function withdrawClaimsPayout(uint256 claimID) external override {
        require(_exists(claimID), "query for nonexistent token");
        require(msg.sender == ownerOf(claimID), "!claimant");
        require(block.timestamp >= _claims[claimID].receivedAt + cooldownPeriod, "cooldown period has not elapsed");

        uint256 amount = _claims[claimID].amount;
        // if not enough eth, request more
        if(amount > address(this).balance) {
            IVault(registry.vault()).requestEth(amount - address(this).balance);
        }
        // if still not enough eth, partial withdraw
        if(amount > address(this).balance) {
            uint256 balance = address(this).balance;
            totalClaimsOutstanding -= balance;
            _claims[claimID].amount -= balance;
            payable(msg.sender).transfer(balance);
            emit ClaimWithdrawn(claimID, msg.sender, balance);
        }
        // if enough eth, full withdraw and delete claim
        else {
            totalClaimsOutstanding -= amount;
            delete _claims[claimID];
            _burn(claimID);
            payable(msg.sender).transfer(amount);
            emit ClaimWithdrawn(claimID, msg.sender, amount);
        }
    }

    /**
     * @notice Adjusts the value of a claim.
     * Can only be called by the current `governor`.
     * @param claimID The claim to adjust.
     * @param value The new payout of the claim.
     */
    function adjustClaim(uint256 claimID, uint256 value) external override onlyGovernance {
        require(_exists(claimID), "query for nonexistent token");
        totalClaimsOutstanding = totalClaimsOutstanding - _claims[claimID].amount + value;
        _claims[claimID].amount = value;
    }

    /**
     * @notice Rescues misplaced tokens.
     * Can only be called by the current `governor`.
     * @param token The token to pull.
     * @param amount The amount to pull.
     * @param dst The destination for tokens.
     */
    function sweep(address token, uint256 amount, address dst) external override onlyGovernance {
        if(token == ETH_ADDRESS) payable(dst).transfer(amount);
        else IERC20(token).safeTransfer(dst, amount);
    }

    /**
     * @notice Set the cooldown duration.
     * Can only be called by the current `governor`.
     * @param _period The new cooldown duration in seconds.
     */
    function setCooldownPeriod(uint256 _period) external override onlyGovernance {
        cooldownPeriod = _period;
    }

    /**
     * @notice Gets information about a claim.
     * @param _claimID Claim to query.
     * @return info Claim info as struct.
     */
    function claims(uint256 _claimID) external view override returns (Claim memory info) {
        require(_exists(_claimID), "query for nonexistent token");
        info = _claims[_claimID];
        return info;
    }

    /**
     * @notice Gets information about a claim.
     * @param _claimID Claim to query.
     * @return amount Claim amount in ETH.
     * @return receivedAt Time claim was received at.
     */
    function getClaims(uint256 _claimID) external view override returns (uint256 amount, uint256 receivedAt) {
        require(_exists(_claimID), "query for nonexistent token");
        Claim memory info = _claims[_claimID];
        return (info.amount, info.receivedAt);
    }

    /**
     * @notice Returns true if the claim exists.
     * @param claimID The id to check.
     * @return status True if it exists, false if not.
     */
    function exists(uint256 claimID) external view override returns (bool status) {
        return _exists(claimID);
    }

    /**
     * @notice Returns true if the payout of the claim can be withdrawn.
     * @param claimID The id to check.
     * @return status True if it is withdrawable, false if not.
     */
    function isWithdrawable(uint256 claimID) external view override returns (bool status) {
        return _exists(claimID) && block.timestamp >= _claims[claimID].receivedAt + cooldownPeriod;
    }

    /**
     * @notice The amount of time left until the payout is withdrawable.
     * @param claimID The id to check.
     * @return time The duration in seconds.
     */
    function timeLeft(uint256 claimID) external view override returns (uint256 time) {
        if(!_exists(claimID)) return type(uint256).max;
        uint256 end = _claims[claimID].receivedAt + cooldownPeriod;
        if(block.timestamp >= end) return 0;
        return end - block.timestamp;
    }

    /**
     * @notice List a user's claims.
     * @param claimant User to check.
     * @return claimIDs List of claimIDs.
     */
    function listClaims(address claimant) external view override returns (uint256[] memory claimIDs) {
        uint256 tokenCount = balanceOf(claimant);
        claimIDs = new uint256[](tokenCount);
        for (uint256 index = 0; index < tokenCount; index++) {
            claimIDs[index] = tokenOfOwnerByIndex(claimant, index);
        }
        return claimIDs;
    }
}
