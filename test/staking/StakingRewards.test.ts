import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet, utils } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Solace, XsLocker, StakingRewards } from "./../../typechain";
import { bnMulDiv, expectClose } from "./../utilities/math";

// contracts
let solace: Solace;
let xslocker: XsLocker;
let stakingRewards: StakingRewards;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_YEAR = 31536000; // in seconds
const ONE_WEEK = 604800; // in seconds
const Q12 = BN.from(10).pow(12);
const PRECISION = BN.from(10).pow(12);
const REWARD_DEBT_PRECISION = BN.from(10).pow(30);

const MAX_LOCK_DURATION = 126144000; // 60*60*24*365*4 = 4 years in seconds
const MAX_LOCK_MULTIPLIER_BPS = 25000;  // 2.5X
const UNLOCKED_MULTIPLIER_BPS = 10000; // 1X
const MAX_BPS = 10000;

const solacePerYear = BN.from("10000000000000000000000000"); // 10M/yr
const solacePerSecond = BN.from("317097919837645865");

describe("StakingRewards", function () {
  const [deployer, governor, user1, user2, user3] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    await solace.connect(governor).addMinter(governor.address);
    xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;

    await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
    await solace.connect(governor).mint(user2.address, ONE_ETHER.mul(100));
    await solace.connect(governor).mint(user3.address, ONE_ETHER.mul(100));
    await solace.connect(user1).approve(xslocker.address, constants.MaxUint256);
    await solace.connect(user2).approve(xslocker.address, constants.MaxUint256);
    await solace.connect(user3).approve(xslocker.address, constants.MaxUint256);
  });

  describe("deployment", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      let block = await provider.getBlock('latest');
      startTime = block.timestamp + 100;
      endTime = block.timestamp + 200;
    });
    it("reverts if zero governance", async function () {
      await expect(deployContract(deployer, artifacts.StakingRewards, [ZERO_ADDRESS, solace.address, xslocker.address, startTime, endTime, solacePerSecond])).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero solace", async function () {
      await expect(deployContract(deployer, artifacts.StakingRewards, [governor.address, ZERO_ADDRESS, xslocker.address, startTime, endTime, solacePerSecond])).to.be.revertedWith("zero address solace");
    });
    it("reverts if zero xslocker", async function () {
      await expect(deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, ZERO_ADDRESS, startTime, endTime, solacePerSecond])).to.be.revertedWith("zero address xslocker");
    });
    it("reverts if invalid times", async function () {
      await expect(deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xslocker.address, 3, 2, solacePerSecond])).to.be.revertedWith("invalid window");
    });
    it("deploys", async function () {
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xslocker.address, startTime, endTime, solacePerSecond])) as StakingRewards;
    });
    it("initializes properly", async function () {
      expect(await stakingRewards.MAX_LOCK_DURATION()).eq(MAX_LOCK_DURATION);
      expect(await stakingRewards.MAX_LOCK_MULTIPLIER_BPS()).eq(MAX_LOCK_MULTIPLIER_BPS);
      expect(await stakingRewards.UNLOCKED_MULTIPLIER_BPS()).eq(UNLOCKED_MULTIPLIER_BPS);
      expect(await stakingRewards.solace()).eq(solace.address);
      expect(await stakingRewards.xsLocker()).eq(xslocker.address);
      expect(await stakingRewards.rewardPerSecond()).eq(solacePerSecond);
      expect(await stakingRewards.startTime()).eq(startTime);
      expect(await stakingRewards.endTime()).eq(endTime);
      expect(await stakingRewards.lastRewardTime()).eq(0);
      expect(await stakingRewards.accRewardPerShare()).eq(0);
      expect(await stakingRewards.valueStaked()).eq(0);
      //expect(await stakingRewards.ownerOf(0)).eq(ZERO_ADDRESS);
      let lockInfo = await stakingRewards.stakedLockInfo(0);
      expect(lockInfo.value).eq(0);
      expect(lockInfo.rewardDebt).eq(0);
      expect(lockInfo.unpaidRewards).eq(0);
      expect(lockInfo.owner).eq(ZERO_ADDRESS);
      expect(await stakingRewards.pendingRewardsOfUser(user1.address)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(0)).eq(0);
    });
  });

  describe("listener", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      let block = await provider.getBlock('latest');
      startTime = block.timestamp;
      endTime = block.timestamp + 200;
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xslocker.address, startTime, endTime, solacePerSecond])) as StakingRewards;
      await solace.connect(governor).mint(stakingRewards.address, ONE_ETHER.mul(1000000));
    });
    it("does not hear updates when not registered", async function () {
      let xsLockID = 1;
      let tx1 = await xslocker.connect(user1).createLock(user1.address, 1, 0);
      await expect(tx1).to.not.emit(stakingRewards, "Updated");
      await expect(tx1).to.not.emit(stakingRewards, "LockUpdated");
      let tx2 = await xslocker.connect(user1).increaseAmount(xsLockID, 1);
      await expect(tx2).to.not.emit(stakingRewards, "Updated");
      await expect(tx2).to.not.emit(stakingRewards, "LockUpdated");
      let tx3 = await xslocker.connect(user1).extendLock(xsLockID, 1);
      await expect(tx3).to.not.emit(stakingRewards, "Updated");
      await expect(tx3).to.not.emit(stakingRewards, "LockUpdated");
      let tx4 = await xslocker.connect(user1).withdraw(xsLockID, user1.address);
      await expect(tx4).to.not.emit(stakingRewards, "Updated");
      await expect(tx4).to.not.emit(stakingRewards, "LockUpdated");
    });
    it("hears updates when registered", async function () {
      await xslocker.connect(governor).addXsLockListener(stakingRewards.address);
      let xsLockID = 2;
      let tx1 = await xslocker.connect(user1).createLock(user1.address, 1, 0);
      await expect(tx1).to.emit(stakingRewards, "Updated");
      await expect(tx1).to.emit(stakingRewards, "LockUpdated").withArgs(xsLockID);
      let tx2 = await xslocker.connect(user1).increaseAmount(xsLockID, 1);
      await expect(tx2).to.emit(stakingRewards, "Updated");
      await expect(tx2).to.emit(stakingRewards, "LockUpdated").withArgs(xsLockID);
      let tx3 = await xslocker.connect(user1).extendLock(xsLockID, 1);
      await expect(tx3).to.emit(stakingRewards, "Updated");
      await expect(tx3).to.emit(stakingRewards, "LockUpdated").withArgs(xsLockID);
      let tx4 = await xslocker.connect(user1).withdraw(xsLockID, user1.address);
      await expect(tx4).to.emit(stakingRewards, "Updated");
      await expect(tx4).to.emit(stakingRewards, "LockUpdated").withArgs(xsLockID);
      // many
      await xslocker.connect(user1).createLock(user1.address, 1, 0);
      await xslocker.connect(user1).createLock(user1.address, 1, 0);
      let tx5 = await xslocker.connect(user1).withdrawMany([3, 4], user1.address);
      await expect(tx5).to.emit(stakingRewards, "Updated");
      await expect(tx5).to.emit(stakingRewards, "LockUpdated").withArgs(3);
      await expect(tx5).to.emit(stakingRewards, "LockUpdated").withArgs(4);
    });
    it("updates staked lock info", async function () {
      let xsLockID = 5;
      // before creation
      let info1 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info1.value).eq(0);
      expect(info1.rewardDebt).eq(0);
      expect(info1.unpaidRewards).eq(0);
      expect(info1.owner).eq(ZERO_ADDRESS);
      // creation
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER, 0);
      let info2 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info2.value).eq(ONE_ETHER);
      let accRewardPerShare = await stakingRewards.accRewardPerShare();
      expect(info2.rewardDebt).eq(ONE_ETHER.mul(accRewardPerShare).div(Q12));
      expect(info2.unpaidRewards).eq(0);
      expect(info2.owner).eq(user1.address);
      // increase amount
      await xslocker.connect(user1).increaseAmount(xsLockID, ONE_ETHER.mul(3));
      let info3 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info3.value).eq(ONE_ETHER.mul(4));
      accRewardPerShare = await stakingRewards.accRewardPerShare();
      expect(info3.rewardDebt).eq(ONE_ETHER.mul(4).mul(accRewardPerShare).div(Q12));
      expect(info3.unpaidRewards).eq(0);
      expect(info3.owner).eq(user1.address);
      // extend to another time in past
      await xslocker.connect(user1).extendLock(xsLockID, 12345);
      let info4 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info4.value).eq(ONE_ETHER.mul(4));
      accRewardPerShare = await stakingRewards.accRewardPerShare();
      expect(info4.rewardDebt).eq(ONE_ETHER.mul(4).mul(accRewardPerShare).div(Q12));
      expect(info4.unpaidRewards).eq(0);
      expect(info4.owner).eq(user1.address);
      // extend to future
      let block = await provider.getBlock('latest');
      let end = block.timestamp+ONE_YEAR*4;
      await xslocker.connect(user1).extendLock(xsLockID, end);
      let info5 = await stakingRewards.stakedLockInfo(xsLockID);
      expectClose(info5.value, ONE_ETHER.mul(10), PRECISION);
      accRewardPerShare = await stakingRewards.accRewardPerShare();
      expectClose(info5.rewardDebt, ONE_ETHER.mul(10).mul(accRewardPerShare).div(Q12), REWARD_DEBT_PRECISION);
      expect(info5.unpaidRewards).eq(0);
      expect(info5.owner).eq(user1.address);
      // harvest at end
      await provider.send("evm_setNextBlockTimestamp", [end]);
      await provider.send("evm_mine", []);
      await stakingRewards.connect(user1).harvestLock(xsLockID);
      let info6 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info6.value).eq(ONE_ETHER.mul(4));
      accRewardPerShare = await stakingRewards.accRewardPerShare();
      expect(info6.rewardDebt).eq(ONE_ETHER.mul(4).mul(accRewardPerShare).div(Q12));
      expect(info6.unpaidRewards).eq(0);
      expect(info6.owner).eq(user1.address);
      // withdraw
      await xslocker.connect(user1).withdraw(xsLockID, user1.address);
      let info7 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info7.value).eq(0);
      accRewardPerShare = await stakingRewards.accRewardPerShare();
      expect(info7.rewardDebt).eq(0);
      expect(info7.unpaidRewards).eq(0);
      expect(info7.owner).eq(user1.address);
    });
  });

  describe("rewards before start no locks", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      let block = await provider.getBlock('latest');
      startTime = block.timestamp + 100;
      endTime = block.timestamp + 200;
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xslocker.address, startTime, endTime, solacePerSecond])) as StakingRewards;
      await xslocker.connect(governor).addXsLockListener(stakingRewards.address);
    });
    it("pending rewards are zero", async function () {
      expect(await stakingRewards.pendingRewardsOfLock(0)).eq(0);
      expect(await stakingRewards.pendingRewardsOfUser(user1.address)).eq(0);
    });
    it("rewards distributed is zero", async function () {
      expect(await stakingRewards.getRewardAmountDistributed(0, startTime)).eq(0);
    });
    it("harvest does nothing", async function () {
      let balances1 = await getBalances();
      await stakingRewards.connect(user1).harvestUser(user1.address);
      let balances2 = await getBalances();
      expect(balances1).deep.eq(balances2);
      await stakingRewards.connect(user1).harvestLock(1);
      let balances3 = await getBalances();
      expect(balances1).deep.eq(balances3);
      await stakingRewards.connect(user1).harvestLocks([1,2,3]);
      let balances4 = await getBalances();
      expect(balances1).deep.eq(balances4);
    });
    after(async function () {
      await xslocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("rewards before start with locks", function () {
    let startTime: number;
    let endTime: number;
    let numLocks: BN;
    before(async function () {
      let block = await provider.getBlock('latest');
      startTime = block.timestamp + 100;
      endTime = block.timestamp + 200;
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xslocker.address, startTime, endTime, solacePerSecond])) as StakingRewards;
      await xslocker.connect(governor).addXsLockListener(stakingRewards.address);
      numLocks = await xslocker.totalNumLocks();
      await xslocker.connect(user1).createLock(user1.address, 1, 0);
      await xslocker.connect(user1).createLock(user1.address, 2, 0);
    });
    it("pending rewards are zero", async function () {
      expect(await stakingRewards.pendingRewardsOfLock(numLocks.add(1))).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(numLocks.add(2))).eq(0);
      expect(await stakingRewards.pendingRewardsOfUser(user1.address)).eq(0);
    });
    it("rewards distributed is zero", async function () {
      expect(await stakingRewards.getRewardAmountDistributed(0, startTime)).eq(0);
    });
    it("harvest does nothing", async function () {
      let balances1 = await getBalances();
      await stakingRewards.connect(user1).harvestUser(user1.address);
      let balances2 = await getBalances();
      expect(balances1).deep.eq(balances2);
      await stakingRewards.connect(user1).harvestLock(numLocks.add(1));
      let balances3 = await getBalances();
      expect(balances1).deep.eq(balances3);
      await stakingRewards.connect(user1).harvestLocks([numLocks.add(1), numLocks.add(2), 999]);
      let balances4 = await getBalances();
      expect(balances1).deep.eq(balances4);
    });
    after(async function () {
      await xslocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("rewards", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      let block = await provider.getBlock('latest');
      startTime = block.timestamp + 10;
      endTime = block.timestamp + ONE_YEAR*10;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await solace.connect(user1).approve(xslocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xslocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xslocker.address, constants.MaxUint256);
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xslocker.address, startTime, endTime, solacePerSecond])) as StakingRewards;
      await xslocker.connect(governor).addXsLockListener(stakingRewards.address);
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER, 0); // xsLockID 1 value 1
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), block.timestamp+ONE_YEAR*4); // xsLockID 2 value 5
      await xslocker.connect(user2).createLock(user2.address, ONE_ETHER.mul(3), 0); // xsLockID 3 value 3
      await solace.connect(governor).mint(stakingRewards.address, ONE_ETHER.mul(1000000000));
    });
    it("before start", async function () {
      await checkConsistency();
    });
    it("after start", async function () {
      let balances1 = await getBalances();
      // 20 blocks
      await provider.send("evm_setNextBlockTimestamp", [startTime + 20]);
      await provider.send("evm_mine", []);
      await checkConsistency();
      expectClose(await stakingRewards.pendingRewardsOfLock(1), bnMulDiv([solacePerSecond, 1, 20], [9]), PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(2), bnMulDiv([solacePerSecond, 5, 20], [9]), PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(3), bnMulDiv([solacePerSecond, 3, 20], [9]), PRECISION);
      let balances2 = await getBalances();
      expect(balances1).deep.eq(balances2);
      // 30 blocks
      await provider.send("evm_setNextBlockTimestamp", [startTime + 30]);
      await stakingRewards.connect(user3).harvestLock(1);
      await checkConsistency();
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expectClose(await stakingRewards.pendingRewardsOfLock(2), bnMulDiv([solacePerSecond, 5, 30], [9]), PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(3), bnMulDiv([solacePerSecond, 3, 30], [9]), PRECISION);
      let balances3 = await getBalances();
      let balances23 = getBalancesDiff(balances3, balances2);
      expectClose(balances23.user1Solace, bnMulDiv([solacePerSecond, 1, 30], [9]), PRECISION);
      // 50 blocks
      await provider.send("evm_setNextBlockTimestamp", [startTime + 50]);
      await stakingRewards.connect(user3).harvestUser(user1.address);
      await checkConsistency();
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expectClose(await stakingRewards.pendingRewardsOfLock(3), bnMulDiv([solacePerSecond, 3, 50], [9]), PRECISION);
      let balances4 = await getBalances();
      let balances34 = getBalancesDiff(balances4, balances3);
      let expectedRewards34 = bnMulDiv([solacePerSecond, 1, 20], [9]).add(bnMulDiv([solacePerSecond, 5, 50], [9]));
      expectClose(balances34.user1Solace, expectedRewards34, PRECISION);
      // next 11 years
      for(var i = 1; i <= 11; ++i) {
        await provider.send("evm_setNextBlockTimestamp", [startTime + ONE_YEAR*i]);
        await stakingRewards.connect(user3).harvestLock(1);
        await stakingRewards.connect(user3).harvestLock(2);
        await stakingRewards.connect(user3).harvestLock(3);
        await checkConsistency();
      }
    });
    it("after end", async function () {
      await stakingRewards.connect(user3).harvestUser(user1.address);
      await stakingRewards.connect(user3).harvestLock(3);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
      await checkConsistency();
      let block = await provider.getBlock('latest');
      await provider.send("evm_setNextBlockTimestamp", [startTime + block.timestamp+ONE_YEAR]);
      await provider.send("evm_mine", []);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
    });
    after(async function () {
      await xslocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("rewards withholding solace", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      let block = await provider.getBlock('latest');
      startTime = block.timestamp + 10;
      endTime = block.timestamp + ONE_YEAR*10;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await solace.connect(user1).approve(xslocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xslocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xslocker.address, constants.MaxUint256);
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xslocker.address, startTime, endTime, solacePerSecond])) as StakingRewards;
      await xslocker.connect(governor).addXsLockListener(stakingRewards.address);
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER, 0); // xsLockID 1 value 1
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), block.timestamp+ONE_YEAR*4); // xsLockID 2 value 5
      await xslocker.connect(user2).createLock(user2.address, ONE_ETHER.mul(3), 0); // xsLockID 3 value 3
    });
    it("before start", async function () {
      await checkConsistency();
    });
    it("after start", async function () {
      let balances1 = await getBalances();
      // 20 blocks
      await provider.send("evm_setNextBlockTimestamp", [startTime + 20]);
      await provider.send("evm_mine", []);
      await checkConsistency();
      expectClose(await stakingRewards.pendingRewardsOfLock(1), bnMulDiv([solacePerSecond, 1, 20], [9]), PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(2), bnMulDiv([solacePerSecond, 5, 20], [9]), PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(3), bnMulDiv([solacePerSecond, 3, 20], [9]), PRECISION);
      let balances2 = await getBalances();
      expect(balances1).deep.eq(balances2);
      // 30 blocks
      await provider.send("evm_setNextBlockTimestamp", [startTime + 30]);
      await stakingRewards.connect(user3).harvestLock(1);
      await checkConsistency();
      expectClose(await stakingRewards.pendingRewardsOfLock(1), bnMulDiv([solacePerSecond, 1, 30], [9]), PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(2), bnMulDiv([solacePerSecond, 5, 30], [9]), PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(3), bnMulDiv([solacePerSecond, 3, 30], [9]), PRECISION);
      let balances3 = await getBalances();
      expect(balances2).deep.eq(balances3);
      // 50 blocks
      await provider.send("evm_setNextBlockTimestamp", [startTime + 50]);
      await stakingRewards.connect(user3).harvestUser(user1.address);
      await checkConsistency();
      expectClose(await stakingRewards.pendingRewardsOfLock(1), bnMulDiv([solacePerSecond, 1, 50], [9]), PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(2), bnMulDiv([solacePerSecond, 5, 50], [9]), PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(3), bnMulDiv([solacePerSecond, 3, 50], [9]), PRECISION);
      let balances4 = await getBalances();
      expect(balances3).deep.eq(balances4);
      // next 11 years
      for(var i = 1; i <= 11; ++i) {
        await provider.send("evm_setNextBlockTimestamp", [startTime + ONE_YEAR*i]);
        await stakingRewards.connect(user3).harvestLock(1);
        await stakingRewards.connect(user3).harvestLock(2);
        await stakingRewards.connect(user3).harvestLock(3);
        await checkConsistency();
      }
    });
    it("after end", async function () {
      await stakingRewards.connect(user3).harvestUser(user1.address);
      await stakingRewards.connect(user3).harvestLock(3);
      await checkConsistency();
      let pru1 = await stakingRewards.pendingRewardsOfUser(user1.address);
      let pru2 = await stakingRewards.pendingRewardsOfUser(user2.address);
      let prl1 = await stakingRewards.pendingRewardsOfLock(1);
      let prl2 = await stakingRewards.pendingRewardsOfLock(2);
      let prl3 = await stakingRewards.pendingRewardsOfLock(3);
      let block = await provider.getBlock('latest');
      await provider.send("evm_setNextBlockTimestamp", [startTime + block.timestamp+ONE_YEAR]);
      await provider.send("evm_mine", []);
      expect(await stakingRewards.pendingRewardsOfUser(user1.address)).eq(pru1);
      expect(await stakingRewards.pendingRewardsOfUser(user2.address)).eq(pru2);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(prl1);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(prl2);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(prl3);
      let balances1 = await getBalances();
      // now with solace
      await solace.connect(governor).mint(stakingRewards.address, ONE_ETHER.mul(1000000000));
      await stakingRewards.connect(user3).harvestUser(user1.address);
      await stakingRewards.connect(user3).harvestLock(3);
      await checkConsistency();
      let balances2 = await getBalances();
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.user1Solace).eq(pru1)
      expect(balancesDiff.user2Solace).eq(pru2)
      expect(await stakingRewards.pendingRewardsOfUser(user1.address)).eq(0);
      expect(await stakingRewards.pendingRewardsOfUser(user2.address)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
    });
    after(async function () {
      await xslocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("lock value over time", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      let block = await provider.getBlock('latest');
      startTime = block.timestamp + 10;
      endTime = block.timestamp + ONE_YEAR*10;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await solace.connect(user1).approve(xslocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xslocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xslocker.address, constants.MaxUint256);
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xslocker.address, startTime, endTime, solacePerSecond])) as StakingRewards;
      await xslocker.connect(governor).addXsLockListener(stakingRewards.address);
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(10), block.timestamp+ONE_YEAR*4); // xsLockID 1
    });
    it("decreases over time but only after harvest", async function () {
      // y = (3x/8 + 1)*amount
      let block = await provider.getBlock('latest');
      // 4 years left
      let value1 = (await stakingRewards.stakedLockInfo(1)).value;
      expectClose(value1, ONE_ETHER.mul(25), PRECISION);
      // 3 years left, no harvest
      await provider.send("evm_setNextBlockTimestamp", [block.timestamp+ONE_YEAR*1]);
      await provider.send("evm_mine", []);
      let value2 = (await stakingRewards.stakedLockInfo(1)).value;
      expect(value2).eq(value1);
      // 3 years left, harvest
      await stakingRewards.connect(user1).harvestLock(1);
      let value3 = (await stakingRewards.stakedLockInfo(1)).value;
      expectClose(value3, bnMulDiv([ONE_ETHER, 10, 17], [8]), PRECISION);
      // no time left, no harvest
      await provider.send("evm_setNextBlockTimestamp", [block.timestamp+ONE_YEAR*4]);
      await provider.send("evm_mine", []);
      let value4 = (await stakingRewards.stakedLockInfo(1)).value;
      expect(value4).eq(value3);
      // no time left, harvest
      await stakingRewards.connect(user1).harvestLock(1);
      let value5 = (await stakingRewards.stakedLockInfo(1)).value;
      expect(value5).eq(ONE_ETHER.mul(10));
    });
  });

  describe("set rewards", function () {
    it("cannot be set by non governance", async function () {
      await expect(stakingRewards.connect(user1).setRewards(constants.MaxUint256)).to.be.revertedWith("!governance");
    });
    it("can be set by governance", async function () {
      let tx = await stakingRewards.connect(governor).setRewards(123);
      await expect(tx).to.emit(stakingRewards, "RewardsSet").withArgs(123);
      expect(await stakingRewards.rewardPerSecond()).eq(123);
    });
  });

  describe("set end", function () {
    it("cannot be set by non governance", async function () {
      await expect(stakingRewards.connect(user1).setEnd(constants.MaxUint256)).to.be.revertedWith("!governance");
    });
    it("can be set by governance", async function () {
      let tx = await stakingRewards.connect(governor).setEnd(456);
      await expect(tx).to.emit(stakingRewards, "FarmEndSet").withArgs(456);
      expect(await stakingRewards.endTime()).eq(456);
    });
  });

  describe("rescue tokens", function () {
    before(async function () {
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xslocker.address, 1, 2, solacePerSecond])) as StakingRewards;
    });
    it("cannot be called by non governance", async function () {
      await expect(stakingRewards.connect(user1).rescueTokens(solace.address, constants.MaxUint256, user1.address)).to.be.revertedWith("!governance");
    });
    it("cannot rescue nonexistent tokens", async function () {
      await solace.connect(governor).mint(stakingRewards.address, 10);
      await expect(stakingRewards.connect(governor).rescueTokens(solace.address, 11, user1.address)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("can be called by governance", async function () {
      let balances1 = await getBalances();
      await stakingRewards.connect(governor).rescueTokens(solace.address, 7, user1.address);
      let balances2 = await getBalances();
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.rewardableSolace).eq(-7);
      expect(balancesDiff.user1Solace).eq(7);
    });
  });

  // tests each lock is close to predicted value
  // global valueStaked is the sum of lock values
  // each user's pendingRewards is the sum of their lock pendingRewards
  // check owner match
  async function checkConsistency() {
    let predUserPendingRewards = new Map<string, BN>();
    let predValueStaked = BN.from(0);
    let xslockerTotalSupply = (await xslocker.totalSupply()).toNumber();
    for(let i = 0; i < xslockerTotalSupply; ++i) {
      let xsLockID = await xslocker.tokenByIndex(i);
      let lockInfo = await stakingRewards.stakedLockInfo(xsLockID);
      let realValue = lockInfo.value;
      let predValue = await predictValueOfLock(xsLockID);
      expectClose(realValue, predValue, PRECISION);
      predValueStaked = predValueStaked.add(realValue);
      //let owner = await xslocker.ownerOf(xsLockID);
      let owner2 = lockInfo.owner;
      //expect(owner).eq(owner2);
      let pendingRewards = await stakingRewards.pendingRewardsOfLock(xsLockID);
      if(!predUserPendingRewards.has(owner2)) predUserPendingRewards.set(owner2, BN.from(0));
      let predBalance = predUserPendingRewards.get(owner2) ?? BN.from(0);
      predUserPendingRewards.set(owner2, predBalance.add(pendingRewards));
    }
    let realValueStaked = await stakingRewards.valueStaked();
    expect(realValueStaked).eq(predValueStaked);
    let users = predUserPendingRewards.keys();
    for(var i = 0; i < predUserPendingRewards.size; ++i) {
      let user = users.next().value;
      let realPendingRewards = await stakingRewards.pendingRewardsOfUser(user);
      let predPendingRewards = predUserPendingRewards.get(user);
      expect(realPendingRewards).eq(predPendingRewards);
    }
  }

  async function predictValueOfLock(xsLockID: BigNumberish) {
    let exists = await xslocker.exists(xsLockID);
    if(!exists) {
      return -1;
    }
    let block = await provider.getBlock('latest');
    let lock = await xslocker.locks(xsLockID);
    let base = lock.amount.mul(UNLOCKED_MULTIPLIER_BPS).div(MAX_BPS);
    let bonus = (lock.end.lte(block.timestamp))
      ? 0 // unlocked
      : lock.amount.mul(lock.end.toNumber() - block.timestamp).mul(MAX_LOCK_MULTIPLIER_BPS - UNLOCKED_MULTIPLIER_BPS).div(MAX_LOCK_DURATION * MAX_BPS); // locked
    let expectedAmount = base.add(bonus);
    return expectedAmount;
  }

  interface Balances {
    user1Solace: BN;
    user1StakedSolace: BN;
    user2Solace: BN;
    user2StakedSolace: BN;
    user3Solace: BN;
    user3StakedSolace: BN;
    totalStakedSolace: BN;
    rewardableSolace: BN;
  }

  async function getBalances(): Promise<Balances> {
    return {
      user1Solace: await solace.balanceOf(user1.address),
      user1StakedSolace: await xslocker.stakedBalance(user1.address),
      user2Solace: await solace.balanceOf(user2.address),
      user2StakedSolace: await xslocker.stakedBalance(user2.address),
      user3Solace: await solace.balanceOf(user3.address),
      user3StakedSolace: await xslocker.stakedBalance(user3.address),
      totalStakedSolace: await solace.balanceOf(xslocker.address),
      rewardableSolace: await solace.balanceOf(stakingRewards.address),
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      user1Solace: balances1.user1Solace.sub(balances2.user1Solace),
      user1StakedSolace: balances1.user1StakedSolace.sub(balances2.user1StakedSolace),
      user2Solace: balances1.user2Solace.sub(balances2.user2Solace),
      user2StakedSolace: balances1.user2StakedSolace.sub(balances2.user2StakedSolace),
      user3Solace: balances1.user3Solace.sub(balances2.user3Solace),
      user3StakedSolace: balances1.user3StakedSolace.sub(balances2.user3StakedSolace),
      totalStakedSolace: balances1.totalStakedSolace.sub(balances2.totalStakedSolace),
      rewardableSolace: balances1.rewardableSolace.sub(balances2.rewardableSolace)
    };
  }
});
