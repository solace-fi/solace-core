// SPDX-License-Identifier: GPL-3.0-or-later
// code borrowed from https://etherscan.io/address/0xb53c1a33016b2dc2ff3653530bff1848a515c8c5#code
pragma solidity 0.8.6;

/**
 * @title LendingPoolAddressesProvider contract
 * @author Aave
 * @notice Main registry of addresses part of or connected to the protocol, including permissioned roles
 * - Acting also as factory of proxies and admin of those, so with right to change its implementations
 * - Owned by the Aave Governance
 */
interface ILendingPoolAddressesProvider {

    /**
     * @notice Returns the address of the Price Oracle.
     * @return oracle The price oracle address.
     */
    function getPriceOracle() external view returns (address oracle);
}
