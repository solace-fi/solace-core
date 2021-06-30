// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "../interface/IExchangeQuoter.sol";
import "./BaseProduct.sol";


interface IComptrollerRinkeby {
    function markets(address market) external view returns (bool isListed, uint256 collateralFactorMantissa);
}

interface ICToken {
    function balanceOf(address owner) external view returns (uint256);
    function exchangeRateStored() external view returns (uint256);
    function symbol() external view returns (string memory);
    function underlying() external view returns (address);
}

contract CompoundProductRinkeby is BaseProduct, EIP712 {
    using SafeERC20 for IERC20;

    IComptrollerRinkeby public comptroller;
    IExchangeQuoter public quoter;
    bytes32 private immutable _EXCHANGE_TYPEHASH = keccak256("CompoundProductExchange(uint256 policyId,address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,uint256 deadline)");

    constructor (
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint256 _maxCoverAmount,
        uint256 _maxCoverPerUser,
        uint64 _minPeriod,
        uint64 _maxPeriod,
        uint64 _cancelFee,
        uint24 _price,
        address _quoter
    ) BaseProduct(
        _policyManager,
        _registry,
        _coveredPlatform,
        _maxCoverAmount,
        _maxCoverPerUser,
        _minPeriod,
        _maxPeriod,
        _cancelFee,
        _price
    ) EIP712("Solace.fi-CompoundProduct", "1") {
        comptroller = IComptrollerRinkeby(_coveredPlatform);
        quoter = IExchangeQuoter(_quoter);
    }

    /**
     * @notice Sets a new Comptroller.
     * Can only be called by the current governor.
     * @param _comptroller The new comptroller address.
     */
    function setComptroller(address _comptroller) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        comptroller = IComptrollerRinkeby(_comptroller);
    }

    /**
     * @notice Sets a new ExchangeQuoter.
     * Can only be called by the current governor.
     * @param _quoter The new quoter address.
     */
    function setExchangeQuoter(address _quoter) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        quoter = IExchangeQuoter(_quoter);
    }

    // _positionContract must be a cToken including cETH
    // see https://compound.finance/markets
    // and https://etherscan.io/accounts/label/compound
    function appraisePosition(address _policyholder, address _positionContract) public view override returns (uint256 positionAmount) {
        // verify _positionContract
        (bool isListed, ) = comptroller.markets(_positionContract);
        require(isListed, "Invalid position contract");
        // swap math
        ICToken token = ICToken(_positionContract);
        uint256 balance = token.balanceOf(_policyholder);
        uint256 exchangeRate = token.exchangeRateStored();
        balance = balance * exchangeRate / 1e18;
        if(compareStrings(token.symbol(), "cETH")) return balance;
        return quoter.tokenToEth(token.underlying(), balance);
    }

    // TODO: allow for multiple tokens in and out
    function submitClaim(
        uint256 policyId,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut,
        uint256 deadline,
        bytes calldata signature
    ) external payable {
        // TODO: check for duplicate claim
        // validate inputs
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp <= deadline, "expired deadline");
        (address policyholder, address product, , , , ) = policyManager.getPolicyInfo(policyId);
        require(policyholder == msg.sender, "!policyholder"); // TODO: allow submit by paclas?
        require(product == address(this), "wrong product");
        // verify signature
        {
        bytes32 structHash = keccak256(abi.encode(_EXCHANGE_TYPEHASH, policyId, tokenIn, amountIn, tokenOut, amountOut, deadline));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        require(isAuthorizedSigner[signer], "invalid signature");
        }
        // pull tokens
        if(tokenIn == ETH_ADDRESS) {
            require(msg.value >= amountIn);
            ITreasury(payable(registry.treasury())).routePremiums{value: msg.value}();
        }
        else IERC20(tokenIn).safeTransferFrom(msg.sender, registry.treasury(), amountIn);
        // submit claim to ClaimsEscrow
        // TODO: only allowed tokenOut is eth, allow for others
        IVault(registry.vault()).processClaim(policyholder, amountOut);
        emit ClaimSubmitted(policyId);
    }

    /**
     * @notice String equality.
     * @param a The first string.
     * @param b The second string.
     * @return True if equal.
     */
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
