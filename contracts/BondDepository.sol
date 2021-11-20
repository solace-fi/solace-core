// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Factory.sol";
import "./Governable.sol";
import "./interface/ISOLACE.sol";
import "./interface/IxSOLACE.sol";
import "./interface/IBondTeller.sol";
import "./interface/IBondDepository.sol";

contract BondDepository is IBondDepository, Factory, Governable {

    ISOLACE internal _solace;
    IxSOLACE internal _xsolace;
    address internal _pool;
    address internal _dao;

    // track tellers
    mapping(address => bool) internal _isTeller;

    /**
     * @notice Constructs the BondDepository contract.
     * @param governance The address of the [governor](/docs/protocol/governance).
     * @param solace Address of [**SOLACE**](./solace).
     * @param solace Address of [**xSOLACE**](./xsolace).
     * @param pool Address of [`UnderwritingPool`](./underwritingpool).
     * @param solace Address of the DAO.
     */
    constructor(address governance, address solace, address xsolace, address pool, address dao) Governable(governance) {
        _setParams(solace, xsolace, pool, dao);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Native [**SOLACE**](./SOLACE) Token.
    function solace() external view override returns (address solace_) {
        return address(_solace);
    }

    /// @notice [**xSOLACE**](./xSOLACE) Token.
    function xsolace() external view override returns (address xsolace_) {
        return address(_xsolace);
    }

    /// @notice Underwriting Pool contract.
    function underwritingPool() external view override returns (address pool_) {
        return _pool;
    }

    /// @notice The DAO.
    function dao() external view override returns (address dao_) {
        return _dao;
    }

    /// @notice Returns true if the address is a teller.
    function isTeller(address teller) external view override returns (bool isTeller_) {
        return _isTeller[teller];
    }

    /***************************************
    TELLER MANAGEMENT FUNCTIONS
    ***************************************/

    /**
     * @notice Creates a new [`BondTeller`](./bondteller).
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param governance The address of the teller's [governor](/docs/protocol/governance).
     * @param impl The address of BondTeller implementation.
     * @param principal address The ERC20 token that users give.
     * @return teller The address of the new teller.
     */
    function createBondTeller(
        address governance,
        address impl,
        address principal
    ) external override onlyGovernance returns (address teller) {
        teller = _deployMinimalProxy(impl);
        IBondTeller(teller).initialize(governance, address(_solace), address(_xsolace), _pool, _dao, principal, address(this));
        _isTeller[teller] = true;
        emit TellerAdded(teller);
        return teller;
    }

    /**
     * @notice Creates a new [`BondTeller`](./bondteller).
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param governance The address of the teller's [governor](/docs/protocol/governance).
     * @param impl The address of BondTeller implementation.
     * @param salt The salt for CREATE2.
     * @param principal address The ERC20 token that users give.
     * @return teller The address of the new teller.
     */
    function create2BondTeller(
        address governance,
        address impl,
        bytes32 salt,
        address principal
    ) external override onlyGovernance returns (address teller) {
        teller = _deployMinimalProxy(impl, salt);
        IBondTeller(teller).initialize(governance, address(_solace), address(_xsolace), _pool, _dao, principal, address(this));
        _isTeller[teller] = true;
        emit TellerAdded(teller);
        return teller;
    }

    /**
     * @notice Adds a teller.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param teller The teller to add.
     */
    function addTeller(address teller) external override onlyGovernance {
        _isTeller[teller] = true;
        emit TellerAdded(teller);
    }

    /**
     * @notice Adds a teller.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param teller The teller to remove.
     */
    function removeTeller(address teller) external override onlyGovernance {
        _isTeller[teller] = false;
        emit TellerRemoved(teller);
    }

    /**
     * @notice Sets the parameters to pass to new tellers.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param solace Address of [**SOLACE**](./solace).
     * @param solace Address of [**xSOLACE**](./xsolace).
     * @param pool Address of [`UnderwritingPool`](./underwritingpool).
     * @param solace Address of the DAO.
     */
    function setParams(address solace, address xsolace, address pool, address dao) external override onlyGovernance {
        _setParams(solace, xsolace, pool, dao);
    }

    /**
     * @notice Sets the parameters to pass to new tellers.
     * @param solace Address of [**SOLACE**](./solace).
     * @param solace Address of [**xSOLACE**](./xsolace).
     * @param pool Address of [`UnderwritingPool`](./underwritingpool).
     * @param solace Address of the DAO.
     */
    function _setParams(address solace, address xsolace, address pool, address dao) internal {
        require(solace != address(0x0), "zero address solace");
        require(xsolace != address(0x0), "zero address xsolace");
        require(pool != address(0x0), "zero address pool");
        require(dao != address(0x0), "zero address dao");
        _solace = ISOLACE(solace);
        _xsolace = IxSOLACE(xsolace);
        _pool = pool;
        _dao = dao;
        emit ParamsSet(solace, xsolace, pool, dao);
    }

    /***************************************
    TELLER ONLY FUNCTIONS
    ***************************************/

    /**
     * @notice Mints new **SOLACE** to the teller.
     * Can only be called by tellers.
     * @param amount The number of new tokens.
     */
    function mint(uint256 amount) external override {
        // this contract must have permissions to mint solace
        // tellers should mint via bond depository instead of directly through solace
        // acts as a second layer of access control that declutters solace minters

        // can only be called by authorized minters
        require(_isTeller[msg.sender], "!teller");
        // mint
        _solace.mint(msg.sender, amount);
    }
}
