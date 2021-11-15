// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title ICoverageDataProvider
 * @author solace.fi
 * @notice Calculates the maximum amount of cover that `Solace` protocol can sell as a coverage. 
*/
interface ICoverageDataProvider {

    /**
     * @notice The maximum amount of cover that Solace as a whole can sell.
     * @return cover The max amount of cover in wei.
    */
    function maxCover() external view returns (uint256 cover);
}
