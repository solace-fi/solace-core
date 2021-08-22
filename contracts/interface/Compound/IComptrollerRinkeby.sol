// SPDX-License-Identifier: GPL-3.0-or-later
// code borrowed from https://rinkeby.etherscan.io/address/0xb1983ee0064fdb2a581966715dc9ba4d8b289a6a#code

pragma solidity 0.8.6;

/**
 * @title Compound's Comptroller Contract.
 * @author Compound
 */
interface IComptrollerRinkeby {
    /**
     * @notice Official mapping of cTokens -> Market metadata
     * @dev Used e.g. to determine if a market is supported
     */
    function markets(address market) external view returns (bool isListed, uint256 collateralFactorMantissa);
}
