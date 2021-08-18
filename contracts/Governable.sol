// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./interface/IGovernable.sol";

/**
 * @title Governable
 * @author solace.fi
 * @notice Many contracts contain functionality that should only be accessible to a privileged user. The most common access control pattern is OpenZeppelin's [`Ownable`](https://docs.openzeppelin.com/contracts/4.x/access-control#ownership-and-ownable). We instead use `Governable` with a few key differences:
 * - Transferring the governance role is a two step process. The current governance must `setGovernance(_newGovernance)` then the new governance must `acceptGovernance()`. This is to safeguard against accidentally setting ownership to the wrong address and locking yourself out of your contract.
 * - `governance` is a constructor argument instead of `msg.sender`.
 */
contract Governable is IGovernable {
    /// @notice Governor.
    address public override governance;

    /// @notice Governance to take over.
    address public override newGovernance;

    /**
     * @notice Constructs the governable contract.
     * @param _governance Address of the governor.
     */
    constructor(address _governance) {
        governance = _governance;
    }

    modifier onlyGovernance() {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        _;
    }

    modifier onlyNewGovernance() {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        _;
    }

    /**
     * @notice Initiates transfer of the governance role to a new governor.
     * Transfer is not complete until the new governor accepts the role.
     * Can only be called by the current governor.
     * @param _newGovernance The new governor.
     */
    function setGovernance(address _newGovernance) external override onlyGovernance {
        newGovernance = _newGovernance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external override onlyNewGovernance {
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }
}
