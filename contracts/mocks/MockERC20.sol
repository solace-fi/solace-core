// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


/**
 * @title Mock ERC-20
 * @author solace.fi
 * @notice Mock ERC-20 is only used to test the master contract.
 */
contract MockERC20 is ERC20 {
    using SafeERC20 for IERC20;

    /**
     * @notice Constructs the Mock Token contract.
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply
    ) public ERC20(name, symbol) {
        _mint(msg.sender, supply);
    }
}
