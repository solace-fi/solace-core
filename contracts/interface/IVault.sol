// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";

/**
 * @title Vault interface
 * @author solace.fi
 * @notice Interface for Vault contract
 */

struct StrategyParams {
    uint256 performanceFee;
    uint256 activation;
    uint256 debtRatio;
    uint256 minDebtPerHarvest;
    uint256 maxDebtPerHarvest;
    uint256 lastReport;
    uint256 totalDebt;
    uint256 totalGain;
    uint256 totalLoss;
}

interface IVault is IERC20, IERC20Permit {

    /// @notice Governance.
    function governance() external view returns (address);

    /// @notice Governance to take over.
    function newGovernance() external view returns (address);

    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);

    function deposit() external payable;
    function depositWeth(uint256 amount) external;
    function withdraw(uint256 _amount, uint256 _maxLoss) external returns (uint256);
    function token() external view returns (IERC20);
    function debtOutstanding(address) external view returns (uint256);
    function revokeStrategy(address) external;
    function strategies(address) external view returns (StrategyParams memory);
    function requestEth(uint256 amount) external returns (uint256);
    function report(
        uint256 gain,
        uint256 loss,
        uint256 _debtPayment
    ) external returns (uint256);

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external;

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external;
}
