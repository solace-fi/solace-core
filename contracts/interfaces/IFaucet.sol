// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.6;


/**
 * @title Faucet
 * @author solace.fi
 * @notice Drips [**SOLACE**](../SOLACE).
 */
interface IFaucet {

    /**
     * @notice Drips [**SOLACE**](../SOLACE) to msg.sender.
     */
    function drip() external;
}
