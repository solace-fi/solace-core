// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IUniswapLpToken.sol";


/**
 * @title ILpAppraisor
 * @author solace.fi
 * @notice Determines the relative value of a Uniswap V3 LP token. Used in [SolaceEthLpFarm](../SolaceEthLpFarm).
 */
interface ILpAppraisor {

    /// @notice The address of the Uniswap V3 NFT.
    function lpToken() external view returns (IUniswapLpToken);

    /**
     * @notice Appraise a Uniswap LP Token.
     * @param _tokenId The id of the token to appraise.
     * @return _value The token's value.
     */
    function appraise(uint256 _tokenId) external view returns (uint256 _value);
}
