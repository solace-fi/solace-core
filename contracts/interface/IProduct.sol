// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

/**
 * @title Interface for product contracts
 * @author solace.fi
 */
interface IProduct {
    event PolicyCreated(uint256 policyID);
    event PolicyExtended(uint256 policyID);
    event PolicyCanceled(uint256 policyID);

    /**** GETTERS + SETTERS 
    Functions which get and set important product state variables
    ****/
    function setGovernance(address _governance) external;
    function setClaimsAdjuster(address _claimsAdjuster) external;
    function setPrice(uint256 _price) external;
    function setCancelFee(uint256 _cancelFee) external;
    function setMinPeriod(uint256 _minPeriod) external;
    function setMaxPeriod(uint256 _maxPeriod) external;
    function setMaxCoverAmount(uint256 _maxCoverAmount) external;
 
    /**** UNIMPLEMENTED FUNCTIONS 
    Functions that are only implemented by child product contracts
    ****/
    function appraisePosition(address _policyholder, address _positionContract) external view returns (uint256 positionAmount);

    /**** QUOTE VIEW FUNCTIONS 
    View functions that give us quotes regarding a policy
    ****/
    function getQuote(uint256 _coverLimit, uint256 _blocks, address _positionContract) external view returns (uint256);

    /**** MUTATIVE FUNCTIONS 
    Functions that deploy and change policy contracts
    ****/
    function updateActivePolicies() external returns (uint256, uint256);
    function buyPolicy(uint256 _coverLimit, uint256 _blocks, address _policyholder, address _positionContract) external payable returns (uint256 policyID);
    // function updateCoverLimit(address _policy, uint256 _coverLimit) external payable returns (bool);
    function extendPolicy(uint256 _policyID, uint256 _blocks) external payable;
    function cancelPolicy(uint256 _policyID) external;
}