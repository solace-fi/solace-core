// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./interface/INonfungibleTokenPolicyDescriptor.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IProduct.sol";

/**
 * @title NonfungibleTokenPositionDescriptor
 * @author solace.fi
 * @notice Describes NFT token positions
 */
contract NonfungibleTokenPolicyDescriptor is INonfungibleTokenPolicyDescriptor {

  function tokenURI(IPolicyManager _policyManager, uint256 _policyID) external view override returns (string memory) {
    address product = _policyManager.getPolicyProduct(_policyID);
    string memory productName = IProduct(product).name();
    return string(abi.encodePacked("This is a Solace Finance policy that covers a ", productName, " position"));
  }
  
}