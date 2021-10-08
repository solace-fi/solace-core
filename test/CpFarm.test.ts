import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";
import { bnAddSub, bnMulDiv, expectClose } from "./utilities/math";
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Vault, FarmController, OptionsFarming, Weth9, CpFarm, PolicyManager, RiskManager, Registry } from "../typechain";

// contracts
let solace: Solace;
let farmController: FarmController;
let optionsFarming: OptionsFarming;
let vault: Vault;
let farm1: CpFarm;
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
let solacePerSecond = BN.from("100000000000000000000"); // 100 e18
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const TEN_ETHER = BN.from("10000000000000000000");
const FIFTY_THOUSAND_ETHER = BN.from("50000000000000000000000");
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
  const [deployer, governor, farmer1, farmer2, mockVault, trader] = provider.getWallets();
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
    optionsFarming = (await deployContract(deployer, artifacts.OptionsFarming, [governor.address])) as OptionsFarming;
    await registry.connect(governor).setOptionsFarming(optionsFarming.address);
    farmController = (await deployContract(deployer, artifacts.FarmController, [governor.address, optionsFarming.address, solacePerSecond])) as FarmController;
    await registry.connect(governor).setFarmController(farmController.address);

    // transfer tokens
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(farmController.address, ONE_MILLION_ETHER);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solace.connect(governor).mint(trader.address, FIFTY_THOUSAND_ETHER);
    await weth.connect(trader).deposit({ value: TEN_ETHER });

    // approve tokens
    await solace.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await solace.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await solace.connect(trader).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(trader).approve(lpToken.address, constants.MaxUint256);

    // create pools
    // 50,000 solace = 1 eth (or 1 solace = 8 cents @ 1 eth = $4000)
    let solaceIsToken0 = BN.from(solace.address).lt(BN.from(weth.address));
    let amount0 = solaceIsToken0 ? FIFTY_THOUSAND_ETHER : ONE_ETHER;
    let amount1 = solaceIsToken0 ? ONE_ETHER : FIFTY_THOUSAND_ETHER;
    let sqrtPrice = encodePriceSqrt(amount1, amount0);
    solaceEthPool = await createPool(weth, solace, FeeAmount.MEDIUM, sqrtPrice);
    await mintLpToken(trader, solace, weth, FeeAmount.MEDIUM, amount0, amount1);
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
      let tx = await farm1.connect(governor).setGovernance(deployer.address);
      expect(tx).to.emit(farm1, "GovernancePending").withArgs(deployer.address);
      expect(await farm1.governance()).to.equal(governor.address);
      expect(await farm1.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(farm1.connect(farmer1).acceptGovernance()).to.be.revertedWith("!governance");
    });
    it("can transfer governance", async function () {
      // set
      let tx = await farm1.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(farm1, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await farm1.governance()).to.equal(deployer.address);
      expect(await farm1.pendingGovernance()).to.equal(ZERO_ADDRESS);

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

  describe("rewards", function () {
    let farmId: BN;
    let farm: CpFarm;
    let allocPoints = BN.from("1");
    // start with 1:4 ownership, switch to 1:19
    let depositAmount1 = BN.from("10");
    let depositAmount2 = BN.from("40");
    let depositAmount3 = BN.from("150");
    let depositAmount12 = depositAmount1.add(depositAmount2);
    let depositAmount23 = depositAmount2.add(depositAmount3);
    let depositAmount123 = depositAmount1.add(depositAmount2).add(depositAmount3);
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let expectedReward1: BN;
    let expectedReward2: BN;
    let receivedReward2: BN;

    before(async function () {
      await solace.connect(governor).mint(optionsFarming.address, ONE_MILLION_ETHER);
      await optionsFarming.connect(governor).setFarmController(farmController.address);
      await optionsFarming.connect(governor).setSolace(solace.address);
      let solaceIsToken0 = BN.from(solace.address).lt(BN.from(weth.address));
      await optionsFarming.connect(governor).setSolaceEthPool(solaceEthPool.address, solaceIsToken0, 0);
    });

    beforeEach(async function () {
      await vault.connect(farmer1).transfer(governor.address, await vault.balanceOf(farmer1.address));
      await vault.connect(farmer2).transfer(governor.address, await vault.balanceOf(farmer2.address));
      await solace.connect(farmer1).transfer(governor.address, await solace.balanceOf(farmer1.address));
      await solace.connect(farmer2).transfer(governor.address, await solace.balanceOf(farmer2.address));
      // get referrence timestamp
      await provider.send("evm_mine", []);
      initTime = (await provider.getBlock('latest')).timestamp;
      startTime = initTime + 200;
      endTime = initTime + 1000;
      farm = await createCpFarm(startTime, endTime);
      await farmController.connect(governor).registerFarm(farm.address, allocPoints);
      farmId = await farmController.numFarms();
    });

    afterEach(async function () {
      await farmController.connect(governor).setAllocPoints(farmId, 0); // remember to deallocate dead farms
      expect(await farmController.totalAllocPoints()).to.equal(0);
    });

    it("provides rewards to only farmer", async function () {
      // deposit before start
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
      timestamp = startTime + 100;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // potential withdraw
      pendingReward1 = await farm.pendingRewards(farmer1.address);
      expectedReward1 = solacePerSecond.mul(100);
      expect(pendingReward1).to.eq(expectedReward1);
    });
    it("fairly provides rewards to all farmers", async function () {
      // only farmer 1
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      timestamp = startTime + 100;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      // add farmer 2
      await farm.connect(farmer2).depositEth({ value: depositAmount2 });
      timestamp += 100;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await farm.pendingRewards(farmer1.address));
      expectedReward1 = bnAddSub([
        bnMulDiv([solacePerSecond, 100, depositAmount1], [depositAmount1]), // 100% ownership for 100 seconds
        bnMulDiv([solacePerSecond, 100, depositAmount1], [depositAmount12]), // 20% ownership for 100 seconds
      ]);
      expect(pendingReward1).to.eq(expectedReward1);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await farm.pendingRewards(farmer2.address));
      expectedReward2 = bnMulDiv([solacePerSecond, 100, depositAmount2], [depositAmount12]), // 80% ownership for 100 seconds
      expect(pendingReward2).to.eq(expectedReward2);
      // farmer 2 deposit more
      await farm.connect(farmer2).depositEth({ value: depositAmount3 });
      timestamp += 200;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await farm.pendingRewards(farmer1.address));
      expectedReward1 = expectedReward1.add(
        bnMulDiv([solacePerSecond, 200, depositAmount1], [depositAmount123]), // 5% ownership for 200 seconds
      );
      expectClose(pendingReward1, expectedReward1, solacePerSecond);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await farm.pendingRewards(farmer2.address));
      expectedReward2 = expectedReward2.add(
        bnMulDiv([solacePerSecond, 200, depositAmount23], [depositAmount123]), // 95% ownership for 200 seconds
      );
      expectClose(pendingReward2, expectedReward2, solacePerSecond);
    });
    it("does not distribute rewards before farm start", async function () {
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      await provider.send("evm_setNextBlockTimestamp", [startTime]);
      await provider.send("evm_mine", []);
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
    });
    it("does not distribute rewards after farm end", async function () {
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      await provider.send("evm_setNextBlockTimestamp", [endTime]);
      await provider.send("evm_mine", []);
      let pendingReward1 = await farm.pendingRewards(farmer1.address);
      await provider.send("evm_setNextBlockTimestamp", [endTime+1000]);
      await provider.send("evm_mine", []);
      let pendingReward2 = await farm.pendingRewards(farmer1.address);
      //expect(pendingReward2).to.be.closeTo(pendingReward1, 10);
      expect(pendingReward1).to.equal(pendingReward2);
    });
    it("allows farmers to cash out", async function () {
      // deposit before start
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
      await provider.send("evm_setNextBlockTimestamp", [endTime+1000]);
      await provider.send("evm_mine", []);
      let pendingRewards = await farm.pendingRewards(farmer1.address);
      let tx = await farm.connect(farmer1).withdrawRewards();
      let optionID = await optionsFarming.numOptions();
      expect(tx).to.emit(optionsFarming, "OptionCreated").withArgs(optionID);
      let option = await optionsFarming.getOption(optionID);
      expect(option.rewardAmount).to.equal(pendingRewards);
      let expectedStrikePrice = await optionsFarming.calculateStrikePrice(pendingRewards);
      expect(option.strikePrice).to.equal(expectedStrikePrice);
      let balancesBefore = await getBalances(farmer1, farm);
      await optionsFarming.connect(farmer1).exerciseOption(optionID, {value: option.strikePrice});
      let balancesAfter = await getBalances(farmer1, farm);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.userSolace).to.equal(pendingRewards);
      // double withdraw rewards
      pendingRewards = await farm.pendingRewards(farmer1.address);
      expect(pendingRewards).to.equal(0);
      await expect(farm.connect(farmer1).withdrawRewards()).to.be.revertedWith("no zero value options");
    });
    it("non farmers cannot cash out", async function () {
      let pendingRewards = await farmController.pendingRewards(deployer.address);
      expect(pendingRewards).to.equal(0);
      await expect(farm.connect(deployer).withdrawRewards()).to.be.revertedWith("no zero value options");
    });
  });

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
    userEth: BN;
    userCp: BN;
    userStake: BN;
    userPendingRewards: BN;
    userSolace: BN;
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
      userSolace: await solace.balanceOf(user.address),
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
      userSolace: balances1.userSolace.sub(balances2.userSolace),
      farmCp: balances1.farmCp.sub(balances2.farmCp),
      farmStake: balances1.farmStake.sub(balances2.farmStake),
      farmControllerSolace: balances1.farmControllerSolace.sub(balances2.farmControllerSolace),
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
