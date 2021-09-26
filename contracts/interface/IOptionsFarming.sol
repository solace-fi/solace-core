// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";


/**
 * @title IOptionsFarming
 * @author solace.fi
 * @notice Distributes options to farmers.
 */
interface IOptionsFarming is IERC721Enumerable {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when an option is created.
    event OptionCreated(uint256 optionID);
    /// @notice Emitted when an option is exercised.
    event OptionExercised(uint256 optionID);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Native SOLACE Token.
    function solace() external view returns (address solace_);

    // @notice The Farm Controller.
    function farmController() external view returns (address controller_);

    struct Option {
        uint256 rewardAmount; // The amount of SOLACE out.
        uint256 strikePrice;  // The amount of ETH in.
        uint256 expiry;       // The expiration timestamp.
    }

    /**
     * @notice Get information about an option.
     * @param optionID The ID of the option to query.
     * @return rewardAmount The amount of **SOLACE** out.
     * @return strikePrice The amount of **ETH** in.
     * @return expiry The expiration timestamp.
     */
    function getOption(uint256 optionID) external view returns (uint256 rewardAmount, uint256 strikePrice, uint256 expiry);

    /**
     * @notice Calculate the strike price for an amount of **SOLACE**.
     * @param rewardAmount Amount of **SOLACE**.
     * @return strikePrice_ Strike Price
     */
    function strikePrice(uint256 rewardAmount) external view returns (uint256 strikePrice_);

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Creates an option for the given `rewardAmount`.
     * Must be called by a farm.
     * @param rewardAmount The amount to reward in the Option.
     * @return optionID The ID of the newly minted option.
     */
    function createOption(uint256 rewardAmount) external returns (uint256 optionID);

    /**
     * @notice Exercises an Option.
     * `msg.sender` must pay `option.strikePrice` **ETH**.
     * `msg.sender` will receive `option.rewardAmount` **SOLACE**.
     * Can only be called by the Option owner or approved.
     * Can only be called before `option.expiry`.
     * @param optionID The ID of the Option to exercise.
     */
    function exerciseOption(uint256 optionID) external payable;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the `FarmController` contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param controller_ The address of the new `FarmController`.
     */
    function setFarmController(address controller_) external;

    /**
     * @notice Sets the **SOLACE** native token.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param solace_ The address of the **SOLACE** contract.
     */
    function setSolace(address solace_) external;

    // TODO
    function setPool() external;

    /**
     * @notice Sets the time into the future that new Options will expire.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param expiryFuture_ The duration in seconds.
     */
    function setExpiryFuture(uint256 expiryFuture_) external;

    /**
     * @notice Sets the recipient for Option payments.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param destination_ The new recipient.
     */
    function setDestination(address payable destination_) external;

    /***************************************
    ERC721 FUNCTIONS
    ***************************************/

    /**
     * @notice Transfers `tokenID` from `msg.sender` to `to`.
     * @dev This was excluded from the official `ERC721` standard in favor of `transferFrom(address from, address to, uint256 tokenID)`. We elect to include it.
     * @param to The receipient of the token.
     * @param tokenID The token to transfer.
     */
    function transfer(address to, uint256 tokenID) external;

    /**
     * @notice Safely transfers `tokenID` from `msg.sender` to `to`.
     * @dev This was excluded from the official `ERC721` standard in favor of `safeTransferFrom(address from, address to, uint256 tokenID)`. We elect to include it.
     * @param to The receipient of the token.
     * @param tokenID The token to transfer.
     */
    function safeTransfer(address to, uint256 tokenID) external;
}
