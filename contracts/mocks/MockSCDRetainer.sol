// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./../interfaces/products/ISCDRetainer.sol";


/**
 * @title Mock Solace Cover Dollars Retainer
 * @author solace.fi
 * @notice An implementation of SCDRetainer built for testing.
 */
contract MockSCDRetainer is ISCDRetainer {

    mapping(address => uint256) private _req;

    /**
     * @notice Sets the minimum amount of Solace Cover Dollars required by this contract for the account to hold.
     * @param account Account to query.
     * @param amount The amount of SCD the account must hold.
     */
    function setMinScdRequired(address account, uint256 amount) external {
        _req[account] = amount;
    }

    /**
     * @notice Calculates the minimum amount of Solace Cover Dollars required by this contract for the account to hold.
     * @param account Account to query.
     * @return amount The amount of SCD the account must hold.
     */
    function minScdRequired(address account) external view override returns (uint256 amount) {
        return _req[account];
    }
}
