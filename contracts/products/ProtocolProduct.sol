// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "../interface/IProduct.sol";
import "../interface/IPolicyManager.sol";
import "../interface/ITreasury.sol";

/* TODO
 * - vaults, pools, and other contract can ask for a quote (someone can ask on behalf of the contract),
 * appraisor(or governance) then submits required premium, someone pays -> policy deployed
 * - write requestQuote()
 * -
 * -
 */


/**
 * @title ProtocolProduct
 * @author solace.fi
 * @notice The Product for smart contracts (e.g., pools, vaults, etc.) to purchase insurance policy.
 */
abstract contract ProtocolProduct is IProduct {
    using Address for address;
}
