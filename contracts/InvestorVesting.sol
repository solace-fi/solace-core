// UNSURE - Are we setting the vesting period to start retrospective to this contract's deployment?

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Governable.sol";
import "./interface/ISOLACE.sol";

/**
 * @title InvestorVesting
 * @author solace.fi
 * @notice Stores and handles vested [**SOLACE**](./SOLACE) tokens for SOLACE investors
 *
 * Predetermined agreement with investors for a linear unlock over three years, with a six month cliff
 */

 contract InvestorVesting is ReentrancyGuard, Governable {
 
    /// @notice SOLACE Token.
    address public solace;

    /// @notice custodian of SOLACE tokens - EOA that transfers investor SOLACE tokens to this contract
    address public custodian;

    /// @notice timestamp that investor tokens start vesting.
    uint256 public vestingStart;

    /// @notice timestamp that cliff for investor tokens finishes.
    uint256 public cliff;

    /// @notice timestamp that investor tokens finish vesting.
    uint256 public vestingEnd;
 
    /// @notice Total tokens for an investor.
    mapping(address => uint256) public totalInvestorTokens;

    /// @notice Redeemed tokens for an investor.
    mapping(address => uint256) public redeemedInvestorTokens;

    // @dev used in our floating point price maths
    // Specifically where we determine unlocked proportion of investor tokens
    uint256 internal constant Q12 = 1e12;

    /**
     * @notice Constructs the `InvestorVesting` contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param solace_ Address of [**SOLACE**](./SOLACE).
     * @param custodian_ Address which will transfer investor SOLACE tokens to this contract
     * @param vestingStart_ Unix timestamp for start of vesting period for investor tokens
     */
    constructor(address governance_, address solace_, address custodian_, uint256 vestingStart_) Governable(governance_) {
        require(solace_ != address(0x0), "zero address solace");
        require(custodian_ != address(0x0), "zero address custodian");
        require(vestingStart_ != 0, "vestingStart cannot be initialized as 0");
        solace = solace_;
        custodian = custodian_;
        vestingStart = vestingStart_;
        cliff = vestingStart_ + 15768000; // Cliff is 6-months after vesting start
        vestingEnd = vestingStart_ + 94608000; // Vesting ends 3-years after vesting start
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice View total SOLACE token amount for an investor address.
    function viewTotalTokens(address investor) external view returns (uint256) {
        return totalInvestorTokens[investor];
    }

    /// @notice View redeemed SOLACE token amount for an investor address.
    function viewRedeemedTokens(address investor) external view returns (uint256) {
        return redeemedInvestorTokens[investor];
    }

    /// @notice View unlocked SOLACE token amount that an investor can claim 
    function viewRedeemableUnlockedTokens(address investor) external view returns (uint256) {
        uint256 redeemableUnlockedAmount = _getRedeemableUnlockedTokens(investor);
        return redeemableUnlockedAmount;
    }

    /***************************************
    INVESTOR FUNCTIONS
    ***************************************/

    /**
     * @notice Function for investor to claim SOLACE tokens
     * @param amount Amount of SOLACE tokens to claim from this contract
     */
    function claimTokens (uint256 amount) external nonReentrant {
        require(totalInvestorTokens[msg.sender] != 0, "You have no tokens to claim");
        require(amount <= _getRedeemableUnlockedTokens(msg.sender), "You cannot claim this many tokens");
        redeemedInvestorTokens[msg.sender] += amount;
        SafeERC20.safeTransfer(IERC20(solace), msg.sender, amount);
    }

    /**
     * @notice Calculates the amount of unlocked SOLACE tokens an investor can claim
     * @param investor Investor address
     * @return redeemableUnlockedAmount The amount of unlocked tokens an investor can claim from the smart contract
     */
    function _getRedeemableUnlockedTokens(address investor) internal view returns (uint256 redeemableUnlockedAmount) {
        uint256 timestamp = block.timestamp;
        uint256 redeemableUnlockedAmount;
        if(timestamp <= cliff) {
            return redeemableUnlockedAmount; // Return default value of 0
        } else if(timestamp <= vestingEnd) {
            uint256 timeSinceCliff = timestamp - cliff;
            uint256 timeBetweenVestingEndAndCliff = vestingEnd - cliff;
            uint256 totalUnlockedProportion = Q12 * (timeSinceCliff / timeBetweenVestingEndAndCliff); // Solidity rounds down to 0, so use fixed point arithmetic here
            uint256 totalUnlockedInvestorTokens = (totalUnlockedProportion * totalInvestorTokens[investor]) / Q12;
            redeemableUnlockedAmount = totalUnlockedInvestorTokens - redeemedInvestorTokens[investor];
            return redeemableUnlockedAmount;
        } else {
            redeemableUnlockedAmount = totalInvestorTokens[investor] - redeemedInvestorTokens[investor];
            return redeemableUnlockedAmount;
        }
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the custodian which can transfer SOLACE tokens to this contract
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param custodian_ The new custodian.
     */
    function setCustodian(address payable custodian_) external onlyGovernance {
        require(custodian_ != address(0x0), "zero address receiver");
        custodian = custodian_;
        // UNSURE - Do we want to emit an event here?
    }

    /**
     * @notice Rescues excess [**SOLACE**](./SOLACE).
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param amount Amount to send. Will be sent from this contract to `custodian`.
     */
    function rescueSOLACEtokens(uint256 amount) external onlyGovernance {
        SafeERC20.safeTransfer(IERC20(solace), custodian, amount);
        // UNSURE - If there is any non-zero value in the totalInvestorTokens mapping, the mapping will become uncorrelated with the actual amount of SOLACE tokens held by the contract
        // Do we want to implement a guard to avoid the above messup?
    }

    /**
     * @notice Sets the total SOLACE token amounts that investors are eligible for.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param investors Array of investors to set.
     * @param totalTokenAmounts Array of token amounts to set.
     */
    function setTotalInvestorTokens(address[] calldata investors, uint256[] calldata totalTokenAmounts) external onlyGovernance {
        require(investors.length == totalTokenAmounts.length, "length mismatch");
        for(uint256 i = 0; i < investors.length; i++) {
            totalInvestorTokens[investors[i]] = totalTokenAmounts[i];
            SafeERC20.safeTransfer(IERC20(solace), custodian, totalTokenAmounts[i]); // UNSURE here - Where are we transferring SOLACE tokens from? Also do we care about lost gas efficiency in transferring SOLACE in multiple transactions within each loop iteration vs in one single transaction elsewhere?
        }
    }
 }
