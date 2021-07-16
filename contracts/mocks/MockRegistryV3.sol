// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import "../Registry.sol";

/**
 * @title MockRegistryV3
 * @author solace.fi
 * @notice Mock registry for testing purposes
 */
contract MockRegistryV3 is Registry {
    function version() public pure returns(string memory) {
        return "V3";
    }
}
