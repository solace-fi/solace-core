// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./interface/ICoverageDataProvider.sol";
import "./interface/IRegistry.sol";
import "./interface/IVault.sol";

/**
 * @title ICoverageDataProvider
 * @author solace.fi
 * @notice Calculates the maximum amount of cover that `Solace` protocol can sell as a coverage. 
*/
contract CoverageDataProvider is ICoverageDataProvider {

    /// @notice Registry contract.
    IRegistry internal immutable _registry;

    constructor(address registry_) {
      require(registry_ != address(0x0), "zero address registry");
      _registry = IRegistry(registry_);
    }

    /**
     * @notice The maximum amount of cover that Solace as a whole can sell.
     * @return cover The max amount of cover in wei.
    */
    function maxCover() external view override returns (uint256 cover) {
        address vault = _registry.vault();
        require(vault != address(0x0), "zero address vault");
        return IVault(payable(vault)).totalAssets();
    }
}
