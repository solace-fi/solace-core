// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interface/IxSOLACE.sol";
import "./interface/IxSOLACEv1.sol";


/**
 * @title xSolace Migrator
 * @author solace.fi
 * @notice Helps migrate **xSOLACE** from V1 to V2.
 */
contract xSolaceMigrator is ReentrancyGuard {

    address public solace;            // SOLACE
    address public xsolace_v1;        // xsolace V1
    address public xsolace_v2;        // xsolace V2

    /**
     * @notice Constructs the xSOLACE Token contract.
     * @param solace_ Address of the **SOLACE** contract.
     * @param xsolace_v1_ Address of the V1 **xSOLACE** contract.
     * @param xsolace_v2_ Address of the V1 **xSOLACE** contract.
     */
    constructor(address solace_, address xsolace_v1_, address xsolace_v2_) {
        require(solace_ != address(0x0), "zero address solace");
        solace = solace_;
        require(xsolace_v1_ != address(0x0), "zero address xsolace v1");
        xsolace_v1 = xsolace_v1_;
        require(xsolace_v2_ != address(0x0), "zero address xsolace v2");
        xsolace_v2 = xsolace_v2_;
        IERC20(solace_).approve(xsolace_v2_, type(uint256).max);
    }

    /**
     * @notice Migrate from the V1 **xSOLACE** contract.
     */
    function migrate() external nonReentrant {
        // get user balance
        IERC20 v1 = IERC20(xsolace_v1);
        uint256 v1Balance = v1.balanceOf(msg.sender);
        // pull xsolace
        SafeERC20.safeTransferFrom(v1, msg.sender, address(this), v1Balance);
        // accounting
        return _migrate(msg.sender, v1Balance);
    }

    /**
     * @notice Migrate from the V1 **xSOLACE** contract.
     * @param depositor The depositing user.
     * @param amount The deposit amount.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function migrateSigned(address depositor, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        // permit
        IERC20Permit(solace).permit(depositor, address(this), amount, deadline, v, r, s);
        // pull xsolace
        SafeERC20.safeTransferFrom(IERC20(xsolace_v1), depositor, address(this), amount);
        // accounting
        _migrate(depositor, amount);
    }

    /***************************************
    INTERNAL FUNCTIONS
    ***************************************/

    /**
     * @notice Migrate from the V1 **xSOLACE** contract.
     * @param depositor The depositing user.
     * @param amount The deposit amount.
     */
    function _migrate(address depositor, uint256 amount) internal {
        IxSOLACEv1 v1 = IxSOLACEv1(xsolace_v1);
        uint256 amountSolace = v1.unstake(amount);
        IxSOLACE v2 = IxSOLACE(xsolace_v2);
        v2.depositFor(depositor, amount);
    }
}
