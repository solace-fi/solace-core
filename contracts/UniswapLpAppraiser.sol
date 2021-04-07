// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./interface/INftAppraiser.sol";
import "./interface/IUniswapLpToken.sol";


/**
 * @title UniswapLpAppraiser
 * @author solace.fi
 * @notice Determines the value of Uniswap V3 LP NFTs.
 * The value of a Uniswap V3 LP NFT is the amount of liquidity provided multiplied by a relative value for the pool.
 * If it was not deposited into a pool that we do not care to incentivize, it's value is zero.
 * We note that there exist more elaborate value metrics such as the tick range of the position.
 * We expect Liquidity Providers to behave rationally thus liquidity is a sufficient metric.
 */
contract UniswapLpAppraiser is INftAppraiser {

    /// @notice The set of pools that we value.
    /// @dev token0 => token1 => fee => pool value
    mapping(address => mapping(address => mapping(uint24 => uint256))) public poolValue;

    /// @notice Governor.
    address public governance;

    /// @notice Address of the NFT contract.
    address public nftContract;

    /**
     * @notice Constructs the Uniswap LP Appraiser contract.
     * @param _contract The address of the token contract.
     */
    constructor(address _contract) public {
        nftContract = _contract;
        governance = msg.sender;
    }

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    /**
     * @notice Changes a pools value.
     * Can only be called by the current governor.
     * @param _token0 The address of the pool's first token.
     * @param _token1 The address of the pool's second token.
     * @param _fee The fee of the pool.
     * @param _value The new value for the pool.
     */
    function setPoolValue(address _token0, address _token1, uint24 _fee, uint256 _value) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // set value in both forwards and reverse directions
        poolValue[_token0][_token1][_fee] = _value;
        poolValue[_token1][_token0][_fee] = _value;
    }

    /**
     * @notice Appraises an NFT.
     * @param _tokenId The id of the token.
     * @return The token's value.
     */
    function appraise(uint256 _tokenId) external view override returns (uint256) {
        // get position
        (, , address token0, address token1, uint24 fee, , , uint128 liquidity, , , , ) =
        IUniswapLpToken(nftContract).positions(_tokenId);
        // value is provided liquidity multiplied by pools value
        return uint256(liquidity) * poolValue[token0][token1][fee];
    }
}
