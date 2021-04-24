// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import './interface/IProduct.sol';
import './PolicyManager.sol';

/* TODO
 * - fix get quote function
 * - udpate buyPolicy()
 * - update bookKeeping() functions
 * - write modify policy functions
 */


/**
 * @title BaseProduct
 * @author solace.fi
 * @notice To be inherited by individual Product contracts.
 */
abstract contract BaseProduct is IProduct {
    using Address for address;
    using EnumerableSet for EnumerableSet.Set;

    event PolicyCreated(
        uint256 policyID,
        address policyholder,
        address insuredContract,
        address claimsAdjustor,
        uint256 expirationBlock,
        uint256 coverAmount,
        uint256 price);

    // Governor
    address public governance;

    // Policy Manager
    PolicyManager constant policyManager; // Policy manager ERC721 contract

    // Product Details
    address constant insuredContract; // the contract this product is providing coverage for
    address public claimsAdjustor; // address of the parametric auto claims adjustor
    uint256 public price; // cover price (in wei) per block per wei
    uint256 public cancelFee; // policy cancelation fee
    uint256 public minPeriod; // minimum policy period in blocks
    uint256 public maxPeriod; // maximum policy period in blocks
    uint256 public maxCoverAmount; // maximum amount of coverage (in wei) this product can sell

    // Book-keeping varaibles
    uint256 public policyCount = 0;
    uint256 public activeCoverAmount; // current amount covered (in wei)

    // EnumerableSet.Set public policies; // a Set containing active policy's PolicyInfo structs
    // mapping(uint256 => address) public buyerOf; // buyerOf[policyID] = buyer
    // // mapping(uint256 => PolicyInfo) public policies
    // struct PolicyInfo {
    //     uint256 policyID;           // policy ID number (same as the deployed ERC721 tokenID)
    //     uint256 expirationBlock;    // expiration block number
    //     uint256 coverAmount;        // covered amount up until the expiration block
    // }


    constructor (
        PolicyManager _policyManager,
        address _insuredContract,
        address _claimsAdjustor,
        uint256 _price,
        uint256 _cancelFee,
        uint256 _minPeriod,
        uint256 _maxPeriod,
        uint256 _maxCoverAmount)
    {
        governance = msg.sender;
        policyManager = _policyManager;
        insuredContract = _insuredContract;
        claimsAdjustor = _claimsAdjustor;
        price = _price;
        cancelFee = _cancelFee;
        minPeriod = _minPeriod;
        maxPeriod = _maxPeriod;
        maxCoverAmount = _maxCoverAmount;
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
     * @notice Sets the claims adjustor for this product
     * @param _claimsAdjustor cover price (in wei) per ether per block
     */
    function setPrice(address _claimsAdjustor) external {
        require(msg.sender == governance, "!governance");
        claimsAdjustor = _claimsAdjustor;
    }

    /**
     * @notice Sets the price for this product
     * @param _price cover price (in wei) per ether per block
     */
    function setPrice(uint256 _price) external {
        require(msg.sender == governance, "!governance");
        price = _price;
    }

    /**
     * @notice Sets the fee that user must pay upon canceling the policy
     * @param _cancelFee policy cancelation fee 
     */
    function setCancelFee(uint256 _cancelFee) external {
        require(msg.sender == governance, "!governance");
        cancelFee = _cancelFee;
    }

    /**
     * @notice Sets the minimum number of blocks a policy can be bought for
     * @param _minPeriod minimum number of blocks
     */
    function setMinPeriod(uint256 _minPeriod) external {
        require(msg.sender == governance, "!governance");
        minPeriod = _minPeriod;
    }

    /**
     * @notice Sets the maximum number of blocks a policy can be bought for
     * @param _maxPeriod maximum number of blocks
     */
    function setMaxPeriod(uint256 _maxPeriod) external {
        require(msg.sender == governance, "!governance");
        maxPeriod = _maxPeriod;
    }

    /**
     * @notice Sets the maximum coverage amount this product can sell
     * @param _maxCoverAmount maximum coverage amount (in wei)
     */
    function setMaxCoverAmount(uint256 _maxCoverAmount) external {
        require(msg.sender == governance, "!governance");
        maxCoverAmount = _maxCoverAmount;
    }


    /**** UNIMPLEMENTED FUNCTIONS 
    Functions that are only implemented by child contracts
    ****/

    /**
     * @notice
     *  Provide the user's total position in the product's protocol.
     *  This total should be denominated in eth.
     * @dev
     *  Every product will have a different mechanism to read and determine
     *  a user's total position in that product's protocol. This method will
     *  only be implemented in the inheriting product contracts
     * @param _buyer buyer requiesting the coverage quote
     * @return The user's total position in wei in the product's protocol.
     */
    function appraisePosition(address _buyer) public view virtual returns (uint256 positionAmount){}


    /**** METRIC VIEW FUNCTIONS 
    View functions which give us total metrics about the product
    ****/

    /**
     * @notice Get the total number of active coverage policies
     * @dev Should call updateBookKeeping() first to remove any expired policies
     * @return Number of active policies
     */
    function getActivePolicyCount() external view returns (uint256 activePolicyCount){
        // return policies.length();
    }
 
    /**** QUOTE VIEW FUNCTIONS 
    View functions that give us quotes regarding a policy
    ****/

    /**
     * @notice
     *  Provide a premium quote.
     * @param _coverLimit percentage of cover for total position
     * @param _blocks length for policy
     * @return The quote for their policy in wei.
     */
    function _getQuote(uint256 _coverLimit, uint256 _blocks, uint256 _positionAmount) internal view returns (uint256 premium){
        require(_blocks > minPeriod && _blocks < maxPeriod, 'invalid period');
        require(_coverLimit > 0 && _coverLimit < 100, 'invalid cover limit');
        premium = _positionAmount * _coverLimit * _blocks * price;
        return premium;
    }

    function getQuote(uint256 _coverLimit, uint256 _blocks) external view returns (uint256 premium){
        uint256 positionAmount = appraisePosition(msg.sender);
        return _getQuote(_coverLimit, _blocks, positionAmount);
    }


    /**** MUTATIVE FUNCTIONS 
    Functions that change state variables, deploy and change policy contracts
    ****/

    /**
     * @notice Updates the product's book-keeping variables, 
     * removing expired policies from the policies set and updating active cover amount
     */
    function _updateBookKeeping() internal {
        // for (uint256 i=0; i < policies.length(); i++) {
        //     if (policies[i].expirationBlock < block.number) {
        //         policy = policies[i];
        //         policies.remove(policy);
        //         activeCoverAmount -= policy.coverAmount;
        //         }
        // }
    }

    /**
     * @notice Updates the product's book-keeping variables, 
     * removing expired policies from the policies set and updating active cover amount
     * @return active covered amount and active policy count as a tuple
     */
    function updateBookKeeping() external returns (uint256 activeCoverAmount, uint256 activePolicyCount){
        // _updateBookKeeping();
        // return (activeCoverAmount, policies.length());
    }

    /**
     * @notice
     *  Purchase and deploy a policy on the behalf of msg.sender
     * @param _coverLimit percentage of cover for total position
     * @param _blocks length (in blocks) for policy
     * @return The contract address of the policy
     */
    function buyPolicy(uint256 _coverLimit, uint256 _blocks) external payable returns (address policy){

        /* TODO deploy ERC721 like UniswapV3 */

        uint256 positionAmount = appraisePosition(msg.sender);
        uint256 premium = _getQuote(_coverLimit, _blocks, positionAmount);
        require(msg.value == premium, 'payment does not match the quote');
        // uint256 activeCoverAmount = getTotalCovered();
        uint256 newPolicyCoverage = _coverLimit * positionAmount;
        uint256 newCoverAmount = activeCoverAmount + newPolicyCoverage;
        require(newCoverAmount <= maxCoverAmount, 'max covered amount is reached');
        activeCoverAmount = newCoverAmount;
        // buyerOf[policy] = msg.sender;
        // policies.add(policy);
        emit PolicyCreated(_coverLimit, _blocks, positionAmount, premium, policy);
        return policy;
    }

    /**
     * @notice
     *  Increase or decrease the cover limit for the policy
     * @param _policy address of existing policy
     * @param _coverLimit new cover percentage
     * @return True if coverlimit is successfully increased else False
     */
    function updateCoverLimit(address _policy, uint256 _coverLimit) external payable returns (bool){
        /* Todo(kush): Implement getIncreasedCoverQuote*/
    }

    /**
     * @notice
     *  Extend a policy contract
     * @param policy address of existing policy
     * @param _blocks length of extension
     * @return True if successfully extended else False
     */
    function extendPolicy(address policy, uint256 _blocks) external payable returns (bool){
        //Todo(kush): Implement extendPolicy
    }

    /**
     * @notice
     *  Cancel and destroy a policy contract.
     * @param policy address of existing policy
     * @return True if successfully cancelled else False
     */
    function cancelPolicy(address policy) external returns (bool){
        //Todo(kush): Implement cancelPolicy
    }
}