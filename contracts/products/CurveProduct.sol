// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interface/IExchangeQuoter.sol";
import "../BaseProduct.sol";


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
    IExchangeQuoter public quoter;

    constructor (
        IPolicyManager _policyManager,
        ITreasury _treasury,
        address _coveredPlatform,
        address _claimsAdjuster,
        uint256 _price,
        uint256 _cancelFee,
        uint256 _minPeriod,
        uint256 _maxPeriod,
        uint256 _maxCoverAmount,
        address _quoter
    ) BaseProduct(
        _policyManager,
        _treasury,
        _coveredPlatform,
        _claimsAdjuster,
        _price,
        _cancelFee,
        _minPeriod,
        _maxPeriod,
        _maxCoverAmount
    ) {
        addressProvider = ICurveAddressProvider(_coveredPlatform);
        quoter = IExchangeQuoter(_quoter);
    }

    /**
     * @notice Sets a new ExchangeQuoter.
     * Can only be called by the current governor.
     * @param _quoter The new quoter address.
     */
    function setExchangeQuoter(address _quoter) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        quoter = IExchangeQuoter(_quoter);
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
