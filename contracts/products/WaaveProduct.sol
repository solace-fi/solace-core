// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Waave/IWaRegistry.sol";
import "../interface/Waave/IWaToken.sol";
import "./BaseProduct.sol";

/**
 * @title WaaveProduct
 * @author solace.fi
 * @notice The **WaaveProduct** can be used to purchase coverage for **Waave** positions.
 *
 * Note that the Waave Protocol is exploitable by design. Use this product or the Waave Protocol at your own risk.
 */
contract WaaveProduct is BaseProduct {

    // IWaRegistry.
    IWaRegistry internal _waRegistry;

    /**
      * @notice Constructs the WaaveProduct.
      * @param governance_ The address of the [governor](/docs/protocol/governance).
      * @param policyManager_ The [`PolicyManager`](../PolicyManager) contract.
      * @param registry_ The [`Registry`](../Registry) contract.
      * @param waRegistry_ The Waave Registry.
      * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
      * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
      * @param price_ The cover price for the **Product**.
      * @param maxCoverPerUserDivisor_ The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
      * @param quoter_ The exchange quoter address.
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address waRegistry_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_,
        address quoter_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        waRegistry_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        quoter_,
        "Solace.fi-WaaveProduct",
        "1"
    ) {
        _waRegistry = IWaRegistry(waRegistry_);
        _SUBMIT_CLAIM_TYPEHASH = keccak256("WaaveProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "Waave";
    }

    /**
     * @notice Calculate the value of a user's position in **ETH**.
     * The `positionContract` must be a **waToken**.
     * @param policyholder The owner of the position.
     * @param positionContract The address of the **waToken**.
     * @return positionAmount The value of the position.
     */
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        // verify positionContract
        require(_waRegistry.isWaToken(positionContract), "Invalid position contract");
        // swap math
        IWaToken waToken = IWaToken(positionContract);
        uint256 balance = waToken.balanceOf(policyholder);
        uint256 exchangeRate = waToken.pricePerShare();
        uint8 decimals = waToken.decimals();
        balance = balance * exchangeRate / (10 ** decimals);
        return _quoter.tokenToEth(waToken.underlying(), balance);
    }

    /**
     * @notice Waave's Registry.
     * @return waRegistry_ The waRegistry.
     */
    function waRegistry() external view returns (address waRegistry_) {
        return address(_waRegistry);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Changes the covered platform.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Use this if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * @param waRegistry_ The new waRegistry.
     */
    function setCoveredPlatform(address waRegistry_) public override {
        super.setCoveredPlatform(waRegistry_);
        _waRegistry = IWaRegistry(waRegistry_);
    }
}
