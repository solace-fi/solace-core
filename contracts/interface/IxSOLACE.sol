// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct Point {
    int128 bias;
    int128 slope;
    uint256 timestamp;
}

struct Lock {
    uint256 amount;
    uint256 start;
    uint256 end;
}

interface IxSOLACE is IERC20 {
    function xsLocker() external view returns (address);

    function checkpoint(uint256 maxRecord) external;

    function checkpoint(uint256 xsLockID, Lock calldata oldLock, Lock calldata newLock) external;

    function totalSupplyAt(uint256 timestamp) external view returns (uint256);

    function balanceOfAt(address account, uint256 timestamp)
        external
        view
        returns (uint256);

    function balanceOfLock(uint256 xsLockID) external view returns (uint256);

    function balanceOfLockAt(uint256 xsLockID, uint256 timestamp)
        external
        view
        returns (uint256);

    function slopeChanges(uint256 timestamp) external view returns (int128);

    function pointHistory(uint256 index) external view returns (Point memory);

    function lockPointHistory(uint256 index)
        external
        view
        returns (Point[] memory);


    function depositFor(address user, uint256 amount) external;

    function stake(address user) external view returns (uint256);
}
