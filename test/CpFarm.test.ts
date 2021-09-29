import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { burnBlocks, burnBlocksUntil } from "./utilities/time";
import { bnAddSub, bnMulDiv } from "./utilities/math";
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Vault, FarmController, OptionsFarming, Weth9, CpFarm, PolicyManager, RiskManager, Registry } from "../typechain";

// contracts
let solace: Solace;
let farmController: FarmController;
let vault: Vault;
let farm1: CpFarm;
let weth: Weth9;
let registry: Registry;
let policyManager: PolicyManager;
let riskManager: RiskManager;

// vars
let solacePerSecond = BN.from("100000000000000000000"); // 100 e18
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
const ONE_YEAR = 31536000; // in seconds
let timestamp: number;
let initTime: number;
let startTime: number;
let endTime: number;
let cpFarmType = 1;

const cpTokenName = "Solace CP Token";
const chainId = 31337;
const deadline = constants.MaxUint256;

describe("CpFarm", function () {
  const [deployer, governor, farmer1, farmer2, mockVault, liquidityProvider] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy solace contracts
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    await registry.connect(governor).setWeth(weth.address);
    vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
    await registry.connect(governor).setVault(vault.address);
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
    await registry.connect(governor).setPolicyManager(policyManager.address);
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
    await registry.connect(governor).setRiskManager(riskManager.address);
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    await registry.connect(governor).setSolace(solace.address);
    farmController = (await deployContract(deployer, artifacts.FarmController, [governor.address, solacePerSecond])) as FarmController;
    //await registry.connect(governor).setFarmController(farmController.address);
    // transfer tokens
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(farmController.address, ONE_MILLION_ETHER);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solace.connect(governor).mint(liquidityProvider.address, TEN_ETHER);
    await weth.connect(liquidityProvider).deposit({ value: TEN_ETHER });
  });

  describe("farm creation", function () {
    before(async function () {
      // get referrence timestamp
      await provider.send("evm_mine", []);
      initTime = (await provider.getBlock('latest')).timestamp;
      startTime = initTime;
      endTime = initTime + ONE_YEAR;
    });
    it("can create farms", async function () {
      farm1 = await createCpFarm(startTime, endTime);
    });
    it("returns farm information", async function () {
      expect(await farm1.farmController()).to.equal(farmController.address);
      expect(await farm1.vault()).to.equal(vault.address);
      expect(await farm1.farmType()).to.equal(cpFarmType);
      expect(await farm1.startTime()).to.equal(startTime);
      expect(await farm1.endTime()).to.equal(endTime);
      expect(await farm1.rewardPerSecond()).to.equal(0);
      expect(await farm1.valueStaked()).to.equal(0);
      expect(await farm1.lastRewardTime()).to.be.closeTo(BN.from(initTime), 5);
      expect(await farm1.accRewardPerShare()).to.equal(0);
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await farm1.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function () {
      await expect(farm1.connect(farmer1).setGovernance(farmer1.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function () {
      await farm1.connect(governor).setGovernance(deployer.address);
      expect(await farm1.governance()).to.equal(governor.address);
      expect(await farm1.newGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(farm1.connect(farmer1).acceptGovernance()).to.be.revertedWith("!governance");
    });
    it("can transfer governance", async function () {
      // set
      let tx = await farm1.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(farm1, "GovernanceTransferred").withArgs(deployer.address);
      expect(await farm1.governance()).to.equal(deployer.address);
      expect(await farm1.newGovernance()).to.equal(ZERO_ADDRESS);
      // reset
      await farm1.connect(deployer).setGovernance(governor.address);
      await farm1.connect(governor).acceptGovernance();
    });
  });

  describe("deposit and withdraw", function () {
    let balancesBefore: Balances, balancesAfter: Balances, balancesDiff: Balances;

    it("can deposit eth", async function () {
      // farmer 1, deposit 1 wei
      let depositAmount1 = BN.from(1);
      balancesBefore = await getBalances(farmer1, farm1);
      let tx1 = await farm1.connect(farmer1).depositEth({ value: depositAmount1 });
      await expect(tx1).to.emit(farm1, "EthDeposited").withArgs(farmer1.address, depositAmount1);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount1);
      expect(balancesDiff.farmCp).to.equal(depositAmount1);
      expect(balancesDiff.userStake).to.equal(depositAmount1);
      // farmer 2, deposit 4 wei
      let depositAmount2 = BN.from(4);
      balancesBefore = await getBalances(farmer2, farm1);
      let tx2 = await farm1.connect(farmer2).depositEth({ value: depositAmount2 });
      await expect(tx2).to.emit(farm1, "EthDeposited").withArgs(farmer2.address, depositAmount2);
      balancesAfter = await getBalances(farmer2, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount2);
      expect(balancesDiff.farmCp).to.equal(depositAmount2);
      expect(balancesDiff.userStake).to.equal(depositAmount2);
      // farmer 1, deposit 2 wei
      let depositAmount3 = BN.from(2);
      balancesBefore = await getBalances(farmer1, farm1);
      let tx3 = await farm1.connect(farmer1).depositEth({ value: depositAmount3 });
      await expect(tx3).to.emit(farm1, "EthDeposited").withArgs(farmer1.address, depositAmount3);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount3);
      expect(balancesDiff.farmCp).to.equal(depositAmount3);
      expect(balancesDiff.userStake).to.equal(depositAmount3);
    });
    it("can deposit eth via receive", async function () {
      let depositAmount4 = BN.from(48);
      balancesBefore = await getBalances(farmer2, farm1);
      let tx = await farmer2.sendTransaction({
        to: farm1.address,
        value: depositAmount4,
        data: "0x",
      });
      await expect(tx).to.emit(farm1, "EthDeposited").withArgs(farmer2.address, depositAmount4);
      balancesAfter = await getBalances(farmer2, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount4);
      expect(balancesDiff.farmCp).to.equal(depositAmount4);
      expect(balancesDiff.userStake).to.equal(depositAmount4);
    });
    it("can deposit eth via fallback", async function () {
      let depositAmount5 = BN.from(12345);
      balancesBefore = await getBalances(farmer2, farm1);
      let tx = await farmer2.sendTransaction({
        to: farm1.address,
        value: depositAmount5,
        data: "0xabcd",
      });
      await expect(tx).to.emit(farm1, "EthDeposited").withArgs(farmer2.address, depositAmount5);
      balancesAfter = await getBalances(farmer2, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount5);
      expect(balancesDiff.farmCp).to.equal(depositAmount5);
      expect(balancesDiff.userStake).to.equal(depositAmount5);
    });
    it("cannot deposit eth when lacking funds", async function () {
      let depositAmount = (await farmer1.getBalance()).add(1);
      // throws InvalidInputError before it can revert
      let error = false;
      try {
        await farm1.connect(farmer1).depositEth({ value: depositAmount });
      } catch (e) {
        error = true;
      }
      expect(error);
    });
    it("can deposit cp", async function () {
      // farmer 1, deposit 13 cp
      let depositAmount6 = BN.from(13);
      balancesBefore = await getBalances(farmer1, farm1);
      await vault.connect(farmer1).depositEth({ value: depositAmount6 });
      await vault.connect(farmer1).increaseAllowance(farm1.address, depositAmount6);
      let tx1 = await farm1.connect(farmer1).depositCp(depositAmount6);
      await expect(tx1).to.emit(farm1, "CpDeposited").withArgs(farmer1.address, depositAmount6);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount6);
      expect(balancesDiff.farmCp).to.equal(depositAmount6);
      expect(balancesDiff.userStake).to.equal(depositAmount6);
      // farmer 2, deposit 25
      let depositAmount7 = BN.from(25);
      balancesBefore = await getBalances(farmer2, farm1);
      await vault.connect(farmer2).depositEth({ value: depositAmount7 });
      await vault.connect(farmer2).increaseAllowance(farm1.address, depositAmount7);
      let tx2 = await farm1.connect(farmer2).depositCp(depositAmount7);
      await expect(tx2).to.emit(farm1, "CpDeposited").withArgs(farmer2.address, depositAmount7);
      balancesAfter = await getBalances(farmer2, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount7);
      expect(balancesDiff.farmCp).to.equal(depositAmount7);
      expect(balancesDiff.userStake).to.equal(depositAmount7);
    });
    it("can deposit cp via permit", async function () {
      // farmer 1, deposit 111 cp
      let depositAmount8 = BN.from(111);
      balancesBefore = await getBalances(farmer1, farm1);
      await vault.connect(farmer1).depositEth({ value: depositAmount8 });
      let nonce = await vault.nonces(farmer1.address);
      let approve = {
        owner: farmer1.address,
        spender: farm1.address,
        value: depositAmount8,
      };
      let digest = getPermitDigest(cpTokenName, vault.address, chainId, approve, nonce, deadline);
      let { v, r, s } = sign(digest, Buffer.from(farmer1.privateKey.slice(2), "hex"));
      let tx1 = await farm1.connect(farmer2).depositCpSigned(farmer1.address, depositAmount8, deadline, v, r, s);
      await expect(tx1).to.emit(farm1, "CpDeposited").withArgs(farmer1.address, depositAmount8);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount8);
      expect(balancesDiff.farmCp).to.equal(depositAmount8);
      expect(balancesDiff.userStake).to.equal(depositAmount8);
    });
    it("cannot deposit cp when lacking funds", async function () {
      // no funds and no allowance
      await expect(farm1.connect(farmer1).depositCp(1)).to.be.reverted;
      // yes funds and no allowance
      await vault.connect(farmer1).depositEth({ value: 1 });
      await expect(farm1.connect(farmer1).depositCp(1)).to.be.reverted;
      // no funds and yes allowance
      await vault.connect(farmer2).increaseAllowance(farm1.address, 1);
      await expect(farm1.connect(farmer2).depositCp(1)).to.be.reverted;
    });
    it("cannot withdraw another user's rewards", async function () {
      await expect(farm1.connect(farmer1).withdrawRewardsForUser(farmer2.address)).to.be.revertedWith("!farmcontroller");
    });
    it("can withdraw rewards", async function () {
      await farm1.connect(farmer1).withdrawRewards(); // value checked in later tests
    });
    it("can withdraw cp", async function () {
      // farmer 1, partial withdraw
      let withdrawAmount2 = BN.from(20);
      balancesBefore = await getBalances(farmer1, farm1);
      let tx1 = await farm1.connect(farmer1).withdrawCp(withdrawAmount2);
      await expect(tx1).to.emit(farm1, "CpWithdrawn").withArgs(farmer1.address, withdrawAmount2);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.userCp).to.equal(withdrawAmount2);
      expect(balancesDiff.farmStake).to.equal(withdrawAmount2.mul(-1));
      expect(balancesDiff.farmCp).to.equal(withdrawAmount2.mul(-1));
      expect(balancesDiff.userStake).to.equal(withdrawAmount2.mul(-1));
    });
    it("cannot overwithdraw", async function () {
      let withdrawAmount = (await farm1.userInfo(farmer1.address)).value.add(1);
      await expect(farm1.connect(farmer1).withdrawCp(withdrawAmount)).to.be.reverted;
    });
  });

  describe("updates", async function () {
    let farm2: CpFarm;
    before(async function () {
      // get referrence timestamp
      await provider.send("evm_mine", []);
      initTime = (await provider.getBlock('latest')).timestamp;
      startTime = initTime + 10;
      endTime = initTime + 100;
      farm2 = await createCpFarm(startTime, endTime);
      //await farmController.connect(governor).registerFarm(farm2.address, allocPoints);
    });
    it("can update a single farm", async function () {
      // init
      expect(await farm2.lastRewardTime()).to.equal(startTime);
      // update before start
      await farm2.updateFarm();
      expect(await farm2.lastRewardTime()).to.equal(startTime);
      // update after start
      timestamp = startTime + 10;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await farm2.updateFarm();
      expect(await farm2.lastRewardTime()).to.equal(timestamp);
      // update after end
      timestamp = endTime + 10;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await farm2.updateFarm();
      expect(await farm2.lastRewardTime()).to.equal(endTime);
    });
    it("rejects set end by non governor", async function () {
      await expect(farm2.connect(farmer1).setEnd(1)).to.be.revertedWith("!governance");
    });
    it("can set end", async function () {
      endTime += 50;
      await farm2.connect(governor).setEnd(endTime);
      expect(await farm2.endTime()).to.equal(endTime);
      expect(await farm2.lastRewardTime()).to.be.closeTo(BN.from(timestamp), 5);
      // update before new end
      await farm2.updateFarm();
      expect(await farm2.lastRewardTime()).to.be.closeTo(BN.from(timestamp), 5);
      // update after new end
      timestamp = endTime + 10;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await farm2.updateFarm();
      expect(await farm2.lastRewardTime()).to.equal(endTime);
    });
  });

  /*
  describe("rewards", function () {
    let farmId: BN;
    let farm: CpFarm;
    let allocPoints = BN.from("1");
    // start with 1:4 ownership, switch to 1:19
    let depositAmount1 = BN.from("10");
    let depositAmount2 = BN.from("40");
    let depositAmount3 = BN.from("150");
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let expectedReward1: BN;
    let expectedReward2: BN;
    let receivedReward2: BN;

    beforeEach(async function () {
      await vault.connect(farmer1).transfer(governor.address, await vault.balanceOf(farmer1.address));
      await vault.connect(farmer2).transfer(governor.address, await vault.balanceOf(farmer2.address));
      await solace.connect(farmer1).transfer(governor.address, await solace.balanceOf(farmer1.address));
      await solace.connect(farmer2).transfer(governor.address, await solace.balanceOf(farmer2.address));
      blockNum = BN.from(await provider.getBlockNumber());
      startTime = blockNum.add(20);
      endTime = blockNum.add(200);
      farm = await createCpFarm(startTime, endTime);
      await farmController.connect(governor).registerFarm(farm.address, allocPoints);
      farmId = await farmController.numFarms();
    });

    afterEach(async function () {
      await farmController.connect(governor).setAllocPoints(farmId, 0); // remember to deallocate dead farms
      expect(await farmController.totalAllocPoints()).to.equal(0);
    });

    it("provides rewards to only farmer", async function () {
      let waitBlocks = BN.from("10");
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      expect(await solace.balanceOf(farmer1.address)).to.equal(0);
      await burnBlocksUntil(startTime.add(waitBlocks));
      // potential withdraw
      pendingReward1 = await farm.pendingRewards(farmer1.address);
      expectedReward1 = solacePerSecond.mul(waitBlocks);
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // actual withdraw
      await farm.connect(farmer1).withdrawCp(depositAmount1);
      pendingReward1 = await solace.balanceOf(farmer1.address);
      expectedReward1 = solacePerSecond.mul(waitBlocks.add(1));
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
    });

    it("fairly provides rewards to all farmers", async function () {
      let waitBlocks1 = BN.from("10");
      let waitBlocks2 = BN.from("20");
      let waitBlocks3 = BN.from("30");
      let waitBlocks4 = BN.from("40");
      let waitBlocks5 = BN.from("50");
      // only farmer 1
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      await burnBlocksUntil(startTime.add(waitBlocks1));
      // add farmer 2
      await farm.connect(farmer2).depositEth({ value: depositAmount2 });
      await burnBlocks(waitBlocks2);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await farm.pendingRewards(farmer1.address));
      expectedReward1 = solacePerSecond.mul(11).mul(1).add(
        // 100% ownership for 11 blocks
        solacePerSecond.mul(20).mul(1).div(5)
      ); // 20% ownership for 20 blocks
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await farm.pendingRewards(farmer2.address));
      expectedReward2 = solacePerSecond.mul(20).mul(4).div(5); // 80% ownership for 20 blocks
      expect(pendingReward2).to.be.closeTo(expectedReward2, 10);
      // farmer 2 deposit more
      await farm.connect(farmer2).depositEth({ value: depositAmount3 });
      await burnBlocks(waitBlocks3);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await farm.pendingRewards(farmer1.address));
      expectedReward1 = expectedReward1.add(
        solacePerSecond.mul(1).mul(1).div(5).add(
          // 20% ownership for 1 blocks
          solacePerSecond.mul(30).mul(1).div(20)
        ) // 5% ownership for 30 blocks
      );
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await farm.pendingRewards(farmer2.address));
      receivedReward2 = BN.from(await solace.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        solacePerSecond.mul(1).mul(4).div(5).add(
          // 80% ownership for 1 blocks
          solacePerSecond.mul(30).mul(19).div(20)
        ) // 95% ownership for 30 blocks
      );
      expect(pendingReward2.add(receivedReward2)).to.be.closeTo(expectedReward2, 10);

      // farmer 1 withdraw rewards
      await farm.connect(farmer1).withdrawRewards();
      expect(await vault.balanceOf(farmer1.address)).to.equal(0);
      pendingReward1 = BN.from(await solace.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        solacePerSecond.mul(1).mul(1).div(20) // 5% ownership for 1 blocks
      );
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // farmer 2 withdraw rewards
      await farm.connect(farmer2).withdrawRewards();
      expect(await vault.balanceOf(farmer2.address)).to.equal(0);
      pendingReward2 = BN.from(await solace.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        solacePerSecond.mul(2).mul(19).div(20) // 95% ownership for 2 blocks
      );
      expect(pendingReward2).to.be.closeTo(expectedReward2, 10);
      await burnBlocks(waitBlocks4);

      // farmer 1 withdraw stake
      await farm.connect(farmer1).withdrawCp(depositAmount1);
      pendingReward1 = BN.from(await solace.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        solacePerSecond.mul(42).mul(1).div(20) // 5% ownership for 42 blocks
      );
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      await burnBlocks(waitBlocks5);
      // farmer 2 withdraw stake
      await farm.connect(farmer2).withdrawCp(depositAmount2.add(depositAmount3));
      pendingReward2 = BN.from(await solace.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        solacePerSecond.mul(41).mul(19).div(20).add(
          // 95% ownership for 41 blocks
          solacePerSecond.mul(51)
        ) // 100% ownership for 51 blocks
      );
      expect(pendingReward2).to.be.closeTo(expectedReward2, 10);
    });

    it("does not distribute rewards before farm start", async function () {
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      await burnBlocksUntil(startTime);
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
    });

    it("does not distribute rewards after farm end", async function () {
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      await burnBlocksUntil(endTime);
      let pendingReward1 = await farm.pendingRewards(farmer1.address);
      await burnBlocks(BN.from(10));
      let pendingReward2 = await farm.pendingRewards(farmer1.address);
      expect(pendingReward2).to.be.closeTo(pendingReward1, 10);
    });
  });

  describe("safe rewards", function () {
    let farm3: CpFarm;

    before(async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      startTime = blockNum.add(20);
      endTime = blockNum.add(30);
      farm3 = await createCpFarm(startTime, endTime);
      await farmController.connect(governor).registerFarm(farm3.address, 100);
      // increase solace distribution
      await farmController.connect(governor).setSolacePerSecond(await solace.balanceOf(farmController.address));
      // deposit tokens
      await farm3.connect(farmer1).depositEth({ value: 1 });
      await burnBlocksUntil(endTime);
    });

    it("tracks unpaid rewards", async function () {
      expect((await farm3.userInfo(farmer1.address)).unpaidRewards).to.equal(0);
      let pendingReward1 = await farm3.pendingRewards(farmer1.address);
      let farmControllerBalance = await solace.balanceOf(farmController.address);
      expect(pendingReward1).to.be.gt(farmControllerBalance);
      let farmerBalanceBefore = await solace.balanceOf(farmer1.address);
      await farm3.connect(farmer1).withdrawRewards();
      let farmerBalanceAfter = await solace.balanceOf(farmer1.address);
      expect(farmerBalanceAfter.sub(farmerBalanceBefore)).to.equal(farmControllerBalance);
      expect(await solace.balanceOf(farmController.address)).to.equal(0);
      let expectedUnpaid = pendingReward1.sub(farmControllerBalance);
      expect((await farm3.userInfo(farmer1.address)).unpaidRewards).to.equal(expectedUnpaid);
      let pendingReward2 = await farm3.pendingRewards(farmer1.address);
      expect(pendingReward2).to.equal(expectedUnpaid);
    });

    it("pays when funds are available", async function () {
      let unpaidRewards = (await farm3.userInfo(farmer1.address)).unpaidRewards;
      await solace.connect(governor).mint(farmController.address, unpaidRewards);
      let farmerBalanceBefore = await solace.balanceOf(farmer1.address);
      await farm3.connect(farmer1).withdrawRewards();
      let farmerBalanceAfter = await solace.balanceOf(farmer1.address);
      expect(farmerBalanceAfter.sub(farmerBalanceBefore)).to.equal(unpaidRewards);
      expect((await farm3.userInfo(farmer1.address)).unpaidRewards).to.equal(0);
      expect(await farm3.pendingRewards(farmer1.address)).to.equal(0);
    });
  });
  */

  describe("edge cases", function () {
    let farm4: CpFarm;
    let depositAmount: BN;

    before(async function () {
      farm4 = await createCpFarm(0, 1000, mockVault.address);
      depositAmount = BN.from(100);
    });

    it("can receive eth from vault via receive()", async function () {
      let balancesBefore = await getBalances(mockVault, farm4);
      let tx = await mockVault.sendTransaction({
        to: farm4.address,
        value: depositAmount,
        data: "0x",
      });
      let balancesAfter = await getBalances(mockVault, farm4);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      expect(balancesDiff.userEth).to.equal(depositAmount.mul(-1).sub(gasCost));
      expect(balancesDiff.userStake).to.equal(0); // vault gains no stake
    });

    it("can receive eth from vault via fallback()", async function () {
      let balancesBefore = await getBalances(mockVault, farm4);
      let tx = await mockVault.sendTransaction({
        to: farm4.address,
        value: depositAmount,
        data: "0xabcd",
      });
      let balancesAfter = await getBalances(mockVault, farm4);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      expect(balancesDiff.userEth).to.equal(depositAmount.mul(-1).sub(gasCost));
      expect(balancesDiff.userStake).to.equal(0); // vault gains no stake
    });

    it("rejects setRewards by non farmController", async function () {
      await expect(farm4.connect(governor).setRewards(ONE_MILLION_ETHER)).to.be.revertedWith("!farmcontroller");
      await expect(farm4.connect(farmer1).setRewards(ONE_MILLION_ETHER)).to.be.revertedWith("!farmcontroller");
    });

    it("can get multiplier", async function () {
      await farmController.connect(governor).registerFarm(farm4.address, 1);
      let rewardPerSecond = await farm4.rewardPerSecond();
      expect(await farm4.getMultiplier(20, 30)).to.equal(rewardPerSecond.mul(10));
      expect(await farm4.getMultiplier(30, 20)).to.equal(0);
    });
  });

  // helper functions

  async function createCpFarm(startTime: BigNumberish = BN.from(0), endTime: BigNumberish = BN.from(0), vaultAddress: string = vault.address) {
    let farm = (await deployContract(deployer, artifacts.CpFarm, [
      governor.address,
      farmController.address,
      vaultAddress,
      startTime,
      endTime,
      weth.address,
    ])) as CpFarm;
    return farm;
  }

  interface Balances {
    userEth: BN;
    userCp: BN;
    userStake: BN;
    userPendingRewards: BN;
    farmCp: BN;
    farmStake: BN;
    farmControllerSolace: BN;
  }

  async function getBalances(user: Wallet, farm: CpFarm): Promise<Balances> {
    return {
      userEth: await user.getBalance(),
      userCp: await vault.balanceOf(user.address),
      userStake: (await farm.userInfo(user.address)).value,
      userPendingRewards: await farm.pendingRewards(user.address),
      farmCp: await vault.balanceOf(farm.address),
      farmStake: await farm.valueStaked(),
      farmControllerSolace: await solace.balanceOf(farmController.address),
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userEth: balances1.userEth.sub(balances2.userEth),
      userCp: balances1.userCp.sub(balances2.userCp),
      userStake: balances1.userStake.sub(balances2.userStake),
      userPendingRewards: balances1.userPendingRewards.sub(balances2.userPendingRewards),
      farmCp: balances1.farmCp.sub(balances2.farmCp),
      farmStake: balances1.farmStake.sub(balances2.farmStake),
      farmControllerSolace: balances1.farmControllerSolace.sub(balances2.farmControllerSolace),
    };
  }
});
