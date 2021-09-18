// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "../Governable.sol";
import "../interface/IPolicyManager.sol";
import "../interface/IRiskManager.sol";
import "../interface/ITreasury.sol";
import "../interface/IClaimsEscrow.sol";
import "../interface/IRegistry.sol";
import "../interface/IProduct.sol";
import "../interface/IFusionProduct.sol";


/**
 * @title FusionProduct
 * @author solace.fi
 * @notice Product for fusing policies together.
 */
contract FusionProduct is IFusionProduct, EIP712, ReentrancyGuard, Governable {
    using Address for address;

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Policy Manager.
    IPolicyManager internal _policyManager; // Policy manager ERC721 contract

    // Registry.
    IRegistry internal _registry;

    /// @notice Covered platform.
    /// A platform contract which locates contracts that are covered by this product.
    /// (e.g., UniswapProduct will have Factory as coveredPlatform contract, because every Pair address can be located through getPool() function).
    address internal _coveredPlatform;
    /// @notice Cannot buy new policies while paused. (Default is False)
    bool internal _paused;

    /****
        Book-Keeping Variables
    ****/
    /// @notice The current amount covered (in wei).
    uint256 internal _activeCoverAmount;
    /// @notice The authorized signers.
    mapping(address => bool) internal _isAuthorizedSigner;

    // Typehash for claim submissions.
    // Must be unique for all products.
    // solhint-disable-next-line var-name-mixedcase
    bytes32 internal _SUBMIT_CLAIM_TYPEHASH;

    // The name of the product.
    string internal _productName;

    /***************************************
    EVENTS
    ***************************************/

    /// @notice Emitted when a claim signer is added.
    event SignerAdded(address indexed signer);
    /// @notice Emitted when a claim signer is removed.
    event SignerRemoved(address indexed signer);

    modifier whileUnpaused() {
        require(!_paused, "cannot buy when paused");
        _;
    }

    /**
     * @notice Constructs the product.
     * @param governance_ The governor.
     * @param policyManager_ The PolicyManager contract.
     * @param registry_ The Registry contract.
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_
    ) EIP712("Solace.fi-FusionProduct", "1") Governable(governance_) {
        _policyManager = policyManager_;
        _registry = registry_;
        _SUBMIT_CLAIM_TYPEHASH = keccak256("FusionProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)");
        _productName = "Fusion";
    }

    /***************************************
    POLICYHOLDER FUNCTIONS
    ***************************************/

    /**
     * @notice Fuses policies together.
     * @param policyIDs The list of policies to fuse, They are burnt in the process.
     * @return policyID The ID of the fused policy.
     */
    function fuse(uint256[] calldata policyIDs) external override returns (uint256 policyID) {
        require(policyIDs.length >= 2, "cannot fuse to self");
        // fused policy variables
        uint256 newCoverAmount;
        uint256 averagePriceAccumulator;
        uint40 newExpirationBlock;
        uint16 newFusionDepth;
        bytes memory newPositionDescription;
        // for each policy to fuse
        for(uint256 i = 0; i < policyIDs.length; i++) {
            policyID = policyIDs[i];
            // pull policy
            _policyManager.transferFrom(msg.sender, address(this), policyID);
            // get policy info
            ( , address product, uint256 coverAmount, uint40 expirationBlock, uint24 purchasePrice, bytes memory positionDescription) = _policyManager.getPolicyInfo(policyID);
            // sum of coverAmounts
            newCoverAmount += coverAmount;
            // accumulate for averge price
            averagePriceAccumulator += (coverAmount * uint256(purchasePrice));
            // earliest expirationBlock
            newExpirationBlock = newExpirationBlock < expirationBlock ? newExpirationBlock : expirationBlock;
            // add fusion depth
            if(product == address(this)) {
                // if fusing in a fused policy
                // use assembly to get fusionDepth from positionDescription
                uint16 fusionDepth;
                assembly {
                    // first 16 bytes
                    fusionDepth := div(mload(add(positionDescription, 0x20)), 0x100000000000000000000000000000000)
                }
                newFusionDepth += fusionDepth;
            } else {
                // if fusing in an unfused policy
                newFusionDepth++;
            }
            // TODO: byte encoding of fused policy. use product and positionDescription
            // burn the policy
            IProduct(product).cancelPolicy(policyID, true);
        }
        // TODO: add fusion depth to front of newPositionDescription
        // calculate price
        uint24 averagePrice = uint24(averagePriceAccumulator / newCoverAmount);
        // TODO: check with RiskManager
        // create policy
        policyID = _policyManager.createPolicy(msg.sender, newCoverAmount, newExpirationBlock, averagePrice, newPositionDescription);
        // update local book-keeping variables
        _activeCoverAmount += newCoverAmount;
        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Cancel and burn a policy.
     * User will receive a refund for the remaining blocks.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     * @param forfeitChange False to receive your claim, true to forfeit it to the capital pool.
     */
    function cancelPolicy(uint256 policyID, bool forfeitChange) external override nonReentrant {
        (address policyholder, address product, uint256 coverAmount, uint40 expirationBlock, uint24 purchasePrice, ) = _policyManager.getPolicyInfo(policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");

        uint40 blocksLeft = expirationBlock - uint40(block.number);
        uint256 refundAmount = blocksLeft * coverAmount * purchasePrice / 1e12;
        _policyManager.burn(policyID);
        ITreasury treasury = ITreasury(payable(_registry.treasury()));
        if(refundAmount > 0 && !forfeitChange) treasury.refund(msg.sender, refundAmount);
        _activeCoverAmount -= coverAmount;
        emit PolicyCanceled(policyID);
    }

    /**
     * @notice Submit a claim.
     * The user can only submit one claim per policy and the claim must be signed by an authorized signer.
     * If successful the policy is burnt and a new claim is created.
     * The new claim will be in [`ClaimsEscrow`](../ClaimsEscrow) and have the same ID as the policy.
     * Can only be called by the policyholder.
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
        (address policyholder, address product, uint256 coverAmount, , , ) = _policyManager.getPolicyInfo(policyID);
        require(policyholder == msg.sender, "!policyholder");
        require(product == address(this), "wrong product");
        require(amountOut <= coverAmount, "excessive amount out");
        // verify signature
        {
        bytes32 structHash = keccak256(abi.encode(_SUBMIT_CLAIM_TYPEHASH, policyID, msg.sender, amountOut, deadline));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        require(_isAuthorizedSigner[signer], "invalid signature");
        }
        // burn policy
        _policyManager.burn(policyID);
        // submit claim to ClaimsEscrow
        IClaimsEscrow(payable(_registry.claimsEscrow())).receiveClaim(policyID, policyholder, amountOut);
        emit ClaimSubmitted(policyID);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice The current amount covered (in wei).
    function activeCoverAmount() external view override returns (uint256) {
        return _activeCoverAmount;
    }

    /**
     * @notice Returns the name of the product.
     * @return productName The name of the product.
     */
    function name() external view virtual override returns (string memory productName) {
        return _productName;
    }

    /// @notice Cannot buy new policies while paused. (Default is False)
    function paused() external view override returns (bool) {
        return _paused;
    }

    /// @notice Address of the [`PolicyManager`](../PolicyManager).
    function policyManager() external view override returns (address) {
        return address(_policyManager);
    }

    /**
     * @notice Returns true if the given account is authorized to sign claims.
     * @param account Potential signer to query.
     * @return status True if is authorized signer.
     */
     function isAuthorizedSigner(address account) external view override returns (bool status) {
        return _isAuthorizedSigner[account];
     }

     /**
      * @notice Determines if the byte encoded description of a position(s) is valid.
      * The description will only make sense in context of the product.
      * @dev This function should be overwritten in inheriting Product contracts.
      * If invalid, return false if possible. Reverting is also acceptable.
      * @param positionDescription The description to validate.
      * @return isValid True if is valid.
      */
     function isValidPositionDescription(bytes memory positionDescription) public view returns (bool isValid) {
        return true; // TODO: this
     }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Updates the product's book-keeping variables.
     * Can only be called by the [`PolicyManager`](../PolicyManager).
     * @param coverDiff The change in active cover amount.
     */
    function updateActiveCoverAmount(int256 coverDiff) external override {
        require(msg.sender == address(_policyManager), "!policymanager");
        _activeCoverAmount = add(_activeCoverAmount, coverDiff);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

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

    /**
     * @notice Pauses or unpauses buying and extending policies.
     * Cancelling policies and submitting claims are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @dev Used for security and to gracefully phase out old products.
     * @param paused_ True to pause, false to unpause.
     */
    function setPaused(bool paused_) external onlyGovernance {
        _paused = paused_;
    }

    /**
     * @notice Changes the policy manager.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param policyManager_ The new policy manager.
     */
    function setPolicyManager(address policyManager_) external override onlyGovernance {
        _policyManager = IPolicyManager(policyManager_);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Adds two numbers.
     * @param a The first number as a uint256.
     * @param b The second number as an int256.
     * @return c The sum as a uint256.
     */
    function add(uint256 a, int256 b) internal pure returns (uint256 c) {
        return (b > 0)
            ? a + uint256(b)
            : a - uint256(-b);
    }
}
