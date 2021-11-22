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

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, ProductFactory, MockProductV2, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager, RiskStrategy, RiskStrategyFactory, MockRiskStrategy, CoverageDataProvider } from "../typechain";
import { toBytes32 } from "./utilities/setStorage";
import { after } from "mocha";

const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("MockProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const DOMAIN_NAME = "Solace.fi-MockProduct";

describe("CoverageProduct", function () {
  let artifacts: ArtifactImports;
  let policyManager: PolicyManager;
  let productFactory: ProductFactory;
  let coverageProduct: MockProductV2;
  let product: MockProductV2;
  let product2: MockProductV2;
  let weth: Weth9;
  let treasury: Treasury;
  let claimsEscrow: ClaimsEscrow;
  let vault: Vault;
  let registry: Registry;
  let riskManager: RiskManager;
  let riskStrategy: RiskStrategy;
  let riskStrategyFactory: Contract;
  let mockRiskStrategy: RiskStrategy;
  let coverageDataProvider: CoverageDataProvider;
  const [deployer, governor, newGovernor, positionContract, policyholder1, policyholder2, mockPolicyManager] = provider.getWallets();

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
  const minPeriod1 = 6450; // this is about 1 day
  const maxPeriod1 = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
  const maxCoverAmount1 = BN.from("1000000000000000000"); // 1 Ether in wei
  const maxCoverPerUser1 = BN.from("10000000000000000"); // 0.01 Ether in wei
  const coverDivisor1 = 1000;
  const coverDivisor2 = 100;
  const price1 = 10000;

  const threeDays = 19350;
  const minPeriod2 = threeDays;
  const maxPeriod2 = 2354250; // one year
  const maxCoverAmount2 = BN.from("1000000000000000000000"); // 1000 Ether in wei
  const price2 = 11044; // 2.60%/yr

  const coverAmount = BN.from("1000000000000000000"); // 1 eth
  const blocks = BN.from(threeDays);
  const expectedPremium = BN.from("213701400000000");

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    await registry.connect(governor).setWeth(weth.address);
    vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
    await registry.connect(governor).setVault(vault.address);
    claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, registry.address])) as ClaimsEscrow;
    await registry.connect(governor).setClaimsEscrow(claimsEscrow.address);
    treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
    await registry.connect(governor).setTreasury(treasury.address);
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
    await registry.connect(governor).setPolicyManager(policyManager.address);
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
    await registry.connect(governor).setRiskManager(riskManager.address);
    coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [registry.address])) as CoverageDataProvider;
    await registry.connect(governor).setCoverageDataProvider(coverageDataProvider.address);

    // deploy product factory
    productFactory = (await deployContract(deployer, artifacts.ProductFactory)) as ProductFactory;

    // deploy base product
    coverageProduct = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;

    // deploy risk strategy factory
    let riskStrategyContractFactory = await ethers.getContractFactory("RiskStrategyFactory", deployer);
    riskStrategyFactory = (await riskStrategyContractFactory.deploy(registry.address, governor.address));
    await riskStrategyFactory.deployed();

    mockRiskStrategy = (await deployContract(deployer, artifacts.MockRiskStrategy)) as RiskStrategy;
    
    await vault.connect(governor).addRequestor(claimsEscrow.address);
    await vault.connect(governor).addRequestor(treasury.address);
  });

  describe("deployment", function () {
    it("reverts zero addresses", async function () {
      await expect(productFactory.createProduct(coverageProduct.address, governor.address, ZERO_ADDRESS, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1")).to.be.revertedWith("zero address registry");

      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await expect(productFactory.createProduct(coverageProduct.address, governor.address, registry2.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1")).to.be.revertedWith("zero address policymanager");

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
      await vault.connect(deployer).depositEth({value:maxCoverAmount1.mul(3)});
 
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

    it("should revert setMaxPeriod if greater than maxPeriod", async function () {
      let minPeriod = await product.minPeriod();
      await expect(product.connect(governor).setMaxPeriod(minPeriod - 1)).to.be.revertedWith("invalid period");
    });

    it("can get policy manager", async function () {
      expect(await product.policyManager()).to.equal(policyManager.address);
    });

    it("can set policy manager", async function () {
      let tx = await product.connect(governor).setPolicyManager(treasury.address);
      expect(tx).to.emit(product, "PolicyManagerSet").withArgs(treasury.address);
      expect(await product.policyManager()).to.equal(treasury.address);
      await product.connect(governor).setPolicyManager(policyManager.address);
    });

    it("should revert setPolicyManager if not called by governance", async function () {
      await expect(product.connect(policyholder1).setPolicyManager(policyholder1.address)).to.be.revertedWith("!governance");
    });

    it("should revert setPolicyManager if not called by governance", async function () {
      await expect(product.connect(governor).setPolicyManager(ZERO_ADDRESS)).to.be.revertedWith("zero address policymanager");
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
      var depositAmount = maxCoverAmount2.sub(maxCoverAmount1.mul(3));
      await vault.connect(deployer).depositEth({value:depositAmount});
      await policyManager.connect(governor).addProduct(product.address);
      expect(await policyManager.productIsActive(product.address)).to.equal(true);
    });

    it("can getQuote", async function () {
      let quote = BN.from(await product.getQuote(coverAmount, blocks, riskStrategy.address));
      expect(quote).to.equal(expectedPremium);
    });

    it("cannot buy policy for zero address", async function () {
      await expect(product.connect(policyholder1).buyPolicy(ZERO_ADDRESS, coverAmount, blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("zero address");
    });

    it("cannot buy policy with zero cover value", async function () {
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, 0, blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("zero cover value");
    });

    it("cannot buy policy over max cover amount per product", async function () {
      let mc = await riskStrategy.maxCoverPerProduct(product.address);
      let ac = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let coverAmount2 = mc.sub(ac).add(1);
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount2, blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot buy policy over max cover amount per policy", async function () {
      let coverAmount2 = (await riskStrategy.maxCoverPerPolicy(product.address)).add(1);
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount2, blocks, positionContract.address, riskStrategy.address)).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot buy policy with insufficient payment", async function () {
      let quote = BN.from(await product.getQuote(coverAmount, blocks, riskStrategy.address));
      console.log("quote: ", quote.toNumber())
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, positionContract.address, riskStrategy.address, { value: quote.sub(1) })).to.be.revertedWith("insufficient payment");
    });

    it("cannot buy policy under min period", async function () {
      let blocks2 = minPeriod2 - 1;
      let quote = BN.from(await product.getQuote(coverAmount, blocks2, riskStrategy.address));
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks2, positionContract.address, riskStrategy.address, { value: quote })).to.be.revertedWith("invalid period");
    });

    it("cannot buy policy over max period", async function () {
      let blocks2 = maxPeriod2 + 1;
      let quote = BN.from(await product.getQuote(coverAmount, blocks2, riskStrategy.address));
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks2, positionContract.address, riskStrategy.address, { value: quote })).to.be.revertedWith("invalid period");
    });

    it("cannot buy policy while paused", async function () {
      await product.connect(governor).setPaused(true);
      let quote = BN.from(await product.getQuote(coverAmount, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, positionContract.address, riskStrategy.address, { value: quote })).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });

    it("cannot buy policy if there is no risk strategy for product", async function () {
      let quote = BN.from(await product.getQuote(coverAmount, blocks, riskStrategy.address));
      await expect(product2.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, positionContract.address, riskStrategy.address, { value: quote })).to.be.revertedWith("invalid product");
    });

    it("cannot buy policy if strategy is inactive", async function () {
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 0);
      let quote = BN.from(await product.getQuote(coverAmount, blocks, riskStrategy.address));
      await expect(product2.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, positionContract.address, riskStrategy.address, { value: quote })).to.be.revertedWith("strategy inactive");
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 1);
    });

    it("can buyPolicy", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let quote = BN.from(await product.getQuote(coverAmount, blocks, riskStrategy.address));
      let tx = await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, positionContract.address, riskStrategy.address, { value: quote });
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(coverAmount);
      await expect(tx)
        .to.emit(product, "PolicyCreated")
        .withArgs(1);
    });

    it("returns overpayment from buy policy", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let vaultBalance1 = await provider.getBalance(vault.address);
      let quote = BN.from(await product.getQuote(coverAmount, blocks, riskStrategy.address));
      let tx = await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, positionContract.address, riskStrategy.address, { value: quote.add(100) });
      await expect(tx)
        .to.emit(product, "PolicyCreated")
        .withArgs(2);
      let vaultBalance2 = await provider.getBalance(vault.address);
      expect(vaultBalance2.sub(vaultBalance1)).to.equal(quote);
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(coverAmount);
    });
  });

  describe("extendPolicy", function () {
    let policyID = BN.from(1);
    let extension = BN.from(6450);
    let quote: BN;
    before(async function () {
      quote = await product.connect(policyholder1).getQuote(coverAmount, extension, riskStrategy.address);
    });

    it("cannot extend nonexistent policy", async function () {
      await expect(product.connect(policyholder1).extendPolicy(99, extension, { value: quote })).to.be.revertedWith("query for nonexistent token");
    });

    it("cannot extend someone elses policy", async function () {
      await expect(product.connect(deployer).extendPolicy(policyID, extension, { value: quote })).to.be.revertedWith("!policyholder");
    });

    it("cannot extend someone elses policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension, { value: quote })).to.be.revertedWith("!policyholder");
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });

    it("cannot extend from a different product", async function () {
      await expect(product2.connect(policyholder1).extendPolicy(policyID, extension, { value: quote })).to.be.revertedWith("wrong product");
    });

    it("cannot extend an expired policy", async function () {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 10);
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension, { value: quote })).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    });

    it("cannot over extend policy", async function () {
      let blocks2 = maxPeriod2 + 1;
      let quote2 = await product.connect(policyholder1).getQuote(coverAmount, blocks2, riskStrategy.address);
      await expect(product.connect(policyholder1).extendPolicy(policyID, blocks2, { value: quote2 })).to.be.revertedWith("invalid period");
    });

    it("cannot extend policy with insufficient payment", async function () {
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension, { value: quote.sub(1) })).to.be.revertedWith("insufficient payment");
    });

    it("cannot extend policy while paused", async function () {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension, { value: quote })).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });

    it("cannot extend policy if risk strategy is inactive", async function () {
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 0);
      let quote = BN.from(await product.getQuote(coverAmount, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).extendPolicy(policyID, extension, { value: quote })).to.be.revertedWith("strategy inactive");
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 1);
    });

    it("can extend policy", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let tx = await product.connect(policyholder1).extendPolicy(policyID, extension, { value: quote });
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(0);
      await expect(tx)
        .to.emit(product, "PolicyExtended")
        .withArgs(policyID);
    });

    it("returns overpayment from extend policy", async function () {
      let vaultBalance1 = await provider.getBalance(vault.address);
      let tx = await product.connect(policyholder1).extendPolicy(policyID, extension, { value: quote.add(100) });
      await expect(tx)
        .to.emit(product, "PolicyExtended")
        .withArgs(policyID);
      let vaultBalance2 = await provider.getBalance(vault.address);
      expect(vaultBalance2.sub(vaultBalance1)).to.equal(quote);
    });

    it("can extend your policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      await product.connect(policyholder2).extendPolicy(policyID, extension, { value: quote });
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });
  });

  describe("updateCoverAmount", function () {
    let policyID = BN.from(1);
    let newCoverAmount = BN.from("1100000000000000000"); // 1.1 eth
    let quote: BN;
    before(async function () {
      quote = await product.connect(policyholder1).getQuote(newCoverAmount, blocks, riskStrategy.address);
    });

    it("cannot update cover amount while paused", async function () {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(policyholder1).updateCoverAmount(policyID, newCoverAmount, { value: quote })).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });

    it("cannot update cover amount for nonexistent policy", async function () {
      await expect(product.connect(policyholder1).updateCoverAmount(99, newCoverAmount, { value: quote })).to.be.revertedWith("query for nonexistent token");
    });

    it("cannot update cover amount for someone elses policy", async function () {
      await expect(product.connect(deployer).updateCoverAmount(policyID, newCoverAmount, { value: quote })).to.be.revertedWith("!policyholder");
    });

    it("cannot update cover amount for someone elses policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      await expect(product.connect(policyholder1).updateCoverAmount(policyID, newCoverAmount, { value: quote })).to.be.revertedWith("!policyholder");
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });

    it("cannot update cover amount for from a different product", async function () {
      await expect(product2.connect(policyholder1).updateCoverAmount(policyID, newCoverAmount, { value: quote })).to.be.revertedWith("wrong product");
    });

    it("cannot update cover amount for an expired policy", async function () {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 10);
      await expect(product.connect(policyholder1).updateCoverAmount(policyID, newCoverAmount, { value: quote })).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    });

    it("cannot update cover amount to zero", async function () {
      let quote2 = BN.from(await product.getQuote(0, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).updateCoverAmount(policyID, 0, { value: quote2 })).to.be.revertedWith("zero cover value");
    });

    it("cannot update cover amount over max global cover amount", async function () {
      let maxCover = await riskStrategy.maxCoverPerProduct(product.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let productCover = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let newCover = maxCover.sub(productCover).add(policyCover).add(1);
      let quote2 = BN.from(await product.getQuote(newCover, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).updateCoverAmount(policyID, newCover, { value: quote2 })).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot update cover amount over max user cover amount", async function () {
      let maxCoverPerUser = await riskStrategy.maxCoverPerPolicy(product.address);
      await expect(product.connect(policyholder1).updateCoverAmount(policyID, maxCoverPerUser.add(1), { value: quote })).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot update cover amaount if risk strategy is inactive", async function () {
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 0);
      let quote = BN.from(await product.getQuote(coverAmount, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).updateCoverAmount(policyID, maxCoverAmount1, { value: quote })).to.be.revertedWith("strategy inactive");
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 1);
    });

    it("reverts insufficient payment", async function () {
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      expect(newCoverAmount).to.be.gt(prevCoverAmount);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = newCoverAmount
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      expect(newPremium).to.be.gt(paidPremium);
      let premium = newPremium.sub(paidPremium);
      await expect(product.connect(policyholder1).updateCoverAmount(policyID, newCoverAmount, { value: premium.sub(1) })).to.be.revertedWith("insufficient payment");
    });

    it("can increase cover amount with exact payment", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      expect(newCoverAmount).to.be.gt(prevCoverAmount);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = newCoverAmount
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      expect(newPremium).to.be.gt(paidPremium);
      let premium = newPremium.sub(paidPremium);
      let bal1 = await policyholder1.getBalance();
      let tx = await product.connect(policyholder1).updateCoverAmount(policyID, newCoverAmount, { value: premium });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await policyholder1.getBalance();
      expect(bal1.sub(bal2).sub(gasCost)).to.equal(premium);
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(newCoverAmount.sub(prevCoverAmount));
    });

    it("can increase cover amount and return over payment", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      newCoverAmount = BN.from("1200000000000000000"); // 1.2 eth
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      expect(newCoverAmount).to.be.gt(prevCoverAmount);
      let newPremium = newCoverAmount
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      expect(newPremium).to.be.gt(paidPremium);
      let premium = newPremium.sub(paidPremium);
      let bal1 = await policyholder1.getBalance();
      let tx = await product.connect(policyholder1).updateCoverAmount(policyID, newCoverAmount, { value: premium.mul(11).div(10) });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await policyholder1.getBalance();
      expect(bal1.sub(bal2).sub(gasCost)).to.equal(premium);
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(newCoverAmount.sub(prevCoverAmount));
    });

    it("can decrease cover amount", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      newCoverAmount = BN.from("900000000000000000"); // 0.9 eth
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      expect(newCoverAmount).to.be.lt(prevCoverAmount);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = newCoverAmount
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // refund
      expect(newPremium).to.be.lt(paidPremium);
      let refund = paidPremium.sub(newPremium);
      let bal1 = await policyholder1.getBalance();
      let tx = await product.connect(policyholder1).updateCoverAmount(policyID, newCoverAmount, { value: 0 });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await policyholder1.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(refund);
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(newCoverAmount.sub(prevCoverAmount));
    });

    it("can decrease cover amount and return msg.value", async function () {
      newCoverAmount = BN.from("800000000000000000"); // 0.8 eth
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      expect(newCoverAmount).to.be.lt(prevCoverAmount);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = newCoverAmount
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = expBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // refund
      expect(newPremium).to.be.lt(paidPremium);
      let refund = paidPremium.sub(newPremium);
      let bal1 = await policyholder1.getBalance();
      let tx = await product.connect(policyholder1).updateCoverAmount(policyID, newCoverAmount, { value: "1000000000000" });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await policyholder1.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(refund);
    });

    it("can keep cover amount the same", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let bal1 = await policyholder1.getBalance();
      let tx = await product.connect(policyholder1).updateCoverAmount(policyID, policyCover, { value: "1000000000000" });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await policyholder1.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(0);
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(0);
    });

    it("can update cover amount after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      await product.connect(policyholder2).updateCoverAmount(policyID, policyCover, { value: "1000000000000" });
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });
  });

  describe("updatePolicy", function () {
    let blocks = BN.from(25100); // less than the max
    let newCoverAmount = BN.from("900000000000000000"); // 0.9  eth
    let policyID = BN.from(1);
    let quote: BN;
    before(async function () {
      quote = await product.connect(policyholder1).getQuote(newCoverAmount, blocks, riskStrategy.address);
    });

    it("cannot update while paused", async function () {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverAmount, blocks, { value: quote })).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });

    it("cannot update nonexistent policy", async function () {
      await expect(product.connect(policyholder1).updatePolicy(99, newCoverAmount, blocks, { value: quote })).to.be.revertedWith("query for nonexistent token");
    });

    it("cannot update someone elses policy", async function () {
      await expect(product.connect(deployer).updatePolicy(policyID, newCoverAmount, blocks, { value: quote })).to.be.revertedWith("!policyholder");
    });

    it("cannot update someone elses policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverAmount, blocks, { value: quote })).to.be.revertedWith("!policyholder");
      await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID);
    });

    it("cannot update from a different product", async function () {
      await expect(product2.connect(policyholder1).updatePolicy(policyID, newCoverAmount, blocks, { value: quote })).to.be.revertedWith("wrong product");
    });

    it("cannot update an expired policy", async function () {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 10);
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverAmount, blocks, { value: quote })).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    });

    it("cannot over extend policy", async function () {
      let blocks2 = maxPeriod2 + 1;
      let quote2 = await product.connect(policyholder1).getQuote(newCoverAmount, blocks2, riskStrategy.address);
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverAmount, blocks2, { value: quote2 })).to.be.revertedWith("invalid period");
    });

    it("cannot update policy with insufficient payment", async function () {
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCoverAmount, blocks, { value: BN.from(0) })).to.be.revertedWith("insufficient payment");
    });

    it("cannot update policy to zero cover amount", async function () {
      await expect(product.connect(policyholder1).updatePolicy(policyID, 0, blocks, { value: quote })).to.be.revertedWith("zero cover value");
    });

    it("cannot update over max global cover amount", async function () {
      let maxCover = await riskStrategy.maxCoverPerProduct(product.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let productCover = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let newCover = maxCover.sub(productCover).add(policyCover).add(1);
      let quote2 = BN.from(await product.getQuote(newCover, blocks, riskStrategy.address));
      await expect(product.connect(policyholder1).updatePolicy(policyID, newCover, blocks, { value: quote2 })).to.be.revertedWith("cannot accept that risk");
    });

    it("cannot update over max user cover amount", async function () {
      let maxCoverPerUser = await riskStrategy.maxCoverPerPolicy(product.address);
      await expect(product.connect(policyholder1).updatePolicy(policyID, maxCoverPerUser.add(1), blocks, { value: quote })).to.be.revertedWith("cannot accept that risk");
    });

    it("can increase cover amount and extend", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = newCoverAmount
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      let premium = newPremium.sub(paidPremium);
      let tx = await product.connect(policyholder1).updatePolicy(policyID, newCoverAmount, threeDays, { value: premium });
      let expirationBlock = await policyManager.getPolicyExpirationBlock(policyID);
      let coverAmount2 = await policyManager.getPolicyCoverAmount(policyID);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      expect(prevExpirationBlock.add(threeDays)).to.equal(expirationBlock);
      expect(coverAmount2).to.equal(newCoverAmount);
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(newCoverAmount.sub(prevCoverAmount));
    });

    it("returns overpayment from update policy", async function () {
      let vaultBalance1 = await provider.getBalance(vault.address);
      newCoverAmount = BN.from("1000000000000000000"); // 1  eth
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);

      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = newCoverAmount
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);

      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);

      // premium
      let premium = newPremium.sub(paidPremium);
      let tx = await product.connect(policyholder1).updatePolicy(policyID, newCoverAmount, threeDays, { value: premium.add(100) });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let vaultBalance2 = await provider.getBalance(vault.address);
      expect(vaultBalance2.sub(vaultBalance1)).to.equal(premium);
    });

    it("can decrease cover amount", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let coverAmount = policyCover.div(10);
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = coverAmount
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // refund
      expect(newPremium).to.be.lt(paidPremium);
      let refund = paidPremium.sub(newPremium);
      let bal1 = await policyholder1.getBalance();
      let tx = await product.connect(policyholder1).updatePolicy(policyID, coverAmount, threeDays, { value: 0 });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await policyholder1.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(refund);
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(coverAmount.sub(prevCoverAmount));
    });

    it("can decrease cover amount and return msg.value", async function () {
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let coverAmount = policyCover.div(10);
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = coverAmount
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // refund
      expect(newPremium).to.be.lt(paidPremium);
      let refund = paidPremium.sub(newPremium);
      let bal1 = await policyholder1.getBalance();
      let tx = await product.connect(policyholder1).updatePolicy(policyID, coverAmount, threeDays, { value: "1000000000000" });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await policyholder1.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(refund);
    });

    it("can keep cover amount the same", async function () {
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      // calculate new premium
      let remainingBlocks = prevExpirationBlock.add(threeDays).sub(blockNumber);
      let newPremium = policyCover
        .mul(remainingBlocks)
        .mul(price2)
        .div(1e12);
      // calculate paid premium
      let previousRemainingBlocks = prevExpirationBlock.sub(blockNumber);
      let paidPremium = prevCoverAmount
        .mul(previousRemainingBlocks)
        .mul(prevPrice)
        .div(1e12);
      // premium
      expect(newPremium).to.be.gt(paidPremium);
      let premium = newPremium.sub(paidPremium);
      let bal1 = await policyholder1.getBalance();
      let tx = await product.connect(policyholder1).updatePolicy(policyID, policyCover, threeDays, { value: premium });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await policyholder1.getBalance();
      expect(bal1.sub(bal2).sub(gasCost)).to.equal(premium);
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(0);
    });

    it("can update policy after transfer", async function () {
      await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID);
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      await product.connect(policyholder2).updatePolicy(policyID, policyCover, threeDays, { value: "1000000000000000000" });
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
      let activeCover1 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      let info = await policyManager.policyInfo(policyID);
      let block = await provider.getBlockNumber();
      let balance1 = await policyholder1.getBalance();
      let expectedRefund = BN.from(info.expirationBlock)
        .sub(block + 1)
        .mul(info.price)
        .mul(info.coverAmount)
        .div(1e12);
      let tx = await product.connect(policyholder1).cancelPolicy(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let balance2 = await policyholder1.getBalance();
      let actualRefund = balance2.add(gasCost).sub(balance1);
      expect(actualRefund).to.equal(expectedRefund);
      expect(await policyManager.exists(policyID)).to.be.false;
      let activeCover2 = await product.activeCoverAmountPerStrategy(riskStrategy.address);
      expect(activeCover2.sub(activeCover1)).eq(info.coverAmount.mul(-1));
    });

    it("can cancel policy after transfer", async function () {
      expect(await product.policyManager()).to.equal(policyManager.address);
      let tx = await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, positionContract.address, riskStrategy.address, { value: "1000000000000000000" });
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
      await registry.connect(governor).setPolicyManager(mockPolicyManager.address);

      let tx1 = await productFactory.createProduct(coverageProduct.address, governor.address, registry.address, minPeriod1, maxPeriod1, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
      let events1 = (await tx1.wait())?.events;
      if(events1 && events1.length > 0) {
        let event1 = events1[0];
        product3 = await ethers.getContractAt(artifacts.MockProductV2.abi, event1?.args?.["deployment"]) as MockProductV2;
      } else throw "no deployment";
      await product3.connect(governor).setPrice(price1);
    });

    after(async function () {
      await registry.connect(governor).setPolicyManager(policyManager.address);
    })

    it("starts at zero", async function () {
      expect(await product3.activeCoverAmount()).to.equal(0);
    });

    it("cannot update by non policy manager", async function () {
      await expect(product3.connect(deployer).updateActiveCoverAmount(1)).to.be.revertedWith("!policymanager");
    });

    it("can update", async function () {
      await product3.connect(mockPolicyManager).updateActiveCoverAmount(3);
      expect(await product3.activeCoverAmount()).to.equal(3);
      await product3.connect(mockPolicyManager).updateActiveCoverAmount(5);
      expect(await product3.activeCoverAmount()).to.equal(8);
      await product3.connect(mockPolicyManager).updateActiveCoverAmount(-6);
      expect(await product3.activeCoverAmount()).to.equal(2);

    });

    it("cannot be negative", async function () {
      await expect(product3.connect(mockPolicyManager).updateActiveCoverAmount(-7)).to.be.reverted;
    });
  });
});
