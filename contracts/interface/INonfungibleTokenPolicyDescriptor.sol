// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./IPolicyManager.sol";

interface INonfungibleTokenPolicyDescriptor {

  function tokenURI(IPolicyManager policyManager, uint256 policyID) external view returns (string memory);

}