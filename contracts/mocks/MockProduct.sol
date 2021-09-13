// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;

import "../products/BaseProduct.sol";

/**
 * @title MockProduct
 * @author solace.fi
 * @notice Mock product for testing purposes.
 */
contract MockProduct is BaseProduct {

    /**
      * @notice The constructor.
      * @param governance_ The governor.
      * @param policyManager_ The IPolicyManager contract.
      * @param registry_ The IRegistry contract.
      * @param coveredPlatform_ A platform contract which locates contracts that are covered by this product.
      * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
      * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
      * @param price_ The cover price for the **Product**.
      * @param maxCoverPerUserDivisor_ The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
      * @param quoter_ The exchange quoter address.
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address coveredPlatform_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_,
        address quoter_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        coveredPlatform_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        "Solace.fi-MockProduct",
        "1"
    ) {
        _SUBMIT_CLAIM_TYPEHASH = keccak256("MockProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "Mock";
    }

    /**
     * @notice Sets a policy's expiration block.
     * @param policyID The policy ID to set expiration for.
     * @param expirationBlock The new expiration block for the policy.
     */
    function setPolicyExpiration(uint256 policyID, uint40 expirationBlock) external {
        ( , , uint256 coverAmount, , uint24 purchasePrice, bytes memory positionDescription) = _policyManager.getPolicyInfo(policyID);
        _policyManager.setPolicyInfo(policyID, coverAmount, expirationBlock, purchasePrice, positionDescription);
    }

    /**
     * @notice Purchases and mints a policy on the behalf of the policyholder.
     * User will need to pay **ETH**.
     * @param policyholder Holder of the position to cover.
     * @param positionDescription The byte encoded description of the covered position(s).
     * @param coverAmount The value to cover in **ETH**. Will only cover up to the appraised value.
     * @param blocks The length (in blocks) for policy.
     * @return policyID The ID of newly created policy.
     */
    function _buyPolicy(address policyholder, bytes calldata positionDescription, uint256 coverAmount, uint40 blocks) external payable nonReentrant returns (uint256 policyID) {
        // bypasses some important checks in BaseProduct
        // create the policy
        uint40 expirationBlock = uint40(block.number + blocks);
        policyID = _policyManager.createPolicy(policyholder, coverAmount, expirationBlock, _price, positionDescription);

        // update local book-keeping variables
        _activeCoverAmount += coverAmount;

        emit PolicyCreated(policyID);

        return policyID;
    }

    /**
     * @notice Determines if the byte encoded description of a position(s) is valid.
     * The description will only make sense in context of the product.
     * @dev This function should be overwritten in inheriting Product contracts.
     * @param positionDescription The description to validate.
     * @return isValid True if is valid.
     */
    // solhint-disable-next-line no-unused-vars
    function isValidPositionDescription(bytes memory positionDescription) public view virtual override returns (bool isValid) {
        return positionDescription.length >= 0; // always true
    }
}
