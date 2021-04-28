// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./IFarm.sol";


/**
 * @title IErc721Farm: The base type of Master ERC721 farms.
 * @author solace.fi
 */
interface IErc721Farm is IFarm {

    // Emitted when a token is deposited onto the farm.
    event Deposit(address indexed _user, uint256 _token);
    // Emitted when a token is withdrawn from the farm.
    event Withdraw(address indexed _user, uint256 _token);

    /**
     * @notice Deposit a token.
     * User will receive accumulated rewards if any.
     * @param _token The deposit token.
     */
    function deposit(uint256 _token) external;

    /**
     * @notice Withdraw a token.
     * User will receive _token and accumulated rewards.
     * @param _token The withdraw token.
     */
    function withdraw(uint256 _token) external;

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

    function stakeToken() external view returns (address);        // Address of token to stake.
    function rewardToken() external view returns (address);       // Address of token to receive.
    function lastRewardBlock() external view returns (uint256);   // Last time rewards were distributed or farm was updated.
    function accRewardPerShare() external view returns (uint256); // Accumulated rewards per share, times 1e12.
    function valueStaked() external view returns (uint256);       // Value of tokens staked by all farmers.
}
