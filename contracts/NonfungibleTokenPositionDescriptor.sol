// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Strings.sol";
import "./interface/INonfungibleTokenPositionDescriptor.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IProduct.sol";

/**
 * @title NonfungibleTokenPositionDescriptor
 * @author solace.fi
 * @notice Describes NFT token positions
 */
contract NonfungibleTokenPositionDescriptor is INonfungibleTokenPositionDescriptor {
  using Strings for uint256;

  function tokenURI(IPolicyManager _policyManager, uint256 _policyID) external view override returns (string memory) {
    address product = _policyManager.getPolicyProduct(_policyID);
    string memory productName = IProduct(product).name();
    return string(abi.encodePacked("This is solace.fi policy with policy id ", _policyID.toString(), " for product ", productName));
  }
  
}