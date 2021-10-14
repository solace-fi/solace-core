import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;

import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Vault, FarmController, OptionsFarming, CpFarm, Weth9, PolicyManager, RiskManager, Registry } from "../typechain";
import { bnAddSub, bnMulDiv, expectClose } from "./utilities/math";

chai.use(solidity);

// contracts
let solace: Solace;
let farmController: FarmController;
let optionsFarming: OptionsFarming;
let vault: Vault;
let weth: Weth9;
let registry: Registry;
let policyManager: PolicyManager;
let riskManager: RiskManager;

// uniswap contracts
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let lpToken: Contract;

// pools
let solaceEthPool: Contract;

// vars
let solacePerSecond: BN = BN.from("100000000000000000000"); // 100 e18
let solacePerSecond2: BN = BN.from("200000000000000000000"); // 200 e18
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const TEN_ETHER = BN.from("10000000000000000000");
const FIFTY_THOUSAND_ETHER = BN.from("50000000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
let timestamp: number;
let initTime: number;
let startTime: number;
let endTime: number;

describe("FarmController", function () {
  const [deployer, governor, farmer1, farmer2, farmer3, trader] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

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
    optionsFarming = (await deployContract(deployer, artifacts.OptionsFarming, [governor.address])) as OptionsFarming;
    await registry.connect(governor).setOptionsFarming(optionsFarming.address);
    farmController = (await deployContract(deployer, artifacts.FarmController, [governor.address, optionsFarming.address, solacePerSecond])) as FarmController;
    await registry.connect(governor).setFarmController(farmController.address);

    // transfer tokens
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(optionsFarming.address, ONE_MILLION_ETHER);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solace.connect(governor).transfer(farmer1.address, TEN_ETHER);
    await solace.connect(governor).transfer(farmer2.address, TEN_ETHER);
    await solace.connect(governor).transfer(farmer3.address, TEN_ETHER);
    await solace.connect(governor).transfer(trader.address, FIFTY_THOUSAND_ETHER);
    await weth.connect(farmer1).deposit({value: TEN_ETHER});
    await weth.connect(farmer2).deposit({value: TEN_ETHER});
    await weth.connect(farmer3).deposit({value: TEN_ETHER});
    await weth.connect(trader).deposit({value: TEN_ETHER});

    // approve tokens
    await solace.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await solace.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await solace.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
    await solace.connect(trader).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(trader).approve(lpToken.address, constants.MaxUint256);

    // create pools
    // 50,000 solace = 1 eth (or 1 solace = 8 cents @ 1 eth = $4000)
    let solaceIsToken0 = BN.from(solace.address).lt(BN.from(weth.address));
    let amount0 = solaceIsToken0 ? FIFTY_THOUSAND_ETHER : ONE_ETHER;
    let amount1 = solaceIsToken0 ? ONE_ETHER : FIFTY_THOUSAND_ETHER;
    let sqrtPrice = encodePriceSqrt(amount1, amount0);
    solaceEthPool = await createPool(weth, solace, FeeAmount.MEDIUM, sqrtPrice);
    await mintLpToken(trader, solace, weth, FeeAmount.MEDIUM, amount0, amount1);
  })

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await farmController.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function () {
      await expect(farmController.connect(farmer1).setPendingGovernance(farmer1.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function () {
      await farmController.connect(governor).setPendingGovernance(deployer.address);
      expect(await farmController.governance()).to.equal(governor.address);
      expect(await farmController.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(farmController.connect(farmer1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function () {
      let tx = await farmController.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(farmController, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await farmController.governance()).to.equal(deployer.address);
      expect(await farmController.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await farmController.connect(deployer).setPendingGovernance(governor.address);
      await farmController.connect(governor).acceptGovernance();
    });
  })

  describe("farm registration", function () {
    let farm1: any, farm2: any, farm3: any;
    startTime = 5;
    endTime = 6;

    it("starts empty", async function () {
      expect(await farmController.numFarms()).to.equal(0);
      expect(await farmController.totalAllocPoints()).to.equal(0);
      expect(await farmController.farmAddresses(0)).to.equal(ZERO_ADDRESS);
      expect(await farmController.farmAddresses(1)).to.equal(ZERO_ADDRESS);
      expect(await farmController.farmIndices(ZERO_ADDRESS)).to.equal(0);
      expect(await farmController.farmIndices(deployer.address)).to.equal(0);
      expect(await farmController.allocPoints(0)).to.equal(0);
      expect(await farmController.allocPoints(1)).to.equal(0);
    });
    it("can register cp farms", async function () {
      // register first farm
      farm1 = await createCpFarm(startTime, endTime);
      await expect(farm1.connect(deployer).setPendingGovernance(governor.address)).to.be.revertedWith("!governance");
      let tx = await farmController.connect(governor).registerFarm(farm1.address, 40);
      await expect(tx).to.emit(farmController, "FarmRegistered").withArgs(1, farm1.address);
      expect(await farmController.numFarms()).to.equal(1);
      expect(await farmController.totalAllocPoints()).to.equal(40);
      expect(await farmController.farmAddresses(0)).to.equal(ZERO_ADDRESS);
      expect(await farmController.farmAddresses(1)).to.equal(farm1.address);
      expect(await farmController.farmIndices(farm1.address)).to.equal(1);
      expect(await farmController.allocPoints(1)).to.equal(40);
    });
    it("can register additional farms", async function () {
      // register second farm
      farm2 = await createCpFarm(startTime, endTime);
      await expect(farm2.connect(deployer).setPendingGovernance(governor.address)).to.be.revertedWith("!governance");
      let tx = await farmController.connect(governor).registerFarm(farm2.address, 60);
      await expect(tx).to.emit(farmController, "FarmRegistered").withArgs(2, farm2.address);
      expect(await farmController.numFarms()).to.equal(2);
      expect(await farmController.totalAllocPoints()).to.equal(100);
      expect(await farmController.farmAddresses(2)).to.equal(farm2.address);
      expect(await farmController.farmIndices(farm2.address)).to.equal(2);
      expect(await farmController.allocPoints(2)).to.equal(60);
    });
    it("rejects farm registration by non governor", async function () {
      farm3 = await createCpFarm();
      await expect(farmController.connect(farmer1).registerFarm(farm3.address, 1)).to.be.revertedWith("!governance");
    });
    it("rejects duplicate farm registration", async function () {
      await expect(farmController.connect(governor).registerFarm(farm1.address, 1)).to.be.revertedWith("already registered");
      await expect(farmController.connect(governor).registerFarm(farm2.address, 1)).to.be.revertedWith("already registered");
    });
    it("rejects registration of non farms", async function () {
      await expect(farmController.connect(governor).registerFarm(ZERO_ADDRESS, 1)).to.be.revertedWith("function call to a non-contract account");
      await expect(farmController.connect(governor).registerFarm(deployer.address, 1)).to.be.revertedWith("function call to a non-contract account");
      await expect(farmController.connect(governor).registerFarm(weth.address, 1)).to.be.reverted;
    })
    it("returns farm information", async function () {
      expect(await farmController.farmAddresses(0)).to.equal(ZERO_ADDRESS);
      expect(await farmController.farmAddresses(1)).to.equal(farm1.address);
      expect(await farmController.farmAddresses(2)).to.equal(farm2.address);
      expect(await farmController.farmAddresses(3)).to.equal(ZERO_ADDRESS);
      expect(await farmController.farmIndices(farm3.address)).to.equal(0);
      expect(await farmController.farmIndices(farm1.address)).to.equal(1);
      expect(await farmController.farmIndices(farm2.address)).to.equal(2);
    });
  });

  describe("updates", async function () {
    let cpFarm1: CpFarm;
    let cpFarm2: CpFarm;
    let allocPoints = BN.from(0);

    beforeEach(async function () {
      await provider.send("evm_mine", []);
      initTime = (await provider.getBlock('latest')).timestamp;
      startTime = initTime + 200;
      endTime = initTime + 400;
      cpFarm1 = await createCpFarm(startTime, endTime);
      await farmController.connect(governor).registerFarm(cpFarm1.address, allocPoints);
      cpFarm2 = await createCpFarm(startTime, endTime);
      await farmController.connect(governor).registerFarm(cpFarm2.address, allocPoints);
    });
    it("can mass update", async function () {
      // TODO: this only checks timestamp
      // it should check other values too
      // init
      expect(await cpFarm1.lastRewardTime()).to.equal(startTime);
      expect(await cpFarm2.lastRewardTime()).to.equal(startTime);
      // update before start
      timestamp = initTime + 100;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await farmController.massUpdateFarms();
      expect(await cpFarm1.lastRewardTime()).to.equal(startTime);
      expect(await cpFarm2.lastRewardTime()).to.equal(startTime);
      // update after start
      timestamp = startTime + 100;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await farmController.massUpdateFarms();
      expect(await cpFarm1.lastRewardTime()).to.equal(timestamp);
      expect(await cpFarm2.lastRewardTime()).to.equal(timestamp);
      // update after end
      timestamp = endTime + 100;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await farmController.massUpdateFarms();
      expect(await cpFarm1.lastRewardTime()).to.equal(endTime);
      expect(await cpFarm2.lastRewardTime()).to.equal(endTime);
    });
  });

  describe("rewards", function () {
    let cpFarmID1: BN;
    let cpFarm1: CpFarm;
    let cpFarmID2: BN;
    let cpFarm2: CpFarm;
    // start with 4:1 alloc, switch to 9:1
    let allocPoints1a: BN = BN.from("20");
    let allocPoints1b: BN = BN.from("45");
    let allocPoints2: BN = BN.from("5");
    let allocPoints12a: BN = allocPoints1a.add(allocPoints2);
    let allocPoints12b: BN = allocPoints1b.add(allocPoints2);
    // 1:4 ownership on farm 1
    let depositAmount1: BN = BN.from("10");
    let depositAmount2: BN = BN.from("40");
    let depositAmount12: BN = depositAmount1.add(depositAmount2);
    // 13:7 ownership on farm 2
    let depositAmount3: BN = BN.from("130");
    let depositAmount4: BN = BN.from("70");
    let depositAmount34: BN = depositAmount3.add(depositAmount4);
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let pendingReward3: BN;
    let expectedReward1: BN;
    let expectedReward2: BN;
    let expectedReward3: BN;

    before(async function () {
      // redeploy farm controller
      farmController = (await deployContract(deployer, artifacts.FarmController, [governor.address, optionsFarming.address, solacePerSecond])) as FarmController;
      await vault.connect(farmer1).transfer(governor.address, await vault.balanceOf(farmer1.address));
      await vault.connect(farmer2).transfer(governor.address, await vault.balanceOf(farmer2.address));

      await solace.connect(governor).mint(optionsFarming.address, ONE_MILLION_ETHER);
      await optionsFarming.connect(governor).setFarmController(farmController.address);
      await optionsFarming.connect(governor).setSolace(solace.address);
      let solaceIsToken0 = BN.from(solace.address).lt(BN.from(weth.address));
      await optionsFarming.connect(governor).setSolaceEthPool(solaceEthPool.address, solaceIsToken0, 0);
    });
    it("creates multiple farms", async function () {
      await provider.send("evm_mine", []);
      initTime = (await provider.getBlock('latest')).timestamp;
      // farms start and end at different times, math should still work
      cpFarm1 = await createCpFarm(initTime + 250, initTime + 5000);
      await farmController.connect(governor).registerFarm(cpFarm1.address, allocPoints1a);
      cpFarmID1 = await farmController.numFarms();
      cpFarm2 = await createCpFarm(initTime + 450, initTime + 2500);
      await farmController.connect(governor).registerFarm(cpFarm2.address, allocPoints2);
      cpFarmID2 = await farmController.numFarms();
      await farmController.massUpdateFarms();
    });
    it("fairly provides rewards to all farmers on all farms", async function () {
      // add farmer 1 to farm 1
      await cpFarm1.connect(farmer1).depositEth({value:depositAmount1});
      // add farmer 3 to farm 2
      await cpFarm2.connect(farmer3).depositEth({value:depositAmount3});
      // wait 500 seconds
      timestamp = initTime + 500;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await farmController.pendingRewards(farmer1.address));
      expectedReward1 = bnMulDiv([solacePerSecond, 250, allocPoints1a], [allocPoints12a]); // 100% ownership of farm 1 for 250 seconds at 80% allocation
      expectClose(pendingReward1, expectedReward1, solacePerSecond);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await farmController.pendingRewards(farmer3.address));
      expectedReward3 = bnMulDiv([solacePerSecond, 50, allocPoints2], [allocPoints12a]); // 100% ownership of farm 2 for 50 seconds at 20% allocation
      expectClose(pendingReward3, expectedReward3, solacePerSecond);
      // add farmer 2 to farm 1
      await cpFarm1.connect(farmer2).depositEth({value:depositAmount2});
      // wait 100 seconds
      timestamp += 100;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // add farmer 1 to farm 2
      await cpFarm2.connect(farmer1).depositEth({value:depositAmount4});
      // wait 200 seconds
      timestamp += 200;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await farmController.pendingRewards(farmer1.address));
      expectedReward1 = bnAddSub([
        expectedReward1,
        bnMulDiv([solacePerSecond, depositAmount1, 300, allocPoints1a], [depositAmount12, allocPoints12a]), // 20% ownership of farm 1 for 300 seconds at 80% allocation
        bnMulDiv([solacePerSecond, depositAmount4, 200, allocPoints2], [depositAmount34, allocPoints12a]) // 35% ownership of farm 2 for 200 seconds at 20% allocation
      ]);
      expectClose(pendingReward1, expectedReward1, solacePerSecond);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await farmController.pendingRewards(farmer2.address));
      expectedReward2 = bnMulDiv([solacePerSecond, depositAmount2, 300, allocPoints1a], [depositAmount12, allocPoints12a]) // 80% ownership of farm 1 for 300 seconds at 80% allocation
      expectClose(pendingReward2, expectedReward2, solacePerSecond);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await farmController.pendingRewards(farmer3.address));
      expectedReward3 = bnAddSub([
        expectedReward3,
        bnMulDiv([solacePerSecond, 100, allocPoints2], [allocPoints12a]), // 100% ownership of farm 2 for 100 seconds at 20% allocation
        bnMulDiv([solacePerSecond, depositAmount3, 200, allocPoints2], [depositAmount34, allocPoints12a]) // 65% ownership of farm 2 for 200 seconds at 20% allocation
      ]);
      expectClose(pendingReward3, expectedReward3, solacePerSecond);
    });
    it("non governance cannot change allocation points of farms", async function () {
      await expect(farmController.connect(farmer1).setAllocPoints(cpFarmID1, allocPoints1b)).to.be.revertedWith("!governance");
    });
    it("cannot change allocation points of unregistered farm", async function () {
      await expect(farmController.connect(governor).setAllocPoints(0, allocPoints1b)).to.be.revertedWith("farm does not exist");
      let farmNum = (await farmController.numFarms()).add(1);
      await expect(farmController.connect(governor).setAllocPoints(farmNum, allocPoints1b)).to.be.revertedWith("farm does not exist");
    });
    it("can change allocation points of farms", async function () {
      await farmController.connect(governor).setAllocPoints(cpFarmID1, allocPoints1b);
      // wait 500 seconds
      timestamp += 500;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await farmController.pendingRewards(farmer1.address));
      expectedReward1 = bnAddSub([
        expectedReward1,
        bnMulDiv([solacePerSecond, depositAmount1, 500, allocPoints1b], [depositAmount12, allocPoints12b]), // 20% ownership of farm 1 for 500 seconds at 90% allocation
        bnMulDiv([solacePerSecond, depositAmount4, 500, allocPoints2], [depositAmount34, allocPoints12b]) // 35% ownership of farm 2 for 500 seconds at 10% allocation
      ]);
      expectClose(pendingReward1, expectedReward1, solacePerSecond);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await farmController.pendingRewards(farmer2.address));
      expectedReward2 = bnAddSub([
        expectedReward2,
        bnMulDiv([solacePerSecond, depositAmount2, 500, allocPoints1b], [depositAmount12, allocPoints12b]) // 80% ownership of farm 1 for 500 seconds at 90% allocation
      ]);
      expectClose(pendingReward2, expectedReward2, solacePerSecond);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await farmController.pendingRewards(farmer3.address));
      expectedReward3 = bnAddSub([
        expectedReward3,
        bnMulDiv([solacePerSecond, depositAmount3, 500, allocPoints2], [depositAmount34, allocPoints12b]) // 65% ownership of farm 2 for 500 seconds at 10% allocation
      ]);
      expectClose(pendingReward3, expectedReward3, solacePerSecond);
    });
    it("non governance cannot change solace per second", async function () {
      await expect(farmController.connect(farmer1).setRewardPerSecond(solacePerSecond2)).to.be.revertedWith("!governance");
    });
    it("can change solace per second", async function () {
      expect(await farmController.rewardPerSecond()).to.equal(solacePerSecond);
      await farmController.connect(governor).setRewardPerSecond(solacePerSecond2);
      expect(await farmController.rewardPerSecond()).to.equal(solacePerSecond2);
      // wait 400 seconds
      timestamp += 400;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await farmController.pendingRewards(farmer1.address));
      expectedReward1 = bnAddSub([
        expectedReward1,
        bnMulDiv([solacePerSecond2, depositAmount1, 400, allocPoints1b], [depositAmount12, allocPoints12b]), // 20% ownership of farm 1 for 400 seconds at 90% allocation
        bnMulDiv([solacePerSecond2, depositAmount4, 400, allocPoints2], [depositAmount34, allocPoints12b]) // 35% ownership of farm 2 for 400 seconds at 10% allocation
      ]);
      expectClose(pendingReward1, expectedReward1, solacePerSecond2);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await farmController.pendingRewards(farmer2.address));
      expectedReward2 = bnAddSub([
        expectedReward2,
        bnMulDiv([solacePerSecond2, depositAmount2, 400, allocPoints1b], [depositAmount12, allocPoints12b]) // 80% ownership of farm 1 for 400 seconds at 90% allocation
      ]);
      expectClose(pendingReward2, expectedReward2, solacePerSecond2);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await farmController.pendingRewards(farmer3.address));
      expectedReward3 = bnAddSub([
        expectedReward3,
        bnMulDiv([solacePerSecond2, depositAmount3, 400, allocPoints2], [depositAmount34, allocPoints12b]) // 65% ownership of farm 2 for 400 seconds at 10% allocation
      ]);
      expectClose(pendingReward3, expectedReward3, solacePerSecond2);
    });
    it("non governance cannot extend farms", async function () {
      await expect(cpFarm2.connect(farmer1).setEnd(endTime)).to.be.revertedWith("!governance");
    });
    it("can extend farms", async function () {
      let newEnd = initTime + 3000;
      await cpFarm2.connect(governor).setEnd(newEnd);
      expect(await cpFarm2.endTime()).to.equal(newEnd);
    });
    it("ends farms properly", async function () {
      // wait until past farms end
      let timeLeft1 = (await cpFarm1.endTime()).toNumber() - timestamp; // 3300
      let timeLeft2 = (await cpFarm2.endTime()).toNumber() - timestamp; // 1300
      timestamp = initTime + 6000;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await farmController.pendingRewards(farmer1.address));
      expectedReward1 = bnAddSub([
        expectedReward1,
        bnMulDiv([solacePerSecond2, depositAmount1, timeLeft1, allocPoints1b], [depositAmount12, allocPoints12b]), // 20% ownership of farm 1 for 3300 seconds at 90% allocation
        bnMulDiv([solacePerSecond2, depositAmount4, timeLeft2, allocPoints2], [depositAmount34, allocPoints12b]) // 35% ownership of farm 2 for 1300 seconds at 10% allocation
      ]);
      expectClose(pendingReward1, expectedReward1, solacePerSecond2);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await farmController.pendingRewards(farmer2.address));
      expectedReward2 = bnAddSub([
        expectedReward2,
        bnMulDiv([solacePerSecond2, depositAmount2, timeLeft1, allocPoints1b], [depositAmount12, allocPoints12b]) // 80% ownership of farm 1 for 3300 seconds at 90% allocation
      ]);
      expectClose(pendingReward2, expectedReward2, solacePerSecond2);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await farmController.pendingRewards(farmer3.address));
      expectedReward3 = bnAddSub([
        expectedReward3,
        bnMulDiv([solacePerSecond2, depositAmount3, timeLeft2, allocPoints2], [depositAmount34, allocPoints12b]) // 65% ownership of farm 2 for 1300 seconds at 10% allocation
      ]);
      expectClose(pendingReward3, expectedReward3, solacePerSecond2);
    });
    it("allows farmers to cash out", async function () {
      let farmers = [farmer1, farmer2, farmer3];
      for(var farmerI = 0; farmerI < farmers.length; ++farmerI) {
        let farmer = farmers[farmerI];
        let pendingRewards = await farmController.pendingRewards(farmer.address);
        let tx = await farmController.connect(farmer).farmOptionMulti();
        let optionID = await optionsFarming.numOptions();
        expect(tx).to.emit(optionsFarming, "OptionCreated").withArgs(optionID);
        let option = await optionsFarming.getOption(optionID);
        expect(option.rewardAmount).to.equal(pendingRewards);
        let expectedStrikePrice = await optionsFarming.calculateStrikePrice(pendingRewards);
        expect(option.strikePrice).to.equal(expectedStrikePrice);
        let balancesBefore = await getBalances(farmer.address);
        await optionsFarming.connect(farmer).exerciseOption(optionID, {value: option.strikePrice});
        let balancesAfter = await getBalances(farmer.address);
        let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
        expect(balancesDiff.userSolace).to.equal(pendingRewards)
        // double withdraw rewards
        pendingRewards = await farmController.pendingRewards(farmer.address);
        expect(pendingRewards).to.equal(0);
        await expect(farmController.connect(farmer).farmOptionMulti()).to.be.revertedWith("no zero value options");
        // withdraw stake
        let farms = [cpFarm1, cpFarm2];
        for(var farmI = 0; farmI < farms.length; ++farmI) {
          let farm = farms[farmI];
          let stake = await farm.userStaked(farmer.address);
          await farm.connect(farmer).withdrawCp(stake);
          expect(await farm.userStaked(farmer.address)).to.equal(0);
          pendingRewards = await farmController.pendingRewards(farmer.address);
          expect(pendingRewards).to.equal(0);
          await expect(farmController.connect(farmer).farmOptionMulti()).to.be.revertedWith("no zero value options");
        }
      }
    });
    it("non farmers cannot cash out", async function () {
      let pendingRewards = await farmController.pendingRewards(deployer.address);
      expect(pendingRewards).to.equal(0);
      await expect(farmController.connect(deployer).farmOptionMulti()).to.be.revertedWith("no zero value options");
    });
  });

  describe("createOption", function () {
    it("non farm cannot create options", async function () {
      // farm can create option tested above
      await expect(farmController.connect(farmer1).createOption(farmer1.address, 1)).to.be.revertedWith("!farm");
    });
  });

  // helper functions

  // uniswap requires tokens to be in order
  function sortTokens(tokenA: string, tokenB: string) {
    return BN.from(tokenA).lt(BN.from(tokenB)) ? [tokenA, tokenB] : [tokenB, tokenA];
  }

  // creates, initializes, and returns a pool
  async function createPool(tokenA: Contract, tokenB: Contract, fee: FeeAmount, sqrtPrice: BigNumberish = encodePriceSqrt(1,1)) {
    let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
    let pool: Contract;
    let tx = await uniswapFactory.createPool(token0, token1, fee);
    let events = (await tx.wait()).events;
    expect(events && events.length > 0 && events[0].args && events[0].args.pool);
    if (events && events.length > 0 && events[0].args && events[0].args.pool) {
      let poolAddress = events[0].args.pool;
      pool = await ethers.getContractAt(artifacts.UniswapV3Pool.abi, poolAddress);
    } else {
      pool = new Contract(ZERO_ADDRESS, artifacts.UniswapV3Pool.abi) as Contract;
      expect(true).to.equal(false);
    }
    expect(pool).to.exist;
    if (pool) {
      await pool.connect(governor).initialize(sqrtPrice);
    }
    return pool;
  }

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
    userSolace: BN;
    userEth: BN;
    optionsFarmingSolace: BN;
    optionsFarmingEth: BN;
  }

  async function getBalances(user: string): Promise<Balances> {
    return {
      userSolace: await solace.balanceOf(user),
      userEth: await provider.getBalance(user),
      optionsFarmingSolace: await solace.balanceOf(optionsFarming.address),
      optionsFarmingEth: await provider.getBalance(optionsFarming.address)
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userSolace: balances1.userSolace.sub(balances2.userSolace),
      userEth: balances1.userEth.sub(balances2.userEth),
      optionsFarmingSolace: balances1.optionsFarmingSolace.sub(balances2.optionsFarmingSolace),
      optionsFarmingEth: balances1.optionsFarmingEth.sub(balances2.optionsFarmingEth)
    };
  }

  // mints an lp token by providing liquidity
  async function mintLpToken(
    liquidityProvider: Wallet,
    tokenA: Contract,
    tokenB: Contract,
    fee: FeeAmount,
    amount0: BigNumberish,
    amount1: BigNumberish,
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
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: 0,
      amount1Min: 0,
      deadline: constants.MaxUint256,
    });
    let tokenId = await lpToken.totalSupply();
    return tokenId;
  }
});
