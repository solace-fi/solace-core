// SPDX-License-Identifier: GPL-3.0-or-later
// code borrowed from @uniswap/v3-periphery
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "./IERC721Permit.sol";


/**
 * @title IUniswapLpToken
 * @author solace.fi
 * @notice Interface for Uniswap V3 LP tokens.
 */
interface IUniswapLpToken is IERC721Enumerable, IERC721Permit {

    /**
     * @notice Returns the position information associated with a given token ID.
     * @param tokenID The ID of the token that represents the position
     * @dev Throws if the token ID is not valid.
     */
    function positions(uint256 tokenID) external view returns (
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

    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    /// @notice Creates a new position wrapped in a NFT
    /// @dev Call this when the pool does exist and is initialized. Note that if the pool is created but not initialized
    /// a method does not exist, i.e. the pool is assumed to be initialized.
    /// @param params The params necessary to mint a position, encoded as `MintParams` in calldata
    /// @return tokenID The ID of the token that represents the minted position
    /// @return liquidity The amount of liquidity for this position
    /// @return amount0 The amount of token0
    /// @return amount1 The amount of token1
    function mint(MintParams calldata params)
        external
        payable
        returns (
            uint256 tokenID,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );
}
