// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Curve/ICurveAddressProvider.sol";
import "../interface/Curve/ICurveRegistry.sol";
import "../interface/Curve/ICurvePool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interface/IExchangeQuoter.sol";
import "./BaseProduct.sol";


/**
 * @title  CurveProduct
 * @author solace.fi
 * @notice The **Curve** product that is users can buy policy for **Curve**. It is a concrete smart contract that inherits from abstract [`BaseProduct`](./BaseProduct).
 */
contract CurveProduct is BaseProduct {

    ICurveAddressProvider internal _addressProvider;

    /**
      * @notice Constructs the CurveProduct.
      * @param governance_ The address of the [governor](/docs/user-docs/Governance).
      * @param policyManager_ The [`PolicyManager`](../PolicyManager) contract.
      * @param registry_ The [`Registry`](../Registry) contract.
      * @param addressProvider_ The Curve Address Provider.
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
        address addressProvider_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_,
        address quoter_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        addressProvider_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        quoter_,
        "Solace.fi-CurveProduct",
        "1"
    ) {
        _addressProvider = ICurveAddressProvider(addressProvider_);
        _SUBMIT_CLAIM_TYPEHASH = keccak256("CurveProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "Curve";
    }

    /**
     * @notice Calculate the value of a user's position in **ETH**.
     * The `positionContract` must be a [**curve.fi lp token**](https://curve.fi/pools).
     * @param policyholder The owner of the position.
     * @param positionContract The address of the **lp token**.
     * @return positionAmount The value of the position.
     */
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        (IERC20 lpToken, ICurvePool pool) = verifyPool(positionContract);
        uint256 lpBalance = lpToken.balanceOf(policyholder);
        if(lpBalance == 0) return 0;
        // route lp token => coin at index 0 => eth
        address coin = pool.coins(0);
        uint256 balance = pool.calc_withdraw_one_coin(lpBalance, 0);
        return _quoter.tokenToEth(coin, balance);
    }

    /**
     * @notice Curve's Address Provider.
     * @return addressProvider_ The address provider.
     */
    function addressProvider() external view returns (address addressProvider_) {
        return address(_addressProvider);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Changes the covered platform.
     * The function should be used if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param addressProvider_ The new Address Provider.
     */
    function setCoveredPlatform(address addressProvider_) public override {
        super.setCoveredPlatform(addressProvider_);
        _addressProvider = ICurveAddressProvider(addressProvider_);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Given the address of either the pool or the token, returns the token and the pool.
     * Throws if not a valid pool or token.
     * @param poolOrToken Address of either the pool or lp token.
     * @return The token and the pool.
     */
    function verifyPool(address poolOrToken) internal view returns (IERC20, ICurvePool) {
        ICurveRegistry curveRegistry = ICurveRegistry(_addressProvider.get_registry());
        address pool = curveRegistry.get_pool_from_lp_token(poolOrToken);
        if(pool != address(0x0)) return (IERC20(poolOrToken), ICurvePool(pool));
        address token = curveRegistry.get_lp_token(poolOrToken);
        if(token != address(0x0)) return (IERC20(token), ICurvePool(poolOrToken));
        revert("Not a valid pool or token.");
    }
}
