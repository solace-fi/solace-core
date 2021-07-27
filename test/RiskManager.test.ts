import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { RiskManager, Registry, Vault, Weth9 } from "../typechain";

describe("RiskManager", function () {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, product1, product2, product3] = provider.getWallets();

  // solace contracts
  let registry: Registry;
  let vault: Vault;
  let riskManager: RiskManager;

  let weth: Weth9;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  before(async function () {
    artifacts = await import_artifacts();

    // deploy registry contract
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;

    // deploy weth
    weth = (await deployContract(deployer,artifacts.WETH)) as Weth9;

    // deploy vault
    vault = (await deployContract(deployer,artifacts.Vault,[deployer.address,registry.address,weth.address])) as Vault;

    // deploy risk manager contract
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;

    await registry.connect(governor).setVault(vault.address);
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
      expect(await riskManager.weights(product1.address)).to.equal(0);
    });
    it("should reject change by non governor", async function () {
      await expect(riskManager.connect(user).setProductWeights([product1.address],[1])).to.be.revertedWith("!governance");
    });
    it("should reject invalid inputs", async function () {
      await expect(riskManager.connect(governor).setProductWeights([product1.address],[1,2])).to.be.revertedWith("length mismatch");
      await expect(riskManager.connect(governor).setProductWeights([product1.address,product1.address],[1,2])).to.be.revertedWith("duplicate product");
      await expect(riskManager.connect(governor).setProductWeights([],[])).to.be.revertedWith("1/0");
      await expect(riskManager.connect(governor).setProductWeights([product1.address],[0])).to.be.revertedWith("1/0");
      await expect(riskManager.connect(governor).setProductWeights([product1.address],[BN.from(2).pow(32)])).to.be.reverted; // overflow
    });
    it("should be set", async function () {
      await riskManager.connect(governor).setProductWeights([product1.address,product2.address],[3,5]);
      expect(await riskManager.weights(product1.address)).to.equal(3);
      expect(await riskManager.weights(product2.address)).to.equal(5);
      expect(await riskManager.weightSum()).to.equal(8);
    });
    it("should delete old products", async function () {
      await riskManager.connect(governor).setProductWeights([product2.address,product3.address],[7,9]);
      expect(await riskManager.weights(product1.address)).to.equal(0);
      expect(await riskManager.weights(product2.address)).to.equal(7);
      expect(await riskManager.weights(product3.address)).to.equal(9);
      expect(await riskManager.weightSum()).to.equal(16);
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
      await user.sendTransaction({to:vault.address,value:depositAmount});
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await riskManager.maxCoverAmount(product1.address)).to.equal(0);
      expect(await riskManager.maxCoverAmount(product2.address)).to.equal(depositAmount.mul(7).div(16));
      expect(await riskManager.maxCoverAmount(product3.address)).to.equal(depositAmount.mul(9).div(16));
    });
    //it("", async function () {});
  });
});
