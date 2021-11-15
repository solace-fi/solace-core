// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Yearn/IYRegistry.sol";
import "../interface/Yearn/IYVault.sol";
import "../Governable.sol";
import "../interface/IProductValidator.sol";
/**
 * @title YearnV2ProductValidator
 * @author solace.fi
 * @notice The **YearnV2ProductValidator** can be used to purchase coverage for **YearnV2** positions.
 */
contract YearnV2ProductValidator is IProductValidator, Governable {

    // emitted when Yearn registry is updated.
    event YearnRegistryUpdated(address newAddress);

    // IYRegistry.
    IYRegistry internal _yregistry;

    /**
      * @notice Constructs the YearnV2ProductValidator.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param yearnRegistry_ The Yearn YRegistry.
     */
    constructor(address governance_, address yearnRegistry_) Governable(governance_) {
        require(yearnRegistry_ != address(0x0), "zero address yearnregistry!");
        _yregistry = IYRegistry(yearnRegistry_);
    }

    /**
     * @notice Yearn's YRegistry.
     * @return yregistry_ The YRegistry.
     */
    function yearnRegistry() external view returns (address yregistry_) {
        return address(_yregistry);
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
            // must be a yVault
            IYVault vault = IYVault(positionContract);
            bool isRegistered = _yregistry.isRegistered(vault.token());
            if (!isRegistered) return false;
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
     * @param yregistry_ The new YRegistry.
     */
    function setYearnRegistry(address yregistry_) external onlyGovernance {
        _yregistry = IYRegistry(yregistry_);
        emit YearnRegistryUpdated(yregistry_);
    }
}
