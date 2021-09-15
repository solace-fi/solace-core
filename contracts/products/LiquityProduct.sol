// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Liquity/ILQTYStaking.sol";
import "../interface/Liquity/ILQTYToken.sol";
import "../interface/Liquity/ITroveManager.sol";
import "./BaseProduct.sol";

/**
 * @title LiquityProduct
 * @author solace.fi
 * @notice The **LiquityProduct** can be used to purchase coverage for **Liquity** positions.
 */
contract LiquityProduct is BaseProduct {

    // ITroveManager
    ITroveManager internal _troveManager;

    /**
      * @notice Constructs the LiquityProduct.
      * @param governance_ The address of the [governor](/docs/user-docs/Governance).
      * @param policyManager_ The [`PolicyManager`](../PolicyManager) contract.
      * @param registry_ The [`Registry`](../Registry) contract.
      * @param troveManager_ The Liquity trove manager.
      * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
      * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
      * @param price_ The cover price for the **Product**.
      * @param maxCoverPerUserDivisor_ The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address troveManager_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        troveManager_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        "Solace.fi-LiquityProduct",
        "1"
    ) {
        _troveManager = ITroveManager(troveManager_);
        _SUBMIT_CLAIM_TYPEHASH = keccak256("LiquityProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)");
        _productName = "Liquity";
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
        if (positionDescription.length == 0 || positionDescription.length % ADDRESS_SIZE != 0) return false;
        uint256 validPositionCount = 0;
        uint256 length = 0;
        // check all addresses in list
        for (uint256 offset = 0; offset < positionDescription.length; offset += ADDRESS_SIZE) {
            // get next address
            address positionContract;
            assembly {
                positionContract := div(mload(add(add(positionDescription, 0x20), offset)), 0x1000000000000000000000000)
            }
            length += 1;
            // position for trove
            if (positionContract == address(_troveManager)) validPositionCount += 1;
            // position for liquity staking
            if (positionContract == _troveManager.lqtyStaking()) validPositionCount += 1;
            // position for stability pool
            if (positionContract == _troveManager.stabilityPool()) validPositionCount += 1;
        }
        return validPositionCount == length;
    }

    /**
     * @notice Liquity Trove Manager.
     * @return troveManager_ The trove manager address.
     */
    function troveManager() external view returns (address troveManager_) {
        return address(_troveManager);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Changes the covered platform.
     * The function should be used if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param troveManager_ The new Liquity Trove Manager.
     */
    function setCoveredPlatform(address troveManager_) public override {
        super.setCoveredPlatform(troveManager_);
        _troveManager = ITroveManager(troveManager_);
    }
}
