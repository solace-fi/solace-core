// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;

import "../products/CoverageProduct.sol";

/**
 * @title MockProduct
 * @author solace.fi
 * @notice Mock product for testing purposes.
 */
contract MockProductV2 is CoverageProduct {

    uint24 private _price;

    function setPrice(uint24 price_) external {
        _price = price_;
    }

    /**
     * @notice Sets a policy's expiration block.
     * @param policyID The policy ID to set expiration for.
     * @param expirationBlock The new expiration block for the policy.
     */
    function setPolicyExpiration(uint256 policyID, uint40 expirationBlock) external {
        ( , , uint256 coverAmount, , uint24 purchasePrice, bytes memory positionDescription, address riskStrategy) = _policyManager.getPolicyInfo(policyID);
        _policyManager.setPolicyInfo(policyID, coverAmount, expirationBlock, purchasePrice, positionDescription, riskStrategy);
    }

    /**
     * @notice Purchases and mints a policy on the behalf of the policyholder.
     * User will need to pay **ETH**.
     * @param policyholder Holder of the position to cover.
     * @param coverAmount The value to cover in **ETH**. Will only cover up to the appraised value.
     * @param blocks The length (in blocks) for policy.
     * @param positionDescription The byte encoded description of the covered position(s).
     * @param riskStrategy The risk strategy of the covered product.
     * @return policyID The ID of newly created policy.
     */
    function _buyPolicy(address policyholder, uint256 coverAmount, uint40 blocks, bytes calldata positionDescription, address riskStrategy) external payable nonReentrant returns (uint256 policyID) {
        // bypasses some important checks in BaseProduct
        // create the policy
        uint40 expirationBlock = uint40(block.number + blocks);
        policyID = _policyManager.createPolicy(policyholder, coverAmount, expirationBlock, _price, positionDescription, riskStrategy);

        // update local book-keeping variables
        _activeCoverAmount += coverAmount;

        emit PolicyCreated(policyID);

        return policyID;
    }
}
