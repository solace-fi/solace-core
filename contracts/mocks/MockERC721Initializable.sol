// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.6;

import "./../utils/ERC721Enhancedv1Initializable.sol";


/**
 * @title Mock ERC721
 * @author solace.fi
 * @notice Mock ERC721 is only used to test other contracts.
 */
contract MockERC721Initializable is ERC721Enhancedv1Initializable {

    // Count of all tokens created.
    uint256 internal _tokenCount = 0;

    /**
     * @notice Initializes the Mock Token contract.
     * @param name The name of the token.
     * @param symbol The symbol of the token.
     */
    function initialize(
        string memory name,
        string memory symbol
    ) external initializer {
        __ERC721Enhancedv1_init(name, symbol);
        __ERC721Enhancedv1_init_unchained();
    }

    /**
     * @notice Mints a new token.
     * @param recipient The recipient of the token.
     * @return tokenID The ID of the new token.
     */
    function mint(address recipient) external returns (uint256 tokenID) {
        tokenID = ++_tokenCount; // autoincrement from 1
        _mint(recipient, tokenID);
        return tokenID;
    }

    /**
     * @notice Count of all tokens created.
     * @return count Count.
     */
    function tokenCount() external view returns (uint256 count) {
        return _tokenCount;
    }

    /**
     * @notice Do a thing to a token.
     * @param tokenID The ID of the token to do stuff to.
     * @return res The result.
     */
    function doThing(uint256 tokenID) external tokenMustExist(tokenID) returns (uint256 res) {
        return tokenID * 2;
    }
}
