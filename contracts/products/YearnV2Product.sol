// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "../interface/IExchangeQuoter.sol";
import "./BaseProduct.sol";


interface IYRegistry {
    function getVaultInfo(address _vault) external view returns (
        address controller,
        address token,
        address strategy,
        bool isWrapped,
        bool isDelegated
    );
}

interface IYVault {
    function token() external view returns (address);
    function balanceOf(address user) external view returns (uint256);
    function getPricePerFullShare() external view returns (uint256);
}

contract YearnV2Product is BaseProduct {

    IYRegistry public yregistry;
    IExchangeQuoter public quoter;

    constructor (
        address _governance,
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint64 _minPeriod,
        uint64 _maxPeriod,
        uint24 _price,
        uint32 _maxCoverPerUserDivisor,
        address _quoter
    ) BaseProduct(
        _governance,
        _policyManager,
        _registry,
        _coveredPlatform,
        _minPeriod,
        _maxPeriod,
        _price,
        _maxCoverPerUserDivisor
    ) {
        yregistry = IYRegistry(_coveredPlatform);
        quoter = IExchangeQuoter(_quoter);
    }

    // _positionContract must be a vault
    function appraisePosition(address _policyholder, address _positionContract) public view override returns (uint256 positionAmount) {
        ( , address token, , , ) = yregistry.getVaultInfo(_positionContract);
        require(token != address(0x0), "Invalid position contract");
        IYVault vault = IYVault(_positionContract);
        uint256 balance = vault.balanceOf(_policyholder) * vault.getPricePerFullShare() / 1e18;
        return quoter.tokenToEth(token, balance);
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
        yregistry = IYRegistry(_coveredPlatform);
    }
}
