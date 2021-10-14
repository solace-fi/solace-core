// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title Mock Faulty Receiver
 * @author solace.fi
 * @notice A contract that throws if sent ETH.
 */
contract MockFaultyReceiver {

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     */
    receive () external payable {
        revert();
    }

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     */
    fallback () external payable {
        revert();
    }
}
