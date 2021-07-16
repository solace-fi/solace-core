// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import "../Registry.sol";

/**
 * @title MockRegistryV2
 * @author solace.fi
 * @notice Mock registry for testing purposes
 */
contract MockRegistryV2 is Registry {
    function version() public pure returns(string memory) {
        return "V2";
    }
}
