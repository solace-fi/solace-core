// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./../utils/Governable.sol";
import "./../interfaces/utils/ISOLACEPriceVerifier.sol";

/**
 * @title ISOLACEPriceVerifier
 * @author solace.fi
 * @notice Verifies `SOLACE` token price.
*/
contract SOLACEPriceVerifier is ISOLACEPriceVerifier, EIP712, Governable {

    /***************************************
    STATE VARIABLES
    ***************************************/
    /// @notice Registry address.
    address public registry;
    
    /// @notice SOLACE token address.
    address public solace;

    /// @notice Solace Cover Points contract.
    address public scp;

    /// @notice The premum pool.
    address public premiumPool;

    /// @notice The authorized off-chain `SOLACE` price signers.
    mapping(address => bool) private _isAuthorizedPriceSigner;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the Solace Cover Teller - Stables contract.
     * @param _governance The address of the [governor](/docs/protocol/governance).
    */
    // solhint-disable-next-line no-empty-blocks
    constructor(address _governance) EIP712("SOLACEPriceVerifier", "V1") Governable(_governance) {}

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Verifies `SOLACE` price data.
     * @param price The `SOLACE` price in wei(usd).
     * @param signature The `SOLACE` price signature.
    */
    function verifyPrice(uint256 price, bytes calldata signature) public view override returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("PriceData(uint256 price,uint256 block)"),
                price,
                block.number
            )
        );
        bytes32 hashTypedData = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hashTypedData, signature);
        return _isAuthorizedPriceSigner[signer];
    }

    /**
     * @notice Checks whether given signer is an authorized signer or not.
     * @param signer The price signer address to check.
     * @return bool True if signer is a authorized signer.
    */
    function isPriceSigner(address signer) external view override returns (bool) {
        return _isAuthorizedPriceSigner[signer];
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a new price signer.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer The signer to add.
     */
     function addPriceSigner(address signer) external override onlyGovernance {
        require(signer != address(0x0), "zero address signer");
        _isAuthorizedPriceSigner[signer] = true;
        emit PriceSignerAdded(signer);
    }

    /**
     * @notice Removes a price signer.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer The signer to remove.
     */
    function removePriceSigner(address signer) external override onlyGovernance {
        _isAuthorizedPriceSigner[signer] = false;
        emit PriceSignerRemoved(signer);
    }
}
