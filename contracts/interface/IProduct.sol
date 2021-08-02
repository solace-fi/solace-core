// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

/**
 * @title Interface for product contracts
 * @author solace.fi
 */
interface IProduct {
    event PolicyCreated(uint256 policyID);
    event PolicyExtended(uint256 policyID);
    event PolicyCanceled(uint256 policyID);
    event PolicyUpdated(uint256 policyID);
    event GovernanceTransferred(address _newGovernance);

    /**** GETTERS + SETTERS
    Functions which get and set important product state variables
    ****/
    function governance() external view returns (address);
    function newGovernance() external view returns (address);
    function price() external view returns (uint24);
    function minPeriod() external view returns (uint64);
    function maxPeriod() external view returns (uint64);
    function maxCoverAmount() external view returns (uint256);
    function maxCoverPerUser() external view returns (uint256);
    function maxCoverPerUserDivisor() external view returns (uint32);
    function coveredPlatform() external view returns (address);
    function productPolicyCount() external view returns (uint256);
    function activeCoverAmount() external view returns (uint256);

    function setGovernance(address _governance) external;
    function acceptGovernance() external;
    function setPrice(uint24 _price) external;
    function setMinPeriod(uint64 _minPeriod) external;
    function setMaxPeriod(uint64 _maxPeriod) external;
    //function setMaxCoverPerUserDivisor(uint32 _maxCoverPerUserDivisor) external;
    function setCoveredPlatform(address _coveredPlatform) external;
    function setPolicyManager(address _policyManager) external;

    /**** UNIMPLEMENTED FUNCTIONS
    Functions that are only implemented by child product contracts
    ****/
    function appraisePosition(address _policyholder, address _positionContract) external view returns (uint256 positionAmount);
    function name() external pure returns (string memory);

    /**** QUOTE VIEW FUNCTIONS
    View functions that give us quotes regarding a policy
    ****/
    function getQuote(address _policyholder, address _positionContract, uint256 _coverAmount, uint64 _blocks) external view returns (uint256);

    /**** MUTATIVE FUNCTIONS
    Functions that deploy and change policy contracts
    ****/
    function updateActiveCoverAmount(int256 _coverDiff) external;
    function buyPolicy(address _policyholder, address _positionContract, uint256 _coverAmount, uint64 _blocks) external payable returns (uint256 policyID);
    function updateCoverAmount(uint256 _policyID, uint256 _coverAmount) external payable;
    function extendPolicy(uint256 _policyID, uint64 _blocks) external payable;
    function cancelPolicy(uint256 _policyID) external;
    function updatePolicy(uint256 _policyID, uint256 _coverAmount, uint64 _blocks ) external payable;

}
