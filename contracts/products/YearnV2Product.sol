// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "../interface/IExchangeQuoter.sol";
import "./BaseProduct.sol";


interface IYRegistry {
    function getVaultInfo(address vault) external view returns (
        address controller,
        address token,
        address strategy,
        bool isWrapped,
        bool isDelegated
    );
}

interface IYVault {
    function token() external view returns (address);
    function balanceOf(address user) external view returns (uint256);
    function getPricePerFullShare() external view returns (uint256);
    function deposit(uint256 amount) external;
}

/**
 * @title YearnV2Product
 * @author solace.fi
 * @notice The **Yearn(V2)** product that is users can buy policy for **Yearn(V2)**. It is a concrete smart contract that inherits from abstract [`BaseProduct`](./BaseProduct).
 * The contract also inherits from [`EIP712`](https://docs.openzeppelin.com/contracts/3.x/api/drafts#EIP712).
 */
contract YearnV2Product is BaseProduct, EIP712 {
    /// @notice IYRegistry.
    IYRegistry public yregistry;
    /// @notice IExchangeQuoter.
    IExchangeQuoter public quoter;
    /// @notice _EXCHANGE_TYPEHASH.
    // solhint-disable-next-line var-name-mixedcase
    bytes32 private immutable _EXCHANGE_TYPEHASH = keccak256("YearnV2ProductExchange(uint256 policyID,uint256 amountOut,uint256 deadline)");

    /**
      * @notice The constructor.
      * @param governance_ The governor.
      * @param policyManager_ The IPolicyManager contract.
      * @param registry_ The IRegistry contract.
      * @param coveredPlatform_ A platform contract which locates contracts that are covered by this product.
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
        address coveredPlatform_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_,
        address quoter_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        coveredPlatform_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_
    ) EIP712("Solace.fi-YearnV2Product", "1") {
        yregistry = IYRegistry(coveredPlatform_);
        quoter = IExchangeQuoter(quoter_);
    }

    /**
     * @notice It gives the user's total position in the product's protocol.
     * The `positionContract` must be a **vault**.
     * @param policyholder The `buyer` who is requesting the coverage quote.
     * @param positionContract The address of the exact smart contract the `buyer` has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @return positionAmount The user's total position in **Wei** in the product's protocol.
     */
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        ( , address token, , , ) = yregistry.getVaultInfo(positionContract);
        require(token != address(0x0), "Invalid position contract");
        IYVault vault = IYVault(positionContract);
        uint256 balance = vault.balanceOf(policyholder) * vault.getPricePerFullShare() / 1e18;
        return quoter.tokenToEth(token, balance);
    }

    /**
     * @notice The function is used to submit a claim.
     * The user can only submit one claim per policy and the claim must be signed by an authorized signer.
     * The policy is burn when the claim submission is successful and new claim is created.
     * @param policyID The policy that suffered a loss.
     * @param amountOut The amount the user will receive.
     * @param deadline Transaction must execute before this timestamp.
     * @param signature Signature from the signer.
     */
    function submitClaim(
        uint256 policyID,
        uint256 amountOut,
        uint256 deadline,
        bytes calldata signature
    ) external {
        // validate inputs
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp <= deadline, "expired deadline");
        (address policyholder, address product, , , , ) = policyManager.getPolicyInfo(policyID);
        require(policyholder == msg.sender, "!policyholder");
        require(product == address(this), "wrong product");
        // verify signature
        {
        bytes32 structHash = keccak256(abi.encode(_EXCHANGE_TYPEHASH, policyID, amountOut, deadline));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        require(isAuthorizedSigner[signer], "invalid signature");
        }
        // burn policy
        policyManager.burn(policyID);
        // submit claim to ClaimsEscrow
        IClaimsEscrow(payable(registry.claimsEscrow())).receiveClaim(policyID, policyholder, amountOut);
        emit ClaimSubmitted(policyID);
    }

    /**
     * @notice Changes the covered platform.
     * The function is used for if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param coveredPlatform_ The platform to cover.
     */
    function setCoveredPlatform(address coveredPlatform_) public override {
        super.setCoveredPlatform(coveredPlatform_);
        yregistry = IYRegistry(coveredPlatform_);
    }

    /**
     * @notice Returns the name of the product.
     * @return YearnV2 The name of the product.
     */
    function name() public pure override returns (string memory) {
        return "YearnV2";
    }
}
