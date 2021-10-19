// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;


interface INonfungiblePositionManager  {

  // The code is borrowed from https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/INonfungiblePositionManager.sol
  /// @notice Returns the position information associated with a given token ID.
  /// @dev Throws if the token ID is not valid.
  /// @param tokenId The ID of the token that represents the position
  /// @return nonce The nonce for permits
  /// @return operator The address that is approved for spending
  /// @return token0 The address of the token0 for a specific pool
  /// @return token1 The address of the token1 for a specific pool
  /// @return fee The fee associated with the pool
  /// @return tickLower The lower end of the tick range for the position
  /// @return tickUpper The higher end of the tick range for the position
  /// @return liquidity The liquidity of the position
  /// @return feeGrowthInside0LastX128 The fee growth of token0 as of the last action on the individual position
  /// @return feeGrowthInside1LastX128 The fee growth of token1 as of the last action on the individual position
  /// @return tokensOwed0 The uncollected amount of token0 owed to the position as of the last computation
  /// @return tokensOwed1 The uncollected amount of token1 owed to the position as of the last computation
  function positions(uint256 tokenId)
      external
      view
      returns (
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

  /**
   * @notice Returns token id for given token index.
   * @param tokenIndex The token index.
   * @return tokenId The token id.
   */
  function tokenByIndex(uint256 tokenIndex) external view returns (uint256 tokenId);

  /**
   * @notice Returns token id for given `owner` and `token index`.
   * @param owner The owner address.
   * @param index The token index.
   * @return tokenId The token id.
   */
  function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256 tokenId);

  /**
   * @notice Returns total token supply.
   * @return totalSupply The total supply.
   */
  function totalSupply() external view returns (uint256 totalSupply);

  /**
   * @notice Returns account's balance.
   * @param account The address of the user.
   * @return balance The amount tokens user have.
   */
  function balanceOf(address account) external view returns (uint256 balance);


  /**
   * @notice Returns owner of the token id.
   * @param tokenId The token id of the position.
   * @return owner The owner of the token.  
   */
  function ownerOf(uint256 tokenId) external view returns (address owner);

  /**
   * @notice Returns the symbol of the token.
   * @return symbol The token symbol.
   */
   function symbol() external view returns (string memory symbol);
 
   /**
    * @notice Returns the name of the token.
    * @return name The token name.
    */
   function name() external view returns (string memory name);
}