// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Yearn/IYRegistry.sol";
import "../interface/Yearn/IYVault.sol";
import "../interface/IExchangeQuoter.sol";
import "./BaseProduct.sol";

/**
 * @title YearnV2Product
 * @author solace.fi
 * @notice The **Yearn(V2)** product that is users can buy policy for **Yearn(V2)**. It is a concrete smart contract that inherits from abstract [`BaseProduct`](./BaseProduct).
 */
contract YearnV2Product is BaseProduct {

    // IYRegistry.
    IYRegistry internal _yregistry;

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
        "Solace.fi-YearnV2Product",
        "1"
    ) {
        _yregistry = IYRegistry(coveredPlatform_);
        _SUBMIT_CLAIM_TYPEHASH = keccak256("YearnV2ProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "YearnV2";
    }

    /**
     * @notice It gives the user's total position in the product's protocol.
     * The `positionContract` must be a **vault**.
     * @param policyholder The `buyer` who is requesting the coverage quote.
     * @param positionContract The address of the exact smart contract the `buyer` has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @return positionAmount The user's total position in **Wei** in the product's protocol.
     */
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        ( , address token, , , ) = _yregistry.getVaultInfo(positionContract);
        require(token != address(0x0), "Invalid position contract");
        IYVault vault = IYVault(positionContract);
        uint256 balance = vault.balanceOf(policyholder) * vault.getPricePerFullShare() / 1e18;
        return _quoter.tokenToEth(token, balance);
    }

    function yregistry() external view returns (address yregistry_) {
        return address(_yregistry);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Changes the covered platform.
     * The function should be used if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param yregistry_ The platform to cover.
     */
    function setCoveredPlatform(address yregistry_) public override {
        super.setCoveredPlatform(yregistry_);
        _yregistry = IYRegistry(yregistry_);
    }
}
