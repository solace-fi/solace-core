// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

// Contain functions to assist with encoding into and decoding out of bytes32 type.
library GaugeControllerHelper {

    function addressToBytes32(address address_) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(address_)));
    }

    function bytes32ToAddress(bytes32 word_) internal pure returns (address) {
        return address(uint160(uint256(word_)));
    }

    function voteInfoToBytes32(address voteOwner, uint256 gaugeID, uint256 votePowerBPS) internal pure returns (bytes32 word) {
        assembly {
            word := or(word, voteOwner) // [0:160] = voteOwner
            word := or(word, shr(48, shl(208, gaugeID)))  // [160:208] = uint48(gaugeID)
            word := or(word, shl(208, votePowerBPS)) // [208:256] = uint48(votePowerBPS)
        }
        return word;
    }

    function bytes32ToVoteInfo(bytes32 word) internal pure returns (address voteOwner, uint256 gaugeID, uint256 votePowerBPS) {
        assembly {
            voteOwner := or(voteOwner, and(word, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF))
            gaugeID := shr(160, or(gaugeID, and(word, 0xFFFFFFFFFFFF0000000000000000000000000000000000000000)))
            votePowerBPS := shr(208, word)
        }
        return (voteOwner, gaugeID, votePowerBPS);
    }
}