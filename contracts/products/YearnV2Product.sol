// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Yearn/IYRegistry.sol";
import "../interface/Yearn/IYVault.sol";
import "./BaseProduct.sol";

/**
 * @title YearnV2Product
 * @author solace.fi
 * @notice The **YearnV2Product** can be used to purchase coverage for **YearnV2** positions.
 */
contract YearnV2Product is BaseProduct {

    // IYRegistry.
    IYRegistry internal _yregistry;

    /**
      * @notice Constructs the YearnV2Product.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param policyManager_ The [`PolicyManager`](../PolicyManager) contract.
      * @param registry_ The [`Registry`](../Registry) contract.
      * @param yregistry_ The Yearn YRegistry.
      * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
      * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
      * @param price_ The cover price for the **Product**.
      * @param maxCoverPerUserDivisor_ The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address yregistry_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        yregistry_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        "Solace.fi-YearnV2Product",
        "1"
    ) {
        _yregistry = IYRegistry(yregistry_);
        _SUBMIT_CLAIM_TYPEHASH = keccak256("YearnV2ProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "YearnV2";
    }

    /**
     * @notice Yearn's YRegistry.
     * @return yregistry_ The YRegistry.
     */
    function yregistry() external view returns (address yregistry_) {
        return address(_yregistry);
    }

    /**
     * @notice Determines if the byte encoded description of a position(s) is valid.
     * The description will only make sense in context of the product.
     * @dev This function should be overwritten in inheriting Product contracts.
     * @param positionDescription The description to validate.
     * @return isValid True if is valid.
     */
    function isValidPositionDescription(bytes memory positionDescription) public view virtual override returns (bool isValid) {
        // check length
        uint256 ADDRESS_SIZE = 20;
        // must be concatenation of one or more addresses
        if(positionDescription.length == 0 || positionDescription.length % ADDRESS_SIZE != 0) return false;
        // check all addresses in list
        for(uint256 offset = 0; offset < positionDescription.length; offset += ADDRESS_SIZE) {
            // get next address
            address positionContract;
            assembly {
                positionContract := div(mload(add(add(positionDescription, 0x20), offset)), 0x1000000000000000000000000)
            }
            // must be a yVault
            ( , address token, , , ) = _yregistry.getVaultInfo(positionContract);
            if(token == address(0x0)) return false;
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
     * @param yregistry_ The new YRegistry.
     */
    function setCoveredPlatform(address yregistry_) public override {
        super.setCoveredPlatform(yregistry_);
        _yregistry = IYRegistry(yregistry_);
    }
}
