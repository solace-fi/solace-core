// SPDX-License-Identifier: GPL-3.0-or-later
// code borrowed from https://etherscan.io/address/0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5#code

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title Compound's CEther Contract
 * @author Compound
 * @notice [Compound Finance](https://compound.finance/) CToken which wraps Ether.
 */
interface ICEth is IERC20Metadata {

    /**
     * @notice Sender supplies assets into the market and receives cTokens in exchange.
     * @dev Reverts upon any failure.
     */
    function mint() external payable;

    /**
     * @notice Sender borrows assets from the protocol to their own address.
     * @param borrowAmount The amount of the underlying asset to borrow.
     * @return error 0=success, otherwise a failure (see ErrorReporter.sol for details).
     */
    function borrow(uint256 borrowAmount) external returns (uint256);

    /**
     * @notice Sender redeems cTokens in exchange for the underlying asset.
     * @dev Accrues interest whether or not the operation succeeds, unless reverted.
     * @param redeemTokens The number of cTokens to redeem into underlying.
     * @return error 0=success, otherwise a failure (see ErrorReporter.sol for details).
     */
    function redeem(uint redeemTokens) external returns (uint256);

    /**
     * @notice Calculates the exchange rate from the underlying to the CToken.
     * @dev This function does not accrue interest before calculating the exchange rate.
     * @return rate Calculated exchange rate scaled by 1e18.
     */
    function exchangeRateStored() external view returns (uint256);
}
