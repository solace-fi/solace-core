import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;

import { burnBlocks, burnBlocksUntil } from "./utilities/time";
import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Vault, Master, CpFarm, SolaceEthLpFarm, Weth9, LpAppraisor, PolicyManager, RiskManager, Registry } from "../typechain";

chai.use(solidity);

// contracts
let solace: Solace;
let master: Master;
let vault: Vault;
let weth: Weth9;
let lpTokenAppraisor: LpAppraisor;
let registry: Registry;
let policyManager: PolicyManager;
let riskManager: RiskManager;

// uniswap contracts
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let lpToken: Contract;

// pools
let mediumPool: Contract;

// vars
let solacePerBlock: BN = BN.from("100000000000000000000"); // 100 e18
let solacePerBlock2: BN = BN.from("200000000000000000000"); // 200 e18
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
let blockNum: BN;
let startBlock: BN;
let endBlock: BN;

describe("Master", function () {
  const [deployer, governor, farmer1, farmer2, farmer3, farmer4] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();

    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;

    // deploy uniswap contracts
    uniswapFactory = (await deployContract(deployer, artifacts.UniswapV3Factory)) as Contract;
    lpToken = (await deployContract(deployer, artifacts.NonfungiblePositionManager, [uniswapFactory.address, weth.address, ZERO_ADDRESS])) as Contract;
    uniswapRouter = (await deployContract(deployer, artifacts.SwapRouter, [uniswapFactory.address, weth.address])) as Contract;

    // deploy solace contracts
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    await registry.connect(governor).setWeth(weth.address);
    vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
    await registry.connect(governor).setVault(vault.address);
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
    await registry.connect(governor).setPolicyManager(policyManager.address);
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
    await registry.connect(governor).setRiskManager(riskManager.address);
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    await registry.connect(governor).setSolace(solace.address);
    master = (await deployContract(deployer, artifacts.Master, [governor.address, solace.address, solacePerBlock])) as Master;
    await registry.connect(governor).setMaster(master.address);
    lpTokenAppraisor = (await deployContract(deployer, artifacts.LpAppraisor, [governor.address, lpToken.address, 20000, 40000])) as LpAppraisor;

    // transfer tokens
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(master.address, ONE_MILLION_ETHER);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solace.connect(governor).transfer(farmer1.address, TEN_ETHER);
    await solace.connect(governor).transfer(farmer2.address, TEN_ETHER);
    await solace.connect(governor).transfer(farmer3.address, TEN_ETHER);
    await solace.connect(governor).transfer(farmer4.address, TEN_ETHER);
    await weth.connect(farmer1).deposit({value: TEN_ETHER});
    await weth.connect(farmer2).deposit({value: TEN_ETHER});
    await weth.connect(farmer3).deposit({value: TEN_ETHER});
    await weth.connect(farmer4).deposit({value: TEN_ETHER});

    // approve tokens
    await solace.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await solace.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await solace.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
    await solace.connect(farmer4).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer4).approve(lpToken.address, constants.MaxUint256);

    // create pools
    mediumPool = await createPool(weth, solace, FeeAmount.MEDIUM);
    await createPool(weth, solace, FeeAmount.HIGH);
  })

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await master.governance()).to.equal(governor.address);
    })

    it("rejects setting new governance by non governor", async function () {
      await expect(master.connect(farmer1).setGovernance(farmer1.address)).to.be.revertedWith("!governance");
    })

    it("can set new governance", async function () {
      await master.connect(governor).setGovernance(deployer.address);
      expect(await master.governance()).to.equal(governor.address);
      expect(await master.newGovernance()).to.equal(deployer.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(master.connect(farmer1).acceptGovernance()).to.be.revertedWith("!governance");
    })

    it("can transfer governance", async function () {
      let tx = await master.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(master, "GovernanceTransferred").withArgs(deployer.address);
      expect(await master.governance()).to.equal(deployer.address);
      expect(await master.newGovernance()).to.equal(ZERO_ADDRESS);

      await master.connect(deployer).setGovernance(governor.address);
      await master.connect(governor).acceptGovernance();
    })
  })

  describe("farm creation", function () {
    let farm1: any, farm2: any, farm3: any, farm4: any;
    startBlock = BN.from(5), endBlock = BN.from(6);

    it("can create cp farms", async function () {
      // no farms
      expect(await master.numFarms()).to.equal(0);
      // create first farm
      farm1 = await createCpFarm(startBlock, endBlock);
      await expect(farm1.connect(deployer).setGovernance(governor.address)).to.be.revertedWith("!governance");
      let tx = await master.connect(governor).registerFarm(farm1.address, 0);
      await expect(tx).to.emit(master, "FarmCreated").withArgs(1, farm1.address);
      expect(await master.numFarms()).to.equal(1);
    })

    it("can create uniswap farms", async function () {
      // create second farm
      farm2 = await createSolaceEthLpFarm(lpToken, startBlock, endBlock, mediumPool);
      await expect(farm2.connect(deployer).setGovernance(governor.address)).to.be.revertedWith("!governance");
      let tx = await master.connect(governor).registerFarm(farm2.address, 0);
      await expect(tx).to.emit(master, "FarmCreated").withArgs(2, farm2.address);
      expect(await master.numFarms()).to.equal(2);
    })

    it("rejects farm creation by non governor", async function () {
      farm3 = await createCpFarm();
      await expect(master.connect(farmer1).registerFarm(farm3.address, 0)).to.be.revertedWith("!governance");
      farm4 = await createSolaceEthLpFarm();
      await expect(master.connect(farmer1).registerFarm(farm4.address, 0)).to.be.revertedWith("!governance");
    })

    it("rejects duplicate farm registration", async function () {
      await expect(master.connect(governor).registerFarm(farm1.address, 0)).to.be.revertedWith("already registered");
      await expect(master.connect(governor).registerFarm(farm2.address, 0)).to.be.revertedWith("already registered");
    })

    it("returns farm information", async function () {
      expect(await master.farmAddresses(0)).to.equal(ZERO_ADDRESS);
      expect(await master.farmAddresses(1)).to.equal(farm1.address);
      expect(await master.farmAddresses(2)).to.equal(farm2.address);
      expect(await master.farmAddresses(3)).to.equal(ZERO_ADDRESS);
      expect(await master.farmIndices(farm3.address)).to.equal(0);
      expect(await master.farmIndices(farm1.address)).to.equal(1);
      expect(await master.farmIndices(farm2.address)).to.equal(2);
    })
  })

  describe("updates", async function () {
    let cpFarm: CpFarm;
    let lpFarm: SolaceEthLpFarm;
    let allocPoints = BN.from(0);

    beforeEach(async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(10);
      endBlock = blockNum.add(100);
      cpFarm = await createCpFarm(startBlock, endBlock);
      await master.connect(governor).registerFarm(cpFarm.address, allocPoints);
      lpFarm = await createSolaceEthLpFarm(lpToken, startBlock, endBlock, mediumPool);
      await master.connect(governor).registerFarm(lpFarm.address, allocPoints);
    })

    it("can mass update", async function () {
      // TODO: this only checks block numbers
      // it should check other values too
      // init
      expect(await cpFarm.lastRewardBlock()).to.equal(startBlock);
      expect(await lpFarm.lastRewardBlock()).to.equal(startBlock);
      // update before start
      await master.massUpdateFarms();
      expect(await cpFarm.lastRewardBlock()).to.equal(startBlock);
      expect(await lpFarm.lastRewardBlock()).to.equal(startBlock);
      // update after start
      await burnBlocks(30);
      await master.massUpdateFarms();
      blockNum = BN.from(await provider.getBlockNumber());
      expect(await cpFarm.lastRewardBlock()).to.equal(blockNum);
      expect(await lpFarm.lastRewardBlock()).to.equal(blockNum);
      // update after end
      await burnBlocks(90);
      await master.massUpdateFarms();
      expect(await cpFarm.lastRewardBlock()).to.equal(endBlock);
      expect(await lpFarm.lastRewardBlock()).to.equal(endBlock);
    })
  })

  describe("rewards", function () {
    // cp and lp farms
    let cpFarmId: BN;
    let cpFarm: CpFarm;
    let lpFarmId: BN;
    let lpFarm: SolaceEthLpFarm;
    // start with 4:1 alloc, switch to 9:1
    let cpAllocPoints1: BN = BN.from("20");
    let cpAllocPoints2: BN = BN.from("45");
    let lpAllocPoints: BN = BN.from("5");
    // 1:4 ownership on cp farm
    let depositAmount1: BN = BN.from("10");
    let depositAmount2: BN = BN.from("40");
    // 13:7 ownership on lp farm
    let depositAmount3: BN = BN.from("130");
    let depositAmount4: BN = BN.from("70");
    let tokenId3: BN;
    let tokenId4: BN;
    let tokenValue3: BN;
    let tokenValue4: BN;
    let tokenValue34: BN;
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let pendingReward3: BN;
    let pendingReward4: BN;
    let expectedReward1: BN;
    let expectedReward2: BN;
    let expectedReward3: BN;
    let expectedReward4: BN;
    // block counters
    let endBlock: BN;
    let burnedBlocks: BN;

    before(async function () {
      // farmer 1 tokens
      await vault.connect(farmer1).transfer(governor.address, await vault.balanceOf(farmer1.address));
      // farmer 2 tokens
      await vault.connect(farmer2).transfer(governor.address, await vault.balanceOf(farmer2.address));
      // farmer 3 token
      await solace.connect(governor).transfer(farmer3.address, 10000);
      tokenId3 = await mintLpToken(farmer3, weth, solace, FeeAmount.MEDIUM, depositAmount3);
      // farmer 4 token
      await solace.connect(governor).transfer(farmer4.address, 10000);
      tokenId4 = await mintLpToken(farmer4, weth, solace, FeeAmount.MEDIUM, depositAmount4);
      // zero out solace balances
      await solace.connect(farmer1).transfer(governor.address, await solace.balanceOf(farmer1.address));
      await solace.connect(farmer2).transfer(governor.address, await solace.balanceOf(farmer2.address));
      await solace.connect(farmer3).transfer(governor.address, await solace.balanceOf(farmer3.address));
      await solace.connect(farmer4).transfer(governor.address, await solace.balanceOf(farmer4.address));
    })

    it("creates multiple farms", async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      // farms start and end at different times, math should still work
      cpFarm = await createCpFarm(blockNum.add(25), blockNum.add(500));
      await master.connect(governor).registerFarm(cpFarm.address, cpAllocPoints1);
      cpFarmId = await master.numFarms();
      lpFarm = await createSolaceEthLpFarm(lpToken, blockNum.add(45), blockNum.add(250), mediumPool);
      await master.connect(governor).registerFarm(lpFarm.address, lpAllocPoints);
      lpFarmId = await master.numFarms();

      await lpToken.connect(farmer3).approve(lpFarm.address, tokenId3);
      await lpToken.connect(farmer4).approve(lpFarm.address, tokenId4);
      tokenValue3 = await lpFarm.appraise(tokenId3);
      tokenValue4 = await lpFarm.appraise(tokenId4);
      tokenValue34 = tokenValue3.add(tokenValue4);

      await burnBlocksUntil(blockNum.add(25), false);
      await master.massUpdateFarms();
    })

    it("fairly provides rewards to all farmers on all farms", async function () {
      // add farmer 1 to cp farm
      await cpFarm.connect(farmer1).depositEth({value:depositAmount1});
      // wait 10 blocks
      await burnBlocks(BN.from(10));
      // add farmer 3 to lp farm
      await lpFarm.connect(farmer3).depositLp(tokenId3);
      // wait 20 blocks
      await burnBlocks(BN.from(20));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await cpFarm.pendingRewards(farmer1.address));
      expectedReward1 = solacePerBlock.mul(31).mul(4).div(5); // 100% ownership of cp farm for 31 blocks at 80% allocation points
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await lpFarm.pendingRewards(farmer3.address));
      expectedReward3 = solacePerBlock.mul(13).mul(1).div(5); // 100% ownership of lp farm for 13 blocks at 20% allocation points
      expect(pendingReward3).to.be.closeTo(expectedReward3, 10);
      // add farmer 2 to cp farm
      await cpFarm.connect(farmer2).depositEth({value:depositAmount2});
      // wait 30 blocks
      await burnBlocks(BN.from(30));
      // add farmer 4 to lp farm
      await lpFarm.connect(farmer4).depositLp(tokenId4);
      // wait 40 blocks
      await burnBlocks(BN.from(40));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await cpFarm.pendingRewards(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(4).div(5)).add // 100% ownership of cp farm for 1 block at 80% allocation points
        (solacePerBlock.mul(71).mul(4).div(5).div(5)) // 20% ownership of cp farm for 71 blocks at 80% allocation points
      );
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await cpFarm.pendingRewards(farmer2.address));
      expectedReward2 = solacePerBlock.mul(71).mul(16).div(25); // 80% ownership of cp farm for 71 blocks at 80% allocation points
      expect(pendingReward2).to.be.closeTo(expectedReward2, 10);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await lpFarm.pendingRewards(farmer3.address));
      expectedReward3 = expectedReward3.add(
        (solacePerBlock.mul(32).mul(1).div(5)).add // 100% ownership of lp farm for 32 blocks at 20% allocation points
        (solacePerBlock.mul(40).mul(tokenValue3).div(tokenValue34).mul(20).div(100)) // ?% ownership of lp farm for 40 blocks at 20% allocation points
      );
      expect(pendingReward3).to.be.closeTo(expectedReward3, 10);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await lpFarm.pendingRewards(farmer4.address));
      expectedReward4 = solacePerBlock.mul(40).mul(tokenValue4).div(tokenValue34).mul(20).div(100); // ?% ownership of lp farm for 40 blocks at 20% allocation points
      expect(pendingReward4).to.be.closeTo(expectedReward4, 10);
    })

    it("can change allocation points of farms", async function () {
      await expect(master.connect(farmer1).setAllocPoints(cpFarmId, cpAllocPoints2)).to.be.revertedWith("!governance");
      await master.connect(governor).setAllocPoints(cpFarmId, cpAllocPoints2);
      // wait 50 blocks
      await burnBlocks(BN.from(50));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await cpFarm.pendingRewards(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(4).div(5).div(5)).add // 20% ownership of cp farm for 1 block at 80% allocation points
        (solacePerBlock.mul(50).mul(9).div(10).div(5)) // 20% ownership of cp farm for 50 blocks at 90% allocation points
      );
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await cpFarm.pendingRewards(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock.mul(1).mul(4).div(5).mul(4).div(5)).add // 80% ownership of cp farm for 1 block at 80% allocation points
        (solacePerBlock.mul(50).mul(4).div(5).mul(9).div(10)) // 80% ownership of cp farm for 50 blocks at 90% allocation points
      );
      expect(pendingReward2).to.be.closeTo(expectedReward2, 10);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await lpFarm.pendingRewards(farmer3.address));
      expectedReward3 = expectedReward3.add(
        (solacePerBlock.mul(1).mul(tokenValue3).div(tokenValue34).mul(20).div(100)).add // ?% ownership of lp farm for 1 block at 20% allocation points
        (solacePerBlock.mul(50).mul(tokenValue3).div(tokenValue34).mul(10).div(100)) // ?% ownership of lp farm for 50 blocks at 10% allocation points
      );
      expect(pendingReward3).to.be.closeTo(expectedReward3, 10);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await lpFarm.pendingRewards(farmer4.address));
      expectedReward4 = expectedReward4.add(
        (solacePerBlock.mul(1).mul(tokenValue4).div(tokenValue34).mul(20).div(100)).add // 35% ownership of lp farm for 1 block at 20% allocation points
        (solacePerBlock.mul(50).mul(tokenValue4).div(tokenValue34).mul(10).div(100)) // 35% ownership of lp farm for 50 blocks at 10% allocation points
      );
      expect(pendingReward4).to.be.closeTo(expectedReward4, 10);
    })

    it("can change solace per block", async function () {
      await expect(master.connect(farmer1).setSolacePerBlock(solacePerBlock2)).to.be.revertedWith("!governance");
      await master.connect(governor).setSolacePerBlock(solacePerBlock2);
      await burnBlocks(10);
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await cpFarm.pendingRewards(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(9).div(10).div(5)).add // 20% ownership of cp farm for 1 block at 90% allocation points
        (solacePerBlock2.mul(10).mul(9).div(10).div(5)) // 20% ownership of cp farm for 10 blocks at 90% allocation points with new reward rate
      );
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await cpFarm.pendingRewards(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock.mul(1).mul(4).div(5).mul(9).div(10)).add // 80% ownership of cp farm for 1 block at 90% allocation points
        (solacePerBlock2.mul(10).mul(4).div(5).mul(9).div(10)) // 80% ownership of cp farm for 10 blocks at 90% allocation points with new reward rate
      );
      expect(pendingReward2).to.be.closeTo(expectedReward2, 10);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await lpFarm.pendingRewards(farmer3.address));
      expectedReward3 = expectedReward3.add(
        (solacePerBlock.mul(1).mul(tokenValue3).div(tokenValue34).mul(10).div(100)).add // ?% ownership of lp farm for 1 block at 10% allocation points
        (solacePerBlock2.mul(10).mul(tokenValue3).div(tokenValue34).mul(10).div(100)) // ?% ownership of lp farm for 10 blocks at 10% allocation points with new reward rate
      );
      expect(pendingReward3).to.be.closeTo(expectedReward3, 10);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await lpFarm.pendingRewards(farmer4.address));
      expectedReward4 = expectedReward4.add(
        (solacePerBlock.mul(1).mul(tokenValue4).div(tokenValue34).mul(10).div(100)).add // ?% ownership of lp farm for 1 block at 10% allocation points
        (solacePerBlock2.mul(10).mul(tokenValue4).div(tokenValue34).mul(10).div(100)) // ?% ownership of lp farm for 50 blocks at 10% allocation points with new reward rate
      );
      expect(pendingReward4).to.be.closeTo(expectedReward4, 10);
    })

    it("can extend farms", async function () {
      endBlock = blockNum.add(300);
      await expect(lpFarm.connect(farmer1).setEnd(endBlock)).to.be.revertedWith("!governance");
      await lpFarm.connect(governor).setEnd(endBlock);
    })

    it("ends farms properly", async function () {
      burnedBlocks = await burnBlocksUntil(endBlock);
      // governance manually sets alloc to zero
      await master.connect(governor).setAllocPoints(lpFarmId, 0);
      // wait 60 blocks
      await burnBlocks(BN.from(60));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await cpFarm.pendingRewards(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock2.mul(burnedBlocks.add(2)).mul(9).div(10).div(5)).add // 20% ownership of cp farm for unknown blocks at 90% allocation points
        (solacePerBlock2.mul(60).div(5)) // 20% ownership of cp farm for 60 blocks at 100% allocation points
      );
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await cpFarm.pendingRewards(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock2.mul(burnedBlocks.add(2)).mul(9).div(10).mul(4).div(5)).add // 80% ownership of cp farm for unknown blocks at 90% allocation points
        (solacePerBlock2.mul(60).mul(4).div(5)) // 80% ownership of cp farm for 60 blocks at 100% allocation points
      );
      expect(pendingReward2).to.be.closeTo(expectedReward2, 10);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await lpFarm.pendingRewards(farmer3.address));
      expectedReward3 = expectedReward3.add(
        (solacePerBlock2.mul(burnedBlocks.add(1)).mul(tokenValue3).div(tokenValue34).mul(10).div(100)) // ?% ownership of lp farm for unknown blocks at 10% allocation points
      );
      expect(pendingReward3).to.be.closeTo(expectedReward3, 10);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await lpFarm.pendingRewards(farmer4.address));
      expectedReward4 = expectedReward4.add(
        (solacePerBlock2.mul(burnedBlocks.add(1)).mul(tokenValue4).div(tokenValue34).mul(10).div(100)) // ?% ownership of lp farm for unknown blocks at 10% allocation points
      );
      expect(pendingReward4).to.be.closeTo(expectedReward4, 10);
    })

    it("allows farmers to cash out", async function () {
      // validate farmer 1 rewards
      await cpFarm.connect(farmer1).withdrawCp(depositAmount1);
      pendingReward1 = BN.from(await solace.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock2.mul(1).div(5)) // 20% ownership of cp farm for 1 block at 100% allocation points
      );
      expect(pendingReward1).to.be.closeTo(expectedReward1, 10);
      // validate farmer 2 rewards
      await cpFarm.connect(farmer2).withdrawCp(depositAmount2);
      pendingReward2 = BN.from(await solace.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock2.mul(1).mul(4).div(5)).add // 80% ownership of cp farm for 1 block at 100% allocation points
        (solacePerBlock2) // 100% ownership of cp farm for 1 block at 100% allocation points
      );
      expect(pendingReward2).to.be.closeTo(expectedReward2, 10);
      // validate farmer 3 rewards
      await lpFarm.connect(farmer3).withdrawLp(tokenId3);
      expect(await lpToken.balanceOf(farmer3.address)).to.equal(1);
      pendingReward3 = BN.from(await solace.balanceOf(farmer3.address));
      expectedReward3 = expectedReward3;
      expect(pendingReward3).to.be.closeTo(expectedReward3, 10);
      // validate farmer 4 rewards
      await lpFarm.connect(farmer4).withdrawLp(tokenId4);
      expect(await lpToken.balanceOf(farmer4.address)).to.equal(1);
      pendingReward4 = BN.from(await solace.balanceOf(farmer4.address));
      expectedReward4 = expectedReward4;
      expect(pendingReward4).to.be.closeTo(expectedReward4, 10);
    })

    it("allows farmers to withdraw rewards from multiple farms", async function () {
      await master.connect(governor).setSolacePerBlock(solacePerBlock);
      await solace.connect(governor).mint(master.address, ONE_MILLION_ETHER);
      let numFarms = (await master.numFarms()).toNumber();
      for(var farmId = 1; farmId <= numFarms; ++farmId) {
        await master.connect(governor).setAllocPoints(farmId, 0);
      }

      blockNum = BN.from(await provider.getBlockNumber());
      let cpFarm2 = await createCpFarm(blockNum, blockNum.add(100));
      await master.connect(governor).registerFarm(cpFarm2.address, 50);
      cpFarmId = await master.numFarms();
      let lpFarm2 = await createSolaceEthLpFarm(lpToken, blockNum, blockNum.add(100), mediumPool);
      await master.connect(governor).registerFarm(lpFarm2.address, 50);
      lpFarmId = await master.numFarms();

      // user in all farms
      await cpFarm2.connect(farmer3).depositEth({value: 2000});
      await lpToken.connect(farmer3).approve(lpFarm2.address, tokenId3);
      await lpFarm2.connect(farmer3).depositLp(tokenId3);
      await burnBlocksUntil(blockNum.add(25), true);
      await master.massUpdateFarms();

      let pendingRewardsCp = await cpFarm2.pendingRewards(farmer3.address);
      expect(pendingRewardsCp).to.be.gt(0);
      let pendingRewardsLp = await lpFarm2.pendingRewards(farmer3.address);
      expect(pendingRewardsLp).to.be.gt(0);

      let balanceBefore = await solace.balanceOf(farmer3.address);
      let tx1 = await master.connect(farmer3).withdrawRewards();
      let rewards = (await solace.balanceOf(farmer3.address)).sub(balanceBefore);
      expect(rewards).to.be.gte(pendingRewardsCp.add(pendingRewardsLp));
      await expect(tx1).to.emit(cpFarm2, "UserRewarded");
      await expect(tx1).to.emit(lpFarm2, "UserRewarded");

      // user in no farms
      pendingRewardsCp = await cpFarm2.pendingRewards(farmer4.address);
      expect(pendingRewardsCp).to.be.eq(0);
      pendingRewardsLp = await lpFarm2.pendingRewards(farmer4.address);
      expect(pendingRewardsLp).to.be.eq(0);
      balanceBefore = await solace.balanceOf(farmer4.address);
      let tx2 = await master.connect(farmer4).withdrawRewards();
      rewards = (await solace.balanceOf(farmer4.address)).sub(balanceBefore);
      await expect(tx2).to.not.emit(cpFarm2, "UserRewarded");
      await expect(tx2).to.not.emit(lpFarm2, "UserRewarded");
      expect(rewards).to.be.eq(0);
    })
  })

  // helper functions

  // uniswap requires tokens to be in order
  function sortTokens(tokenA: string, tokenB: string) {
    return BN.from(tokenA).lt(BN.from(tokenB)) ? [tokenA, tokenB] : [tokenB, tokenA];
  }

  // creates, initializes, and returns a pool
  async function createPool(tokenA: Contract, tokenB: Contract, fee: FeeAmount) {
    let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
    let pool: Contract;
    let tx = await uniswapFactory.createPool(token0, token1, fee);
    let events = (await tx.wait()).events;
    expect(events && events.length > 0 && events[0].args && events[0].args.pool);
    if(events && events.length > 0 && events[0].args && events[0].args.pool) {
      let poolAddress = events[0].args.pool;
      pool = await ethers.getContractAt(artifacts.UniswapV3Pool.abi, poolAddress);
    } else {
      pool = (new Contract(ZERO_ADDRESS, artifacts.UniswapV3Pool.abi)) as Contract;
      expect(true).to.equal(false);
    }
    expect(pool).to.exist;
    if(pool){
      let sqrtPrice = encodePriceSqrt(1,1);
      await pool.connect(governor).initialize(sqrtPrice);
    }
    return pool;
  }

  async function createCpFarm(
    startBlock: BigNumberish = BN.from(0),
    endBlock: BigNumberish = BN.from(0),
  ) {
    let farm = (await deployContract(
      deployer,
      artifacts.CpFarm,
      [
        governor.address,
        master.address,
        vault.address,
        solace.address,
        startBlock,
        endBlock,
        uniswapRouter.address,
        weth.address
      ]
    )) as CpFarm;
    return farm;
  }

  async function createSolaceEthLpFarm(
    stakeToken: Contract = lpToken,
    startBlock: BigNumberish = BN.from(0),
    endBlock: BigNumberish = BN.from(0),
    pool: Contract = mediumPool
  ) {
    let farm = (await deployContract(
      deployer,
      artifacts.SolaceEthLpFarm,
      [
        governor.address,
        master.address,
        stakeToken.address,
        solace.address,
        startBlock,
        endBlock,
        pool.address,
        weth.address,
        lpTokenAppraisor.address
      ]
    )) as SolaceEthLpFarm;
    return farm;
  }

  // mints an lp token by providing liquidity
  async function mintLpToken(
    liquidityProvider: Wallet,
    tokenA: Contract,
    tokenB: Contract,
    fee: FeeAmount,
    amount: BigNumberish,
    tickLower: BigNumberish = getMinTick(TICK_SPACINGS[fee]),
    tickUpper: BigNumberish = getMaxTick(TICK_SPACINGS[fee])
  ) {
    let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
    await lpToken.connect(liquidityProvider).mint({
      token0: token0,
      token1: token1,
      tickLower: tickLower,
      tickUpper: tickUpper,
      fee: fee,
      recipient: liquidityProvider.address,
      amount0Desired: amount,
      amount1Desired: amount,
      amount0Min: 0,
      amount1Min: 0,
      deadline: constants.MaxUint256,
    });
    let tokenId = await lpToken.totalSupply();
    let position = await lpToken.positions(tokenId);
    expect(position.liquidity).to.equal(amount);
    return tokenId;
  }
});
