// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Solace Token
 * @author solace.fi
 * @notice Solace Tokens can be earned by depositing Capital Provider or Liquidity Provider tokens to the Master contract.
 * Solace Tokens can locked in the Locker contract to earn veSolace Tokens.
 */
contract SOLACE is ERC20 {
    using SafeERC20 for IERC20;

    /// @notice governor
    address public governance;
    /// @notice minters
    mapping (address => bool) public minters;

    /**
     * @notice Constructs the Solace Token contract.
     */
    constructor() ERC20("solace.fi", "SOLACE") {
        governance = msg.sender;
    }

    /**
     * @notice Creates `amount` new tokens for `to`.
     * The caller must have the `MINTER_ROLE`.
     * @param account receiver of new tokens
     * @param amount number of new tokens
     */
    function mint(address account, uint256 amount) public {
        require(minters[msg.sender], "!minter");
        _mint(account, amount);
    }

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance the new governor
     */
    function setGovernance(address _governance) public {
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    /**
     * @notice Adds a new minter.
     * Can only be called by the current governor.
     * @param _minter the new minter
     */
    function addMinter(address _minter) public {
        require(msg.sender == governance, "!governance");
        minters[_minter] = true;
    }

    /**
     * @notice Removes a minter.
     * Can only be called by the current governor.
     * @param _minter the minter to remove
     */
    function removeMinter(address _minter) public {
        require(msg.sender == governance, "!governance");
        minters[_minter] = false;
    }
}
