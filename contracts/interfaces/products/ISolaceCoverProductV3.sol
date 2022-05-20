// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../payment/ISCPRetainer.sol";

interface ISolaceCoverProductV3 is IERC721, ISCPRetainer {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a new Policy is created.
    event PolicyCreated(uint256 policyID);

    /// @notice Emitted when a Policy is updated.
    event PolicyUpdated(uint256 policyID);

    /// @notice Emitted when a Policy is deactivated.
    event PolicyCanceled(uint256 policyID);

    /// @notice Emitted when Registry address is updated.
    event RegistrySet(address registry);

    /// @notice Emitted when pause is set.
    event PauseSet(bool pause);

    /// @notice Emitted when latest charged time is set.
    event LatestChargedTimeSet(uint256 timestamp);

    /// @notice Emitted when maxRate is set.
    event MaxRateSet(uint256 maxRateNum, uint256 maxRateDenom);

    /// @notice Emitted when chargeCycle is set.
    event ChargeCycleSet(uint256 chargeCycle);

    /// @notice Emitted when baseURI is set
    event BaseURISet(string baseURI);

    /// @notice Emitted when debt is added for policyholder.
    event DebtSet(address policyholder, uint256 debtAmount);

    /***************************************
    POLICY FUNCTIONS
    ***************************************/

    /**
     * @notice Activates policy for `msg.sender`.
     * @param _user The account to purchase policy. 
     * @param _coverLimit The maximum value to cover in **USD**.
     * @return policyID The ID of the newly minted policy.
     */
    function purchaseFor(address _user, uint256 _coverLimit) external returns (uint256 policyID);

    /**
     * @notice Activates policy for `msg.sender`.
     * @param _coverLimit The maximum value to cover in **USD**.
     * @return policyID The ID of the newly minted policy.
     */
    function purchase(uint256 _coverLimit) external returns (uint256 policyID);
  
    /**
     * @notice Cancels the policy.
     * The function cancels the policy of the policyholder.
     */
    function cancel() external;

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The maximum amount of cover that can be sold in **USD** to 18 decimals places.
     * @return cover The max amount of cover.
     */
    function maxCover() external view returns (uint256 cover);

    /**
     * @notice Returns the active cover limit in **USD** to 18 decimal places. In other words, the total cover that has been sold at the current time.
     * @return amount The active cover limit.
     */
    function activeCoverLimit() external view returns (uint256 amount);

    /**
     * @notice Determine the available remaining capacity for new cover.
     * @return availableCoverCapacity_ The amount of available remaining capacity for new cover.
     */
    function availableCoverCapacity() external view returns (uint256 availableCoverCapacity_);

    /**
     * @notice Returns true if the policy is active, false if inactive
     * @param policyID_ The policy ID.
     * @return status True if policy is active. False otherwise.
     */
    function policyStatus(uint256 policyID_) external view returns (bool status);
  
    /**
     * @notice Calculate minimum required account balance for a given cover limit. Equals the maximum chargeable fee for one epoch.
     * @param coverLimit Cover limit.
     */
    function minRequiredAccountBalance(uint256 coverLimit) external view returns (uint256 minRequiredAccountBalance_);

    /**
     * @notice Calculates the policy cancellation fee.
     * @param policyID The policy id.
     * @return fee The cancellation fee.
    */
    function calculateCancelFee(uint256 policyID) external view returns (uint256 fee);

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
     * @notice Pauses or unpauses policies.
     * Deactivating policies are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param paused_ True to pause, false to unpause.
     */
    function setPaused(bool paused_) external;

    /**
     * @notice set _maxRate.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param maxRateNum_ Desired maxRateNum.
     * @param maxRateDenom_ Desired maxRateDenom.
     */
    function setMaxRate(uint256 maxRateNum_, uint256 maxRateDenom_) external;

    /**
     * @notice set _chargeCycle.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param chargeCycle_ Desired chargeCycle.
     */
    function setChargeCycle(uint256 chargeCycle_) external;

    /**
     * @notice Sets the base URI for computing `tokenURI`.
     * @param baseURI_ The new base URI.
     */
    function setBaseURI(string memory baseURI_) external;

    /***************************************
    PREMIUM COLLECTOR FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the latest premium charged time.
     * @param _timestamp The timestamp value when the premiums are charged.
    */
    function setChargedTime(uint256 _timestamp) external;

     /**
     * @notice Add debts for each policy holder. Can only be called by the **Premium Collector** role.
     * @param _policyholders The array of addresses of the policyholders to add debt.
     * @param _debts The array of debt amounts (in **USD** to 18 decimal places) for each policyholder.
     */
    function setDebts(address[] calldata _policyholders, uint256[] calldata _debts) external;
}
