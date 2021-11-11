// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IPolicyManager.sol";
import "./IRegistry.sol";

/**
 * @title IProductFactory
 * @author solace.fi
 * @notice The **ProductFactory** manages the creation of new products.
 */
interface IProductFactory {

    /**
     * @notice Creates and initializes a new product.
     * @param base_ The product's source code.
     * @param governance_ The governor.
     * @param policyManager_ The IPolicyManager contract.
     * @param registry_ The IRegistry contract.
     * @param coveredPlatform_ A platform contract which locates contracts that are covered by this product.
     * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
     * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
     * @param typehash_ The typehash for submitting claims.
     * @param domain_ The user readable name of the EIP712 signing domain.
     * @param version_ The current major version of the signing domain.
     */
    function createProduct(
        address base_,
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address coveredPlatform_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        bytes32 typehash_,
        string memory domain_,
        string memory version_
    ) external returns (address product);

    /**
     * @notice Creates and initializes a new product.
     * @param base_ The product's source code.
     * @param salt_ The salt for CREATE2.
     * @param governance_ The governor.
     * @param policyManager_ The IPolicyManager contract.
     * @param registry_ The IRegistry contract.
     * @param coveredPlatform_ A platform contract which locates contracts that are covered by this product.
     * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
     * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
     * @param typehash_ The typehash for submitting claims.
     * @param domain_ The user readable name of the EIP712 signing domain.
     * @param version_ The current major version of the signing domain.
     */
    function create2Product(
        address base_,
        bytes32 salt_,
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address coveredPlatform_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        bytes32 typehash_,
        string memory domain_,
        string memory version_
    ) external returns (address product);
}
