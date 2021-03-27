// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import './interfaces/IProduct.sol';
import './Policy.sol';
/**
 * @title BaseProduct
 * @author solace.fi
 * @notice To be inherited by individual Product contracts.
 */
abstract contract BaseProduct is IProduct {
    using Address for address;
    using EnumerableSet for EnumerableSet.AddressSet;

    event PolicyCreated(uint256 _coverLimit, uint256 _days, uint256 positionAmount, uint256 premium, address policy, uint256 policies.length, uint256 coveredAmount)

    // Governor
    address public governance;

    // Product Details
    address public insuredContract;
    uint256 public price; // cover price (in wei) per day per wei
    uint256 public cancelFee; // policy cancelation fee
    uint256 public minPeriod; // minimum policy period in days
    uint256 public maxPeriod; // maximum policy period in days
    uint256 public maxCoverAmount; // maximum amount of coverage (in wei) this product can sell

    // Book-keeping varaibles
    uint256 public policyCount = 0;
    uint256 public coveredAmount; // current amount covered (in wei)
    EnumerableSet.AddressSet private policies;
    mapping(address => address) public buyerOf; // buyerOf[policy] = buyer


    constructor (
        address _insuredContract,
        uint256 _price,
        uint256 _cancelFee,
        uint256 _minPeriod,
        uint256 _maxPeriod,
        uint256 _maxCoverAmount
    ) {
        governance = msg.sender;
        insuredContract = _insuredContract;
        price = _price;
        cancelFee = _cancelFee;
        minPeriod = _minPeriod;
        maxPeriod = _maxPeriod;
        maxCoverAmount = _maxCoverAmount
    }

    /**** GETTERS + SETTERS 
    Functions which get and set important product state variables
    ****/

    /**
     * @notice Sets the price for this product
     * @param _price cover price (in wei) per ether per day
     */
    function setPrice(uint256 _price) external {
        require(msg.sender == governance, "!governance");
        price = _price
    }

    /**
     * @notice Sets the fee that user must pay upon canceling the policy
     * @param _cancelFee policy cancelation fee 
     */
    function setCancelFee(uint256 _cancelFee) external {
        require(msg.sender == governance, "!governance");
        cancelFee = _cancelFee
    }

    /**
     * @notice Sets the minimum number of days a policy can be bought for
     * @param _minPeriod minimum number of days
     */
    function setMinPeriod(uint256 _minPeriod) external {
        require(msg.sender == governance, "!governance");
        minPeriod = _minPeriod
    }

    /**
     * @notice Sets the maximum number of days a policy can be bought for
     * @param _maxPeriod maximum number of days
     */
    function setMaxPeriod(uint256 _maxPeriod) external {
        require(msg.sender == governance, "!governance");
        maxPeriod = _maxPeriod
    }

    /**
     * @notice Sets the maximum coverage amount this product can sell
     * @param _maxCoverAmount maximum coverage amount (in wei)
     */
    function setMaxCoverAmount(uint256 _maxCoverAmount) external {
        require(msg.sender == governance, "!governance");
        maxCoverAmount = _maxCoverAmount
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
     * @return The user's total position in wei in the product's protocol.
     */
    function getTotalPosition(address _buyer) virtual public view returns (uint256 positionAmount){};


    /**** METRIC VIEW FUNCTIONS 
    View functions which give us total metrics about the product
    ****/

    /**
     * @notice Get the total covered amount for all policies under this product
     * @return Amount of total cover denominated in wei
     */
    function getTotalCovered() external view returns (uint256 coveredAmount){
        /* Todo update coveredAmount: iterate through each policy and call getTotalPosition(buyerOf[policy]) */
        return coveredAmount
    }

    /*** POLICY VIEW FUNCTIONS 
    View functions that give us data about individual policies
    ****/

    function getPolicyLimit(address _policy) public view returns (uint256 coverLimit){};

    // function getPolicyCoverAmount(address _policy) public view returns (uint256 coverAmount){};

    function getPolicyExpiration(address _policy) public view returns (uint256 expirationDate){};
 

    /**** QUOTE VIEW FUNCTIONS 
    View functions that give us quotes regarding a policy
    ****/

    /**
     * @notice
     *  Provide a premium quote.
     * @param _coverLimit percentage of cover for total position
     * @param _days length (in days) for policy
     * @return The quote for their policy in wei.
     */
    function _getQuote(uint256 _coverLimit, uint256 _days, uint256 _positionAmount) internal view returns (uint256 premium){
        require(_days > minPeriod && _days < maxPeriod, 'invalid period');
        require(_coverLimit > 0 && _coverLimit < 100, 'invalid cover limit');
        premium = _positionAmount * _coverLimit * _days * price;
        return premium
    }

    function getQuote(uint256 _coverLimit, uint256 _days) external view returns (uint256 premium){
        positionAmount = getTotalPosition(msg.sender);
        return _getQuote(_coverPercentage, _days, positionAmount)
    }


    /**** MUTATIVE FUNCTIONS 
    Functions that deploy and change policy contracts
    ****/

    /**
     * @notice
     *  Purchase and deploy a policy on the behalf of msg.sender
     * @param _coverLimit percentage of cover for total position
     * @param _days length (in days) for policy
     * @return The contract address of the policy
     */
    function buyPolicy(uint256 _coverLimit, uint256 _days) external payable returns (address policy){
        positionAmount = getTotalPosition(msg.sender);
        premium = _getQuote(_coverLimit, _days, positionAmount);
        require(msg.value == premium, 'payment does not match the quote');
        coveredAmount = getTotalCovered();
        newCoverAmount = coveredAmount + _coverLimit * positionAmount;
        require(newCoverAmount <= maxCoverAmount, 'max covered amount is reached');
        bytes memory bytecode = type(Policy).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(_coverLimit, _days));
        assembly {
            policy := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IPolicy(policy).initialize();
        coveredAmount = newCoverAmount
        buyerOf[policy] = msg.sender;
        policies.add(policy);
        emit PolicyCreated(_coverLimit, _days, positionAmount, premium, policy, policies.length, coveredAmount);
        return policy
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
     * @param _days length (in months) of extension
     * @return True if successfully extended else False
     */
    function extendPolicy(address policy, uint256 _days) external payable returns (bool){
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