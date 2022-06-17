import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet, utils } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { Solace, XsLocker, StakingRewards, StakingRewardsV2, Registry, Scp, CoverPaymentManager, BlockGetter } from "../../typechain";
import { bnAddSub, bnMulDiv, expectClose } from "../utilities/math";
import { expectDeployed } from "../utilities/expectDeployed";
import { assembleSignature, getPriceDataDigest, sign } from "../utilities/signature";

// contracts
let registry: Registry;
let solace: Solace;
let xsLocker: XsLocker;
let stakingRewards: StakingRewardsV2;
let scp: Scp;
let coverPaymentManager: CoverPaymentManager;
let blockGetter: BlockGetter;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_YEAR = 31536000; // in seconds
const ONE_WEEK = 604800; // in seconds
const Q12 = BN.from(10).pow(12);
const PRECISION = BN.from(10).pow(13);
const REWARD_DEBT_PRECISION = BN.from(10).pow(30);

const MAX_LOCK_DURATION = 126144000; // 60*60*24*365*4 = 4 years in seconds
const MAX_LOCK_MULTIPLIER_BPS = 25000;  // 2.5X
const UNLOCKED_MULTIPLIER_BPS = 10000; // 1X
const MAX_BPS = 10000;

const solacePerYear = BN.from("10000000000000000000000000"); // 10M/yr
const solacePerSecond = BN.from("317097919837645865");

describe("StakingRewardsV2", function () {
  const [deployer, governor, user1, user2, user3, premiumPool] = provider.getWallets();
  let artifacts: ArtifactImports;
  let snapshot: BN;

  before(async function () {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    blockGetter = (await deployContract(deployer, artifacts.BlockGetter)) as BlockGetter;

    // deploy registry
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    await registry.connect(governor).set(["premiumPool"], [premiumPool.address]);

    // deploy scp
    scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
    await registry.connect(governor).set(["scp"], [scp.address])

    // deploy solace
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    await registry.connect(governor).set(["solace"], [solace.address])
    await solace.connect(governor).addMinter(governor.address);

    // deploy xslocker
    xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
    await registry.connect(governor).set(["xsLocker"], [xsLocker.address])

    // deploy coverPaymentManager
    coverPaymentManager = (await deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])) as CoverPaymentManager;
    await registry.connect(governor).set(["coverPaymentManager"], [coverPaymentManager.address])

    await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
    await solace.connect(governor).mint(user2.address, ONE_ETHER.mul(100));
    await solace.connect(governor).mint(user3.address, ONE_ETHER.mul(100));
    await solace.connect(user1).approve(xsLocker.address, constants.MaxUint256);
    await solace.connect(user2).approve(xsLocker.address, constants.MaxUint256);
    await solace.connect(user3).approve(xsLocker.address, constants.MaxUint256);
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    let mockRegistry: Registry;

    before(async function () {
      mockRegistry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    });

    it("reverts if zero governance", async function () {
      await expect(deployContract(deployer, artifacts.StakingRewardsV2, [ZERO_ADDRESS, registry.address])).to.be.revertedWith("zero address governance");
    });

    it("reverts if zero address registry", async function () {
      await expect(deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address registry");
    });

    it("reverts if zero address payment manager", async function () {
      await expect(deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, mockRegistry.address])).to.be.revertedWith("zero address payment manager");
    });

    it("reverts if zero solace", async function () {
      await mockRegistry.connect(governor).set(["coverPaymentManager"], [coverPaymentManager.address]);
      await expect(deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, mockRegistry.address])).to.be.revertedWith("zero address solace");
    });

    it("reverts if zero xslocker", async function () {
      await mockRegistry.connect(governor).set(["solace"], [solace.address]);
      await expect(deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, mockRegistry.address])).to.be.revertedWith("zero address xslocker");
    });

    it("deploys", async function () {
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await expectDeployed(stakingRewards.address);
    });

    it("initializes properly", async function () {
      expect(await stakingRewards.MAX_LOCK_DURATION()).eq(MAX_LOCK_DURATION);
      expect(await stakingRewards.MAX_LOCK_MULTIPLIER_BPS()).eq(MAX_LOCK_MULTIPLIER_BPS);
      expect(await stakingRewards.UNLOCKED_MULTIPLIER_BPS()).eq(UNLOCKED_MULTIPLIER_BPS);
      expect(await stakingRewards.registry()).eq(registry.address);
      expect(await stakingRewards.coverPaymentManager()).eq(coverPaymentManager.address);
      expect(await stakingRewards.solace()).eq(solace.address);
      expect(await stakingRewards.xsLocker()).eq(xsLocker.address);
      expect(await stakingRewards.rewardPerSecond()).eq(0);
      expect(await stakingRewards.startTime()).eq(0);
      expect(await stakingRewards.endTime()).eq(0);
      expect(await stakingRewards.lastRewardTime()).eq(0);
      expect(await stakingRewards.accRewardPerShare()).eq(0);
      expect(await stakingRewards.valueStaked()).eq(0);
      //expect(await stakingRewards.ownerOf(0)).eq(ZERO_ADDRESS);
      let lockInfo = await stakingRewards.stakedLockInfo(0);
      expect(lockInfo.value).eq(0);
      expect(lockInfo.rewardDebt).eq(0);
      expect(lockInfo.unpaidRewards).eq(0);
      expect(lockInfo.owner).eq(ZERO_ADDRESS);
      expect(await stakingRewards.pendingRewardsOfLock(0)).eq(0);
    });
  });

  describe("listener", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp;
      endTime = timestamp + 200;
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      await solace.connect(governor).mint(stakingRewards.address, ONE_ETHER.mul(1000000));
    });

    it("does not hear updates when not registered", async function () {
      let xsLockID = 1;
      let tx1 = await xsLocker.connect(user1).createLock(user1.address, 1, 0);
      await expect(tx1).to.not.emit(stakingRewards, "Updated");
      await expect(tx1).to.not.emit(stakingRewards, "LockUpdated");
      let tx2 = await xsLocker.connect(user1).increaseAmount(xsLockID, 1);
      await expect(tx2).to.not.emit(stakingRewards, "Updated");
      await expect(tx2).to.not.emit(stakingRewards, "LockUpdated");
      let tx3 = await xsLocker.connect(user1).extendLock(xsLockID, 1);
      await expect(tx3).to.not.emit(stakingRewards, "Updated");
      await expect(tx3).to.not.emit(stakingRewards, "LockUpdated");
      let tx4 = await xsLocker.connect(user1).withdraw(xsLockID, user1.address);
      await expect(tx4).to.not.emit(stakingRewards, "Updated");
      await expect(tx4).to.not.emit(stakingRewards, "LockUpdated");
    });

    it("hears updates when registered", async function () {
      await xsLocker.connect(governor).addXsLockListener(stakingRewards.address);
      let xsLockID = 2;
      let tx1 = await xsLocker.connect(user1).createLock(user1.address, 1, 0);
      await expect(tx1).to.emit(stakingRewards, "Updated");
      await expect(tx1).to.emit(stakingRewards, "LockUpdated").withArgs(xsLockID);
      let tx2 = await xsLocker.connect(user1).increaseAmount(xsLockID, 1);
      await expect(tx2).to.emit(stakingRewards, "Updated");
      await expect(tx2).to.emit(stakingRewards, "LockUpdated").withArgs(xsLockID);
      let tx3 = await xsLocker.connect(user1).extendLock(xsLockID, 1);
      await expect(tx3).to.emit(stakingRewards, "Updated");
      await expect(tx3).to.emit(stakingRewards, "LockUpdated").withArgs(xsLockID);
      let tx4 = await xsLocker.connect(user1).withdraw(xsLockID, user1.address);
      await expect(tx4).to.emit(stakingRewards, "Updated");
      await expect(tx4).to.emit(stakingRewards, "LockUpdated").withArgs(xsLockID);
      // many
      await xsLocker.connect(user1).createLock(user1.address, 1, 0);
      await xsLocker.connect(user1).createLock(user1.address, 1, 0);
      let tx5 = await xsLocker.connect(user1).withdrawMany([3, 4], user1.address);
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
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0);
      let info2 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info2.value).eq(ONE_ETHER);
      let accRewardPerShare = await stakingRewards.accRewardPerShare();
      expect(info2.rewardDebt).eq(ONE_ETHER.mul(accRewardPerShare).div(Q12));
      expect(info2.unpaidRewards).eq(0);
      expect(info2.owner).eq(user1.address);
      // increase amount
      await xsLocker.connect(user1).increaseAmount(xsLockID, ONE_ETHER.mul(3));
      let info3 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info3.value).eq(ONE_ETHER.mul(4));
      accRewardPerShare = await stakingRewards.accRewardPerShare();
      expect(info3.rewardDebt).eq(ONE_ETHER.mul(4).mul(accRewardPerShare).div(Q12));
      expect(info3.unpaidRewards).eq(0);
      expect(info3.owner).eq(user1.address);
      // extend to another time in past
      await xsLocker.connect(user1).extendLock(xsLockID, 12345);
      let info4 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info4.value).eq(ONE_ETHER.mul(4));
      accRewardPerShare = await stakingRewards.accRewardPerShare();
      expect(info4.rewardDebt).eq(ONE_ETHER.mul(4).mul(accRewardPerShare).div(Q12));
      expect(info4.unpaidRewards).eq(0);
      expect(info4.owner).eq(user1.address);
      // extend to future
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      let end = timestamp+ONE_YEAR*4;
      await xsLocker.connect(user1).extendLock(xsLockID, end);
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
      await xsLocker.connect(user1).withdraw(xsLockID, user1.address);
      let info7 = await stakingRewards.stakedLockInfo(xsLockID);
      expect(info7.value).eq(0);
      accRewardPerShare = await stakingRewards.accRewardPerShare();
      expect(info7.rewardDebt).eq(0);
      expect(info7.unpaidRewards).eq(0);
      expect(info7.owner).eq(user1.address);
    });
  });

  describe("rewards outside start and end", function () {
    let startTime: number;
    let endTime: number;

    before(async function () {
      xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await registry.connect(governor).set(["xsLocker"], [xsLocker.address])

      await solace.connect(user1).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xsLocker.address, constants.MaxUint256);
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await solace.connect(governor).mint(stakingRewards.address, ONE_ETHER.mul(1000000000));
      await xsLocker.connect(governor).addXsLockListener(stakingRewards.address);
      await solace.connect(user1).approve(xsLocker.address, ONE_ETHER);
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0);
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      await provider.send("evm_setNextBlockTimestamp", [timestamp + 20]);
      await provider.send("evm_mine", []);
    });

    it("no times set", async function () {
      expect(await stakingRewards.pendingRewardsOfLock(0)).eq(0);
      expect(await stakingRewards.getRewardAmountDistributed(0, 0)).eq(0);
      let balances2 = await getBalances();
      await stakingRewards.connect(user1).harvestLock(1);
      let balances3 = await getBalances();
      expect(balances2).deep.eq(balances3);
      await stakingRewards.connect(user1).harvestLocks([1,2,3]);
      let balances4 = await getBalances();
      expect(balances2).deep.eq(balances4);
    });

    it("times set", async function () {
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 5;
      endTime = timestamp + 20;
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.getRewardAmountDistributed(0, startTime)).eq(0);
      expect(await stakingRewards.getRewardAmountDistributed(startTime, endTime)).eq(solacePerSecond.mul(15));
      let balances1 = await getBalances();
      await provider.send("evm_setNextBlockTimestamp", [timestamp + 10]);
      await provider.send("evm_mine", []);
      await checkConsistency();
      expectClose(await stakingRewards.pendingRewardsOfLock(1), solacePerSecond.mul(5), PRECISION);
      await stakingRewards.connect(user1).harvestLock(1);
      let balances2 = await getBalances();
      let balances12 = getBalancesDiff(balances2, balances1);
      expectClose(balances12.user1Solace, solacePerSecond.mul(6), PRECISION);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
    });

    it("time extended", async function () {
      endTime += 30;
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      expect(await stakingRewards.getRewardAmountDistributed(startTime, endTime)).eq(solacePerSecond.mul(45));
      let balances1 = await getBalances();
      await provider.send("evm_setNextBlockTimestamp", [endTime - 10]);
      await provider.send("evm_mine", []);
      await checkConsistency();
      expectClose(await stakingRewards.pendingRewardsOfLock(1), solacePerSecond.mul(29), PRECISION);
      await stakingRewards.connect(user1).harvestLock(1);
      let balances2 = await getBalances();
      let balances12 = getBalancesDiff(balances2, balances1);
      expectClose(balances12.user1Solace, solacePerSecond.mul(30), PRECISION);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
    });

    it("after end time", async function () {
      await provider.send("evm_setNextBlockTimestamp", [endTime + 10]);
      await provider.send("evm_mine", []);
      expectClose(await stakingRewards.pendingRewardsOfLock(1), solacePerSecond.mul(9), PRECISION);
      await checkConsistency();
      let balances1 = await getBalances();
      await stakingRewards.connect(user1).harvestLock(1);
      let balances2 = await getBalances();
      let balances12 = getBalancesDiff(balances2, balances1);
      expectClose(balances12.user1Solace, solacePerSecond.mul(9), PRECISION);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
    });

    after(async function () {
      await xsLocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("rewards before start no locks", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await registry.connect(governor).set(["xsLocker"], [xsLocker.address]);

      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 100;
      endTime = timestamp + 200;
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      await xsLocker.connect(governor).addXsLockListener(stakingRewards.address);
    });

    it("pending rewards are zero", async function () {
      expect(await stakingRewards.pendingRewardsOfLock(0)).eq(0);
    });

    it("rewards distributed is zero", async function () {
      expect(await stakingRewards.getRewardAmountDistributed(0, startTime)).eq(0);
    });

    it("harvest does nothing", async function () {
      let balances2 = await getBalances();
      await stakingRewards.connect(user1).harvestLock(1);
      let balances3 = await getBalances();
      expect(balances2).deep.eq(balances3);
      await stakingRewards.connect(user1).harvestLocks([1,2,3]);
      let balances4 = await getBalances();
      expect(balances2).deep.eq(balances4);
    });

    after(async function () {
      await xsLocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("rewards before start with locks", function () {
    let startTime: number;
    let endTime: number;
    let numLocks: BN;

    before(async function () {
      xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await registry.connect(governor).set(["xsLocker"], [xsLocker.address])

      await solace.connect(user1).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xsLocker.address, constants.MaxUint256);
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 100;
      endTime = timestamp + 200;
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await solace.connect(governor).mint(stakingRewards.address, ONE_ETHER.mul(1000000000));
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      await xsLocker.connect(governor).addXsLockListener(stakingRewards.address);
      numLocks = await xsLocker.totalNumLocks();
      await xsLocker.connect(user1).createLock(user1.address, 1, 0);
      await xsLocker.connect(user1).createLock(user1.address, 2, 0);
    });

    it("pending rewards are zero", async function () {
      expect(await stakingRewards.pendingRewardsOfLock(numLocks.add(1))).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(numLocks.add(2))).eq(0);
    });

    it("rewards distributed is zero", async function () {
      expect(await stakingRewards.getRewardAmountDistributed(0, startTime)).eq(0);
    });

    it("harvest does nothing", async function () {
      let balances2 = await getBalances();
      await stakingRewards.connect(user1).harvestLock(numLocks.add(1));
      let balances3 = await getBalances();
      expect(balances2).deep.eq(balances3);
      await stakingRewards.connect(user1).harvestLocks([numLocks.add(1), numLocks.add(2), 999]);
      let balances4 = await getBalances();
      expect(balances2).deep.eq(balances4);
    });

    after(async function () {
      await xsLocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("rewards", function () {
    let startTime: number;
    let endTime: number;

    before(async function () {
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 30;
      endTime = timestamp + ONE_YEAR*10;
      xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await registry.connect(governor).set(["xsLocker"], [xsLocker.address]);

      await solace.connect(user1).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xsLocker.address, constants.MaxUint256);
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      await xsLocker.connect(governor).addXsLockListener(stakingRewards.address);
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0, {gasLimit: 600000}); // xsLockID 1 value 1
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_YEAR*4, {gasLimit: 600000}); // xsLockID 2 value 5
      await xsLocker.connect(user2).createLock(user2.address, ONE_ETHER.mul(3), 0, {gasLimit: 600000}); // xsLockID 3 value 3
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
      await stakingRewards.connect(user3).harvestLocks([1,2]);
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
      await stakingRewards.connect(user3).harvestLocks([1,2]);
      await stakingRewards.connect(user3).harvestLock(3);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
      await checkConsistency();
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      await provider.send("evm_setNextBlockTimestamp", [startTime + timestamp+ONE_YEAR]);
      await provider.send("evm_mine", []);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
    });

    after(async function () {
      await xsLocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("rewards withholding solace", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 30;
      endTime = timestamp + ONE_YEAR*10;
      xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await registry.connect(governor).set(["xsLocker"], [xsLocker.address]);

      await solace.connect(user1).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xsLocker.address, constants.MaxUint256);
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      await xsLocker.connect(governor).addXsLockListener(stakingRewards.address);
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0, {gasLimit: 600000}); // xsLockID 1 value 1
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_YEAR*4, {gasLimit: 600000}); // xsLockID 2 value 5
      await xsLocker.connect(user2).createLock(user2.address, ONE_ETHER.mul(3), 0, {gasLimit: 600000}); // xsLockID 3 value 3
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
      await stakingRewards.connect(user3).harvestLocks([1,2]);
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
      await stakingRewards.connect(user3).harvestLocks([1,2]);
      await stakingRewards.connect(user3).harvestLock(3);
      await checkConsistency();
      let prl1 = await stakingRewards.pendingRewardsOfLock(1);
      let prl2 = await stakingRewards.pendingRewardsOfLock(2);
      let prl3 = await stakingRewards.pendingRewardsOfLock(3);
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      await provider.send("evm_setNextBlockTimestamp", [startTime + timestamp+ONE_YEAR]);
      await provider.send("evm_mine", []);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(prl1);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(prl2);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(prl3);
      // now with solace
      await solace.connect(governor).mint(stakingRewards.address, ONE_ETHER.mul(1000000000));
      await stakingRewards.connect(user3).harvestLocks([1,2]);
      await stakingRewards.connect(user3).harvestLock(3);
      await checkConsistency();
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
    });

    after(async function () {
      await xsLocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("lock value over time", function () {
    let startTime: number;
    let endTime: number;
    before(async function () {
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 10;
      endTime = timestamp + ONE_YEAR*10;
      xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await registry.connect(governor).set(["xsLocker"], [xsLocker.address]);

      await solace.connect(user1).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xsLocker.address, constants.MaxUint256);
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      await xsLocker.connect(governor).addXsLockListener(stakingRewards.address);
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(10), timestamp+ONE_YEAR*4, {gasLimit: 600000}); // xsLockID 1
    });

    it("decreases over time but after harvest", async function () {
      // y = (3x/8 + 1)*amount
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      // 4 years left
      let value1 = (await stakingRewards.stakedLockInfo(1)).value;
      expectClose(value1, ONE_ETHER.mul(25), PRECISION);
      // 3 years left, no harvest
      await provider.send("evm_setNextBlockTimestamp", [timestamp+ONE_YEAR*1]);
      await provider.send("evm_mine", []);
      let value2 = (await stakingRewards.stakedLockInfo(1)).value;
      expect(value2).eq(value1);
      // 3 years left, harvest
      await stakingRewards.connect(user1).harvestLock(1);
      let value3 = (await stakingRewards.stakedLockInfo(1)).value;
      expectClose(value3, bnMulDiv([ONE_ETHER, 10, 17], [8]), PRECISION);
      // no time left, no harvest
      await provider.send("evm_setNextBlockTimestamp", [timestamp+ONE_YEAR*4]);
      await provider.send("evm_mine", []);
      let value4 = (await stakingRewards.stakedLockInfo(1)).value;
      expect(value4).eq(value3);
      // no time left, harvest
      await stakingRewards.connect(user1).harvestLock(1);
      let value5 = (await stakingRewards.stakedLockInfo(1)).value;
      expect(value5).eq(ONE_ETHER.mul(10));
    });
  });

  describe("compound", function () {
    let startTime: number;
    let endTime: number;

    before(async function () {
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 30;
      endTime = timestamp + ONE_YEAR*10;
      xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await registry.connect(governor).set(["xsLocker"], [xsLocker.address]);

      await solace.connect(user1).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xsLocker.address, constants.MaxUint256);
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      await xsLocker.connect(governor).addXsLockListener(stakingRewards.address);
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0, {gasLimit: 600000}); // xsLockID 1 value 1
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_YEAR*4, {gasLimit: 600000}); // xsLockID 2 value 5
      await xsLocker.connect(user2).createLock(user2.address, ONE_ETHER.mul(3), 0, {gasLimit: 600000}); // xsLockID 3 value 3
      await solace.connect(governor).mint(stakingRewards.address, ONE_ETHER.mul(1000000000));
    });

    it("before start", async function () {
      await checkConsistency();
    });

    it("after start", async function () {
      let balances1 = await getBalances();
      let expectedRewards1 = BN.from(0);
      let expectedRewards2 = BN.from(0);
      let expectedRewards3 = BN.from(0);
      let lockAmount1 = (await stakingRewards.stakedLockInfo(1)).value;
      let lockAmount2 = (await stakingRewards.stakedLockInfo(2)).value;
      let lockAmount3 = (await stakingRewards.stakedLockInfo(3)).value;
      let lockAmountSum = bnAddSub([lockAmount1, lockAmount2, lockAmount3]);
      // 20 blocks
      await provider.send("evm_setNextBlockTimestamp", [startTime + 20]);
      await provider.send("evm_mine", []);
      await checkConsistency();
      expectedRewards1 = expectedRewards1.add(bnMulDiv([solacePerSecond, lockAmount1, 20], [lockAmountSum]));
      expectedRewards2 = expectedRewards2.add(bnMulDiv([solacePerSecond, lockAmount2, 20], [lockAmountSum]));
      expectedRewards3 = expectedRewards3.add(bnMulDiv([solacePerSecond, lockAmount3, 20], [lockAmountSum]));
      expectClose(await stakingRewards.pendingRewardsOfLock(1), expectedRewards1, PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(2), expectedRewards2, PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(3), expectedRewards3, PRECISION);
      let balances2 = await getBalances();
      expect(balances1).deep.eq(balances2);
      let lock11 = await xsLocker.locks(1);
      // 30 blocks
      await provider.send("evm_setNextBlockTimestamp", [startTime + 30]);
      await stakingRewards.connect(user1).compoundLock(1);
      await checkConsistency();
      expectedRewards1 = BN.from(0);
      expectedRewards2 = expectedRewards2.add(bnMulDiv([solacePerSecond, lockAmount2, 10], [lockAmountSum]));
      expectedRewards3 = expectedRewards3.add(bnMulDiv([solacePerSecond, lockAmount3, 10], [lockAmountSum]));
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(expectedRewards1);
      expectClose(await stakingRewards.pendingRewardsOfLock(2), expectedRewards2, PRECISION);
      expectClose(await stakingRewards.pendingRewardsOfLock(3), expectedRewards3, PRECISION);
      let balances3 = await getBalances();
      let balances23 = getBalancesDiff(balances3, balances2);
      expect(balances23.user1Solace).eq(0);
      let lock12 = await xsLocker.locks(1);
      expectClose(lock12.amount.sub(lock11.amount), bnMulDiv([solacePerSecond, 1, 30], [9]), PRECISION);
      // 50 blocks
      lockAmount1 = (await stakingRewards.stakedLockInfo(1)).value;
      lockAmount2 = (await stakingRewards.stakedLockInfo(2)).value;
      lockAmount3 = (await stakingRewards.stakedLockInfo(3)).value;
      await provider.send("evm_setNextBlockTimestamp", [startTime + 50]);
      await stakingRewards.connect(user1).compoundLocks([1,2], 1);
      await checkConsistency();
      lockAmountSum = bnAddSub([lockAmount1, lockAmount2, lockAmount3]);
      expectedRewards1 = expectedRewards1.add(bnMulDiv([solacePerSecond, lockAmount1, 20], [lockAmountSum]));
      expectedRewards2 = expectedRewards2.add(bnMulDiv([solacePerSecond, lockAmount2, 20], [lockAmountSum]))
      expectedRewards3 = expectedRewards3.add(bnMulDiv([solacePerSecond, lockAmount3, 20], [lockAmountSum]));
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expectClose(await stakingRewards.pendingRewardsOfLock(3), expectedRewards3, PRECISION);
      let balances4 = await getBalances();
      let balances34 = getBalancesDiff(balances4, balances3);
      //let expectedRewards34 = bnMulDiv([solacePerSecond, 1, 20], [9]).add(bnMulDiv([solacePerSecond, 5, 50], [9]));
      expect(balances34.user1Solace).eq(0);
      let lock13 = await xsLocker.locks(1);
      expectClose(lock13.amount.sub(lock12.amount), expectedRewards1.add(expectedRewards2), PRECISION);
      // next 11 years
      for(var i = 1; i <= 11; ++i) {
        await provider.send("evm_setNextBlockTimestamp", [startTime + ONE_YEAR*i]);
        await stakingRewards.connect(user1).compoundLock(1);
        await stakingRewards.connect(user1).compoundLock(2);
        await stakingRewards.connect(user2).compoundLock(3);
        await checkConsistency();
      }
    });

    it("after end", async function () {
      let lock11 = await xsLocker.locks(1);
      let lock21 = await xsLocker.locks(2);
      let lock31 = await xsLocker.locks(3);
      await stakingRewards.connect(user1).compoundLocks([1,2],1);
      await stakingRewards.connect(user2).compoundLock(3);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
      await checkConsistency();
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
      await stakingRewards.connect(user1).compoundLocks([1,2],1);
      await stakingRewards.connect(user2).compoundLock(3);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(2)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
      let lock12 = await xsLocker.locks(1);
      let lock22 = await xsLocker.locks(2);
      let lock32 = await xsLocker.locks(3);
      expect(lock11).deep.eq(lock12);
      expect(lock21).deep.eq(lock22);
      expect(lock31).deep.eq(lock32);
    });

    it("cannot compound not your lock", async function () {
      await stakingRewards.connect(governor).setTimes(startTime, endTime + ONE_YEAR*5);
      await expect(stakingRewards.connect(user1).compoundLock(3)).to.be.revertedWith("not owner");
      await expect(stakingRewards.connect(user1).compoundLock(999)).to.be.revertedWith("ERC721: owner query for nonexistent token");
      await expect(stakingRewards.connect(user1).compoundLocks([3], 3)).to.be.revertedWith("not owner");
      await expect(stakingRewards.connect(user1).compoundLocks([999], 999)).to.be.revertedWith("ERC721: owner query for nonexistent token");
      await expect(stakingRewards.connect(user1).compoundLocks([3], 999)).to.be.revertedWith("not owner");
      await expect(stakingRewards.connect(user1).compoundLocks([1], 999)).to.be.revertedWith("query for nonexistent token");
    });

    after(async function () {
      await xsLocker.connect(governor).removeXsLockListener(stakingRewards.address);
    });
  });

  describe("harvestForScp", async function() {
    let startTime: number;
    let endTime: number;
    const SOLACE_PRICE = ONE_ETHER.mul(3).div(100); // $0.03
    const DOMAIN_NAME = "Solace.fi-SolaceSigner";
    const TYPEHASH = utils.keccak256(utils.toUtf8Bytes("PriceData(address token,uint256 price,uint256 deadline)"));
    const CHAIN_ID = 31337;
    const DEADLINE = constants.MaxInt256;
    let priceSignature: string;

    before(async function() {
      // add price signer
      await coverPaymentManager.connect(governor).addSigner(governor.address);
      expect(await coverPaymentManager.connect(governor).isSigner(governor.address)).to.true;

      // sign price
      let digest = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, solace.address, SOLACE_PRICE, DEADLINE, TYPEHASH);
      priceSignature = assembleSignature(sign(digest, Buffer.from(governor.privateKey.slice(2), "hex")));

      // locks
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 30;
      endTime = timestamp + ONE_YEAR*10;
      xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await registry.connect(governor).set(["xsLocker"], [xsLocker.address]);

      await solace.connect(user1).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xsLocker.address, constants.MaxUint256);
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      await xsLocker.connect(governor).addXsLockListener(stakingRewards.address);
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0, {gasLimit: 600000}); // xsLockID 1 value 1
      await xsLocker.connect(user2).createLock(user2.address, ONE_ETHER.mul(2), 0, {gasLimit: 600000}); // xsLockID 2 value 2
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(3), 0, {gasLimit: 600000}); // xsLockID 3 value 3
      await solace.connect(governor).mint(stakingRewards.address, ONE_ETHER.mul(1000000000));

      await provider.send("evm_setNextBlockTimestamp", [startTime + 10000]);
      await provider.send("evm_mine", []);
    });

    it("cannot harvest for scp if solace not accepted", async function () {
      let tokenInfo1 = await coverPaymentManager.tokenInfo(solace.address);
      expect(tokenInfo1.accepted).to.be.false;
      await expect(stakingRewards.connect(user1).harvestLockForScp(1, SOLACE_PRICE, DEADLINE, priceSignature)).to.be.revertedWith("token not accepted");

      await coverPaymentManager.connect(governor).setTokenInfo([{'token': solace.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': false}]);
      let tokenInfo2 = await coverPaymentManager.tokenInfo(solace.address);
      expect(tokenInfo2.accepted).to.be.true;
    });

    it("cannot harvest for scp if payment manager is not scp mover", async function () {
      expect(await scp.isScpMover(coverPaymentManager.address)).to.be.false;
      await expect(stakingRewards.connect(user1).harvestLockForScp(1, SOLACE_PRICE, DEADLINE, priceSignature)).to.be.revertedWith("!scp mover");

      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address], [true]);
      expect(await scp.isScpMover(coverPaymentManager.address)).to.be.true;
    });

    it("cannot harvest non existant lock", async function () {
      await expect(stakingRewards.connect(user1).harvestLockForScp(999, SOLACE_PRICE, DEADLINE, priceSignature)).to.be.reverted;
    });

    it("cannot harvest someone elses lock", async function () {
      await expect(stakingRewards.connect(user1).harvestLockForScp(2, SOLACE_PRICE, DEADLINE, priceSignature)).to.be.revertedWith("not owner");
      await expect(stakingRewards.connect(user1).harvestLocksForScp([1,2], SOLACE_PRICE, DEADLINE, priceSignature)).to.be.revertedWith("not owner");
    });

    it("cannot harvest with invalid price signature", async function () {
      await expect(stakingRewards.connect(user1).harvestLockForScp(1, SOLACE_PRICE, DEADLINE, [])).to.be.reverted;
      await expect(stakingRewards.connect(user1).harvestLockForScp(1, SOLACE_PRICE, DEADLINE, "0x00")).to.be.reverted;
      await expect(stakingRewards.connect(user1).harvestLockForScp(1, SOLACE_PRICE, DEADLINE, "0x0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789")).to.be.reverted;
    });

    it("can harvest for scp", async function() {
      // 1. get pending rewards
      let pendingRewards = await stakingRewards.pendingRewardsOfLock(1);
      expect(pendingRewards).gt(0);
      let expectedRewards = pendingRewards.mul(3).div(100)

      // 2. harvest for scp (1 SOLACE == 0.03 SCP).
      await stakingRewards.connect(user1).harvestLockForScp(1, SOLACE_PRICE, DEADLINE, priceSignature);

      // 3. checks
      expectClose(await scp.balanceOf(user1.address), expectedRewards, BN.from(10).pow(17));
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
    });

    it("can harvest multiple", async function () {
      await provider.send("evm_setNextBlockTimestamp", [startTime + 11000]);
      await provider.send("evm_mine", []);
      let scpBal1 = await scp.balanceOf(user1.address);

      // 1. get pending rewards
      let pendingRewards1 = await stakingRewards.pendingRewardsOfLock(1);
      expect(pendingRewards1).gt(0);
      let pendingRewards3 = await stakingRewards.pendingRewardsOfLock(3);
      expect(pendingRewards3).gt(0);
      let pendingRewards = pendingRewards1.add(pendingRewards3);
      let expectedRewards = pendingRewards.mul(3).div(100);

      // 2. harvest for scp (1 SOLACE == 0.03 SCP).
      await stakingRewards.connect(user1).harvestLocksForScp([1,3], SOLACE_PRICE, DEADLINE, priceSignature);

      // 3. checks
      let scpBal2 = await scp.balanceOf(user1.address);
      let scpDiff = scpBal2.sub(scpBal1);
      expectClose(scpDiff, expectedRewards, BN.from(10).pow(17));
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
      expect(await stakingRewards.pendingRewardsOfLock(3)).eq(0);
    });

    it("can harvest for no rewards", async function () {
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp - 1;
      endTime = timestamp + 1;
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
      await provider.send("evm_setNextBlockTimestamp", [endTime + 10]);
      await provider.send("evm_mine", []);
      await stakingRewards.connect(user1).harvestLockForScp(1, SOLACE_PRICE, DEADLINE, priceSignature);
      let scpBal1 = await scp.balanceOf(user1.address);

      // 1. get pending rewards
      let pendingRewards = await stakingRewards.pendingRewardsOfLock(1);
      expect(pendingRewards).eq(0);
      let expectedRewards = pendingRewards.mul(3).div(100);

      // 2. harvest for scp (1 SOLACE == 0.03 SCP).
      await stakingRewards.connect(user1).harvestLockForScp(1, SOLACE_PRICE, DEADLINE, priceSignature);

      // 3. checks
      let scpBal2 = await scp.balanceOf(user1.address);
      let scpDiff = scpBal2.sub(scpBal1);
      expect(scpDiff).eq(expectedRewards);
      expect(await stakingRewards.pendingRewardsOfLock(1)).eq(0);
    })
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

  describe("set times", function () {
    it("cannot be set by non governance", async function () {
      await expect(stakingRewards.connect(user1).setTimes(0, constants.MaxUint256)).to.be.revertedWith("!governance");
    });
    it("cannot be set to invalid window", async function () {
      await expect(stakingRewards.connect(governor).setTimes(2, 1)).to.be.revertedWith("invalid window");
    });
    it("can be set by governance", async function () {
      let tx = await stakingRewards.connect(governor).setTimes(123, 456);
      await expect(tx).to.emit(stakingRewards, "FarmTimesSet").withArgs(123, 456);
      expect(await stakingRewards.startTime()).eq(123);
      expect(await stakingRewards.endTime()).eq(456);
    });
  });

  describe("set registry", function () {
    let registry2: Registry;
    let coverPaymentManager2: CoverPaymentManager;
    let solace2: Solace;
    let xsLocker2: XsLocker;

    before(async function () {
      registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await registry2.connect(governor).set(["scp", "premiumPool"], [scp.address, premiumPool.address]);
      // deploy solace
      solace2 = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      await solace2.connect(governor).addMinter(governor.address);
      // deploy xslocker
      xsLocker2 = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace2.address])) as unknown as XsLocker;
      // deploy coverPaymentManager
      coverPaymentManager2 = (await deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])) as CoverPaymentManager;
    });

    it("reverts if not governor", async function () {
      await expect(stakingRewards.connect(user1).setRegistry(registry2.address)).to.be.revertedWith("!governance");
    })

    it("reverts if zero address registry", async function () {
      await expect(stakingRewards.connect(governor).setRegistry(ZERO_ADDRESS)).to.be.revertedWith("zero address registry");
    });

    it("reverts if zero address payment manager", async function () {
      await expect(stakingRewards.connect(governor).setRegistry(registry2.address)).to.be.revertedWith("zero address payment manager");
      await registry2.connect(governor).set(["coverPaymentManager"], [coverPaymentManager2.address]);
    });

    it("reverts if zero solace", async function () {
      await expect(stakingRewards.connect(governor).setRegistry(registry2.address)).to.be.revertedWith("zero address solace");
      await registry2.connect(governor).set(["solace"], [solace2.address]);
    });

    it("reverts if zero xslocker", async function () {
      await expect(stakingRewards.connect(governor).setRegistry(registry2.address)).to.be.revertedWith("zero address xslocker");
      await registry2.connect(governor).set(["xsLocker"], [xsLocker2.address]);
    });

    it("sets registry", async function () {
      let tx = await stakingRewards.connect(governor).setRegistry(registry2.address);
      await expect(tx).to.emit(stakingRewards, "RegistrySet").withArgs(registry2.address);
    });

    it("registers properly", async function () {
      expect(await stakingRewards.registry()).eq(registry2.address);
      expect(await stakingRewards.coverPaymentManager()).eq(coverPaymentManager2.address);
      expect(await stakingRewards.solace()).eq(solace2.address);
      expect(await stakingRewards.xsLocker()).eq(xsLocker2.address);
      await stakingRewards.connect(governor).setRegistry(registry.address);
    });
  });

  describe("migrate", function () {
    let stakingRewardsV1: StakingRewards;
    let startTime: number;
    let endTime: number;
    before(async function () {
      // redeploy xslocker
      xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;
      await registry.connect(governor).set(["xsLocker"], [xsLocker.address]);
      await solace.connect(user1).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user2).approve(xsLocker.address, constants.MaxUint256);
      await solace.connect(user3).approve(xsLocker.address, constants.MaxUint256);

      // setup staking rewards v1
      let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 30;
      endTime = timestamp + 50;
      stakingRewardsV1 = (await deployContract(deployer, artifacts.StakingRewards, [governor.address, solace.address, xsLocker.address, solacePerSecond])) as StakingRewards;
      await stakingRewardsV1.connect(governor).setTimes(startTime, endTime);
      await solace.connect(governor).addMinter(governor.address);
      await solace.connect(governor).mint(stakingRewardsV1.address, solacePerSecond.mul(1000));

      // farm v1
      await xsLocker.connect(governor).addXsLockListener(stakingRewardsV1.address);
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0, {gasLimit: 600000}); // xsLockID 1 value 1
      await xsLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_YEAR*4, {gasLimit: 600000}); // xsLockID 2 value 5
      await xsLocker.connect(user2).createLock(user2.address, ONE_ETHER.mul(3), 0, {gasLimit: 600000}); // xsLockID 3 value 3
      await xsLocker.connect(user2).createLock(user2.address, ONE_ETHER.mul(4), 0, {gasLimit: 600000}); // xsLockID 4 value 4
      await xsLocker.connect(user2).createLock(user2.address, ONE_ETHER.mul(5), 0, {gasLimit: 600000}); // xsLockID 5 value 5

      // end staking rewards v1
      await provider.send("evm_setNextBlockTimestamp", [endTime + 10]);
      await provider.send("evm_mine", []);

      // setup staking rewards v2
      timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
      startTime = timestamp + 30;
      endTime = timestamp + 100;
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
      await stakingRewards.connect(governor).setTimes(startTime, endTime);
    });
    it("can rescue funds from v1", async function () {
      let bal1 = await solace.balanceOf(stakingRewardsV1.address);
      expect(await solace.balanceOf(stakingRewards.address)).eq(0);
      await stakingRewardsV1.connect(governor).rescueTokens(solace.address, bal1, stakingRewards.address);
      expect(await solace.balanceOf(stakingRewardsV1.address)).eq(0);
      let bal2 = await solace.balanceOf(stakingRewards.address);
      expect(bal2).eq(bal1);
    });
    it("migrate cannot be called by non governance", async function () {
      await expect(stakingRewards.connect(user1).migrate(stakingRewardsV1.address, [])).to.be.revertedWith("!governance");
    });
    it("can migrate none", async function () {
      let tx = await stakingRewards.connect(governor).migrate(stakingRewardsV1.address, []);
      await expect(tx).to.emit(stakingRewards, "Updated");
    });
    it("can migrate", async function () {
      let p11 = await stakingRewardsV1.pendingRewardsOfLock(1);
      let p12 = await stakingRewardsV1.pendingRewardsOfLock(2);
      let p13 = await stakingRewardsV1.pendingRewardsOfLock(3);
      expect(await stakingRewards.wasLockMigrated(1)).eq(false);
      expect(await stakingRewards.wasLockMigrated(2)).eq(false);
      expect(await stakingRewards.wasLockMigrated(3)).eq(false);
      let tx = await stakingRewards.connect(governor).migrate(stakingRewardsV1.address, [1,2]);
      await expect(tx).to.emit(stakingRewards, "LockUpdated").withArgs(1);
      await expect(tx).to.emit(stakingRewards, "LockUpdated").withArgs(2);
      let p21 = await stakingRewards.pendingRewardsOfLock(1);
      let p22 = await stakingRewards.pendingRewardsOfLock(2);
      let p23 = await stakingRewards.pendingRewardsOfLock(3);
      expect(p11).eq(p21);
      expect(p12).eq(p22);
      expect(p13).not.eq(p23);
      expect(await stakingRewards.wasLockMigrated(1)).eq(true);
      expect(await stakingRewards.wasLockMigrated(2)).eq(true);
      expect(await stakingRewards.wasLockMigrated(3)).eq(false);
    });
    it("will not migrate again", async function () {
      let tx = await stakingRewards.connect(governor).migrate(stakingRewardsV1.address, [1,2]);
      await expect(tx).to.not.emit(stakingRewards, "LockUpdated").withArgs(1);
      await expect(tx).to.not.emit(stakingRewards, "LockUpdated").withArgs(2);
    });
    it("can migrate mid stream", async function () {
      await stakingRewards.harvestLock(3);
      await stakingRewards.harvestLock(4);
      await stakingRewards.harvestLock(5);
      await provider.send("evm_setNextBlockTimestamp", [startTime + 10]);
      await provider.send("evm_mine", []);
      await xsLocker.connect(user2).withdraw(4, user2.address);
      await xsLocker.connect(user2).withdrawInPart(5, user2.address, ONE_ETHER);
      await provider.send("evm_setNextBlockTimestamp", [startTime + 20]);
      await provider.send("evm_mine", []);
      let p13 = await stakingRewardsV1.pendingRewardsOfLock(3);
      let p14 = await stakingRewardsV1.pendingRewardsOfLock(4);
      let p15 = await stakingRewardsV1.pendingRewardsOfLock(5);
      let p23 = await stakingRewards.pendingRewardsOfLock(3);
      let p24 = await stakingRewards.pendingRewardsOfLock(4);
      let p25 = await stakingRewards.pendingRewardsOfLock(5);
      let tx = await stakingRewards.connect(governor).migrate(stakingRewardsV1.address, [3, 4, 5]);
      await expect(tx).to.emit(stakingRewards, "LockUpdated").withArgs(3);
      await expect(tx).to.emit(stakingRewards, "LockUpdated").withArgs(4);
      await expect(tx).to.emit(stakingRewards, "LockUpdated").withArgs(5);
      let p33 = await stakingRewards.pendingRewardsOfLock(3);
      let p34 = await stakingRewards.pendingRewardsOfLock(4);
      let p35 = await stakingRewards.pendingRewardsOfLock(5);
      expectClose(p13.add(p23), p33, solacePerSecond);
      expectClose(p14.add(p24), p34, solacePerSecond);
      expectClose(p15.add(p25), p35, solacePerSecond);
      expect(await stakingRewards.wasLockMigrated(3)).eq(true);
      expect(await stakingRewards.wasLockMigrated(4)).eq(true);
      expect(await stakingRewards.wasLockMigrated(5)).eq(true);
    });
  });

  describe("rescue tokens", function () {
    before(async function () {
      stakingRewards = (await deployContract(deployer, artifacts.StakingRewardsV2, [governor.address, registry.address])) as StakingRewardsV2;
      await stakingRewards.connect(governor).setRewards(solacePerSecond);
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
    let xslockerTotalSupply = (await xsLocker.totalSupply()).toNumber();
    for(let i = 0; i < xslockerTotalSupply; ++i) {
      let xsLockID = await xsLocker.tokenByIndex(i);
      let lockInfo = await stakingRewards.stakedLockInfo(xsLockID);
      let realValue = lockInfo.value;
      let predValue = await predictValueOfLock(xsLockID);
      expectClose(realValue, predValue, ONE_ETHER);
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
      //let realPendingRewards = await stakingRewards.pendingRewardsOfUser(user);
      let realPendingRewards = await predictPendingRewardsOfUser(xsLocker, user);
      let predPendingRewards = predUserPendingRewards.get(user);
      expect(realPendingRewards).eq(predPendingRewards);
    }
  }

  async function predictPendingRewardsOfUser(xslocker: Contract, user: string) {
    let pendingRewards = BN.from(0);
    let numlocks = await xslocker.balanceOf(user);
    let indices = range(0, numlocks.toNumber());
    let xsLockIDs = await Promise.all(indices.map(async (index) => {
      return await xslocker.tokenOfOwnerByIndex(user, index);
    }));
    let rewards = await Promise.all(xsLockIDs.map(async (xsLockID) => {
      return await stakingRewards.pendingRewardsOfLock(xsLockID);
    }));
    rewards.forEach((reward) => {
      pendingRewards = pendingRewards.add(reward);
    });
    return pendingRewards;
  }

  function range(start: number, stop: number) {
    let arr = [];
    for(var i = start; i < stop; ++i) {
      arr.push(i);
    }
    return arr;
  }

  async function predictValueOfLock(xsLockID: BigNumberish) {
    let exists = await xsLocker.exists(xsLockID);
    if(!exists) {
      return -1;
    }
    let timestamp = (await blockGetter.getBlockTimestamp()).toNumber();
    let lock = await xsLocker.locks(xsLockID);
    let base = lock.amount.mul(UNLOCKED_MULTIPLIER_BPS).div(MAX_BPS);
    let bonus = (lock.end.lte(timestamp))
      ? 0 // unlocked
      : lock.amount.mul(lock.end.toNumber() - timestamp).mul(MAX_LOCK_MULTIPLIER_BPS - UNLOCKED_MULTIPLIER_BPS).div(MAX_LOCK_DURATION * MAX_BPS); // locked
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
      user1StakedSolace: await xsLocker.stakedBalance(user1.address),
      user2Solace: await solace.balanceOf(user2.address),
      user2StakedSolace: await xsLocker.stakedBalance(user2.address),
      user3Solace: await solace.balanceOf(user3.address),
      user3StakedSolace: await xsLocker.stakedBalance(user3.address),
      totalStakedSolace: await solace.balanceOf(xsLocker.address),
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
