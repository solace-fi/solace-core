// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;

import "../Registry.sol";

/**
 * @title MockRegistry
 * @author solace.fi
 * @notice Mock registry for the upgradeable `Registry` testing purposes.
 */
contract MockRegistry is Registry {
    string internal name;

    function getName() public view returns(string memory) {
        return name;
    }

    function setName(string memory _name) public {
        name = _name;
    }

    function version() public virtual pure returns(string memory) {
        return "V2";
    }
}
