// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Governable.sol";
import "./interface/ISOLACE.sol";
import "./interface/ITokenVesting.sol";

/**
 * @title TokenVesting
 * @author solace.fi
 * @notice Stores and handles vested [**SOLACE**](./SOLACE) tokens for SOLACE investors
 *
 * Predetermined agreement with investors for a linear unlock over three years, with a six month cliff
 */

 contract TokenVesting is ITokenVesting, ReentrancyGuard, Governable {
 
    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice SOLACE Token.
    address public override solace;

    /// @notice timestamp that investor tokens start vesting.
    uint256 public override vestingStart;

    /// @notice timestamp that cliff for investor tokens finishes.
    uint256 public override cliff;

    /// @notice timestamp that investor tokens finish vesting.
    uint256 public override vestingEnd;
 
    /// @notice Total tokens for an investor.
    mapping(address => uint256) public override totalInvestorTokens;

    /// @notice Redeemed tokens for an investor.
    mapping(address => uint256) public override redeemedInvestorTokens;

    /**
     * @notice Constructs the `InvestorVesting` contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param solace_ Address of [**SOLACE**](./SOLACE).
     * @param vestingStart_ Unix timestamp for start of vesting period for investor tokens
     */
    constructor(address governance_, address solace_, uint256 vestingStart_) Governable(governance_) {
        require(solace_ != address(0x0), "zero address solace");
        require(vestingStart_ != 0, "vestingStart cannot be initialized as 0");
        solace = solace_;
        vestingStart = vestingStart_;
        cliff = vestingStart_ + 15768000; // Cliff is 6-months after vesting start
        vestingEnd = vestingStart_ + 94608000; // Vesting ends 3-years after vesting start
    }

    /***************************************
    INVESTOR FUNCTIONS
    ***************************************/

    /**
     * @notice Function for investor to claim SOLACE tokens - will claim all redeemable tokens
     */
    function claimTokens () external override nonReentrant {
        require(totalInvestorTokens[msg.sender] != 0, "You have no tokens to claim");
        require(getRedeemableUnlockedTokens(msg.sender) > 0, "You cannot claim this many tokens");
        uint256 redeemableUnlockedTokens = getRedeemableUnlockedTokens(msg.sender);
        redeemedInvestorTokens[msg.sender] += redeemableUnlockedTokens;
        SafeERC20.safeTransfer(IERC20(solace), msg.sender, redeemableUnlockedTokens);
    }

    /**
     * @notice Calculates the amount of unlocked SOLACE tokens an investor can claim
     * @param investor Investor address
     * @return redeemableUnlockedAmount The amount of unlocked tokens an investor can claim from the smart contract
     */
    function getRedeemableUnlockedTokens(address investor) public view override returns (uint256 redeemableUnlockedAmount) {
        uint256 timestamp = block.timestamp;
        uint256 redeemableUnlockedAmount;
        if(timestamp <= cliff) {
            return 0;
        } else if(timestamp <= vestingEnd) {
            uint256 totalUnlockedAmount = totalInvestorTokens[investor] * ( (timestamp - cliff) / (vestingEnd - cliff) );
            redeemableUnlockedAmount = totalUnlockedAmount - redeemedInvestorTokens[investor];
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
     * @notice Rescues excess [**SOLACE**](./SOLACE).
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Trusting governance to perform accurate accounting off-chain and ensure there is sufficient SOLACE in contract to make payouts as dictated in totalInvestorTokens mapping
     * @param amount Amount to send.
     * @param recipient Address to send rescued SOLACE tokens to.
     */
    function rescueSOLACEtokens(uint256 amount, address recipient) external override onlyGovernance {
        require(recipient != address(0x0), "zero address recipient");
        SafeERC20.safeTransfer(IERC20(solace), recipient, amount);
    }

    /**
     * @notice Sets the total SOLACE token amounts that investors are eligible for.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Trusting governance to perform accurate accounting off-chain and ensure there is sufficient SOLACE in contract to make payouts as dictated in totalInvestorTokens mapping
     * @param investors Array of investors to set.
     * @param totalTokenAmounts Array of token amounts to set.
     */
    function setTotalInvestorTokens(address[] calldata investors, uint256[] calldata totalTokenAmounts) external override onlyGovernance {
        require(investors.length == totalTokenAmounts.length, "length mismatch");
        for(uint256 i = 0; i < investors.length; i++) {
            totalInvestorTokens[investors[i]] = totalTokenAmounts[i];
        }
        // UNSURE - should we use a checksum to ensure (sum of []totalTokenAmounts) <= (SOLACE balance of this contract)), or trust governance
    }
 }
