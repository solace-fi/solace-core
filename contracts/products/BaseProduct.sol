// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../Governable.sol";
import "../interface/IPolicyManager.sol";
import "../interface/IRiskManager.sol";
import "../interface/ITreasury.sol";
import "../interface/IClaimsEscrow.sol";
import "../interface/IRegistry.sol";
import "../interface/IProduct.sol";


/**
 * @title BaseProduct
 * @author solace.fi
 * @notice The abstract smart contract that is inherited by every concrete individual `Product` contracts.
 */
abstract contract BaseProduct is IProduct, ReentrancyGuard, Governable {
    using Address for address;

    /// @notice Policy Manager.
    IPolicyManager public policyManager; // Policy manager ERC721 contract

    /// @notice Registry.
    IRegistry public registry;

    /****
       Product Variables
    ****/
    /// @notice Covered platform.
    /// A platform contract which locates contracts that are covered by this product.
    /// (e.g., UniswapProduct will have Factory as coveredPlatform contract, because every Pair address can be located through getPool() function).
    address public override coveredPlatform;
    /// @notice The minimum policy period in blocks.
    uint40 public override minPeriod;
    /// @notice The maximum policy period in blocks.
    uint40 public override maxPeriod;
    /// @notice The cover price (in wei) per block per wei (multiplied by 1e12 to avoid underflow upon construction or setter).
    uint24 public override price;
    /// @notice The max cover amount divisor for per user (maxCover / divisor = maxCoverPerUser).
    uint32 public override maxCoverPerUserDivisor;

    /****
        Book-Keeping Variables
    ****/
    /// @notice The total policy count this product sold.
    uint256 public override productPolicyCount;
    /// @notice The current amount covered (in wei).
    uint256 public override activeCoverAmount;
    /// @notice The authorized signers.
    mapping(address => bool) public isAuthorizedSigner;
    /// @notice The ETH address.
    address internal constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    /// @notice The contract is paused.(Default is False)
    bool public paused;

    /****
        Events
    ****/
    event SignerAdded(address _signer);
    event SignerRemoved(address _signer);
    event ClaimSubmitted(uint256 indexed policyID);

    /**
     * @notice The constructor. The every concrete `Product` contract provides constructor parameters.
     * @param _governance The governor.
     * @param _policyManager The IPolicyManager contract.
     * @param _registry The IRegistry contract.
     * @param _coveredPlatform A platform contract which locates contracts that are covered by this product.
     * @param _minPeriod The minimum policy period in blocks to purchase a **policy**.
     * @param _maxPeriod The maximum policy period in blocks to purchase a **policy**.
     * @param _price The cover price for the **Product**.
     * @param _maxCoverPerUserDivisor The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
     */
    constructor (
        address _governance,
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint40 _minPeriod,
        uint40 _maxPeriod,
        uint24 _price,
        uint32 _maxCoverPerUserDivisor
    ) Governable(_governance) {
        policyManager = _policyManager;
        registry = _registry;
        coveredPlatform = _coveredPlatform;
        minPeriod = _minPeriod;
        maxPeriod = _maxPeriod;
        price = _price;
        maxCoverPerUserDivisor = _maxCoverPerUserDivisor;
        productPolicyCount = 0;
        activeCoverAmount = 0;
    }

    /****
        GETTERS + SETTERS
        Functions which get and set important product state variables
    ****/

    /**
     * @notice Sets the price for this product.
     * @param _price Cover price (in wei) per ether per block.
     */
    function setPrice(uint24 _price) external override onlyGovernance {
        price = _price;
    }

    /**
     * @notice Sets the minimum number of blocks a policy can be purchased for.
     * @param _minPeriod The minimum number of blocks.
     */
    function setMinPeriod(uint40 _minPeriod) external override onlyGovernance {
        minPeriod = _minPeriod;
    }

    /**
     * @notice Sets the maximum number of blocks a policy can be purchased for.
     * @param _maxPeriod The maximum number of blocks
     */
    function setMaxPeriod(uint40 _maxPeriod) external override onlyGovernance {
        maxPeriod = _maxPeriod;
    }

    /**
     * @notice Adds a new signer that can authorize claims.
     * Can only be called by the current `governor`.
     * @param _signer The signer to add.
     */
    function addSigner(address _signer) external onlyGovernance {
        isAuthorizedSigner[_signer] = true;
        emit SignerAdded(_signer);
    }

    /**
     * @notice Removes a signer.
     * Can only be called by the current `governor`.
     * @param _signer The signer to remove.
     */
    function removeSigner(address _signer) external onlyGovernance {
        isAuthorizedSigner[_signer] = false;
        emit SignerRemoved(_signer);
    }

    /**
     * @notice Pauses or unpauses buying and extending policies.
     * Cancelling policies and submitting claims are unaffected by pause.
     * Can only be called by the current `governor`.
     * @dev Used for security and to gracefully phase out old products.
     */
    function setPaused(bool _pause) external onlyGovernance {
        paused = _pause;
    }

    /**
     * @notice Changes the covered platform.
     * This function is used if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new **Product**.
     * Can only be called by the current `governor`.
     * @param _coveredPlatform The platform to cover.
     */
    function setCoveredPlatform(address _coveredPlatform) public virtual override onlyGovernance {
        coveredPlatform = _coveredPlatform;
    }

    /**
     * @notice Changes the policy manager.
     * Can only be called by the current `governor`.
     * @param _policyManager The new policy manager.
     */
    function setPolicyManager(address _policyManager) external override onlyGovernance {
        policyManager = IPolicyManager(_policyManager);
    }

    /****
        UNIMPLEMENTED FUNCTIONS
        Functions that are only implemented by child product contracts
    ****/

    /**
     * @notice This function will only be implemented in the inheriting product contracts. It provides the user's total position in the product's protocol.
     * This total should be denominated in **ETH**. Every product will have a different mechanism to read and determine a user's total position in that product's protocol.
     * @param _policyholder The `buyer` requesting the coverage quote.
     * @param _positionContract The address of the exact smart contract the `buyer` has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @return positionAmount The user's total position in **Wei** in the product's protocol.
     */
    function appraisePosition(address _policyholder, address _positionContract) public view override virtual returns (uint256 positionAmount);

    /****
        QUOTE VIEW FUNCTIONS
        View functions that give us quotes regarding a policy purchase
    ****/

    /**
     * @notice
     *  The function provides a premium quote.
     * @param _coverAmount The value to cover in **ETH**.
     * @param _blocks The length for policy.
     * @return premium The quote for their policy in **Wei**.
     */
    function getQuote(address _policyholder, address _positionContract, uint256 _coverAmount, uint40 _blocks) external view override returns (uint256){
        return _coverAmount * _blocks * price / 1e12;
    }

    /****
         MUTATIVE FUNCTIONS
         Functions that change state variables, deploy and change policy contracts
    ****/

    /**
     * @notice Updates the product's book-keeping variables.
     * @param _coverDiff The change in active cover amount.
     */
    function updateActiveCoverAmount(int256 _coverDiff) external override {
        require(msg.sender == address(policyManager), "!policymanager");
        activeCoverAmount = add(activeCoverAmount, _coverDiff);
    }

    /**
     * @notice The function purchases and deploys a policy on the behalf of the policyholder. It returns the id of newly created policy.
     * @param _coverAmount The value to cover in **ETH**.
     * @param _blocks The length (in blocks) for policy.
     * @param _policyholder Who's liquidity is being covered by the policy.
     * @param _positionContract The contract address where the policyholder has a position to be covered.
     * @return policyID The policy id.
     */
    function buyPolicy(address _policyholder, address _positionContract, uint256 _coverAmount, uint40 _blocks) external payable override nonReentrant returns (uint256 policyID){
        require(!paused, "cannot buy when paused");
        // check that the buyer has a position in the covered protocol
        uint256 positionAmount = appraisePosition(_policyholder, _positionContract);
        _coverAmount = min(positionAmount, _coverAmount);
        require(_coverAmount != 0, "zero position value");

        // check that the product can provide coverage for this policy
        {
        uint256 maxCover = maxCoverAmount();
        uint256 maxUserCover = maxCover / maxCoverPerUserDivisor;
        require(activeCoverAmount + _coverAmount <= maxCover, "max covered amount is reached");
        require(_coverAmount <= maxUserCover, "over max cover single user");
        }
        // check that the buyer has paid the correct premium
        uint256 premium = _coverAmount * _blocks * price / 1e12;
        require(msg.value >= premium && premium != 0, "insufficient payment or premium is zero");
        if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);

        // check that the buyer provided valid period
        require(_blocks >= minPeriod && _blocks <= maxPeriod, "invalid period");

        // transfer premium to the treasury
        ITreasury(payable(registry.treasury())).routePremiums{value: premium}();
        // create the policy
        uint40 expirationBlock = uint40(block.number + _blocks);
        policyID = policyManager.createPolicy(_policyholder, _positionContract, _coverAmount, expirationBlock, price);

        // update local book-keeping variables
        activeCoverAmount += _coverAmount;
        productPolicyCount++;

        emit PolicyCreated(policyID);

        return policyID;
    }

    /**
     * @notice The function is used to increase or decrease the cover amount for the policy.
     * @param _policyID The id number of the existing policy
     * @param _coverAmount The value to cover in **ETH**.
     */
    function updateCoverAmount(uint256 _policyID, uint256 _coverAmount) external payable override nonReentrant {
        require(!paused, "cannot buy when paused");
        (address policyholder, address product, address positionContract, uint256 previousCoverAmount, uint40 expirationBlock, uint24 previousPrice) = policyManager.getPolicyInfo(_policyID);
        // check msg.sender is policyholder
        require(policyholder == msg.sender, "!policyholder");
        // check for correct product
        require(product == address(this), "wrong product");
        // check for policy expiration
        require(expirationBlock >= block.number, "policy is expired");

        // check that the buyer has a position in the covered protocol
        uint256 positionAmount = appraisePosition(policyholder, positionContract);
        _coverAmount = min(positionAmount, _coverAmount);
        require(_coverAmount != 0, "zero position value");
        // check that the product can provide coverage for this policy
        {
        uint256 maxCover = maxCoverAmount();
        uint256 maxUserCover = maxCover / maxCoverPerUserDivisor;
        require(activeCoverAmount + _coverAmount - previousCoverAmount <= maxCover, "max covered amount is reached");
        require(_coverAmount <= maxUserCover, "over max cover single user");
        }
        // calculate premium needed for new cover amount as if policy is bought now
        uint256 remainingBlocks = expirationBlock - block.number;
        uint256 newPremium = _coverAmount * remainingBlocks * price / 1e12;

        // calculate premium already paid based on current policy
        uint256 paidPremium = previousCoverAmount * remainingBlocks * previousPrice / 1e12;

        if (newPremium >= paidPremium) {
            uint256 premium = newPremium - paidPremium;
            // check that the buyer has paid the correct premium
            require(msg.value >= premium, "insufficient payment");
            if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
            // transfer premium to the treasury
            ITreasury(payable(registry.treasury())).routePremiums{value: premium}();
        } else {
            if(msg.value > 0) payable(msg.sender).transfer(msg.value);
            uint256 refundAmount = paidPremium - newPremium;
            ITreasury(payable(registry.treasury())).refund(msg.sender, refundAmount);
        }
        // update policy's URI and emit event
        policyManager.setPolicyInfo(_policyID, policyholder, positionContract, _coverAmount, expirationBlock, price);
        emit PolicyUpdated(_policyID);
    }

    /**
     * @notice The function enables to extend a policy contract.
     * @param _policyID The id number of the existing policy.
     * @param _blocks The length of extension.
     */
    function extendPolicy(uint256 _policyID, uint40 _blocks) external payable override nonReentrant {
        require(!paused, "cannot extend when paused");
        // check that the msg.sender is the policyholder
        (address policyholder, address product, address positionContract, uint256 coverAmount, uint40 expirationBlock, uint24 purchasePrice) = policyManager.getPolicyInfo(_policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");
        require(expirationBlock >= block.number, "policy is expired");

        // compute the premium
        uint256 premium = coverAmount * _blocks * purchasePrice / 1e12;
        // check that the buyer has paid the correct premium
        require(msg.value >= premium, "insufficient payment");
        if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
        // transfer premium to the treasury
        ITreasury(payable(registry.treasury())).routePremiums{value: premium}();
        // check that the buyer provided valid period
        uint40 newExpirationBlock = expirationBlock + _blocks;
        uint40 duration = newExpirationBlock - uint40(block.number);
        require(duration >= minPeriod && duration <= maxPeriod, "invalid period");
        // update the policy's URI
        policyManager.setPolicyInfo(_policyID, policyholder, positionContract, coverAmount, newExpirationBlock, purchasePrice);
        emit PolicyExtended(_policyID);
    }

    /**
     * @notice The function updates an existing policy contract.
     * @param _policyID The id number of the existing policy.
     * @param _newCoverAmount The new cover amount of position.
     * @param _newExtension The length of block extension.
     */
    function updatePolicy(uint256 _policyID, uint256 _newCoverAmount, uint40 _newExtension) external payable override nonReentrant {
        require(!paused, "cannot buy when paused");
        (address policyholder, address product, address positionContract, uint256 previousCoverAmount, uint40 previousExpirationBlock, uint24 previousPrice) = policyManager.getPolicyInfo(_policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");
        require(previousExpirationBlock >= block.number, "policy is expired");

        // appraise the position
        uint256 positionAmount = appraisePosition(policyholder, positionContract);
        _newCoverAmount = min(positionAmount, _newCoverAmount);
        require(_newCoverAmount > 0, "zero position value");

        // check that the product can still provide coverage
        {
        uint256 maxCover = maxCoverAmount();
        uint256 maxUserCover = maxCover / maxCoverPerUserDivisor;
        require(activeCoverAmount + _newCoverAmount - previousCoverAmount <= maxCover, "max covered amount is reached");
        require(_newCoverAmount <= maxUserCover, "over max cover single user");
        }
        // add new block extension
        uint40 newExpirationBlock = previousExpirationBlock + _newExtension;

        // check if duration is valid
        uint40 duration = newExpirationBlock - uint40(block.number);
        require(duration >= minPeriod && duration <= maxPeriod, "invalid period");

        // update policy info
        policyManager.setPolicyInfo(_policyID, policyholder, positionContract, _newCoverAmount, newExpirationBlock, price);

        // calculate premium needed for new cover amount as if policy is bought now
        uint256 newPremium = _newCoverAmount * duration * price / 1e12;

        // calculate premium already paid based on current policy
        uint256 paidPremium = previousCoverAmount * (previousExpirationBlock - uint40(block.number)) * previousPrice / 1e12;

        if (newPremium >= paidPremium) {
            uint256 premium = newPremium - paidPremium;
            require(msg.value >= premium, "insufficient payment");
            if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
            ITreasury(payable(registry.treasury())).routePremiums{value: premium}();
        } else {
            if(msg.value > 0) payable(msg.sender).transfer(msg.value);
            uint256 refund = paidPremium - newPremium;
            ITreasury(payable(registry.treasury())).refund(msg.sender, refund);
        }
        emit PolicyUpdated(_policyID);
    }

    /**
     * @notice The function is used to cancel and destroy a policy.
     * @param _policyID The id number of the existing policy.
     */
    function cancelPolicy(uint256 _policyID) external override nonReentrant {
        (address policyholder, address product, , uint256 coverAmount, uint40 expirationBlock, uint24 purchasePrice) = policyManager.getPolicyInfo(_policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");

        uint40 blocksLeft = expirationBlock - uint40(block.number);
        uint256 refundAmount = blocksLeft * coverAmount * purchasePrice / 1e12;
        policyManager.burn(_policyID);
        ITreasury(payable(registry.treasury())).refund(msg.sender, refundAmount);
        activeCoverAmount -= coverAmount;
        emit PolicyCanceled(_policyID);
    }

    /****
        View Functions
        The functions do not mutate the state variables.
    ****/

    /**
      * @notice The function returns the max cover amount of the product.
      * @return maxCoverAmount The max cover amount.
     */
    function maxCoverAmount() public view override returns (uint256) {
        return IRiskManager(registry.riskManager()).maxCoverAmount(address(this));
    }

    /**
      * @notice The function returns the max cover amount per user for the product.
      * @return maxCoverAmountPerUser The max cover amount per user.
     */
    function maxCoverPerUser() external view override returns (uint256) {
        return maxCoverAmount() / maxCoverPerUserDivisor;
    }

    /**
     * @notice The function is used to add two numbers.
     * @param _a The first number as a uint256.
     * @param _b The second number as an int256.
     * @return _c The sum as a uint256.
     */
    function add(uint256 _a, int256 _b) internal pure returns (uint256 _c) {
        _c = (_b > 0)
            ? _a + uint256(_b)
            : _a - uint256(-_b);
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
