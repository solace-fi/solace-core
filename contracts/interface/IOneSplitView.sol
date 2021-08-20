// SPDX-License-Identifier: NONE
// code borrowed from https://etherscan.io/address/0xc3037b2a1a9e9268025ff6d45fe7095436446d52#code
pragma solidity 0.8.6;

/**
 * @title IOneSplitView
 * @author 1inch
 * @notice Interface for 1inch on-chain DeFi aggregation protocol
 */
interface IOneSplitView {
    /// @notice Calculate expected returning amount of `toToken`.
    /// @param fromToken Address of token or `address(0)` for Ether.
    /// @param toToken Address of token or `address(0)` for Ether.
    /// @param amount Amount for `fromToken`.
    /// @param parts Number of pieces source volume could be splitted.
    /// @param flags Flags for enabling and disabling some features, default 0.
    /// @return returnAmount Amount for `toToken`.
    /// @return distribution Relative amount sent through various protocols.
    function getExpectedReturn(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 parts,
        uint256 flags
    )
        external
        view
        returns(
            uint256 returnAmount,
            uint256[] memory distribution
        );
}
