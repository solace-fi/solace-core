import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet, utils } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { RiskManager, Registry, Vault, Weth9, PolicyManager, MockProductV2, CoverageDataProvider, ProductFactory, RiskStrategy, MockRiskStrategy } from "../typechain";

const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("MockProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const DOMAIN_NAME = "Solace.fi-MockProduct";

describe("RiskManager", function () {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, product1, product2, product3, coveredPlatform] = provider.getWallets();

  // solace contracts
  let registry: Registry;
  let vault: Vault;
  let policyManager: PolicyManager;
  let riskManager: RiskManager;
  let riskStrategy: RiskStrategy;
  let riskStrategyFactory: Contract;
  let coverageDataProvider: CoverageDataProvider;
  let productFactory: ProductFactory;
  let product4: MockProductV2;
  let product5: MockProductV2;
  let product6: MockProductV2;

  let weth: Weth9;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const STRATEGY_STATUS_ACTIVE = 1;
  const STRATEGY_STATUS_INACTIVE = 0;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    weth = (await deployContract(deployer,artifacts.WETH)) as Weth9;
    await registry.connect(governor).setWeth(weth.address);
    vault = (await deployContract(deployer,artifacts.Vault,[deployer.address,registry.address])) as Vault;
    await registry.connect(governor).setVault(vault.address);
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
    await registry.connect(governor).setPolicyManager(policyManager.address);
    coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [registry.address])) as CoverageDataProvider;
    await registry.connect(governor).setCoverageDataProvider(coverageDataProvider.address);
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
    await registry.connect(governor).setRiskManager(riskManager.address);

    // deploy product factory
    productFactory = (await deployContract(deployer, artifacts.ProductFactory)) as ProductFactory;

    // deploy risk strategy factory
    let riskStrategyContractFactory = await ethers.getContractFactory("RiskStrategyFactory", deployer);
    riskStrategyFactory = (await riskStrategyContractFactory.deploy(registry.address, governor.address));
    await riskStrategyFactory.deployed();

    // create product4
    let baseProduct4 = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;
    let tx1 = await productFactory.createProduct(baseProduct4.address, governor.address, registry.address, 0, 1000, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
    let events1 = (await tx1.wait())?.events;
    if(events1 && events1.length > 0) {
      let event1 = events1[0];
      product4 = await ethers.getContractAt(artifacts.MockProductV2.abi, event1?.args?.["deployment"]) as MockProductV2;
    } else throw "no deployment";

    // create product5
    let baseProduct5 = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;
    let tx2 = await productFactory.createProduct(baseProduct5.address, governor.address, registry.address, 0, 1000, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
    let events2 = (await tx2.wait())?.events;
    if(events2 && events2.length > 0) {
      let event2 = events2[0];
      product5 = await ethers.getContractAt(artifacts.MockProductV2.abi, event2?.args?.["deployment"]) as MockProductV2;
    } else throw "no deployment";

    // create product6
    let baseProduct6 = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;
    let tx3 = await productFactory.createProduct(baseProduct6.address, governor.address, registry.address, 0, 1000, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
    let events3 = (await tx3.wait())?.events;
    if(events3 && events3.length > 0) {
      let event3 = events3[0];
      product6 = await ethers.getContractAt(artifacts.MockProductV2.abi, event3?.args?.["deployment"]) as MockProductV2;
    } else throw "no deployment";


    // create risk strategy for products
    let baseRiskStrategy = (await deployContract(deployer, artifacts.MockRiskStrategy)) as MockRiskStrategy;
    let tx = await riskStrategyFactory.createRiskStrategy(baseRiskStrategy.address, [product4.address, product5.address, product6.address],[1,2,3],[10000,10000,10000],[1,1,1]);

    let events = (await tx.wait())?.events;
    if (events && events.length > 0) {
      let event = events[0];
      riskStrategy = await ethers.getContractAt(artifacts.MockRiskStrategy.abi, event?.args?.["deployment"]) as MockRiskStrategy;
    } else {
      throw "no risk strategy deployment!";
    }


    await policyManager.connect(governor).addProduct(product1.address);
    await policyManager.connect(governor).addProduct(product2.address);
    await policyManager.connect(governor).addProduct(product3.address);
    await policyManager.connect(governor).addProduct(product4.address);
    await policyManager.connect(governor).addProduct(product5.address);
    await policyManager.connect(governor).addProduct(product6.address);
  });

  describe("deployment", function () {
    it("should revert if registry is zero address", async function () {
      await expect(deployContract(deployer, artifacts.RiskManager, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address registry");
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await riskManager.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function () {
      await expect(riskManager.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function () {
      let tx = await riskManager.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(riskManager, "GovernancePending").withArgs(deployer.address);
      expect(await riskManager.governance()).to.equal(governor.address);
      expect(await riskManager.pendingGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async function () {
      await expect(riskManager.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async function () {
      let tx = await riskManager.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(riskManager, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await riskManager.governance()).to.equal(deployer.address);
      expect(await riskManager.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await riskManager.connect(deployer).setPendingGovernance(governor.address);
      await riskManager.connect(governor).acceptGovernance();
    });
  });

  describe("max cover amount", function () {
    it("no assets no cover", async function () {
      expect(await vault.totalAssets()).to.equal(0);
      expect(await riskManager.maxCover()).to.equal(0);
    });

    it("can cover", async function () {
      let depositAmount = BN.from("1000000000000000000");
      await vault.connect(user).depositEth({value:depositAmount});
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await riskManager.maxCover()).to.equal(depositAmount);
    });
  });

  describe("partialReservesFactor", function () {
    it("starts at 10000 bps", async function () {
      expect(await riskManager.partialReservesFactor()).to.equal(10000);
    });

    it("cannot be set by non governance", async function () {
      await expect(riskManager.connect(user).setPartialReservesFactor(1)).to.be.revertedWith("!governance");
    });

    it("can be set", async function () {
      // set
      let tx = await riskManager.connect(governor).setPartialReservesFactor(5000);
      expect(tx).to.emit(riskManager, "PartialReservesFactorSet").withArgs(5000);
      expect(await riskManager.partialReservesFactor()).to.equal(5000);
      // reset
      await riskManager.connect(governor).setPartialReservesFactor(10000);
    });
  });

  describe("minCapitalRequirement", function () {
    it("should start at zero", async function () {
      expect(await riskManager.minCapitalRequirement()).to.equal(0);
    });
    it("should track policy cover amount", async function () {
      await policyManager.connect(product2).createPolicy(user.address, 1, 0, 0, ZERO_ADDRESS, riskStrategy.address);
      expect(await riskManager.minCapitalRequirement()).to.equal(1);
      await policyManager.connect(product3).createPolicy(user.address, 2, 0, 0, ZERO_ADDRESS, riskStrategy.address);
      expect(await riskManager.minCapitalRequirement()).to.equal(3);
      await policyManager.connect(product3).updatePolicyInfo(2, 4, 0, 0, riskStrategy.address);
      expect(await riskManager.minCapitalRequirement()).to.equal(5);
      await policyManager.connect(product2).burn(1);
      expect(await riskManager.minCapitalRequirement()).to.equal(4);
    });
    it("should leverage", async function () {
      await riskManager.connect(governor).setPartialReservesFactor(5000);
      expect(await riskManager.minCapitalRequirement()).to.equal(2);
      await policyManager.connect(product3).createPolicy(user.address, 9, 0, 0, ZERO_ADDRESS, riskStrategy.address);
      expect(await riskManager.minCapitalRequirement()).to.equal(6);
      await riskManager.connect(governor).setPartialReservesFactor(7500);
      expect(await riskManager.minCapitalRequirement()).to.equal(9);
    });
  });

  describe("addRiskStrategy", function() {
    it("cannot add risk strategy by non governance", async function() {
      await expect(riskManager.connect(user).addRiskStrategy(riskStrategy.address)).to.be.revertedWith("!governance");
    });

    it("cannot add zero address strategy", async function() {
      await expect(riskManager.connect(governor).addRiskStrategy(ZERO_ADDRESS)).to.be.revertedWith("zero address strategy");
    });

    it("can add risk strategy", async function() {
      let prevStrategyCount = await riskManager.connect(user).numStrategies();
      let tx = await riskManager.connect(governor).addRiskStrategy(riskStrategy.address);
      // should emit event
      expect(tx).to.emit(riskManager, "StrategyAdded").withArgs(riskStrategy.address);
      // strategy count should be increased
      let strategyCount = await riskManager.connect(user).numStrategies();
      expect(prevStrategyCount.add(1)).to.eq(strategyCount);
      // strategy status should be inactive(by default INACTIVE=0. ACTIVE=1)
      expect(await riskManager.connect(user).strategyIsActive(riskStrategy.address)).to.eq(false);
      // index to strategy should be correct
      expect(await riskManager.connect(user).strategyAt(strategyCount)).to.equal(riskStrategy.address);
    });

    it("cannot add duplicate strategy", async function() {
      await expect(riskManager.connect(governor).addRiskStrategy(riskStrategy.address)).to.be.revertedWith("duplicate strategy");
    });

    it("can get strategy info", async function() {
      let id = BN.from(1)
      let strategyAddress = riskStrategy.address;
      let strategist = deployer.address;
      let weight = BN.from(0);
      let status = STRATEGY_STATUS_INACTIVE;
      let info = await riskManager.connect(user).strategyInfo(riskStrategy.address);
      expect(info.id).to.eq(id);
      expect(info.strategyAddress).to.equal(strategyAddress);
      expect(info.strategist).to.equal(strategist);
      expect(info.weight).to.eq(weight);
      expect(info.status).to.eq(status);
      expect(info.timestamp).to.gt(0);
    });
  });

  describe("setWeightAllocation", function() {
    before(async function() {
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, STRATEGY_STATUS_INACTIVE);
      let vaultAmount = await vault.totalAssets();
    });

    it("cannot set weight by non governance", async function() {
      await expect(riskManager.connect(user).setWeightAllocation(riskStrategy.address, 1000)).to.be.revertedWith("!governance");
    });

    it("cannot set invalid weight", async function() {
      await expect(riskManager.connect(governor).setWeightAllocation(riskStrategy.address, 0)).to.be.revertedWith("invalid weight!");
    });

    it("cannot set weight for inactive strategy", async function() {
      await expect(riskManager.connect(governor).setWeightAllocation(riskStrategy.address, 1000)).to.be.revertedWith("inactive strategy");
    });

    it("can set weight", async function() {
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, STRATEGY_STATUS_ACTIVE);
      let tx = await riskManager.connect(governor).setWeightAllocation(riskStrategy.address, 1000);
      expect(tx).to.emit(riskManager, "RiskStrategyWeightAllocationSet").withArgs(riskStrategy.address, 1000);
    });

    it("cannot set weight if allocation drops under the strategy mcr", async function() {
      let maxCover = await riskManager.connect(governor).maxCover();
      await policyManager.connect(product1).createPolicy(user.address, maxCover.mul(2), 0, 0, ZERO_ADDRESS, riskStrategy.address);
      await expect(riskManager.connect(governor).setWeightAllocation(riskStrategy.address, 1)).to.be.revertedWith("invalid weight allocation");
    });
  });

  describe("setStrategyStatus", function() {
    it("cannot set strategy status by non governance", async function() {
      await expect(riskManager.connect(user).setStrategyStatus(riskStrategy.address, STRATEGY_STATUS_ACTIVE)).to.be.revertedWith("!governance");
    });

    it("cannot set status for zero address strategy", async function() {
      await expect(riskManager.connect(governor).setStrategyStatus(ZERO_ADDRESS, STRATEGY_STATUS_ACTIVE)).to.be.revertedWith("zero address strategy");
    });

    it("cannot set status for non-exist strategy", async function() {
      await expect(riskManager.connect(governor).setStrategyStatus(user.address, STRATEGY_STATUS_ACTIVE)).to.be.revertedWith("non-exist strategy");
    });

    it("can set status", async function() {
      let tx  = await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, STRATEGY_STATUS_ACTIVE);
      expect(tx).to.emit(riskManager, "StrategyStatusUpdated").withArgs(riskStrategy.address, 1);
    });
  });

});
