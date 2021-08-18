// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.6;

import "./Governable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/**
 * @title Solace Token (SOLACE)
 * @author solace.fi
 * @notice **Solace** tokens can be earned by depositing **Capital Provider** or **Liquidity Provider** tokens to the [`Master`](./Master.md) contract.
 * **SOLACE** can also be locked for a preset time in the `Locker` contract to recieve `veSOLACE` tokens.
 */
contract SOLACE is ERC20Permit, Governable {
    using SafeERC20 for IERC20;
    using Address for address;

    /// @notice Minters
    mapping (address => bool) public minters;

    /**
     * @notice Constructs the Solace Token contract.
     * @param _governance The address of the governor.
     */
    constructor(address _governance) ERC20("solace", "SOLACE") ERC20Permit("solace") Governable(_governance) {
        minters[_governance] = true;
    }

    /**
     * @notice The function creates new tokens and mints them to the receiver account.
     * The caller must be a `minter`.
     * @param account The receiver of new tokens.
     * @param amount The number of new tokens.
     */
    function mint(address account, uint256 amount) public {
        require(minters[msg.sender], "!minter");
        _mint(account, amount);
    }

    /**
     * @notice Adds a new minter.
     * Can only be called by the current `governor`.
     * @param _minter The new minter.
     */
    function addMinter(address _minter) public onlyGovernance {
        minters[_minter] = true;
    }

    /**
     * @notice Removes a minter.
     * Can only be called by the current `governor`.
     * @param _minter The minter to remove.
     */
    function removeMinter(address _minter) public onlyGovernance {
        minters[_minter] = false;
    }
}
