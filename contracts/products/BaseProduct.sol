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
import "../interface/IExchangeQuoter.sol";
import "../interface/IProduct.sol";


/**
 * @title BaseProduct
 * @author solace.fi
 * @notice The abstract smart contract that is inherited by every concrete individual **Product** contract.
 *
 * It is required to extend [`IProduct`](../interface/IProduct) and recommended to extend `BaseProduct`. `BaseProduct` extends [`IProduct`](../interface/IProduct) and takes care of the heavy lifting; new products simply need to set some variables in the constructor and implement [`appraisePosition()`](#appraiseposition). It has some helpful functionality not included in [`IProduct`](../interface/IProduct) including [`ExchangeQuoter` price oracles](../interface/IExchangeQuoter) and claim signers.
 */
abstract contract BaseProduct is IProduct, EIP712, ReentrancyGuard, Governable {
    using Address for address;

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Policy Manager.
    IPolicyManager internal _policyManager; // Policy manager ERC721 contract

    // Registry.
    IRegistry internal _registry;

    /// @notice The minimum policy period in blocks.
    uint40 internal _minPeriod;
    /// @notice The maximum policy period in blocks.
    uint40 internal _maxPeriod;
    /// @notice Covered platform.
    /// A platform contract which locates contracts that are covered by this product.
    /// (e.g., UniswapProduct will have Factory as coveredPlatform contract, because every Pair address can be located through getPool() function).
    address internal _coveredPlatform;
    /// @notice Price in wei per 1e12 wei of coverage per block.
    uint24 internal _price;
    /// @notice The max cover amount divisor for per user (maxCover / divisor = maxCoverPerUser).
    uint32 internal _maxCoverPerUserDivisor;
    /// @notice Cannot buy new policies while paused. (Default is False)
    bool internal _paused;

    /****
        Book-Keeping Variables
    ****/
    /// @notice The total policy count this product sold.
    uint256 internal _productPolicyCount;
    /// @notice The current amount covered (in wei).
    uint256 internal _activeCoverAmount;
    /// @notice The authorized signers.
    mapping(address => bool) internal _isAuthorizedSigner;

    // IExchangeQuoter.
    IExchangeQuoter internal _quoter;

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
    /// @notice Emitted when the exchange quoter is set.
    event QuoterSet(address indexed quoter);

    modifier whileUnpaused() {
        require(!_paused, "cannot buy when paused");
        _;
    }

    /**
     * @notice Constructs the product. `BaseProduct` by itself is not deployable, only its subclasses.
     * @param governance_ The governor.
     * @param policyManager_ The IPolicyManager contract.
     * @param registry_ The IRegistry contract.
     * @param coveredPlatform_ A platform contract which locates contracts that are covered by this product.
     * @param minPeriod_ The minimum policy period in blocks to purchase a **policy**.
     * @param maxPeriod_ The maximum policy period in blocks to purchase a **policy**.
     * @param price_ The cover price for the **Product**.
     * @param maxCoverPerUserDivisor_ The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
     * @param quoter_ The exchange quoter address.
     * @param domain_ The user readable name of the EIP712 signing domain.
     * @param version_ The current major version of the signing domain.
     */
    constructor (
        address governance_,
        IPolicyManager policyManager_,
        IRegistry registry_,
        address coveredPlatform_,
        uint40 minPeriod_,
        uint40 maxPeriod_,
        uint24 price_,
        uint32 maxCoverPerUserDivisor_,
        address quoter_,
        string memory domain_,
        string memory version_
    ) EIP712(domain_, version_) Governable(governance_) {
        _policyManager = policyManager_;
        _registry = registry_;
        _coveredPlatform = coveredPlatform_;
        _minPeriod = minPeriod_;
        _maxPeriod = maxPeriod_;
        _price = price_;
        _maxCoverPerUserDivisor = maxCoverPerUserDivisor_;
        _quoter = IExchangeQuoter(quoter_);
    }

    /***************************************
    POLICYHOLDER FUNCTIONS
    ***************************************/

    /**
     * @notice Purchases and mints a policy on the behalf of the policyholder.
     * User will need to pay **ETH**.
     * @param policyholder Holder of the position to cover.
     * @param positionContract The contract address where the policyholder has a position to be covered.
     * @param coverAmount The value to cover in **ETH**. Will only cover up to the appraised value.
     * @param blocks The length (in blocks) for policy.
     * @return policyID The ID of newly created policy.
     */
    function buyPolicy(address policyholder, address positionContract, uint256 coverAmount, uint40 blocks) external payable override nonReentrant whileUnpaused returns (uint256 policyID){
        // check that the buyer has a position in the covered protocol
        uint256 positionAmount = appraisePosition(policyholder, positionContract);
        coverAmount = min(positionAmount, coverAmount);
        require(coverAmount != 0, "zero position value");

        // check that the product can provide coverage for this policy
        {
        uint256 maxCover = maxCoverAmount();
        uint256 maxUserCover = maxCover / _maxCoverPerUserDivisor;
        require(_activeCoverAmount + coverAmount <= maxCover, "max covered amount is reached");
        require(coverAmount <= maxUserCover, "over max cover single user");
        }
        // check that the buyer has paid the correct premium
        uint256 premium = coverAmount * blocks * _price / 1e12;
        require(msg.value >= premium && premium != 0, "insufficient payment");

        // check that the buyer provided valid period
        require(blocks >= _minPeriod && blocks <= _maxPeriod, "invalid period");

        // create the policy
        uint40 expirationBlock = uint40(block.number + blocks);
        policyID = _policyManager.createPolicy(policyholder, positionContract, coverAmount, expirationBlock, _price);

        // update local book-keeping variables
        _activeCoverAmount += coverAmount;
        _productPolicyCount++;

        // return excess payment
        if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
        // transfer premium to the treasury
        ITreasury(payable(_registry.treasury())).routePremiums{value: premium}();

        emit PolicyCreated(policyID);

        return policyID;
    }

    /**
     * @notice Increase or decrease the cover amount of the policy.
     * User may need to pay **ETH** for increased cover amount or receive a refund for decreased cover amount.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     * @param coverAmount The new value to cover in **ETH**. Will only cover up to the appraised value.
     */
    function updateCoverAmount(uint256 policyID, uint256 coverAmount) external payable override nonReentrant whileUnpaused {
        (address policyholder, address product, address positionContract, uint256 previousCoverAmount, uint40 expirationBlock, uint24 purchasePrice) = _policyManager.getPolicyInfo(policyID);
        // check msg.sender is policyholder
        require(policyholder == msg.sender, "!policyholder");
        // check for correct product
        require(product == address(this), "wrong product");
        // check for policy expiration
        require(expirationBlock >= block.number, "policy is expired");

        // check that the buyer has a position in the covered protocol
        uint256 positionAmount = appraisePosition(policyholder, positionContract);
        coverAmount = min(positionAmount, coverAmount);
        require(coverAmount != 0, "zero position value");
        // check that the product can provide coverage for this policy
        {
        uint256 maxCover = maxCoverAmount();
        uint256 maxUserCover = maxCover / _maxCoverPerUserDivisor;
        require(_activeCoverAmount + coverAmount - previousCoverAmount <= maxCover, "max covered amount is reached");
        require(coverAmount <= maxUserCover, "over max cover single user");
        }
        // calculate premium needed for new cover amount as if policy is bought now
        uint256 remainingBlocks = expirationBlock - block.number;
        uint256 newPremium = coverAmount * remainingBlocks * _price / 1e12;

        // calculate premium already paid based on current policy
        uint256 paidPremium = previousCoverAmount * remainingBlocks * purchasePrice / 1e12;

        if (newPremium >= paidPremium) {
            uint256 premium = newPremium - paidPremium;
            // check that the buyer has paid the correct premium
            require(msg.value >= premium, "insufficient payment");
            if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
            // transfer premium to the treasury
            ITreasury(payable(_registry.treasury())).routePremiums{value: premium}();
        } else {
            if(msg.value > 0) payable(msg.sender).transfer(msg.value);
            uint256 refundAmount = paidPremium - newPremium;
            ITreasury(payable(_registry.treasury())).refund(msg.sender, refundAmount);
        }
        // update policy's URI and emit event
        _policyManager.setPolicyInfo(policyID, policyholder, positionContract, coverAmount, expirationBlock, _price);
        emit PolicyUpdated(policyID);
    }

    /**
     * @notice Extend a policy.
     * User will need to pay **ETH**.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     * @param extension The length of extension in blocks.
     */
    function extendPolicy(uint256 policyID, uint40 extension) external payable override nonReentrant whileUnpaused {
        // check that the msg.sender is the policyholder
        (address policyholder, address product, address positionContract, uint256 coverAmount, uint40 expirationBlock, uint24 purchasePrice) = _policyManager.getPolicyInfo(policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");
        require(expirationBlock >= block.number, "policy is expired");

        // compute the premium
        uint256 premium = coverAmount * extension * purchasePrice / 1e12;
        // check that the buyer has paid the correct premium
        require(msg.value >= premium, "insufficient payment");
        if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
        // transfer premium to the treasury
        ITreasury(payable(_registry.treasury())).routePremiums{value: premium}();
        // check that the buyer provided valid period
        uint40 newExpirationBlock = expirationBlock + extension;
        uint40 duration = newExpirationBlock - uint40(block.number);
        require(duration >= _minPeriod && duration <= _maxPeriod, "invalid period");
        // update the policy's URI
        _policyManager.setPolicyInfo(policyID, policyholder, positionContract, coverAmount, newExpirationBlock, purchasePrice);
        emit PolicyExtended(policyID);
    }

    /**
     * @notice Extend a policy and update its cover amount.
     * User may need to pay **ETH** for increased cover amount or receive a refund for decreased cover amount.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     * @param coverAmount The new value to cover in **ETH**. Will only cover up to the appraised value.
     * @param extension The length of extension in blocks.
     */
    function updatePolicy(uint256 policyID, uint256 coverAmount, uint40 extension) external payable override nonReentrant whileUnpaused {
        (address policyholder, address product, address positionContract, uint256 previousCoverAmount, uint40 previousExpirationBlock, uint24 purchasePrice) = _policyManager.getPolicyInfo(policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");
        require(previousExpirationBlock >= block.number, "policy is expired");

        // appraise the position
        uint256 positionAmount = appraisePosition(policyholder, positionContract);
        coverAmount = min(positionAmount, coverAmount);
        require(coverAmount > 0, "zero position value");

        // check that the product can still provide coverage
        {
        uint256 maxCover = maxCoverAmount();
        uint256 maxUserCover = maxCover / _maxCoverPerUserDivisor;
        require(_activeCoverAmount + coverAmount - previousCoverAmount <= maxCover, "max covered amount is reached");
        require(coverAmount <= maxUserCover, "over max cover single user");
        }
        // add new block extension
        uint40 newExpirationBlock = previousExpirationBlock + extension;

        // check if duration is valid
        uint40 duration = newExpirationBlock - uint40(block.number);
        require(duration >= _minPeriod && duration <= _maxPeriod, "invalid period");

        // update policy info
        _policyManager.setPolicyInfo(policyID, policyholder, positionContract, coverAmount, newExpirationBlock, _price);

        // calculate premium needed for new cover amount as if policy is bought now
        uint256 newPremium = coverAmount * duration * _price / 1e12;

        // calculate premium already paid based on current policy
        uint256 paidPremium = previousCoverAmount * (previousExpirationBlock - uint40(block.number)) * purchasePrice / 1e12;

        if (newPremium >= paidPremium) {
            uint256 premium = newPremium - paidPremium;
            require(msg.value >= premium, "insufficient payment");
            if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
            ITreasury(payable(_registry.treasury())).routePremiums{value: premium}();
        } else {
            if(msg.value > 0) payable(msg.sender).transfer(msg.value);
            uint256 refund = paidPremium - newPremium;
            ITreasury(payable(_registry.treasury())).refund(msg.sender, refund);
        }
        emit PolicyUpdated(policyID);
    }

    /**
     * @notice Cancel and burn a policy.
     * User will receive a refund for the remaining blocks.
     * Can only be called by the policyholder.
     * @param policyID The ID of the policy.
     */
    function cancelPolicy(uint256 policyID) external override nonReentrant {
        (address policyholder, address product, , uint256 coverAmount, uint40 expirationBlock, uint24 purchasePrice) = _policyManager.getPolicyInfo(policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");

        uint40 blocksLeft = expirationBlock - uint40(block.number);
        uint256 refundAmount = blocksLeft * coverAmount * purchasePrice / 1e12;
        _policyManager.burn(policyID);
        ITreasury(payable(_registry.treasury())).refund(msg.sender, refundAmount);
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
        (address policyholder, address product, , , , ) = _policyManager.getPolicyInfo(policyID);
        require(policyholder == msg.sender, "!policyholder");
        require(product == address(this), "wrong product");
        // verify signature
        {
        bytes32 structHash = keccak256(abi.encode(_SUBMIT_CLAIM_TYPEHASH, policyID, amountOut, deadline));
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
    QUOTE VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Calculate the value of a user's position in **ETH**.
     * Every product will have a different mechanism to determine a user's total position in that product's protocol.
     * @dev It should validate that the `positionContract` belongs to the protocol and revert if it doesn't.
     * @param policyholder The owner of the position.
     * @param positionContract The address of the smart contract the `policyholder` has their position in (e.g., for `UniswapV2Product` this would be the Pair's address).
     * @return positionAmount The value of the position.
     */
    function appraisePosition(address policyholder, address positionContract) public view virtual override returns (uint256 positionAmount);

    /**
     * @notice Calculate a premium quote for a policy.
     * @param policyholder The holder of the position to cover.
     * @param positionContract The address of the exact smart contract the policyholder has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @param coverAmount The value to cover in **ETH**.
     * @param blocks The length for policy.
     * @return premium The quote for their policy in **Wei**.
     */
    // solhint-disable-next-line no-unused-vars
    function getQuote(address policyholder, address positionContract, uint256 coverAmount, uint40 blocks) external view override returns (uint256 premium){
        return coverAmount * blocks * _price / 1e12;
    }

    /***************************************
    GLOBAL VIEW FUNCTIONS
    ***************************************/

    /// @notice Price in wei per 1e12 wei of coverage per block.
    function price() external view override returns (uint24) {
        return _price;
    }

    /// @notice The minimum policy period in blocks.
    function minPeriod() external view override returns (uint40) {
        return _minPeriod;
    }

    /// @notice The maximum policy period in blocks.
    function maxPeriod() external view override returns (uint40) {
        return _maxPeriod;
    }

    /**
     * @notice The maximum sum of position values that can be covered by this product.
     * @return maxCover The max cover amount.
     */
    function maxCoverAmount() public view override returns (uint256 maxCover) {
        return IRiskManager(_registry.riskManager()).maxCoverAmount(address(this));
    }

    /**
     * @notice The maximum cover amount for a single policy.
     * @return maxCover The max cover amount per user.
     */
    function maxCoverPerUser() external view override returns (uint256 maxCover) {
        return maxCoverAmount() / _maxCoverPerUserDivisor;
    }

    /// @notice The max cover amount divisor for per user (maxCover / divisor = maxCoverPerUser).
    function maxCoverPerUserDivisor() external view override returns (uint32) {
        return _maxCoverPerUserDivisor;
    }
    /// @notice Covered platform.
    /// A platform contract which locates contracts that are covered by this product.
    /// (e.g., `UniswapProduct` will have `Factory` as `coveredPlatform` contract, because every `Pair` address can be located through `getPool()` function).
    function coveredPlatform() external view override returns (address) {
        return _coveredPlatform;
    }
    /// @notice The total policy count this product sold.
    function productPolicyCount() external view override returns (uint256) {
        return _productPolicyCount;
    }
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
     * @notice Sets the price for this product.
     * @param price_ Price in wei per 1e12 wei of coverage per block.
     */
    function setPrice(uint24 price_) external override onlyGovernance {
        _price = price_;
    }

    /**
     * @notice Sets the minimum number of blocks a policy can be purchased for.
     * @param minPeriod_ The minimum number of blocks.
     */
    function setMinPeriod(uint40 minPeriod_) external override onlyGovernance {
        _minPeriod = minPeriod_;
    }

    /**
     * @notice Sets the maximum number of blocks a policy can be purchased for.
     * @param maxPeriod_ The maximum number of blocks
     */
    function setMaxPeriod(uint40 maxPeriod_) external override onlyGovernance {
        _maxPeriod = maxPeriod_;
    }

    /**
     * @notice Sets the max cover amount divisor per user (maxCover / divisor = maxCoverPerUser).
     * @param maxCoverPerUserDivisor_ The new divisor.
     */
    function setMaxCoverPerUserDivisor(uint32 maxCoverPerUserDivisor_) external override onlyGovernance {
        _maxCoverPerUserDivisor = maxCoverPerUserDivisor_;
    }

    /**
     * @notice Sets a new ExchangeQuoter.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param quoter_ The new quoter address.
     */
    function setExchangeQuoter(address quoter_) external onlyGovernance {
        _quoter = IExchangeQuoter(quoter_);
    }

    /**
     * @notice Adds a new signer that can authorize claims.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param signer The signer to add.
     */
    function addSigner(address signer) external onlyGovernance {
        _isAuthorizedSigner[signer] = true;
        emit SignerAdded(signer);
    }

    /**
     * @notice Removes a signer.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param signer The signer to remove.
     */
    function removeSigner(address signer) external onlyGovernance {
        _isAuthorizedSigner[signer] = false;
        emit SignerRemoved(signer);
    }

    /**
     * @notice Pauses or unpauses buying and extending policies.
     * Cancelling policies and submitting claims are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @dev Used for security and to gracefully phase out old products.
     * @param paused_ True to pause, false to unpause.
     */
    function setPaused(bool paused_) external onlyGovernance {
        _paused = paused_;
    }

    /**
     * @notice Changes the covered platform.
     * The function should be used if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param coveredPlatform_ The platform to cover.
     */
    function setCoveredPlatform(address coveredPlatform_) public virtual override onlyGovernance {
        _coveredPlatform = coveredPlatform_;
    }

    /**
     * @notice Changes the policy manager.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param policyManager_ The new policy manager.
     */
    function setPolicyManager(address policyManager_) external override onlyGovernance {
        _policyManager = IPolicyManager(policyManager_);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice The function is used to add two numbers.
     * @param a The first number as a uint256.
     * @param b The second number as an int256.
     * @return c The sum as a uint256.
     */
    function add(uint256 a, int256 b) internal pure returns (uint256 c) {
        return (b > 0)
            ? a + uint256(b)
            : a - uint256(-b);
    }

    /**
     * @notice The function is used to return minimum number between two numbers..
     * @param a The first number as a uint256.
     * @param b The second number as an int256.
     * @return c The min as a uint256.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
