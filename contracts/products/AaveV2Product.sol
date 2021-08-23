// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/AaveV2/IAaveProtocolDataProvider.sol";
import "../interface/AaveV2/IAToken.sol";
import "./BaseProduct.sol";

/**
 * @title AaveV2Product
 * @author solace.fi
 * @notice The **Aave(V2)** product that is users can buy policy for **Aave(V2)**. It is a concrete smart contract that inherits from abstract [`BaseProduct`](./BaseProduct).
 */
contract AaveV2Product is BaseProduct {

    // IAaveProtocolDataProvider.
    IAaveProtocolDataProvider internal _aaveDataProvider;

    /**
      * @notice Constructs the AaveV2Product.
      * @param governance_ The address of the [governor](/docs/user-docs/Governance).
      * @param policyManager_ The [`PolicyManager`](../PolicyManager) contract.
      * @param registry_ The [`Registry`](../Registry) contract.
      * @param dataProvider_ Aave protocol data provider address.
      * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
      * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
      * @param price_ The cover price for the **Product**.
      * @param maxCoverPerUserDivisor_ The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
      * @param quoter_ The exchange quoter address.
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address dataProvider_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_,
        address quoter_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        dataProvider_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        quoter_,
        "Solace.fi-AaveV2Product",
        "1"
    ) {
        _aaveDataProvider = IAaveProtocolDataProvider(dataProvider_);
        _SUBMIT_CLAIM_TYPEHASH = keccak256("AaveV2ProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "AaveV2";
    }
    /**
     * @notice Calculate the value of a user's Aave V2 position in **ETH**.
     * The `positionContract` must be an [**aToken**](https://etherscan.io/tokens/label/aave-v2).
     * @param policyholder The owner of the position.
     * @param positionContract The address of the **aToken**.
     * @return positionAmount The value of the position.
     */
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        // verify positionContract
        IAToken token = IAToken(positionContract);
        address underlying = token.UNDERLYING_ASSET_ADDRESS();
        ( address aTokenAddress, , ) = _aaveDataProvider.getReserveTokensAddresses(underlying);
        require(positionContract == aTokenAddress, "Invalid position contract");
        // swap math
        uint256 balance = token.balanceOf(policyholder);
        return _quoter.tokenToEth(underlying, balance);
    }

    /**
     * @notice Aave's Data Provider.
     * @return dataProvider_ The data provider.
     */
    function aaveDataProvider() external view returns (address dataProvider_) {
        return address(_aaveDataProvider);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Changes the covered platform.
     * The function should be used if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param dataProvider_ The new Data Provider.
     */
    function setCoveredPlatform(address dataProvider_) public override {
        super.setCoveredPlatform(dataProvider_);
        _aaveDataProvider = IAaveProtocolDataProvider(dataProvider_);
    }
}
