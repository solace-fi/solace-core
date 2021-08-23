// SPDX-License-Identifier: GPL-3.0-or-later
// code borrowed from https://etherscan.io/address/0xa035b9e130f2b1aedc733eefb1c67ba4c503491f#code

pragma solidity 0.8.6;

import "./ICToken.sol";

/**
 * @title Compound's CErc20 Contract
 * @author Compound
 * @notice [Compound Finance](https://compound.finance/) CTokens which wrap an ERC20 underlying.
 */
interface ICErc20 is ICToken {

    /**
     * @notice Sender supplies assets into the market and receives cTokens in exchange.
     * @dev Accrues interest whether or not the operation succeeds, unless reverted.
     * @param mintAmount The amount of the underlying asset to supply.
     * @return error 0=success, otherwise a failure (see ErrorReporter.sol for details).
     */
    function mint(uint mintAmount) external returns (uint error);
}
