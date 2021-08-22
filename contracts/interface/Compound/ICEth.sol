// SPDX-License-Identifier: GPL-3.0-or-later
// code borrowed from https://etherscan.io/address/0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5#code

pragma solidity 0.8.6;

import "./ICToken.sol";

/**
 * @title Compound's CEther Contract
 * @author Compound
 * @notice [Compound Finance](https://compound.finance/) CToken which wraps Ether.
 */
interface ICEth is ICToken {

    /**
     * @notice Sender supplies assets into the market and receives cTokens in exchange.
     * @dev Reverts upon any failure.
     */
    function mint() external payable;
}
