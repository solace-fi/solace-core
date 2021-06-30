// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./BaseProduct.sol";


interface ICurveAddressProvider {
    function get_registry() external view returns (address);
}

interface ICurveRegistry {
    function get_pool_from_lp_token(address token) external view returns (address pool);
    function get_lp_token(address pool) external view returns (address token);
    function get_n_coins(address pool) external view returns (uint256 n_coins);
}

interface ICurvePool {
    function coins(uint256 arg0) external view returns (address);
    function calc_withdraw_one_coin(uint256 token_amount, int128 i) external view returns (uint256);
}

contract CurveProduct is BaseProduct {

    ICurveAddressProvider public addressProvider;

    constructor (
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint256 _maxCoverAmount,
        uint256 _maxCoverPerUser,
        uint64 _minPeriod,
        uint64 _maxPeriod,
        uint64 _cancelFee,
        uint24 _price,
        address _quoter
    ) BaseProduct(
        _policyManager,
        _registry,
        _coveredPlatform,
        _maxCoverAmount,
        _maxCoverPerUser,
        _minPeriod,
        _maxPeriod,
        _cancelFee,
        _price,
        _quoter
    ) {
        addressProvider = ICurveAddressProvider(_coveredPlatform);
    }

    // _positionContract must be a curve.fi pool or token
    // see https://curve.fi/pools
    function appraisePosition(address _policyholder, address _positionContract) public view override returns (uint256 positionAmount) {
        (IERC20 lpToken, ICurvePool pool) = verifyPool(_positionContract);
        uint256 lpBalance = lpToken.balanceOf(_policyholder);
        if(lpBalance == 0) return 0;
        // route lp token => coin at index 0 => eth
        address coin = pool.coins(0);
        uint256 balance = pool.calc_withdraw_one_coin(lpBalance, 0);
        return quoter.tokenToEth(coin, balance);
    }

    /**
     * @notice Given the address of either the pool or the token, returns the token and the pool.
     * Throws if not a valid pool or token.
     * @param _poolOrToken Address of either the pool or lp token.
     * @return The token and the pool.
     */
    function verifyPool(address _poolOrToken) internal view returns (IERC20, ICurvePool) {
        ICurveRegistry curveRegistry = ICurveRegistry(addressProvider.get_registry());
        address pool = curveRegistry.get_pool_from_lp_token(_poolOrToken);
        if(pool != address(0x0)) return (IERC20(_poolOrToken), ICurvePool(pool));
        address token = curveRegistry.get_lp_token(_poolOrToken);
        if(token != address(0x0)) return (IERC20(token), ICurvePool(_poolOrToken));
        revert("Not a valid pool or token.");
    }
}
