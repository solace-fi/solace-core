// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title xSolace Migrator
 * @author solace.fi
 * @notice Helps migrate [**xSOLACE**](./xSOLACE) from V1 to V2.
 */
interface IxSolaceMigrator {

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Address of the [**SOLACE**](./../SOLACE) contract.
    function solace() external view returns (address);
    /// @notice Address of the V1 [**xSOLACE**](./xSOLACEV1) contract.
    function xsolace_v1() external view returns (address);
    /// @notice Address of the [**xsLocker**](./xsLocker) contract.
    function xslocker() external view returns (address);

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Migrate from the [**xSOLACEv1**](./xSOLACEv1) contract and create a new [**Lock**](./xsLocker).
     * @param amount The amount of [**xSOLACEv1**](./xSOLACEv1) to migrate.
     * @param lockEnd The timestamp that the lock will unlock.
     */
    function migrate(uint256 amount, uint256 lockEnd) external;

    /**
     * @notice Migrate from the [**xSOLACEv1**](./xSOLACEv1) contract and create a new [**Lock**](./xsLocker).
     * @param amount The amount of [**xSOLACEv1**](./xSOLACEv1) to migrate.
     * @param lockEnd The timestamp that the lock will unlock.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function migrateSigned(uint256 amount, uint256 lockEnd, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
}
