// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../utils/IERC721Enhanced.sol";
import "../utils/IGovernable.sol";


interface ISolaceNative is IERC721Enhanced, IGovernable {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a new Policy is created.
    event PolicyCreated(uint256 policyID);

    /// @notice Emitted when a Policy is activated.
    event PolicyActivated(uint256 policyID);

    /// @notice Emitted when IUWP is set.
    event IuwpSet(address iuwp);

    /// @notice Emitted when SOLACE is streamed into a lock
    event Streamed(uint256 policyID, uint256 amount);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice [**SOLACE**](./../../SOLACE) token.
    function solace() external view returns (address);

    /// @notice The [`xsLocker`](./../../staking/xsLocker) contract.
    function xsLocker() external view returns (address);

    /// @notice The industry underwriting pool.
    function iuwp() external view returns (address);

    /// @notice The total number of policies created.
    function totalPolicyCount() external view returns (uint256);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    struct Policy {
        uint8 status;
        uint40 startTime;
        uint40 duration;
        address token;
        uint256 tokenAmount;
        uint256 solaceAmountTotal;
        uint256 solaceAmountStreamed;
        uint256 xsLockID;
    }

    /**
     * @notice Returns information about a policy.
     * The policy must exist.
     * @param policyID The ID of the policy to query.
     * @return policy The policy info as a Policy struct.
     */
    function policies(uint256 policyID) external view returns (Policy memory policy);

    /**
     * @notice The timestamp that the policy will end.
     * Reverts if policy does not exist.
     * Returns zero if time not yet determined.
     * @param policyID The ID of the policy to query.
     * @return end The end timestamp.
     */
    function endTime(uint256 policyID) external view returns (uint40 end);

    /***************************************
    POLICYHOLDER FUNCTIONS
    ***************************************/

    /**
     * @notice Activates a policy.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy to activate.
     */
    function activatePolicy(uint256 policyID) external;

    /**
     * @notice Streams [**SOLACE**](./../SOLACE) into the policyholder's [**xsLock**](../xsLocker).
     * @param policyID The ID of the policy to query.
     */
    function stream(uint256 policyID) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Creates a new policy. The policy does nothing until activated by the policyholder.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param policyholder The owner of the newly minted policy.
     * @param startTime The timestamp that the policy starts, or max uint40 for start on activation.
     * @param duration The duration that the policy will remain active in seconds.
     * @param token The token that the policy holder must deposit to activate the policy.
     * @param tokenAmount The amount of the token to deposit.
     * @param solaceAmount The amount of [**SOLACE**](./../../SOLACE) that will be streamed into the policyholder's lock over the life of the policy.
     * @return policyID The ID of the newly minted policy.
     */
    function createPolicy(address policyholder, uint40 startTime, uint40 duration, address token, uint256 tokenAmount, uint256 solaceAmount) external returns (uint256 policyID);

    /**
     * @notice Rescues tokens that may have been accidentally transferred in.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param token The token to rescue.
     * @param amount Amount of the token to rescue.
     */
    function rescueTokens(address token, uint256 amount) external;

    /**
     * @notice Sets the IUWP address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param iuwp_ The address of IUWP.
     */
    function setIUWP(address iuwp_) external;

    /**
     * @notice Sets the base URI for computing `tokenURI`.
     * @param baseURI_ The new base URI.
     */
    function setBaseURI(string memory baseURI_) external;
}
