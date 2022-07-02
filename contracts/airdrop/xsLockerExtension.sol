// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./../interfaces/staking/IxsLocker.sol";
import "./../interfaces/airdrop/IxsLockerExtension.sol";
import "./../utils/Governable.sol";

contract xsLockerExtension is IxsLockerExtension, ReentrancyGuard, Governable {

    /// @notice [**SOLACE**](./../SOLACE) token.
    address public immutable solace;

    /// @notice xsLocker contract address.
    address public immutable xslocker;

    /**
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param solace_ Address of [**SOLACE**](./../SOLACE).
     * @param xslocker_ Address of xsLocker.sol.
     */
    constructor(address governance_, address solace_, address xslocker_)
        Governable(governance_)
    {
        require(solace_ != address(0x0), "zero address solace");
        require(xslocker_ != address(0x0), "zero address xslocker");
        solace = solace_;
        xslocker = xslocker_;
        IERC20(solace_).approve(xslocker_, 2**256 - 1);
    }

    /**
     * @notice Deposit [**SOLACE**](./../../SOLACE) to increase the value of multiple existing locks.
     * @dev [**SOLACE**](./../../SOLACE) is transferred from msg.sender, assumes its already approved.
     * @param xsLockIDs Array of lock IDs to update.
     * @param amounts Array of [**SOLACE**](./../../SOLACE) amounts to deposit.
     */
    function increaseAmountMultiple(uint256[] calldata xsLockIDs, uint256[] calldata amounts) external override nonReentrant {
        require (xsLockIDs.length == amounts.length, "array length mismatch");

        // xsLocker.increaseAmount called transferFrom with `from` = msg.sender
        // In this context msg.sender = xsLockerExtension.sol contract
        // So need to first transfer SOLACE from caller to this contract.
        uint256 total_amount = 0;

        for (uint256 i = 0; i < amounts.length; i++) {
            total_amount += amounts[i];
        }

        SafeERC20.safeTransferFrom(IERC20(solace), msg.sender, address(this), total_amount);

        for (uint256 i = 0; i < xsLockIDs.length; i++) {
            IxsLocker(xslocker).increaseAmount(xsLockIDs[i], amounts[i]);
        }
    }
}