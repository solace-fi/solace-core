// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/UniswapV3/IUniswapV3Pool.sol";
import "./libraries/UniswapV3/TickMath.sol";
import "./libraries/UniswapV3/FixedPoint96.sol";
import "./libraries/UniswapV3/FullMath.sol";
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

    // farm controller
    IFarmController internal _controller;

    // receiver for options payments
    address payable internal _destination;

    // amount of time in seconds into the future that new options will expire
    uint256 internal _expiryDuration;

    // total number of options ever created
    uint256 internal _numOptions = 0;

    /// @dev _options[optionID] => Option info.
    mapping(uint256 => Option) internal _options;

    // the uniswap solace-eth for calculating twap
    IUniswapV3Pool internal _pool = IUniswapV3Pool(address(0x0));

    // interval in seconds to calculate time weighted average price in strike price
    uint32 internal _twapInterval;

    // true if solace is token 0 of the pool. used in twap calculation
    bool internal _solaceIsToken0;

    /**
     * @notice Constructs the `OptionsFarming` contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     */
    constructor(address governance_) ERC721("Solace Options Mining", "SOM") Governable(governance_) {
        _twapInterval = 3600; // one hour
        _expiryDuration = 2592000; // 30 days
    }

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
     * @return strikePrice Strike Price.
     */
    function calculateStrikePrice(uint256 rewardAmount) public view override returns (uint256 strikePrice) {
        require(address(_pool) != address(0x0), "pool not set");
        // TWAP
        uint160 sqrtPriceX96;
        if (_twapInterval == 0) {
            // return the current price
            (sqrtPriceX96, , , , , , ) = _pool.slot0();
        } else {
            // retrieve historic tick data from pool
            uint32[] memory secondsAgos = new uint32[](2);
            secondsAgos[0] = _twapInterval; // from (before)
            secondsAgos[1] = 0; // to (now)
            (int56[] memory tickCumulatives, ) = _pool.observe(secondsAgos);
            // math
            int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];
            int56 interval = int56(uint56(_twapInterval));
            int24 timeWeightedAverageTick = int24(tickCumulativesDelta / interval);
            // always round to negative infinity
            if (tickCumulativesDelta < 0 && (tickCumulativesDelta % interval) != 0) timeWeightedAverageTick--;
            // tick to sqrtPriceX96
            sqrtPriceX96 = TickMath.getSqrtRatioAtTick(timeWeightedAverageTick);
        }
        // TODO: token0/token1 ordering?
        // sqrtPriceX96 to priceX96
        uint256 priceX96 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, FixedPoint96.Q96);
        // TODO: priceX96 to strikePrice?
        strikePrice = rewardAmount * priceX96;
        return strikePrice;
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
            expiry: block.timestamp + _expiryDuration
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
     * @param controller The address of the new [`FarmController(./FarmController).
     */
    function setFarmController(address controller) external override onlyGovernance {
        _controller = IFarmController(controller);
    }

    /**
     * @notice Sets the [**SOLACE**](../SOLACE) native token.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param solace_ The address of the [**SOLACE**](../SOLACE) contract.
     */
    function setSolace(address solace_) external override onlyGovernance {
        _solace = ISOLACE(solace_);
        _pool = IUniswapV3Pool(address(0x0)); // reset
    }

    /**
     * @notice Sets the pool for twap calculations.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param pool The address of the pool.
     */
    function setPool(address pool) external override onlyGovernance {
        IUniswapV3Pool pool_ = IUniswapV3Pool(pool);
        // TODO: check if other token is weth (optional)
        if(pool_.token0() == address(_solace)) {
            _solaceIsToken0 = true;
        } else if(pool_.token1() == address(_solace)) {
            _solaceIsToken0 = false;
        } else {
            revert("invalid pool");
        }
    }

    /**
     * @notice Sets the interval for twap calculations.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param interval The interval of the twap.
     */
    function setTwapInterval(uint32 interval) external override onlyGovernance {
        _twapInterval = interval;
    }

    /**
     * @notice Sets the time into the future that new Options will expire.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param expiryDuration The duration in seconds.
     */
    function setExpiryDuration(uint256 expiryDuration) external override onlyGovernance {
        _expiryDuration = expiryDuration;
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
