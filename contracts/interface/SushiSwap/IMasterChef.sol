// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface IMasterChef {

  /**
   * @notice Returns `LP Pool` length.
   * @return pools The number of pools.
   */
   function poolLength() external view returns (uint256 pools);

  /**
   * @notice Returns `SushiSwap LP Pool` info.
   * @param index The index of the lp pool.
   * @return lpToken The `Sushi LP Token` address.
   * @return allocPoint 
   * @return lastRewardBlock
   * @return accSushiPerShare
   */
  function poolInfo(uint256 index) external view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accSushiPerShare);
}