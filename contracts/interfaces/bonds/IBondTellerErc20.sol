// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./../utils/ICloneable.sol";


/**
 * @title IBondTellerErc20
 * @author solace.fi
 * @notice A bond teller that accepts an ERC20 as payment.
 *
 * Bond tellers allow users to buy bonds. After vesting for `vestingTerm`, bonds can be redeemed for [**SOLACE**](./../../SOLACE) or [**xSOLACEV1**](./../../staking/xSOLACEV1). Payments are made in `principal` which is sent to the underwriting pool and used to back risk.
 *
 * Bonds can be purchased via [`deposit()`](#deposit) or [`depositSigned()`](#depositsigned). Bonds are represented as ERC721s, can be viewed with [`bonds()`](#bonds), and redeemed with [`redeem()`](#redeem).
 */
interface IBondTellerErc20 is ICloneable {

  /***************************************
  EVENTS
  ***************************************/

    /// @notice Emitted when a bond is created.
    event CreateBond(uint256 indexed lockID, uint256 principalAmount, uint256 payoutAmount, uint40 vestingStart, uint40 vestingTime);
    /// @notice Emitted when a bond is redeemed.
    event RedeemBond(uint256 indexed bondID, address recipient, uint256 payoutAmount);
    /// @notice Emitted when deposits are paused.
    event Paused();
    /// @notice Emitted when deposits are unpaused.
    event Unpaused();
    /// @notice Emitted when terms are set.
    event TermsSet();
    /// @notice Emitted when fees are set.
    event FeesSet();
    /// @notice Emitted when fees are set.
    event AddressesSet();

    /***************************************
    INITIALIZER
    ***************************************/

    /**
     * @notice Creates a new `BondTellerERC20`. The new teller will be a minimal proxy to this instance.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param name_ The name of the bond token.
     * @param governance_ The address of the teller's [governor](/docs/protocol/governance).
     * @param principal_ address The ERC20 token that users give.
     * @param isPermittable_ True if `principal` supports `EIP2612`.
     * @param salt_ Input for deterministic address calculation.
     * @return teller The address of the new teller.
     */
    function clone(
        string memory name_,
        address governance_,
        address principal_,
        bool isPermittable_,
        bytes32 salt_
    ) external returns (address teller);

    /**
     * @notice Initializes the teller.
     * @param name_ The name of the bond token.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param solace_ The [**SOLACE**](./../../SOLACE) token.
     * @param xsLocker_ The [**xsLocker**](./../../staking/xsLocker) contract.
     * @param pool_ The underwriting pool.
     * @param dao_ The DAO.
     * @param principal_ address The ERC20 token that users deposit.
     * @param isPermittable_ True if `principal` supports `EIP2612`.
     * @param bondDepo_ The bond depository.
     */
    function initialize(
        string memory name_,
        address governance_,
        address solace_,
        address xsLocker_,
        address pool_,
        address dao_,
        address principal_,
        bool isPermittable_,
        address bondDepo_
    ) external;

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    // BOND PRICE

    /**
     * @notice Calculate the current price of a bond.
     * Assumes 1 [**SOLACE**](./../../SOLACE) payout.
     * @return price_ The price of the bond measured in `principal`.
     */
    function bondPrice() external view returns (uint256 price_);

    /**
     * @notice Calculate the amount of [**SOLACE**](./../../SOLACE) out for an amount of `principal`.
     * @param amountIn Amount of principal to deposit.
     * @param stake True to stake, false to not stake.
     * @return amountOut Amount of [**SOLACE**](./../../SOLACE) out.
     */
    function calculateAmountOut(uint256 amountIn, bool stake) external view returns (uint256 amountOut);

    /**
     * @notice Calculate the amount of `principal` in for an amount of [**SOLACE**](./../../SOLACE) out.
     * @param amountOut Amount of [**SOLACE**](./../../SOLACE) out.
     * @param stake True to stake, false to not stake.
     * @return amountIn Amount of principal to deposit.
     */
    function calculateAmountIn(uint256 amountOut, bool stake) external view returns (uint256 amountIn);

    /***************************************
    BONDER FUNCTIONS
    ***************************************/

    /**
     * @notice Create a bond by depositing `amount` of `principal`.
     * Principal will be transferred from `msg.sender` using `allowance`.
     * @param amount Amount of principal to deposit.
     * @param minAmountOut The minimum [**SOLACE**](./../../SOLACE) or [**xSOLACEV1**](./../../staking/xSOLACEV1) out.
     * @param depositor The bond recipient, default msg.sender.
     * @param stake True to stake, false to not stake.
     * @return payout The amount of [**SOLACE**](./../../SOLACE) or [**xSOLACEV1**](./../../staking/xSOLACEV1) in the bond.
     * @return tokenID The ID of the newly created bond or lock.
     */
    function deposit(
        uint256 amount,
        uint256 minAmountOut,
        address depositor,
        bool stake
    ) external returns (uint256 payout, uint256 tokenID);

    /**
     * @notice Create a bond by depositing `amount` of `principal`.
     * Principal will be transferred from `depositor` using `permit`.
     * Note that not all ERC20s have a permit function, in which case this function will revert.
     * @param amount Amount of principal to deposit.
     * @param minAmountOut The minimum [**SOLACE**](./../../SOLACE) or [**xSOLACEV1**](./../../staking/xSOLACEV1) out.
     * @param depositor The bond recipient, default msg.sender.
     * @param stake True to stake, false to not stake.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     * @return payout The amount of [**SOLACE**](./../../SOLACE) or [**xSOLACEV1**](./../../staking/xSOLACEV1) in the bond.
     * @return tokenID The ID of the newly created bond or lock.
     */
    function depositSigned(
        uint256 amount,
        uint256 minAmountOut,
        address depositor,
        bool stake,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 payout, uint256 tokenID);

    /**
     * @notice Claim payout for a bond that the user holds.
     * User calling `claimPayout()` must be either the owner or approved for the entered bondID.
     * @param bondID The ID of the bond to redeem.
     */
    function claimPayout(uint256 bondID) external;

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Pauses deposits.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
    */
    function pause() external;

    /**
     * @notice Unpauses deposits.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
    */
    function unpause() external;

    /**
     * @notice Sets the addresses to call out.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param solace_ The [**SOLACE**](./../../SOLACE) token.
     * @param xsLocker_ The [**xsLocker**](./../../staking/xsLocker) contract.
     * @param pool_ The underwriting pool.
     * @param dao_ The DAO.
     * @param principal_ The ERC20 token that users deposit.
     * @param isPermittable_ True if `principal` supports `EIP2612`.
     * @param bondDepo_ The bond depository.
     */
    function setAddresses(
        address solace_,
        address xsLocker_,
        address pool_,
        address dao_,
        address principal_,
        bool isPermittable_,
        address bondDepo_
    ) external;
}
