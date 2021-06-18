// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "../interface/IExchangeQuoter.sol";
import "../BaseProduct.sol";


interface IAaveProtocolDataProvider {
    function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress);
}

interface IAToken {
    function balanceOf(address owner) external view returns (uint256);
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}

contract AaveV2Product is BaseProduct {

    IAaveProtocolDataProvider public provider;
    IExchangeQuoter public quoter;

    constructor (
        IPolicyManager _policyManager,
        ITreasury _treasury,
        address _coveredPlatform,
        address _claimsAdjuster,
        uint256 _price,
        uint256 _cancelFee,
        uint256 _minPeriod,
        uint256 _maxPeriod,
        uint256 _maxCoverAmount,
        address _quoter
    ) BaseProduct(
        _policyManager,
        _treasury,
        _coveredPlatform,
        _claimsAdjuster,
        _price,
        _cancelFee,
        _minPeriod,
        _maxPeriod,
        _maxCoverAmount
    ) {
        provider = IAaveProtocolDataProvider(_coveredPlatform);
        quoter = IExchangeQuoter(_quoter);
    }

    /**
     * @notice Sets a new ExchangeQuoter.
     * Can only be called by the current governor.
     * @param _quoter The new quoter address.
     */
    function setExchangeQuoter(address _quoter) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        quoter = IExchangeQuoter(_quoter);
    }

    // _positionContract must be an aToken
    // see https://etherscan.io/tokens/label/aave-v2
    function appraisePosition(address _policyholder, address _positionContract) public view override returns (uint256 positionAmount) {
        // verify _positionContract
        IAToken token = IAToken(_positionContract);
        address underlying = token.UNDERLYING_ASSET_ADDRESS();
        ( address aTokenAddress, , ) = provider.getReserveTokensAddresses(underlying);
        require(_positionContract == aTokenAddress, "Invalid position contract");
        // swap math
        uint256 balance = token.balanceOf(_policyholder);
        return quoter.tokenToEth(underlying, balance);
    }
}
