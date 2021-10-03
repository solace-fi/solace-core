// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface ICurveToken is IERC20 {

     /**
      * @notice Mints token for the user.
      * @param to The user address.
      * @param value The amount token.
      * @return true Returns true.
      */
      function mint(address to, uint256 value) external view returns (bool);
}
