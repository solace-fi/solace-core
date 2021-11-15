// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Waave/IWaRegistry.sol";
import "../interface/Waave/IWaToken.sol";
import "../Governable.sol";
import "../interface/IProductValidator.sol";

/**
 * @title WaaveProductValidator
 * @author solace.fi
 * @notice The **WaaveProductValidator** can be used to purchase coverage for **Waave** positions.
 *
 * Note that the Waave Protocol is exploitable by design. Use this product or the Waave Protocol at your own risk.
 */
contract WaaveProductValidator is IProductValidator, Governable {
    
    // emitted when waregistry is updated.
    event WaRegistryUpdated(address newAddress);

    // IWaRegistry.
    IWaRegistry internal _waRegistry;

    /**
      * @notice Constructs the WaaveProductValidator.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param waRegistry_ The Waave Registry.
     */
    constructor(address governance_, address waRegistry_) Governable(governance_) {
        require(waRegistry_ != address(0x0), "zero address waregistry!");
        _waRegistry = IWaRegistry(waRegistry_);
    }

    /**
     * @notice Waave's Registry.
     * @return waRegistry_ The waRegistry.
     */
    function waRegistry() external view returns (address waRegistry_) {
        return address(_waRegistry);
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
            // must be a waToken
            if(!_waRegistry.isWaToken(positionContract)) return false;
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
     * @param waRegistry_ The new waRegistry.
     */
    function setWaaveRegistry(address waRegistry_) external onlyGovernance {
        _waRegistry = IWaRegistry(waRegistry_);
        emit WaRegistryUpdated(waRegistry_);
    }
}
