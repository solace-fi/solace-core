import { waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Registry, Solace, Master, Vault, Treasury, ClaimsEscrow, Weth9, PolicyManager } from "../typechain";


describe("Registry", function () {
  let artifacts: ArtifactImports;
  // users
  let deployer: Wallet;
  let governor: Wallet;
  let user: Wallet;

  // contracts
  let registry: Registry;
  let solaceToken: Solace;
  let master: Master;
  let vault: Vault;
  let treasury: Treasury;
  let claimsEscrow: ClaimsEscrow;
  let policyManager: PolicyManager;
  let weth: Weth9;
  // mock contracts
  // TODO: switch from mocks and wallets to actual contracts after implementation
  let locker: Wallet;
  let mockContract1: Wallet;
  let mockContract2: Wallet;
  let mockContract3: Wallet;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  before(async function () {
    [deployer, governor, user, locker, mockContract1, mockContract2, mockContract3] = provider.getWallets();
    artifacts = await import_artifacts();

    weth = (await deployContract(
      deployer,
      artifacts.WETH
    )) as Weth9;

    // deploy registry contract
    registry = (await deployContract(
      deployer,
      artifacts.Registry,
      [
        governor.address
      ]
    )) as Registry;

    // deploy solace token
    solaceToken = (await deployContract(
      deployer,
      artifacts.SOLACE,
      [
        governor.address
      ]
    )) as Solace;

    // deploy master contract
    master = (await deployContract(
      deployer,
      artifacts.Master,
      [
        governor.address,
        solaceToken.address,
        1
      ]
    )) as Master;

    // deploy claims escrow contract
    claimsEscrow = (await deployContract(
      deployer,
      artifacts.ClaimsEscrow,
      [governor.address, registry.address]
    )) as ClaimsEscrow;

    // deploy claims escrow contract

    // deploy vault contract
    vault = (await deployContract(
      deployer,
      artifacts.Vault,
      [governor.address, registry.address, weth.address]
    )) as Vault;

    // deploy treasury contract
    treasury = (await deployContract(
      deployer,
      artifacts.Treasury,
      [
        governor.address,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS
      ]
    )) as Treasury;

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
      expect(await registry.governance()).to.equal(governor.address);
    })

    it("rejects setting new governance by non governor", async function () {
      await expect(registry.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    })

    it("can set new governance", async function () {
      await registry.connect(governor).setGovernance(deployer.address);
      expect(await registry.governance()).to.equal(governor.address);
      expect(await registry.newGovernance()).to.equal(deployer.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(registry.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    })

    it("can transfer governance", async function () {
      let tx = await registry.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(registry, "GovernanceTransferred").withArgs(deployer.address);
      expect(await registry.governance()).to.equal(deployer.address);
      expect(await registry.newGovernance()).to.equal(ZERO_ADDRESS);

      await registry.connect(deployer).setGovernance(governor.address);
      await registry.connect(governor).acceptGovernance();
    })
  })

  describe("solace token", function () {
    it("starts as the zero address", async function () {
      expect(await registry.solace()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      let tx = await registry.connect(governor).setSolace(solaceToken.address);
      expect(await registry.solace()).to.equal(solaceToken.address);
      await expect(tx).to.emit(registry, "SolaceSet").withArgs(solaceToken.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setSolace(solaceToken.address)).to.be.revertedWith("!governance");
    })
  })

  describe("master", function () {
    it("starts as the zero address", async function () {
      expect(await registry.master()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      let tx = await registry.connect(governor).setMaster(master.address);
      expect(await registry.master()).to.equal(master.address);
      await expect(tx).to.emit(registry, "MasterSet").withArgs(master.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setMaster(master.address)).to.be.revertedWith("!governance");
    })
  })

  describe("vault", function () {
    it("starts as the zero address", async function () {
      expect(await registry.vault()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      let tx = await registry.connect(governor).setVault(vault.address);
      expect(await registry.vault()).to.equal(vault.address);
      await expect(tx).to.emit(registry, "VaultSet").withArgs(vault.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setVault(vault.address)).to.be.revertedWith("!governance");
    })
  })

  describe("treasury", function () {
    it("starts as the zero address", async function () {
      expect(await registry.treasury()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      let tx = await registry.connect(governor).setTreasury(treasury.address);
      expect(await registry.treasury()).to.equal(treasury.address);
      await expect(tx).to.emit(registry, "TreasurySet").withArgs(treasury.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setTreasury(treasury.address)).to.be.revertedWith("!governance");
    })
  })

  describe("locker", function () {
    it("starts as the zero address", async function () {
      expect(await registry.locker()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      let tx = await registry.connect(governor).setLocker(locker.address);
      expect(await registry.locker()).to.equal(locker.address);
      await expect(tx).to.emit(registry, "LockerSet").withArgs(locker.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setLocker(locker.address)).to.be.revertedWith("!governance");
    })
  })

  describe("claimsEscrow", function () {
    it("starts as the zero address", async function () {
      expect(await registry.claimsEscrow()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      let tx = await registry.connect(governor).setClaimsEscrow(claimsEscrow.address);
      expect(await registry.claimsEscrow()).to.equal(claimsEscrow.address);
      await expect(tx).to.emit(registry, "ClaimsEscrowSet").withArgs(claimsEscrow.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setClaimsEscrow(claimsEscrow.address)).to.be.revertedWith("!governance");
    })
  })

  describe("policyManager", function () {
    it("starts as the zero address", async function () {
      expect(await registry.policyManager()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      let tx = await registry.connect(governor).setPolicyManager(policyManager.address);
      expect(await registry.policyManager()).to.equal(policyManager.address);
      await expect(tx).to.emit(registry, "PolicyManagerSet").withArgs(policyManager.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setPolicyManager(policyManager.address)).to.be.revertedWith("!governance");
    })
  })
});
