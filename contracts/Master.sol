// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./libraries/Math.sol";
import "./SOLACE.sol";
import "./interface/IMaster.sol";
import "./interface/IFarm.sol";


/**
 * @title Master: Distributor of solace.fi
 * @author solace.fi
 * @notice This contract is the SOLACE token distributor.
 */
contract Master is IMaster {

    /// @notice Governor.
    address public override governance;

    /// @notice Governance to take over.
    address public override newGovernance;

    /// @notice Native SOLACE Token.
    SOLACE public override solace;

    /// @notice Total solace distributed per block across all farms.
    uint256 public override solacePerBlock;

    /// @notice Total allocation points across all farms.
    uint256 public override totalAllocPoints;

    /// @notice The number of farms that have been created.
    uint256 public override numFarms;

    /// @notice Given a farm id, return its address.
    /// @dev Indexable 1-numFarms, 0 is null farm
    mapping(uint256 => address) public override farmAddresses;

    /// @notice Given a farm address, returns its id.
    /// @dev Returns 0 for not farms and unregistered farms.
    mapping(address => uint256) public override farmIndices;

    /// @notice Given a farm id, how many points the farm was allocated.
    mapping(uint256 => uint256) public override allocPoints;

    /**
     * @notice Constructs the master contract.
     * @param _governance Address of the governor.
     * @param _solace Address of the solace token.
     * @param _solacePerBlock Amount of solace to distribute per block.
     */
    constructor(address _governance, SOLACE _solace, uint256 _solacePerBlock) public {
        governance = _governance;
        solace = _solace;
        solacePerBlock = _solacePerBlock;
    }

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
     * @notice Registers a farm.
     * Can only be called by the current governor.
     * Cannot register a farm more than once.
     * @param _farmAddress The farm's address.
     * @param _allocPoints How many points to allocate this farm.
     * @return farmId The farm id.
     */
    function registerFarm(address _farmAddress, uint256 _allocPoints) external override returns (uint256 farmId) {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        require(farmIndices[_farmAddress] == 0, "already registered");
        farmId = ++numFarms; // starts at 1
        farmAddresses[farmId] = _farmAddress;
        farmIndices[_farmAddress] = farmId;
        solace.approve(_farmAddress, type(uint256).max);
        _setAllocPoints(farmId, _allocPoints);
        emit FarmCreated(farmId, _farmAddress);
    }

    /**
     * @notice Sets a farm's allocation points.
     * Can only be called by the current governor.
     * @param _farmId The farm to set allocation points.
     * @param _allocPoints How many points to allocate this farm.
     */
    function setAllocPoints(uint256 _farmId, uint256 _allocPoints) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        require(_farmId != 0 && _farmId <= numFarms, "farm does not exist");
        _setAllocPoints(_farmId, _allocPoints);
    }

    /**
     * @notice Sets the Solace reward distribution across all farms.
     * Optionally updates all farms.
     * @param _solacePerBlock Amount of solace to distribute per block.
     */
    function setSolacePerBlock(uint256 _solacePerBlock) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        // accounting
        solacePerBlock = _solacePerBlock;
        _updateRewards();
        emit RewardsSet(_solacePerBlock);
    }

    /**
     * @notice Updates all farms to be up to date to the current block.
     */
    function massUpdateFarms() public override {
        uint256 _numFarms = numFarms; // copy to memory to save gas
        for (uint256 farmId = 1; farmId <= _numFarms; ++farmId) {
            IFarm(farmAddresses[farmId]).updateFarm();
        }
    }

    /**
     * @notice Withdraw your rewards from all farms.
     */
    function withdrawRewards() external override {
        uint256 _numFarms = numFarms; // copy to memory to save gas
        for (uint256 farmId = 1; farmId <= _numFarms; ++farmId) {
            IFarm farm = IFarm(farmAddresses[farmId]);
            if(farm.pendingRewards(msg.sender) > 0) {
                farm.withdrawRewardsForUser(msg.sender);
            }
        }
    }

    /**
    * @notice Sets a farm's allocation points.
    * @param _farmId The farm to set allocation points.
    * @param _allocPoints How many points to allocate this farm.
    */
    function _setAllocPoints(uint256 _farmId, uint256 _allocPoints) internal {
      totalAllocPoints = totalAllocPoints - allocPoints[_farmId] + _allocPoints;
      allocPoints[_farmId] = _allocPoints;
      _updateRewards();
    }

    /**
     * @notice Updates each farm's block rewards.
     */
    function _updateRewards() internal {
        uint256 _numFarms = numFarms; // copy to memory to save gas
        uint256 _solacePerBlock = solacePerBlock;
        uint256 _totalAllocPoints = totalAllocPoints;
        for (uint256 farmId = 1; farmId <= _numFarms; ++farmId) {
            uint256 blockReward = _totalAllocPoints == 0 ? 0 : _solacePerBlock * allocPoints[farmId] / _totalAllocPoints;
            IFarm(farmAddresses[farmId]).setRewards(blockReward);
        }
    }
}
