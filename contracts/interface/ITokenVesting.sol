// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title ITokenVesting
 * @author solace.fi
 * @notice Stores and handles vested [**SOLACE**](./SOLACE) tokens for SOLACE investors
 *
 * Predetermined agreement with investors for a linear unlock over three years, with a six month cliff
 */

 interface ITokenVesting {
 
    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice SOLACE Token.
    function solace() external view returns (address);

    /// @notice timestamp that investor tokens start vesting.
    function vestingStart() external view returns (uint256);

    /// @notice timestamp that cliff for investor tokens finishes.
    function cliff() external view returns (uint256);

    /// @notice timestamp that investor tokens finish vesting.
    function vestingEnd() external view returns (uint256);
 
    /// @notice Total tokens for an investor.
    function totalInvestorTokens(address investor) external view returns (uint256);

    /// @notice Redeemed tokens for an investor.
    function redeemedInvestorTokens(address investor) external view returns (uint256);

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when investor address is changed
    event InvestorAddressChanged(address oldAddress, address newAddress);

    /***************************************
    INVESTOR FUNCTIONS
    ***************************************/

    /**
     * @notice Function for investor to claim SOLACE tokens - will claim all redeemable tokens
     */
    function claimTokens () external;

    /**
     * @notice Calculates the amount of unlocked SOLACE tokens an investor can claim
     * @param investor Investor address
     * @return redeemableUnlockedAmount The amount of unlocked tokens an investor can claim from the smart contract
     */
    function getRedeemableUnlockedTokens(address investor) external view returns (uint256 redeemableUnlockedAmount);

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
    function rescueSOLACEtokens(uint256 amount, address recipient) external;

    /**
     * @notice Sets the total SOLACE token amounts that investors are eligible for.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Trusting governance to perform accurate accounting off-chain and ensure there is sufficient SOLACE in contract to make payouts as dictated in totalInvestorTokens mapping
     * @param investors Array of investors to set.
     * @param totalTokenAmounts Array of token amounts to set.
     */
    function setTotalInvestorTokens(address[] calldata investors, uint256[] calldata totalTokenAmounts) external;

    /**
     * @notice Changes address for an investor.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param oldAddress Original investor address.
     * @param newAddress Intended new investor address.
     */
    function setNewInvestorAddress(address oldAddress, address newAddress) external;
 }
