// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


/**
 * @title Dummy LP Token
 * @author solace.fi
 * @notice Dummy LP Token is only used to test the master contract.
 */
contract DummyLpToken is ERC20 {
    using SafeERC20 for IERC20;

    /// @notice governor
    address public governance;
    /// @notice minters
    mapping (address => bool) public minters;

    /**
     * @notice Constructs the Dummy LP Token contract.
     */
    constructor() public ERC20("Dummy", "DMMY") {
        _mint(msg.sender, 1_000_000 * 10**18);
    }
}
