// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

interface IStabilityPool {

    /** 
     * @notice
     * Returns the total amount of ETH held by the pool, accounted in an internal variable instead of `balance`,
     * to exclude edge cases like ETH received from a self-destruct.
     */
    function getETH() external view returns (uint);

    /**
     * @notice Returns LUSD held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
     */
    function getTotalLUSDDeposits() external view returns (uint);

    /** 
     * @notice Return the user's compounded deposit.
     * @param _depositor the user address
     */
    function getCompoundedLUSDDeposit(address _depositor) external view returns (uint);

    /**
     * @notice 
     * Calculate the LQTY gain earned by a deposit since its last snapshots were taken.
     * If not tagged with a front end, the depositor gets a 100% cut of what their deposit earned.
     * Otherwise, their cut of the deposit's earnings is equal to the kickbackRate, set by the front end through
     * which they made their deposit.
     * @param _depositor the user address
     */
    function getDepositorLQTYGain(address _depositor) external view returns (uint);
}