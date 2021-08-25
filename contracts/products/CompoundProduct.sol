// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../interface/Compound/IComptroller.sol";
import "../interface/Compound/ICToken.sol";
import "./BaseProduct.sol";


/**
 * @title CompoundProduct
 * @author solace.fi
 * @notice The **CompoundProduct** can be used to purchase coverage for **Compound** positions.
 */
contract CompoundProduct is BaseProduct {

    // IComptroller.
    IComptroller internal _comptroller;

    /**
      * @notice Constructs the CompoundProduct.
      * @param governance_ The address of the [governor](/docs/user-docs/Governance).
      * @param policyManager_ The [`PolicyManager`](../PolicyManager) contract.
      * @param registry_ The [`Registry`](../Registry) contract.
      * @param comptroller_ The Compound Comptroller.
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
        address comptroller_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_,
        address quoter_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        comptroller_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_,
        quoter_,
        "Solace.fi-CompoundProduct",
        "1"
    ) {
        _comptroller = IComptroller(comptroller_);
        _SUBMIT_CLAIM_TYPEHASH = keccak256("CompoundProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)");
        _productName = "Compound";
    }

    /**
     * @notice Calculate the value of a user's position in **ETH**.
     * The `positionContract` must be a [**cToken**](https://etherscan.io/accounts/label/compound).
     * @param policyholder The owner of the position.
     * @param positionContract The address of the **cToken**.
     * @return positionAmount The value of the position.
     */
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        // verify positionContract
        (bool isListed, , ) = _comptroller.markets(positionContract);
        require(isListed, "Invalid position contract");
        // swap math
        ICToken ctoken = ICToken(positionContract);
        uint256 balance = ctoken.balanceOf(policyholder);
        uint256 exchangeRate = ctoken.exchangeRateStored();
        balance = balance * exchangeRate / 1e18;
        if(compareStrings(ctoken.symbol(), "cETH")) return balance;
        return _quoter.tokenToEth(ctoken.underlying(), balance);
    }

    /**
     * @notice Compound's Comptroller.
     * @return comptroller_ The comptroller.
     */
    function comptroller() external view returns (address comptroller_) {
        return address(_comptroller);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Changes the covered platform.
     * The function should be used if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param comptroller_ The new Comptroller.
     */
    function setCoveredPlatform(address comptroller_) public override {
        super.setCoveredPlatform(comptroller_);
        _comptroller = IComptroller(comptroller_);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice String equality.
     * @param a The first string.
     * @param b The second string.
     * @return bool Returns True if both strings are equal.
     */
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
