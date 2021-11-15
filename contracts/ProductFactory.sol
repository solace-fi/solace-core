// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./products/CoverageProduct.sol";
import "./Factory.sol";
import "./interface/IProductFactory.sol";

/**
 * @title ProductFactory
 * @author solace.fi
 * @notice The **ProductFactory** manages the creation of new products.
 */
contract ProductFactory is Factory, IProductFactory {

    /**
     * @notice Creates and initializes a new product.
     * @param base_ The product's source code.
     * @param governance_ The governor.
     * @param policyManager_ The IPolicyManager contract.
     * @param registry_ The IRegistry contract.
     * @param productValidator_ The product validator of the product.
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
        address productValidator_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        bytes32 typehash_,
        string memory domain_,
        string memory version_
    ) external override returns (address product) {
        product = _deployMinimalProxy(base_);
        CoverageProduct(product).initialize(
            governance_,
            policyManager_,
            registry_,
            productValidator_,
            minPeriod_,
            maxPeriod_,
            typehash_,
            domain_,
            version_
        );
        return product;
    }

    /**
     * @notice Creates and initializes a new product.
     * @param base_ The product's source code.
     * @param salt_ The salt for CREATE2.
     * @param governance_ The governor.
     * @param policyManager_ The IPolicyManager contract.
     * @param registry_ The IRegistry contract.
     * @param productValidator_ The product validator of the product.
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
        address productValidator_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        bytes32 typehash_,
        string memory domain_,
        string memory version_
    ) external override returns (address product) {
        product = _deployMinimalProxy(base_, salt_);
        CoverageProduct(product).initialize(
            governance_,
            policyManager_,
            registry_,
            productValidator_,
            minPeriod_,
            maxPeriod_,
            typehash_,
            domain_,
            version_
        );
        return product;
    }
}