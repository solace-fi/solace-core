// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title IPriceVerifier
 * @author solace.fi
 * @notice Verifies token price.
*/
interface IPriceVerifier {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a price signer is added.
    event PriceSignerAdded(address signer);

    /// @notice Emitted when a price signer is removed.
    event PriceSignerRemoved(address signer);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Verifies `SOLACE` price data.
     * @param token The token to verify price.
     * @param price The `SOLACE` price in wei(usd).
     * @param deadline The deadline for the price.
     * @param signature The `SOLACE` price signature.
    */
    function verifyPrice(address token, uint256 price, uint256 deadline, bytes calldata signature) external view returns (bool);

    /**
     * @notice Checks whether given signer is an authorized signer or not.
     * @param signer The price signer address to check.
     * @return bool True if signer is a authorized signer.
    */
    function isPriceSigner(address signer) external view returns (bool);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a new price signer.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer The signer to add.
    */
    function addPriceSigner(address signer) external;

    /**
     * @notice Removes a price signer.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer The signer to remove.
    */
    function removePriceSigner(address signer) external;
}
