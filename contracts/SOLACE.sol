// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/**
 * @title Solace Token (SOLACE)
 * @author solace.fi
 * @notice Solace tokens can be earned by depositing Capital Provider or Liquidity Provider tokens to the Master contract.
 *         SOLACE can also be locked for a preset time in the Locker contract to recieve veSOLACE tokens.
 */
contract SOLACE is ERC20Permit {
    using SafeERC20 for IERC20;
    using Address for address;

    /// @notice Governor.
    address public governance;

    /// @notice Governance to take over.
    address public newGovernance;

    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);

    /// @notice minters
    mapping (address => bool) public minters;

    /**
     * @notice Constructs the Solace Token contract.
     * @param _governance Address of the governor.
     */
    constructor(address _governance) ERC20("solace", "SOLACE") ERC20Permit("solace"){
        governance = _governance;
        minters[_governance] = true;
    }

    /**
     * @notice Creates `amount` new tokens for `to`.
     * The caller must be a minter.
     * @param account receiver of new tokens
     * @param amount number of new tokens
     */
    function mint(address account, uint256 amount) public {
        require(minters[msg.sender], "!minter");
        _mint(account, amount);
    }

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
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
