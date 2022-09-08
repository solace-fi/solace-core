// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title IPriceOracle
 * @author solace.fi
 * @notice Generic interface for an oracle that determines the price of tokens.
 */
interface IPriceOracle {

    /**
     * @notice Given an amount of some token, calculates the value in `USD`.
     * @param token The address of the token to price.
     * @param amount The amount of the token to price.
     * @return valueInUSD The value in `USD` with 18 decimals.
     */
    function valueOfTokens(address token, uint256 amount) external view returns (uint256 valueInUSD);
}
