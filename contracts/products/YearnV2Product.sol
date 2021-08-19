// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "../interface/IExchangeQuoter.sol";
import "./BaseProduct.sol";


interface IYRegistry {
    function getVaultInfo(address _vault) external view returns (
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
      * @param _governance The governor.
      * @param _policyManager The IPolicyManager contract.
      * @param _registry The IRegistry contract.
      * @param _coveredPlatform A platform contract which locates contracts that are covered by this product.
      * @param _minPeriod The minimum policy period in blocks to purchase a **policy**.
      * @param _maxPeriod The maximum policy period in blocks to purchase a **policy**.
      * @param _price The cover price for the **Product**.
      * @param _maxCoverPerUserDivisor The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
      * @param _quoter The exchange quoter address.
     */
    constructor (
        address _governance,
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint40 _minPeriod,
        uint40 _maxPeriod,
        uint24 _price,
        uint32 _maxCoverPerUserDivisor,
        address _quoter
    ) BaseProduct(
        _governance,
        _policyManager,
        _registry,
        _coveredPlatform,
        _minPeriod,
        _maxPeriod,
        _price,
        _maxCoverPerUserDivisor
    ) EIP712("Solace.fi-YearnV2Product", "1") {
        yregistry = IYRegistry(_coveredPlatform);
        quoter = IExchangeQuoter(_quoter);
    }

    /**
     * @notice It gives the user's total position in the product's protocol.
     * The `_positionContract` must be a **vault**.
     * @param _policyholder The `buyer` who is requesting the coverage quote.
     * @param _positionContract The address of the exact smart contract the `buyer` has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @return positionAmount The user's total position in **Wei** in the product's protocol.
     */
    function appraisePosition(address _policyholder, address _positionContract) public view override returns (uint256 positionAmount) {
        ( , address token, , , ) = yregistry.getVaultInfo(_positionContract);
        require(token != address(0x0), "Invalid position contract");
        IYVault vault = IYVault(_positionContract);
        uint256 balance = vault.balanceOf(_policyholder) * vault.getPricePerFullShare() / 1e18;
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
     * Can only be called by the current `governor`.
     * @param _coveredPlatform The platform to cover.
     */
    function setCoveredPlatform(address _coveredPlatform) public override {
        super.setCoveredPlatform(_coveredPlatform);
        yregistry = IYRegistry(_coveredPlatform);
    }

    /**
     * @notice Returns the name of the product.
     * @return YearnV2 The name of the product.
     */
    function name() public pure override returns (string memory) {
        return "YearnV2";
    }
}
