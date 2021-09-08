// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title IWaToken
 * @author solace.fi
 * @notice WaTokens mimic Aave V2 Vaults and can be exploited by design. Use this contract or any of its subclasses at your own risk.
 */
interface IWaToken is IERC20Metadata {

    /**
     * @notice The underlying token.
     */
    function underlying() external view returns (address);

    /**
     * @notice The amount of underlying tokens it would take to mint one full waToken.
     */
    function pricePerShare() external view returns (uint256);

    /**
     * @notice Deposit underlying tokens to receive some waTokens.
     * @param uAmount Amount of underlying to deposit.
     * @return waAmount Amount of waTokens minted.
     */
    function deposit(uint256 uAmount) external returns (uint256 waAmount);

    /**
     * @notice Burn some waTokens to receive some underlying tokens.
     * @param waAmount Amount of waTokens to burn.
     * @return uAmount Amount of underlying received.
     */
    function withdraw(uint256 waAmount) external returns (uint256 uAmount);

    /**
     * @notice The waToken has lost money on its investments.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param uAmount Amount of losses in underlying.
     */
    function lose(uint256 uAmount) external;
}
