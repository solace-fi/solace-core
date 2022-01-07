// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "./IERC721Enhanced.sol";
import "./IxSOLACE.sol";


struct Lock {
    uint256 amount;
    uint256 end;
}

interface IxsLocker is IERC721Enhanced {

    /***************************************
    EVENTS
    ***************************************/

    event LockCreated(uint256 xsLockID);
    event LockUpdated(uint256 xsLockID, uint256 amount, uint256 end);
    event Withdraw(uint256 xsLockID, uint256 amount);
    event VoteDelegated(uint256 xsLockID, address to);
    /// @notice Emitted when a listener is added.
    event ListenerAdded(address indexed listener);
    /// @notice Emitted when a listener is removed.
    event ListenerRemoved(address indexed listener);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    function solace() external view returns (address);
    function xsolace() external view returns (address);
    function totalLockedSupply() external view returns (uint256);
    function locks(uint256 xsLockID) external view returns (Lock memory);
}
