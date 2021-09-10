// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Waave/IWaRegistry.sol";
import "../interface/Waave/IWaToken.sol";
import "./BaseProduct.sol";

/**
 * @title WaaveProduct
 * @author solace.fi
 * @notice The **WaaveProduct** can be used to purchase coverage for **Waave** positions.
 *
 * Note that the Waave Protocol is exploitable by design. Use this product or the Waave Protocol at your own risk.
 */
contract WaaveProduct is BaseProduct {

    // IWaRegistry.
    IWaRegistry internal _waRegistry;

    /**
      * @notice Constructs the WaaveProduct.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param policyManager_ The [`PolicyManager`](../PolicyManager) contract.
      * @param registry_ The [`Registry`](../Registry) contract.
      * @param waRegistry_ The Waave Registry.
      * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
      * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
      * @param price_ The cover price for the **Product**.
      * @param maxCoverPerUserDivisor_ The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address waRegistry_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        waRegistry_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        "Solace.fi-WaaveProduct",
        "1"
    ) {
        _waRegistry = IWaRegistry(waRegistry_);
        _SUBMIT_CLAIM_TYPEHASH = keccak256("WaaveProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "Waave";
    }

    /**
     * @notice Waave's Registry.
     * @return waRegistry_ The waRegistry.
     */
    function waRegistry() external view returns (address waRegistry_) {
        return address(_waRegistry);
    }

    /**
     * @notice Determines if the byte encoded description of a position(s) is valid.
     * The description will only make sense in context of the product.
     * @dev This function should be overwritten in inheriting Product contracts.
     * If invalid, return false if possible. Reverting is also acceptable.
     * @param positionDescription The description to validate.
     * @return isValid True if is valid.
     */
    function isValidPositionDescription(bytes memory positionDescription) public view virtual override returns (bool isValid) {
        // check length
        // solhint-disable-next-line var-name-mixedcase
        uint256 ADDRESS_SIZE = 20;
        // must be concatenation of one or more addresses
        if(positionDescription.length == 0 || positionDescription.length % ADDRESS_SIZE != 0) return false;
        // check all addresses in list
        for(uint256 offset = 0; offset < positionDescription.length; offset += ADDRESS_SIZE) {
            // get next address
            address positionContract;
            // solhint-disable-next-line no-inline-assembly
            assembly {
                positionContract := div(mload(add(add(positionDescription, 0x20), offset)), 0x1000000000000000000000000)
            }
            // must be a waToken
            if(!_waRegistry.isWaToken(positionContract)) return false;
        }
        return true;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Changes the covered platform.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Use this if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * @param waRegistry_ The new waRegistry.
     */
    function setCoveredPlatform(address waRegistry_) public override {
        super.setCoveredPlatform(waRegistry_);
        _waRegistry = IWaRegistry(waRegistry_);
    }
}
