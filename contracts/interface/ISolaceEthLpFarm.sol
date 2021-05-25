// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./IUniswapLpToken.sol";
import "./../SOLACE.sol";
import "./IWETH10.sol";
import "./IFarm.sol";


/**
 * @title ISolaceEthLpFarm: The base type of Master Uniswap LP farms.
 * @author solace.fi
 */
interface ISolaceEthLpFarm is IFarm {
    // Emitted when a token is deposited onto the farm.
    event TokenDeposited(address indexed _user, uint256 _token);
    // Emitted when a token is withdrawn from the farm.
    event TokenWithdrawn(address indexed _user, uint256 _token);
    // Emitted when a user is rewarded.
    event UserRewarded(address indexed _user, uint256 _amount);
    // Emitted when block reward is changed.
    event RewardsSet(uint256 _blockReward);
    // Emitted when the end block is changed.
    event FarmEndSet(uint256 _endBlock);

    /**
     * @notice Sets the appraisal function.
     * Can only be called by the current governor.
     * @param _appraisor The new appraisor.
     */
    function setAppraisor(address _appraisor) external;

    /**
     * @notice Deposit a token.
     * User will receive accumulated rewards if any.
     * @param _tokenId The id of the token to deposit.
     */
    function deposit(uint256 _tokenId) external;

    /**
     * @notice Deposit a Uniswap LP token using permit.
     * User will receive accumulated Solace rewards if any.
     * @param _depositor The depositing user.
     * @param _tokenId The id of the token to deposit.
     * @param _deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function depositSigned(address _depositor, uint256 _tokenId, uint256 _deadline, uint8 v, bytes32 r, bytes32 s) external;

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
     * @notice Mint a new Uniswap LP token then deposit it.
     * User will receive accumulated Solace rewards if any.
     * @param params parameters
     * @return tokenId The newly minted token id.
     */
    function mintAndDeposit(MintAndDepositParams calldata params) external payable returns (uint256 tokenId);

    /**
     * @notice Withdraw a token.
     * User will receive _tokenId and accumulated rewards.
     * @param _tokenId The id of the token to withdraw.
     */
    function withdraw(uint256 _tokenId) external;

    /**
     * @notice Returns the count of ERC721s that a user has deposited onto a farm.
     * @param _user The user to check count for.
     * @return The count of deposited ERC721s.
     */
    function countDeposited(address _user) external view returns (uint256);

    /**
     * @notice Returns the list of ERC721s that a user has deposited onto a farm and their values.
     * @param _user The user to list ERC721s.
     * @return The list of deposited ERC721s.
     * @return The values of the tokens.
     */
    function listDeposited(address _user) external view returns (uint256[] memory, uint256[] memory);

    /**
     * @notice Returns the id of an ERC721 that a user has deposited onto a farm and its value.
     * @param _user The user to get token id for.
     * @param _index The farm-based index of the token.
     * @return The id of the deposited ERC721.
     * @return The value of the token.
     */
    function getDeposited(address _user, uint256 _index) external view returns (uint256, uint256);

    /**
     * @notice Appraise a Uniswap LP Token.
     * Token must exist and must exist in the correct pool.
     * @param _tokenId The id of the token to appraise.
     * @return _value The token's value.
     */
    function appraise(uint256 _tokenId) external view returns (uint256 _value);

    // LP Token interface.
    function lpToken() external view returns (IUniswapLpToken);
    function solace() external view returns (SOLACE);
    function weth() external view returns (IWETH10);
    function lastRewardBlock() external view returns (uint256);   // Last time rewards were distributed or farm was updated.
    function accRewardPerShare() external view returns (uint256); // Accumulated rewards per share, times 1e12.
    function valueStaked() external view returns (uint256);       // Value of tokens staked by all farmers.
}
