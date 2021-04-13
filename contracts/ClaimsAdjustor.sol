// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IRegistry.sol";

contract ClaimsAdjustor {
    using Address for address;

    address public governance;

    /// Registry of protocol contract addresses
    IRegistry public registry;

    constructor (address _registry) {
        governance = msg.sender;
        registry = IRegistry(_registry);
    }

}