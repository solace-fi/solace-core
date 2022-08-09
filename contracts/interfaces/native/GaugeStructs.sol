// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

library GaugeStructs {
    struct Vote {
        uint256 gaugeID;
        uint256 votePowerBPS;
    }

    /// @dev Struct pack into single 32-byte word
    /// @param _votingContractsIndex Index for _votingContracts for last incomplete updateGaugeWeights() call.
    /// @param _votersIndex Index for _voters[savedIndex_votingContracts] for last incomplete updateGaugeWeights() call.
    /// @param _votesIndex Index for _votes[savedIndex_votingContracts][savedIndex_voters] for last incomplete updateGaugeWeights() call.
    struct UpdateInfo {
        uint80 _votingContractsIndex; // [0:80]
        uint88 _votersIndex; // [80:168]
        uint88 _votesIndex; // [168:256]
    }

    struct Gauge { 
        bool active; // [0:8]
        uint248 rateOnLine; // [8:256] Max value we reasonably expect is ~20% or 2e17. We only need log 2 2e17 = ~58 bits for this.
        string name;
    }
}