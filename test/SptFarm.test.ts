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
import { getPermitErc721EnhancedSignature } from "./utilities/getPermitNFTSignature";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, FarmController, OptionsFarming, SptFarm, PolicyManager, RiskManager, Registry, MockProduct, Weth9, Treasury } from "../typechain";
import { burnBlocks } from "./utilities/time";

// contracts
let solace: Solace;
let farmController: FarmController;
let optionsFarming: OptionsFarming;
let farm1: SptFarm;
let weth: Weth9;
let registry: Registry;
let treasury: Treasury;
let policyManager: PolicyManager;
let riskManager: RiskManager;
let product: MockProduct;

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
let sptFarmType = 3;
const price = 10000;
const duration = 1000;
const chainID = 31337;
const deadline = constants.MaxUint256;

describe("SptFarm", function () {
  const [deployer, governor, farmer1, farmer2, trader, coveredPlatform] = provider.getWallets();
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
    treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
    await registry.connect(governor).setTreasury(treasury.address);
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
    await optionsFarming.connect(governor).setFarmController(farmController.address);

    // add products
    product = (await deployContract(deployer, artifacts.MockProduct, [deployer.address, policyManager.address, registry.address, coveredPlatform.address, 0, 100000000000, price])) as MockProduct;
    await policyManager.connect(governor).addProduct(product.address);
    await riskManager.connect(governor).addProduct(product.address, 1, price, 1);

    // transfer tokens
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solace.connect(governor).mint(trader.address, FIFTY_THOUSAND_ETHER);
    await solace.connect(trader).approve(uniswapRouter.address, constants.MaxUint256);
    await solace.connect(trader).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer1).deposit({ value: TEN_ETHER });
    await weth.connect(farmer2).deposit({ value: TEN_ETHER });
    await weth.connect(trader).deposit({ value: TEN_ETHER });
    await weth.connect(trader).approve(uniswapRouter.address, constants.MaxUint256);
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

  describe("deployment", function () {
    it("reverts if zero registry", async function () {
      await expect(deployContract(deployer, artifacts.SptFarm, [governor.address, ZERO_ADDRESS, 1, 2])).to.be.revertedWith("zero address registry");
    });
    it("reverts if zero controller", async function () {
      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await expect(deployContract(deployer, artifacts.SptFarm, [governor.address, registry2.address, 1, 2])).to.be.revertedWith("zero address controller");
    });
    it("reverts if zero policymanager", async function () {
      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await registry2.connect(governor).setFarmController(farmController.address);
      await expect(deployContract(deployer, artifacts.SptFarm, [governor.address, registry2.address, 1, 2])).to.be.revertedWith("zero address policymanager");
    });
    it("reverts if invalid window", async function () {
      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await registry2.connect(governor).setFarmController(farmController.address);
      await registry2.connect(governor).setPolicyManager(policyManager.address);
      await expect(deployContract(deployer, artifacts.SptFarm, [governor.address, registry2.address, 4, 3])).to.be.revertedWith("invalid window");
    });
    it("deploys successfully", async function () {
      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await registry2.connect(governor).setFarmController(farmController.address);
      await registry2.connect(governor).setPolicyManager(policyManager.address);
      await deployContract(deployer, artifacts.SptFarm, [governor.address, registry2.address, 1, 2]);
    });
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
      farm1 = (await deployContract(deployer, artifacts.SptFarm, [governor.address, registry.address, startTime, endTime])) as SptFarm;
    });
    it("returns farm information", async function () {
      expect(await farm1.farmController()).to.equal(farmController.address);
      expect(await farm1.policyManager()).to.equal(policyManager.address);
      expect(await farm1.farmType()).to.equal(sptFarmType);
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
      await expect(farm1.connect(farmer1).setPendingGovernance(farmer1.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function () {
      let tx = await farm1.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(farm1, "GovernancePending").withArgs(deployer.address);
      expect(await farm1.governance()).to.equal(governor.address);
      expect(await farm1.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(farm1.connect(farmer1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function () {
      // set
      let tx = await farm1.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(farm1, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await farm1.governance()).to.equal(deployer.address);
      expect(await farm1.pendingGovernance()).to.equal(ZERO_ADDRESS);

      await farm1.connect(deployer).setPendingGovernance(governor.address);
      await farm1.connect(governor).acceptGovernance();
    });
  });

  describe("deposit and withdraw", function () {
    let policyID1: BN, policyID2: BN, policyID3: BN, policyID4: BN, policyID5: BN;
    let coverAmount1 = ONE_ETHER;
    let coverAmount2 = ONE_ETHER.mul(4);
    let coverAmount3 = ONE_ETHER.mul(2);
    let coverAmount4 = ONE_ETHER.mul(9);
    let coverAmount5 = ONE_ETHER.mul(25);
    let policyValue1 = coverAmount1.mul(price);
    let policyValue2 = coverAmount2.mul(price);
    let policyValue3 = coverAmount3.mul(price);
    let policyValue4 = coverAmount4.mul(price);
    let policyValue5 = coverAmount5.mul(price);
    let policyValue12 = policyValue1.add(policyValue2);
    let policyValue13 = policyValue1.add(policyValue3);
    let policyValue123 = policyValue1.add(policyValue2).add(policyValue3);

    before(async function () {
      await product.connect(farmer1)._buyPolicy(farmer1.address, coverAmount1, duration, ZERO_ADDRESS);
      policyID1 = await policyManager.totalPolicyCount();
      await product.connect(farmer2)._buyPolicy(farmer2.address, coverAmount2, duration, ZERO_ADDRESS);
      policyID2 = await policyManager.totalPolicyCount();
      await product.connect(farmer1)._buyPolicy(farmer1.address, coverAmount3, duration, ZERO_ADDRESS);
      policyID3 = await policyManager.totalPolicyCount();
      await product.connect(farmer1)._buyPolicy(farmer1.address, coverAmount4, duration, ZERO_ADDRESS);
      policyID4 = await policyManager.totalPolicyCount();
      await product.connect(farmer1)._buyPolicy(farmer1.address, coverAmount5, duration, ZERO_ADDRESS);
      policyID5 = await policyManager.totalPolicyCount();
    });
    it("can deposit", async function () {
      // empty
      let balances1a = await getBalances(farmer1, farm1);
      expect(await farm1.countDeposited(farmer1.address)).to.equal(0);
      expect(await farm1.listDeposited(farmer1.address)).to.deep.equal([[], []]);
      // farmer 1, deposit policy 1
      expect((await farm1.policyInfo(policyID1)).depositor).to.equal(ZERO_ADDRESS);
      await policyManager.connect(farmer1).approve(farm1.address, policyID1);
      let tx1 = await farm1.connect(farmer1).depositPolicy(policyID1);
      await expect(tx1).to.emit(farm1, "PolicyDeposited").withArgs(farmer1.address, policyID1);
      let balances1b = await getBalances(farmer1, farm1);
      let balancesDiff1 = getBalancesDiff(balances1b, balances1a);
      expect(balancesDiff1.farmSpt).eq(1);
      expect(balancesDiff1.userSpt).eq(-1);
      expect(balancesDiff1.userStaked).eq(policyValue1);
      expect(balancesDiff1.farmStake).eq(policyValue1);
      expect(balances1b.userStaked).eq(policyValue1);
      expect(balances1b.farmStake).eq(policyValue1);
      expect(balances1b.farmSpt).eq(1);
      expect(await farm1.countDeposited(farmer1.address)).to.equal(1);
      expect(await farm1.getDeposited(farmer1.address, 0)).to.deep.equal([policyID1, policyValue1]);
      expect(await farm1.listDeposited(farmer1.address)).to.deep.equal([[policyID1], [policyValue1]]);
      let policyInfo = await farm1.policyInfo(policyID1);
      expect(policyInfo.depositor).eq(farmer1.address);
      expect(policyInfo.value).eq(policyValue1);
      // farmer 2, deposit policy 2
      let balances2a = await getBalances(farmer2, farm1);
      await policyManager.connect(farmer2).approve(farm1.address, policyID2);
      let tx2 = await farm1.connect(farmer2).depositPolicy(policyID2);
      await expect(tx2).to.emit(farm1, "PolicyDeposited").withArgs(farmer2.address, policyID2);
      let balances2b = await getBalances(farmer2, farm1);
      let balancesDiff2 = getBalancesDiff(balances2b, balances2a);
      expect(balancesDiff2.farmSpt).eq(1);
      expect(balancesDiff2.userSpt).eq(-1);
      expect(balancesDiff2.userStaked).eq(policyValue2);
      expect(balancesDiff2.farmStake).eq(policyValue2);
      expect(balances2b.userStaked).eq(policyValue2);
      expect(balances2b.farmStake).eq(policyValue12);
      expect(balances2b.farmSpt).eq(2);
      expect(await farm1.countDeposited(farmer2.address)).to.equal(1);
      expect(await farm1.getDeposited(farmer2.address, 0)).to.deep.equal([policyID2, policyValue2]);
      expect(await farm1.listDeposited(farmer2.address)).to.deep.equal([[policyID2], [policyValue2]]);
      policyInfo = await farm1.policyInfo(policyID2);
      expect(policyInfo.depositor).eq(farmer2.address);
      expect(policyInfo.value).eq(policyValue2);
      // farmer 1, deposit policy 3
      let balances3a = await getBalances(farmer1, farm1);
      await policyManager.connect(farmer1).approve(farm1.address, policyID3);
      let tx3 = await farm1.connect(farmer1).depositPolicy(policyID3);
      await expect(tx3).to.emit(farm1, "PolicyDeposited").withArgs(farmer1.address, policyID3);
      let balances3b = await getBalances(farmer1, farm1);
      let balancesDiff3 = getBalancesDiff(balances3b, balances3a);
      expect(balancesDiff3.farmSpt).eq(1);
      expect(balancesDiff3.userSpt).eq(-1);
      expect(balancesDiff3.userStaked).eq(policyValue3);
      expect(balancesDiff3.farmStake).eq(policyValue3);
      expect(balances3b.userStaked).eq(policyValue13);
      expect(balances3b.farmStake).eq(policyValue123);
      expect(balances3b.farmSpt).eq(3);
      expect(await farm1.countDeposited(farmer1.address)).to.equal(2);
      expect(await farm1.getDeposited(farmer1.address, 1)).to.deep.equal([policyID3, policyValue3]);
      expect(await farm1.listDeposited(farmer1.address)).to.deep.equal([
        [policyID1, policyID3],
        [policyValue1, policyValue3],
      ]);
      policyInfo = await farm1.policyInfo(policyID3);
      expect(policyInfo.depositor).eq(farmer1.address);
      expect(policyInfo.value).eq(policyValue3);
    });
    it("can deposit via permit", async function () {
      let balances4a = await getBalances(farmer1, farm1);
      const { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm1.address, policyID4, deadline);
      let tx1 = await farm1.connect(farmer1).depositPolicySigned(farmer1.address, policyID4, deadline, v, r, s);
      await expect(tx1).to.emit(farm1, "PolicyDeposited").withArgs(farmer1.address, policyID4);
      let balances4b = await getBalances(farmer1, farm1);
      let balancesDiff4 = getBalancesDiff(balances4b, balances4a);
      expect(balancesDiff4.farmSpt).eq(1);
      expect(balancesDiff4.userSpt).eq(-1);
      expect(balancesDiff4.userStaked).eq(policyValue4);
      expect(balancesDiff4.farmStake).eq(policyValue4);
      expect(balances4b.farmSpt).eq(4);
      expect(await farm1.countDeposited(farmer1.address)).to.equal(3);
      expect(await farm1.getDeposited(farmer1.address, 2)).to.deep.equal([policyID4, policyValue4]);
      expect(await farm1.listDeposited(farmer1.address)).to.deep.equal([
        [policyID1, policyID3, policyID4],
        [policyValue1, policyValue3, policyValue4],
      ]);
      let policyInfo = await farm1.policyInfo(policyID4);
      expect(policyInfo.depositor).eq(farmer1.address);
      expect(policyInfo.value).eq(policyValue4);
    });
    it("cannot deposit when lacking funds", async function () {
      // non existant token
      let policyID = (await policyManager.totalSupply()).add(2);
      await expect(farm1.connect(farmer1).depositPolicy(policyID)).to.be.reverted;
      // deposit without approval
      await expect(farm1.connect(farmer1).depositPolicy(policyID5)).to.be.reverted;
      // deposit someone elses token
      await expect(farm1.connect(farmer2).depositPolicy(policyID)).to.be.reverted;
      await policyManager.connect(farmer1).approve(farm1.address, policyID5);
      await expect(farm1.connect(farmer2).depositPolicy(policyID5)).to.be.reverted;
      // expired policy
      await product.connect(farmer1)._buyPolicy(farmer1.address, coverAmount1, 0, ZERO_ADDRESS);
      policyID = await policyManager.totalPolicyCount();
      await policyManager.connect(farmer1).approve(farm1.address, policyID);
      await expect(farm1.connect(farmer1).depositPolicy(policyID)).to.be.revertedWith("policy is expired");
      const { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm1.address, policyID, deadline);
      await expect(farm1.connect(farmer1).depositPolicySigned(farmer1.address, policyID, deadline, v, r, s)).to.be.revertedWith("policy is expired");
    });
    it("cannot withdraw another user's rewards", async function () {
      await expect(farm1.connect(farmer1).withdrawRewardsForUser(farmer2.address)).to.be.revertedWith("!farmcontroller");
    });
    it("can withdraw policies", async function () {
      // farmer 1, partial withdraw
      let balances1a = await getBalances(farmer1, farm1);
      let tx1 = await farm1.connect(farmer1).withdrawPolicy(policyID1);
      await expect(tx1).to.emit(farm1, "PolicyWithdrawn").withArgs(farmer1.address, policyID1);
      let balances1b = await getBalances(farmer1, farm1);
      let balancesDiff1 = getBalancesDiff(balances1b, balances1a);
      expect(balancesDiff1.farmSpt).eq(-1);
      expect(balancesDiff1.userSpt).eq(1);
      expect(balancesDiff1.userStaked).eq(policyValue1.mul(-1));
      expect(balancesDiff1.farmStake).eq(policyValue1.mul(-1));
      let policyInfo = await farm1.policyInfo(policyID1);
      expect(policyInfo.depositor).eq(ZERO_ADDRESS);
      expect(policyInfo.value).eq(0);
    });
    it("cannot overwithdraw", async function () {
      // withdraw without deposit / double withdraw
      await expect(farm1.connect(farmer1).withdrawPolicy(policyID1)).to.be.reverted;
      // deposit one and withdraw another
      await policyManager.connect(farmer1).approve(farm1.address, policyID1);
      await farm1.connect(farmer1).depositPolicy(policyID1);
      await expect(farm1.connect(farmer1).withdrawPolicy(policyID5)).to.be.reverted;
      // withdraw a token someone else deposited
      await expect(farm1.connect(farmer1).withdrawPolicy(policyID2)).to.be.reverted;
    });
    it("can deposit multi", async function () {
      // create more policies
      await product.connect(farmer1)._buyPolicy(farmer1.address, coverAmount1, duration, ZERO_ADDRESS);
      policyID1 = await policyManager.totalPolicyCount();
      await product.connect(farmer2)._buyPolicy(farmer2.address, coverAmount2, duration, ZERO_ADDRESS);
      policyID2 = await policyManager.totalPolicyCount();
      await product.connect(farmer1)._buyPolicy(farmer1.address, coverAmount3, duration, ZERO_ADDRESS);
      policyID3 = await policyManager.totalPolicyCount();
      await product.connect(farmer2)._buyPolicy(farmer2.address, coverAmount4, duration, ZERO_ADDRESS);
      policyID4 = await policyManager.totalPolicyCount();
      await product.connect(farmer1)._buyPolicy(farmer1.address, coverAmount5, duration, ZERO_ADDRESS);
      policyID5 = await policyManager.totalPolicyCount();
      // deposit
      let balances1a = await getBalances(farmer1, farm1);
      await policyManager.connect(farmer1).approve(farm1.address, policyID1);
      await policyManager.connect(farmer1).approve(farm1.address, policyID3);
      let tx1 = await farm1.connect(farmer1).depositPolicyMulti([policyID1, policyID3]);
      await expect(tx1).to.emit(farm1, "PolicyDeposited").withArgs(farmer1.address, policyID1);
      await expect(tx1).to.emit(farm1, "PolicyDeposited").withArgs(farmer1.address, policyID3);
      let balances1b = await getBalances(farmer1, farm1);
      let balancesDiff1 = getBalancesDiff(balances1b, balances1a);
      expect(balancesDiff1.farmSpt).eq(2);
      expect(balancesDiff1.userSpt).eq(-2);
      expect(balancesDiff1.userStaked).eq(policyValue1.add(policyValue3));
      expect(balancesDiff1.farmStake).eq(policyValue1.add(policyValue3));
      let policyInfo = await farm1.policyInfo(policyID1);
      expect(policyInfo.depositor).eq(farmer1.address);
      expect(policyInfo.value).eq(policyValue1);
      policyInfo = await farm1.policyInfo(policyID3);
      expect(policyInfo.depositor).eq(farmer1.address);
      expect(policyInfo.value).eq(policyValue3);
      // revert if no approval
      await expect(farm1.connect(farmer1).depositPolicyMulti([policyID5])).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
      // revert double deposit
      await expect(farm1.connect(farmer1).depositPolicyMulti([policyID1])).to.be.revertedWith("ERC721: transfer of token that is not own");
      // revert not your token
      await expect(farm1.connect(farmer1).depositPolicyMulti([policyID4])).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
      // revert non existent token
      await expect(farm1.connect(farmer1).depositPolicyMulti([999])).to.be.revertedWith("ERC721: operator query for nonexistent token");
      // empty
      await farm1.connect(farmer1).depositPolicyMulti([]);
      // withdraw policies
      await farm1.connect(farmer1).withdrawPolicy(policyID1);
      await farm1.connect(farmer1).withdrawPolicy(policyID3);
    });
    it("can deposit multi signed", async function () {
      // create signatures
      let farmers = [farmer1, farmer2, farmer1];
      let farmerAddresses = [farmer1.address, farmer2.address, farmer1.address];
      let policyIDs = [policyID1, policyID2, policyID3];
      let deadlines = [deadline, deadline, deadline];
      let vs = [], rs = [], ss = [];
      for(var i = 0; i < policyIDs.length; ++i) {
        const { v, r, s } = await getPermitErc721EnhancedSignature(farmers[i], policyManager, farm1.address, policyIDs[i], deadline);
        vs.push(v);
        rs.push(r);
        ss.push(s);
      }
      // deposit
      let balances1a = await getBalances(farmer1, farm1);
      let balances2a = await getBalances(farmer2, farm1);
      let tx1 = await farm1.connect(farmer1).depositPolicySignedMulti(farmerAddresses, policyIDs, deadlines, vs, rs, ss);
      await expect(tx1).to.emit(farm1, "PolicyDeposited").withArgs(farmer1.address, policyID1);
      await expect(tx1).to.emit(farm1, "PolicyDeposited").withArgs(farmer2.address, policyID2);
      await expect(tx1).to.emit(farm1, "PolicyDeposited").withArgs(farmer1.address, policyID3);
      let balances1b = await getBalances(farmer1, farm1);
      let balances2b = await getBalances(farmer2, farm1);
      let balancesDiff1 = getBalancesDiff(balances1b, balances1a);
      let balancesDiff2 = getBalancesDiff(balances2b, balances2a);
      expect(balancesDiff1.farmSpt).eq(3);
      expect(balancesDiff1.userSpt).eq(-2);
      expect(balancesDiff2.userSpt).eq(-1);
      expect(balancesDiff1.userStaked).eq(policyValue1.add(policyValue3));
      expect(balancesDiff1.farmStake).eq(policyValue1.add(policyValue2).add(policyValue3));
      expect(balancesDiff2.userStaked).eq(policyValue2);
      let policyInfo = await farm1.policyInfo(policyID1);
      expect(policyInfo.depositor).eq(farmer1.address);
      expect(policyInfo.value).eq(policyValue1);
      policyInfo = await farm1.policyInfo(policyID2);
      expect(policyInfo.depositor).eq(farmer2.address);
      expect(policyInfo.value).eq(policyValue2);
      policyInfo = await farm1.policyInfo(policyID3);
      expect(policyInfo.depositor).eq(farmer1.address);
      expect(policyInfo.value).eq(policyValue3);
      // revert length mismatch
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer1.address, farmer2.address], [policyID5], [deadline], [vs[0]], [rs[0]], [ss[0]])).to.be.revertedWith("length mismatch");
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer1.address], [policyID5, policyID4], [deadline], [vs[0]], [rs[0]], [ss[0]])).to.be.revertedWith("length mismatch");
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer1.address], [policyID5], [deadline, deadline], [vs[0]], [rs[0]], [ss[0]])).to.be.revertedWith("length mismatch");
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer1.address], [policyID5], [deadline], [vs[0], vs[1]], [rs[0]], [ss[0]])).to.be.revertedWith("length mismatch");
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer1.address], [policyID5], [deadline], [vs[0]], [rs[0], rs[1]], [ss[0]])).to.be.revertedWith("length mismatch");
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer1.address], [policyID5], [deadline], [vs[0]], [rs[0]], [ss[0], ss[1]])).to.be.revertedWith("length mismatch");
      // revert double deposit
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer1.address], [policyID1], [deadline], [vs[0]], [rs[0]], [ss[0]])).to.be.revertedWith("cannot permit to self");
      // revert not your token
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer1.address], [policyID4], [deadline], [vs[0]], [rs[0]], [ss[0]])).to.be.revertedWith("unauthorized");
      // revert non existent token
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer1.address], [999], [deadline], [vs[0]], [rs[0]], [ss[0]])).to.be.revertedWith("query for nonexistent token");
      // revert invalid signature
      const { v, r, s } = await getPermitErc721EnhancedSignature(farmer2, policyManager, farm1.address, policyID4, deadline);
      await expect(farm1.connect(farmer1).depositPolicySignedMulti([farmer2.address], [policyID4], [deadline], [12], [r], [r])).to.be.revertedWith("invalid signature");
      // empty
      await farm1.connect(farmer1).depositPolicySignedMulti([], [], [], [], [], []);
    });
    it("can withdraw multi", async function () {
      let balances1a = await getBalances(farmer1, farm1);
      let tx1 = await farm1.connect(farmer1).withdrawPolicyMulti([policyID1, policyID3]);
      await expect(tx1).to.emit(farm1, "PolicyWithdrawn").withArgs(farmer1.address, policyID1);
      await expect(tx1).to.emit(farm1, "PolicyWithdrawn").withArgs(farmer1.address, policyID3);
      let balances1b = await getBalances(farmer1, farm1);
      let balancesDiff1 = getBalancesDiff(balances1b, balances1a);
      expect(balancesDiff1.farmSpt).eq(-2);
      expect(balancesDiff1.userSpt).eq(2);
      expect(balancesDiff1.userStaked).eq(policyValue1.add(policyValue3).mul(-1));
      expect(balancesDiff1.farmStake).eq(policyValue1.add(policyValue3).mul(-1));
      let policyInfo = await farm1.policyInfo(policyID1);
      expect(policyInfo.depositor).eq(ZERO_ADDRESS);
      expect(policyInfo.value).eq(0);
      policyInfo = await farm1.policyInfo(policyID3);
      expect(policyInfo.depositor).eq(ZERO_ADDRESS);
      expect(policyInfo.value).eq(0);
      // withdraw without deposit / double withdraw
      await expect(farm1.connect(farmer1).withdrawPolicyMulti([policyID1])).to.be.reverted;
      // deposit one and withdraw another
      await policyManager.connect(farmer1).approve(farm1.address, policyID1);
      await farm1.connect(farmer1).depositPolicy(policyID1);
      await expect(farm1.connect(farmer1).withdrawPolicyMulti([policyID5])).to.be.reverted;
      // withdraw a token someone else deposited
      await expect(farm1.connect(farmer1).withdrawPolicyMulti([policyID2])).to.be.reverted;
      // withdraw non existant token
      await expect(farm1.connect(farmer1).withdrawPolicyMulti([999])).to.be.reverted;
      // empty
      await farm1.connect(farmer1).withdrawPolicyMulti([]);
    });
  });

  describe("updates", async function () {
    let farm2: SptFarm;
    before(async function () {
      // get referrence timestamp
      await provider.send("evm_mine", []);
      initTime = (await provider.getBlock('latest')).timestamp;
      startTime = initTime + 10;
      endTime = initTime + 100;
      farm2 = (await deployContract(deployer, artifacts.SptFarm, [governor.address, registry.address, startTime, endTime])) as SptFarm;
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
    let farmID: BN;
    let farm: SptFarm;
    let allocPoints = BN.from("1");
    // start with 1:4 ownership, switch to 1:19
    let policyID1: BN, policyID2: BN, policyID3: BN;
    let coverAmount1 = ONE_ETHER.mul(10);
    let coverAmount2 = ONE_ETHER.mul(40);
    let coverAmount3 = ONE_ETHER.mul(150);
    let policyValue1 = coverAmount1.mul(price);
    let policyValue2 = coverAmount2.mul(price);
    let policyValue3 = coverAmount3.mul(price);
    let policyValue12 = policyValue1.add(policyValue2);
    let policyValue23 = policyValue2.add(policyValue3);
    let policyValue123 = policyValue1.add(policyValue2).add(policyValue3);
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let expectedReward1: BN;
    let expectedReward2: BN;
    let receivedReward2: BN;

    before(async function () {
      await solace.connect(governor).mint(optionsFarming.address, ONE_MILLION_ETHER);
      await optionsFarming.connect(governor).setSolace(solace.address);
      let solaceIsToken0 = BN.from(solace.address).lt(BN.from(weth.address));
      await optionsFarming.connect(governor).setSolaceEthPool(solaceEthPool.address, solaceIsToken0, 0);
    });

    beforeEach(async function () {
      await solace.connect(farmer1).transfer(governor.address, await solace.balanceOf(farmer1.address));
      await solace.connect(farmer2).transfer(governor.address, await solace.balanceOf(farmer2.address));
      // get referrence timestamp
      await provider.send("evm_mine", []);
      initTime = (await provider.getBlock('latest')).timestamp;
      startTime = initTime + 200;
      endTime = initTime + 1000;
      farm = (await deployContract(deployer, artifacts.SptFarm, [governor.address, registry.address, startTime, endTime])) as SptFarm;
      await farmController.connect(governor).registerFarm(farm.address, allocPoints);
      farmID = await farmController.numFarms();

      await product.connect(farmer1)._buyPolicy(farmer1.address, coverAmount1, duration, ZERO_ADDRESS);
      policyID1 = await policyManager.totalPolicyCount();
      await product.connect(farmer2)._buyPolicy(farmer2.address, coverAmount2, duration, ZERO_ADDRESS);
      policyID2 = await policyManager.totalPolicyCount();
      await product.connect(farmer1)._buyPolicy(farmer2.address, coverAmount3, duration, ZERO_ADDRESS);
      policyID3 = await policyManager.totalPolicyCount();
    });

    afterEach(async function () {
      await farmController.connect(governor).setAllocPoints(farmID, 0); // remember to deallocate dead farms
      expect(await farmController.totalAllocPoints()).to.equal(0);
    });

    it("provides rewards to only farmer", async function () {
      // deposit before start
      const { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm.address, policyID1, deadline);
      await farm.connect(farmer1).depositPolicySigned(farmer1.address, policyID1, deadline, v, r, s);
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
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm.address, policyID1, deadline);
      await farm.connect(farmer1).depositPolicySigned(farmer1.address, policyID1, deadline, v, r, s);
      timestamp = startTime + 100;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      // add farmer 2
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer2, policyManager, farm.address, policyID2, deadline);
      await farm.connect(farmer2).depositPolicySigned(farmer2.address, policyID2, deadline, v, r, s);
      timestamp += 100;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await farm.pendingRewards(farmer1.address));
      expectedReward1 = bnAddSub([
        bnMulDiv([solacePerSecond, 100, policyValue1], [policyValue1]), // 100% ownership for 100 seconds
        bnMulDiv([solacePerSecond, 100, policyValue1], [policyValue12]), // 20% ownership for 100 seconds
      ]);
      expect(pendingReward1).to.eq(expectedReward1);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await farm.pendingRewards(farmer2.address));
      expectedReward2 = bnMulDiv([solacePerSecond, 100, policyValue2], [policyValue12]), // 80% ownership for 100 seconds
      expect(pendingReward2).to.eq(expectedReward2);
      // farmer 2 deposit more
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer2, policyManager, farm.address, policyID3, deadline);
      await farm.connect(farmer2).depositPolicySigned(farmer2.address, policyID3, deadline, v, r, s);
      timestamp += 200;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await farm.pendingRewards(farmer1.address));
      expectedReward1 = expectedReward1.add(
        bnMulDiv([solacePerSecond, 200, policyValue1], [policyValue123]), // 5% ownership for 200 seconds
      );
      expectClose(pendingReward1, expectedReward1, solacePerSecond);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await farm.pendingRewards(farmer2.address));
      expectedReward2 = expectedReward2.add(
        bnMulDiv([solacePerSecond, 200, policyValue23], [policyValue123]), // 95% ownership for 200 seconds
      );
      expectClose(pendingReward2, expectedReward2, solacePerSecond);
    });
    it("does not distribute rewards before farm start", async function () {
      const { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm.address, policyID1, deadline);
      await farm.connect(farmer1).depositPolicySigned(farmer1.address, policyID1, deadline, v, r, s);
      await provider.send("evm_setNextBlockTimestamp", [startTime]);
      await provider.send("evm_mine", []);
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
    });
    it("does not distribute rewards after farm end", async function () {
      const { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm.address, policyID1, deadline);
      await farm.connect(farmer1).depositPolicySigned(farmer1.address, policyID1, deadline, v, r, s);
      await provider.send("evm_setNextBlockTimestamp", [endTime]);
      await provider.send("evm_mine", []);
      let pendingReward1 = await farm.pendingRewards(farmer1.address);
      await provider.send("evm_setNextBlockTimestamp", [endTime+1000]);
      await provider.send("evm_mine", []);
      let pendingReward2 = await farm.pendingRewards(farmer1.address);
      expect(pendingReward1).to.equal(pendingReward2);
    });
    it("allows farmers to cash out after farm end", async function () {
      // deposit before start
      const { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm.address, policyID1, deadline);
      await farm.connect(farmer1).depositPolicySigned(farmer1.address, policyID1, deadline, v, r, s);
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
      await provider.send("evm_setNextBlockTimestamp", [endTime+1000]);
      await provider.send("evm_mine", []);
      let pendingRewards = await farm.pendingRewards(farmer1.address);
      let expectedRewards = bnMulDiv([solacePerSecond, 800]); // 100% ownership for 800 seconds
      expect(pendingRewards).to.equal(expectedRewards);
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
      // withdraw stake
      let stake = await farm.userStaked(farmer1.address);
      await farm.connect(farmer1).withdrawPolicy(policyID1);
      expect(await farm.userStaked(farmer1.address)).to.equal(0);
      pendingRewards = await farm.pendingRewards(farmer1.address);
      expect(pendingRewards).to.equal(0);
      let numOptions = await optionsFarming.numOptions();
      await expect(farm.connect(farmer1).withdrawRewards()).to.be.revertedWith("no zero value options");
      expect(await optionsFarming.numOptions()).to.eq(numOptions);
    });
    it("allows farmers to cash out before farm end", async function () {
      // deposit before start
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm.address, policyID1, deadline);
      await farm.connect(farmer1).depositPolicySigned(farmer1.address, policyID1, deadline, v, r, s);
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
      await provider.send("evm_setNextBlockTimestamp", [startTime+100]);
      await provider.send("evm_mine", []);
      let pendingRewards = await farm.pendingRewards(farmer1.address);
      let expectedRewards = bnMulDiv([solacePerSecond, 100]); // 100% ownership for 100 seconds
      expect(pendingRewards).to.equal(expectedRewards);
      let tx = await farm.connect(farmer1).withdrawRewards();
      let optionID = await optionsFarming.numOptions();
      expect(tx).to.emit(optionsFarming, "OptionCreated").withArgs(optionID);
      expect(await farm.userStaked(farmer1.address)).to.equal(policyValue1);
      let option = await optionsFarming.getOption(optionID);
      expectedRewards = bnMulDiv([solacePerSecond, 101]); // 100% ownership for 101 seconds
      expect(option.rewardAmount).to.equal(expectedRewards);
      let expectedStrikePrice = await optionsFarming.calculateStrikePrice(expectedRewards);
      expect(option.strikePrice).to.equal(expectedStrikePrice);
      let balancesBefore = await getBalances(farmer1, farm);
      await optionsFarming.connect(farmer1).exerciseOption(optionID, {value: option.strikePrice});
      let balancesAfter = await getBalances(farmer1, farm);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.userSolace).to.equal(expectedRewards);
      // double withdraw rewards
      await provider.send("evm_setNextBlockTimestamp", [startTime+300]);
      await provider.send("evm_mine", []);
      pendingRewards = await farm.pendingRewards(farmer1.address);
      expectedRewards = bnMulDiv([solacePerSecond, 199]); // 100% ownership for 199 more seconds
      expect(pendingRewards).to.equal(expectedRewards);
      tx = await farm.connect(farmer1).withdrawRewards();
      optionID = await optionsFarming.numOptions();
      expect(tx).to.emit(optionsFarming, "OptionCreated").withArgs(optionID);
      option = await optionsFarming.getOption(optionID);
      expectedRewards = bnMulDiv([solacePerSecond, 200]); // 100% ownership for 200 more seconds
      expect(option.rewardAmount).to.equal(expectedRewards);
      expectedStrikePrice = await optionsFarming.calculateStrikePrice(expectedRewards);
      expect(option.strikePrice).to.equal(expectedStrikePrice);
      // increase balance
      await policyManager.connect(farmer2).transfer(farmer1.address, policyID2);
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm.address, policyID2, deadline);
      await farm.connect(farmer1).depositPolicySigned(farmer1.address, policyID2, deadline, v, r, s);
      expect(await farm.userStaked(farmer1.address)).to.equal(policyValue12);
      await provider.send("evm_setNextBlockTimestamp", [startTime+325]);
      await provider.send("evm_mine", []);
      pendingRewards = await farm.pendingRewards(farmer1.address);
      expectedRewards = bnMulDiv([solacePerSecond, 24]); // 100% ownership for 24 more seconds
      tx = await farm.connect(farmer1).withdrawRewards();
      optionID = await optionsFarming.numOptions();
      expect(tx).to.emit(optionsFarming, "OptionCreated").withArgs(optionID);
      option = await optionsFarming.getOption(optionID);
      expectedRewards = bnMulDiv([solacePerSecond, 25]); // 100% ownership for 25 more seconds
      expect(option.rewardAmount).to.equal(expectedRewards);
      expectedStrikePrice = await optionsFarming.calculateStrikePrice(expectedRewards);
      expect(option.strikePrice).to.equal(expectedStrikePrice);
      // decrease balance
      await farm.connect(farmer1).withdrawPolicy(policyID1);
      expect(await farm.userStaked(farmer1.address)).to.equal(policyValue2);
      await provider.send("evm_setNextBlockTimestamp", [startTime+345]);
      await provider.send("evm_mine", []);
      pendingRewards = await farm.pendingRewards(farmer1.address);
      expectedRewards = bnMulDiv([solacePerSecond, 19]); // 100% ownership for 19 more seconds
      tx = await farm.connect(farmer1).withdrawRewards();
      optionID = await optionsFarming.numOptions();
      expect(tx).to.emit(optionsFarming, "OptionCreated").withArgs(optionID);
      option = await optionsFarming.getOption(optionID);
      expectedRewards = bnMulDiv([solacePerSecond, 20]); // 100% ownership for 20 more seconds
      expect(option.rewardAmount).to.equal(expectedRewards);
      expectedStrikePrice = await optionsFarming.calculateStrikePrice(expectedRewards);
      expect(option.strikePrice).to.equal(expectedStrikePrice);
      // withdraw stake
      await provider.send("evm_setNextBlockTimestamp", [startTime+374]);
      await provider.send("evm_mine", []);
      let stake = await farm.userStaked(farmer1.address);
      expect(stake).to.equal(policyValue2);
      await farm.connect(farmer1).withdrawPolicy(policyID2);
      expect(await farm.userStaked(farmer1.address)).to.equal(0);
      pendingRewards = await farm.pendingRewards(farmer1.address);
      expectedRewards = bnMulDiv([solacePerSecond, 29]); // 100% ownership for 29 seconds
      expect(pendingRewards).to.equal(expectedRewards);
      tx = await farm.connect(farmer1).withdrawRewards();
      optionID = await optionsFarming.numOptions();
      expect(tx).to.emit(optionsFarming, "OptionCreated").withArgs(optionID);
      option = await optionsFarming.getOption(optionID);
      expect(option.rewardAmount).to.equal(expectedRewards);
      expectedStrikePrice = await optionsFarming.calculateStrikePrice(expectedRewards);
      expect(option.strikePrice).to.equal(expectedStrikePrice);
    });
    it("non farmers cannot cash out", async function () {
      let pendingRewards = await farmController.pendingRewards(deployer.address);
      expect(pendingRewards).to.equal(0);
      await expect(farm.connect(deployer).withdrawRewards()).to.be.revertedWith("no zero value options");
    });
  });

  describe("updateActivePolicies", function () {
    before(async function () {
      product = (await deployContract(deployer, artifacts.MockProduct, [deployer.address, policyManager.address, registry.address, coveredPlatform.address, 0, 100000000000, price])) as MockProduct;
      await policyManager.connect(governor).addProduct(product.address);
      await riskManager.connect(governor).addProduct(product.address, 1, price, 1);
    });
    it("can update no policies", async function () {
      await farm1.updateActivePolicies([]);
    });
    it("can update active policies", async function () {
      // policy 1 expires
      let balances1 = await getBalances(farmer1, farm1);
      await product.connect(farmer1)._buyPolicy(farmer1.address, 0b000001, 110, ZERO_ADDRESS);
      let policyID1 = await policyManager.totalPolicyCount();
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm1.address, policyID1, deadline);
      await farm1.connect(farmer1).depositPolicySigned(farmer1.address, policyID1, deadline, v, r, s);
      // policy 2 expires
      await product.connect(farmer1)._buyPolicy(farmer1.address, 0b000010, 120, ZERO_ADDRESS);
      let policyID2 = await policyManager.totalPolicyCount();
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm1.address, policyID2, deadline);
      await farm1.connect(farmer1).depositPolicySigned(farmer1.address, policyID2, deadline, v, r, s);
      // policy 3 expires but is not updated
      await product.connect(farmer1)._buyPolicy(farmer1.address, 0b000100, 130, ZERO_ADDRESS);
      let policyID3 = await policyManager.totalPolicyCount();
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm1.address, policyID3, deadline);
      await farm1.connect(farmer1).depositPolicySigned(farmer1.address, policyID3, deadline, v, r, s);
      // policy 4 does not expire
      await product.connect(farmer1)._buyPolicy(farmer1.address, 0b001000, 200, ZERO_ADDRESS);
      let policyID4 = await policyManager.totalPolicyCount();
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm1.address, policyID4, deadline);
      await farm1.connect(farmer1).depositPolicySigned(farmer1.address, policyID4, deadline, v, r, s);
      // policy 5 is canceled
      await product.connect(farmer1)._buyPolicy(farmer1.address, 0b010000, 300, ZERO_ADDRESS);
      let policyID5 = await policyManager.totalPolicyCount();
      var { v, r, s } = await getPermitErc721EnhancedSignature(farmer1, policyManager, farm1.address, policyID5, deadline);
      await farm1.connect(farmer1).depositPolicySigned(farmer1.address, policyID5, deadline, v, r, s);
      // policy 6 is expired but was never staked
      await product.connect(farmer1)._buyPolicy(farmer1.address, 0b100000, 120, ZERO_ADDRESS);
      let policyID6 = await policyManager.totalPolicyCount();
      // pass time
      await burnBlocks(150);
      expect(await product.activeCoverAmount()).to.equal(0b111111);
      await farm1.connect(farmer1).withdrawPolicy(policyID5);
      await product.connect(farmer1).cancelPolicy(policyID5);
      let balances2 = await getBalances(farmer1, farm1);
      expect(await product.activeCoverAmount()).to.equal(0b101111);
      // update policies
      await farm1.updateActivePolicies([policyID1, policyID2, policyID4, policyID5, policyID6, 999]);
      expect(await policyManager.exists(policyID1)).to.be.false;
      expect(await policyManager.exists(policyID2)).to.be.false;
      expect(await policyManager.exists(policyID3)).to.be.true;
      expect(await policyManager.exists(policyID4)).to.be.true;
      expect(await policyManager.exists(policyID5)).to.be.false;
      expect(await policyManager.exists(policyID6)).to.be.false;
      expect(await product.activeCoverAmount()).to.equal(0b001100);
      let balances3 = await getBalances(farmer1, farm1);
      let balancesDiff13 = getBalancesDiff(balances3, balances1);
      expect(balancesDiff13.farmSpt).eq(2);
      expect(balancesDiff13.userSpt).eq(0);
      expect(balancesDiff13.userStaked).eq(0b001100*price);
      expect(balancesDiff13.farmStake).eq(0b001100*price);
      let balancesDiff23 = getBalancesDiff(balances3, balances2);
      expect(balancesDiff23.farmSpt).eq(-2);
      expect(balancesDiff23.userSpt).eq(-1);
      expect(balancesDiff23.userStaked).eq(-0b000011*price);
      expect(balancesDiff23.farmStake).eq(-0b000011*price);
    });
  });

  describe("edge cases", function () {
    let farm4: SptFarm;
    before(async function () {
      farm4 = (await deployContract(deployer, artifacts.SptFarm, [governor.address, registry.address, 0, 1000])) as SptFarm;
    });
    it("can setRewards", async function () {
      await farmController.connect(governor).setRewardPerSecond(solacePerSecond);
    });
    it("rejects setRewards by non farmController", async function () {
      await expect(farm4.connect(governor).setRewards(ONE_MILLION_ETHER)).to.be.revertedWith("!farmcontroller");
      await expect(farm4.connect(farmer1).setRewards(ONE_MILLION_ETHER)).to.be.revertedWith("!farmcontroller");
    });
    it("can getRewardAmountDistributed", async function () {
      await farmController.connect(governor).registerFarm(farm4.address, 1);
      let rewardPerSecond = await farm4.rewardPerSecond();
      expect(await farm4.getRewardAmountDistributed(20, 30)).to.equal(rewardPerSecond.mul(10));
      expect(await farm4.getRewardAmountDistributed(30, 20)).to.equal(0);
    });
    it("can withdraw rewards via farmcontroller", async function () {
      expect(await farm1.farmController()).to.eq(farmController.address);
      expect(await optionsFarming.farmController()).to.eq(farmController.address);
      await farmController.connect(farmer1).farmOptionMulti();
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

  interface Balances {
    userEth: BN;
    userWeth: BN;
    userSpt: BN;
    userStaked: BN;
    userPendingRewards: BN;
    userSolace: BN;
    farmSpt: BN;
    farmStake: BN;
    optionsFarmingSolace: BN;
  }

  async function getBalances(user: Wallet, farm: SptFarm): Promise<Balances> {
    return {
      userEth: await user.getBalance(),
      userWeth: await weth.balanceOf(user.address),
      userSpt: await policyManager.balanceOf(user.address),
      userStaked: await farm.userStaked(user.address),
      userPendingRewards: await farm.pendingRewards(user.address),
      userSolace: await solace.balanceOf(user.address),
      farmSpt: await policyManager.balanceOf(farm.address),
      farmStake: await farm.valueStaked(),
      optionsFarmingSolace: await solace.balanceOf(optionsFarming.address)
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userEth: balances1.userEth.sub(balances2.userEth),
      userWeth: balances1.userWeth.sub(balances2.userWeth),
      userSpt: balances1.userSpt.sub(balances2.userSpt),
      userStaked: balances1.userStaked.sub(balances2.userStaked),
      userPendingRewards: balances1.userPendingRewards.sub(balances2.userPendingRewards),
      userSolace: balances1.userSolace.sub(balances2.userSolace),
      farmSpt: balances1.farmSpt.sub(balances2.farmSpt),
      farmStake: balances1.farmStake.sub(balances2.farmStake),
      optionsFarmingSolace: balances1.optionsFarmingSolace.sub(balances2.optionsFarmingSolace)
    };
  }

  // mints an lp token by provIDing liquidity
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
    let tokenID = await lpToken.totalSupply();
    return tokenID;
  }
});
