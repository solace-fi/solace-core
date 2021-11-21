// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


/**
 * @title IBondTeller
 * @author solace.fi
 * @notice Base type of Bond Tellers.
 *
 * Bond tellers allow users to buy bonds. After vesting for `vestingTerm`, bonds can be redeemed for [**SOLACE**](./SOLACE) or [**xSOLACE**](./xSOLACE). Payments are made in `principal` which is sent to the underwriting pool and used to back risk.
 *
 * Bonds can be purchased via [`deposit()`](#deposit) or [`depositSigned()`](#depositsigned). Bonds are represented as ERC721s, can be viewed with [`bonds()`](#bonds), and redeemed with [`redeem()`](#redeem).
 */
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
