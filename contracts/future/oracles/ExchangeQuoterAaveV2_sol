// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/AaveV2/IAaveProtocolDataProvider.sol";
import "../interface/AaveV2/ILendingPoolAddressesProvider.sol";
import "../interface/AaveV2/IAavePriceOracle.sol";

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interface/IExchangeQuoter.sol";

/**
 * @title ExchangeQuoterAaveV2
 * @author solace.fi
 * @notice Calculates exchange rates for trades between ERC20 tokens and Ether. This version uses the Aave Price Oracle.
 */
contract ExchangeQuoterAaveV2 is IExchangeQuoter {
    /// @notice IAaveProtocolDataProvider.
    IAaveProtocolDataProvider public aaveDataProvider;
    // ETH_ADDRESS
    // solhint-disable-next-line var-name-mixedcase
    address internal _ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /**
     * @notice Constructs the ExchangeQuoterAaveV2 contract.
     * @param dataProvider_ Aave protocol data provider address.
     */
    constructor(address dataProvider_) {
        aaveDataProvider = IAaveProtocolDataProvider(dataProvider_);
    }

    /**
     * @notice Calculates the exchange rate for an `amount` of `token` to **ETH**.
     * @param token The token to give.
     * @param amount The amount to give.
     * @return amountOut The amount of **ETH** received.
     */
    function tokenToEth(address token, uint256 amount) public view override returns (uint256 amountOut) {
        if(token == _ETH_ADDRESS) return amount;
        // get price oracle
        ILendingPoolAddressesProvider addressProvider = ILendingPoolAddressesProvider(aaveDataProvider.ADDRESSES_PROVIDER());
        IAavePriceOracle oracle = IAavePriceOracle(addressProvider.getPriceOracle());
        // swap math
        uint256 price = oracle.getAssetPrice(token);
        uint8 decimals = IERC20Metadata(token).decimals();
        return amount * price / 10**decimals;
    }
}
