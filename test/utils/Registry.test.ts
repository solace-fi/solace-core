import { waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Contract, ContractFactory, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Registry, Weth9 } from "./../../typechain-types";

describe("Registry", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, mockContract1, mockContract2, mockContract3] = provider.getWallets();

  // contracts
  let registry: Registry;
  let weth: Weth9;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await registry.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(registry.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await registry.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(registry, "GovernancePending").withArgs(deployer.address);
      expect(await registry.governance()).to.equal(governor.address);
      expect(await registry.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(registry.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function() {
      let tx = await registry.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(registry, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await registry.governance()).to.equal(deployer.address);
      expect(await registry.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await registry.connect(deployer).setPendingGovernance(governor.address);
      await registry.connect(governor).acceptGovernance();
    });
  });

  describe("get before set", function () {
    it("has zero length", async function () {
      expect(await registry.length()).eq(0);
      await expect(registry.getKey(0)).to.be.revertedWith("index out of range");
      await expect(registry.getKey(1)).to.be.revertedWith("index out of range");
    });
    it("cannot get", async function () {
      await expect(registry.get("asdf")).to.be.revertedWith("key not in mapping");
    });
    it("can tryGet", async function () {
      let res = await registry.tryGet("asdf");
      expect(res.success).eq(false);
      expect(res.value).eq(ZERO_ADDRESS);
    });
  });

  describe("set", function () {
    it("cannot be set by non governance", async function () {
      await expect(registry.connect(user).set([],[])).to.be.revertedWith("!governance");
    });
    it("cannot length mismatch", async function () {
      await expect(registry.connect(governor).set(["asdf"],[])).to.be.revertedWith("length mismatch");
    });
    it("can set empty", async function () {
      await registry.connect(governor).set([],[]);
    });
    it("can set", async function () {
      // set
      let tx = await registry.connect(governor).set(["weth","contract1"],[weth.address,mockContract1.address]);
      await expect(tx).to.emit(registry, "RecordSet").withArgs("weth", weth.address);
      await expect(tx).to.emit(registry, "RecordSet").withArgs("contract1", mockContract1.address);
      // get
      expect(await registry.get("weth")).eq(weth.address);
      expect(await registry.get("contract1")).eq(mockContract1.address);
      let res1 = await registry.tryGet("weth");
      expect(res1.success).eq(true);
      expect(res1.value).eq(weth.address);
      let res2 = await registry.tryGet("contract1");
      expect(res2.success).eq(true);
      expect(res2.value).eq(mockContract1.address);
      // enumerate
      expect(await registry.length()).eq(2);
      await expect(registry.getKey(0)).to.be.revertedWith("index out of range");
      expect(await registry.getKey(1)).eq("weth");
      expect(await registry.getKey(2)).eq("contract1");
      await expect(registry.getKey(3)).to.be.revertedWith("index out of range");
    });
    it("can overwrite", async function () {
      // set
      let tx = await registry.connect(governor).set(["contract2","contract1"],[mockContract2.address,mockContract3.address]);
      await expect(tx).to.emit(registry, "RecordSet").withArgs("contract2", mockContract2.address);
      await expect(tx).to.emit(registry, "RecordSet").withArgs("contract1", mockContract3.address);
      // get
      expect(await registry.get("weth")).eq(weth.address);
      expect(await registry.get("contract1")).eq(mockContract3.address);
      expect(await registry.get("contract2")).eq(mockContract2.address);
      let res1 = await registry.tryGet("weth");
      expect(res1.success).eq(true);
      expect(res1.value).eq(weth.address);
      let res2 = await registry.tryGet("contract1");
      expect(res2.success).eq(true);
      expect(res2.value).eq(mockContract3.address);
      let res3 = await registry.tryGet("contract2");
      expect(res3.success).eq(true);
      expect(res3.value).eq(mockContract2.address);
      // enumerate
      expect(await registry.length()).eq(3);
      await expect(registry.getKey(0)).to.be.revertedWith("index out of range");
      expect(await registry.getKey(1)).eq("weth");
      expect(await registry.getKey(2)).eq("contract1");
      expect(await registry.getKey(3)).eq("contract2");
      await expect(registry.getKey(4)).to.be.revertedWith("index out of range");
    });
  });
});
