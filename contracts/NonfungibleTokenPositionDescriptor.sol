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
    uint256 coverAmount;
    address policyholder;
    uint64 expirationBlock;
    address product;
    uint24 price;
    address positionContract;
  }

  function tokenURI(IPolicyManager _policyManager, uint256 _policyID) external view override returns (string memory) {
    (address policyholder, address product, address positionContract, uint256 coverAmount, uint64 expirationBlock, uint24 price) = _policyManager.getPolicyInfo(_policyID);
    TokenURI memory tokenUri = TokenURI({
        policyId: _policyID,
        coverAmount: coverAmount,
        policyholder: policyholder,
        expirationBlock: expirationBlock,
        product: product,
        price: price,
        positionContract: positionContract
    });
    return string(abi.encode(tokenUri));
  }
  
}