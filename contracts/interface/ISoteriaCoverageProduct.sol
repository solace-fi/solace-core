// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface ISoteriaCoverageProduct {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a new Policy is created.
    event PolicyCreated(uint256 policyID);

    /// @notice Emitted when a Policy is updated.
    event PolicyUpdated(uint256 policyID);

    /// @notice Emitted when a Policy is closed.
    event PolicyClosed(uint256 policyID);

    /// @notice Emitted when a Policy ic deactivated.
    event PolicyDeactivated(uint256 policyID);

    /// @notice Emitted when Registry address is updated.
    event RegistrySet(address registry);

    /// @notice Emitted when pause is set.
    event PauseSet(bool pause);

    /// @notice Emitted when a deposit is made.
    event DepositMade(address from, uint256 amount);

    /// @notice Emitted when a withdraw is made.
    event WithdrawMade(address policyholder, uint256 amount);

    /// @notice Emitted when premium is charged.
    event PremiumCharged(address policyholder, uint256 amount);

    /// @notice Emitted when premium is partially charged.
    event PremiumPartiallyCharged(address policyholder, uint256 actualPremium, uint256 chargedPremium);

    /// @notice Emitted when policy manager cover amount for soteria is updated.
    event PolicyManagerUpdated(uint256 activeCoverLimit);

    /// @notice Emitted when maxChargeablePremium is set.
    event MaxChargeablePremiumSet(uint256 maxChargeablePremium);

    /// @notice Emitted when reward points are gifted.
    event RewardPointsGifted(address policyholder, uint256 amountGifted);

    /***************************************
    POLICY FUNCTIONS
    ***************************************/

    /**
     * @notice Activates policy on the behalf of the policyholder.
     * @param policyholder_ Holder of the position to cover.
     * @param coverLimit_ The value to cover in **ETH**.
     * @return policyID The ID of newly created policy.
    */
    function activatePolicy(address policyholder_, uint256 coverLimit_) external payable returns (uint256 policyID);

    /**
     * @notice Deposits funds for policy holders.
     * @param policyholder_ The holder of the policy.
    */
    function deposit(address policyholder_) external payable;

    /**
     * @notice Withdraw ETH from Soteria account to user.
     * @param amount_ Amount policyholder desires to withdraw
     */
    function withdraw(uint256 amount_) external;

    /**
     * @notice Updates the cover amount of the policy.
     * @param policyID_ The policy ID to update.
     * @param newCoverLimit_ The new value to cover in **ETH**.
    */
    function updateCoverLimit(uint256 policyID_, uint256 newCoverLimit_) external;

    /**
     * @notice Charge premiums for each policy holder.
     * @param holders_ The policy holders.
     * @param premiums_ The premium amounts in `wei` per policy holder.
    */
    function chargePremiums(address[] calldata holders_, uint256[] calldata premiums_) external payable;

    /**
     * @notice Deactivate and burn a policy.
     * User will receive their deposited funds.
     * Can only be called by the policyholder.
     * @param policyID_ The ID of the policy.
    */
    function deactivatePolicy(uint256 policyID_) external;

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
    * @notice Determine available capacity for new cover.
    * @return newCoverCapacity_ The amount of available capacity for new cover.
    */
    function newCoverCapacity() external view returns (uint256 newCoverCapacity_);

    /**
    * @notice Return reward points for a policyholder.
    * @param policyholder_ The address of the policyholder.
    * @return rewardPoints_ The reward points for a policyholder.
    */
    function rewardPointsOf(address policyholder_) external view returns (uint256 rewardPoints_);

    /**
     * @notice Returns the policyholder fund amount.
     * @param policyholder_ The address of the policyholder.
     * @return amount The amount of funds.    
    */
    function soteriaAccountBalance(address policyholder_) external view returns (uint256 amount);
   
    /**
     * @notice Returns the policyholder's policy id.
     * @param policyholder_ The address of the policyholder.
     * @return policyID The policy id.
    */
    function policyIDOf(address policyholder_) external view returns (uint256 policyID);

    /**
     * @notice Returns whether if the policy is active or not.
     * @param policyID_ The id of the policy.
     * @return status True if policy is active. False otherwise.
    */
    function policyStatus(uint256 policyID_) external view returns (bool status);

    /**
     * @notice The maximum amount of cover that `Soteria Product` can be sold.
     * @return cover The max amount of cover in `wei`
    */
    function maxCover() external view returns (uint256 cover);

    /**
     * @notice Returns  [`Registry`](./Registry) contract address.
     * @return registry_ The `Registry` address.
    */
    function registry() external view returns (address registry_);

    /**
     * @notice Returns [`RiskManager`](./RiskManager) contract address.
     * @return riskManager_ The `RiskManager` address.
    */
    function riskManager() external view returns (address riskManager_);

    /**
     * @notice Returns whether or not product is currently in paused state.
     * @return status True if product is paused.
    */
    function paused() external view returns (bool status);

    /**
     * @notice Returns active cover amount in `wei`.
     * @return amount The active cover amount.
    */
    function totalActiveCover() external view returns (uint256 amount);

    /**
     * @notice Returns the policy count.
     * @return count The policy count.
    */
    function policyCount() external view returns (uint256 count);

    /**
     * @notice Returns the max chargeable premium.
     * @return maxChargeablePremium_ the max chargeable premium.
    */
    function maxChargeablePremium() external view returns (uint256 maxChargeablePremium_);

    /**
     * @notice Returns cover amount of given policy id.
     * @param policy_ The policy id.
     * @return amount The cover amount for given policy.
    */
    function coverLimitOf(uint256 policy_) external view returns (uint256 amount);
    
    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
    */
    function setRegistry(address registry_) external;

    /**
     * @notice Pauses or unpauses buying and extending policies.
     * Deactivating policies are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param paused_ True to pause, false to unpause.
    */
    function setPaused(bool paused_) external;

    /**
     * @notice set _maxChargeablePremium.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param maxChargeablePremium_ Desired maxChargeablePremium.
    */
    function setMaxChargeablePremium(uint256 maxChargeablePremium_) external;

    /**
     * @notice Enables governance to gift 'free' cover to specific addresses.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param policyholder_ The policy holder to gift reward points to.
     * @param pointsToGift_ Amount of reward points to gift.
    */
    function giftRewardPoints(address policyholder_, uint256 pointsToGift_) external;
}