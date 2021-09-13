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
import { RiskManager, Registry, Vault, Weth9, PolicyManager } from "../typechain";

describe("RiskManager", function () {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, product1, product2, product3] = provider.getWallets();

  // solace contracts
  let registry: Registry;
  let vault: Vault;
  let policyManager: PolicyManager;
  let riskManager: RiskManager;

  let weth: Weth9;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const NO_WEIGHT = BN.from("4294967295"); // max uint32

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

    await policyManager.connect(governor).addProduct(product1.address);
    await policyManager.connect(governor).addProduct(product2.address);
    await policyManager.connect(governor).addProduct(product3.address);
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

  describe("product weights", function () {
    it("should start zero", async function () {
      expect(await riskManager.numProducts()).to.equal(0);
      expect(await riskManager.product(0)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.weight(product1.address)).to.equal(0);
      expect(await riskManager.weightSum()).to.equal(NO_WEIGHT);
    });
    it("should reject change by non governor", async function () {
      await expect(riskManager.connect(user).addProduct(product1.address, 1)).to.be.revertedWith("!governance");
      await expect(riskManager.connect(user).setProductWeights([product1.address],[1])).to.be.revertedWith("!governance");
      await expect(riskManager.connect(user).removeProduct(product1.address)).to.be.revertedWith("!governance");
    });
    it("should reject invalid inputs", async function () {
      await expect(riskManager.connect(governor).addProduct(product1.address, 0)).to.be.revertedWith("no weight");
      await expect(riskManager.connect(governor).setProductWeights([product1.address],[1,2])).to.be.revertedWith("length mismatch");
      await expect(riskManager.connect(governor).setProductWeights([product1.address,product1.address],[1,2])).to.be.revertedWith("duplicate product");
      await expect(riskManager.connect(governor).setProductWeights([product1.address],[0])).to.be.revertedWith("no weight");
      await expect(riskManager.connect(governor).setProductWeights([product1.address],[BN.from(2).pow(32)])).to.be.reverted; // overflow
    });
    it("should be set with setProductWeights()", async function () {
      await riskManager.connect(governor).setProductWeights([],[]); // clear
      let tx = await riskManager.connect(governor).setProductWeights([product1.address,product2.address],[3,5]);
      expect(tx).to.emit(riskManager, "ProductWeightSet").withArgs(product1.address, 3);
      expect(tx).to.emit(riskManager, "ProductWeightSet").withArgs(product2.address, 5);
      expect(await riskManager.numProducts()).to.equal(2);
      expect(await riskManager.product(1)).to.equal(product1.address);
      expect(await riskManager.product(2)).to.equal(product2.address);
      expect(await riskManager.weight(product1.address)).to.equal(3);
      expect(await riskManager.weight(product2.address)).to.equal(5);
      expect(await riskManager.weightSum()).to.equal(8);
    });
    it("should be set with addProduct()", async function () {
      let tx = await riskManager.connect(governor).addProduct(product3.address, 21);
      expect(tx).to.emit(riskManager, "ProductWeightSet").withArgs(product3.address, 21);
      expect(await riskManager.numProducts()).to.equal(3);
      expect(await riskManager.product(3)).to.equal(product3.address);
      expect(await riskManager.weight(product3.address)).to.equal(21);
      expect(await riskManager.weightSum()).to.equal(29);
    });
    it("should delete old products with setProductWeights()", async function () {
      let tx = await riskManager.connect(governor).setProductWeights([product2.address,product3.address],[7,3]);
      expect(tx).to.emit(riskManager, "ProductWeightSet").withArgs(product1.address, 0);
      expect(tx).to.emit(riskManager, "ProductWeightSet").withArgs(product2.address, 0);
      expect(tx).to.emit(riskManager, "ProductWeightSet").withArgs(product2.address, 7);
      expect(tx).to.emit(riskManager, "ProductWeightSet").withArgs(product3.address, 3);
      expect(await riskManager.numProducts()).to.equal(2);
      expect(await riskManager.product(1)).to.equal(product2.address);
      expect(await riskManager.product(2)).to.equal(product3.address);
      expect(await riskManager.weight(product1.address)).to.equal(0);
      expect(await riskManager.weight(product2.address)).to.equal(7);
      expect(await riskManager.weight(product3.address)).to.equal(3);
      expect(await riskManager.weightSum()).to.equal(10);
    });
    it("should change weight with addProduct()", async function () {
      let tx = await riskManager.connect(governor).addProduct(product3.address, 9);
      expect(tx).to.emit(riskManager, "ProductWeightSet").withArgs(product3.address, 9);
      expect(await riskManager.numProducts()).to.equal(2);
      expect(await riskManager.product(2)).to.equal(product3.address);
      expect(await riskManager.product(3)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.weight(product3.address)).to.equal(9);
      expect(await riskManager.weightSum()).to.equal(16);
    });
    it("should remove products", async function () {
      await riskManager.connect(governor).addProduct(product1.address, 13);
      expect(await riskManager.product(3)).to.equal(product1.address);
      expect(await riskManager.weight(product1.address)).to.equal(13);
      expect(await riskManager.weightSum()).to.equal(29);
      expect(await riskManager.numProducts()).to.equal(3);
      expect(await riskManager.product(1)).to.equal(product2.address);
      expect(await riskManager.product(2)).to.equal(product3.address);
      expect(await riskManager.product(3)).to.equal(product1.address);
      // remove product2 / index1
      let tx1 = await riskManager.connect(governor).removeProduct(product2.address);
      expect(tx1).to.emit(riskManager, "ProductWeightSet").withArgs(product2.address, 0);
      expect(await riskManager.product(1)).to.equal(product1.address);
      expect(await riskManager.product(2)).to.equal(product3.address);
      expect(await riskManager.product(3)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.weight(product1.address)).to.equal(13);
      expect(await riskManager.weight(product2.address)).to.equal(0);
      expect(await riskManager.weight(product3.address)).to.equal(9);
      expect(await riskManager.weightSum()).to.equal(22);
      expect(await riskManager.numProducts()).to.equal(2);
      // remove product3 / index2
      let tx2 = await riskManager.connect(governor).removeProduct(product3.address);
      expect(tx2).to.emit(riskManager, "ProductWeightSet").withArgs(product3.address, 0);
      expect(await riskManager.product(1)).to.equal(product1.address);
      expect(await riskManager.product(2)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.product(3)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.weight(product1.address)).to.equal(13);
      expect(await riskManager.weight(product2.address)).to.equal(0);
      expect(await riskManager.weight(product3.address)).to.equal(0);
      expect(await riskManager.weightSum()).to.equal(13);
      expect(await riskManager.numProducts()).to.equal(1);
      await riskManager.connect(governor).removeProduct(product3.address); // remove non existent product
      // remove product1 / index1
      let tx3 = await riskManager.connect(governor).removeProduct(product1.address);
      expect(tx3).to.emit(riskManager, "ProductWeightSet").withArgs(product1.address, 0);
      expect(await riskManager.product(1)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.product(2)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.product(3)).to.equal(ZERO_ADDRESS);
      expect(await riskManager.weight(product1.address)).to.equal(0);
      expect(await riskManager.weight(product2.address)).to.equal(0);
      expect(await riskManager.weight(product3.address)).to.equal(0);
      expect(await riskManager.weightSum()).to.equal(NO_WEIGHT);
      expect(await riskManager.numProducts()).to.equal(0);
      await riskManager.connect(governor).removeProduct(product1.address); // remove non existent product
      // reset
      await riskManager.connect(governor).setProductWeights([product2.address,product3.address],[7,9]);
    });
  });

  describe("max cover amount", function () {
    it("no assets no cover", async function () {
      expect(await vault.totalAssets()).to.equal(0);
      expect(await riskManager.maxCoverAmount(product1.address)).to.equal(0);
      expect(await riskManager.maxCoverAmount(product2.address)).to.equal(0);
      expect(await riskManager.maxCoverAmount(product3.address)).to.equal(0);
    });
    it("can cover", async function () {
      let depositAmount = BN.from("1000000000000000000");
      await vault.connect(user).depositEth({value:depositAmount});
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await riskManager.maxCoverAmount(product1.address)).to.equal(0);
      expect(await riskManager.maxCoverAmount(product2.address)).to.equal(depositAmount.mul(7).div(16));
      expect(await riskManager.maxCoverAmount(product3.address)).to.equal(depositAmount.mul(9).div(16));
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
      await riskManager.connect(governor).setPartialReservesFactor(5000);
      expect(await riskManager.partialReservesFactor()).to.equal(5000);
      await riskManager.connect(governor).setPartialReservesFactor(10000);
    });
  });

  describe("minCapitalRequirement", function () {
    it("should start at zero", async function () {
      expect(await riskManager.minCapitalRequirement()).to.equal(0);
    });
    it("should track policy cover amount", async function () {
      await policyManager.connect(product2).createPolicy(user.address, ZERO_ADDRESS, 1, 0, 0);
      expect(await riskManager.minCapitalRequirement()).to.equal(1);
      await policyManager.connect(product3).createPolicy(user.address, ZERO_ADDRESS, 2, 0, 0);
      expect(await riskManager.minCapitalRequirement()).to.equal(3);
      await policyManager.connect(product3).setPolicyInfo(2, user.address, ZERO_ADDRESS, 4, 0, 0);
      expect(await riskManager.minCapitalRequirement()).to.equal(5);
      await policyManager.connect(product2).burn(1);
      expect(await riskManager.minCapitalRequirement()).to.equal(4);
    });
    it("should leverage", async function () {
      await riskManager.connect(governor).setPartialReservesFactor(5000);
      expect(await riskManager.minCapitalRequirement()).to.equal(2);
      await policyManager.connect(product3).createPolicy(user.address, ZERO_ADDRESS, 9, 0, 0);
      expect(await riskManager.minCapitalRequirement()).to.equal(6);
      await riskManager.connect(governor).setPartialReservesFactor(7500);
      expect(await riskManager.minCapitalRequirement()).to.equal(9);
    });
  });
});
