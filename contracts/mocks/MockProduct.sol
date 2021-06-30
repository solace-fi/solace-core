// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import "../products/BaseProduct.sol";

/**
 * @title MockProduct
 * @author solace.fi
 * @notice Mock product for testing purposes
 */
contract MockProduct is BaseProduct {

    uint256 public positionValue = 1000000000000000000;

    constructor (
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint256 _maxCoverAmount,
        uint256 _maxCoverPerUser,
        uint64 _minPeriod,
        uint64 _maxPeriod,
        uint64 _cancelFee,
        uint24 _price,
        address _quoter
    ) BaseProduct(
        _policyManager,
        _registry,
        _coveredPlatform,
        _maxCoverAmount,
        _maxCoverPerUser,
        _minPeriod,
        _maxPeriod,
        _cancelFee,
        _price,
        _quoter
    ) { }

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
    function appraisePosition(address _buyer, address _positionContract) public view override returns (uint256 positionAmount) {
        return positionValue; // given value for now in production this will be from a pool contract
    }

    function setPositionValue(uint256 _value) external {
        positionValue = _value;
    }

    function setPolicyExpiration(uint256 _policyID, uint64 _expirationBlock) external {
        (address policyholder, address product, address positionContract, uint256 coverAmount, uint64 expirationBlock, uint24 price) = policyManager.getPolicyInfo(_policyID);
        policyManager.setPolicyInfo(_policyID, policyholder, positionContract, coverAmount, _expirationBlock, price);
    }

    function getTotalCovered() external view returns (uint256 coveredAmount) {
        return activeCoverAmount;
    }
}
