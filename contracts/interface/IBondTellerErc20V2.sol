// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./IBondTellerV2.sol";


/**
 * @title IBondTellerErc20V2
 * @author solace.fi
 * @notice A bond teller that accepts an ERC20 as payment.
 *
 * The main difference between V1 and V2 SOLACE bonds, is that V1 SOLACE bonds can be redeemed for payout only after the vestingTerm, while V2 SOLACE bonds linearly vest over the localVestingTerm.
 * `redeem()` in BondTellerBase.sol has been renamed to `claimPayout()` in BondTellerBaseV2.sol - to reduce confusion
 *
 * Users purchase SOLACE bonds from Bond Tellers, think of them as the ATM (as in automated teller machine at your banking branch) specialising in SOLACE protocol bonds
 *
 * There is a separate Bond Teller for each type of bond; the Bond Teller sets all the terms for the bond
 * Buying a bond from a Bond Teller will mint a `SPT V2` ERC721 to the user
 * Purchasers pay `principal` to the Bond Teller to purchase the bond, these payments are routed to the underwriting pool to help the SOLACE protocol back risk.
 * Buying a bond will entitle the purchaser to an amount of `payoutToken` - either [**SOLACE**](./SOLACE) or [**xSOLACE**](./xSOLACE)
 * Bonds will linearly vest over the `localVestingTerm` (default 5-days or 432,000 seconds)
 * Purchasers can `claimPayout` anytime after the `startTime`.
 * If `claimPayout` is called anytime after `vestingStart + localVestingTerm`, then the `SPT V2` ERC721 is burned and the bond terms are completed.
 * 
 * Most of the implementation details are in [`BondTellerBase`](./BondTellerBaseV2).
 */
interface IBondTellerErc20V2 is IBondTellerV2 {

    /**
     * @notice Create a bond by depositing `amount` of `principal`.
     * Principal will be transferred from `msg.sender` using `allowance`.
     * @param amount Amount of principal to deposit.
     * @param minAmountOut The minimum **SOLACE** or **xSOLACE** out.
     * @param depositor The bond recipient, default msg.sender.
     * @param stake True to stake, false to not stake.
     * @return payout The amount of SOLACE or xSOLACE in the bond.
     * @return bondID The ID of the newly created bond.
     */
    function deposit(
        uint256 amount,
        uint256 minAmountOut,
        address depositor,
        bool stake
    ) external returns (uint256 payout, uint256 bondID);

    /**
     * @notice Create a bond by depositing `amount` of `principal`.
     * Principal will be transferred from `depositor` using `permit`.
     * Note that not all ERC20s have a permit function, in which case this function will revert.
     * @param amount Amount of principal to deposit.
     * @param minAmountOut The minimum **SOLACE** or **xSOLACE** out.
     * @param depositor The bond recipient, default msg.sender.
     * @param stake True to stake, false to not stake.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     * @return payout The amount of SOLACE or xSOLACE in the bond.
     * @return bondID The ID of the newly created bond.
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
    ) external returns (uint256 payout, uint256 bondID);
}
