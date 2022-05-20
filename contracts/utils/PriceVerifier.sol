// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./../utils/Governable.sol";
import "./../interfaces/utils/IPriceVerifier.sol";

/**
 * @title IPriceVerifier
 * @author solace.fi
 * @notice Verifies token price.
*/
contract PriceVerifier is IPriceVerifier, EIP712, Governable {

    /***************************************
    STATE VARIABLES
    ***************************************/

    /// @notice The authorized off-chain `SOLACE` price signers.
    mapping(address => bool) private _priceSigners;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the Solace Cover Teller - Stables contract.
     * @param _governance The address of the [governor](/docs/protocol/governance).
    */
    // solhint-disable-next-line no-empty-blocks
    constructor(address _governance) EIP712("Solace.fi-PriceVerifier", "1") Governable(_governance) {}

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Verifies `SOLACE` price data.
     * @param token The token to verify price.
     * @param price The `SOLACE` price in wei(usd).
     * @param deadline The deadline for the price.
     * @param signature The `SOLACE` price signature.
    */
    function verifyPrice(address token, uint256 price, uint256 deadline, bytes calldata signature) public view override returns (bool) {
        require(token != address(0x0), "zero address token");
        require(price > 0, "zero price");
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp <= deadline, "expired deadline");

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("PriceData(address token,uint256 price,uint256 deadline)"),
                token,
                price,
                deadline
            )
        );
        bytes32 hashTypedData = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hashTypedData, signature);
        return _priceSigners[signer];
    }

    /**
     * @notice Checks whether given signer is an authorized signer or not.
     * @param signer The price signer address to check.
     * @return bool True if signer is a authorized signer.
    */
    function isPriceSigner(address signer) external view override returns (bool) {
        return _priceSigners[signer];
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
        _priceSigners[signer] = true;
        emit PriceSignerAdded(signer);
    }

    /**
     * @notice Removes a price signer.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param signer The signer to remove.
     */
    function removePriceSigner(address signer) external override onlyGovernance {
        _priceSigners[signer] = false;
        emit PriceSignerRemoved(signer);
    }
}
