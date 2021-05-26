// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "./interface/IProduct.sol";
import "./interface/IPolicyManager.sol";
import "./interface/ITreasury.sol";

/* TODO
 * - treasury refund() function, check transfer to treasury when buyPolicy()
 * - add events
 * - optimize _updateActivePolicies(), store in the expiration order (minheap)
 * - update cover amount (or cover limit?) policy function
 */

/**
 * @title BaseProduct
 * @author solace.fi
 * @notice To be inherited by individual Product contracts.
 */
abstract contract BaseProduct is IProduct {
    using Address for address;

    event PolicyCreated(uint256 policyID);
    event PolicyExtended(uint256 policyID);
    event PolicyCanceled(uint256 policyID);

    // Governor
    address public governance;

    // Policy Manager
    IPolicyManager public policyManager; // Policy manager ERC721 contract

    // Treasury
    ITreasury public treasury; // Treasury contract

    // Product Details
    address public coveredPlatform; // a platform contract which locates contracts that are covered by this product
                                    // (e.g., UniswapProduct will have Factory as coveredPlatform contract, because
                                    // every Pair address can be located through getPool() function)
    address public claimsAdjuster; // address of the parametric auto claims adjuster
    uint256 public price; // cover price (in wei) per block per wei
    uint256 public cancelFee; // policy cancelation fee
    uint256 public minPeriod; // minimum policy period in blocks
    uint256 public maxPeriod; // maximum policy period in blocks
    uint256 public maxCoverAmount; // maximum amount of coverage (in wei) this product can sell

    // Book-keeping varaibles
    uint256 public productPolicyCount; // total policy count this product sold
    uint256 public activeCoverAmount; // current amount covered (in wei)
    uint256[] public activePolicyIDs;


    constructor (
        IPolicyManager _policyManager,
        ITreasury _treasury,
        address _coveredPlatform,
        address _claimsAdjuster,
        uint256 _price,
        uint256 _cancelFee,
        uint256 _minPeriod,
        uint256 _maxPeriod,
        uint256 _maxCoverAmount)
    {
        governance = msg.sender;
        policyManager = _policyManager;
        treasury = _treasury;
        coveredPlatform = _coveredPlatform;
        claimsAdjuster = _claimsAdjuster;
        price = _price;
        cancelFee = _cancelFee;
        minPeriod = _minPeriod;
        maxPeriod = _maxPeriod;
        maxCoverAmount = _maxCoverAmount;
        productPolicyCount = 0;
        activeCoverAmount = 0;
    }

    /**** GETTERS + SETTERS
    Functions which get and set important product state variables
    ****/

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    /**
     * @notice Sets the claims adjuster for this product
     * @param _claimsAdjuster address of the claims adjuster contract
     */
    function setClaimsAdjuster(address _claimsAdjuster) external {
        require(msg.sender == governance, "!governance");
        claimsAdjuster = _claimsAdjuster;
    }

    /**
     * @notice Sets the price for this product
     * @param _price cover price (in wei) per ether per block
     */
    function setPrice(uint256 _price) external override {
        require(msg.sender == governance, "!governance");
        price = _price;
    }

    /**
     * @notice Sets the fee that user must pay upon canceling the policy
     * @param _cancelFee policy cancelation fee
     */
    function setCancelFee(uint256 _cancelFee) external override {
        require(msg.sender == governance, "!governance");
        cancelFee = _cancelFee;
    }

    /**
     * @notice Sets the minimum number of blocks a policy can be purchased for
     * @param _minPeriod minimum number of blocks
     */
    function setMinPeriod(uint256 _minPeriod) external override {
        require(msg.sender == governance, "!governance");
        minPeriod = _minPeriod;
    }

    /**
     * @notice Sets the maximum number of blocks a policy can be purchased for
     * @param _maxPeriod maximum number of blocks
     */
    function setMaxPeriod(uint256 _maxPeriod) external override {
        require(msg.sender == governance, "!governance");
        maxPeriod = _maxPeriod;
    }

    /**
     * @notice Sets the maximum coverage amount this product can provide
     * @param _maxCoverAmount maximum coverage amount (in wei)
     */
    function setMaxCoverAmount(uint256 _maxCoverAmount) external override {
        require(msg.sender == governance, "!governance");
        maxCoverAmount = _maxCoverAmount;
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
    function appraisePosition(address _policyholder, address _positionContract) public view virtual returns (uint256 positionAmount) {}

    /**** QUOTE VIEW FUNCTIONS
    View functions that give us quotes regarding a policy purchase
    ****/

    /**
     * @notice
     *  Provide a premium quote.
     * @param _coverLimit percentage of cover for total position
     * @param _blocks length for policy
     * @return premium The quote for their policy in wei.
     */
    function _getQuote(uint256 _coverLimit, uint256 _blocks, uint256 _positionAmount) internal view returns (uint256 premium){
        premium = _positionAmount * _coverLimit/100 * _blocks * price;
        return premium;
    }

    function getQuote(uint256 _coverLimit, uint256 _blocks, address _positionContract) external view override returns (uint256){
        uint256 positionAmount = appraisePosition(msg.sender, _positionContract);
        return _getQuote(_coverLimit, _blocks, positionAmount);
    }


    /**** MUTATIVE FUNCTIONS
    Functions that change state variables, deploy and change policy contracts
    ****/

    /**
     * @notice Updates active policy count and active cover amount
     */
    function _updateActivePolicies() internal {
        for (uint256 i=0; i < activePolicyIDs.length; i++) {
            if (policyManager.getPolicyExpirationBlock(activePolicyIDs[i]) < block.number) {
                activeCoverAmount -= policyManager.getPolicyCoverAmount(activePolicyIDs[i]);
                policyManager.burn(activePolicyIDs[i]);
                delete activePolicyIDs[i];
            }
        }
    }

    /**
     * @notice Updates the product"s book-keeping variables,
     * removing expired policies from the policies set and updating active cover amount
     * @return activeCoverAmount and activePolicyCount active covered amount and active policy count as a tuple
     */
    function updateActivePolicies() external returns (uint256, uint256){
        _updateActivePolicies();
        return (activeCoverAmount, activePolicyIDs.length);
    }

    /**
     * @notice
     *  Purchase and deploy a policy on the behalf of the policyholder
     * @param _coverLimit percentage of cover for total position
     * @param _blocks length (in blocks) for policy
     * @param _policyholder who's liquidity is being covered by the policy
     * @param _positionContract contract address where the policyholder has a position to be covered

     * @return policyID The contract address of the policy
     */
    function buyPolicy(uint256 _coverLimit, uint256 _blocks, address _policyholder, address _positionContract) external payable override returns (uint256 policyID){
        // check that the buyer has a position in the covered protocol
        uint256 positionAmount = appraisePosition(_policyholder, _positionContract);
        require(positionAmount != 0, "zero position value");

        // check that the product can provide coverage for this policy
        uint256 coverAmount = _coverLimit/100 * positionAmount;
        require(activeCoverAmount + coverAmount <= maxCoverAmount, "max covered amount is reached");
        // check that the buyer has paid the correct premium
        uint256 premium = _getQuote(_coverLimit, _blocks, positionAmount);
        require(msg.value == premium && premium != 0, "payment does not match the quote or premium is zero");
        // check that the buyer provided valid period and coverage limit
        require(_blocks > minPeriod && _blocks < maxPeriod, "invalid period");
        require(_coverLimit > 0 && _coverLimit < 100, "invalid cover limit percentage");

        // transfer premium to the treasury
        payable(treasury).transfer(msg.value);

        // create the policy
        uint256 expirationBlock = block.number + _blocks;
        policyID = policyManager.createPolicy(_policyholder, _positionContract, expirationBlock, coverAmount, price);

        // update local book-keeping variables
        activeCoverAmount += coverAmount;
        activePolicyIDs.push(policyID);
        productPolicyCount++;

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
    //     require(policyholder == msg.sender,"!policyholder");
    //     // compute the extra premium = newPremium - paidPremium (or the refund amount)
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
     * @param _policyID address of existing policy
     * @param _blocks length of extension
     * @return True if successfully extended else False
     */
    function extendPolicy(uint256 _policyID, uint256 _blocks) external payable override returns (bool){
        // check that the msg.sender is the policyholder
        address policyholder = policyManager.getPolicyholder(_policyID);
        require(policyholder == msg.sender,"!policyholder");
        // compute the premium
        uint256 coverAmount = policyManager.getPolicyCoverAmount(_policyID);
        uint256 premium = coverAmount * _blocks * price;
        // check that the buyer has paid the correct premium
        require(msg.value == premium && premium != 0, "payment does not match the quote or premium is zero");
        // transfer premium to the treasury
        payable(treasury).transfer(msg.value);
        // update the policy's URI
        uint256 newExpirationBlock = policyManager.getPolicyExpirationBlock(_policyID) + _blocks;
        address positionContract = policyManager.getPolicyPositionContract(_policyID);
        policyManager.setTokenURI(_policyID, policyholder, positionContract, newExpirationBlock, coverAmount, price);
        emit PolicyExtended(_policyID);
        return true;
    }

    /**
     * @notice
     *  Cancel and destroy a policy.
     * @param _policyID address of existing policy
     * @return True if successfully cancelled else False
     */
    function cancelPolicy(uint256 _policyID) external override returns (bool){
        require(policyManager.getPolicyholder(_policyID) == msg.sender,"!policyholder");
        uint256 blocksLeft = policyManager.getPolicyExpirationBlock(_policyID) - block.number;
        uint256 refundAmount = blocksLeft * policyManager.getPolicyPrice(_policyID);
        require(refundAmount > cancelFee, "refund amount less than cancelation fee");
        policyManager.burn(_policyID);
        treasury.refund(msg.sender, refundAmount - cancelFee);
        emit PolicyCanceled(_policyID);
        return true;
    }

    function getPolicyExpiration(address _policy) external override view returns (uint256 expirationDate) {
        return maxPeriod;
    }

    function getPolicyLimit(address _policy) external override view returns (uint256 coverLimit) {
        return maxCoverAmount;
    }

    function getTotalCovered() external override view returns (uint256 coveredAmount) {
        return activeCoverAmount;
    }

    function getTotalPosition(address _buyer) external override view returns (uint256 positionAmount) {
        // iterate over activePolicyIds to get users total position
        for (uint i = 0; i < activePolicyIDs.length; i++) {
             if (policyManager.getPolicyholder(i) == _buyer) {
                return policyManager.getPolicyCoverAmount(i);
             }
        }
    }
}
