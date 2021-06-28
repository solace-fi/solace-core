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
        _price
    ) {
        yregistry = IYRegistry(_coveredPlatform);
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

    // _positionContract must be a vault
    function appraisePosition(address _policyholder, address _positionContract) public view override returns (uint256 positionAmount) {
        ( , address token, , , ) = yregistry.getVaultInfo(_positionContract);
        require(token != address(0x0), "Invalid position contract");
        IYVault vault = IYVault(_positionContract);
        uint256 balance = vault.balanceOf(_policyholder) * vault.getPricePerFullShare() / 1e18;
        return quoter.tokenToEth(token, balance);
    }
}
