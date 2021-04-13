// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IRegistry.sol";

contract ClaimsEscrow {
    using Address for address;

    struct Claim {
        address claimant;
        uint256 amount;
        uint256 processedAt; // used to determine withdrawability after cooldown period
    }

    address public governance;

    /// Registry of protocol contract addresses
    IRegistry public registry;

    event ClaimsWithdrawn(address indexed claimant, uint256 indexed amount);

    constructor (address _registry) {
        governance = msg.sender;
        registry = IRegistry(_registry);
    }

    
}