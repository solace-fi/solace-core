// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title IRiskManager
 * @author solace.fi
 * @notice
 */
interface IRiskManager {

    // events
    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);

    /// @notice Governance.
    function governance() external view returns (address);

    /// @notice Governance to take over.
    function newGovernance() external view returns (address);

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

    /**
     * @notice Sets the products and their weights.
     * Can only be called by the current governor.
     * @param _products The products.
     * @param _weights The product weights.
     */
    function setProductWeights(address[] calldata _products, uint32[] calldata _weights) external;

    /**
     * @notice The maximum amount of cover that a product can sell.
     * @param _product The product that wants to sell cover.
     * @return The max amount of cover in wei.
     */
    function maxCoverAmount(address _product) external view returns (uint256);
}
