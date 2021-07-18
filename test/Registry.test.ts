import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Contract, ContractFactory, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Registry, Solace, Master, Vault, Treasury, ClaimsEscrow, Weth9, PolicyManager } from "../typechain";

describe("Registry", function() {
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

  before(async function() {
    [deployer, governor, user, locker, mockContract1, mockContract2, mockContract3] = provider.getWallets();
    artifacts = await import_artifacts();

    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;

    let registryContract = await ethers.getContractFactory("Registry");
    registry = (await upgrades.deployProxy(registryContract, [governor.address], { kind: "uups" })) as Registry;

    // deploy solace token
    solaceToken = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;

    // deploy master contract
    master = (await deployContract(deployer, artifacts.Master, [governor.address, solaceToken.address, 1])) as Master;

    // deploy claims escrow contract
    claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, registry.address])) as ClaimsEscrow;

    // deploy claims escrow contract

    // deploy vault contract
    vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address, weth.address])) as Vault;

    // deploy treasury contract
    treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS])) as Treasury;

    // deploy policy manager
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
  });

  describe("after upgrade registry", function() {
    let mockRegistryContract: ContractFactory;
    let mockRegistry: Contract;

    before(async function() {
      mockRegistryContract = await ethers.getContractFactory("MockRegistry");
      mockRegistry = await upgrades.upgradeProxy(registry.address, mockRegistryContract);
      await mockRegistry.deployed();
    });

    after(async function() {
      let registryContract = await ethers.getContractFactory("Registry");
      registry = (await upgrades.deployProxy(registryContract, [governor.address], { kind: "uups" })) as Registry;
    });

    it("starts with the correct admin", async function() {
      expect(await registry.admin()).to.equal(deployer.address);
    });

    it("starts with the correct governor", async function() {
      expect(await registry.governance()).to.equal(governor.address);
    });

    it("rejects calling an admin ops for non admin", async function() {
      await expect(registry.connect(user).upgradeTo(mockRegistry.address)).to.be.revertedWith("!admin");
    });

    it("can read data from new variable", async function() {
      expect(await mockRegistry.connect(user).version()).to.equal("V2");
      expect(await mockRegistry.connect(user).getName()).to.equal("");
    });

    it("can set data to new variable", async function() {
      await mockRegistry.connect(user).setName("MockRegistryV2");
      expect(await mockRegistry.connect(user).getName()).to.equal("MockRegistryV2");
    });

    it("governance: rejects setting new governance by non governor", async function() {
      await expect(mockRegistry.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    });

    it("governance: can set new governance", async function() {
      await mockRegistry.connect(governor).setGovernance(deployer.address);
      expect(await mockRegistry.governance()).to.equal(governor.address);
      expect(await mockRegistry.newGovernance()).to.equal(deployer.address);
    });

    it("governance: rejects governance transfer by non governor", async function() {
      await expect(mockRegistry.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    });

    it("governance: can transfer governance", async function() {
      let tx = await mockRegistry.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(mockRegistry, "GovernanceTransferred")
        .withArgs(deployer.address);
      expect(await mockRegistry.governance()).to.equal(deployer.address);
      expect(await mockRegistry.newGovernance()).to.equal(ZERO_ADDRESS);

      await mockRegistry.connect(deployer).setGovernance(governor.address);
      await mockRegistry.connect(governor).acceptGovernance();
    });

    it("solace token: starts as the zero address", async function() {
      expect(await mockRegistry.solace()).to.equal(ZERO_ADDRESS);
    });

    it("solace token: can be set", async function() {
      let tx = await mockRegistry.connect(governor).setSolace(solaceToken.address);
      expect(await mockRegistry.solace()).to.equal(solaceToken.address);
      await expect(tx)
        .to.emit(mockRegistry, "SolaceSet")
        .withArgs(solaceToken.address);
    });

    it("solace token: cannot be set by non governor", async function() {
      await expect(mockRegistry.connect(user).setSolace(solaceToken.address)).to.be.revertedWith("!governance");
    });

    it("master: starts as the zero address", async function() {
      expect(await mockRegistry.master()).to.equal(ZERO_ADDRESS);
    });

    it("master: can be set", async function() {
      let tx = await mockRegistry.connect(governor).setMaster(master.address);
      expect(await mockRegistry.master()).to.equal(master.address);
      await expect(tx)
        .to.emit(mockRegistry, "MasterSet")
        .withArgs(master.address);
    });

    it("master: cannot be set by non governor", async function() {
      await expect(mockRegistry.connect(user).setMaster(master.address)).to.be.revertedWith("!governance");
    });

    it("vault: starts as the zero address", async function() {
      expect(await registry.vault()).to.equal(ZERO_ADDRESS);
    });

    it("vault: can be set", async function() {
      let tx = await mockRegistry.connect(governor).setVault(vault.address);
      expect(await mockRegistry.vault()).to.equal(vault.address);
      await expect(tx)
        .to.emit(mockRegistry, "VaultSet")
        .withArgs(vault.address);
    });

    it("vault: cannot be set by non governor", async function() {
      await expect(mockRegistry.connect(user).setVault(vault.address)).to.be.revertedWith("!governance");
    });

    it("treasury: starts as the zero address", async function() {
      expect(await registry.treasury()).to.equal(ZERO_ADDRESS);
    });

    it("treasury: can be set", async function() {
      let tx = await mockRegistry.connect(governor).setTreasury(treasury.address);
      expect(await mockRegistry.treasury()).to.equal(treasury.address);
      await expect(tx)
        .to.emit(mockRegistry, "TreasurySet")
        .withArgs(treasury.address);
    });

    it("treasury: cannot be set by non governor", async function() {
      await expect(mockRegistry.connect(user).setTreasury(mockRegistry.address)).to.be.revertedWith("!governance");
    });

    it("locker: starts as the zero address", async function() {
      expect(await mockRegistry.locker()).to.equal(ZERO_ADDRESS);
    });

    it("locker: can be set", async function() {
      let tx = await mockRegistry.connect(governor).setLocker(locker.address);
      expect(await mockRegistry.locker()).to.equal(locker.address);
      await expect(tx)
        .to.emit(mockRegistry, "LockerSet")
        .withArgs(locker.address);
    });

    it("locker: cannot be set by non governor", async function() {
      await expect(mockRegistry.connect(user).setLocker(locker.address)).to.be.revertedWith("!governance");
    });

    it("claimsEscrow: starts as the zero address", async function() {
      expect(await mockRegistry.claimsEscrow()).to.equal(ZERO_ADDRESS);
    });

    it("claimsEscrow: can be set", async function() {
      let tx = await mockRegistry.connect(governor).setClaimsEscrow(claimsEscrow.address);
      expect(await mockRegistry.claimsEscrow()).to.equal(claimsEscrow.address);
      await expect(tx)
        .to.emit(mockRegistry, "ClaimsEscrowSet")
        .withArgs(claimsEscrow.address);
    });

    it("claimsEscrow: cannot be set by non governor", async function() {
      await expect(mockRegistry.connect(user).setClaimsEscrow(claimsEscrow.address)).to.be.revertedWith("!governance");
    });

    it("policyManager: starts as the zero address", async function() {
      expect(await mockRegistry.policyManager()).to.equal(ZERO_ADDRESS);
    });

    it("policyManager: can be set", async function() {
      let tx = await mockRegistry.connect(governor).setPolicyManager(policyManager.address);
      expect(await mockRegistry.policyManager()).to.equal(policyManager.address);
      await expect(tx)
        .to.emit(mockRegistry, "PolicyManagerSet")
        .withArgs(policyManager.address);
    });

    it("policyManager: cannot be set by non governor", async function() {
      await expect(mockRegistry.connect(user).setPolicyManager(policyManager.address)).to.be.revertedWith("!governance");
    });
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await registry.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function() {
      await expect(registry.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function() {
      await registry.connect(governor).setGovernance(deployer.address);
      expect(await registry.governance()).to.equal(governor.address);
      expect(await registry.newGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async function() {
      await expect(registry.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    });

    it("can transfer governance", async function() {
      let tx = await registry.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(registry, "GovernanceTransferred")
        .withArgs(deployer.address);
      expect(await registry.governance()).to.equal(deployer.address);
      expect(await registry.newGovernance()).to.equal(ZERO_ADDRESS);

      await registry.connect(deployer).setGovernance(governor.address);
      await registry.connect(governor).acceptGovernance();
    });
  });

  describe("solace token", function() {
    it("starts as the zero address", async function() {
      expect(await registry.solace()).to.equal(ZERO_ADDRESS);
    });

    it("can be set", async function() {
      let tx = await registry.connect(governor).setSolace(solaceToken.address);
      expect(await registry.solace()).to.equal(solaceToken.address);
      await expect(tx)
        .to.emit(registry, "SolaceSet")
        .withArgs(solaceToken.address);
    });

    it("cannot be set by non governor", async function() {
      await expect(registry.connect(user).setSolace(solaceToken.address)).to.be.revertedWith("!governance");
    });
  });

  describe("master", function() {
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

  describe("vault", function() {
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

  describe("treasury", function() {
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

  describe("claimsEscrow", function() {
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

  describe("policyManager", function() {
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
});
