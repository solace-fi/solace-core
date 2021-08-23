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
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address coveredPlatform_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        coveredPlatform_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        address(0x0),
        "Solace.fi-MockProduct",
        "1"
    ) {
        _SUBMIT_CLAIM_TYPEHASH = keccak256("MockProductExchange(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "Mock";
    }

    /**
     * @notice It gives the user's total position in the product's protocol.
     * The `positionContract` must be a **cToken** including **cETH** (Please see https://compound.finance/markets and https://etherscan.io/accounts/label/compound).
     * @param policyholder The `buyer` who is requesting the coverage quote.
     * @param positionContract The address of the exact smart contract the `buyer` has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @return positionAmount The user's total position in **Wei** in the product's protocol.
     */
    // solhint-disable-next-line no-unused-vars
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        return positionValue; // given value for now in production this will be from a pool contract
    }

    /**
     * @notice The function sets the user's position value for the product.
     * @param value The new position value for the product.
     */
    function setPositionValue(uint256 value) external {
        positionValue = value;
    }

    /**
     * @notice The function sets the policy's expiration block.
     * @param policyID, The policy ID to set expiration for.
     * @param expirationBlock The new expiration block for the policy.
     */
    function setPolicyExpiration(uint256 policyID, uint40 expirationBlock) external {
        (address policyholder, , address positionContract, uint256 coverAmount, , uint24 purchasePrice) = _policyManager.getPolicyInfo(policyID);
        _policyManager.setPolicyInfo(policyID, policyholder, positionContract, coverAmount, expirationBlock, purchasePrice);
    }

    /**
     * @notice The function purchases and deploys a policy on the behalf of the policyholder. It returns the ID of newly created policy.
     * @param policyholder Who's liquidity is being covered by the policy.
     * @param positionContract The contract address where the policyholder has a position to be covered.
     * @param coverAmount The value to cover in **ETH**.
     * @param blocks The length (in blocks) for policy.
     * @return policyID The policy ID.
     */
    function _buyPolicy(address policyholder, address positionContract, uint256 coverAmount, uint40 blocks) external payable nonReentrant returns (uint256 policyID){
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
