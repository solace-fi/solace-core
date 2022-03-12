// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../utils/ERC721Enhanced.sol";
import "../utils/Governable.sol";
import "../interfaces/ISOLACE.sol";
import "../interfaces/utils/IRegistry.sol";
import "../interfaces/staking/IxsLocker.sol";
import "../interfaces/products/ISolaceNative.sol";


/**
 * @title SolaceNative
 * @author solace.fi
 * @notice A Solace insurance product that covers entire DAOs and protocols.
 */
contract SolaceNative is
    ISolaceNative,
    ERC721Enhanced,
    ReentrancyGuard,
    Governable
{

    /***************************************
    STATE VARIABLES
    ***************************************/

    /// @notice [**SOLACE**](./../SOLACE) token.
    address public override solace;

    /// @notice The [**xsLocker**](../xsLocker) contract.
    address public override xsLocker;

    /// @notice The industry underwriting pool.
    address public override iuwp;

    uint8 public constant PENDING = 1;
    uint8 public constant ACTIVE = 2;

    mapping(uint256 => Policy) internal _policies;

    /// @notice The total policy count.
    uint256 public override totalPolicyCount;

    /**
     * @notice Constructs Solace Native Contract.
     * @param governance_ The address of the governor.
     * @param registry_ The [`Registry`](./Registry) contract address.
     */
    constructor(
        address governance_,
        address registry_
    )
        ERC721Enhanced("Solace Native Policy", "SNP")
        Governable(governance_)
    {
        require(registry_ != address(0x0), "zero address registry");
        IRegistry registry = IRegistry(registry_);
        bool success;
        address addr;
        (success, addr) = registry.tryGet("solace");
        require(success, "zero address solace");
        solace = addr;
        (success, addr) = registry.tryGet("xslocker");
        require(success, "zero address xslocker");
        xsLocker = addr;
        (success, addr) = registry.tryGet("iuwp");
        require(success, "zero address iwup");
        iuwp = addr;
        ISOLACE(solace).approve(xsLocker, type(uint256).max);
        _setBaseURI(string(abi.encodePacked("https://stats.solace.fi/native/?chainID=", Strings.toString(block.chainid), "&policyID=")));
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Returns information about a policy.
     * The policy must exist.
     * @param policyID The ID of the policy to query.
     * @return policy The policy info as a Policy struct.
     */
    function policies(uint256 policyID) external view override tokenMustExist(policyID) returns (Policy memory policy) {
        return _policies[policyID];
    }

    /**
     * @notice The timestamp that the policy will end.
     * Reverts if policy does not exist.
     * Returns zero if time not yet determined.
     * @param policyID The ID of the policy to query.
     * @return end The end timestamp.
     */
    function endTime(uint256 policyID) external view override tokenMustExist(policyID) returns (uint40 end) {
        Policy memory policy = _policies[policyID];
        return (policy.startTime == type(uint40).max)
            ? 0
            : policy.startTime + policy.duration;
    }

    /***************************************
    POLICYHOLDER FUNCTIONS
    ***************************************/

    /**
     * @notice Activates a policy.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy to activate.
     */
    function activatePolicy(uint256 policyID) external override {
        Policy memory policy = _policies[policyID];
        // checks
        require(policy.status == PENDING, "policy not pending");
        address policyholder = ownerOf(policyID);
        require(msg.sender == policyholder, "!policyholder");
        // tokens
        SafeERC20.safeTransferFrom(IERC20(policy.token), policyholder, iuwp, policy.tokenAmount);
        // record
        policy.status = ACTIVE;
        if(policy.startTime == type(uint40).max) policy.startTime = uint40(block.timestamp);
        _policies[policyID] = policy;
        emit PolicyActivated(policyID);
        // set and transfer lock
        IxsLocker locker = IxsLocker(xsLocker);
        locker.extendLock(policy.xsLockID, policy.startTime + policy.duration);
        locker.transfer(policyholder, policy.xsLockID);
    }

    /**
     * @notice Streams [**SOLACE**](./../SOLACE) into the policyholder's [**xsLock**](../xsLocker).
     * @param policyID The ID of the policy to query.
     */
    function stream(uint256 policyID) external override tokenMustExist(policyID) {
        Policy memory policy = _policies[policyID];
        // math
        // no solace if policy inactive or not yet started
        if(policy.status != ACTIVE || block.timestamp < policy.startTime) return;
        // solace vested over time
        uint256 vested = (block.timestamp > (policy.startTime + policy.duration))
            ? policy.solaceAmountTotal // fully vested
            : policy.solaceAmountTotal * (block.timestamp - policy.startTime) / policy.duration;
        // solace already streamed
        if(vested <= policy.solaceAmountStreamed) return;
        uint256 stream = vested - policy.solaceAmountStreamed;
        // ensure lock exists, create new one if not
        IxsLocker locker = IxsLocker(xsLocker);
        if(!locker.exists(policy.xsLockID)) {
            policy.xsLockID = IxsLocker(xsLocker).createLock(ownerOf(policyID), 0, policy.startTime + policy.duration);
        }
        // mint new solace
        ISOLACE(solace).mint(address(this), stream);
        // deposit to lock
        locker.increaseAmount(policy.xsLockID, stream);
        // record
        policy.solaceAmountStreamed += stream;
        _policies[policyID] = policy;
        emit Streamed(policyID, stream);
    }

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
    function createPolicy(address policyholder, uint40 startTime, uint40 duration, address token, uint256 tokenAmount, uint256 solaceAmount) external override onlyGovernance returns (uint256 policyID) {
        require(policyholder != address(0x0), "zero address policyholder");
        policyID = ++totalPolicyCount;
        uint256 xsLockID = IxsLocker(xsLocker).createLock(address(this), 0, 0);
        _policies[policyID] = Policy({
            status: PENDING,
            startTime: startTime,
            duration: duration,
            token: token,
            tokenAmount: tokenAmount,
            solaceAmountTotal: solaceAmount,
            solaceAmountStreamed: 0,
            xsLockID: xsLockID
        });
        _mint(policyholder, policyID);
        emit PolicyCreated(policyID);
    }

    /**
     * @notice Rescues tokens that may have been accidentally transferred in.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param token The token to rescue.
     * @param amount Amount of the token to rescue.
     */
    function rescueTokens(address token, uint256 amount) external override onlyGovernance {
        SafeERC20.safeTransfer(IERC20(token), iuwp, amount);
    }

    /**
     * @notice Sets the IUWP address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param iuwp_ The address of IUWP.
     */
    function setIUWP(address iuwp_) external override onlyGovernance {
        require(iuwp_ != address(0x0), "zero address iuwp");
        iuwp = iuwp_;
        emit IuwpSet(iuwp_);
    }

    /**
     * @notice Sets the base URI for computing `tokenURI`.
     * @param baseURI_ The new base URI.
     */
    function setBaseURI(string memory baseURI_) external override onlyGovernance {
        _setBaseURI(baseURI_);
    }
}
