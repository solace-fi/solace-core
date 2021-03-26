// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./../Registry.sol";


/**
 * @title Mock Product Factory
 * @author solace.fi
 * @notice A simple mock of product factory to test Registry.
 */
contract MockProductFactory {

    /// @notice Registry.
    Registry public registry;

    event ProductCreated(address product);
    event ProductDeleted(address product);

    /**
     * @notice Constructs the mock product factory contract.
     * @param _registry The Registry address.
     */
    constructor(address _registry) public {
        registry = Registry(_registry);
    }

    /**
     * @notice Creates a new product then registers it.
     * @return The new product's address.
     */
    function createProduct() external returns (address) {
        // generate a random address
        address pseudoRand = address(uint160(uint256(
            // solhint-disable-next-line not-rely-on-time, not-rely-on-block-hash
            keccak256(abi.encodePacked(block.timestamp, blockhash(block.number)))
        )));
        // register product
        registry.addProduct(pseudoRand);
        // emit event
        emit ProductCreated(pseudoRand);
        // return new product's address
        return pseudoRand;
    }

    /**
     * @notice Deletes and deregisters a product.
     * @param _product The product's address.
     */
    function deleteProduct(address _product) external {
        // register product
        registry.removeProduct(_product);
        // emit event
        emit ProductDeleted(_product);
    }
}
