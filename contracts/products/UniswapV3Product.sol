// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "../interface/IUniswapV3Factory.sol";
import "../interface/IUniswapV3Pool.sol";
import "../interface/IUniswapLpToken.sol";
import "../libraries/LiquidityAmounts.sol";
import "../libraries/Path.sol";
import "../libraries/PoolAddress.sol";
import "../libraries/TickMath.sol";
import "../BaseProduct.sol";


contract UniswapV3Product is BaseProduct {
    using Path for bytes;

    address factory;
    address weth;

    /// @notice Given a token, what swap path should it take.
    /// If no path is provided, attempt to intelligently swap.
    mapping(address => bytes) public paths;

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
        address _factory,
        address _weth
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
        factory = _factory;
        weth = _weth;
    }

    /**
     * @notice Sets the swap path for a token.
     * Can only be called by the current governor.
     * @dev Also adds or removes infinite approval of the token for the router.
     * @param _token The token to set the path for.
     * @param _path The path to take.
     */
    function setPath(address _token, bytes calldata _path) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // set path
        paths[_token] = _path;
    }

    // borrowed from uniswap-v3/periphery
    /// @dev Returns the pool for the given token pair and fee. The pool contract may or may not exist.
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) private view returns (IUniswapV3Pool) {
        return IUniswapV3Pool(PoolAddress.computeAddress(factory, PoolAddress.getPoolKey(tokenA, tokenB, fee)));
    }

    /**
     * @notice
     *  Provide the user's total position in the product's protocol.
     *  This total should be denominated in eth.
     * @dev
     *  Every product will have a different mechanism to read and determine
     *  a user's total position in that product's protocol. This method will
     *  only be implemented in the inheriting product contracts
     * @param _policyholder buyer requesting the coverage quote
     * @param _positionContract address of the exact smart contract the buyer has their position in (e.g., for UniswapProduct this would be Pair's address) // NOTE: using the nft manager address
     * @return positionAmount The user's total position in wei in the product's protocol.
     */
    function appraisePosition(address _policyholder, address _positionContract) public view override returns (uint256 positionAmount) {
        IUniswapLpToken lpToken = IUniswapLpToken(_positionContract);
        // for every position the policy holder has
        uint256 numPositions = lpToken.balanceOf(_policyholder);
        for(uint256 positionIndex = 0; positionIndex < numPositions; ++positionIndex) {
            // get the position
            uint256 tokenId = lpToken.tokenOfOwnerByIndex(_policyholder, positionIndex);
            ( , , address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, , , , ) = lpToken.positions(tokenId);
            // get amount of each token in pair
            uint256 amount0;
            uint256 amount1;
            {
            (uint160 sqrtRatioX96, , , , , , ) = getPool(token0, token1, fee).slot0();
            uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
            uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);
            (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(sqrtRatioX96, sqrtRatioAX96, sqrtRatioBX96, liquidity);
            }
            // appraise tokens
            positionAmount += tokenToEth(token0, amount0) + tokenToEth(token1, amount1);
        }
    }

    function tokenToEth(address _token, uint256 _amount) public view returns (uint256 ethAmount) {
        // 1 weth == 1 eth
        if(_token == weth) return _amount;
        // get route
        /*
        bytes memory path = paths[_token];
        // swap using predefined route
        if(path.length > 0) {
            while (true) {
                (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
                (uint160 sqrtRatioX96, , , , , , ) = getPool(tokenIn, tokenOut, fee).slot0();
                //_amount =
                // price math here
                // decide whether to continue or terminate
                if (path.hasMultiplePools()) {
                    path = path.skipToken();
                } else {
                    return _amount;
                }
            }
        }
        // attempt to intelligently swap
        */
        return 0;
    }
}
