// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Curve/ICurveAddressProvider.sol";
import "../interface/Curve/ICurveRegistry.sol";
import "../interface/IProductValidator.sol";
import "../Governable.sol";

/**
 * @title CurveProductValidator
 * @author solace.fi
 * @notice The **CurveProductValidator** can be used to purchase coverage for **Curve** positions.
 */
contract CurveProductValidator is IProductValidator, Governable {
   
    // emitted when curve address provider is updated.
    event CurveAddressProviderUpdated(address newAddress);

    // Curve address provider.
    ICurveAddressProvider internal _addressProvider;

    /**
      * @notice Constructs the CurveProductValidator.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param curveAddressProvider_ The Curve Address Provider.
     */
    constructor(address governance_,address curveAddressProvider_) Governable(governance_) {
        require(curveAddressProvider_ != address(0x0), "zero address curveaddressprovider!");
        _addressProvider = ICurveAddressProvider(curveAddressProvider_);
    }

    /**
     * @notice Curve's Address Provider.
     * @return curveAddressProvider_ The address provider.
     */
    function addressProvider() external view returns (address curveAddressProvider_) {
        return address(_addressProvider);
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
        ICurveRegistry curveRegistry = ICurveRegistry(_addressProvider.get_registry());
        for(uint256 offset = 0; offset < positionDescription_.length; offset += ADDRESS_SIZE) {
            // get next address
            address positionContract;
            // solhint-disable-next-line no-inline-assembly
            assembly {
                // get 20 bytes starting at offset+32
                positionContract := shr(0x60, mload(add(add(positionDescription_, 0x20), offset)))
            }
            // must be a LP token, not a pool
            address pool = curveRegistry.get_pool_from_lp_token(positionContract);
            if(pool == address(0x0)) return false;
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
     * @param curveAddressProvider_ The new Address Provider.
     */
    function setCurveAddressProvider(address curveAddressProvider_) external onlyGovernance {
        _addressProvider = ICurveAddressProvider(curveAddressProvider_);
        emit CurveAddressProviderUpdated(curveAddressProvider_);
    }
}
