// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./../interface/INftAppraiser.sol";
import "./MockERC721.sol";


/**
 * @title Mock NFT Appraiser
 * @author solace.fi
 * @notice Determines the value of Mock NFTs.
 */
contract MockERC721Appraiser is INftAppraiser {

    address public nftContract;

    constructor(address _contract) {
        nftContract = _contract;
    }

    /**
     * @notice Appraises an NFT.
     * @param _tokenId The id of the token.
     * @return The token's value.
     */
    function appraise(uint256 _tokenId) external view override returns (uint256) {
        return MockERC721(nftContract).values(_tokenId);
    }
}
