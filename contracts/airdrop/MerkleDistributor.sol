// Off-chain checks
// Did we send the right amount of SOLACE to this address
// Will claiming work? Unit tests.
// Will off-chain Merkle root calculator work?

// Use Custom error type?

// SPDX-License-Identifier: GPL-3.0-or-later
// Modified from https://github.com/Uniswap/merkle-distributor/blob/master/contracts/MerkleDistributor.sol
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "../interfaces/airdrop/IMerkleDistributor.sol";
// import "hardhat/console.sol";

contract MerkleDistributor is IMerkleDistributor {
    address public immutable override token;
    bytes32 public immutable override merkleRoot;

    // Keep track of who has and who hasn't claimed
    // Change from storing packed array of booleans - rationale that won't be dealing with nearly as many addresses for SOLACE airdrop
    // Prefer code readability over gas optimization in this case
    mapping(address => bool) private hasUserClaimed;

    constructor(address token_, bytes32 merkleRoot_) public {
        token = token_;
        merkleRoot = merkleRoot_;
    }

    function hasClaimed(address user) public view override returns (bool) {
        return hasUserClaimed[user];
    }

    function claim(address user, uint256 amount, bytes32[] calldata merkleProof) external override {
        require(!hasClaimed(user), "MerkleDistributor: Drop already claimed.");

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(user, amount));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), "MerkleDistributor: Invalid proof.");

        // Mark it claimed and send the token.
        hasUserClaimed[user] = true;
        require(IERC20(token).transfer(user, amount), "MerkleDistributor: Transfer failed.");

        emit Claimed(user, amount);
    }
}