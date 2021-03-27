// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title Interface for product contracts
 * @author solace.fi
 */
interface IProduct {
    event PolicyCreated(uint256 _coverLimit, uint256 _days, uint256 positionAmount, uint256 premium, address policy, uint256 policies.length, uint256 coveredAmount)

    /**** GETTERS + SETTERS 
    Functions which get and set important product state variables
    ****/
    function setPrice(uint256 _price) external;
    function setCancelFee(uint256 _cancelFee) external;
    function setMinPeriod(uint256 _minPeriod) external;
    function setMaxPeriod(uint256 _maxPeriod) external;
    function setMaxCoverAmount(uint256 _maxCoverAmount) external;

    /**** UNIMPLEMENTED FUNCTIONS 
    Functions that are only implemented by child contracts
    ****/
    function getTotalPosition(address _buyer) virtual public view returns (uint256 positionAmount);

    /**** METRIC VIEW FUNCTIONS 
    View functions which give us total metrics about the product
    ****/
    function getTotalCovered() external view returns (uint256 coveredAmount);

    /*** POLICY VIEW FUNCTIONS 
    View functions that give us data about individual policies
    ****/
    function getPolicyLimit(address _policy) public view returns (uint256 coverLimit);
    function getPolicyExpiration(address _policy) public view returns (uint256 expirationDate);
 

    /**** QUOTE VIEW FUNCTIONS 
    View functions that give us quotes regarding a policy
    ****/
    function _getQuote(uint256 _coverLimit, uint256 _days, uint256 _positionAmount) internal view returns (uint256 premium);
    function getQuote(uint256 _coverLimit, uint256 _days) external view returns (uint256 premium);


    /**** MUTATIVE FUNCTIONS 
    Functions that deploy and change policy contracts
    ****/
    function buyPolicy(uint256 _coverLimit, uint256 _days) external payable returns (address policy);
    function updateCoverLimit(address _policy, uint256 _coverLimit) external payable returns (bool);
    function extendPolicy(address policy, uint256 _days) external payable returns (bool);
    function cancelPolicy(address policy) external returns (bool);
}