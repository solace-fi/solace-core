// SPDX-License-Identifier: GPL-2.0-or-later
// code borrowed from @uniswap/v3-periphery
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title ERC721 with permit
/// @notice Extension to ERC721 that includes a permit function for signature based approvals.
interface IERC721Permit is IERC721 {
    /// @notice The permit typehash used in the permit signature.
    /// @return typehash The typehash for the permit.
    // solhint-disable-next-line func-name-mixedcase
    function PERMIT_TYPEHASH() external pure returns (bytes32 typehash);

    /// @notice The domain separator used in the permit signature.
    /// @return separator The domain seperator used in encoding of permit signature.
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32 separator);

    /// @notice Approve of a specific token ID for spending by spender via signature.
    /// @param spender The account that is being approved.
    /// @param tokenID The ID of the token that is being approved for spending.
    /// @param deadline The deadline timestamp by which the call must be mined for the approve to work.
    /// @param v Must produce valid secp256k1 signature from the holder along with `r` and `s`.
    /// @param r Must produce valid secp256k1 signature from the holder along with `v` and `s`.
    /// @param s Must produce valid secp256k1 signature from the holder along with `r` and `v`.
    function permit(
        address spender,
        uint256 tokenID,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable;
}
