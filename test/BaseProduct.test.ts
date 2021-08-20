import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, utils, constants } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { config as dotenv_config } from "dotenv";
dotenv_config();

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, MockProduct, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";

describe("BaseProduct", () => {
  let artifacts: ArtifactImports;
  let policyManager: PolicyManager;
  let product: MockProduct;
  let product2: MockProduct;
  let weth: Weth9;
  let treasury: Treasury;
  let claimsEscrow: ClaimsEscrow;
  let vault: Vault;
  let registry: Registry;
  let riskManager: RiskManager;
  const [deployer, governor, positionContract, buyer, mockPolicyManager] = provider.getWallets();

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
  const minPeriod1 = 6450; // this is about 1 day
  const maxPeriod1 = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
  const maxCoverAmount1 = BN.from("1000000000000000000"); // 1 Ether in wei
  const maxCoverPerUser1 = BN.from("10000000000000000"); // 0.01 Ether in wei
  const coverDivisor = 100;
  const price1 = 10000;

  const threeDays = 19350;
  const minPeriod2 = threeDays;
  const maxPeriod2 = 2354250; // one year
  const maxCoverAmount2 = BN.from("1000000000000000000000"); // 1000 Ether in wei
  const price2 = 11044; // 2.60%/yr

  before(async () => {
    artifacts = await import_artifacts();
    // deploy policy manager
    policyManager = (await deployContract(
      deployer,
      artifacts.PolicyManager,
      [
        governor.address
      ]
    )) as PolicyManager;

    // deploy weth
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;

    // deploy registry contract
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;

    // deploy vault
    vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address, weth.address])) as Vault;

    // deploy claims escrow
    claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, registry.address])) as ClaimsEscrow;

    // deploy treasury contract
    treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, ZERO_ADDRESS, weth.address, registry.address])) as Treasury;

    // deploy risk manager contract
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;

    // deploy BaseProduct
    product = (await deployContract(
      deployer,
      artifacts.MockProduct,
      [
        governor.address,
        policyManager.address,
        registry.address,
        ONE_SPLIT_VIEW, // this is for the coveredPlatform
        minPeriod1,
        maxPeriod1,
        price1,
        coverDivisor
      ]
    )) as MockProduct;

    // deploy second BaseProduct
    product2 = (await deployContract(
      deployer,
      artifacts.MockProduct,
      [
        governor.address,
        policyManager.address,
        registry.address,
        treasury.address, // this is for the coveredPlatform
        minPeriod1,
        maxPeriod1,
        price1,
        coverDivisor
      ]
    )) as MockProduct;

    await registry.connect(governor).setVault(vault.address);
    await registry.connect(governor).setClaimsEscrow(claimsEscrow.address);
    await registry.connect(governor).setTreasury(treasury.address);
    await registry.connect(governor).setPolicyManager(policyManager.address);
    await registry.connect(governor).setRiskManager(riskManager.address);
    await vault.connect(governor).setRequestor(claimsEscrow.address, true);
    await vault.connect(governor).setRequestor(treasury.address, true);
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await product.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function() {
      await expect(product.connect(buyer).setGovernance(buyer.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function() {
      await product.connect(governor).setGovernance(deployer.address);
      expect(await product.governance()).to.equal(governor.address);
      expect(await product.newGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async function() {
      await expect(product.connect(buyer).acceptGovernance()).to.be.revertedWith("!governance");
    });

    it("can transfer governance", async function() {
      let tx = await product.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(product, "GovernanceTransferred")
        .withArgs(deployer.address);
      expect(await product.governance()).to.equal(deployer.address);
      expect(await product.newGovernance()).to.equal(ZERO_ADDRESS);
      await product.connect(deployer).setGovernance(governor.address);
      await product.connect(governor).acceptGovernance();
    });
  });

  describe("productParameters", () => {
    before(async function () {
      await vault.connect(deployer).depositEth({value:maxCoverAmount1.mul(3)});
      await riskManager.connect(governor).setProductWeights([product.address,product2.address],[1,2]);
    });
    it("can get price", async function() {
      expect(await product.price()).to.eq(price1);
    });
    it("can set price", async function() {
      await product.connect(governor).setPrice(price2);
      expect(await product.price()).to.equal(price2);
    });
    it("should revert setPrice if not called by governance", async function() {
      await expect(product.connect(buyer).setPrice(price1)).to.be.revertedWith("!governance");
    });
    it("can get minPeriod", async function() {
      expect(await product.minPeriod()).to.eq(minPeriod1);
    });
    it("can set minPeriod", async function() {
      await product.connect(governor).setMinPeriod(minPeriod2);
      expect(await product.minPeriod()).to.equal(minPeriod2);
    });
    it("should revert setMinPeriod if not called by governance", async function() {
      await expect(product.connect(buyer).setMinPeriod(minPeriod1)).to.be.revertedWith("!governance");
    });
    it("can get maxPeriod", async function() {
      expect(await product.maxPeriod()).to.eq(maxPeriod1);
    });
    it("can set maxPeriod", async function() {
      await product.connect(governor).setMaxPeriod(maxPeriod2);
      expect(await product.maxPeriod()).to.equal(maxPeriod2);
    });
    it("should revert setMaxPeriod if not called by governance", async function() {
      await expect(product.connect(buyer).setMaxPeriod(maxPeriod1)).to.be.revertedWith("!governance");
    });
    it("can get maxCoverAmount", async function() {
      expect(await product.maxCoverAmount()).to.eq(maxCoverAmount1);
    });
    it("can get maxCoverPerUser", async function() {
      expect(await product.maxCoverPerUser()).to.eq(maxCoverPerUser1);
    });
    it("can get covered platform", async function () {
      expect(await product.coveredPlatform()).to.equal(ONE_SPLIT_VIEW);
    });
    it("can set covered platform", async function() {
      await product.connect(governor).setCoveredPlatform(treasury.address);
      expect(await product.coveredPlatform()).to.equal(treasury.address);
      await product.connect(governor).setCoveredPlatform(ONE_SPLIT_VIEW);
    });
    it("should revert setCoveredPlatform if not called by governance", async function() {
      await expect(product.connect(buyer).setCoveredPlatform(buyer.address)).to.be.revertedWith("!governance");
    });
    it("can get policy manager", async function() {
      expect(await product.policyManager()).to.equal(policyManager.address);
    });
    it("can set policy manager", async function() {
      await product.connect(governor).setPolicyManager(treasury.address);
      expect(await product.policyManager()).to.equal(treasury.address);
      await product.connect(governor).setPolicyManager(policyManager.address);
    });
    it("should revert setPolicyManager if not called by governance", async function() {
      await expect(product.connect(buyer).setPolicyManager(buyer.address)).to.be.revertedWith("!governance");
    });
  });

  describe("pause", function() {
    it("starts unpaused", async function() {
      expect(await product.paused()).to.equal(false);
    });
    it("cannot be paused by non governance", async function() {
      await expect(product.connect(buyer).setPaused(true)).to.be.revertedWith("!governance");
      expect(await product.paused()).to.equal(false);
    });
    it("can be paused", async function() {
      await product.connect(governor).setPaused(true);
      expect(await product.paused()).to.equal(true);
    });
    it("cannot be unpaused by non governance", async function() {
      await expect(product.connect(buyer).setPaused(false)).to.be.revertedWith("!governance");
      expect(await product.paused()).to.equal(true);
    });
    it("can be unpaused", async function() {
      await product.connect(governor).setPaused(false);
      expect(await product.paused()).to.equal(false);
    });
  });

  describe("buyPolicy", () => {
    let price = price2;
    let blocks = BN.from(25100); // less than the max
    let positionAmount = BN.from("1000000000000000000"); // one eth
    let coverAmount = BN.from("500000000000000000"); // half of one eth
    let divisor = BN.from("1000000000000");

    before(async function() {
      var depositAmount = maxCoverAmount2.sub(maxCoverAmount1.mul(3));
      await vault.connect(deployer).depositEth({value:depositAmount});
      await policyManager.connect(governor).addProduct(product.address);
      expect(await policyManager.productIsActive(product.address)).to.equal(true);
    });
    it("can getQuote", async function() {
      let expectedPremium = coverAmount
        .mul(blocks)
        .mul(price)
        .div(divisor);
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverAmount, blocks));
      expect(quote).to.equal(expectedPremium);
    });
    it("cannot buy policy to cover zero value position", async function() {
      await product.setPositionValue(0);
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount, blocks)).to.be.revertedWith("zero position value");
    });
    it("cannot buy policy over max global cover amount", async function() {
      let positionAmount2 = BN.from("10000000000000000000000"); // 10000 Ether in wei
      await product.setPositionValue(positionAmount2);
      let coverAmount2 = BN.from("5000000000000000000000"); // 5000 Ether in wei
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount2, blocks)).to.be.revertedWith("max covered amount is reached");
    });
    it("cannot buy policy over max user cover amount", async function() {
      let positionAmount2 = BN.from("100000000000000000000"); // 100 Ether in wei
      await product.setPositionValue(positionAmount2);
      let coverAmount2 = BN.from("50000000000000000000"); // 50 Ether in wei
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount2, blocks)).to.be.revertedWith("over max cover single user");
    });
    it("cannot buy policy with insufficient payment", async function() {
      await product.setPositionValue(positionAmount);
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverAmount, blocks));
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount, blocks, { value: quote.sub(1) })).to.be.revertedWith("insufficient payment");
    });
    it("cannot buy policy under min period", async function() {
      let blocks2 = minPeriod2 - 1;
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverAmount, blocks2));
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount, blocks2, { value: quote })).to.be.revertedWith("invalid period");
    });
    it("cannot buy policy over max period", async function() {
      let blocks2 = maxPeriod2 + 1;
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverAmount, blocks2));
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount, blocks2, { value: quote })).to.be.revertedWith("invalid period");
    });
    it("cannot buy policy that covers nothing", async function() {
      let coverAmount2 = 0;
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverAmount2, blocks));
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount2, blocks, { value: quote })).to.be.reverted;
    });
    it("cannot buy policy while paused", async function() {
      await product.connect(governor).setPaused(true);
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverAmount, blocks));
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount, blocks, { value: quote })).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });
    it("can buyPolicy", async function() {
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverAmount, blocks));
      let tx = await product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount, blocks, { value: quote });
      await expect(tx)
        .to.emit(product, "PolicyCreated")
        .withArgs(1);
    });
    it("returns overpayment from buy policy", async function() {
      let treasuryBalance1 = await provider.getBalance(treasury.address);
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverAmount, blocks));
      let tx = await product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverAmount, blocks, { value: quote.add(100) });
      await expect(tx)
        .to.emit(product, "PolicyCreated")
        .withArgs(2);
      let treasuryBalance2 = await provider.getBalance(treasury.address);
      expect(treasuryBalance2.sub(treasuryBalance1)).to.equal(quote);
    });
  });

  describe("extendPolicy", function() {
    let policyID = BN.from(1);
    let blocks = BN.from(6450);
    let coverAmount = BN.from("500000000000000000"); // half of one eth
    let quote: BN;
    before(async function() {
      quote = await product.connect(buyer).getQuote(buyer.address, positionContract.address, coverAmount, blocks);
    });

    it("cannot extend nonexistent policy", async function() {
      await expect(product.connect(buyer).extendPolicy(99, blocks, { value: quote })).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot extend someone elses policy", async function() {
      await expect(product.connect(deployer).extendPolicy(policyID, blocks, { value: quote })).to.be.revertedWith("!policyholder");
    });
    it("cannot extend from a different product", async function() {
      await expect(product2.connect(buyer).extendPolicy(policyID, blocks, { value: quote })).to.be.revertedWith("wrong product");
    });
    it("cannot extend an expired policy", async function() {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 10);
      await expect(product.connect(buyer).extendPolicy(policyID, blocks, { value: quote })).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    });
    it("cannot over extend policy", async function() {
      let blocks2 = maxPeriod2 + 1;
      let quote2 = await product.connect(buyer).getQuote(buyer.address, positionContract.address, coverAmount, blocks2);
      await expect(product.connect(buyer).extendPolicy(policyID, blocks2, { value: quote2 })).to.be.revertedWith("invalid period");
    });
    it("cannot extend policy with insufficient payment", async function() {
      await expect(product.connect(buyer).extendPolicy(policyID, blocks, { value: quote.sub(1) })).to.be.revertedWith("insufficient payment");
    });
    it("cannot extend policy while paused", async function() {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(buyer).extendPolicy(policyID, blocks, { value: quote })).to.be.revertedWith("cannot extend when paused");
      await product.connect(governor).setPaused(false);
    });
    it("can extend policy", async function() {
      let tx = await product.connect(buyer).extendPolicy(policyID, blocks, { value: quote });
      await expect(tx)
        .to.emit(product, "PolicyExtended")
        .withArgs(policyID);
    });
    it("returns overpayment from extend policy", async function() {
      let treasuryBalance1 = await provider.getBalance(treasury.address);
      let policyID2 = BN.from(2);
      let tx = await product.connect(buyer).extendPolicy(policyID2, blocks, { value: quote.add(100) });
      await expect(tx)
        .to.emit(product, "PolicyExtended")
        .withArgs(policyID2);
      let treasuryBalance2 = await provider.getBalance(treasury.address);
      expect(treasuryBalance2.sub(treasuryBalance1)).to.equal(quote);
    });
  });

  describe("updateCoverAmount", function() {
    let policyID = BN.from(1);
    let blocks = BN.from(6450);
    let coverAmount = BN.from("600000000000000000"); // 0.6 eth
    let quote: BN;
    before(async function() {
      quote = await product.connect(buyer).getQuote(buyer.address, positionContract.address, coverAmount, blocks);
    });
    it("cannot update cover amount while paused", async function() {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(buyer).updateCoverAmount(policyID, coverAmount, { value: quote })).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });
    it("cannot update cover amount for nonexistent policy", async function() {
      await expect(product.connect(buyer).updateCoverAmount(99, coverAmount, { value: quote })).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot update cover amount for someone elses policy", async function() {
      await expect(product.connect(deployer).updateCoverAmount(policyID, coverAmount, { value: quote })).to.be.revertedWith("!policyholder");
    });
    it("cannot update cover amount for from a different product", async function() {
      await expect(product2.connect(buyer).updateCoverAmount(policyID, coverAmount, { value: quote })).to.be.revertedWith("wrong product");
    });
    it("cannot update cover amount for an expired policy", async function() {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 10);
      await expect(product.connect(buyer).updateCoverAmount(policyID, coverAmount, { value: quote })).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    });
    it("cannot update cover amount to zero", async function() {
      let quote2 = BN.from(await product.getQuote(buyer.address, positionContract.address, 0, blocks));
      await expect(product.connect(buyer).updateCoverAmount(policyID, 0, { value: quote2 })).to.be.revertedWith("zero position value");
    });
    it("cannot update cover amount over max global cover amount", async function() {
      let maxCover = await product.maxCoverAmount();
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let productCover = await product.activeCoverAmount();
      let newCover = maxCover.sub(productCover).add(policyCover).add(1);
      let quote2 = BN.from(await product.getQuote(buyer.address, positionContract.address, newCover, blocks));
      await product.setPositionValue(newCover);
      await expect(product.connect(buyer).updateCoverAmount(policyID, newCover, { value: quote2 })).to.be.revertedWith("max covered amount is reached");
    });
    it("cannot update cover amount over max user cover amount", async function() {
      let userMaxPositionAmount = BN.from("100000000000000000000"); // 100 Ether in wei
      await product.setPositionValue(userMaxPositionAmount);
      await expect(product.connect(buyer).updateCoverAmount(policyID, userMaxPositionAmount, { value: quote })).to.be.revertedWith("over max cover single user");
    });
    it("reverts insufficient payment", async function () {
      let positionAmount = BN.from("1000000000000000000"); // one eth
      await product.setPositionValue(positionAmount);
      let quote2 = BN.from(await product.getQuote(buyer.address, positionContract.address, coverAmount, blocks));
      await expect(product.connect(buyer).updateCoverAmount(policyID, positionAmount, { value: quote2.sub(1) })).to.be.revertedWith("insufficient payment");
    });
    it("can increase cover amount with exact payment", async function () {
      let positionAmount = BN.from("1000000000000000000"); // one eth
      await product.setPositionValue(positionAmount);
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      expect(coverAmount).to.be.gt(prevCoverAmount);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = coverAmount
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
      let bal1 = await buyer.getBalance();
      let tx = await product.connect(buyer).updateCoverAmount(policyID, coverAmount, { value: premium });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await buyer.getBalance();
      expect(bal1.sub(bal2).sub(gasCost)).to.equal(premium);
    });
    it("can increase cover amount and return over payment", async function () {
      let positionAmount = BN.from("1000000000000000000"); // one eth
      await product.setPositionValue(positionAmount);
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let coverAmount = BN.from("700000000000000000"); // 0.7 eth
      expect(coverAmount).to.be.gt(prevCoverAmount);
      let newPremium = coverAmount
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
      let bal1 = await buyer.getBalance();
      let tx = await product.connect(buyer).updateCoverAmount(policyID, coverAmount, { value: premium.mul(11).div(10) });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await buyer.getBalance();
      expect(bal1.sub(bal2).sub(gasCost)).to.equal(premium);
    });
    it("can decrease cover amount", async function () {
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let coverAmount = policyCover.div(10);
      await product.setPositionValue(coverAmount);
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      expect(coverAmount).to.be.lt(prevCoverAmount);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = coverAmount
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
      let bal1 = await buyer.getBalance();
      let tx = await product.connect(buyer).updateCoverAmount(policyID, coverAmount, { value: 0 });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await buyer.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(refund);
    });
    it("can decrease cover amount and return msg.value", async function () {
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let coverAmount = policyCover.div(10);
      await product.setPositionValue(coverAmount);
      // calculate new premium
      let expBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID));
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID);
      expect(coverAmount).to.be.lt(prevCoverAmount);
      let prevPrice = await policyManager.getPolicyPrice(policyID);
      let remainingBlocks = expBlock.sub(blockNumber);
      let newPremium = coverAmount
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
      let bal1 = await buyer.getBalance();
      let tx = await product.connect(buyer).updateCoverAmount(policyID, coverAmount, { value: "1000000000000" });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await buyer.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(refund);
    });
    it("can keep cover amount the same", async function () {
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      await product.setPositionValue(policyCover);
      let bal1 = await buyer.getBalance();
      let tx = await product.connect(buyer).updateCoverAmount(policyID, policyCover, { value: "1000000000000" });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await buyer.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(0);
    });
  });

  describe("updatePolicy", function() {
    let blocks = BN.from(25100); // less than the max
    let positionAmount = BN.from("1000000000000000000"); // one eth
    let coverAmount = BN.from("700000000000000000"); // 7/10 of one eth
    let policyID = BN.from(1);
    let quote: BN;
    before(async function() {
      await product.setPositionValue(positionAmount);
      quote = await product.connect(buyer).getQuote(buyer.address, positionContract.address, coverAmount, blocks);
    });
    it("cannot update while paused", async function() {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(buyer).updatePolicy(policyID, coverAmount, blocks, { value: quote })).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    });
    it("cannot update nonexistent policy", async function() {
      await expect(product.connect(buyer).updatePolicy(99, coverAmount, blocks, { value: quote })).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot update someone elses policy", async function() {
      await expect(product.connect(deployer).updatePolicy(policyID, coverAmount, blocks, { value: quote })).to.be.revertedWith("!policyholder");
    });
    it("cannot update from a different product", async function() {
      await expect(product2.connect(buyer).updatePolicy(policyID, coverAmount, blocks, { value: quote })).to.be.revertedWith("wrong product");
    });
    it("cannot update an expired policy", async function() {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 10);
      await expect(product.connect(buyer).updatePolicy(policyID, coverAmount, blocks, { value: quote })).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    });
    it("cannot update an over extend policy", async function() {
      let blocks2 = maxPeriod2 + 1;
      let quote2 = await product.connect(buyer).getQuote(buyer.address, positionContract.address, coverAmount, blocks2);
      await expect(product.connect(buyer).updatePolicy(policyID, coverAmount, blocks2, { value: quote2 })).to.be.revertedWith("invalid period");
    });
    it("cannot update policy with insufficient payment", async function() {
      await expect(product.connect(buyer).updatePolicy(policyID, coverAmount, blocks, { value: BN.from(0) })).to.be.revertedWith("insufficient payment");
    });
    it("cannot update policy to zero cover amount", async function() {
      await expect(product.connect(buyer).updatePolicy(policyID, 0, blocks, { value: quote })).to.be.revertedWith("zero position value");
    });
    it("cannot update policy for zero position amount", async function() {
      await product.setPositionValue(BN.from(0));
      await expect(product.connect(buyer).updatePolicy(policyID, coverAmount, blocks, { value: quote })).to.be.revertedWith("zero position value");
      await product.setPositionValue(positionAmount);
    });
    it("cannot update over max global cover amount", async function() {
      let maxCover = await product.maxCoverAmount();
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let productCover = await product.activeCoverAmount();
      let newCover = maxCover.sub(productCover).add(policyCover).add(1);
      let quote2 = BN.from(await product.getQuote(buyer.address, positionContract.address, newCover, blocks));
      await product.setPositionValue(newCover);
      await expect(product.connect(buyer).updatePolicy(policyID, newCover, blocks, { value: quote2 })).to.be.revertedWith("max covered amount is reached");
    });
    it("cannot update over max user cover amount", async function() {
      let userMaxPositionAmount = BN.from("100000000000000000000"); // 100 Ether in wei
      await product.setPositionValue(userMaxPositionAmount);
      await expect(product.connect(buyer).updatePolicy(policyID, userMaxPositionAmount, blocks, { value: quote })).to.be.revertedWith("over max cover single user");
    });
    it("can update policy with both new cover amount and extension", async function() {
      await product.setPositionValue(positionAmount);
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
      // premium
      let premium = newPremium.sub(paidPremium);
      let tx = await product.connect(buyer).updatePolicy(policyID, coverAmount, threeDays, { value: premium });
      let expirationBlock = await policyManager.getPolicyExpirationBlock(policyID);
      let coverAmount2 = await policyManager.getPolicyCoverAmount(policyID);
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      expect(prevExpirationBlock.add(threeDays)).to.equal(expirationBlock);
      expect(coverAmount2).to.equal(coverAmount);
    });
    it("returns overpayment from update policy", async function() {
      await product.setPositionValue(positionAmount);
      let treasuryBalance1 = await provider.getBalance(treasury.address);
      let policyID2 = BN.from(2);
      let newCoverAmount = BN.from("600000000000000000"); // 6/10 of one eth
      let blockNumber = BN.from(await provider.getBlockNumber()).add(1);
      let prevExpirationBlock = BN.from(await policyManager.getPolicyExpirationBlock(policyID2));
      let prevCoverAmount = await policyManager.getPolicyCoverAmount(policyID2);
      let prevPrice = await policyManager.getPolicyPrice(policyID2);

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
      let tx = await product.connect(buyer).updatePolicy(policyID2, newCoverAmount, threeDays, { value: premium.add(100) });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID2);
      let treasuryBalance2 = await provider.getBalance(treasury.address);
      expect(treasuryBalance2.sub(treasuryBalance1)).to.equal(premium);
    });
    it("can decrease cover amount", async function () {
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let coverAmount = policyCover.div(10);
      await product.setPositionValue(coverAmount);
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
      let bal1 = await buyer.getBalance();
      let tx = await product.connect(buyer).updatePolicy(policyID, coverAmount, threeDays, { value: 0 });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await buyer.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(refund);
    });
    it("can decrease cover amount and return msg.value", async function () {
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      let coverAmount = policyCover.div(10);
      await product.setPositionValue(coverAmount);
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
      let bal1 = await buyer.getBalance();
      let tx = await product.connect(buyer).updatePolicy(policyID, coverAmount, threeDays, { value: "1000000000000" });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await buyer.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(refund);
    });
    it("can keep cover amount the same", async function () {
      let policyCover = (await policyManager.policyInfo(policyID)).coverAmount;
      await product.setPositionValue(policyCover);
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
      let bal1 = await buyer.getBalance();
      let tx = await product.connect(buyer).updatePolicy(policyID, policyCover, threeDays, { value: premium });
      await expect(tx)
        .to.emit(product, "PolicyUpdated")
        .withArgs(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await buyer.getBalance();
      expect(bal1.sub(bal2).sub(gasCost)).to.equal(premium);
    });
  });

  describe("cancelPolicy", function() {
    let policyID = BN.from(1);

    it("cannot cancel nonexistent policy", async function() {
      await expect(product.connect(buyer).cancelPolicy(99)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot cancel someone elses policy", async function() {
      await expect(product.connect(deployer).cancelPolicy(policyID)).to.be.revertedWith("!policyholder");
    });
    it("cannot cancel from a different product", async function() {
      await expect(product2.connect(buyer).cancelPolicy(policyID)).to.be.revertedWith("wrong product");
    });
    it("refunds proper amount", async function() {
      //let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, 1, minPeriod2));
      let info = await policyManager.policyInfo(policyID);
      let block = await provider.getBlockNumber();
      let balance1 = await buyer.getBalance();
      let expectedRefund = BN.from(info.expirationBlock)
        .sub(block + 1)
        .mul(info.price)
        .mul(info.coverAmount)
        .div(1e12);
      let tx = await product.connect(buyer).cancelPolicy(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let balance2 = await buyer.getBalance();
      let actualRefund = balance2.add(gasCost).sub(balance1);
      expect(actualRefund).to.equal(expectedRefund);
    });
  });

  describe("paclas signers", function() {
    it("non governance cannot add signers", async function() {
      await expect(product.connect(buyer).addSigner(buyer.address)).to.be.revertedWith("!governance");
    });
    it("can add signers", async function() {
      expect(await product.isAuthorizedSigner(governor.address)).to.equal(false);
      let tx = await product.connect(governor).addSigner(governor.address);
      await expect(tx)
        .to.emit(product, "SignerAdded")
        .withArgs(governor.address);
      expect(await product.isAuthorizedSigner(governor.address)).to.equal(true);
    });
    it("non governance cannot remove signers", async function() {
      await expect(product.connect(buyer).removeSigner(buyer.address)).to.be.revertedWith("!governance");
    });
    it("can remove signers", async function() {
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
    let product3: MockProduct
    before(async function () {
      product3 = (await deployContract(
        deployer,
        artifacts.MockProduct,
        [
          governor.address,
          mockPolicyManager.address,
          registry.address,
          treasury.address, // this is for the coveredPlatform
          minPeriod1,
          maxPeriod1,
          price1,
          coverDivisor
        ]
      )) as MockProduct;
    })
    it("starts at zero", async function () {
      expect(await product3.activeCoverAmount()).to.equal(0);
    });
    it("cannot update by non policy manager", async function() {
      await expect(product3.connect(deployer).updateActiveCoverAmount(1)).to.be.revertedWith("!policymanager");
    });
    it("can update", async function() {
      await product3.connect(mockPolicyManager).updateActiveCoverAmount(3);
      expect(await product3.activeCoverAmount()).to.equal(3);
      await product3.connect(mockPolicyManager).updateActiveCoverAmount(5);
      expect(await product3.activeCoverAmount()).to.equal(8);
      await product3.connect(mockPolicyManager).updateActiveCoverAmount(-6);
      expect(await product3.activeCoverAmount()).to.equal(2);
    });
    it("cannot be negative", async function() {
      await expect(product3.connect(mockPolicyManager).updateActiveCoverAmount(-7)).to.be.reverted;
    });
  });
});
