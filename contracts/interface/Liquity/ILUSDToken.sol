// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;


interface ILUSDToken  {
 
    /**
     * @notice Function returns totoal LQTY token supply.
     * @return totalSupply
     */
    function totalSupply() external view returns (uint256);
    
    /**
     * @notice Function returns account's balance.
     * @param account the address of the user.
     * @return balance
     */
    function balanceOf(address account) external view returns (uint256);
}