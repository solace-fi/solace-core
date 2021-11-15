// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/UniswapV2/IUniLPToken.sol";
import "../interface/UniswapV2/IUniV2Factory.sol";

import "../Governable.sol";
import "../interface/IProductValidator.sol";

/**
 * @title UniswapV2ProductValidator
 * @author solace.fi
 * @notice The **UniswapV2ProductValidator** can be used to purchase coverage for **UniswapV2 LP** positions.
 */
contract UniswapV2ProductValidator is IProductValidator, Governable {

    // emitted when UniswapV2 factory is updated.
    event UniswapV2FactoryUpdated(address newAddress);

    // UniswapV2 factory.
    IUniV2Factory internal _uniV2Factory;

    /**
      * @notice Constructs the UniswapV2ProductValidator.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param uniV2Factory_ The UniswapV2ProductValidator Factory.
     */
    constructor (address governance_, address uniV2Factory_ ) Governable(governance_) {
        require(uniV2Factory_ != address(0x0), "zero address univ2factory!");
        _uniV2Factory = IUniV2Factory(uniV2Factory_);
    }

    /**
     * @notice Uniswap V2 Factory.
     * @return uniV2Factory_ The factory.
     */
    function uniV2Factory() external view returns (address uniV2Factory_) {
        return address(_uniV2Factory);
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
                positionContract := div(mload(add(add(positionDescription_, 0x20), offset)), 0x1000000000000000000000000)
            }
            // must be UniV2 LP Token
            IUniLPToken uniToken = IUniLPToken(positionContract);
            address pair = _uniV2Factory.getPair(uniToken.token0(), uniToken.token1());
            if (pair != address(uniToken)) return false;
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
     * @param uniV2Factory_ The new Address Provider.
     */
    function setUniV2Factory(address uniV2Factory_) external onlyGovernance {
        _uniV2Factory = IUniV2Factory(uniV2Factory_);
        emit UniswapV2FactoryUpdated(uniV2Factory_);
    }
}
