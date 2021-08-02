// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

interface ILpAppraisor {
    /**
     * @notice Appraise a Uniswap LP Token.
     * @param _tokenId The id of the token to appraise.
     * @return _value The token's value.
     */
    function appraise(uint256 _tokenId) external view returns (uint256 _value);
}
