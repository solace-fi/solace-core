// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

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
    function redeem(uint256 redeemTokens) external returns (uint256);
}

contract CompoundProductRinkeby is BaseProduct, EIP712 {

    IComptrollerRinkeby public comptroller;
    bytes32 private immutable _EXCHANGE_TYPEHASH = keccak256("CompoundProductExchange(uint256 policyID,uint256 amountOut,uint256 deadline)");
    IExchangeQuoter public quoter;

    constructor (
        address _governance,
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint64 _minPeriod,
        uint64 _maxPeriod,
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
    ) EIP712("Solace.fi-CompoundProduct", "1") {
        comptroller = IComptrollerRinkeby(_coveredPlatform);
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

    /**
     * @notice Submits a claim.
     * Can only submit one claim per policy.
     * Must be signed by an authorized signer.
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
    ) external nonReentrant {
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

    // receives ETH from cETH
    receive () external payable {}

    /**
     * @notice Changes the covered platform.
     * Use this if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current governor.
     * @param _coveredPlatform The platform to cover.
     */
    function setCoveredPlatform(address _coveredPlatform) public override {
        super.setCoveredPlatform(_coveredPlatform);
        comptroller = IComptrollerRinkeby(_coveredPlatform);
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

    /**
     * @notice String equality.
     * @param a The first string.
     * @param b The second string.
     * @return True if equal.
     */
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    /**
     * @notice Returns the name of the product.
     * @return CompoundRinkeby
     */
    function name() public pure override returns (string memory) {
        return "Compound";
    }
}
