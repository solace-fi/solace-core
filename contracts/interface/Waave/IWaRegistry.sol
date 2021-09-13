// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;


/**
 * @title IWaRegistry
 * @author solace.fi
 * @notice Tracks the waTokens.
 */
interface IWaRegistry {

    /**
     * @notice The number of registered waTokens.
     */
    function numTokens() external view returns (uint256);

    /**
     * @notice Returns true if the account is a waToken.
     */
    function isWaToken(address account) external view returns (bool);

    /**
     * @notice Gets the waToken at an index [0,numTokens()-1].
     */
    function waTokenAt(uint256 index) external view returns (address);

    /**
     * @notice Gets all waTokens.
     */
    function getAllWaTokens() external view returns (address[] memory);

    /**
     * @notice Registers a new waToken.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param waToken The new waToken.
     */
    function addToken(address waToken) external;

    /**
     * @notice Deregisters a waToken.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param waToken The waToken.
     */
    function removeToken(address waToken) external;
}
