// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./SOLACE.sol";
import "./Governable.sol";
import "./interface/IMaster.sol";
import "./interface/IFarm.sol";


/**
 * @title Master
 * @author solace.fi
 * @notice The distributor of [**SOLACE** token](./SOLACE).
 */
contract Master is IMaster, Governable {

    /// @notice Native SOLACE Token.
    SOLACE public override solace;

    /// @notice Total solace distributed per block across all farms.
    uint256 public override solacePerBlock;

    /// @notice Total allocation points across all farms.
    uint256 public override totalAllocPoints;

    /// @notice The number of farms that have been created.
    uint256 public override numFarms;

    /// @notice Given a farm ID, return its address.
    /// @dev Indexable 1-numFarms, 0 is null farm
    mapping(uint256 => address) public override farmAddresses;

    /// @notice Given a farm address, returns its ID.
    /// @dev Returns 0 for not farms and unregistered farms.
    mapping(address => uint256) public override farmIndices;

    /// @notice Given a farm ID, how many points the farm was allocated.
    mapping(uint256 => uint256) public override allocPoints;

    /**
     * @notice Constructs the master contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param solace_ Address of the solace token.
     * @param solacePerBlock_ Amount of solace to distribute per block.
     */
    constructor(address governance_, SOLACE solace_, uint256 solacePerBlock_) Governable(governance_) {
        solace = solace_;
        solacePerBlock = solacePerBlock_;
    }

    /**
     * @notice Registers a farm.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * Cannot register a farm more than once.
     * @param farmAddress The farm's address.
     * @param allocPoints_ How many points to allocate this farm.
     * @return farmID The farm ID.
     */
    function registerFarm(address farmAddress, uint256 allocPoints_) external override onlyGovernance returns (uint256 farmID) {
        require(farmIndices[farmAddress] == 0, "already registered");
        farmID = ++numFarms; // starts at 1
        farmAddresses[farmID] = farmAddress;
        farmIndices[farmAddress] = farmID;
        solace.approve(farmAddress, type(uint256).max);
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
        require(farmID != 0 && farmID <= numFarms, "farm does not exist");
        _setAllocPoints(farmID, allocPoints_);
    }

    /**
     * @notice Sets the Solace reward distribution across all farms.
     * Optionally updates all farms.
     * @param solacePerBlock_ Amount of solace to distribute per block.
     */
    function setSolacePerBlock(uint256 solacePerBlock_) external override onlyGovernance {
        // accounting
        solacePerBlock = solacePerBlock_;
        _updateRewards();
        emit RewardsSet(solacePerBlock_);
    }

    /**
     * @notice Updates all farms to be up to date to the current block.
     */
    function massUpdateFarms() public override {
        uint256 numFarms_ = numFarms; // copy to memory to save gas
        for (uint256 farmID = 1; farmID <= numFarms_; ++farmID) {
            IFarm(farmAddresses[farmID]).updateFarm();
        }
    }

    /**
     * @notice Withdraw your rewards from all farms.
     */
    function withdrawRewards() external override {
        uint256 numFarms_ = numFarms; // copy to memory to save gas
        for (uint256 farmID = 1; farmID <= numFarms_; ++farmID) {
            IFarm farm = IFarm(farmAddresses[farmID]);
            if(farm.pendingRewards(msg.sender) > 0) {
                farm.withdrawRewardsForUser(msg.sender);
            }
        }
    }

    /**
    * @notice Sets a farm's allocation points.
    * @param farmID The farm to set allocation points.
    * @param allocPoints_ How many points to allocate this farm.
    */
    function _setAllocPoints(uint256 farmID, uint256 allocPoints_) internal {
      totalAllocPoints = totalAllocPoints - allocPoints[farmID] + allocPoints_;
      allocPoints[farmID] = allocPoints_;
      _updateRewards();
    }

    /**
     * @notice Updates each farm's block rewards.
     */
    function _updateRewards() internal {
        uint256 numFarms_ = numFarms; // copy to memory to save gas
        uint256 solacePerBlock_ = solacePerBlock;
        uint256 totalAllocPoints_ = totalAllocPoints;
        for (uint256 farmID = 1; farmID <= numFarms_; ++farmID) {
            uint256 blockReward = totalAllocPoints_ == 0 ? 0 : solacePerBlock_ * allocPoints[farmID] / totalAllocPoints_;
            IFarm(farmAddresses[farmID]).setRewards(blockReward);
        }
    }
}
