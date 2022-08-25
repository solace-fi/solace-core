// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "./MockERC20Permit.sol";

/**
 * @title Mock ERC-20 Permit
 * @author solace.fi
 * @notice Mock ERC-20 is a mock ERC-20 with the permit() function.
 */
contract MockERC20PermitWithBurn is MockERC20Permit {
    /**
     * @notice Constructs the Mock Token contract.
     * @param name The name of the token.
     * @param symbol The symbol of the token.
     * @param supply The amount of supply for the token.
     * @param decimals_ The amount of decimals in the token.
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply,
        uint8 decimals_
    )
    // solhint-disable-next-line no-empty-blocks
    MockERC20Permit(name, symbol, supply, decimals_) {}

    function burn(uint256 amount_) external {
        _burn(msg.sender, amount_);
    }
}
