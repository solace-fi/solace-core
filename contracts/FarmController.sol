// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./interface/IOptionsFarming.sol";
import "./interface/IFarm.sol";
import "./interface/IFarmController.sol";


/**
 * @title FarmController
 * @author solace.fi
 * @notice Controls the allocation of rewards across multiple farms.
 */
contract FarmController is IFarmController, Governable {

    uint256 internal _solacePerSecond;

    IOptionsFarming internal _optionsFarming;

    /// @notice Total allocation points across all farms.
    uint256 internal _totalAllocPoints = 0;

    /// @notice The number of farms that have been created.
    uint256 internal _numFarms = 0;

    /// @notice Given a farm ID, return its address.
    /// @dev Indexable 1-numFarms, 0 is null farm
    mapping(uint256 => address) internal _farmAddresses;

    /// @notice Given a farm address, returns its ID.
    /// @dev Returns 0 for not farms and unregistered farms.
    mapping(address => uint256) internal _farmIndices;

    /// @notice Given a farm ID, how many points the farm was allocated.
    mapping(uint256 => uint256) internal _allocPoints;

    /**
     * @notice Constructs the `FarmController` contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param solacePerSecond_ Amount of solace to distribute per second.
     */
    constructor(address governance_, uint256 solacePerSecond_) Governable(governance_) {
        _solacePerSecond = solacePerSecond_;
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /// @notice Total solace distributed per second across all farms.
    function solacePerSecond() external view override returns (uint256) {
        return _solacePerSecond;
    }

    /// @notice Total allocation points across all farms.
    function totalAllocPoints() external view override returns (uint256) {
        return _totalAllocPoints;
    }

    /// @notice The number of farms that have been created.
    function numFarms() external view override returns (uint256) {
        return _numFarms;
    }

    /// @notice Given a farm ID, return its address.
    /// @dev Indexable 1-numFarms, 0 is null farm.
    function farmAddresses(uint256 farmID) external view override returns (address) {
        return _farmAddresses[farmID];
    }

    /// @notice Given a farm address, returns its ID.
    /// @dev Returns 0 for not farms and unregistered farms.
    function farmIndices(address farmAddress) external view override returns (uint256) {
        return _farmIndices[farmAddress];
    }

    /// @notice Given a farm ID, how many points the farm was allocated.
    function allocPoints(uint256 farmID) external view override returns (uint256) {
        return _allocPoints[farmID];
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Updates all farms to be up to date to the current second.
     */
    function massUpdateFarms() external override {
        uint256 numFarms_ = _numFarms; // copy to memory to save gas
        for(uint256 farmID = 1; farmID <= numFarms_; ++farmID) {
            IFarm(_farmAddresses[farmID]).updateFarm();
        }
    }

    /**
     * @notice Calculates the accumulated balance of [**SOLACE**](./SOLACE) for specified user.
     * @param user The user for whom unclaimed tokens will be shown.
     * @return reward Total amount of withdrawable reward tokens.
     */
    function pendingRewards(address user) external view override returns (uint256 reward) {
        reward = 0;
        uint256 numFarms_ = _numFarms; // copy to memory to save gas
        for(uint256 farmID = 1; farmID <= numFarms_; ++farmID) {
            IFarm farm = IFarm(_farmAddresses[farmID]);
            reward += farm.pendingRewards(user);
        }
        return reward;
    }

    /***************************************
    OPTIONS CREATION FUNCTIONS
    ***************************************/

    /**
     * @notice Withdraw your rewards from all farms and create an option.
     * @return optionID The ID of the new option.
     */
    function farmOptionMulti() external override returns (uint256 optionID) {
        // withdraw rewards from all farms
        uint256 rewardAmount = 0;
        uint256 numFarms_ = _numFarms; // copy to memory to save gas
        for(uint256 farmID = 1; farmID <= numFarms_; ++farmID) {
            IFarm farm = IFarm(_farmAddresses[farmID]);
            rewardAmount += farm.withdrawRewardsForUser(msg.sender);
        }
        // create an option
        optionID = _optionsFarming.createOption(rewardAmount);
        // TODO: bookkeeping?
        return optionID;
    }

    /**
     * @notice Creates an option for the given `rewardAmount`.
     * Must be called by a farm.
     * @param rewardAmount The amount to reward in the Option.
     * @return optionID The ID of the newly minted option.
     */
    function createOption(uint256 rewardAmount) external override returns (uint256 optionID) {
        require(_farmIndices[msg.sender] != 0, "!farm");
        // create an option
        optionID = _optionsFarming.createOption(rewardAmount);
        // TODO: bookkeeping?
        return optionID;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Registers a farm.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * Cannot register a farm more than once.
     * @param farmAddress The farm's address.
     * @param allocPoints_ How many points to allocate this farm.
     * @return farmID The farm ID.
     */
    function registerFarm(address farmAddress, uint256 allocPoints_) external override onlyGovernance returns (uint256 farmID) {
        require(_farmIndices[farmAddress] == 0, "already registered");
        require(IFarm(farmAddress).farmType() > 0, "not a farm");
        farmID = ++_numFarms; // starts at 1
        _farmAddresses[farmID] = farmAddress;
        _farmIndices[farmAddress] = farmID;
        _setAllocPoints(farmID, allocPoints_);
        emit FarmCreated(farmID, farmAddress);
    }

    /**
     * @notice Sets a farm's allocation points.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param farmID The farm to set allocation points.
     * @param allocPoints_ How many points to allocate this farm.
     */
    function setAllocPoints(uint256 farmID, uint256 allocPoints_) external override onlyGovernance {
        require(farmID != 0 && farmID <= _numFarms, "farm does not exist");
        _setAllocPoints(farmID, allocPoints_);
    }

    /**
     * @notice Sets the Solace reward distribution across all farms.
     * Optionally updates all farms.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param solacePerSecond_ Amount of solace to distribute per second.
     */
    function setSolacePerSecond(uint256 solacePerSecond_) external override onlyGovernance {
        // accounting
        _solacePerSecond = solacePerSecond_;
        _updateRewards();
        emit RewardsSet(solacePerSecond_);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
    * @notice Sets a farm's allocation points.
    * @param farmID The farm to set allocation points.
    * @param allocPoints_ How many points to allocate this farm.
    */
    function _setAllocPoints(uint256 farmID, uint256 allocPoints_) internal {
      _totalAllocPoints = _totalAllocPoints - _allocPoints[farmID] + allocPoints_;
      _allocPoints[farmID] = allocPoints_;
      _updateRewards();
    }

    /**
     * @notice Updates each farm's second rewards.
     */
    function _updateRewards() internal {
        uint256 numFarms_ = _numFarms; // copy to memory to save gas
        uint256 solacePerSecond_ = _solacePerSecond;
        uint256 totalAllocPoints_ = _totalAllocPoints;
        for(uint256 farmID = 1; farmID <= numFarms_; ++farmID) {
            uint256 secondReward = totalAllocPoints_ == 0 ? 0 : solacePerSecond_ * _allocPoints[farmID] / totalAllocPoints_;
            IFarm(_farmAddresses[farmID]).setRewards(secondReward);
        }
    }
}
