// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./interface/IPolicyDescriptor.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IProduct.sol";

/**
 * @title PolicyDescriptor
 * @author solace.fi
 * @notice Produces a string containing the data URI for a JSON metadata string of a policy.
 * It is inspired from Uniswap V3 [`NonfungibleTokenPositionDescriptor`](https://docs.uniswap.org/protocol/reference/periphery/NonfungibleTokenPositionDescriptor).
 */
contract PolicyDescriptor is IPolicyDescriptor {
    /**
     * @notice Produces the URI describing a particular policy `product` for a given `policy id`.
     * @param _policyManager The policy manager to retrieve policy info to produce URI descriptor.
     * @param _policyID The id of the policy for which to produce a description.
     * @return _descriptor The URI of the ERC721-compliant metadata.
     */
    function tokenURI(IPolicyManager _policyManager, uint256 _policyID) external view override returns (string memory _descriptor) {
        address product = _policyManager.getPolicyProduct(_policyID);
        string memory productName = IProduct(product).name();
        return string(abi.encodePacked("This is a Solace Finance policy that covers a ", productName, " position"));
    }
}
