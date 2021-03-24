// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title BaseProduct
 * @author solace.fi
 * @notice To be inherited by individual Product contracts.
 */
abstract contract BaseProduct {
    using Address for address;
    address public governance;

    // Individual Product Details
    string public productName; // Should we store as an int and hold conversion to name in registry. bytes32 instead of string?
    uint256 public pricePerCoveredEther; // cover price(in wei) per ether
    uint256 public cancelReimbursementPerMonthRemaining; // reimbursment price(in wei) per month remaining on policy
    uint256 public minPeriodMonths; // minimum period in months for a Policy
    uint256 public maxPeriodMonths; // maximum period in months for a Policy
    


    constructor (
        string _productName,
        uint256 _minPeriodMonths,
        uint256 _maxPeriodMonths,
        uint256 _pricePerCoveredEther,
        uint256 _cancelReimbursementPerMonthRemaining
    ) {
        governance = msg.sender;
        productName = _productName;
        minPeriodMonths = _minPeriodMonths;
        maxPeriodMonths = _maxPeriodMonths;
        pricePerCoveredEther = _pricePerCoveredEther;
        cancelReimbursementPerMonthRemaining = _cancelReimbursementPerMonthRemaining;
    }

    /**** GETTERS + SETTERS 
    Functions which get and set important product state variables
    ****/

    /**
     * @notice Sets the price per covered eth for this product
     * @param _pricePerCoveredEther Price per covered eth in wei
     */
    function setPricePerCoveredEther(uint256 _pricePerCoveredEther) external {
        require(msg.sender == governance, "!governance");
        pricePerCoveredEther = _pricePerCoveredEther
    }

    /**
     * @notice Sets the cancellation reimbursement per month remaining unit
     * @param _cancelReimbursementPerMonthRemaining Cancel reimbursement in wei per month 
       remaining in policy
     */
    function setCancelReimbursementPerMonth(uint256 _cancelReimbursementPerMonthRemaining) external {
        require(msg.sender == governance, "!governance");
        cancelReimbursementPerMonthRemaining = _cancelReimbursementPerMonthRemaining
    }

    /**
     * @notice Sets the minimum number of months a policy can be bought for
     * @param _minPeriodMonths minimum number of months
     */
    function setMinPeriodMonths(uint256 _minPeriodMonths) external {
        require(msg.sender == governance, "!governance");
        minPeriodMonths = _minPeriodMonths
    }

    /**
     * @notice Sets the maximum number of months a policy can be bought for
     * @param _maxPeriodMonths maximum number of months
     */
    function setMaxPeriodMonths(uint256 _maxPeriodMonths) external {
        require(msg.sender == governance, "!governance");
        maxPeriodMonths = _maxPeriodMonths
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
    function getTotalPositionInProduct() virtual public view returns (uint256);


    /**** METRIC VIEW FUNCTIONS 
    View functions which give us total metrics about the product
    ****/

    /**
     * @notice
     *  Get the total covered amount for all policies under this product
     * @return Amount of total cover denominated in wei
     */
    function getTotalCover() external view returns (uint256){

    }

    /*** POLICY VIEW FUNCTIONS 
    View functions that give us data about individual policies
    ****/

    /**** QUOTE VIEW FUNCTIONS 
    View functions that give us quotes regarding a policy
    ****/

    /**
     * @notice
     *  Provide a premium quote.
     * @param coverPercentage percentage of cover for total position
     * @param months length (in months) of policy
     * @return The quote for their policy in wei.
     */
    function getQuote(uint256 coverPercentage, uint256 months) external view returns (uint256){
        /* Todo(kush): Implement getQuote
         1. Pass inputs to oracle which creates a quote by talking to offchain system
         2. Return quote from offchain system
        */
    }

    /**
     * @notice
     *  Provide an increased cover quote given the policy.
     * @param policy address of existing policy
     * @param coverPercentage new cover percentage
     * @return The quote in wei for increasing the cover limit of the policy
     */
    function getIncreasedCoverQuote(address policy, uint256 coverPercentage) external view returns (uint256){
        /* Todo(kush): Implement getIncreasedCoverQuote*/
    }

    /**
     * @notice
     *  Provide an extension quote given the policy.
     * @param policy address of existing policy
     * @param months length (in months) of extension
     * @return The quote in wei for extending the policy by the inputted months
     */
    function getExtensionQuote(address policy, uint256 months) external view returns (uint256){
        /* Todo(kush): Implement getExtensionQuote*/
    }

    /**
     * @notice
     *  Provide a cancellation reimbursement for the current plicy
     * @param policy address of existing policy
     * @return The amount in wei reimbursed for canceling the policy
     */
    function getCancelReimbursement(address policy) external view returns (uint256){
        //Todo(kush): Implement cancelPolicy
    }



    /**** MUTATIVE FUNCTIONS 
    Functions that deploy and change policy contracts
    ****/


    /**
     * @notice
     *  Purchase and deploy a policy on the behalf of msg.sender
     * @param coverPercentage percentage of cover for total position
     * @param months length (in months) of policy
     * @return The contract address of the policy
     */
    function buyPolicy(uint256 coverPercentage, uint256 months) external payable returns (address){
        /*Todo(kush): Implement buyPolicy
          1. Check getQuote matches payment
          2. Check details of policy
          3. Deploy policy contract
        */
    }

    /**
     * @notice
     *  Increase the cover limit for the policy
     * @param policy address of existing policy
     * @param coverPercentage new cover percentage
     * @return True if coverlimit is successfully increased else False
     */
    function increasedCoverForPolicy(address policy, uint256 coverPercentage) external payable returns (bool){
        /* Todo(kush): Implement getIncreasedCoverQuote*/
    }

    /**
     * @notice
     *  Extend a policy contract
     * @param policy address of existing policy
     * @param months length (in months) of extension
     * @return True if successfully extended else False
     */
    function extendPolicy(address policy, uint256 months) external payable returns (bool){
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