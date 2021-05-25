// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import '../interface/IPolicyManager.sol';
import "../BaseProduct.sol";

/**
 * @title MockProduct
 * @author solace.fi
 * @notice Mock product for testing purposes
 */
contract MockProduct is BaseProduct {

   constructor (
        IPolicyManager _policyManager,
        ITreasury _treasury,
        address _coveredPlatform,
        address _claimsAdjuster,
        uint256 _price,
        uint256 _cancelFee,
        uint256 _minPeriod,
        uint256 _maxPeriod,
        uint256 _maxCoverAmount) BaseProduct(
        _policyManager,
        _treasury,
        _coveredPlatform,
        _claimsAdjuster,
        _price,
        _cancelFee,
        _minPeriod,
        _maxPeriod,
        _maxCoverAmount) { }

     /**
     * @notice
     *  Provide the user's total position in the product's protocol.
     *  This total should be denominated in eth.
     * @dev
     *  Every product will have a different mechanism to read and determine
     *  a user's total position in that product's protocol. This method will
     *  only be implemented in the inheriting product contracts
     * @param _buyer buyer requiesting the coverage quote
     * @param _positionContract address of the exact smart contract the buyer has their position in (e.g., for UniswapProduct this would be Pair's address)
     * @return positionAmount The user's total position in wei in the product's protocol.
     */
    function appraisePosition(address _buyer, address _positionContract) public view override virtual returns (uint256 positionAmount) {
      // !TODO need to implment from UniswapFactory
      return 0;
    }
}
