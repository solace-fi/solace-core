// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface ISoteriaCoverageProduct {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a new Policy is created.
    event PolicyCreated(uint256 policyID);

    /// @notice Emitted when Registry address is updated.
    event RegistrySet(address registry);

    /// @notice Emitted when pause is set.
    event PauseSet(bool pause);

    /// @notice Emitted when a deposit mande.
    event DepositMade(address from, uint256 amount);

    /// @notice Emitted when premium is charged.
    event PremiumCharged(address policyholder, uint256 amount);

    /***************************************
    POLICY FUNCTIONS
    ***************************************/

    /**
     * @notice  Purchases and mints a policy on the behalf of the policyholder.
     * @param policyholder_ Holder of the position to cover.
     * @param coverAmount_ The value to cover in **ETH**
     * @return policyID The ID of newly created policy.
    */
    function buyPolicy(address policyholder_, uint256 coverAmount_) external payable returns (uint256 policyID);

    /**
     * @notice Deposits funds for policy holders.
     * @param policyholder_ The holder of the policy.
    */
    function deposit(address policyholder_) external payable;

    /**
     * @notice Charge premiums for each policy holder.
     * @param holders_ The policy holders.
     * @param premiums_ The premium amounts in `wei` per policy holder.
    */
    function chargePremiums(address[] calldata holders_, uint256[] calldata premiums_) external payable;

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
    * @notice Given a request for coverage, determines if that risk is acceptable and if so at what price.
    * @param currentCover_ If updating an existing policy's cover amount, the current cover amount, otherwise 0.
    * @param newCover_ The cover amount requested.
    * @return acceptable True if risk of the new cover is acceptable, false otherwise.
    */
    function assessRisk(uint256 currentCover_, uint256 newCover_) external view returns (bool acceptable);
    
    /**
     * @notice Returns the policy holder fund amount.
     * @param policyHolder_ The address of the policy holder.
     * @return amount The amount of funds.    
    */
    function funds(address policyHolder_) external view returns (uint256 amount);
   
    /**
     * @notice Returns the policy holder's policy id.
     * @param policyHolder_ The address of the policy holder.
     * @return policyID The policy id.
    */
    function policyByOwner(address policyHolder_) external view returns (uint256 policyID);

    /**
     * @notice Returns the policy holder debt amount.
     * @param policyHolder_ The address of the policy holder.
     * @return debt The amount of dept.    
    */
    function debts(address policyHolder_) external view returns (uint256 debt);

    /**
     * @notice Returns the policy owner policy for given policy id.
     * @param policyID_ The policy id.
     * @return owner The address of the policy holder.
    */
    function ownerOfPolicy(uint256 policyID_) external view returns (address owner);

    /**
     * @notice Returns all policy holders.
     * @return holders The array of policy holders.
    */
    function policyholders() external view returns (address[] memory holders);

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
    function activeCoverAmount() external view returns (uint256 amount);

    /**
     * @notice Returns the policy count.
     * @return count The policy count.
    */
    function policyCount() external view returns (uint256 count);

    /**
     * @notice Returns cover amount of given policy id.
     * @param policy_ The policy id.
     * @return amount The cover amount for given policy.
    */
    function coverAmountOf(uint256 policy_) external view returns (uint256 amount);

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
     * Cancelling policies and submitting claims are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param paused_ True to pause, false to unpause.
    */
    function setPaused(bool paused_) external; 

}