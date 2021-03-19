// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./../Registry.sol";


/**
 * @title Mock Vault
 * @author solace.fi
 * @notice A simple mock of vault to test Registry.
 */
contract MockVault {

    /// @notice Registry.
    Registry public registry;

    event StrategyCreated(address strategy);
    event StrategyDeleted(address strategy);

    /**
     * @notice Constructs the mock vault contract.
     * @param _registry The Registry address.
     */
    constructor(address _registry) public {
        registry = Registry(_registry);
    }

    /**
     * @notice Creates a new strategy then registers it.
     * @return The new strategy's address.
     */
    function createStrategy() external returns (address) {
        // generate a random address
        address pseudoRand = address(uint160(uint256(
            // solhint-disable-next-line not-rely-on-time, not-rely-on-block-hash
            keccak256(abi.encodePacked(block.timestamp, blockhash(block.number)))
        )));
        // register strategy
        registry.addStrategy(pseudoRand);
        // emit event
        emit StrategyCreated(pseudoRand);
        // return new strategy's address
        return pseudoRand;
    }

    /**
     * @notice Deletes and deregisters a strategy.
     * @param _strategy The strategy's address.
     */
    function deleteStrategy(address _strategy) external {
        // register strategy
        registry.removeStrategy(_strategy);
        // emit event
        emit StrategyDeleted(_strategy);
    }
}
