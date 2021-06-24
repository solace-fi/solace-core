import { waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager } from "../typechain";


describe("PolicyManager", function () {
  let artifacts: ArtifactImports;
  // users
  let deployer: Wallet;
  let governor: Wallet;
  let user: Wallet;

  // contracts
  let policyManager: PolicyManager;
  // mock contracts
  // TODO: switch from mocks and wallets to actual contracts after implementation
  let mockContract1: Wallet;
  let mockContract2: Wallet;
  let mockContract3: Wallet;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  before(async function () {
    [deployer, governor, user, mockContract1, mockContract2, mockContract3] = provider.getWallets();
    artifacts = await import_artifacts();

    // deploy policy manager
    policyManager = (await deployContract(
      deployer,
      artifacts.PolicyManager,
      [
        governor.address
      ]
    )) as PolicyManager;
  })

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await policyManager.governance()).to.equal(governor.address);
    })

    it("rejects setting new governance by non governor", async function () {
      await expect(policyManager.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    })

    it("can set new governance", async function () {
      await policyManager.connect(governor).setGovernance(deployer.address);
      expect(await policyManager.governance()).to.equal(governor.address);
      expect(await policyManager.newGovernance()).to.equal(deployer.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(policyManager.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    })

    it("can transfer governance", async function () {
      let tx = await policyManager.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(policyManager, "GovernanceTransferred").withArgs(deployer.address);
      expect(await policyManager.governance()).to.equal(deployer.address);
      expect(await policyManager.newGovernance()).to.equal(ZERO_ADDRESS);

      await policyManager.connect(deployer).setGovernance(governor.address);
      await policyManager.connect(governor).acceptGovernance();
    })
  })

  describe("products", function () {
    it("starts with no products", async function () {
      expect(await policyManager.numProducts()).to.equal(0);
    })

    it("can add products", async function () {
      let tx1 = await policyManager.connect(governor).addProduct(mockContract1.address);
      expect(await policyManager.numProducts()).to.equal(1);
      await expect(tx1).to.emit(policyManager, "ProductAdded").withArgs(mockContract1.address);
      let tx2 = await policyManager.connect(governor).addProduct(mockContract2.address);
      expect(await policyManager.numProducts()).to.equal(2);
      await expect(tx2).to.emit(policyManager, "ProductAdded").withArgs(mockContract2.address);
    })

    it("returns products", async function () {
      expect(await policyManager.numProducts()).to.equal(2);
      expect(await policyManager.getProduct(0)).to.equal(mockContract1.address);
      expect(await policyManager.getProduct(1)).to.equal(mockContract2.address);
      expect(await policyManager.productIsActive(mockContract1.address)).to.equal(true);
      expect(await policyManager.productIsActive(mockContract2.address)).to.equal(true);
      expect(await policyManager.productIsActive(mockContract3.address)).to.equal(false);
    })

    it("rejects adds and removes by non governor", async function () {
      await expect(policyManager.connect(user).addProduct(mockContract3.address)).to.be.revertedWith("!governance");
      await expect(policyManager.connect(user).removeProduct(mockContract1.address)).to.be.revertedWith("!governance");
    })

    it("can remove products", async function () {
      let tx1 = await policyManager.connect(governor).removeProduct(mockContract1.address);
      expect(await policyManager.numProducts()).to.equal(1);
      expect(await policyManager.productIsActive(mockContract1.address)).to.equal(false);
      await expect(tx1).to.emit(policyManager, "ProductRemoved").withArgs(mockContract1.address);
      expect(await policyManager.getProduct(0)).to.equal(mockContract2.address);
    })
  })
});
