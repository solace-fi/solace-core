// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;


/**
 * @title INftAppraiser
 * @author solace.fi
 * @notice Determines the value of NFTs.
 */
interface INftAppraiser {

    /**
     * @notice Appraises an NFT.
     * @param _tokenId The id of the token.
     * @return The token's value.
     */
    function appraise(uint256 _tokenId) external view returns (uint256);
}
