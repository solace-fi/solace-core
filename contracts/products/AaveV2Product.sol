// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./BaseProduct.sol";


interface IAaveProtocolDataProvider {
    function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress);
}

interface IAToken {
    function balanceOf(address owner) external view returns (uint256);
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}

contract AaveV2Product is BaseProduct {

    IAaveProtocolDataProvider public aaveDataProvider;

    constructor (
        address _governance,
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
        _governance,
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
    ) {
        aaveDataProvider = IAaveProtocolDataProvider(_coveredPlatform);
    }

    // _positionContract must be an aToken
    // see https://etherscan.io/tokens/label/aave-v2
    function appraisePosition(address _policyholder, address _positionContract) public view override returns (uint256 positionAmount) {
        // verify _positionContract
        IAToken token = IAToken(_positionContract);
        address underlying = token.UNDERLYING_ASSET_ADDRESS();
        ( address aTokenAddress, , ) = aaveDataProvider.getReserveTokensAddresses(underlying);
        require(_positionContract == aTokenAddress, "Invalid position contract");
        // swap math
        uint256 balance = token.balanceOf(_policyholder);
        return quoter.tokenToEth(underlying, balance);
    }

    /**
     * @notice Changes the covered platform.
     * Use this if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current governor.
     * @param _coveredPlatform The platform to cover.
     */
    function setCoveredPlatform(address _coveredPlatform) public override {
        super.setCoveredPlatform(_coveredPlatform);
        aaveDataProvider = IAaveProtocolDataProvider(_coveredPlatform);
    }
}
