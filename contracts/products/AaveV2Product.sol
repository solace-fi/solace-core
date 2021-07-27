// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./BaseProduct.sol";


interface IAaveProtocolDataProvider {
    function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress);
    function ADDRESSES_PROVIDER() external view returns (address);
}

interface IAToken {
    function balanceOf(address user) external view returns (uint256);
    function decimals() external view returns (uint8);
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
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

contract AaveV2Product is BaseProduct, EIP712 {

    IAaveProtocolDataProvider public aaveDataProvider;
    bytes32 private immutable _EXCHANGE_TYPEHASH = keccak256("AaveV2ProductExchange(uint256 policyID,uint256 amountOut,uint256 deadline)");

    constructor (
        address _governance,
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _dataProvider,
        uint256 _maxCoverAmount,
        uint256 _maxCoverPerUser,
        uint64 _minPeriod,
        uint64 _maxPeriod,
        uint64 _cancelFee,
        uint24 _price
    ) BaseProduct(
        _governance,
        _policyManager,
        _registry,
        _dataProvider,
        _maxCoverAmount,
        _maxCoverPerUser,
        _minPeriod,
        _maxPeriod,
        _cancelFee,
        _price
    ) EIP712("Solace.fi-AaveV2Product", "1") {
        aaveDataProvider = IAaveProtocolDataProvider(_dataProvider);
    }

    // _positionContract must be an aToken
    // see https://etherscan.io/tokens/label/aave-v2
    function appraisePosition(address _policyholder, address _positionContract) public view override returns (uint256 positionAmount) {
        // verify _positionContract
        IAToken token = IAToken(_positionContract);
        address underlying = token.UNDERLYING_ASSET_ADDRESS();
        ( address aTokenAddress, , ) = aaveDataProvider.getReserveTokensAddresses(underlying);
        require(_positionContract == aTokenAddress, "Invalid position contract");
        // get price oracle
        ILendingPoolAddressesProvider addressProvider = ILendingPoolAddressesProvider(aaveDataProvider.ADDRESSES_PROVIDER());
        IAavePriceOracle oracle = IAavePriceOracle(addressProvider.getPriceOracle());
        // swap math
        uint256 balance = token.balanceOf(_policyholder);
        uint256 price = oracle.getAssetPrice(underlying);
        uint8 decimals = token.decimals();
        return balance * price / 10**decimals;
    }

    /**
     * @notice Submits a claim.
     * Can only submit one claim per policy.
     * Must be signed by an authorized signer.
     * @param policyID The policy that suffered a loss.
     * @param amountOut The amount the user will receive in ETH.
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
     * Use this if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current governor.
     * @param _dataProvider The Aave Data Provider.
     */
    function setCoveredPlatform(address _dataProvider) public override {
        super.setCoveredPlatform(_dataProvider);
        aaveDataProvider = IAaveProtocolDataProvider(_dataProvider);
    }

    /**
     * @notice Returns the name of the product.
     * @return AaveV2
     */
    function name() public pure override returns (string memory) {
        return "AaveV2";
    }
}
