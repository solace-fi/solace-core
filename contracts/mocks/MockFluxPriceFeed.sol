// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../utils/Governable.sol";
import "../interfaces/native/IFluxPriceFeed.sol";


/**
 * @title Flux first-party price feed oracle
 * @author fluxprotocol.org
 * @notice Simple data posting on chain of a scalar value, compatible with Chainlink V2 and V3 aggregator interface
 */
contract MockFluxPriceFeed is IFluxPriceFeed, Governable {

    event AnswerSet(int256 answer);

    int256 internal _latestAnswer;

    // solhint-disable-next-line no-empty-blocks
    constructor (address governance_) Governable(governance_) { }

    /**
     * @notice answer from the most recent report
     */
    function latestAnswer() external view override returns (int256) {
        return _latestAnswer;
    }

    function setAnswer(int256 answer) external onlyGovernance {
        _latestAnswer = answer;
        emit AnswerSet(answer);
    }
}
