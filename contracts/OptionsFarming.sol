// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Governable.sol";
import "./interface/ISOLACE.sol";
import "./interface/IFarmController.sol";
import "./interface/IOptionsFarming.sol";


/**
 * @title OptionsFarming
 * @author solace.fi
 * @notice Distributes options to farmers.
 */
contract OptionsFarming is IOptionsFarming, ERC721Enumerable, Governable {
    using SafeERC20 for IERC20;

    /// @notice Native SOLACE Token.
    ISOLACE internal _solace = ISOLACE(address(0x0));

    IFarmController internal _controller;

    address payable internal _destination;

    uint256 internal _expiryFuture = 2592000; // 30 days

    uint256 internal _numOptions = 0;

    /// @dev _options[optionID] => Option info.
    mapping(uint256 => Option) internal _options;

    /**
     * @notice Constructs the `OptionsFarming` contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     */
    constructor(address governance_) ERC721("Solace Options Mining", "SOM") Governable(governance_) { }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Native [**SOLACE**](./SOLACE) Token.
    function solace() external view override returns (address solace_) {
        return address(_solace);
    }

    // @notice The [`FarmController(./FarmController).
    function farmController() external view override returns (address controller_) {
        return address(_controller);
    }

    /**
     * @notice Get information about an option.
     * @param optionID The ID of the option to query.
     * @return rewardAmount The amount of **SOLACE** out.
     * @return strikePrice The amount of **ETH** in.
     * @return expiry The expiration timestamp.
     */
    function getOption(uint256 optionID) external view override returns (uint256 rewardAmount, uint256 strikePrice, uint256 expiry) {
        require(_exists(optionID), "query for nonexistent token");
        Option storage option = _options[optionID];
        return (option.rewardAmount, option.strikePrice, option.expiry);
    }

    /**
     * @notice Calculate the strike price for an amount of [**SOLACE**](./SOLACE).
     * @param rewardAmount Amount of [**SOLACE**](./SOLACE).
     * @return strikePrice_ Strike Price.
     */
    function calculateStrikePrice(uint256 rewardAmount) public view override returns (uint256 strikePrice_) {
        require(address(_solace) != address(0x0), "solace not set");
        // TODO: TWAP
        strikePrice_ = rewardAmount;
        return strikePrice_;
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Creates an option for the given `rewardAmount`.
     * Must be called by a farm.
     * @param rewardAmount The amount to reward in the Option.
     * @return optionID The ID of the newly minted option.
     */
    function createOption(uint256 rewardAmount) external override returns (uint256 optionID) {
        require(msg.sender == address(_controller), "!farmcontroller");
        require(rewardAmount > 0, "no zero value options");
        // create option
        Option memory option = Option({
            rewardAmount: rewardAmount,
            strikePrice: calculateStrikePrice(rewardAmount),
            expiry: block.timestamp + _expiryFuture
        });
        optionID = ++_numOptions; // autoincrement from 1
        // TODO: bookkeeping?
        _options[optionID] = option;
        _mint(msg.sender, optionID);
        emit OptionCreated(optionID);
        return optionID;
    }

    /**
     * @notice Exercises an Option.
     * `msg.sender` must pay `option.strikePrice` **ETH**.
     * `msg.sender` will receive `option.rewardAmount` [**SOLACE**](./SOLACE).
     * Can only be called by the Option owner or approved.
     * Can only be called before `option.expiry`.
     * @param optionID The ID of the Option to exercise.
     */
    function exerciseOption(uint256 optionID) external payable override {
        require(_isApprovedOrOwner(msg.sender, optionID), "!owner");
        // check msg.value
        require(msg.value >= _options[optionID].strikePrice, "insufficient payment");
        // check timestamp
        require(block.timestamp <= _options[optionID].expiry, "expired");
        // burn option
        uint256 rewardAmount = _options[optionID].rewardAmount;
        _burn(optionID);
        // transfer SOLACE
        SafeERC20.safeTransfer(_solace, msg.sender, rewardAmount);
        // transfer msg.value
        sendValue();
        emit OptionExercised(optionID);
    }

    /**
     * @notice Sends this contract's **ETH** balance to `destination`.
     */
    function sendValue() public {
        if(_destination == address(0x0)) return;
        uint256 amount = address(this).balance;
        if(amount == 0) return;
        // this call may fail. let it
        // funds will be safely stored and can be sent later
        // solhint-disable-next-line avoid-low-level-calls
        _destination.call{value: amount}(""); // IGNORE THIS WARNING
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`FarmController(./FarmController)` contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param controller_ The address of the new [`FarmController(./FarmController).
     */
    function setFarmController(address controller_) external override onlyGovernance {
        _controller = IFarmController(controller_);
    }

    /**
     * @notice Sets the [**SOLACE**](./SOLACE) native token.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param solace_ The address of the [**SOLACE**](./SOLACE) contract.
     */
    function setSolace(address solace_) external override onlyGovernance {
        _solace = ISOLACE(solace_);
    }

    // TODO
    function setPool() external override onlyGovernance { }

    /**
     * @notice Sets the time into the future that new Options will expire.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param expiryFuture_ The duration in seconds.
     */
    function setExpiryFuture(uint256 expiryFuture_) external override onlyGovernance {
        _expiryFuture = expiryFuture_;
    }

    /**
     * @notice Sets the recipient for Option payments.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param destination_ The new recipient.
     */
    function setDestination(address payable destination_) external override onlyGovernance {
        _destination = destination_;
    }

    /***************************************
    ERC721 FUNCTIONS
    ***************************************/

    /**
     * @notice Transfers `tokenID` from `msg.sender` to `to`.
     * @dev This was excluded from the official `ERC721` standard in favor of `transferFrom(address from, address to, uint256 tokenID)`. We elect to include it.
     * @param to The receipient of the token.
     * @param tokenID The token to transfer.
     */
    function transfer(address to, uint256 tokenID) public override {
        super.transferFrom(msg.sender, to, tokenID);
    }

    /**
     * @notice Safely transfers `tokenID` from `msg.sender` to `to`.
     * @dev This was excluded from the official `ERC721` standard in favor of `safeTransferFrom(address from, address to, uint256 tokenID)`. We elect to include it.
     * @param to The receipient of the token.
     * @param tokenID The token to transfer.
     */
    function safeTransfer(address to, uint256 tokenID) public override {
        super.safeTransferFrom(msg.sender, to, tokenID, "");
    }
}
