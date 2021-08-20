// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./BaseProduct.sol";


interface IAaveProtocolDataProvider {
    function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress);
    // solhint-disable-next-line func-name-mixedcase
    function ADDRESSES_PROVIDER() external view returns (address);
}

interface IAToken {
    function balanceOf(address user) external view returns (uint256);
    function decimals() external view returns (uint8);
    // solhint-disable-next-line func-name-mixedcase
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
    // solhint-disable-next-line func-name-mixedcase
    function POOL() external view returns (address);
}

interface ILendingPool {
    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface ILendingPoolAddressesProvider {
    function getPriceOracle() external view returns (address);
}

interface IAavePriceOracle {
    function getAssetPrice(address asset) external view returns (uint256);
}

/**
 * @title AaveV2Product
 * @author solace.fi
 * @notice The **Aave(V2)** product that is users can buy policy for **Aave(V2)**. It is a concrete smart contract that inherits from abstract [`BaseProduct`](./BaseProduct).
 * The contract also inherits from [`EIP712`](https://docs.openzeppelin.com/contracts/3.x/api/drafts#EIP712).
 */
contract AaveV2Product is BaseProduct, EIP712 {
    /// @notice IAaveProtocolDataProvider.
    IAaveProtocolDataProvider public aaveDataProvider;
    /// @notice _EXCHANGE_TYPEHASH.
    // solhint-disable-next-line var-name-mixedcase
    bytes32 private immutable _EXCHANGE_TYPEHASH = keccak256("AaveV2ProductExchange(uint256 policyID,uint256 amountOut,uint256 deadline)");

    /**
      * @notice The constructor.
      * @param governance_ The governor.
      * @param policyManager_ The IPolicyManager contract.
      * @param registry_ The IRegistry contract.
      * @param dataProvider_ Aave protocol data provider address.
      * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
      * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
      * @param price_ The cover price for the **Product**.
      * @param maxCoverPerUserDivisor_ The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address dataProvider_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_
    ) BaseProduct(
        governance_,
        policyManager_,
        registry_,
        dataProvider_,
        minPeriod_,
        maxPeriod_,
        price_,
        maxCoverPerUserDivisor_
    ) EIP712("Solace.fi-AaveV2Product", "1") {
        aaveDataProvider = IAaveProtocolDataProvider(dataProvider_);
    }

    /**
     * @notice It gives the user's total position in the product's protocol.
     * The `positionContract` must be a **aToken** (Please see https://etherscan.io/tokens/label/aave-v2 for more information).
     * @param policyholder The `buyer` who is requesting the coverage quote.
     * @param positionContract The address of the exact smart contract the `buyer` has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @return positionAmount The user's total position in **Wei** in the product's protocol.
     */
    function appraisePosition(address policyholder, address positionContract) public view override returns (uint256 positionAmount) {
        // verify positionContract
        IAToken token = IAToken(positionContract);
        address underlying = token.UNDERLYING_ASSET_ADDRESS();
        ( address aTokenAddress, , ) = aaveDataProvider.getReserveTokensAddresses(underlying);
        require(positionContract == aTokenAddress, "Invalid position contract");
        // get price oracle
        ILendingPoolAddressesProvider addressProvider = ILendingPoolAddressesProvider(aaveDataProvider.ADDRESSES_PROVIDER());
        IAavePriceOracle oracle = IAavePriceOracle(addressProvider.getPriceOracle());
        // swap math
        uint256 balance = token.balanceOf(policyholder);
        uint256 price = oracle.getAssetPrice(underlying);
        uint8 decimals = token.decimals();
        return balance * price / 10**decimals;
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
     * @param dataProvider The platform to cover.
     */
    function setCoveredPlatform(address dataProvider) public override {
        super.setCoveredPlatform(dataProvider);
        aaveDataProvider = IAaveProtocolDataProvider(dataProvider);
    }

    /**
     * @notice Returns the name of the product.
     * @return AaveV2 The name of the product.
     */
    function name() public pure override returns (string memory) {
        return "AaveV2";
    }
}
