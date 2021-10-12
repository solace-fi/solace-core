import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Contract, ContractFactory, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Registry, Solace, Master, Vault, Treasury, ClaimsEscrow, Weth9, PolicyManager, RiskManager } from "../typechain";

describe("Registry", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, locker] = provider.getWallets();

  // contracts
  let registry: Registry;
  let weth: Weth9;
  let vault: Vault;
  let claimsEscrow: ClaimsEscrow;
  let treasury: Treasury;
  let policyManager: PolicyManager;
  let riskManager: RiskManager;
  let solace: Solace;
  let master: Master;
  // mock contracts
  // TODO: switch from mocks and wallets to actual contracts after implementation
  //let locker: Locker;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await registry.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(registry.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await registry.connect(governor).setGovernance(deployer.address);
      expect(tx).to.emit(registry, "GovernancePending").withArgs(deployer.address);
      expect(await registry.governance()).to.equal(governor.address);
      expect(await registry.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(registry.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    });
    it("can transfer governance", async function() {
      let tx = await registry.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(registry, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await registry.governance()).to.equal(deployer.address);
      expect(await registry.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await registry.connect(deployer).setGovernance(governor.address);
      await registry.connect(governor).acceptGovernance();
    });
  });

  describe("weth", function() {
    before(async function () {
      weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    });
    it("starts as the zero address", async function() {
      expect(await registry.weth()).to.equal(ZERO_ADDRESS);
    });
    it("can be set", async function() {
      let tx = await registry.connect(governor).setWeth(weth.address);
      expect(await registry.weth()).to.equal(weth.address);
      await expect(tx)
        .to.emit(registry, "WethSet")
        .withArgs(weth.address);
    });
    it("cannot be set by non governor", async function() {
      await expect(registry.connect(user).setWeth(weth.address)).to.be.revertedWith("!governance");
    });
  });

  describe("vault", function() {
    before(async function () {
      vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
    });
    it("starts as the zero address", async function() {
      expect(await registry.vault()).to.equal(ZERO_ADDRESS);
    });
    it("can be set", async function() {
      let tx = await registry.connect(governor).setVault(vault.address);
      expect(await registry.vault()).to.equal(vault.address);
      await expect(tx)
        .to.emit(registry, "VaultSet")
        .withArgs(vault.address);
    });
    it("cannot be set by non governor", async function() {
      await expect(registry.connect(user).setVault(vault.address)).to.be.revertedWith("!governance");
    });
  });

  describe("claimsEscrow", function() {
    before(async function () {
      claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, registry.address])) as ClaimsEscrow;
    });
    it("starts as the zero address", async function() {
      expect(await registry.claimsEscrow()).to.equal(ZERO_ADDRESS);
    });
    it("can be set", async function() {
      let tx = await registry.connect(governor).setClaimsEscrow(claimsEscrow.address);
      expect(await registry.claimsEscrow()).to.equal(claimsEscrow.address);
      await expect(tx)
        .to.emit(registry, "ClaimsEscrowSet")
        .withArgs(claimsEscrow.address);
    });
    it("cannot be set by non governor", async function() {
      await expect(registry.connect(user).setClaimsEscrow(claimsEscrow.address)).to.be.revertedWith("!governance");
    });
  });

  describe("treasury", function() {
    before(async function () {
      treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
    });
    it("starts as the zero address", async function() {
      expect(await registry.treasury()).to.equal(ZERO_ADDRESS);
    });
    it("can be set", async function() {
      let tx = await registry.connect(governor).setTreasury(treasury.address);
      expect(await registry.treasury()).to.equal(treasury.address);
      await expect(tx)
        .to.emit(registry, "TreasurySet")
        .withArgs(treasury.address);
    });
    it("cannot be set by non governor", async function() {
      await expect(registry.connect(user).setTreasury(treasury.address)).to.be.revertedWith("!governance");
    });
  });

  describe("policyManager", function() {
    before(async function () {
      policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
    });
    it("starts as the zero address", async function() {
      expect(await registry.policyManager()).to.equal(ZERO_ADDRESS);
    });
    it("can be set", async function() {
      let tx = await registry.connect(governor).setPolicyManager(policyManager.address);
      expect(await registry.policyManager()).to.equal(policyManager.address);
      await expect(tx)
        .to.emit(registry, "PolicyManagerSet")
        .withArgs(policyManager.address);
    });
    it("cannot be set by non governor", async function() {
      await expect(registry.connect(user).setPolicyManager(policyManager.address)).to.be.revertedWith("!governance");
    });
  });

  describe("riskManager", function () {
    before(async function () {
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
    });
    it("starts as the zero address", async function () {
      expect(await registry.riskManager()).to.equal(ZERO_ADDRESS);
    });
    it("can be set", async function () {
      let tx = await registry.connect(governor).setRiskManager(riskManager.address);
      expect(await registry.riskManager()).to.equal(riskManager.address);
      await expect(tx).to.emit(registry, "RiskManagerSet").withArgs(riskManager.address);
    });
    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setRiskManager(riskManager.address)).to.be.revertedWith("!governance");
    });
  });

  describe("solace", function() {
    before(async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    });
    it("starts as the zero address", async function() {
      expect(await registry.solace()).to.equal(ZERO_ADDRESS);
    });
    it("can be set", async function() {
      let tx = await registry.connect(governor).setSolace(solace.address);
      expect(await registry.solace()).to.equal(solace.address);
      await expect(tx)
        .to.emit(registry, "SolaceSet")
        .withArgs(solace.address);
    });
    it("cannot be set by non governor", async function() {
      await expect(registry.connect(user).setSolace(solace.address)).to.be.revertedWith("!governance");
    });
  });

  describe("master", function() {
    before(async function () {
      master = (await deployContract(deployer, artifacts.Master, [governor.address, solace.address, 1])) as Master;
    });
    it("starts as the zero address", async function() {
      expect(await registry.master()).to.equal(ZERO_ADDRESS);
    });
    it("can be set", async function() {
      let tx = await registry.connect(governor).setMaster(master.address);
      expect(await registry.master()).to.equal(master.address);
      await expect(tx)
        .to.emit(registry, "MasterSet")
        .withArgs(master.address);
    });
    it("cannot be set by non governor", async function() {
      await expect(registry.connect(user).setMaster(master.address)).to.be.revertedWith("!governance");
    });
  });

  describe("locker", function() {
    it("starts as the zero address", async function() {
      expect(await registry.locker()).to.equal(ZERO_ADDRESS);
    });
    it("can be set", async function() {
      let tx = await registry.connect(governor).setLocker(locker.address);
      expect(await registry.locker()).to.equal(locker.address);
      await expect(tx)
        .to.emit(registry, "LockerSet")
        .withArgs(locker.address);
    });
    it("cannot be set by non governor", async function() {
      await expect(registry.connect(user).setLocker(locker.address)).to.be.revertedWith("!governance");
    });
  });
});
