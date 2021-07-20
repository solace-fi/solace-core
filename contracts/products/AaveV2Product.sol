// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./BaseProduct.sol";


interface IAaveProtocolDataProvider {
    function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress);
}

interface IAToken is IERC20 {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
    function POOL() external view returns (address);
}

interface ILendingPool {
    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

contract AaveV2Product is BaseProduct, EIP712 {
    using SafeERC20 for IAToken;

    IAaveProtocolDataProvider public aaveDataProvider;
    bytes32 private immutable _EXCHANGE_TYPEHASH = keccak256("AaveV2ProductExchange(uint256 policyID,address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,uint256 deadline)");

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
        uint24 _price,
        address _quoter
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
        _price,
        _quoter
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
        // swap math
        uint256 balance = token.balanceOf(_policyholder);
        return quoter.tokenToEth(underlying, balance);
    }

    /**
     * @notice Submits a claim.
     * User will give up some of their cToken position to receive ETH.
     * Can only submit one claim per policy.
     * Must be signed by an authorized signer.
     * @param policyID The policy that suffered a loss.
     * @param tokenIn The token the user must give up.
     * @param amountIn The amount the user must give up.
     * @param tokenOut The token the user will receive.
     * @param amountOut The amount the user will receive.
     * @param deadline Transaction must execute before this timestamp.
     * @param signature Signature from the signer.
     */
    function submitClaim(
        uint256 policyID,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut,
        uint256 deadline,
        bytes calldata signature
    ) external payable {
        // validate inputs
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp <= deadline, "expired deadline");
        (address policyholder, address product, , , , ) = policyManager.getPolicyInfo(policyID);
        require(policyholder == msg.sender, "!policyholder");
        require(product == address(this), "wrong product");
        // verify signature
        {
        bytes32 structHash = keccak256(abi.encode(_EXCHANGE_TYPEHASH, policyID, tokenIn, amountIn, tokenOut, amountOut, deadline));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        require(isAuthorizedSigner[signer], "invalid signature");
        }
        // swap tokens
        pullAndSwap(tokenIn, amountIn);
        // burn policy
        policyManager.burn(policyID);
        // submit claim to ClaimsEscrow
        IClaimsEscrow(payable(registry.claimsEscrow())).receiveClaim(policyID, policyholder, amountOut);
        emit ClaimSubmitted(policyID);
    }

    /**
    * @notice Safely pulls a token from msg.sender and if necessary swaps for underlying.
    * @param token token to pull
    * @param amount amount of token to pull
    */
    function pullAndSwap(address token, uint256 amount) internal {
        IAToken atoken = IAToken(token);
        atoken.safeTransferFrom(msg.sender, address(this), amount);
        ILendingPool(atoken.POOL()).withdraw(atoken.UNDERLYING_ASSET_ADDRESS(), amount, msg.sender);
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
}
