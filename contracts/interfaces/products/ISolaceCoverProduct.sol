// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface ISolaceCoverProduct {
    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a new Policy is created.
    event PolicyCreated(uint256 policyID);

    /// @notice Emitted when a Policy is updated.
    event PolicyUpdated(uint256 policyID);

    /// @notice Emitted when a Policy is deactivated.
    event PolicyDeactivated(uint256 policyID);

    /// @notice Emitted when Registry address is updated.
    event RegistrySet(address registry);

    /// @notice Emitted when pause is set.
    event PauseSet(bool pause);

    /// @notice Emitted when a user enters cooldown mode.
    event CooldownStarted(address policyholder, uint256 startTime);

    /// @notice Emitted when a user leaves cooldown mode.
    event CooldownStopped(address policyholder);

    /// @notice Emitted when the cooldown period is set.
    event CooldownPeriodSet(uint256 cooldownPeriod);

    /// @notice Emitted when a deposit is made.
    event DepositMade(
        address from,
        address policyholder,
        uint256 amount
    );

    /// @notice Emitted when a withdraw is made.
    event WithdrawMade(address policyholder, uint256 amount);

    /// @notice Emitted when premium is charged.
    event PremiumCharged(address policyholder, uint256 amount);

    /// @notice Emitted when premium is partially charged.
    event PremiumPartiallyCharged(
        address policyholder,
        uint256 actualPremium,
        uint256 chargedPremium
    );

    /// @notice Emitted when policy manager cover amount for soteria is updated.
    event PolicyManagerUpdated(uint256 activeCoverLimit);

    /// @notice Emitted when maxRateNum is set.
    event MaxRateNumSet(uint256 maxRateNum);

    /// @notice Emitted when maxRateDenom is set.
    event MaxRateDenomSet(uint256 maxRateDenom);

    /// @notice Emitted when chargeCycle is set.
    event ChargeCycleSet(uint256 chargeCycle);

    /// @notice Emitted when reward points are set.
    event RewardPointsSet(address policyholder, uint256 amountGifted);

    /// @notice Emitted when isReferralOn is set
    event IsReferralOnSet(bool isReferralOn);

    /// @notice Emitted when referralReward is set.
    event ReferralRewardSet(uint256 referralReward);

    /// @notice Emitted when referral rewards are earned;
    event ReferralRewardsEarned(
        address rewardEarner,
        uint256 rewardPointsEarned
    );

    /// @notice Emitted when stablecoin is added to accepted stablecoin list
    event StablecoinAdded(address stablecoin);

    /// @notice Emitted when stablecoin is removed from accepted stablecoin list
    event StablecoinRemoved(address stablecoin);

    /***************************************
    POLICY FUNCTIONS
    ***************************************/

    /**
     * @notice Activates policy on the behalf of the policyholder.
     * @param policyholder_ Holder of the position to cover.
     * @param coverLimit_ The value to cover in **USD**.
     * @param amount_ The amount to deposit in order to activate the policy.
     * @param referralCode_ Referral code
     * @return policyID The ID of newly created policy.
     */
    function activatePolicy(
        address policyholder_,
        uint256 coverLimit_,
        uint256 amount_,
        bytes calldata referralCode_
    ) external returns (uint256 policyID);

    /**
     * @notice Deposits funds for policy holders.
     * @param policyholder The holder of the policy.
     * @param amount The amount to deposit.
     */
    function deposit(
        address policyholder, 
        uint256 amount
    ) external;

    /**
     * @notice Withdraw funds from Soteria account to user.
     */
    function withdraw() external;

    /**
     * @notice Updates the cover amount of your policy
     * @notice If you update the cover limit for your policy, you will exit the cooldown process if you already started it. This means that if you want to withdraw all your funds, you have to redo the 'deactivatePolicy() => withdraw()' process
     * @param newCoverLimit_ The new value to cover in **USD**.
     * @param referralCode_ Referral code
     */
    function updateCoverLimit(
        uint256 newCoverLimit_, 
        bytes calldata referralCode_
    ) external;

    /**
     * @notice Deactivate a user's own policy.
     * User will receive their entire Soteria account balance.
     */
    function deactivatePolicy() external;

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns the user balance in `USD`.
     * @param policyholder The address to get balance.
     * @return balance The user balance in `USD`.
     */
    function accountBalanceOf(address policyholder) external view returns (uint256 balance);

    /**
     * @notice Determine available capacity for new cover.
     * @return availableCoverCapacity_ The amount of available capacity for new cover.
     */
    function availableCoverCapacity() external view returns (uint256 availableCoverCapacity_);

    /**
     * @notice Return reward points for a policyholder.
     * @param policyholder_ The address of the policyholder.
     * @return rewardPoints_ The reward points for a policyholder.
     */
    function rewardPointsOf(address policyholder_) external view returns (uint256 rewardPoints_);

    /**
     * @notice Returns the policyholder's policy id.
     * @param policyholder_ The address of the policyholder.
     * @return policyID The policy id.
     */
    function policyOf(address policyholder_) external view returns (uint256 policyID);

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
     * @notice Returns active cover limit in `wei`.
     * @return amount The active cover limit.
     */
    function activeCoverLimit() external view returns (uint256 amount);

    /**
     * @notice Returns the policy count.
     * @return count The policy count.
     */
    function policyCount() external view returns (uint256 count);

    /**
     * @notice Returns the max rate numerator.
     * @return maxRateNum_ the max rate numerator.
     */
    function maxRateNum() external view returns (uint256 maxRateNum_);

    /**
     * @notice Returns the max rate denominator.
     * @return maxRateDenom_ the max rate denominator.
     */
    function maxRateDenom() external view returns (uint256 maxRateDenom_);

    /**
     * @notice Returns the charge cycle duration.
     * @return chargeCycle_ the charge cycle duration.
     */
    function chargeCycle() external view returns (uint256 chargeCycle_);

    /**
     * @notice Returns cover amount of given policy id.
     * @param policy_ The policy id.
     * @return amount The cover amount for given policy.
     */
    function coverLimitOf(uint256 policy_) external view returns (uint256 amount);

    /**
     * @notice The minimum amount of time a user must wait to withdraw funds.
     * @return cooldownPeriod_ The cooldown period in seconds.
     */
    function cooldownPeriod() external view returns (uint256 cooldownPeriod_);

    /**
     * @notice The timestamp that a depositor's cooldown started.
     * @param policyholder_ The policy holder
     * @return cooldownStart_ The cooldown period start expressed as Unix timestamp
     */
    function cooldownStart(address policyholder_) external view returns (uint256 cooldownStart_);

    /**
     * @notice Gets the referral reward
     * @return referralReward_ The referral reward
     */
    function referralReward() external view returns (uint256 referralReward_);

    /**
     * @notice Gets whether the referral campaign is active or not
     * @return isReferralOn_ True if referral campaign active, false if not
     */
    function isReferralOn() external view returns (bool isReferralOn_);

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
     * @notice Sets the cooldown period that a user must wait after deactivating their policy, to withdraw funds from their Soteria account.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param cooldownPeriod_ Cooldown period in seconds.
     */
    function setCooldownPeriod(uint256 cooldownPeriod_) external;

    /**
     * @notice set _maxRateNum.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param maxRateNum_ Desired maxRateNum.
     */
    function setMaxRateNum(uint256 maxRateNum_) external;

    /**
     * @notice set _maxRateDenom.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param maxRateDenom_ Desired maxRateDenom.
     */
    function setMaxRateDenom(uint256 maxRateDenom_) external;

    /**
     * @notice set _chargeCycle.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param chargeCycle_ Desired chargeCycle.
     */
    function setChargeCycle(uint256 chargeCycle_) external;

    /**
     * @notice set _referralReward
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param referralReward_ Desired referralReward.
    */
    function setReferralReward(uint256 referralReward_) external;

    /**
     * @notice set _isReferralOn
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param isReferralOn_ Desired state of referral campaign.
    */
    function setIsReferralOn(bool isReferralOn_) external;

    /***************************************
    COVER PROMOTION ADMIN FUNCTIONS
    ***************************************/

    /**
     * @notice Enables cover promotion admin to gift (and remove) 'free' cover to specific addresses.
     * Can only be called by the current cover promotion admin.
     * @param policyholder_ The policy holder to set reward points for.
     * @param rewardPoints_ Desired amount of reward points.
     */
    function setRewardPoints(
        address policyholder_, 
        uint256 rewardPoints_
    ) external;

    /***************************************
    PREMIUM COLLECTOR FUNCTIONS
    ***************************************/

    /**
     * @notice Charge premiums for each policy holder.
     * @param holders_ The policy holders.
     * @param premiums_ The premium amounts in `wei` per policy holder.
     */
    function chargePremiums(
        address[] calldata holders_,
        uint256[] calldata premiums_
    ) external;
}
