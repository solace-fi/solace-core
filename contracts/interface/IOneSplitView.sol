// code borrowed from https://etherscan.io/address/0xc3037b2a1a9e9268025ff6d45fe7095436446d52#code
pragma solidity 0.8.0;

interface IOneSplitView {
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
