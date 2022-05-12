// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "../interfaces/airdrop/IMerkleDistributor.sol";
import "../interfaces/staking/IxsLocker.sol";
import "../utils/Governable.sol";
// import "hardhat/console.sol";

contract MerkleDistributor is IMerkleDistributor, Governable {
    uint256 public constant override MAX_LOCK_DURATION = 4 * 31536000; // 4 years

    address public immutable override token; // Airdrop token
    address public immutable override xsLocker; // xsLocker contract address
    bytes32 public immutable override merkleRoot; // Merkle root

    mapping(address => bool) private hasUserClaimed; // Mapping of who has claimed airdrop.

    error LockTimeTooLong(); // Thrown if lock time parameter is too big (> 4 years or 4 * 31536000 seconds)
    error AlreadyClaimed(); // Thrown if address has already claimed.
    error NotInMerkle(); // Thrown if address/amount not in Merkle tree.
    error FailedClaimTransfer(address user, uint256 amount); // Thrown if transfer of airdrop tokens when calling claim() fails.
    error FailedLockCreation(address user, uint256 amount, uint256 lockTime); // Thrown if createLock() when calling claim() fails.
    error FailedGovernorRecover(uint256 amount); // Thrown if transfer of airdrop tokens when calling governorRecoverAirdropTokens() fails.

    /**
     * @notice Constructs `Solace Cover Product`.
     * @param token_ The address of the airdrop token.
     * @param merkleRoot_ Merkle root.
     * @param governance_ The address of the governor.
     * @param xsLocker_ The address of xsLocker.sol.
     */
    constructor(
        address token_, 
        bytes32 merkleRoot_,
        address governance_,
        address xsLocker_
    ) 
        public 
        Governable(governance_)
    {
        token = token_;
        merkleRoot = merkleRoot_;
        xsLocker = xsLocker_;
        IERC20(token_).approve(xsLocker_, type(uint256).max);
    }

    /**
     * @notice Returns true if address has claimed, false if not.
     * @param user Address of user to check.
     */
    function hasClaimed(address user) public view override returns (bool) {
        return hasUserClaimed[user];
    }

    /**
     * @notice Airdrop claim function.
     * @notice if recipient chooses not to look (lockTime == 0), airdrop tokens will be transferred directly to the user
     * @notice if the recipient chooses to lock (lockTime > 0), airdrop tokens will be sent to an xsLocker on behalf of the user
     * @dev Expect frontend to use offchain script to compute merkleProof and amount parameters, given set merkle tree
     * @param user Address of airdrop claimer.
     * @param amount Amount of airdrop to claim.
     * @param lockTime Time in seconds that lockdrop participant chose to lock for. 0 if user did not lock.
     * @param merkleProof Merkle proof or Merkle path, to calculate merkle root given this node - (user, amount).
     */
    function claim(address user, uint256 amount, uint256 lockTime, bytes32[] calldata merkleProof) external override {
        if (lockTime > MAX_LOCK_DURATION) revert LockTimeTooLong();
        if (hasUserClaimed[user]) revert AlreadyClaimed();

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(user, amount, lockTime));
        if (!MerkleProof.verify(merkleProof, merkleRoot, node)) revert NotInMerkle();

        // Mark it claimed and send the token.
        hasUserClaimed[user] = true;

        // User chose not to lock, direct transfer of $SOLACE
        if (lockTime == 0) {
            if (!IERC20(token).transfer(user, amount)) revert FailedClaimTransfer(user, amount); // Can there be a bug here if transfer returns success despite not actually transferring tokens?
        // User chose to lock, create xsLock
        } else {
            try IxsLocker(xsLocker).createLock(user, amount, block.timestamp + lockTime) {}
            catch {revert FailedLockCreation(user, amount, lockTime);}
        }

        emit Claimed(user, amount);
    }

    /**
     * @notice Governance-only function to recover airdrop tokens from this smart contract,
     * In the case that a significant amount of airdrop tokens are not claimed
     */
    function governorRecoverAirdropTokens() external override onlyGovernance {
        address governance = this.governance(); // Inefficient here, governance should be an internal variable and not a private variable
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (!IERC20(token).transfer(governance, balance)) revert FailedGovernorRecover(balance);
        emit GovernorRecoverAirdropTokens(balance);
    }
}

// Useful resources

// Modified from https://github.com/Uniswap/merkle-distributor/blob/master/contracts/MerkleDistributor.sol
// https://github.com/Anish-Agnihotri/merkle-airdrop-starter/blob/master/contracts/src/MerkleClaimERC20.sol

// Use Custom errors - https://blog.soliditylang.org/2021/04/21/custom-errors/ - instead of require strings
// Cheaper in deploy and runtime costs, able to convey dynamic information