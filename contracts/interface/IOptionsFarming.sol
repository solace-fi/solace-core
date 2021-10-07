// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IERC721Enhanced.sol";


/**
 * @title IOptionsFarming
 * @author solace.fi
 * @notice Distributes options to farmers.
 *
 * Rewards are accumulated by farmers for participating in farms. Rewards can be redeemed for options with 1:1 reward:[**SOLACE**](./SOLACE). Options can be exercised by paying `strike price` **ETH** before `expiry` to receive `rewardAmount` [**SOLACE**](./SOLACE).
 *
 * The `strike price` is calculated by either:
 *   - The current market price of [**SOLACE**](./SOLACE) * `swap rate` as determined by the [**SOLACE**](./SOLACE)-**ETH** Uniswap pool.
 *   - The floor price of [**SOLACE**](./SOLACE)/**USD** converted to **ETH** using a **ETH**-**USD** Uniswap pool.
 */
interface IOptionsFarming is IERC721Enhanced {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when an option is created.
    event OptionCreated(uint256 optionID);
    /// @notice Emitted when an option is exercised.
    event OptionExercised(uint256 optionID);
    /// @notice Emitted when solace is set.
    event SolaceSet(address solace);
    /// @notice Emitted when farm controller is set.
    event FarmControllerSet(address farmController);
    /// @notice Emitted when solace-eth pool is set.
    event SolaceEthPoolSet(address solaceEthPool);
    /// @notice Emitted when eth-usd pool is set.
    event EthUsdPoolSet(address ethUsdPool);
    /// @notice Emitted when twap interval is set.
    event TwapIntervalSet(uint32 twapInterval);
    /// @notice Emitted when expiry duration is set.
    event ExpiryDurationSet(uint256 expiryDuration);
    /// @notice Emitted when swap rate is set.
    event SwapRateSet(uint16 swapRate);
    /// @notice Emitted when fund receiver is set.
    event ReceiverSet(address receiver);
    /// @notice Emitted when the solace-usd price floor is set.
    event PriceFloorSet(uint256 priceFloor);

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Native [**SOLACE**](../SOLACE) Token.
    function solace() external view returns (address solace_);

    /// @notice The [`FarmController(../FarmController).
    function farmController() external view returns (address controller_);

    /// @notice The receiver for options payments.
    function receiver() external view returns (address receiver_);

    /// @notice Amount of time in seconds into the future that new options will expire.
    function expiryDuration() external view returns (uint256 expiryDuration_);

    /// @notice Total number of options ever created.
    function numOptions() external view returns (uint256 numOptions_);

    /// @notice The uniswap solace-eth pool for calculating twap.
    function solaceEthPool() external view returns (address solaceEthPool_);

    /// @notice The uniswap eth-usd pool for calculating twap.
    function ethUsdPool() external view returns (address ethUsdPool_);

    /// @notice Interval in seconds to calculate time weighted average price in strike price.
    function twapInterval() external view returns (uint32 twapInterval_);

    /// @notice The relative amount of the eth value that a user must pay, measured in BPS.
    /// Only applies to the solace-eth pool.
    function swapRate() external view returns (uint16 swapRate_);

    /// @notice The floor price of [**SOLACE**](./SOLACE) measured in **USD**.
    /// Specifically, whichever stablecoin is in the eth-usd pool.
    function priceFloor() external view returns (uint256 priceFloor_);

    struct Option {
        uint256 rewardAmount; // The amount of SOLACE out.
        uint256 strikePrice;  // The amount of ETH in.
        uint256 expiry;       // The expiration timestamp.
    }

    /**
     * @notice Get information about an option.
     * @param optionID The ID of the option to query.
     * @return rewardAmount The amount of [**SOLACE**](../SOLACE) out.
     * @return strikePrice The amount of **ETH** in.
     * @return expiry The expiration timestamp.
     */
    function getOption(uint256 optionID) external view returns (uint256 rewardAmount, uint256 strikePrice, uint256 expiry);

    /**
     * @notice Calculate the strike price for an amount of [**SOLACE**](../SOLACE).
     * @param rewardAmount Amount of [**SOLACE**](../SOLACE).
     * @return strikePrice Strike Price in **ETH**.
     */
    function calculateStrikePrice(uint256 rewardAmount) external view returns (uint256 strikePrice);

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Creates an option for the given `rewardAmount`.
     * Must be called by the [`FarmController(./FarmController).
     * @param rewardAmount The amount to reward in the Option.
     * @return optionID The ID of the newly minted option.
     */
    function createOption(uint256 rewardAmount) external returns (uint256 optionID);

    /**
     * @notice Exercises an Option.
     * `msg.sender` must pay `option.strikePrice` **ETH**.
     * `msg.sender` will receive `option.rewardAmount` [**SOLACE**](../SOLACE).
     * Can only be called by the Option owner or approved.
     * Can only be called before `option.expiry`.
     * @param optionID The ID of the Option to exercise.
     */
    function exerciseOption(uint256 optionID) external payable;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
    * @notice Sets the [**SOLACE**](../SOLACE) native token.
    * Can only be called by the current [**governor**](/docs/protocol/governance).
    * @param solace_ The address of the [**SOLACE**](../SOLACE) contract.
    */
    function setSolace(address solace_) external;

    /**
     * @notice Sets the [`FarmController(../FarmController) contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param controller The address of the new [`FarmController(../FarmController).
     */
    function setFarmController(address controller) external;

    /**
     * @notice Sets the recipient for Option payments.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param receiver The new recipient.
     */
    function setReceiver(address payable receiver) external;

    /**
     * @notice Sets the time into the future that new Options will expire.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param expiryDuration_ The duration in seconds.
     */
    function setExpiryDuration(uint256 expiryDuration_) external;

    /**
     * @notice Sets the solace-eth pool for twap calculations.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param pool The address of the pool.
     */
    function setSolaceEthPool(address pool) external;

    /**
     * @notice Sets the eth-usd pool for twap calculations.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param pool The address of the pool.
     */
    function setEthUsdPool(address pool) external;

    /**
     * @notice Sets the interval for twap calculations.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param interval The interval of the twap.
     */
    function setTwapInterval(uint32 interval) external;

    /**
     * @notice Sets the swap rate for prices in the solace-eth pool.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param swapRate_ The new swap rate.
     */
    function setSwapRate(uint16 swapRate_) external;

    /**
     * @notice Sets the floor price of [**SOLACE**](./SOLACE) measured in **USD**.
     * Specifically, whichever stablecoin is in the eth-usd pool.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param priceFloor_ The new floor price.
     */
    function setPriceFloor(uint256 priceFloor_) external;
}
