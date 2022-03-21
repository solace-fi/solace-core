// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface ITransferReceiver {
    function onTokenTransfer(address from, uint256 amount, bytes calldata data) external returns (bool success);
}

interface IApprovalReceiver {
    function onTokenApproval(address from, uint256 amount, bytes calldata data) external returns (bool success);
}

contract MockERC677 is ITransferReceiver, IApprovalReceiver {

    event TokenTransferred(address from, uint256 amount, bytes data);
    event TokenApproved(address from, uint256 amount, bytes data);

    function onTokenTransfer(address from, uint256 amount, bytes calldata data) external override returns (bool success) {
        emit TokenTransferred(from, amount, data);
        return true;
    }

    function onTokenApproval(address from, uint256 amount, bytes calldata data) external override returns (bool success) {
        emit TokenTransferred(from, amount, data);
        return true;
    }
}
