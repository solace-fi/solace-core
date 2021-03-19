// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./../Registry.sol";


/**
 * @title Mock Product
 * @author solace.fi
 * @notice A simple mock of product to test Registry.
 */
contract MockProduct {

    /// @notice Registry.
    Registry public registry;

    event PolicyCreated(address policy);
    event PolicyDeleted(address policy);

    /**
     * @notice Constructs the mock product contract.
     * @param _registry The Registry address.
     */
    constructor(address _registry) public {
        registry = Registry(_registry);
    }

    /**
     * @notice Creates a new policy then registers it.
     * @return The new policy's address.
     */
    function createPolicy() external returns (address) {
        // generate a random address
        address pseudoRand = address(uint160(uint256(
            // solhint-disable-next-line not-rely-on-time, not-rely-on-block-hash
            keccak256(abi.encodePacked(block.timestamp, blockhash(block.number)))
        )));
        // register policy
        registry.addPolicy(pseudoRand);
        // emit event
        emit PolicyCreated(pseudoRand);
        // return new policy's address
        return pseudoRand;
    }

    /**
     * @notice Deletes and deregisters a policy.
     * @param _policy The policy's address.
     */
    function deletePolicy(address _policy) external {
        // register policy
        registry.removePolicy(_policy);
        // emit event
        emit PolicyDeleted(_policy);
    }
}
