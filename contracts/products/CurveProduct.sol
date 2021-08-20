// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interface/IExchangeQuoter.sol";
import "./BaseProduct.sol";


interface ICurveAddressProvider {
    // solhint-disable-next-line func-name-mixedcase
    function get_registry() external view returns (address);
}

interface ICurveRegistry {
    // solhint-disable-next-line func-name-mixedcase
    function get_pool_from_lp_token(address token) external view returns (address pool);
    // solhint-disable-next-line func-name-mixedcase
    function get_lp_token(address pool) external view returns (address token);
    // solhint-disable-next-line func-name-mixedcase, var-name-mixedcase
    function get_n_coins(address pool) external view returns (uint256 n_coins);
}

interface ICurvePool {
    function coins(uint256 arg0) external view returns (address);
    // solhint-disable-next-line func-name-mixedcase, var-name-mixedcase
    function calc_withdraw_one_coin(uint256 token_amount, int128 i) external view returns (uint256);
}

/**
 * @title  CurveProduct
 * @author solace.fi
 * @notice The **Curve** product that is users can buy policy for **Curve**. It is a concrete smart contract that inherits from abstract [`BaseProduct`](./BaseProduct).
 */
contract CurveProduct is BaseProduct {

    ICurveAddressProvider public addressProvider;
    /// @notice IExchangeQuoter.
    IExchangeQuoter public quoter;

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
        maxCoverPerUserDivisor_
    ) {
        addressProvider = ICurveAddressProvider(coveredPlatform_);
        quoter = IExchangeQuoter(quoter_);
    }

    /**
     * @notice It gives the user's total position in the product's protocol.
     * The `positionContract` must be a **curve.fi pool** or **token**.
     * @param policyholder The `buyer` who is requesting the coverage quote (Please see https://curve.fi/pools).
     * @param positionContract The address of the exact smart contract the `buyer` has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @return positionAmount The user's total position in **Wei** in the product's protocol.
     */
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        (IERC20 lpToken, ICurvePool pool) = verifyPool(positionContract);
        uint256 lpBalance = lpToken.balanceOf(policyholder);
        if(lpBalance == 0) return 0;
        // route lp token => coin at index 0 => eth
        address coin = pool.coins(0);
        uint256 balance = pool.calc_withdraw_one_coin(lpBalance, 0);
        return quoter.tokenToEth(coin, balance);
    }

    /**
     * @notice Changes the covered platform.
     * The function is used for if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param coveredPlatform_ The platform to cover.
     */
    function setCoveredPlatform(address coveredPlatform_) public override {
        super.setCoveredPlatform(coveredPlatform_);
        addressProvider = ICurveAddressProvider(coveredPlatform_);
    }

    /**
     * @notice Given the address of either the pool or the token, returns the token and the pool.
     * Throws if not a valid pool or token.
     * @param poolOrToken Address of either the pool or lp token.
     * @return The token and the pool.
     */
    function verifyPool(address poolOrToken) internal view returns (IERC20, ICurvePool) {
        ICurveRegistry curveRegistry = ICurveRegistry(addressProvider.get_registry());
        address pool = curveRegistry.get_pool_from_lp_token(poolOrToken);
        if(pool != address(0x0)) return (IERC20(poolOrToken), ICurvePool(pool));
        address token = curveRegistry.get_lp_token(poolOrToken);
        if(token != address(0x0)) return (IERC20(token), ICurvePool(poolOrToken));
        revert("Not a valid pool or token.");
    }

    /**
     * @notice Returns the name of the product.
     * @return Curve The name of the product.
     */
    function name() public pure override returns (string memory) {
        return "Curve";
    }
}
