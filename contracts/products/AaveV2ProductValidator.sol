// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/AaveV2/IAaveProtocolDataProvider.sol";
import "../interface/AaveV2/IAToken.sol";
import "../interface/IProductValidator.sol";
import "../Governable.sol";


/**
 * @title AaveV2ProductValidator
 * @author solace.fi
 * @notice The **AaveV2** product can be used to purchase coverage for **AaveV2** positions.
 */
contract AaveV2ProductValidator is IProductValidator, Governable {

    // emitted when data provider is updated.
    event AaveDataProviderUpdated(address newAddress);

    // IAaveProtocolDataProvider.
    IAaveProtocolDataProvider internal _aaveDataProvider;

    /**
      * @notice Constructs the AaveV2ProductValidator.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param dataProvider_ Aave protocol data provider address.
     */
    constructor (address governance_, address dataProvider_) Governable (governance_) {
        require(dataProvider_ != address(dataProvider_), "zero address dataprovier");
        _aaveDataProvider = IAaveProtocolDataProvider(dataProvider_);
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
     * @param positionDescription_ The description to validate.
     * @return isValid True if is valid.
     */
    function validate(bytes memory positionDescription_) public view virtual override returns (bool isValid) {
        // check length
        // solhint-disable-next-line var-name-mixedcase
        uint256 ADDRESS_SIZE = 20;
        // must be concatenation of one or more addresses
        if(positionDescription_.length == 0 || positionDescription_.length % ADDRESS_SIZE != 0) return false;
        // check all addresses in list
        for(uint256 offset = 0; offset < positionDescription_.length; offset += ADDRESS_SIZE) {
            // get next address
            address positionContract;
            // solhint-disable-next-line no-inline-assembly
            assembly {
                // get 20 bytes starting at offset+32
                positionContract := shr(0x60, mload(add(add(positionDescription_, 0x20), offset)))
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
    function setAaveDataProvider(address dataProvider_) external onlyGovernance {
        _aaveDataProvider = IAaveProtocolDataProvider(dataProvider_);
        emit AaveDataProviderUpdated(dataProvider_);
    }
}
