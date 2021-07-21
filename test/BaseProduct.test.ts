import { waffle, ethers } from "hardhat";
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
import { PolicyManager, MockProduct, Treasury, Weth9, ClaimsEscrow, Registry, Vault } from "../typechain";

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
  const [deployer, governor, positionContract, buyer, mockPolicyManager] = provider.getWallets();

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
  const minPeriod1 = 6450; // this is about 1 day
  const maxPeriod1 = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
  const maxCoverAmount1 = BN.from("1000000000000000000"); // 1 Ether in wei
  const maxCoverPerUser1 = BN.from("10000000000000000"); // 0.01 Ether in wei
  const manageFee1 = BN.from("100000000000000"); // 0.0001 Ether in wei
  const price1 = 10000;

  const threeDays = 19350;
  const minPeriod2 = threeDays;
  const maxPeriod2 = 2354250; // one year
  const maxCoverAmount2 = BN.from("1000000000000000000000"); // 1000 Ether in wei
  const maxCoverPerUser2 = BN.from("10000000000000000000"); // 10 Ether in wei
  const manageFee2 = BN.from("100000000000000000"); // 0.1 Ether in wei
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
    weth = (await deployContract(
        deployer,
        artifacts.WETH
    )) as Weth9;

    // deploy registry contract
    registry = (await deployContract(
      deployer,
      artifacts.Registry,
      [
        deployer.address
      ]
    )) as Registry;

    // deploy vault
    vault = (await deployContract(
      deployer,
      artifacts.Vault,
      [
        deployer.address,
        registry.address,
        weth.address
      ]
    )) as Vault;

    // deploy claims escrow
    claimsEscrow = (await deployContract(
        deployer,
        artifacts.ClaimsEscrow,
        [deployer.address, registry.address]
    )) as ClaimsEscrow;

    // deploy treasury contract
    treasury = (await deployContract(
      deployer,
      artifacts.Treasury,
      [
        deployer.address,
        ZERO_ADDRESS,
        weth.address,
        registry.address
      ]
    )) as Treasury;

    // deploy BaseProduct
    product = (await deployContract(
      deployer,
      artifacts.MockProduct,
      [
        deployer.address,
        policyManager.address,
        registry.address,
        ONE_SPLIT_VIEW, // this is for the coveredPlatform
        maxCoverAmount1,
        maxCoverPerUser1,
        minPeriod1,
        maxPeriod1,
        manageFee1,
        price1
      ]
    )) as MockProduct;

    // deploy second BaseProduct
    product2 = (await deployContract(
      deployer,
      artifacts.MockProduct,
      [
        deployer.address,
        policyManager.address,
        registry.address,
        ONE_SPLIT_VIEW, // this is for the coveredPlatform
        maxCoverAmount1,
        maxCoverPerUser1,
        minPeriod1,
        maxPeriod1,
        manageFee1,
        price1
      ]
    )) as MockProduct;

    await registry.setVault(vault.address);
    await registry.setClaimsEscrow(claimsEscrow.address);
    await registry.setTreasury(treasury.address);
    await registry.setPolicyManager(policyManager.address);
  })

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await product.governance()).to.equal(deployer.address);
    })

    it("rejects setting new governance by non governor", async function () {
      await expect(product.connect(buyer).setGovernance(buyer.address)).to.be.revertedWith("!governance");
    })

    it("can set new governance", async function () {
      await product.connect(deployer).setGovernance(governor.address);
      expect(await product.governance()).to.equal(deployer.address);
      expect(await product.newGovernance()).to.equal(governor.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(product.connect(buyer).acceptGovernance()).to.be.revertedWith("!governance");
    })

    it("can transfer governance", async function () {
      let tx = await product.connect(governor).acceptGovernance();
      await expect(tx).to.emit(product, "GovernanceTransferred").withArgs(governor.address);
      expect(await product.governance()).to.equal(governor.address);
      expect(await product.newGovernance()).to.equal(ZERO_ADDRESS);
    })
  })

  describe("productParameters", () => {
    it("can get price", async function () {
      expect(await product.price()).to.eq(price1);
    });
    it("can set price", async function () {
      await product.connect(governor).setPrice(price2);
      expect(await product.price()).to.equal(price2);
    });
    it("should revert setPrice if not called by governance", async function () {
      await expect(product.connect(buyer).setPrice(price1)).to.be.revertedWith("!governance");
    });
    it("can get manageFee", async function () {
      expect(await product.manageFee()).to.eq(manageFee1);
    });
    it("can set manageFee", async function () {
      await product.connect(governor).setManageFee(manageFee2);
      expect(await product.manageFee()).to.equal(manageFee2);
    })
    it("should revert setManageFee if not called by governance", async function () {
      await expect(product.connect(buyer).setManageFee(manageFee1)).to.be.revertedWith("!governance");
    });
    it("can get minPeriod", async function () {
      expect(await product.minPeriod()).to.eq(minPeriod1);
    });
    it("can set minPeriod", async function () {
      await product.connect(governor).setMinPeriod(minPeriod2);
      expect(await product.minPeriod()).to.equal(minPeriod2);
    })
    it("should revert setMinPeriod if not called by governance", async function () {
      await expect(product.connect(buyer).setMinPeriod(minPeriod1)).to.be.revertedWith("!governance");
    });
    it("can get maxPeriod", async function () {
      expect(await product.maxPeriod()).to.eq(maxPeriod1);
    });
    it("can set maxPeriod", async function () {
      await product.connect(governor).setMaxPeriod(maxPeriod2);
      expect(await product.maxPeriod()).to.equal(maxPeriod2);
    })
    it("should revert setMaxPeriod if not called by governance", async function () {
      await expect(product.connect(buyer).setMaxPeriod(maxPeriod1)).to.be.revertedWith("!governance");
    });
    it("can get maxCoverAmount", async function () {
      expect(await product.maxCoverAmount()).to.eq(maxCoverAmount1);
    });
    it("can set maxCoverAmount", async function () {
      await product.connect(governor).setMaxCoverAmount(maxCoverAmount2);
      expect(await product.maxCoverAmount()).to.equal(maxCoverAmount2);
    })
    it("should revert setMaxCoverAmount if not called by governance", async function () {
      await expect(product.connect(buyer).setMaxCoverAmount(maxCoverAmount1)).to.be.revertedWith("!governance");
    });
    it("can get maxCoverPerUser", async function () {
      expect(await product.maxCoverPerUser()).to.eq(maxCoverPerUser1);
    });
    it("can set maxCoverPerUser", async function () {
      await product.connect(governor).setMaxCoverPerUser(maxCoverPerUser2);
      expect(await product.maxCoverPerUser()).to.equal(maxCoverPerUser2);
    })
    it("should revert setmaxCoverPerUser if not called by governance", async function () {
      await expect(product.connect(buyer).setMaxCoverPerUser(maxCoverPerUser1)).to.be.revertedWith("!governance");
    });
    it("can get covered platform", async function () {
      expect(await product.coveredPlatform()).to.equal(ONE_SPLIT_VIEW);
    });
    it("can set covered platform", async function () {
      await product.connect(governor).setCoveredPlatform(treasury.address);
      expect(await product.coveredPlatform()).to.equal(treasury.address);
      await product.connect(governor).setCoveredPlatform(ONE_SPLIT_VIEW);
    });
    it("should revert setCoveredPlatform if not called by governance", async function () {
      await expect(product.connect(buyer).setCoveredPlatform(buyer.address)).to.be.revertedWith("!governance");
    });
    it("can get policy manager", async function () {
      expect(await product.policyManager()).to.equal(policyManager.address);
    });
    it("can set policy manager", async function () {
      await product.connect(governor).setPolicyManager(treasury.address);
      expect(await product.policyManager()).to.equal(treasury.address);
      await product.connect(governor).setPolicyManager(policyManager.address);
    });
    it("should revert setPolicyManager if not called by governance", async function () {
      await expect(product.connect(buyer).setPolicyManager(buyer.address)).to.be.revertedWith("!governance");
    });
  });

  describe("pause", function () {
    it("starts unpaused", async function () {
      expect(await product.paused()).to.equal(false);
    });
    it("cannot be paused by non governance", async function () {
      await expect(product.connect(buyer).setPaused(true)).to.be.revertedWith("!governance");
      expect(await product.paused()).to.equal(false);
    });
    it("can be paused", async function () {
      await product.connect(governor).setPaused(true);
      expect(await product.paused()).to.equal(true);
    });
    it("cannot be unpaused by non governance", async function () {
      await expect(product.connect(buyer).setPaused(false)).to.be.revertedWith("!governance");
      expect(await product.paused()).to.equal(true);
    });
    it("can be unpaused", async function () {
      await product.connect(governor).setPaused(false);
      expect(await product.paused()).to.equal(false);
    });
  })

  describe("buyPolicy", () => {
    let price = price2;
    let coverLimit = BN.from(5000); // cover 50% of the position
    let blocks = BN.from(25100); // less than the max
    let positionAmount = BN.from("1000000000000000000"); // one eth
    let divisor = BN.from("10000000000000000");

    before(async function () {
      await policyManager.connect(governor).addProduct(product.address);
      expect(await policyManager.productIsActive(product.address)).to.equal(true);
    })
    it("can getQuote", async function () {
      let expectedPremium = positionAmount.mul(coverLimit).mul(blocks).mul(price).div(divisor);
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverLimit, blocks))
      expect(quote).to.equal(expectedPremium);
    })
    it("cannot buy policy to cover zero value position", async function () {
      await product.setPositionValue(0);
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit, blocks)).to.be.revertedWith("zero position value");
    })
    it("cannot buy policy over global cover limit", async function () {
      let positionAmount2 = BN.from("10000000000000000000000"); // 10000 Ether in wei
      await product.setPositionValue(positionAmount2);
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit, blocks)).to.be.revertedWith("max covered amount is reached");
    })
    it("cannot buy policy over user cover limit", async function () {
      let positionAmount2 = BN.from("100000000000000000000"); // 100 Ether in wei
      await product.setPositionValue(positionAmount2);
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit, blocks)).to.be.revertedWith("over max cover single user");
    })
    it("cannot buy policy with insufficient payment", async function () {
      await product.setPositionValue(positionAmount);
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverLimit, blocks))
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit, blocks, { value: quote.sub(1) })).to.be.revertedWith("insufficient payment or premium is zero");
    })
    it("cannot buy policy under min period", async function () {
      let blocks2 = minPeriod2 - 1;
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverLimit, blocks2))
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit, blocks2, { value: quote })).to.be.revertedWith("invalid period");
    })
    it("cannot buy policy over max period", async function () {
      let blocks2 = maxPeriod2 + 1;
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverLimit, blocks2))
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit, blocks2, { value: quote })).to.be.revertedWith("invalid period");
    })
    it("cannot buy policy under cover limit", async function () {
      let coverLimit2 = 0;
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverLimit2, blocks))
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit2, blocks, { value: quote })).to.be.reverted;
    })
    it("cannot buy policy over cover limit", async function () {
      let coverLimit2 = 10001;
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverLimit2, blocks))
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit2, blocks, { value: quote })).to.be.revertedWith("invalid cover limit percentage");
    })
    it("cannot buy policy while paused", async function () {
      await product.connect(governor).setPaused(true);
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverLimit, blocks));
      await expect(product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit, blocks, { value: quote })).to.be.revertedWith("cannot buy when paused");
      await product.connect(governor).setPaused(false);
    })
    it("can buyPolicy", async function () {
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverLimit, blocks));
      let tx = await product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit, blocks, { value: quote });
      await expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
    })
    it("returns overpayment from buy policy", async function () {
      let treasuryBalance1 = await provider.getBalance(treasury.address);
      let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, coverLimit, blocks));
      let tx = await product.connect(buyer).buyPolicy(buyer.address, positionContract.address, coverLimit, blocks, { value: quote.add(100) });
      await expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
      let treasuryBalance2 = await provider.getBalance(treasury.address);
      expect(treasuryBalance2.sub(treasuryBalance1)).to.equal(quote);
    })
  })

  describe("extendPolicy", function () {
    let policyID = BN.from(1);
    let blocks = BN.from(6450);
    let coverLimit = BN.from(5000);
    let quote: BN;
    before(async function() {
      quote = await product.connect(buyer).getQuote(buyer.address, positionContract.address, coverLimit, blocks);
    })

    it("cannot extend nonexistent policy", async function() {
      await expect(product.connect(buyer).extendPolicy(99, blocks, {value: quote})).to.be.revertedWith("query for nonexistent token");
    })
    it("cannot extend someone elses policy", async function() {
      await expect(product.connect(deployer).extendPolicy(policyID, blocks, {value: quote})).to.be.revertedWith("!policyholder");
    })
    it("cannot extend from a different product", async function() {
      await expect(product2.connect(buyer).extendPolicy(policyID, blocks, {value: quote})).to.be.revertedWith("wrong product");
    })
    it("cannot extend an expired policy", async function () {
      let expBlock = await policyManager.getPolicyExpirationBlock(policyID);
      await product.setPolicyExpiration(policyID, 100);
      await expect(product.connect(buyer).extendPolicy(policyID, blocks, {value: quote})).to.be.revertedWith("policy is expired");
      await product.setPolicyExpiration(policyID, expBlock);
    })
    it("cannot extend by zero blocks", async function() {
      await expect(product.connect(buyer).extendPolicy(policyID, 0, {value: quote})).to.be.revertedWith("insufficient payment or premium is zero");
    })
    it("cannot over extend policy", async function() {
      let blocks2 = maxPeriod2+1;
      let quote2 = await product.connect(buyer).getQuote(buyer.address, positionContract.address, coverLimit, blocks2);
      await expect(product.connect(buyer).extendPolicy(policyID, blocks2, {value: quote2})).to.be.revertedWith("invalid period");
    })
    it("cannot extend policy with insufficient payment", async function() {
      await expect(product.connect(buyer).extendPolicy(policyID, blocks, {value: quote.sub(1)})).to.be.revertedWith("insufficient payment or premium is zero");
    })
    it("cannot extend policy while paused", async function () {
      await product.connect(governor).setPaused(true);
      await expect(product.connect(buyer).extendPolicy(policyID, blocks, {value: quote})).to.be.revertedWith("cannot extend when paused");
      await product.connect(governor).setPaused(false);
    })
    it("can extend policy", async function() {
      let tx = await product.connect(buyer).extendPolicy(policyID, blocks, {value: quote});
      await expect(tx).to.emit(product, "PolicyExtended").withArgs(policyID);
    })
    it("returns overpayment from extend policy", async function() {
      let treasuryBalance1 = await provider.getBalance(treasury.address);
      let policyID2 = BN.from(2);
      let tx = await product.connect(buyer).extendPolicy(policyID2, blocks, {value: quote.add(100)});
      await expect(tx).to.emit(product, "PolicyExtended").withArgs(policyID2);
      let treasuryBalance2 = await provider.getBalance(treasury.address);
      expect(treasuryBalance2.sub(treasuryBalance1)).to.equal(quote);
    })
  })

  describe("cancelPolicy", function () {
    let policyID = BN.from(1);
    //let blocks = BN.from(6450);
    //let coverLimit = BN.from(5000);
    //let quote: BN;
    //before(async function() {
      //quote = await product.connect(buyer).getQuote(buyer.address, positionContract.address, coverLimit, blocks);
    //})

    it("cannot cancel nonexistent policy", async function() {
      await expect(product.connect(buyer).cancelPolicy(99)).to.be.revertedWith("query for nonexistent token");
    })
    it("cannot cancel someone elses policy", async function() {
      await expect(product.connect(deployer).cancelPolicy(policyID)).to.be.revertedWith("!policyholder");
    })
    it("cannot cancel from a different product", async function() {
      await expect(product2.connect(buyer).cancelPolicy(policyID)).to.be.revertedWith("wrong product");
    })
    it("cannot refund negative amount", async function () {
      await expect(product.connect(buyer).cancelPolicy(policyID)).to.be.revertedWith("refund amount less than cancelation fee");
    })
    it("refunds proper amount", async function () {
      //let quote = BN.from(await product.getQuote(buyer.address, positionContract.address, 1, minPeriod2));
      await product.connect(governor).setManageFee(manageFee1);
      let info = await policyManager.getPolicyInfo(policyID);
      let block = await provider.getBlockNumber();
      let balance1 = await buyer.getBalance();
      let expectedRefund = info.expirationBlock.sub(block+1).mul(info.price).mul(info.coverAmount).div(1e12).sub(manageFee1);
      let tx = await product.connect(buyer).cancelPolicy(policyID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(tx.gasPrice || 0);
      let balance2 = await buyer.getBalance();
      let actualRefund = balance2.add(gasCost).sub(balance1);
      expect(actualRefund).to.equal(expectedRefund);
    })
  })

  describe("paclas signers", function () {
    it("non governance cannot add signers", async function () {
      await expect(product.connect(buyer).addSigner(buyer.address)).to.be.revertedWith("!governance");
    });
    it("can add signers", async function () {
      expect(await product.isAuthorizedSigner(governor.address)).to.equal(false);
      let tx = await product.connect(governor).addSigner(governor.address);
      await expect(tx).to.emit(product, "SignerAdded").withArgs(governor.address);
      expect(await product.isAuthorizedSigner(governor.address)).to.equal(true);
    });
    it("non governance cannot remove signers", async function () {
      await expect(product.connect(buyer).removeSigner(buyer.address)).to.be.revertedWith("!governance");
    });
    it("can remove signers", async function () {
      expect(await product.isAuthorizedSigner(governor.address)).to.equal(true);
      let tx = await product.connect(governor).removeSigner(governor.address);
      await expect(tx).to.emit(product, "SignerRemoved").withArgs(governor.address);
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
          deployer.address,
          mockPolicyManager.address,
          registry.address,
          ONE_SPLIT_VIEW, // this is for the coveredPlatform
          maxCoverAmount1,
          maxCoverPerUser1,
          minPeriod1,
          maxPeriod1,
          manageFee1,
          price1
        ]
      )) as MockProduct;
    })
    it("starts at zero", async function () {
      expect(await product3.activeCoverAmount()).to.equal(0);
    })
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
    })
  })
})
