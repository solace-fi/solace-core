// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Liquity/ILQTYStaking.sol";
import "../interface/Liquity/ILQTYToken.sol";
import "../interface/Liquity/ITroveManager.sol";
import "../Governable.sol";
import "../interface/IProductValidator.sol";

/**
 * @title LiquityProductValidator
 * @author solace.fi
 * @notice The **LiquityProductValidator** can be used to purchase coverage for **Liquity** positions.
 */
contract LiquityProductValidator is IProductValidator, Governable {

    // emitted when trove manager is updated.
    event TroveManagerUpdated(address newAddress);

    /// @notice ITroveManager.
    ITroveManager internal _troveManager;

    /**
      * @notice Constructs the LiquityProductValidator.
      * @param governance_ The address of the [governor](/docs/user-docs/Governance).
      * @param troveManager_ The Liquity trove manager.
     */
    constructor (address governance_, address troveManager_) Governable(governance_) {
        require(troveManager_ != address(0x0), "zero address trovemanager!");
        _troveManager = ITroveManager(troveManager_);
    }

     /**
     * @notice Determines if the byte encoded description of a position(s) is valid.
     * The description will only make sense in context of the product.
     * @dev This function should be overwritten in inheriting Product contracts.
     * @param positionDescription_ The description to validate.
     * @return isValid True if is valid.
     */
    function validate(bytes memory positionDescription_) public view virtual override returns (bool isValid) {
        // check length
        // solhint-disable-next-line var-name-mixedcase
        uint256 ADDRESS_SIZE = 20;
        // must be concatenation of one or more addresses
        if (positionDescription_.length == 0 || positionDescription_.length % ADDRESS_SIZE != 0) return false;
        address lqtyStaking = _troveManager.lqtyStaking();
        address stabilityPool = _troveManager.stabilityPool();
        // check all addresses in list
        for(uint256 offset = 0; offset < positionDescription_.length; offset += ADDRESS_SIZE) {
            // get next address
            address positionContract;
            // solhint-disable-next-line no-inline-assembly
            assembly {
                positionContract := div(mload(add(add(positionDescription_, 0x20), offset)), 0x1000000000000000000000000)
            }
            // must be one of TroveManager, LqtyStaking, or StabilityPool
            if (( address(_troveManager) != positionContract) && (lqtyStaking !=  positionContract) && (stabilityPool != positionContract)) return false;
        }
        return true;
    }

    /**
     * @notice Liquity Trove Manager.
     * @return troveManager_ The trove manager address.
     */
    function troveManager() external view returns (address troveManager_) {
        return address(_troveManager);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Changes the covered platform.
     * The function should be used if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param troveManager_ The new Liquity Trove Manager.
     */
    function setTroveManager(address troveManager_) external onlyGovernance {
        _troveManager = ITroveManager(troveManager_);
        emit TroveManagerUpdated(troveManager_);
    }
}
