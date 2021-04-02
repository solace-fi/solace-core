// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";


/**
 * @title Mock ERC-721
 * @author solace.fi
 * @notice A simple mock of an NFT to test Master.
 */
contract MockERC721 is ERC721Enumerable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdTracker;

    /// @notice The value of tokens
    mapping(uint256 => uint256) public values;

    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    /**
     * @notice Mints a new NFT.
     * @param value The value of the new token.
     */
    function mint(uint256 value) public virtual {
        uint256 tokenId = _tokenIdTracker.current();
        _mint(msg.sender, tokenId);
        values[tokenId] = value;
        _tokenIdTracker.increment();
    }
}
