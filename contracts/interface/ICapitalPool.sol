// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;


interface ICapitalPool {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when an asset manager is added.
    event AssetManagerAdded(address assetManager);
    /// @notice Emitted when an asset manager is removed.
    event AssetManagerRemoved(address assetManager);
    /// @notice Emitted when assets are sent
    event AssetsSent(address asset, uint256 amount, address dst);

    /***************************************
    ASSET MANAGER FUNCTIONS
    ***************************************/

    /**
     * @notice Sends **ETH** or **ERC20** to other users or contracts. The users or contracts should be authorized managers.
     * Can only be called by authorized `managers`.
     * @param asset The asset to manage.
     * @param amount The amount wanted.
     * @param receiver The asset receiver.
     */
    function manageAsset(address asset, uint256 amount, address receiver) external;

    /**
     * @notice Returns true if the destination is authorized to manage assets.
     * @param account Account to check requestability.
     * @return status True if asset manager, false if not.
     */
    function isAssetManager(address account) external view returns (bool status);

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds management rights.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param manager The manager to grant rights.
     */
    function addAssetManager(address manager) external;

    /**
     * @notice Removes management rights.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param manager The manager to revoke rights.
     */
    function removeAssetManager(address manager) external;

    /***************************************
    FALLBACK FUNCTIONS
    ***************************************/

    /**
     * @notice Fallback function to allow contract to receive *ETH*.
     * Does _not_ mint shares.
     */
    receive () external payable;

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     * Does _not_ mint shares.
     */
    fallback () external payable;
}
