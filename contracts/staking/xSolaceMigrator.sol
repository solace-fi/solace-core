// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./../interfaces/staking/IxSOLACEV1.sol";
import "./../interfaces/staking/IxsLocker.sol";
import "./../interfaces/staking/IxSolaceMigrator.sol";


/**
 * @title xSolace Migrator
 * @author solace.fi
 * @notice Helps migrate [**xSOLACE**](./xSOLACE) from V1 to V2.
 */
contract xSolaceMigrator is IxSolaceMigrator, ReentrancyGuard {

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Address of the [**SOLACE**](./../SOLACE) contract.
    address public override solace;
    /// @notice Address of the V1 [**xSOLACE**](./xSOLACEV1) contract.
    address public override xsolace_v1;
    /// @notice Address of the [**xsLocker**](./xsLocker) contract.
    address public override xslocker;

    /**
     * @notice Constructs the xSOLACE Token contract.
     * @param solace_ Address of the [**SOLACE**](./../SOLACE) contract.
     * @param xsolace_v1_ Address of the V1 [**xSOLACE**](./xSOLACE) contract.
     * @param xslocker_ Address of the [**xsLocker**](./xsLocker) contract.
     */
    constructor(address solace_, address xsolace_v1_, address xslocker_) {
        require(solace_ != address(0x0), "zero address solace");
        solace = solace_;
        require(xsolace_v1_ != address(0x0), "zero address xsolace v1");
        xsolace_v1 = xsolace_v1_;
        require(xslocker_ != address(0x0), "zero address xslocker");
        xslocker = xslocker_;
        IERC20(solace_).approve(xslocker_, type(uint256).max);
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Migrate from the [**xSOLACEv1**](./xSOLACEv1) contract and create a new [**Lock**](./xsLocker).
     * @param amount The amount of [**xSOLACEv1**](./xSOLACEv1) to migrate.
     * @param lockEnd The timestamp that the lock will unlock.
     */
    function migrate(uint256 amount, uint256 lockEnd) external override nonReentrant {
        // pull xsolace
        SafeERC20.safeTransferFrom(IERC20(xsolace_v1), msg.sender, address(this), amount);
        // accounting
        return _migrate(msg.sender, amount, lockEnd);
    }

    /**
     * @notice Migrate from the [**xSOLACEv1**](./xSOLACEv1) contract and create a new [**Lock**](./xsLocker).
     * @param amount The amount of [**xSOLACEv1**](./xSOLACEv1) to migrate.
     * @param lockEnd The timestamp that the lock will unlock.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function migrateSigned(uint256 amount, uint256 lockEnd, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external override nonReentrant {
        // permit
        IERC20Permit(xsolace_v1).permit(msg.sender, address(this), amount, deadline, v, r, s);
        // pull xsolace
        SafeERC20.safeTransferFrom(IERC20(xsolace_v1), msg.sender, address(this), amount);
        // accounting
        _migrate(msg.sender, amount, lockEnd);
    }

    /***************************************
    INTERNAL FUNCTIONS
    ***************************************/

    /**
     * @notice Migrate from the [**xSOLACEv1**](./xSOLACEv1) contract and create a new [**Lock**](./xsLocker).
     * @param depositor The depositing user.
     * @param amount The deposit amount.
     * @param lockEnd The timestamp that the lock will unlock.
     */
    function _migrate(address depositor, uint256 amount, uint256 lockEnd) internal {
        IxSOLACEV1 xsolace = IxSOLACEV1(xsolace_v1);
        uint256 amountSolace = xsolace.unstake(amount);
        IxsLocker locker = IxsLocker(xslocker);
        locker.createLock(depositor, amountSolace, lockEnd);
    }
}
