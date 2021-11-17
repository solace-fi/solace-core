// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Governable.sol";
import "./interface/ICapitalPool.sol";


contract CapitalPool is ICapitalPool, ReentrancyGuard, Governable {

    address internal constant _ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // Returns true if the destination is authorized to request assets.
    mapping(address => bool) internal _isAssetManager;

    constructor (address governance_) Governable(governance_) { }

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
    function manageAsset(address asset, uint256 amount, address receiver) external override nonReentrant {
        require(_isAssetManager[msg.sender], "!asset manager");
        require(receiver != address(0x0), "zero address receiver");
        uint256 transferAmount;
        if(asset == _ETH_ADDRESS) {
            transferAmount = Math.min(amount, address(this).balance);
            Address.sendValue(payable(receiver), transferAmount);
        } else {
            IERC20 asset_ = IERC20(asset);
            transferAmount = Math.min(amount, asset_.balanceOf(address(this)));
            SafeERC20.safeTransfer(asset_, receiver, transferAmount);
        }
        emit AssetsSent(asset, transferAmount, receiver);
    }

    /**
     * @notice Returns true if the destination is authorized to manage assets.
     * @param account Account to check requestability.
     * @return status True if asset manager, false if not.
     */
    function isAssetManager(address account) external view override returns (bool status) {
        return _isAssetManager[account];
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds management rights.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param manager The manager to grant rights.
     */
    function addAssetManager(address manager) external override onlyGovernance {
        require(manager != address(0x0), "zero address manager");
        _isAssetManager[manager] = true;
        emit AssetManagerAdded(manager);
    }

    /**
     * @notice Removes management rights.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param manager The manager to revoke rights.
     */
    function removeAssetManager(address manager) external override onlyGovernance {
        require(manager != address(0x0), "zero address manager");
        _isAssetManager[manager] = false;
        emit AssetManagerRemoved(manager);
    }

    /***************************************
    FALLBACK FUNCTIONS
    ***************************************/

    /**
     * @notice Fallback function to allow contract to receive *ETH*.
     */
    receive () external payable override { }

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     */
    fallback () external payable override { }
}
