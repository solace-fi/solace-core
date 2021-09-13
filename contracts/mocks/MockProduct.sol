// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;

import "../products/BaseProduct.sol";

/**
 * @title MockProduct
 * @author solace.fi
 * @notice Mock product for testing purposes.
 */
contract MockProduct is BaseProduct {
    /// @notice The position value for the product.
    uint256 public positionValue = 1000000000000000000;

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
        quoter_,
        "Solace.fi-MockProduct",
        "1"
    ) {
        _SUBMIT_CLAIM_TYPEHASH = keccak256("MockProductExchange(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "Mock";
    }

    /**
     * @notice Calculate the value of a user's position in **ETH**.
     * Every product will have a different mechanism to determine a user's total position in that product's protocol.
     * @dev It should validate that the `positionContract` belongs to the protocol and revert if it doesn't.
     * @param policyholder The owner of the position.
     * @param positionContract The address of the smart contract the `policyholder` has their position in (e.g., for `UniswapV2Product` this would be the Pair's address).
     * @return positionAmount The value of the position.
     */
    // solhint-disable-next-line no-unused-vars
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        return positionValue; // given value for now in production this will be from a pool contract
    }

    /**
     * @notice Sets the **ETH** value of the position.
     * @param value The new position value for the product.
     */
    function setPositionValue(uint256 value) external {
        positionValue = value;
    }

    /**
     * @notice Sets a policy's expiration block.
     * @param policyID The policy ID to set expiration for.
     * @param expirationBlock The new expiration block for the policy.
     */
    function setPolicyExpiration(uint256 policyID, uint40 expirationBlock) external {
        (address policyholder, , address positionContract, uint256 coverAmount, , uint24 purchasePrice) = _policyManager.getPolicyInfo(policyID);
        _policyManager.setPolicyInfo(policyID, policyholder, positionContract, coverAmount, expirationBlock, purchasePrice);
    }

    /**
     * @notice Purchases and mints a policy on the behalf of the policyholder.
     * User will need to pay **ETH**.
     * @param policyholder Holder of the position to cover.
     * @param positionContract The contract address where the policyholder has a position to be covered.
     * @param coverAmount The value to cover in **ETH**. Will only cover up to the appraised value.
     * @param blocks The length (in blocks) for policy.
     * @return policyID The ID of newly created policy.
     */
    function _buyPolicy(address policyholder, address positionContract, uint256 coverAmount, uint40 blocks) external payable nonReentrant returns (uint256 policyID){
        // bypasses some important checks in BaseProduct
        // create the policy
        uint40 expirationBlock = uint40(block.number + blocks);
        policyID = _policyManager.createPolicy(policyholder, positionContract, coverAmount, expirationBlock, _price);

        // update local book-keeping variables
        _activeCoverAmount += positionValue;
        _productPolicyCount++;

        emit PolicyCreated(policyID);

        return policyID;
    }
}
