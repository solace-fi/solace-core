// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title Solace Cover Dollars Retainer
 * @author solace.fi
 * @notice An interface for contracts that require users to maintain a minimum balance of SCD.
 */
interface ISCDRetainer {

    /**
     * @notice Calculates the minimum amount of Solace Cover Dollars required by this contract for the account to hold.
     * @param account Account to query.
     * @return amount The amount of SCD the account must hold.
     */
    function minScdRequired(address account) external view returns (uint256 amount);
}
