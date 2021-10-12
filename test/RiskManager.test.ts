import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { RiskManager, Registry, Vault, Weth9, PolicyManager, MockProduct } from "../typechain";

describe("RiskManager", function () {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, product1, product2, product3, coveredPlatform] = provider.getWallets();

  // solace contracts
  let registry: Registry;
  let vault: Vault;
  let policyManager: PolicyManager;
  let riskManager: RiskManager;
  let product4: MockProduct;
  let product5: MockProduct;
  let product6: MockProduct;

  let weth: Weth9;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const NO_WEIGHT = BN.from("4294967295"); // max uint32
  const MAX_PRICE = BN.from("16777215"); // max uint24

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
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
    await registry.connect(governor).setRiskManager(riskManager.address);

    product4 = (await deployContract(deployer, artifacts.MockProduct, [governor.address, policyManager.address, registry.address, coveredPlatform.address, 0, 100000, 1])) as MockProduct;
    product5 = (await deployContract(deployer, artifacts.MockProduct, [governor.address, policyManager.address, registry.address, coveredPlatform.address, 0, 100000, 1])) as MockProduct;
    product6 = (await deployContract(deployer, artifacts.MockProduct, [governor.address, policyManager.address, registry.address, coveredPlatform.address, 0, 100000, 1])) as MockProduct;

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
      await expect(riskManager.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function () {
      await riskManager.connect(governor).setGovernance(deployer.address);
      expect(await riskManager.governance()).to.equal(governor.address);
      expect(await riskManager.newGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(riskManager.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    });
    it("can transfer governance", async function () {
      let tx = await riskManager.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(riskManager, "GovernanceTransferred").withArgs(deployer.address);
      expect(await riskManager.governance()).to.equal(deployer.address);
      expect(await riskManager.newGovernance()).to.equal(ZERO_ADDRESS);
      await riskManager.connect(deployer).setGovernance(governor.address);
      await riskManager.connect(governor).acceptGovernance();
    });
  });

  describe("product risk parameters", function () {
    it("should start unset", async function () {
      expect(await riskManager.numProducts()).to.equal(0);
      expect(await riskManager.product(0)).to.equal(ZERO_ADDRESS);
      await expect(riskManager.productRiskParams(product1.address)).to.be.revertedWith("product inactive");
      expect(await riskManager.weightSum()).to.equal(NO_WEIGHT);
    });
    it("should reject change by non governor", async function () {
      await expect(riskManager.connect(user).addProduct(product1.address, 1, 11044, 10)).to.be.revertedWith("!governance");
      await expect(riskManager.connect(user).setProductParams([product1.address],[1],[11044],[10])).to.be.revertedWith("!governance");
      await expect(riskManager.connect(user).removeProduct(product1.address)).to.be.revertedWith("!governance");
    });
    it("should reject invalid inputs", async function () {
      await expect(riskManager.connect(governor).addProduct(ZERO_ADDRESS, 1, 11044, 10)).to.be.revertedWith("zero address product");
      await expect(riskManager.connect(governor).addProduct(product1.address, 0, 11044, 10)).to.be.revertedWith("no weight");
      await expect(riskManager.connect(governor).addProduct(product1.address, 1, 0, 10)).to.be.revertedWith("no price");
      await expect(riskManager.connect(governor).addProduct(product1.address, 1, 11044, 0)).to.be.revertedWith("1/0");
      await expect(riskManager.connect(governor).addProduct(product1.address, BN.from(2).pow(32), 11044, 1)).to.be.reverted; // overflow
      await expect(riskManager.connect(governor).setProductParams([product1.address], [1,2], [11044], [10])).to.be.revertedWith("length mismatch");
      await expect(riskManager.connect(governor).setProductParams([product1.address], [1], [11044,22088], [10])).to.be.revertedWith("length mismatch");
      await expect(riskManager.connect(governor).setProductParams([product1.address], [1], [11044], [10,20])).to.be.revertedWith("length mismatch");
      await expect(riskManager.connect(governor).setProductParams([product1.address,product1.address], [1,2], [11044,11044], [10,10])).to.be.revertedWith("duplicate product");
      await expect(riskManager.connect(governor).setProductParams([ZERO_ADDRESS], [1], [11044], [10])).to.be.revertedWith("zero address product");
      await expect(riskManager.connect(governor).setProductParams([product1.address], [0], [11044], [10])).to.be.revertedWith("no weight");
      await expect(riskManager.connect(governor).setProductParams([product1.address], [1], [0], [10])).to.be.revertedWith("no price");
      await expect(riskManager.connect(governor).setProductParams([product1.address], [1], [11044], [0])).to.be.revertedWith("1/0");
      await expect(riskManager.connect(governor).setProductParams([product1.address], [BN.from(2).pow(32)], [11044], [10])).to.be.reverted; // overflow
    });
    it("should be set with setProductParams()", async function () {
      await riskManager.connect(governor).setProductParams([],[],[],[]); // clear
      let tx = await riskManager.connect(governor).setProductParams([product1.address,product2.address],[3,5],[11044,22088],[10,20]);
      expect(tx).to.emit(riskManager, "ProductParamsSet").withArgs(product1.address, 3, 11044, 10);
      expect(tx).to.emit(riskManager, "ProductParamsSet").withArgs(product2.address, 5, 22088, 20);
      expect(await riskManager.numProducts()).to.equal(2);
      expect(await riskManager.product(1)).to.equal(product1.address);
      expect(await riskManager.product(2)).to.equal(product2.address);
      let params1 = await riskManager.productRiskParams(product1.address);
      expect(params1.weight).to.equal(3);
      expect(params1.price).to.equal(11044);
      expect(params1.divisor).to.equal(10);
      let params2 = await riskManager.productRiskParams(product2.address);
      expect(params2.weight).to.equal(5);
      expect(params2.price).to.equal(22088);
      expect(params2.divisor).to.equal(20);
      expect(await riskManager.weightSum()).to.equal(8);
    });
    it("should be set with addProduct()", async function () {
      let tx = await riskManager.connect(governor).addProduct(product3.address, 21, 10000, 1);
      expect(tx).to.emit(riskManager, "ProductParamsSet").withArgs(product3.address, 21, 10000, 1);
      expect(await riskManager.numProducts()).to.equal(3);
      expect(await riskManager.product(3)).to.equal(product3.address);
      let params3 = await riskManager.productRiskParams(product3.address);
      expect(params3.weight).to.equal(21);
      expect(params3.price).to.equal(10000);
      expect(params3.divisor).to.equal(1);
      expect(await riskManager.weightSum()).to.equal(29);
    });
    it("should delete old products with setProductParams()", async function () {
      let tx = await riskManager.connect(governor).setProductParams([product2.address,product3.address], [7,3], [1,2], [3,4]);
      expect(tx).to.emit(riskManager, "ProductParamsSet").withArgs(product1.address, 0, 0, 0);
      expect(tx).to.emit(riskManager, "ProductParamsSet").withArgs(product2.address, 0, 0, 0);
      expect(tx).to.emit(riskManager, "ProductParamsSet").withArgs(product2.address, 7, 1, 3);
      expect(tx).to.emit(riskManager, "ProductParamsSet").withArgs(product3.address, 3, 2, 4);
      expect(await riskManager.numProducts()).to.equal(2);
      expect(await riskManager.product(1)).to.equal(product2.address);
      expect(await riskManager.product(2)).to.equal(product3.address);
      await expect(riskManager.productRiskParams(product1.address)).to.be.revertedWith("product inactive");
      let params2 = await riskManager.productRiskParams(product2.address);
      expect(params2.weight).to.equal(7);
      expect(params2.price).to.equal(1);
      expect(params2.divisor).to.equal(3);
      let params3 = await riskManager.productRiskParams(product3.address);
      expect(params3.weight).to.equal(3);
      expect(params3.price).to.equal(2);
      expect(params3.divisor).to.equal(4);
      expect(await riskManager.weightSum()).to.equal(10);
    });
    it("should change weight with addProduct()", async function () {
      let tx = await riskManager.connect(governor).addProduct(product3.address, 9, 5, 6);
      expect(tx).to.emit(riskManager, "ProductParamsSet").withArgs(product3.address, 9, 5, 6);
      expect(await riskManager.numProducts()).to.equal(2);
      expect(await riskManager.product(2)).to.equal(product3.address);
      expect(await riskManager.product(3)).to.equal(ZERO_ADDRESS);
      let params3 = await riskManager.productRiskParams(product3.address);
      expect(params3.weight).to.equal(9);
      expect(params3.price).to.equal(5);
      expect(params3.divisor).to.equal(6);
      expect(await riskManager.weightSum()).to.equal(16);
    });
    it("should remove products", async function () {
      // add product 1 / index 3
      await riskManager.connect(governor).addProduct(product1.address, 13, 1, 1);
      expect(await riskManager.product(3)).to.equal(product1.address);
      expect((await riskManager.productRiskParams(product1.address)).weight).to.equal(13);
      expect(await riskManager.weightSum()).to.equal(29);
      expect(await riskManager.numProducts()).to.equal(3);
      expect(await riskManager.product(1)).to.equal(product2.address);
      expect(await riskManager.product(2)).to.equal(product3.address);
      expect(await riskManager.product(3)).to.equal(product1.address);
      // remove product 2 / index 1
      let tx1 = await riskManager.connect(governor).removeProduct(product2.address);
      expect(tx1).to.emit(riskManager, "ProductParamsSet").withArgs(product2.address, 0, 0, 0);
      expect(await riskManager.product(1)).to.equal(product1.address);
      expect(await riskManager.product(2)).to.equal(product3.address);
      expect(await riskManager.product(3)).to.equal(ZERO_ADDRESS);
      expect((await riskManager.productRiskParams(product1.address)).weight).to.equal(13);
      await expect(riskManager.productRiskParams(product2.address)).to.be.revertedWith("product inactive");
      expect((await riskManager.productRiskParams(product3.address)).weight).to.equal(9);
      expect(await riskManager.weightSum()).to.equal(22);
      expect(await riskManager.numProducts()).to.equal(2);
      // remove product 3 / index 2
      let tx2 = await riskManager.connect(governor).removeProduct(product3.address);
      expect(tx2).to.emit(riskManager, "ProductParamsSet").withArgs(product3.address, 0, 0, 0);
      expect(await riskManager.product(1)).to.equal(product1.address);
      expect(await riskManager.product(2)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.product(3)).to.equal(ZERO_ADDRESS);
      expect((await riskManager.productRiskParams(product1.address)).weight).to.equal(13);
      await expect(riskManager.productRiskParams(product2.address)).to.be.revertedWith("product inactive");
      await expect(riskManager.productRiskParams(product3.address)).to.be.revertedWith("product inactive");
      expect(await riskManager.weightSum()).to.equal(13);
      expect(await riskManager.numProducts()).to.equal(1);
      await riskManager.connect(governor).removeProduct(product3.address); // remove non existent product
      // remove product 1 / index 1
      let tx3 = await riskManager.connect(governor).removeProduct(product1.address);
      expect(tx3).to.emit(riskManager, "ProductParamsSet").withArgs(product1.address, 0, 0, 0);
      expect(await riskManager.product(1)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.product(2)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.product(3)).to.equal(ZERO_ADDRESS);
      await expect(riskManager.productRiskParams(product1.address)).to.be.revertedWith("product inactive");
      await expect(riskManager.productRiskParams(product2.address)).to.be.revertedWith("product inactive");
      await expect(riskManager.productRiskParams(product3.address)).to.be.revertedWith("product inactive");
      expect(await riskManager.weightSum()).to.equal(NO_WEIGHT);
      expect(await riskManager.numProducts()).to.equal(0);
      await riskManager.connect(governor).removeProduct(product1.address); // remove non existent product
      // reset
      await riskManager.connect(governor).setProductParams([product2.address,product3.address], [7,9], [11044,22088], [10,20]);
    });
  });

  describe("max cover amount", function () {
    it("no assets no cover", async function () {
      expect(await vault.totalAssets()).to.equal(0);
      expect(await riskManager.maxCover()).to.equal(0);
      expect(await riskManager.maxCoverPerProduct(product2.address)).to.equal(0);
      expect(await riskManager.maxCoverPerPolicy(product2.address)).to.equal(0);
    });
    it("can cover", async function () {
      let depositAmount = BN.from("1000000000000000000");
      await vault.connect(user).depositEth({value:depositAmount});
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await riskManager.maxCover()).to.equal(depositAmount);
      expect(await riskManager.maxCoverPerProduct(product1.address)).to.equal(0);
      expect(await riskManager.maxCoverPerProduct(product2.address)).to.equal(depositAmount.mul(7).div(16));
      expect(await riskManager.maxCoverPerProduct(product3.address)).to.equal(depositAmount.mul(9).div(16));
      await expect(riskManager.maxCoverPerPolicy(product1.address)).be.revertedWith("product inactive");
      expect(await riskManager.maxCoverPerPolicy(product2.address)).to.equal(depositAmount.mul(7).div(16).div(10));
      expect(await riskManager.maxCoverPerPolicy(product3.address)).to.equal(depositAmount.mul(9).div(16).div(20));
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
      await riskManager.connect(governor).setPartialReservesFactor(5000);
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
      await policyManager.connect(product2).createPolicy(user.address, 1, 0, 0, ZERO_ADDRESS);
      expect(await riskManager.minCapitalRequirement()).to.equal(1);
      await policyManager.connect(product3).createPolicy(user.address, 2, 0, 0, ZERO_ADDRESS);
      expect(await riskManager.minCapitalRequirement()).to.equal(3);
      await policyManager.connect(product3).setPolicyInfo(2, 4, 0, 0, ZERO_ADDRESS);
      expect(await riskManager.minCapitalRequirement()).to.equal(5);
      await policyManager.connect(product2).burn(1);
      expect(await riskManager.minCapitalRequirement()).to.equal(4);
    });
    it("should leverage", async function () {
      await riskManager.connect(governor).setPartialReservesFactor(5000);
      expect(await riskManager.minCapitalRequirement()).to.equal(2);
      await policyManager.connect(product3).createPolicy(user.address, 9, 0, 0, ZERO_ADDRESS);
      expect(await riskManager.minCapitalRequirement()).to.equal(6);
      await riskManager.connect(governor).setPartialReservesFactor(7500);
      expect(await riskManager.minCapitalRequirement()).to.equal(9);
    });
  });

  describe("assess risk", function () {
    before(async function () {
      await riskManager.connect(governor).addProduct(product4.address, 1, 11044, 1);
    });
    it("cannot accept risk from unregistered products", async function () {
      let risk = await riskManager.assessRisk(product5.address, 0, 0);
      expect(risk.acceptable).to.equal(false);
      expect(risk.price).to.equal(MAX_PRICE);
    });
    it("can accept risk at max cover per product", async function () {
      // new policy
      let mc = await riskManager.maxCoverPerProduct(product4.address);
      let ac = await product4.activeCoverAmount();
      expect(mc).to.be.gt(ac);
      let diff = mc.sub(ac);
      let risk = await riskManager.assessRisk(product4.address, 0, diff);
      expect(risk.acceptable).to.equal(true);
      expect(risk.price).to.equal(11044);
      // update policy
      let risk2 = await riskManager.assessRisk(product4.address, ac, mc);
      expect(risk2.acceptable).to.equal(true);
      expect(risk2.price).to.equal(11044);
    });
    it("cannot accept risk over max cover per product", async function () {
      // new policy
      let mc = await riskManager.maxCoverPerProduct(product4.address);
      let ac = await product4.activeCoverAmount();
      expect(mc).to.be.gt(ac);
      let diff = mc.sub(ac);
      let risk = await riskManager.assessRisk(product4.address, 0, diff.add(1));
      expect(risk.acceptable).to.equal(false);
      expect(risk.price).to.equal(11044);
      // update policy
      let risk2 = await riskManager.assessRisk(product4.address, mc.sub(10), mc.add(1));
      expect(risk2.acceptable).to.equal(false);
      expect(risk2.price).to.equal(11044);
    });
    it("can accept risk at max cover per policy", async function () {
      // set divisor to 10
      await riskManager.connect(governor).addProduct(product4.address, 1, 11044, 10);
      // new policy
      let mc = await riskManager.maxCoverPerPolicy(product4.address);
      expect(mc).to.be.gt(10);
      let risk = await riskManager.assessRisk(product4.address, 0, mc);
      expect(risk.acceptable).to.equal(true);
      expect(risk.price).to.equal(11044);
      // update policy
      let risk2 = await riskManager.assessRisk(product4.address, mc.sub(10), mc);
      expect(risk2.acceptable).to.equal(true);
      expect(risk2.price).to.equal(11044);
    });
    it("cannot accept risk over max cover per policy", async function () {
      // new policy
      let mc = await riskManager.maxCoverPerPolicy(product4.address);
      expect(mc).to.be.gt(10);
      let risk = await riskManager.assessRisk(product4.address, 0, mc.add(1));
      expect(risk.acceptable).to.equal(false);
      expect(risk.price).to.equal(11044);
      // update policy
      let risk2 = await riskManager.assessRisk(product4.address, mc.sub(10), mc.add(1));
      expect(risk2.acceptable).to.equal(false);
      expect(risk2.price).to.equal(11044);
    });
  });

  describe("sellable cover per product", function () {
    it("should revert on non products", async function () {
      await expect(riskManager.sellableCoverPerProduct(ZERO_ADDRESS)).to.be.reverted;
      await expect(riskManager.sellableCoverPerProduct(deployer.address)).to.be.reverted;
    });
    it("should be zero for inactive products", async function () {
      expect(await riskManager.sellableCoverPerProduct(product5.address));
    });
    it("should return correct amount", async function () {
      let mc = await riskManager.maxCoverPerProduct(product4.address);
      let ac = await product4.activeCoverAmount();
      expect(mc).to.be.gt(ac);
      let diff = mc.sub(ac);
      let sc = await riskManager.sellableCoverPerProduct(product4.address);
      expect(sc).to.equal(diff);
      // TODO: test case where mc >= ac
    });
  });
});
