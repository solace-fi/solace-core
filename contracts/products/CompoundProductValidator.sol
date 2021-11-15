// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Compound/IComptroller.sol";
import "../interface/Compound/ICToken.sol";
import "../interface/IProductValidator.sol";
import "../Governable.sol";


/**
 * @title CompoundProductValidator
 * @author solace.fi
 * @notice The **CompoundProductValidator** can be used to purchase coverage for **Compound** positions.
 */
contract CompoundProductValidator is IProductValidator, Governable {

    // emitted when comptroller is updated.
    event ComptrollerUpdated(address newAddress);

    // IComptroller.
    IComptroller internal _comptroller;

    /**
      * @notice Constructs the CompoundProductValidator.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param comptroller_ The Compound Comptroller.
     */
    constructor (address governance_, address comptroller_) Governable(governance_) {
        require(comptroller_ != address(0x0), "zero address comptroller!");
        _comptroller = IComptroller(comptroller_);
    }

    /**
     * @notice Compound's Comptroller.
     * @return comptroller_ The comptroller.
     */
    function comptroller() external view returns (address comptroller_) {
        return address(_comptroller);
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
            // must be a cToken
            (bool isListed, , ) = _comptroller.markets(positionContract);
            if(!isListed) return false;
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
     * @param comptroller_ The new Comptroller.
     */
    function setCompoundComptroller(address comptroller_) external onlyGovernance {
        _comptroller = IComptroller(comptroller_);
        emit ComptrollerUpdated(comptroller_);
    }
}
