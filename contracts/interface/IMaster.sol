// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;


/**
 * @title IMaster: Distributor of solace.fi
 * @author solace.fi
 * @notice The interface for the SOLACE token distributor.
 */
interface IMaster {

    /**
     * @notice Constructs a new farm for an ERC20 token.
     * @param _token The token to deposit.
     * @param _allocPoints Relative amount of solace rewards to distribute per block.
     * @param _startBlock When the farm will start.
     * @param _endBlock When the farm will end.
     * @return ID of the new farm.
     */
    function createFarmErc20(
        address _token,
        uint256 _allocPoints,
        uint256 _startBlock,
        uint256 _endBlock
    ) external returns (uint256);

    /**
     * @notice Constructs a new farm for an ERC721 token.
     * @param _token The token to deposit.
     * @param _appraiser The appraiser contract.
     * @param _allocPoints Relative amount of solace rewards to distribute per block.
     * @param _startBlock When the farm will start.
     * @param _endBlock When the farm will end.
     * @return ID of the new farm.
     */
    function createFarmErc721(
        address _token,
        address _appraiser,
        uint256 _allocPoints,
        uint256 _startBlock,
        uint256 _endBlock
    ) external returns (uint256);

    /**
     * @notice Sets the Solace reward distribution across all farms.
     * Optionally updates all farms.
     * @param _solacePerBlock Amount of solace to distribute per block.
     * @param _withUpdate If true, updates all farms.
     */
    function setSolacePerBlock(uint256 _solacePerBlock, bool _withUpdate) external;

    /**
     * @notice Set a farm's allocation and end block.
     * Optionally updates all farms.
     * @dev This should be two methods, setAllocation() and setEndBlock().
     * It is more gas efficient to use a single method.
     * Need to set allocation of multiple farms?
     * Save even more gas by only using _withUpdate on the last farm.
     * @param _farmId The farm to set allocation for.
     * @param _allocPoints The farm's new allocation points.
     * @param _endBlock The farm's new end block.
     * @param _withUpdate If true, updates all farms.
     */
    function setFarmParams(
        uint256 _farmId,
        uint256 _allocPoints,
        uint256 _endBlock,
        bool _withUpdate
    ) external;

    /**
     * @notice Deposit some ERC20 tokens.
     * @param _farmId The farm to deposit to.
     * @param _amount The deposit amount.
     */
    function depositErc20(uint256 _farmId, uint256 _amount) external;

    /**
     * @notice Deposit an ERC721 token.
     * @param _farmId The farm to deposit to.
     * @param _token The deposit token.
     */
    function depositErc721(uint256 _farmId, uint256 _token) external;

    /**
     * @notice Withdraw some ERC20 tokens.
     * User will receive _amount of CP/LP tokens and accumulated Solace rewards.
     * @param _farmId The farm to withdraw from.
     * @param _amount The withdraw amount.
     */
    function withdrawErc20(uint256 _farmId, uint256 _amount) external;

    /**
     * @notice Withdraw an ERC721 token.
     * User will receive _token and accumulated Solace rewards.
     * @param _farmId The farm to withdraw from.
     * @param _token The withdraw token.
     */
    function withdrawErc721(uint256 _farmId, uint256 _token) external;
    
    /**
    * @notice Updates farm information to be up to date to the current block.
    * @param _farmId The farm to update.
    */
    function updateFarm(uint256 _farmId) external;

    /**
    * @notice Updates all farms to be up to date to the current block.
    */
    function massUpdateFarms() external;

    /**
     * @notice Calculates the accumulated balance of reward token for specified user.
     * @param _farmId The farm to measure rewards for.
     * @param _user The user for whom unclaimed tokens will be shown.
     * @return Total amount of withdrawable reward tokens.
     */
    function pendingReward(uint256 _farmId, address _user) external view returns (uint256);

    /**
     * @notice Calculates the reward multiplier over the given _from until _to block.
     * @param _farmId The farm to measure rewards for.
     * @param _from The start of the period to measure rewards for.
     * @param _to The end of the period to measure rewards for.
     * @return The weighted multiplier for the given period.
     */
    function getMultiplier(uint256 _farmId, uint256 _from, uint256 _to) external view returns (uint256);
}
