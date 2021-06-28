// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interface/IPolicyManager.sol";
import "../interface/ITreasury.sol";
import "../interface/IVault.sol";
import "../interface/IRegistry.sol";
import "../interface/IProduct.sol";

/* TODO
 * - check transfer to treasury when buyPolicy()
 * - optimize _updateActivePolicies(), store in the expiration order (minheap)
 * - implement updateCoverLimit() so user can adjust exposure as their position changes in value
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
    uint256 public override maxCoverAmount; // maximum amount of coverage (in wei) this product can sell
    uint256 public override maxCoverPerUser;
    uint64 public override minPeriod; // minimum policy period in blocks
    uint64 public override maxPeriod; // maximum policy period in blocks
    uint64 public override cancelFee; // policy cancelation fee
    uint24 public override price; // cover price (in wei) per block per wei (multiplied by 1e12 to avoid underflow upon construction or setter)

    // Book-keeping variables
    uint256 public override productPolicyCount; // total policy count this product sold
    uint256 public override activeCoverAmount; // current amount covered (in wei)
    uint256[] public override activePolicyIDs;
    mapping(bytes32 => uint256) private policyHashIdMap;

    mapping(address => bool) public isAuthorizedSigner;
    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    event SignerAdded(address _signer);
    event SignerRemoved(address _signer);
    event ClaimSubmitted(uint256 indexed policyId);

    constructor (
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint256 _maxCoverAmount,
        uint256 _maxCoverPerUser,
        uint64 _minPeriod,
        uint64 _maxPeriod,
        uint64 _cancelFee,
        uint24 _price
    ) {
        governance = msg.sender;
        policyManager = _policyManager;
        registry = _registry;
        coveredPlatform = _coveredPlatform;
        maxCoverAmount = _maxCoverAmount;
        maxCoverPerUser = _maxCoverPerUser;
        minPeriod = _minPeriod;
        maxPeriod = _maxPeriod;
        cancelFee = _cancelFee;
        price = _price;
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
     * @notice Sets the fee that user must pay upon canceling the policy
     * @param _cancelFee policy cancelation fee
     */
    function setCancelFee(uint64 _cancelFee) external override {
        require(msg.sender == governance, "!governance");
        cancelFee = _cancelFee;
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
     * @notice Sets the maximum coverage amount this product can provide to all users
     * @param _maxCoverAmount maximum coverage amount (in wei)
     */
    function setMaxCoverAmount(uint256 _maxCoverAmount) external override {
        require(msg.sender == governance, "!governance");
        maxCoverAmount = _maxCoverAmount;
    }

    /**
     * @notice Sets the maximum coverage amount this product can provide to a single user
     * @param _maxCoverPerUser maximum coverage amount (in wei)
     */
    function setMaxCoverPerUser(uint256 _maxCoverPerUser) external override {
        require(msg.sender == governance, "!governance");
        maxCoverPerUser = _maxCoverPerUser;
    }

    function addSigner(address _signer) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        isAuthorizedSigner[_signer] = true;
        emit SignerAdded(_signer);
    }

    function removeSigner(address _signer) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        isAuthorizedSigner[_signer] = false;
        emit SignerRemoved(_signer);
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
     * @notice Updates active policy count and active cover amount
     */

    function _updateActivePolicies(uint256[] calldata _policyIDs) internal {
        for (uint256 i = 0; i < _policyIDs.length; i++) {
            if (policyManager.getPolicyExpirationBlock(_policyIDs[i]) < block.number) {
                activeCoverAmount -= policyManager.getPolicyCoverAmount(_policyIDs[i]);
                policyManager.burn(activePolicyIDs[i]);
                delete activePolicyIDs[i]; // todo: need to change to enumerable set or map
            }
        }
    }

    /**
     * @notice Updates the product's book-keeping variables,
     * removing expired policies from the policies set and updating active cover amount
     * @return activeCoverAmount and activePolicyCount active covered amount and active policy count as a tuple
     */
    function updateActivePolicies(uint256[] calldata _policyIDs) external override returns (uint256, uint256) {
        _updateActivePolicies(_policyIDs);
        return (activeCoverAmount, activePolicyIDs.length);
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
        // check that the policy holder doesn't already have an identical policy
        bytes32 policyHash = keccak256(abi.encodePacked(_policyholder, _positionContract));
        uint256 policyID = policyHashIdMap[policyHash];
        require(!policyManager.policyIsActive(policyID), "duplicate policy");

        // check that the buyer has a position in the covered protocol
        uint256 positionAmount = appraisePosition(_policyholder, _positionContract);
        require(positionAmount != 0, "zero position value");

        // check that the product can provide coverage for this policy
        uint256 coverAmount = _coverLimit * positionAmount / 1e4;
        require(activeCoverAmount + coverAmount <= maxCoverAmount, "max covered amount is reached");
        require(coverAmount <= maxCoverPerUser, "over max cover single user");

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
        activePolicyIDs.push(policyID);
        productPolicyCount++;
        policyHashIdMap[policyHash] = policyID;

        emit PolicyCreated(policyID);

        return policyID;
    }

    // /**
    //  * @notice
    //  *  Increase or decrease the cover limit for the policy
    //  * @param _policy address of existing policy
    //  * @param _coverLimit new cover percentage
    //  * @return True if coverlimit is successfully increased else False
    //  */
    // function updateCoverLimit(uint256 _policyID, uint256 _coverLimit) external payable override returns (bool){
    //     // check that the msg.sender is the policyholder
    //     address policyholder = policyManager.getPolicyholder(_policyID);
    //     require(policyholder == msg.sender,'!policyholder');
    //     // compute the extra premium = newPremium - paidPremium (or the refund amount)
    //     // group call to policy info into just policyManager.getPolicyInfo(_policyId)
    //     uint256 previousPrice = policyManager.getPolicyPrice(_policyID);
    //     uint256 expirationBlock = policyManager.getPolicyExpirationBlock(_policyID);
    //     uint256 remainingBlocks = expirationBlock - block.number;
    //     uint256 previousCoverAmount = policyManager.getPolicyCoverAmount(_policyID);
    //     uint256 paidPremium = previousCoverAmount * remainingBlocks * previousPrice;
    //     // whats new cover amount ? should we appraise again?
    //     uint256 newPremium = newCoverAmount * remainingBlocks * price;
    //     if (newPremium >= paidPremium) {
    //         uint256 premium = newPremium - paidPremium;
    //         // check that the buyer has paid the correct premium
    //         require(msg.value == premium && premium != 0, "payment does not match the quote or premium is zero");
    //         // transfer premium to the treasury
    //         payable(treasury).transfer(msg.value);
    //     } else {
    //         uint256 refund = paidPremium - newPremium;
    //         treasury.refund(msg.sender, refundAmount - cancelFee);
    //     }
    //     // update policy's URI
    //     // emit event
    // }

    /**
     * @notice
     *  Extend a policy contract
     * @param _policyID id number of the existing policy
     * @param _blocks length of extension
     */
    function extendPolicy(uint256 _policyID, uint64 _blocks) external payable override nonReentrant {
        // check that the msg.sender is the policyholder
        (address policyholder, address product, address positionContract, uint256 coverAmount, uint64 expirationBlock, uint24 price) = policyManager.getPolicyInfo(_policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");

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
     *  Cancel and destroy a policy.
     * @param _policyID id number of the existing policy
     */
    function cancelPolicy(uint256 _policyID) external override nonReentrant {
        (address policyholder, address product, , uint256 coverAmount, uint64 expirationBlock, uint24 price) = policyManager.getPolicyInfo(_policyID);
        require(policyholder == msg.sender,"!policyholder");
        require(product == address(this), "wrong product");

        uint64 blocksLeft = expirationBlock - uint64(block.number);
        uint256 refundAmount = blocksLeft * coverAmount * price / 1e12;
        require(refundAmount > cancelFee, "refund amount less than cancelation fee");
        policyManager.burn(_policyID);
        ITreasury(payable(registry.treasury())).refund(msg.sender, refundAmount - cancelFee);
        emit PolicyCanceled(_policyID);
    }
}
