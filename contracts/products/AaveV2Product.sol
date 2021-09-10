// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/AaveV2/IAaveProtocolDataProvider.sol";
import "../interface/AaveV2/IAToken.sol";
import "./BaseProduct.sol";


/**
 * @title AaveV2Product
 * @author solace.fi
 * @notice The **AaveV2** product can be used to purchase coverage for **AaveV2** positions.
 */
contract AaveV2Product is BaseProduct {

    // IAaveProtocolDataProvider.
    IAaveProtocolDataProvider internal _aaveDataProvider;

    /**
      * @notice Constructs the AaveV2Product.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param policyManager_ The [`PolicyManager`](../PolicyManager) contract.
      * @param registry_ The [`Registry`](../Registry) contract.
      * @param dataProvider_ Aave protocol data provider address.
      * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
      * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
      * @param price_ The cover price for the **Product**.
      * @param maxCoverPerUserDivisor_ The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address dataProvider_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        dataProvider_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        "Solace.fi-AaveV2Product",
        "1"
    ) {
        _aaveDataProvider = IAaveProtocolDataProvider(dataProvider_);
        _SUBMIT_CLAIM_TYPEHASH = keccak256("AaveV2ProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "AaveV2";
    }

    /**
     * @notice Aave's Data Provider.
     * @return dataProvider_ The data provider.
     */
    function aaveDataProvider() external view returns (address dataProvider_) {
        return address(_aaveDataProvider);
    }

    /**
     * @notice Determines if the byte encoded description of a position(s) is valid.
     * The description will only make sense in context of the product.
     * @dev This function should be overwritten in inheriting Product contracts.
     * If invalid, return false if possible. Reverting is also acceptable.
     * @param positionDescription The description to validate.
     * @return isValid True if is valid.
     */
    function isValidPositionDescription(bytes memory positionDescription) public view virtual override returns (bool isValid) {
        // check length
        // solhint-disable-next-line var-name-mixedcase
        uint256 ADDRESS_SIZE = 20;
        // must be concatenation of one or more addresses
        if(positionDescription.length == 0 || positionDescription.length % ADDRESS_SIZE != 0) return false;
        // check all addresses in list
        for(uint256 offset = 0; offset < positionDescription.length; offset += ADDRESS_SIZE) {
            // get next address
            address positionContract;
            // solhint-disable-next-line no-inline-assembly
            assembly {
                positionContract := div(mload(add(add(positionDescription, 0x20), offset)), 0x1000000000000000000000000)
            }
            // must be an aToken
            IAToken token = IAToken(positionContract);
            address underlying = token.UNDERLYING_ASSET_ADDRESS();
            ( address aTokenAddress, , ) = _aaveDataProvider.getReserveTokensAddresses(underlying);
            if(positionContract != aTokenAddress) return false;
        }
        return true;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Changes the covered platform.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Use this if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * @param dataProvider_ The new Data Provider.
     */
    function setCoveredPlatform(address dataProvider_) public override {
        super.setCoveredPlatform(dataProvider_);
        _aaveDataProvider = IAaveProtocolDataProvider(dataProvider_);
    }
}
