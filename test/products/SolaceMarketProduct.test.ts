import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, utils, constants, Contract } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { config as dotenv_config } from "dotenv";
dotenv_config();

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { PolicyManager, ProductFactory, MockProductV2, Registry, RiskManager, RiskStrategy, MockRiskStrategy, CoverageDataProvider, MockErc20, BlockGetter } from "../../typechain";
import { toBytes32 } from "../utilities/setStorage";
import { after } from "mocha";

const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("MockProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const DOMAIN_NAME = "Solace.fi-MockProduct";

describe("SolaceMarketProduct", function () {
  let artifacts: ArtifactImports;
  let policyManager: PolicyManager;
  let productFactory: ProductFactory;
  let coverageProduct: MockProductV2;
  let product: MockProductV2;
  let product2: MockProductV2;
  let registry: Registry;
  let riskManager: RiskManager;
  let riskStrategy: RiskStrategy;
  let riskStrategyFactory: Contract;
  let mockRiskStrategy: RiskStrategy;
  let coverageDataProvider: CoverageDataProvider;
  let dai: MockErc20;
  let blockGetter: BlockGetter;
  const [deployer, governor, newGovernor, positionContract, policyholder1, policyholder2, policyholder3, mockPolicyManager, solace, premiumPool] = provider.getWallets();

  const ONE_DAI =  BN.from("1000000000000000000");
  const ONE_MILLION_DAI = ONE_DAI.mul(1000000);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
  const minPeriod1 = 6450; // this is about 1 day
  const maxPeriod1 = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
  const maxCoverLimit1 = ONE_DAI; // 1 DAI in wei
  const maxCoverPerUser1 = ONE_DAI.div(100); // 0.01 DAI in wei
  const coverDivisor1 = 1000;
  const coverDivisor2 = 100;
  const price1 = 10000;

  const threeDays = 19350;
  const minPeriod2 = threeDays;
  const maxPeriod2 = 2354250; // one year
  const maxCoverLimit2 = ONE_DAI.mul(1000); // 1000 DAI in wei
  const price2 = 11044; // 2.60%/yr

  const coverLimit = ONE_DAI; // 1 DAI
  const blocks = BN.from(threeDays);
  const expectedPremium = BN.from("213701400000000");

  let snapshot: BN;

  before(async function () {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    blockGetter = (await deployContract(deployer, artifacts.BlockGetter)) as BlockGetter;

    // deploy registry
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;

    // deploy policy manager
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address, registry.address])) as PolicyManager;
    await registry.connect(governor).set(["policyManager"],[policyManager.address]);

    // deploy risk manager
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
    await registry.connect(governor).set(["riskManager"],[riskManager.address]);
    await riskManager.connect(governor).addCoverLimitUpdater(policyManager.address);

    // set solace
    await registry.connect(governor).set(["solace"],[solace.address]);

    // deploy coverage data provider
    coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address])) as CoverageDataProvider;
    await coverageDataProvider.connect(governor).set("underwritingPool", ONE_MILLION_DAI);
    await registry.connect(governor).set(["coverageDataProvider"],[coverageDataProvider.address]);
    await registry.connect(governor).set(["premiumPool"], [premiumPool.address]);

    // deploy mock DAI
    dai = (await deployContract(deployer, artifacts.MockERC20, ["Dai Stablecoin", "DAI", ONE_DAI.mul(1000000)])) as MockErc20;
    await registry.connect(governor).set(["dai"], [dai.address]);
    await dai.connect(deployer).transfer(policyholder1.address, ONE_DAI.mul(100000));
    await dai.connect(deployer).transfer(policyholder2.address, ONE_DAI.mul(100000));
    expect(await dai.balanceOf(policyholder1.address)).to.equal(ONE_DAI.mul(100000));
    expect(await dai.balanceOf(policyholder2.address)).to.equal(ONE_DAI.mul(100000));

    // deploy product factory
    productFactory = (await deployContract(deployer, artifacts.ProductFactory)) as ProductFactory;

    // deploy base product
    coverageProduct = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;

    // deploy risk strategy factory
    let riskStrategyContractFactory = await ethers.getContractFactory("RiskStrategyFactory", deployer);
    riskStrategyFactory = (await riskStrategyContractFactory.deploy(registry.address, governor.address));
    await riskStrategyFactory.deployed();

    // deploy base risk strategy
    mockRiskStrategy = (await deployContract(deployer, artifacts.MockRiskStrategy)) as RiskStrategy;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("reverts zero addresses", async function () {
      await expect(productFactory.createProduct(coverageProduct.address, governor.address, ZERO_ADDRESS, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1")).to.be.revertedWith("zero address registry");

      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await expect(productFactory.createProduct(coverageProduct.address, governor.address, registry2.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1")).to.be.revertedWith("key not in mapping");

    });

    it("reverts invalid period", async function () {
      await expect(productFactory.createProduct(coverageProduct.address, governor.address, registry.address, 1000, 999, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1")).to.be.revertedWith("invalid period");
    });

    it("can deploy", async function () {
      let tx1 = await productFactory.createProduct(coverageProduct.address, governor.address, registry.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
      let events1 = (await tx1.wait())?.events;
      if(events1 && events1.length > 0) {
        let event1 = events1[0];
        product = await ethers.getContractAt(artifacts.MockProductV2.abi, event1?.args?.["deployment"]) as MockProductV2;
      } else throw "no deployment";
      await product.connect(governor).setPrice(price1);

      let tx2 = await productFactory.createProduct(coverageProduct.address, governor.address, registry.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
      let events2 = (await tx2.wait())?.events;
      if(events2 && events2.length > 0) {
        let event2 = events2[0];
        product2 = await ethers.getContractAt(artifacts.MockProductV2.abi, event2?.args?.["deployment"]) as MockProductV2;
      } else throw "no deployment";
      await product2.connect(governor).setPrice(price1);
    });

    it("can deploy with create2", async function () {
      let product3: MockProductV2;
      let product4: MockProductV2;

      let predictedAddress1 = await productFactory.calculateMinimalProxyDeploymentAddress(coverageProduct.address, toBytes32(0));
      let tx1 = await productFactory.create2Product(coverageProduct.address, toBytes32(0), governor.address, registry.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
      let events1 = (await tx1.wait())?.events;
      if(events1 && events1.length > 0) {
        let event1 = events1[0];
        product3 = await ethers.getContractAt(artifacts.MockProductV2.abi, event1?.args?.["deployment"]) as MockProductV2;
      } else throw "no deployment";
      expect(product3.address).eq(predictedAddress1);

      let predictedAddress2 = await productFactory.calculateMinimalProxyDeploymentAddress(coverageProduct.address, toBytes32(1));
      let tx2 = await productFactory.create2Product(coverageProduct.address, toBytes32(1), governor.address, registry.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
      let events2 = (await tx2.wait())?.events;
      if(events2 && events2.length > 0) {
        let event2 = events2[0];
        product4 = await ethers.getContractAt(artifacts.MockProductV2.abi, event2?.args?.["deployment"]) as MockProductV2;
      } else throw "no deployment";
      expect(product3.address != product4.address);
      expect(product4.address).eq(predictedAddress2);
    });

    it("cannot redeploy with same salt", async function () {
      await expect(productFactory.create2Product(coverageProduct.address, toBytes32(1), governor.address, registry.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1")).to.be.revertedWith("Factory: failed deployment");
      // todo: how to test failed deployment with create?
    });

    it("cannot reinitialize", async function () {
      await expect(product.connect(governor).initialize(governor.address, registry.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1")).to.be.reverted
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await product.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function () {
      await expect(product.connect(policyholder1).setPendingGovernance(policyholder1.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function () {
      let tx = await product.connect(governor).setPendingGovernance(newGovernor.address);
      expect(tx).to.emit(product, "GovernancePending").withArgs(newGovernor.address);
      expect(await product.governance()).to.equal(governor.address);
      expect(await product.pendingGovernance()).to.equal(newGovernor.address);
    });

    it("rejects governance transfer by non governor", async function () {
      await expect(product.connect(policyholder1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async function () {
      let tx = await product.connect(newGovernor).acceptGovernance();
      await expect(tx)
        .to.emit(product, "GovernanceTransferred")
        .withArgs(governor.address, newGovernor.address);
      expect(await product.governance()).to.equal(newGovernor.address);
      expect(await product.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await product.connect(newGovernor).setPendingGovernance(governor.address);
      await product.connect(governor).acceptGovernance();
    });
  });

  describe("productParameters", function () {
    before(async function () {
      let tx = await riskStrategyFactory.createRiskStrategy(mockRiskStrategy.address, [product.address],[1],[11044],[1]);
      let events = (await tx.wait())?.events;
      if (events && events.length > 0) {
        let event = events[0];
        riskStrategy = await ethers.getContractAt(artifacts.MockRiskStrategy.abi, event?.args?.["deployment"]) as MockRiskStrategy;
      } else {
        throw "no risk strategy deployment!";
      }

      // add and enable risk strategy
      await riskManager.connect(governor).addRiskStrategy(riskStrategy.address);
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 1);
      await riskManager.connect(governor).setWeightAllocation(riskStrategy.address, 100);
    });

    it("can get minPeriod", async function () {
      expect(await product.minPeriod()).to.eq(minPeriod1);
    });

    it("can set minPeriod", async function () {
      let tx = await product.connect(governor).setMinPeriod(minPeriod2);
      expect(tx).to.emit(product, "MinPeriodSet").withArgs(minPeriod2);
      expect(await product.minPeriod()).to.equal(minPeriod2);
    });

    it("should revert setMinPeriod if not called by governance", async function () {
      await expect(product.connect(policyholder1).setMinPeriod(minPeriod1)).to.be.revertedWith("!governance");
    });

    it("should revert setMinPeriod if greater than maxPeriod", async function () {
      let maxPeriod = await product.maxPeriod();
      await expect(product.connect(governor).setMinPeriod(maxPeriod + 1)).to.be.revertedWith("invalid period");
    });

    it("can get maxPeriod", async function () {
      expect(await product.maxPeriod()).to.eq(maxPeriod1);
    });

    it("can set maxPeriod", async function () {
      let tx = await product.connect(governor).setMaxPeriod(maxPeriod2);
      expect(tx).to.emit(product, "MaxPeriodSet").withArgs(maxPeriod2);
      expect(await product.maxPeriod()).to.equal(maxPeriod2);
    });

    it("should revert setMaxPeriod if not called by governance", async function () {
      await expect(product.connect(policyholder1).setMaxPeriod(maxPeriod1)).to.be.revertedWith("!governance");
    });

    it("should revert setMaxPeriod if lesser than minPeriod", async function () {
      let minPeriod = await product.minPeriod();
      await expect(product.connect(governor).setMaxPeriod(minPeriod - 1)).to.be.revertedWith("invalid period");
    });

    it("can get policy manager", async function () {
      expect(await product.policyManager()).to.equal(policyManager.address);
    });
  });

  describe("pause", function () {
    it("starts unpaused", async function () {
      expect(await product.paused()).to.equal(false);
    });

    it("cannot be paused by non governance", async function () {
      await expect(product.connect(policyholder1).setPaused(true)).to.be.revertedWith("!governance");
      expect(await product.paused()).to.equal(false);
    });

    it("can be paused", async function () {
      let tx = await product.connect(governor).setPaused(true);
      expect(tx).to.emit(product, "PauseSet").withArgs(true);
      expect(await product.paused()).to.equal(true);
    });

    it("cannot be unpaused by non governance", async function () {
      await expect(product.connect(policyholder1).setPaused(false)).to.be.revertedWith("!governance");
      expect(await product.paused()).to.equal(true);
    });

    it("can be unpaused", async function() {
      let tx = await product.connect(governor).setPaused(false);
      expect(tx).to.emit(product, "PauseSet").withArgs(false);
      expect(await product.paused()).to.equal(false);
    });
  });

  describe("buyPolicy", function () {
    before(async function () {
      await dai.connect(policyholder1).approve(product.address, constants.MaxInt256);
      await dai.connect(policyholder2).approve(product.address, constants.MaxInt256);
      await dai.connect(premiumPool).approve(product.address, constants.MaxInt256);

      await policyManager.connect(governor).addProduct(product.address);
      expect(await policyManager.productIsActive(product.address)).to.equal(true);
    });

    it("can getQuote", async function () {
      let quote = BN.from(await product.getQuote(coverLimit, blocks, riskStrategy.address));
      expect(quote).to.equal(expectedPremium);
    });

    it("cannot buy policy for zero address", async function () {
      await expect(product.connect(policyholder1).buyPolicy(ZERO_ADDRESS, coverLimit, blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("zero address");
    });

    it("cannot buy policy with zero cover value", async function () {
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, 0,  blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("zero cover value");
    });

    it("cannot buy policy over max cover amount per product", async function () {
      let mc = await riskStrategy.maxCoverPerProduct(product.address);
      let ac = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let coverLimit2 = mc.sub(ac).add(1);
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit2,  blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot buy policy over max cover amount per policy", async function () {
      let coverLimit2 = (await riskStrategy.maxCoverPerPolicy(product.address)).add(1);
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit2,  blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot buy policy with insufficient payment", async function () {
      await expect(product.connect(policyholder3).buyPolicy(policyholder3.address, coverLimit, blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("insufficient payment");
    });

    it("cannot buy policy under min period", async function () {
      let blocks2 = minPeriod2 - 1;
      let quote = BN.from(await product.getQuote(coverLimit, blocks2, riskStrategy.address));
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit, blocks2, positionContract.address, riskStrategy.address)).to.be.revertedWith("invalid period");
    });

    it("cannot buy policy over max period", async function () {
      let blocks2 = maxPeriod2 + 1;
      let quote = BN.from(await product.getQuote(coverLimit, blocks2, riskStrategy.address));
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit, blocks2, positionContract.address, riskStrategy.address)).to.be.revertedWith("invalid period");
    });

    it("cannot buy policy while paused", async function () {
      await product.connect(governor).setPaused(true);
      let quote = BN.from(await product.getQuote(coverLimit, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit, blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });

    it("cannot buy policy if there is no risk strategy for product", async function () {
      let quote = BN.from(await product.getQuote(coverLimit, blocks, riskStrategy.address));
      await expect(product2.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit,  blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("invalid product");
    });

    it("cannot buy policy if strategy is inactive", async function () {
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 0);
      let quote = BN.from(await product.getQuote(coverLimit, blocks, riskStrategy.address));
      await expect(product2.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit, blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("strategy inactive");
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 1);
    });

    it("can buyPolicy", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let quote = BN.from(await product.getQuote(coverLimit, blocks, riskStrategy.address));
      expect(await dai.balanceOf(policyholder1.address)).to.gte(quote);

      let tx = await product.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit,  blocks, positionContract.address, riskStrategy.address);
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(coverLimit);
      await expect(tx)
        .to.emit(product, "PolicyCreated")
        .withArgs(1);
    });

    it("returns overpayment from buy policy", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let premiumPool1 = await dai.balanceOf(premiumPool.address)
      let quote = BN.from(await product.getQuote(coverLimit, blocks, riskStrategy.address));
      let tx = await product.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit,  blocks, positionContract.address, riskStrategy.address);
      await expect(tx)
        .to.emit(product, "PolicyCreated")
        .withArgs(2);
      let premiumPool2 = await dai.balanceOf(premiumPool.address)
      expect(premiumPool2.sub(premiumPool1)).to.equal(quote);
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(coverLimit);
    });
  });

  describe("extendPolicy", function () {
    let policyID = BN.from(1);
    let extension = BN.from(6450);
    let quote: BN;
    before(async function () {
      quote = await product.connect(policyholder1).getQuote(coverLimit, extension, riskStrategy.address);
    });

    it("cannot extend nonexistent policy", async function () {
      await expect(product.connect(policyholder1).extendPolicy(99, extension)).to.be.revertedWith("query for nonexistent token");
    });

    it("cannot extend someone elses policy", async function () {
      await expect(product.connect(deployer).extendPolicy(policyID, extension)).to.be.revertedWith("!policyholder");
    });

    it("cannot extend someone elses policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension)).to.be.revertedWith("!policyholder");
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });

    it("cannot extend from a different product", async function () {
      await expect(product2.connect(policyholder1).extendPolicy(policyID, extension)).to.be.revertedWith("wrong product");
    });

    it("cannot extend an expired policy", async function () {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 10);
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension)).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    });

    it("cannot over extend policy", async function () {
      let blocks2 = maxPeriod2 + 1;
      let quote2 = await product.connect(policyholder1).getQuote(coverLimit, blocks2, riskStrategy.address);
      await expect(product.connect(policyholder1).extendPolicy(policyID, blocks2)).to.be.revertedWith("invalid period");
    });

    it("cannot extend policy with insufficient payment", async function () {
      let balance = await dai.balanceOf(policyholder1.address);
      await dai.connect(policyholder1).transfer(deployer.address, balance);
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension)).to.be.revertedWith("insufficient payment");
      await dai.connect(deployer).transfer(policyholder1.address, balance);

    });

    it("cannot extend policy while paused", async function () {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension)).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });

    it("cannot extend policy if risk strategy is inactive", async function () {
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 0);
      let quote = BN.from(await product.getQuote(coverLimit, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension)).to.be.revertedWith("strategy inactive");
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 1);
    });

    it("can extend policy", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let tx = await product.connect(policyholder1).extendPolicy(policyID, extension);
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(0);
      await expect(tx)
        .to.emit(product, "PolicyExtended")
        .withArgs(policyID);
    });

    it("returns overpayment from extend policy", async function () {
      let premiumPool1 = await dai.balanceOf(premiumPool.address);
      let tx = await product.connect(policyholder1).extendPolicy(policyID, extension);
      await expect(tx)
        .to.emit(product, "PolicyExtended")
        .withArgs(policyID);
      let premiumPool2 = await dai.balanceOf(premiumPool.address);
      expect(premiumPool2.sub(premiumPool1)).to.equal(quote);
    });

    it("can extend your policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      let tx = await product.connect(policyholder2).extendPolicy(policyID, extension);
      await expect(tx).to.emit(product, "PolicyExtended").withArgs(policyID);
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });
  });

  describe("updateCoverLimit", function () {
    let policyID = BN.from(1);
    let newCoverLimit = BN.from("1100000000000000000"); // 1.1 eth
    let quote: BN;
    before(async function () {
      quote = await product.connect(policyholder1).getQuote(newCoverLimit, blocks, riskStrategy.address);
    });

    it("cannot update cover amount while paused", async function () {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(policyholder1).updateCoverLimit(policyID, newCoverLimit)).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });

    it("cannot update cover amount for nonexistent policy", async function () {
      await expect(product.connect(policyholder1).updateCoverLimit(99, newCoverLimit)).to.be.revertedWith("query for nonexistent token");
    });

    it("cannot update cover amount for someone elses policy", async function () {
      await expect(product.connect(deployer).updateCoverLimit(policyID, newCoverLimit)).to.be.revertedWith("!policyholder");
    });

    it("cannot update cover amount for someone elses policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      await expect(product.connect(policyholder1).updateCoverLimit(policyID, newCoverLimit)).to.be.revertedWith("!policyholder");
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });

    it("cannot update cover amount for from a different product", async function () {
      await expect(product2.connect(policyholder1).updateCoverLimit(policyID, newCoverLimit)).to.be.revertedWith("wrong product");
    });

    it("cannot update cover amount for an expired policy", async function () {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 10);
      await expect(product.connect(policyholder1).updateCoverLimit(policyID, newCoverLimit)).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    });

    it("cannot update cover amount to zero", async function () {
      let quote2 = BN.from(await product.getQuote(0, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).updateCoverLimit(policyID, 0)).to.be.revertedWith("zero cover value");
    });

    it("cannot update cover amount over max global cover amount", async function () {
      let maxCover = await riskStrategy.maxCoverPerProduct(product.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverLimit;
      let productCover = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let newCover = maxCover.sub(productCover).add(policyCover).add(1);
      let quote2 = BN.from(await product.getQuote(newCover, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).updateCoverLimit(policyID, newCover)).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot update cover amount over max user cover amount", async function () {
      let maxCoverPerUser = await riskStrategy.maxCoverPerPolicy(product.address);
      await expect(product.connect(policyholder1).updateCoverLimit(policyID, maxCoverPerUser.add(1))).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot update cover amaount if risk strategy is inactive", async function () {
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 0);
      let quote = BN.from(await product.getQuote(coverLimit, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).updateCoverLimit(policyID, maxCoverLimit1)).to.be.revertedWith("strategy inactive");
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 1);
    });

    it("reverts insufficient payment", async function () {
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = (await blockGetter.getBlockNumber()).add(1);
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      expect(newCoverLimit).to.be.gt(prevCoverLimit);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = newCoverLimit
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      expect(newPremium).to.be.gt(paidPremium);
      let premium = newPremium.sub(paidPremium);
      let balance = await dai.balanceOf(policyholder1.address);
      await dai.connect(policyholder1).transfer(deployer.address, balance);
      await expect(product.connect(policyholder1).updateCoverLimit(policyID, newCoverLimit)).to.be.revertedWith("insufficient payment");
      await dai.connect(deployer).transfer(policyholder1.address, balance);
    });

    it("can increase cover amount with exact payment", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = (await blockGetter.getBlockNumber()).add(1);
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      expect(newCoverLimit).to.be.gt(prevCoverLimit);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = newCoverLimit
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      expect(newPremium).to.be.gt(paidPremium);
      let premium = newPremium.sub(paidPremium);
      let bal1 = await dai.balanceOf(policyholder1.address);
      let tx = await product.connect(policyholder1).updateCoverLimit(policyID, newCoverLimit);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await dai.balanceOf(policyholder1.address);
      expect(bal1.sub(bal2)).to.equal(premium);
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(newCoverLimit.sub(prevCoverLimit));
    });

    it("can increase cover amount and return over payment", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      newCoverLimit = BN.from("1200000000000000000"); // 1.2 eth
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = (await blockGetter.getBlockNumber()).add(1);
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      expect(newCoverLimit).to.be.gt(prevCoverLimit);
      let newPremium = newCoverLimit
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      expect(newPremium).to.be.gt(paidPremium);
      let premium = newPremium.sub(paidPremium);
      let bal1 = await dai.balanceOf(policyholder1.address);
      let tx = await product.connect(policyholder1).updateCoverLimit(policyID, newCoverLimit);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
        await expect(tx)
        .to.emit(product, "DepositMade")
        .withArgs(premium);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await dai.balanceOf(policyholder1.address);
      expect(bal1.sub(bal2)).to.equal(premium);
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(newCoverLimit.sub(prevCoverLimit));
    });

    it("can decrease cover amount", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      newCoverLimit = BN.from("900000000000000000"); // 0.9 eth
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = (await blockGetter.getBlockNumber()).add(2);
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      expect(newCoverLimit).to.be.lt(prevCoverLimit);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = newCoverLimit
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // refund
      expect(newPremium).to.be.lt(paidPremium);
      let refund = paidPremium.sub(newPremium);
      let bal1 = await dai.balanceOf(policyholder1.address);
      await dai.connect(premiumPool).approve(product.address, constants.MaxUint256)
      let tx = await product.connect(policyholder1).updateCoverLimit(policyID, newCoverLimit);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      await expect(tx)
        .to.emit(product, "WithdrawMade")
        .withArgs(refund);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await dai.balanceOf(policyholder1.address);
      expect(bal2.sub(bal1)).to.equal(refund);
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(newCoverLimit.sub(prevCoverLimit));
    });

    it("can decrease cover amount and return amount", async function () {
      newCoverLimit = BN.from("800000000000000000"); // 0.8 dai
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = (await blockGetter.getBlockNumber()).add(1);
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      expect(newCoverLimit).to.be.lt(prevCoverLimit);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = newCoverLimit
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // refund
      expect(newPremium).to.be.lt(paidPremium);
      let refund = paidPremium.sub(newPremium);
      let bal1 = await dai.balanceOf(policyholder1.address);
      let tx = await product.connect(policyholder1).updateCoverLimit(policyID, newCoverLimit);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await dai.balanceOf(policyholder1.address);
      expect(bal2.sub(bal1)).to.equal(refund);
    });

    it("can keep cover amount the same", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverLimit;
      let bal1 = await dai.balanceOf(policyholder1.address);
      let tx = await product.connect(policyholder1).updateCoverLimit(policyID, policyCover);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await dai.balanceOf(policyholder1.address);
      expect(bal2.sub(bal1)).to.equal(0);
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(0);
    });

    it("can update cover amount after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      let policyCover = (await policyManager.policyInfo(policyID)).coverLimit;
      await product.connect(policyholder2).updateCoverLimit(policyID, policyCover);
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });
  });

  describe("updatePolicy", function () {
    let blocks = BN.from(25100); // less than the max
    let newCoverLimit = BN.from("900000000000000000"); // 0.9  dai
    let policyID = BN.from(1);
    let quote: BN;
    before(async function () {
      quote = await product.connect(policyholder1).getQuote(newCoverLimit, blocks, riskStrategy.address);
    });

    it("cannot update while paused", async function () {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverLimit, blocks)).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });

    it("cannot update nonexistent policy", async function () {
      await expect(product.connect(policyholder1).updatePolicy(99, newCoverLimit, blocks)).to.be.revertedWith("query for nonexistent token");
    });

    it("cannot update someone elses policy", async function () {
      await expect(product.connect(deployer).updatePolicy(policyID, newCoverLimit, blocks)).to.be.revertedWith("!policyholder");
    });

    it("cannot update someone elses policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverLimit, blocks)).to.be.revertedWith("!policyholder");
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });

    it("cannot update from a different product", async function () {
      await expect(product2.connect(policyholder1).updatePolicy(policyID, newCoverLimit, blocks)).to.be.revertedWith("wrong product");
    });

    it("cannot update an expired policy", async function () {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 10);
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverLimit, blocks)).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    });

    it("cannot over extend policy", async function () {
      let blocks2 = maxPeriod2 + 1;
      let quote2 = await product.connect(policyholder1).getQuote(newCoverLimit, blocks2, riskStrategy.address);
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverLimit, blocks2)).to.be.revertedWith("invalid period");
    });

    it("cannot update policy with insufficient payment", async function () {
      let balance = await dai.balanceOf(policyholder1.address);
      await dai.connect(policyholder1).transfer(deployer.address, balance);
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverLimit, blocks)).to.be.revertedWith("insufficient payment");
      await dai.connect(deployer).transfer(policyholder1.address, balance);
    });

    it("cannot update policy to zero cover amount", async function () {
      await expect(product.connect(policyholder1).updatePolicy(policyID, 0, blocks)).to.be.revertedWith("zero cover value");
    });

    it("cannot update over max global cover amount", async function () {
      let maxCover = await riskStrategy.maxCoverPerProduct(product.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverLimit;
      let productCover = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let newCover = maxCover.sub(productCover).add(policyCover).add(1);
      let quote2 = BN.from(await product.getQuote(newCover, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCover, blocks)).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot update over max user cover amount", async function () {
      let maxCoverPerUser = await riskStrategy.maxCoverPerPolicy(product.address);
      await expect(product.connect(policyholder1).updatePolicy(policyID, maxCoverPerUser.add(1), blocks)).to.be.revertedWith("cannot accept that risk");
    });

    it("can increase cover amount and extend", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = (await blockGetter.getBlockNumber()).add(1);
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = newCoverLimit
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      let premium = newPremium.sub(paidPremium);
      let tx = await product.connect(policyholder1).updatePolicy(policyID, newCoverLimit, threeDays);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);

      let expirationBlock = await policyManager.getPolicyExpirationBlock(policyID);
      let coverLimit2 = await policyManager.getPolicyCoverLimit(policyID);

      expect(prevExpirationBlock.add(threeDays)).to.equal(expirationBlock);
      expect(coverLimit2).to.equal(newCoverLimit);

      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(newCoverLimit.sub(prevCoverLimit));
    });

    it("returns overpayment from update policy", async function () {
      let premiumPool1 = await dai.balanceOf(premiumPool.address);
      newCoverLimit = BN.from("1000000000000000000"); // 1  eth
      let blockNumber = (await blockGetter.getBlockNumber()).add(1);
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);

      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = newCoverLimit
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);

      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);

      // premium
      let premium = newPremium.sub(paidPremium);
      let tx = await product.connect(policyholder1).updatePolicy(policyID, newCoverLimit, threeDays);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let premiumPool2 = await dai.balanceOf(premiumPool.address);
      expect(premiumPool2.sub(premiumPool1)).to.equal(premium);
    });

    it("can decrease cover amount", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverLimit;
      let coverLimit = policyCover.div(10);
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = (await blockGetter.getBlockNumber()).add(1);
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = coverLimit
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // refund
      expect(newPremium).to.be.lt(paidPremium);
      let refund = paidPremium.sub(newPremium);
      let bal1 = await dai.balanceOf(policyholder1.address);
      let tx = await product.connect(policyholder1).updatePolicy(policyID, coverLimit, threeDays);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await dai.balanceOf(policyholder1.address);
      expect(bal2.sub(bal1)).to.equal(refund);
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(coverLimit.sub(prevCoverLimit));
    });

    it("can decrease cover amount and return msg.value", async function () {
      let policyCover = (await policyManager.policyInfo(policyID)).coverLimit;
      let coverLimit = policyCover.div(10);
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = (await blockGetter.getBlockNumber()).add(1);
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = coverLimit
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // refund
      expect(newPremium).to.be.lt(paidPremium);
      let refund = paidPremium.sub(newPremium);
      let bal1 = await dai.balanceOf(policyholder1.address);
      let tx = await product.connect(policyholder1).updatePolicy(policyID, coverLimit, threeDays);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await dai.balanceOf(policyholder1.address);
      expect(bal2.sub(bal1)).to.equal(refund);
    });

    it("can keep cover amount the same", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverLimit;
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = (await blockGetter.getBlockNumber()).add(1);
      let prevCoverLimit = await policyManager.getPolicyCoverLimit(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = policyCover
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverLimit
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      expect(newPremium).to.be.gt(paidPremium);
      let premium = newPremium.sub(paidPremium);
      let bal1 = await dai.balanceOf(policyholder1.address);
      let tx = await product.connect(policyholder1).updatePolicy(policyID, policyCover, threeDays);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await dai.balanceOf(policyholder1.address);
      expect(bal1.sub(bal2)).to.equal(premium);
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(0);
    });

    it("can update policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      let policyCover = (await policyManager.policyInfo(policyID)).coverLimit;
      await product.connect(policyholder2).updatePolicy(policyID, policyCover, threeDays);
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });
  });

  describe("cancelPolicy", function () {
    let policyID = BN.from(1);

    it("cannot cancel nonexistent policy", async function () {
      await expect(product.connect(policyholder1).cancelPolicy(99)).to.be.revertedWith("query for nonexistent token");
    });

    it("cannot cancel someone elses policy", async function () {
      await expect(product.connect(deployer).cancelPolicy(policyID)).to.be.revertedWith("!policyholder");
    });

    it("cannot cancel someone elses policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      await expect(product.connect(policyholder1).cancelPolicy(policyID)).to.be.revertedWith("!policyholder");
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });

    it("cannot cancel from a different product", async function () {
      await expect(product2.connect(policyholder1).cancelPolicy(policyID)).to.be.revertedWith("wrong product");
    });

    it("can cancel and refunds proper amount", async function () {
      let activeCover1 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      let info = await policyManager.policyInfo(policyID);
      let block = (await blockGetter.getBlockNumber()).toNumber();
      let balance1 = await dai.balanceOf(policyholder1.address);
      let expectedRefund = BN.from(info.expirationBlock)
        .sub(block + 1)
        .mul(info.price)
        .mul(info.coverLimit)
        .div(1e12);
      let tx = await product.connect(policyholder1).cancelPolicy(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let balance2 = await dai.balanceOf(policyholder1.address);
      let actualRefund = balance2.sub(balance1);
      expect(actualRefund).to.equal(expectedRefund);
      expect(await policyManager.exists(policyID)).to.be.false;
      let activeCover2 = await product.activeCoverLimitPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(info.coverLimit.mul(-1));
    });

    it("can cancel policy after transfer", async function () {
      expect(await product.policyManager()).to.equal(policyManager.address);
      let tx = await product.connect(policyholder1).buyPolicy(policyholder1.address, coverLimit,  blocks, positionContract.address, riskStrategy.address);
      policyID = await policyManager.totalPolicyCount();
      expect(tx).to.emit(policyManager, "PolicyCreated").withArgs(policyID);
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      await product.connect(policyholder2).cancelPolicy(policyID);
      expect(await policyManager.exists(policyID)).to.be.false;
    });
  });

  describe("paclas signers", function () {
    it("non governance cannot add signers", async function () {
      await expect(product.connect(policyholder1).addSigner(policyholder1.address)).to.be.revertedWith("!governance");
    });

    it("cannot add zero signer", async function () {
      await expect(product.connect(governor).addSigner(ZERO_ADDRESS)).to.be.revertedWith("zero address signer");
    });

    it("can add signers", async function () {
      expect(await product.isAuthorizedSigner(governor.address)).to.equal(false);
      let tx = await product.connect(governor).addSigner(governor.address);
      await expect(tx)
        .to.emit(product, "SignerAdded")
        .withArgs(governor.address);
      expect(await product.isAuthorizedSigner(governor.address)).to.equal(true);
    });

    it("non governance cannot remove signers", async function () {
      await expect(product.connect(policyholder1).removeSigner(policyholder1.address)).to.be.revertedWith("!governance");
    });

    it("can remove signers", async function () {
      expect(await product.isAuthorizedSigner(governor.address)).to.equal(true);
      let tx = await product.connect(governor).removeSigner(governor.address);
      await expect(tx)
        .to.emit(product, "SignerRemoved")
        .withArgs(governor.address);
      expect(await product.isAuthorizedSigner(governor.address)).to.equal(false);
      await product.connect(governor).addSigner(governor.address);
    });
  });

  describe("active cover amount", function () {
    let product3: MockProductV2;
    before(async function () {
      await registry.connect(governor).set(["policyManager"],[mockPolicyManager.address]);
      let tx1 = await productFactory.createProduct(coverageProduct.address, governor.address, registry.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
      let events1 = (await tx1.wait())?.events;
      if(events1 && events1.length > 0) {
        let event1 = events1[0];
        product3 = await ethers.getContractAt(artifacts.MockProductV2.abi, event1?.args?.["deployment"]) as MockProductV2;
      } else throw "no deployment";
      await product3.connect(governor).setPrice(price1);
    });

    after(async function () {
      await registry.connect(governor).set(["policyManager"],[policyManager.address]);
    })

    it("starts at zero", async function () {
      expect(await product3.activeCoverLimit()).to.equal(0);
    });

    it("cannot update by non policy manager", async function () {
      await expect(product3.connect(deployer).updateActiveCoverLimit(1)).to.be.revertedWith("!policymanager");
    });

    it("can update", async function () {
      await product3.connect(mockPolicyManager).updateActiveCoverLimit(3);
      expect(await product3.activeCoverLimit()).to.equal(3);
      await product3.connect(mockPolicyManager).updateActiveCoverLimit(5);
      expect(await product3.activeCoverLimit()).to.equal(8);
      await product3.connect(mockPolicyManager).updateActiveCoverLimit(-6);
      expect(await product3.activeCoverLimit()).to.equal(2);

    });

    it("cannot be negative", async function () {
      await expect(product3.connect(mockPolicyManager).updateActiveCoverLimit(-7)).to.be.reverted;
    });
  });
});
