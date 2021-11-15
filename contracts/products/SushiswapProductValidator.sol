// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/SushiSwap/ISushiLPToken.sol";
import "../interface/SushiSwap/ISushiV2Factory.sol";
import "../Governable.sol";
import "../interface/IProductValidator.sol";


/**
 * @title SushiswapProductValidator
 * @author solace.fi
 * @notice The **SushiswapProductValidator** can be used to purchase coverage for **Sushiswap LP** positions.
 */
contract SushiswapProductValidator is IProductValidator, Governable {

    // emitted when sushiswapv2 factory is updated.
    event SushiswapV2FactoryUpdated(address newAddress);

    // Sushi v2 factory.
    ISushiV2Factory internal _sushiV2Factory;

    /**
      * @notice Constructs the SushiswapProductValidator.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param sushiV2Factory_ The Sushiswap Factory.
     */
    constructor (address governance_, address sushiV2Factory_) Governable(governance_) {
        require(sushiV2Factory_ != address(0x0), "zero address sushiv2factory!");
        _sushiV2Factory = ISushiV2Factory(sushiV2Factory_);
    }

    /**
     * @notice Sushiswap V2 Factory.
     * @return sushiV2Factory_ The factory.
     */
    function sushiV2Factory() external view returns (address sushiV2Factory_) {
        return address(_sushiV2Factory);
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
            // must be Sushi LP Token
            ISushiLPToken slpToken = ISushiLPToken(positionContract);
            address pair = _sushiV2Factory.getPair(slpToken.token0(), slpToken.token1());
            if (pair != address(slpToken)) return false;
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
     * @param sushiV2Factory_ The new Address Provider.
     */
    function setSushiV2Factory(address sushiV2Factory_) external onlyGovernance {
        _sushiV2Factory = ISushiV2Factory(sushiV2Factory_);
        emit SushiswapV2FactoryUpdated(sushiV2Factory_);
    }
}
