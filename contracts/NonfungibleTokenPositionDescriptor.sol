// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./interface/INonfungibleTokenPositionDescriptor.sol";
import "./interface/IPolicyManager.sol";

/**
 * @title NonfungibleTokenPositionDescriptor
 * @author solace.fi
 * @notice Describes NFT token positions
 */
contract NonfungibleTokenPositionDescriptor is INonfungibleTokenPositionDescriptor {

  struct TokenURI {
    uint256 policyId;
    address product;
    address positionContract;
  }

  function tokenURI(IPolicyManager _policyManager, uint256 _policyID) external view override returns (string memory) {
    (, address product, address positionContract, , , ) = _policyManager.getPolicyInfo(_policyID);
    TokenURI memory tokenUri = TokenURI({policyId: _policyID, product: product, positionContract: positionContract});
    return string(abi.encode(tokenUri));
  }
  
}