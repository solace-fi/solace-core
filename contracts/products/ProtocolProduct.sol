// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/Address.sol";
import "../interface/IProduct.sol";
import "../interface/IPolicyManager.sol";
import "../interface/ITreasury.sol";


/**
 * @title ProtocolProduct
 * @author solace.fi
 * @notice The Product for smart contracts (e.g., pools, vaults, etc.) to purchase insurance policy.
 */
abstract contract ProtocolProduct is IProduct {
    using Address for address;
}
