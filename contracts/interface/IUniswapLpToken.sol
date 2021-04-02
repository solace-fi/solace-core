// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";


/**
 * @title IUniswapLpToken
 * @author solace.fi
 * @notice Interface for Uniswap V3 LP tokens.
 */
interface IUniswapLpToken is IERC721Enumerable {

    /**
     * @notice Returns the position information associated with a given token ID.
     * @param tokenId The ID of the token that represents the position
     * @dev Throws if the token ID is not valid.
     */
    function positions(uint256 tokenId) external view returns (
        uint96 nonce,
        address operator,
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    );
}
