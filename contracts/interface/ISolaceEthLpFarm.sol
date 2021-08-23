// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./UniswapV3/IUniswapLpToken.sol";
import "./../SOLACE.sol";
import "./IWETH9.sol";
import "./IFarm.sol";


/**
 * @title ISolaceEthLpFarm: The base type of Master Uniswap LP farms.
 * @author solace.fi
 * @notice Rewards [**Liquidity Providers**](/docs/user-docs/Liquidity%20Providers) in [**SOLACE**](./SOLACE) for providing liquidity in the [**SOLACE**](./SOLACE)-**ETH** [**Uniswap V3 Pool**](https://docs.uniswap.org/protocol/reference/core/UniswapV3Pool).
 *
 * Over the course of `startBlock` to `endBlock`, the farm distributes `blockReward` [**SOLACE**](./SOLACE) per block to all farmers split relative to the value of their deposited tokens.
 */
interface ISolaceEthLpFarm is IFarm {
    // Emitted when a token is deposited onto the farm.
    event TokenDeposited(address indexed user, uint256 token);
    // Emitted when a token is withdrawn from the farm.
    event TokenWithdrawn(address indexed user, uint256 token);
    // Emitted when a user is rewarded.
    event UserRewarded(address indexed user, uint256 amount);
    // Emitted when block reward is changed.
    event RewardsSet(uint256 blockReward);
    // Emitted when the end block is changed.
    event FarmEndSet(uint256 endBlock);

    /**
     * @notice Sets the appraisal function.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param appraisor_ The new appraisor.
     */
    function setAppraisor(address appraisor_) external;

    /**
     * @notice Deposit a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
     * User will receive accumulated [**SOLACE**](../SOLACE) rewards if any.
     * User must `ERC721.approve()` or `ERC721.setApprovalForAll()` first.
     * @param tokenID The ID of the token to deposit.
     */
    function depositLp(uint256 tokenID) external;

    /**
     * @notice Deposit a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) using permit.
     * User will receive accumulated [**SOLACE**](../SOLACE) rewards if any.
     * @param depositor The depositing user.
     * @param tokenID The ID of the token to deposit.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function depositLpSigned(address depositor, uint256 tokenID, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;

    struct MintAndDepositParams {
        address depositor;
        uint256 amountSolace;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
        int24 tickLower;
        int24 tickUpper;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /**
     * @notice Mint a new [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) then deposit it.
     * User will receive accumulated [**SOLACE**](./SOLACE) rewards if any.
     * @param params parameters
     * @return tokenID The newly minted token ID.
     */
    function mintAndDeposit(MintAndDepositParams calldata params) external payable returns (uint256 tokenID);

    /**
     * @notice Withdraw a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
     * User will receive `tokenID` and accumulated rewards.
     * Can only withdraw tokens you deposited.
     * @param tokenID The ID of the token to withdraw.
     */
    function withdrawLp(uint256 tokenID) external;

    /**
     * @notice Returns the count of [**Uniswap LP tokens**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) that a user has deposited onto the farm.
     * @param user The user to check count for.
     * @return count The count of deposited Uniswap LP tokens.
     */
    function countDeposited(address user) external view returns (uint256 count);

    /**
     * @notice Returns the list of [**Uniswap LP tokens**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) that a user has deposited onto the farm and their values.
     * @param user The user to list Uniswap LP tokens.
     * @return tokenIDs The list of deposited Uniswap LP tokens.
     * @return tokenValues The values of the tokens.
     */
    function listDeposited(address user) external view returns (uint256[] memory tokenIDs, uint256[] memory tokenValues);

    /**
     * @notice Returns the ID of a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager) that a user has deposited onto a farm and its value.
     * @param user The user to get token ID for.
     * @param index The farm-based index of the token.
     * @return tokenID The ID of the deposited [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
     * @return tokenValue The value of the token.
     */
    function getDeposited(address user, uint256 index) external view returns (uint256, uint256);

    /**
     * @notice Appraise a [**Uniswap LP token**](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
     * Token must exist and must exist in the correct pool.
     * @param tokenID The ID of the token to appraise.
     * @return tokenValue The token's value.
     */
    function appraise(uint256 tokenID) external view returns (uint256 tokenValue);

    /// @notice [`Uniswap V3 LP Token`](https://docs.uniswap.org/protocol/reference/periphery/NonfungiblePositionManager).
    function lpToken() external view returns (IUniswapLpToken);
    /// @notice Native [**SOLACE**](../SOLACE) Token.
    function solace() external view override returns (SOLACE);
    /// @notice WETH.
    function weth() external view returns (IWETH9);
    /// @notice Last time rewards were distributed or farm was updated.
    function lastRewardBlock() external view returns (uint256);
    /// @notice Accumulated rewards per share, times 1e12.
    function accRewardPerShare() external view returns (uint256);
    /// @notice Value of tokens staked by all farmers.
    function valueStaked() external view returns (uint256);
}
