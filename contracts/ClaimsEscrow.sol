// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IRegistry.sol";
import "./interface/IClaimsEscrow.sol";

contract ClaimsEscrow is IClaimsEscrow {
    using Address for address;
    using SafeERC20 for IERC20;

    struct Claim {
        address claimant;
        uint256 amount;
        uint256 receivedAt; // used to determine withdrawability after cooldown period
    }

    /// @notice Governor.
    address public governance;

    /// @notice Governance to take over.
    address public newGovernance;

    uint256 constant COOLDOWN_PERIOD = 1209600; // 14 days

    uint256 public totalClaims;

    /// Registry of protocol contract addresses
    IRegistry public registry;

    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// mapping of claimId to Claim object
    mapping (uint256 => Claim) public claims;

    event ClaimWithdrawn(uint256 indexed claimId, address indexed claimant, uint256 indexed amount);
    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);

    /**
     * @notice Constructs the ClaimsEscrow contract.
     * @param _governance Address of the governor.
     * @param _registry Address of the registry.
     */
    constructor(address _governance, address _registry) {
        governance = _governance;
        registry = IRegistry(_registry);
        totalClaims = 0;
    }

    /**
     * Receive function. Deposits eth.
     */
    receive () external payable override {}


    /**
     * Fallback function. Deposits eth.
     */
    fallback () external payable override {}

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

    /**
     * @notice Receives ETH from the Vault for a claim
     * Only callable by the Vault contract
     * @param _claimant Address of the claimant
     * @return claimId The id of the claim received
     */
    function receiveClaim(address _claimant) external payable override returns (uint256 claimId) {
        require(msg.sender == registry.vault(), "!vault");

        claimId = ++totalClaims; // starts at 1, increments
        // Add claim to claims mapping
        claims[claimId] = Claim({
            claimant: _claimant,
            amount: msg.value,
            receivedAt: block.timestamp
        });
    }

    /**
     * @notice Allows claimants to withdraw their claims payout
     * Only callable by the claimant
     * Only callable after the cooldown period has elapsed (from the time the claim was approved and processed)
     * @param claimId The id of the claim to withdraw payout for
     */
    function withdrawClaimsPayout(uint256 claimId) external override {
        require(msg.sender == claims[claimId].claimant, "!claimant");
        require(block.timestamp >= claims[claimId].receivedAt + COOLDOWN_PERIOD, "cooldown period has not elapsed");

        uint256 amount = claims[claimId].amount;

        delete claims[claimId];

        payable(msg.sender).transfer(amount);

        emit ClaimWithdrawn(claimId, msg.sender, amount);
    }

    /**
     * @notice Adjusts the value of a claim.
     * Can only be called by the current governor.
     * @param claimId The claim to adjust.
     * @param value The new payout of the claim.
     */
    function adjustClaim(uint256 claimId, uint256 value) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        require(claims[claimId].receivedAt > 0, "claim dne");
        claims[claimId].amount = value;
    }

    /**
     * @notice Rescues misplaced tokens.
     * Can only be called by the current governor.
     * @param token Token to pull.
     * @param amount Amount to pull.
     * @param dst Destination for tokens.
     */
    function sweep(address token, uint256 amount, address dst) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        if(token == ETH_ADDRESS) payable(dst).transfer(amount);
        else IERC20(token).safeTransfer(dst, amount);
    }
}
