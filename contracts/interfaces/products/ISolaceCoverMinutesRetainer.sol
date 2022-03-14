// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title Solace Cover Minutes Retainer
 * @author solace.fi
 * @notice
 */
interface ISolaceCoverMinutesRetainer {

    /**
     * @notice Calculates the minimum amount of Solace Cover Minutes required by this contract for the account to hold.
     * @param account Account to query.
     * @return amount The amount of SCM the account must hold.
     */
    function minScmRequired(address account) external view returns (uint256 amount);
}
