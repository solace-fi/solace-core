// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";


/**
 * @title Mock ERC-20 Permit
 * @author solace.fi
 * @notice Mock ERC-20 is a mock ERC-20 with the permit() function.
 */
contract MockERC20Permit is ERC20Permit {
    using SafeERC20 for IERC20;

    /**
     * @notice Constructs the Mock Token contract.
     * @param name The name of the token.
     * @param symbol The symbol of the token.
     * @param supply The amount of supply for the token.
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply
    ) ERC20(name, symbol) ERC20Permit(name) {
        _mint(msg.sender, supply);
    }
}
