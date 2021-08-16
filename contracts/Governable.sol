// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./interface/IGovernable.sol";

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
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override onlyGovernance {
        newGovernance = _governance;
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
