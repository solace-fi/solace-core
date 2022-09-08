// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title Flux first-party price feed oracle
 * @author fluxprotocol.org
 * @notice Simple data posting on chain of a scalar value, compatible with Chainlink V2 and V3 aggregator interface
 */
interface IFluxPriceFeed {

    /**
     * @notice answer from the most recent report
     */
    function latestAnswer() external view returns (int256);
}
