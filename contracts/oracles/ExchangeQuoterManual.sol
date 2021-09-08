// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "../Governable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interface/IExchangeQuoter.sol";


/**
 * @title ExchangeQuoterManual
 * @author solace.
 * @notice Calculates exchange rates for trades between ERC20 tokens and Ether. This version uses rates set by authorized signers.
 */
contract ExchangeQuoterManual is IExchangeQuoter, Governable {

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a claim signer is added.
    event SignerAdded(address indexed signer);
    /// @notice Emitted when a claim signer is removed.
    event SignerRemoved(address indexed signer);

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    // Given a token, how much eth could one token buy (respecting decimals)
    mapping(address => uint256) internal _rates;

    /// @notice The authorized signers.
    mapping(address => bool) internal _isAuthorizedSigner;

    // ETH_ADDRESS
    // solhint-disable-next-line var-name-mixedcase
    address internal _ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /**
     * @notice Constructs the ExchangeQuoterManual contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     */
    constructor(address governance_) Governable(governance_) {
        _isAuthorizedSigner[governance_] = true; // add self
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Given a token, how much **ETH** could one token buy (respecting source decimals).
     * @param token Address of token to query.
     * @return amountOut Amount of **ETH** received.
     */
    function rates(address token) external view returns (uint256 amountOut) {
        if(token == _ETH_ADDRESS) return 1000000000000000000;
        return _rates[token];
    }

    /**
     * @notice Calculates the exchange rate for an amount of token to eth.
     * @param token The token to give.
     * @param amount The amount to give.
     * @return amountOut The amount of eth received.
     */
    function tokenToEth(address token, uint256 amount) external view override returns (uint256 amountOut) {
        if(token == _ETH_ADDRESS) return amount;
        return amount * _rates[token] / (10 ** IERC20Metadata(token).decimals());
    }

    /**
     * @notice Returns true if the given account is authorized to sign claims.
     * @param account Potential signer to query.
     * @return status True if is authorized signer.
     */
    function isAuthorizedSigner(address account) external view returns (bool status) {
        return _isAuthorizedSigner[account];
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the exchange rates.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param tokens The tokens to set.
     * @param newRates The rates to set.
     */
    function setRates(address[] calldata tokens, uint256[] calldata newRates) external {
        require(_isAuthorizedSigner[msg.sender], "!signer");
        uint256 length = tokens.length;
        require(length == newRates.length, "unequal lengths");
        for(uint256 i = 0; i < length; ++i) {
            _rates[tokens[i]] = newRates[i];
        }
    }

    /**
     * @notice Adds a new signer that can authorize claims.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer The signer to add.
     */
    function addSigner(address signer) external onlyGovernance {
        _isAuthorizedSigner[signer] = true;
        emit SignerAdded(signer);
    }

    /**
     * @notice Removes a signer.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer The signer to remove.
     */
    function removeSigner(address signer) external onlyGovernance {
        _isAuthorizedSigner[signer] = false;
        emit SignerRemoved(signer);
    }
}
