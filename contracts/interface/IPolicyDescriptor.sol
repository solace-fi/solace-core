// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IPolicyManager.sol";

interface IPolicyDescriptor {

  function tokenURI(IPolicyManager policyManager, uint256 policyID) external view returns (string memory);

}