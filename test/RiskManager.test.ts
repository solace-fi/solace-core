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
  const [deployer, governor, user, product1, product2, product3, solace, solaceUsdcPool, priceOracle] = provider.getWallets();

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
  const ONE_ETH = BN.from("1000000000000000000");

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    weth = (await deployContract(deployer,artifacts.WETH)) as Weth9;
    await registry.connect(governor).setWeth(weth.address);
    vault = (await deployContract(deployer,artifacts.Vault,[deployer.address,registry.address])) as Vault;
    await registry.connect(governor).setVault(vault.address);
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address, registry.address])) as PolicyManager;
    await registry.connect(governor).setPolicyManager(policyManager.address);
    await registry.connect(governor).setSolace(solace.address);
    coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry.address, priceOracle.address, solaceUsdcPool.address])) as CoverageDataProvider;
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

    await deployer.sendTransaction({to: vault.address, value: ONE_ETH });

  });

  describe("deployment", function () {
    it("should revert if registry is zero address", async function () {
      await expect(deployContract(deployer, artifacts.RiskManager, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address registry");
    });

    it("should start with correct risk strategy count", async function() {
      expect(await riskManager.connect(user).numStrategies()).eq(0)
    });

    it("should start with correct weightsum", async function() {
      expect(await riskManager.connect(user).weightSum()).eq(BN.from(2).pow(32).sub(1))
    });

    it("should start with correct active cover limit", async function() {
      expect(await riskManager.connect(user).activeCoverLimit()).to.eq(0);
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

    it("rejects adding active cover limit updater for non governor", async function () {
      await expect(riskManager.connect(user).addCoverLimitUpdater(policyManager.address)).to.revertedWith("!governance");
    });

    it("reject removing active cover limit updater for non governance", async function () {
      await expect(riskManager.connect(user).removeCoverLimitUpdater(policyManager.address)).to.revertedWith("!governance");
    });

    it("reject adding active cover limit updater for zero address", async function() {
      await expect(riskManager.connect(governor).addCoverLimitUpdater(ZERO_ADDRESS)).to.revertedWith("zero address coverlimit updater");
    });

    it("reject adding active cover limit updater for zero address", async function() {
      await expect(riskManager.connect(governor).removeCoverLimitUpdater(ZERO_ADDRESS)).to.revertedWith("zero address coverlimit updater");
    });

    it("can add new active cover limit updater", async function() {
      let tx = await riskManager.connect(governor).addCoverLimitUpdater(policyManager.address);
      await expect(tx).to.emit(riskManager, "CoverLimitUpdaterAdded").withArgs(policyManager.address);
      expect(await riskManager.connect(user).canUpdateCoverLimit(policyManager.address)).to.eq(true);
    });

    it("can remove active cover limit updater", async function() {
      await riskManager.connect(governor).addCoverLimitUpdater(user.address);
      expect(await riskManager.connect(user).canUpdateCoverLimit(user.address)).to.eq(true);
      let tx = await riskManager.connect(governor).removeCoverLimitUpdater(user.address);
      await expect(tx).to.emit(riskManager, "CoverLimitUpdaterDeleted").withArgs(user.address);
      expect(await riskManager.connect(user).canUpdateCoverLimit(user.address)).to.eq(false);
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
      let tx = await riskManager.connect(governor).addRiskStrategy(riskStrategy.address);
      expect(tx).to.emit(riskManager, "StrategyAdded").withArgs(riskStrategy.address);
      expect(await riskManager.connect(user).numStrategies()).to.eq(1);
      expect(await riskManager.connect(user).strategyIsActive(riskStrategy.address)).to.eq(false);
      expect(await riskManager.connect(user).strategyAt(1)).to.equal(riskStrategy.address);
      expect(await riskManager.connect(user).maxCoverPerStrategy(riskStrategy.address)).to.eq(0);
    });

    it("cannot add duplicate strategy", async function() {
      await expect(riskManager.connect(governor).addRiskStrategy(riskStrategy.address)).to.be.revertedWith("duplicate strategy");
    });

    it("can get strategy info", async function() {
      let id = BN.from(1)
      let weight = BN.from(0);
      let status = STRATEGY_STATUS_INACTIVE;
      let info = await riskManager.connect(user).strategyInfo(riskStrategy.address);
      expect(info.id).to.eq(id);
      expect(info.weight).to.eq(weight);
      expect(info.status).to.eq(status);
      expect(info.timestamp).to.gt(0);
    });
  });

  describe("setStrategyStatus", function() {
    it("starts with inactive risk strategy", async function() {
      expect(await riskManager.connect(user).strategyIsActive(riskStrategy.address)).to.eq(false);
    });

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
      expect(await riskManager.connect(user).strategyIsActive(riskStrategy.address)).to.eq(true);
    });
  });

  describe("setWeightAllocation", function() {
    before(async function() {
      expect(await riskManager.connect(user).strategyIsActive(riskStrategy.address)).to.eq(true);
      expect(await riskManager.connect(user).weightSum()).eq(BN.from(2).pow(32).sub(1))
      expect(await riskManager.connect(user).weightPerStrategy(riskStrategy.address)).eq(0)
      expect(await riskManager.connect(user).maxCoverPerStrategy(riskStrategy.address)).eq(0)
    });

    it("cannot set weight by non governance", async function() {
      await expect(riskManager.connect(user).setWeightAllocation(riskStrategy.address, 1000)).to.be.revertedWith("!governance");
    });

    it("cannot set weight for inactive strategy", async function() {
      await expect(riskManager.connect(governor).setWeightAllocation(user.address, 1000)).to.be.revertedWith("inactive strategy");
    });

    it("cannot set invalid weight", async function() {
      await expect(riskManager.connect(governor).setWeightAllocation(riskStrategy.address, 0)).to.be.revertedWith("invalid weight!");
    });

    it("can set weight", async function() {
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, STRATEGY_STATUS_ACTIVE);
      let tx = await riskManager.connect(governor).setWeightAllocation(riskStrategy.address, 1000);
      expect(tx).to.emit(riskManager, "RiskStrategyWeightAllocationSet").withArgs(riskStrategy.address, 1000);
      expect(await riskManager.connect(user).weightSum()).eq(1000)
      expect(await riskManager.connect(user).weightPerStrategy(riskStrategy.address)).eq(1000)
      expect(await riskManager.connect(user).maxCoverPerStrategy(riskStrategy.address)).eq(await riskManager.connect(user).maxCover())
    });

    it("cannot set weight if allocation drops under the strategy mcr", async function() {
      let maxCover = await riskManager.connect(governor).maxCover();
      let maxCoverPerStrategy = await riskManager.connect(governor).maxCoverPerStrategy(riskStrategy.address);
      expect(maxCover).to.gt(0);
      expect(maxCoverPerStrategy).to.gt(0);

      // policy id = 1
      await policyManager.connect(product1).createPolicy(user.address, maxCover.mul(2), 0, 0, ZERO_ADDRESS, riskStrategy.address);
      expect(await riskManager.connect(user).minCapitalRequirementPerStrategy(riskStrategy.address)).to.eq(maxCover.mul(2));
      await expect(riskManager.connect(governor).setWeightAllocation(riskStrategy.address, 1)).to.be.revertedWith("invalid weight allocation");
      await policyManager.connect(product1).burn(1);
    });
  });

  describe("max cover amount", function () {
    it("can cover", async function () {
      expect(await vault.totalAssets()).to.equal(ONE_ETH);
      expect(await riskManager.maxCover()).to.equal(ONE_ETH);
      expect(await riskManager.maxCoverPerStrategy(riskStrategy.address)).to.equal(ONE_ETH);
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
      // policy id = 2
      await policyManager.connect(product2).createPolicy(user.address, 1, 0, 0, ZERO_ADDRESS, riskStrategy.address);
      expect(await riskManager.minCapitalRequirement()).to.equal(1);

      // policy id = 3
      await policyManager.connect(product3).createPolicy(user.address, 2, 0, 0, ZERO_ADDRESS, riskStrategy.address);
      expect(await riskManager.minCapitalRequirement()).to.equal(3);

      await policyManager.connect(product3).updatePolicyInfo(3, 4, 0, 0, riskStrategy.address);
      expect(await riskManager.minCapitalRequirement()).to.equal(5);
     
      await policyManager.connect(product2).burn(2);
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

});