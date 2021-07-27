// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interface/IPolicyManager.sol";
import "../interface/IRiskManager.sol";
import "../interface/ITreasury.sol";
import "../interface/IClaimsEscrow.sol";
import "../interface/IRegistry.sol";
import "../interface/IProduct.sol";

/* TODO
 * - implement transferPolicy() so a user can transfer their LP tokens somewhere else and update that on their policy
 */

/**
 * @title BaseProduct
 * @author solace.fi
 * @notice To be inherited by individual Product contracts.
 */
abstract contract BaseProduct is IProduct, ReentrancyGuard {
    using Address for address;

    /// @notice Governor.
    address public override governance;
    /// @notice Governance to take over.
    address public override newGovernance;

    // Policy Manager
    IPolicyManager public policyManager; // Policy manager ERC721 contract

    IRegistry public registry;

    // Product Details
    address public override coveredPlatform; // a platform contract which locates contracts that are covered by this product
                                    // (e.g., UniswapProduct will have Factory as coveredPlatform contract, because
                                    // every Pair address can be located through getPool() function)
    uint64 public override minPeriod; // minimum policy period in blocks
    uint64 public override maxPeriod; // maximum policy period in blocks
    uint24 public override price; // cover price (in wei) per block per wei (multiplied by 1e12 to avoid underflow upon construction or setter)
    uint32 public override maxCoverPerUserDivisor; // maxCover / divisor = maxCoverPerUser

    // Book-keeping variables
    uint256 public override productPolicyCount; // total policy count this product sold
    uint256 public override activeCoverAmount; // current amount covered (in wei)

    mapping(address => bool) public isAuthorizedSigner;
    address internal constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    bool public paused; // = false

    event SignerAdded(address _signer);
    event SignerRemoved(address _signer);
    event ClaimSubmitted(uint256 indexed policyID);

    constructor (
        address _governance,
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint64 _minPeriod,
        uint64 _maxPeriod,
        uint24 _price,
        uint32 _maxCoverPerUserDivisor
    ) {
        governance = _governance;
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

    /**** GETTERS + SETTERS
    Functions which get and set important product state variables
    ****/

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external override {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Sets the price for this product
     * @param _price cover price (in wei) per ether per block
     */
    function setPrice(uint24 _price) external override {
        require(msg.sender == governance, "!governance");
        price = _price;
    }

    /**
     * @notice Sets the minimum number of blocks a policy can be purchased for
     * @param _minPeriod minimum number of blocks
     */
    function setMinPeriod(uint64 _minPeriod) external override {
        require(msg.sender == governance, "!governance");
        minPeriod = _minPeriod;
    }

    /**
     * @notice Sets the maximum number of blocks a policy can be purchased for
     * @param _maxPeriod maximum number of blocks
     */
    function setMaxPeriod(uint64 _maxPeriod) external override {
        require(msg.sender == governance, "!governance");
        maxPeriod = _maxPeriod;
    }

    /**
     * @notice Adds a new signer that can authorize claims.
     * Can only be called by the current governor.
     * @param _signer The signer to add.
     */
    function addSigner(address _signer) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        isAuthorizedSigner[_signer] = true;
        emit SignerAdded(_signer);
    }

    /**
     * @notice Removes a signer.
     * Can only be called by the current governor.
     * @param _signer The signer to remove.
     */
    function removeSigner(address _signer) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        isAuthorizedSigner[_signer] = false;
        emit SignerRemoved(_signer);
    }

    /**
     * @notice Pauses or unpauses buying and extending policies.
     * Cancelling policies and submitting claims are unaffected by pause.
     * Can only be called by the current governor.
     * @dev Used for security and to gracefully phase out old products.
     */
    function setPaused(bool _pause) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        paused = _pause;
    }

    /**
     * @notice Changes the covered platform.
     * Use this if the the protocol changes their registry but keeps the children contracts.
     * A new version of the protocol will likely require a new Product.
     * Can only be called by the current governor.
     * @param _coveredPlatform The platform to cover.
     */
    function setCoveredPlatform(address _coveredPlatform) public virtual override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        coveredPlatform = _coveredPlatform;
    }

    /**
     * @notice Changes the policy manager.
     * Can only be called by the current governor.
     * @param _policyManager The new policy manager.
     */
    function setPolicyManager(address _policyManager) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        policyManager = IPolicyManager(_policyManager);
    }

    /**** UNIMPLEMENTED FUNCTIONS
    Functions that are only implemented by child product contracts
    ****/

    /**
     * @notice
     *  Provide the user's total position in the product's protocol.
     *  This total should be denominated in eth.
     * @dev
     *  Every product will have a different mechanism to read and determine
     *  a user's total position in that product's protocol. This method will
     *  only be implemented in the inheriting product contracts
     * @param _policyholder buyer requesting the coverage quote
     * @param _positionContract address of the exact smart contract the buyer has their position in (e.g., for UniswapProduct this would be Pair's address)
     * @return positionAmount The user's total position in wei in the product's protocol.
     */
    function appraisePosition(address _policyholder, address _positionContract) public view override virtual returns (uint256 positionAmount);

    /**** QUOTE VIEW FUNCTIONS
    View functions that give us quotes regarding a policy purchase
    ****/

    /**
     * @notice
     *  Provide a premium quote.
     * @param _coverLimit percentage (in BPS) of cover for total position
     * @param _blocks length for policy
     * @return premium The quote for their policy in wei.
     */
    function _getQuote(uint256 _coverLimit, uint64 _blocks, uint256 _positionAmount) internal view returns (uint256 premium){
        premium = _positionAmount * _coverLimit * _blocks * price / 1e16;
        return premium;
    }

    function getQuote(address _policyholder, address _positionContract, uint256 _coverLimit, uint64 _blocks) external view override returns (uint256){
        uint256 positionAmount = appraisePosition(_policyholder, _positionContract);
        return _getQuote(_coverLimit, _blocks, positionAmount);
    }

    /**** MUTATIVE FUNCTIONS
    Functions that change state variables, deploy and change policy contracts
    ****/


    /**
     * @notice Updates the product's book-keeping variables.
     * @param _coverDiff change in active cover amount
     */
    function updateActiveCoverAmount(int256 _coverDiff) external override {
        require(msg.sender == address(policyManager), "!policymanager");
        activeCoverAmount = add(activeCoverAmount, _coverDiff);
    }

    /**
     * @notice
     *  Purchase and deploy a policy on the behalf of the policyholder
     * @param _coverLimit percentage (in BPS) of cover for total position
     * @param _blocks length (in blocks) for policy
     * @param _policyholder who's liquidity is being covered by the policy
     * @param _positionContract contract address where the policyholder has a position to be covered
     * @return policyID The contract address of the policy
     */
    function buyPolicy(address _policyholder, address _positionContract, uint256 _coverLimit, uint64 _blocks) external payable override nonReentrant returns (uint256 policyID){
        require(!paused, "cannot buy when paused");
        // check that the buyer has a position in the covered protocol
        uint256 positionAmount = appraisePosition(_policyholder, _positionContract);
        require(positionAmount != 0, "zero position value");

        // check that the product can provide coverage for this policy
        uint256 coverAmount = _coverLimit * positionAmount / 1e4;
        {
        uint256 maxCover = maxCoverAmount();
        uint256 maxUserCover = maxCover / maxCoverPerUserDivisor;
        require(activeCoverAmount + coverAmount <= maxCover, "max covered amount is reached");
        require(coverAmount <= maxUserCover, "over max cover single user");
        }
        // check that the buyer has paid the correct premium
        uint256 premium = _getQuote(_coverLimit, _blocks, positionAmount);
        require(msg.value >= premium && premium != 0, "insufficient payment or premium is zero");
        if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);

        // check that the buyer provided valid period and coverage limit
        require(_blocks >= minPeriod && _blocks <= maxPeriod, "invalid period");
        require(_coverLimit > 0 && _coverLimit <= 1e4, "invalid cover limit percentage");

        // transfer premium to the treasury

        ITreasury(payable(registry.treasury())).routePremiums{value: premium}();
        // create the policy
        uint64 expirationBlock = uint64(block.number + _blocks);
        policyID = policyManager.createPolicy(_policyholder, _positionContract, coverAmount, expirationBlock, price);

        // update local book-keeping variables
        activeCoverAmount += coverAmount;
        productPolicyCount++;

        emit PolicyCreated(policyID);

        return policyID;
    }

    /**
     * @notice
     *  Increase or decrease the cover limit for the policy
     * @param _policyID id number of the existing policy
     * @param _coverLimit new cover percentage
     */
    function updateCoverLimit(uint256 _policyID, uint256 _coverLimit) external payable override nonReentrant {
        require(!paused, "cannot buy when paused");
        (address policyholder, address product, address positionContract, uint256 previousCoverAmount, uint64 expirationBlock, uint24 previousPrice) = policyManager.getPolicyInfo(_policyID);
        // check msg.sender is policyholder, check for correct product, and that the coverageLimit is valid
        require(policyholder == msg.sender, "!policyholder");
        require(product == address(this), "wrong product");
        require(expirationBlock >= block.number, "policy is expired");
        require(_coverLimit > 0 && _coverLimit <= 1e4, "invalid cover limit percentage");

        // appraise the position
        uint256 positionAmount = appraisePosition(policyholder, positionContract);

        // calculate new coverAmount and check that the product can still provide coverage
        uint256 newCoverAmount = _coverLimit * positionAmount / 1e4;
        {
        uint256 maxCover = maxCoverAmount();
        uint256 maxUserCover = maxCover / maxCoverPerUserDivisor;
        require(activeCoverAmount + newCoverAmount - previousCoverAmount <= maxCover, "max covered amount is reached");
        require(newCoverAmount <= maxUserCover, "over max cover single user");
        }
        // calculate premium needed for new cover amount as if policy is bought now
        uint256 remainingBlocks = expirationBlock - block.number;
        uint256 newPremium = newCoverAmount * remainingBlocks * price / 1e12;

        // calculate premium already paid based on current policy
        uint256 paidPremium = previousCoverAmount * remainingBlocks * previousPrice / 1e12;

        if (newPremium >= paidPremium) {
            uint256 premium = newPremium - paidPremium;
            // check that the buyer has paid the correct premium
            require(msg.value >= premium && premium != 0, "insufficient payment or premium is zero");
            if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
            // transfer premium to the treasury
            ITreasury(payable(registry.treasury())).routePremiums{value: premium}();
        } else {
            uint256 refundAmount = paidPremium - newPremium;
            ITreasury(payable(registry.treasury())).refund(msg.sender, refundAmount);
        }
        // update policy's URI and emit event
        policyManager.setPolicyInfo(_policyID, policyholder, positionContract, newCoverAmount, expirationBlock, price);
        emit PolicyUpdated(_policyID);
    }

    /**
     * @notice
     *  Extend a policy contract
     * @param _policyID id number of the existing policy
     * @param _blocks length of extension
     */
    function extendPolicy(uint256 _policyID, uint64 _blocks) external payable override nonReentrant {
        require(!paused, "cannot extend when paused");
        // check that the msg.sender is the policyholder
        (address policyholder, address product, address positionContract, uint256 coverAmount, uint64 expirationBlock, uint24 price) = policyManager.getPolicyInfo(_policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");
        require(expirationBlock >= block.number, "policy is expired");
        require(_blocks > 0, "invalid block value");

        // compute the premium
        uint256 premium = coverAmount * _blocks * price / 1e12;
        // check that the buyer has paid the correct premium
        require(msg.value >= premium && premium != 0, "insufficient payment or premium is zero");
        if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
        // transfer premium to the treasury
        ITreasury(payable(registry.treasury())).routePremiums{value: premium}();
        // check that the buyer provided valid period
        uint64 newExpirationBlock = expirationBlock + _blocks;
        uint64 duration = newExpirationBlock - uint64(block.number);
        require(duration >= minPeriod && duration <= maxPeriod, "invalid period");
        // update the policy's URI
        policyManager.setPolicyInfo(_policyID, policyholder, positionContract, coverAmount, newExpirationBlock, price);
        emit PolicyExtended(_policyID);
    }


    /**
     * @notice
     *  Update an existing policy contract
     * @param _policyID id number of the existing policy
     * @param _newCoverAmount new cover amount of position
     * @param _newExtension length of block extension
     */
    function updatePolicy(uint256 _policyID, uint256 _newCoverAmount, uint64 _newExtension ) external payable override nonReentrant {
        require(!paused, "cannot buy when paused");
        (address policyholder, address product, address positionContract, uint256 previousCoverAmount, uint64 previousExpirationBlock, uint24 previousPrice) = policyManager.getPolicyInfo(_policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");
        require(previousExpirationBlock >= block.number, "policy is expired");

        // appraise the position
        uint256 positionAmount = appraisePosition(policyholder, positionContract);
        // check if the new cover amount is exceeded the position amount
        if (_newCoverAmount > positionAmount) {
            _newCoverAmount = positionAmount;
        }
        require(_newCoverAmount > 0, "invalid cover amount");

        // check that the product can still provide coverage
        {
        uint256 maxCover = maxCoverAmount();
        uint256 maxUserCover = maxCover / maxCoverPerUserDivisor;
        require(activeCoverAmount + _newCoverAmount - previousCoverAmount <= maxCover, "max covered amount is reached");
        require(_newCoverAmount <= maxUserCover, "over max cover single user");
        }
        // add new block extension
        uint64 newExpirationBlock = previousExpirationBlock + _newExtension;

        // check if duration is valid
        uint64 duration = newExpirationBlock - uint64(block.number);
        require(duration >= minPeriod && duration <= maxPeriod, "invalid period");

        // update policy info
        policyManager.setPolicyInfo(_policyID, policyholder, positionContract, _newCoverAmount, newExpirationBlock, price);

        // calculate premium needed for new cover amount as if policy is bought now
        uint256 newPremium = _newCoverAmount * duration * price / 1e12;

        // calculate premium already paid based on current policy
        uint256 paidPremium = previousCoverAmount * (previousExpirationBlock - uint64(block.number)) * previousPrice / 1e12;

        if (newPremium >= paidPremium) {
           uint256 premium = newPremium - paidPremium;
           require(msg.value >= premium, "insufficient payment");
           if(msg.value > premium) payable(msg.sender).transfer(msg.value - premium);
           ITreasury(payable(registry.treasury())).routePremiums{value: premium}();
        } else {
           uint256 refund = paidPremium - newPremium;
           ITreasury(payable(registry.treasury())).refund(msg.sender, refund);
        }
        emit PolicyUpdated(_policyID);
    }

    /**
     * @notice
     *  Cancel and destroy a policy.
     * @param _policyID id number of the existing policy
     */
    function cancelPolicy(uint256 _policyID) external override nonReentrant {
        (address policyholder, address product, , uint256 coverAmount, uint64 expirationBlock, uint24 price) = policyManager.getPolicyInfo(_policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");

        uint64 blocksLeft = expirationBlock - uint64(block.number);
        uint256 refundAmount = blocksLeft * coverAmount * price / 1e12;
        policyManager.burn(_policyID);
        ITreasury(payable(registry.treasury())).refund(msg.sender, refundAmount);
        activeCoverAmount -= coverAmount;
        emit PolicyCanceled(_policyID);
    }

    // other view functions

    function maxCoverAmount() public view override returns (uint256) {
        return IRiskManager(registry.riskManager()).maxCoverAmount(address(this));
    }

    function maxCoverPerUser() external view override returns (uint256) {
        return maxCoverAmount() / maxCoverPerUserDivisor;
    }


    /**
     * @notice Adds two numbers.
     * @param _a The first number as a uint256.
     * @param _b The second number as an int256.
     * @return _c The sum as a uint256.
     */
    function add(uint256 _a, int256 _b) internal pure returns (uint256 _c) {
        _c = (_b > 0)
            ? _a + uint256(_b)
            : _a - uint256(-_b);
    }
}
