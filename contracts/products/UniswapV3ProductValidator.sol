// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/UniswapV3/IUniswapV3Pool.sol";
import "../interface/UniswapV3/IUniswapV3Factory.sol";
import "../Governable.sol";
import "../interface/IProductValidator.sol";

/**
 * @title UniswapV3ProductValidator
 * @author solace.fi
 * @notice The **UniswapV3ProductValidator** can be used to purchase coverage for **UniswapV3 LP** positions.
 */
contract UniswapV3ProductValidator is IProductValidator, Governable {

    // emitted when UniswapV3 factory is updated.
    event UniswapV3FactoryUpdated(address newAddress);

    // UniswapV3 factory.
    IUniswapV3Factory internal _uniV3Factory;

    /**
      * @notice Constructs the UniswapV3ProductValidator.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param uniV3Factory_ The UniswapV3ProductValidator Factory.
     */
    constructor (address governance_, address uniV3Factory_ ) Governable(governance_) {
        require(uniV3Factory_ != address(0x0), "zero address univ3factory!");
        _uniV3Factory = IUniswapV3Factory(uniV3Factory_);
    }

    /**
     * @notice Uniswap V3 Factory.
     * @return uniV3Factory_ The factory.
     */
    function uniV3Factory() external view returns (address uniV3Factory_) {
        return address(_uniV3Factory);
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
            // must be UniswapV3 Pool
            IUniswapV3Pool uniswapV3Pool = IUniswapV3Pool(positionContract);
            address pool = _uniV3Factory.getPool(uniswapV3Pool.token0(), uniswapV3Pool.token1(), uniswapV3Pool.fee());
            if (pool != address(uniswapV3Pool)) return false;
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
     * @param uniV3Factory_ The new Address Provider.
     */
    function setUniV3Factory(address uniV3Factory_) external onlyGovernance {
        _uniV3Factory = IUniswapV3Factory(uniV3Factory_);
        emit UniswapV3FactoryUpdated(uniV3Factory_);
    }
}
