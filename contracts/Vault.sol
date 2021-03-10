// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/**
 * @title Vault
 * @author solace.fi
 * @notice Capital Providers can deposit ETH to mint shares of the Vault (CP tokens)
 */
contract Vault is ERC20 {

    address public governance;

    uint256 private _ethBalanceBeforeLatestAction;

    constructor () ERC20("Capital Provider", "CP") {
        governance = msg.sender;
    }

    /**
     * @notice Allows a user to deposit ETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minteed to caller
     */
    function deposit() public payable {
        uint256 amount = msg.value;
        uint256 shares;
        if (totalSupply() == 0) {
            shares = amount;
        } else {
            shares = (amount * totalSupply()) / _ethBalanceBeforeLatestAction;
        }
        _mint(msg.sender, shares);
        _ethBalanceBeforeLatestAction = address(this).balance;
    }

}