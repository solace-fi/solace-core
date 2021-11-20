// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IBondTeller {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a bond is created.
    event CreateBond(uint256 bondID, uint256 principalAmount, address payoutToken, uint256 payoutAmount, uint256 maturation);
    /// @notice Emitted when a bond is redeemed.
    event RedeemBond(uint256 bondID, address recipient, address payoutToken, uint256 payoutAmount);
    /// @notice Emitted when deposits are paused.
    event Paused();
    /// @notice Emitted when deposits are unpaused.
    event Unpaused();

    /***************************************
    INITIALIZER
    ***************************************/

    /**
     * @notice Initializes the teller.
     * @param governance The address of the [governor](/docs/protocol/governance).
     * @param solace The SOLACE token.
     * @param xsolace The xSOLACE token.
     * @param pool The underwriting pool.
     * @param dao The DAO.
     * @param principal address The ERC20 token that users deposit.
     * @param bondDepo The bond depository.
     */
    function initialize(
        address governance,
        address solace,
        address xsolace,
        address pool,
        address dao,
        address principal,
        address bondDepo
    ) external;

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Pauses deposits.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
    */
    function pause() external;

    /**
     * @notice Unpauses deposits.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
    */
    function unpause() external;
}
