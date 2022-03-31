import hardhat from "hardhat";
import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { CoverageDataProvider} from "../../typechain";
import { emit } from "process";

describe("CoverageDataProvider", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, user] = provider.getWallets();
  let coverageDataProvider: CoverageDataProvider;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_MILLION_USD = BN.from("1000000000000000000000000"); // 1M USD(DAI)
  const UWP_POOL_NAMES = {
    "MAINNET_1": "mainnet_1",
    "AUORA_1": "auora_1",
    "MATIC_1": "matic_1",
    "MAINNET_2": "mainnet_2",
    "AUORA_2": "auroa_2",
    "MATIC_2": "matic_2"
  }

  let snapshot: BN;

  before(async function() {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function() {
    it("should revert if governance is zero address", async function () {
      await expect(deployContract(deployer, artifacts.CoverageDataProvider, [ZERO_ADDRESS])).to.be.revertedWith("zero address governance");
    });

    it("should deploy", async function () {
      coverageDataProvider = await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address]) as CoverageDataProvider;
      expect(await coverageDataProvider.governance()).to.equal(governor.address);
    });

    it("should deploy with initial values", async function() {
      expect(await coverageDataProvider.connect(governor).maxCover()).to.be.equal(0);
      expect(await coverageDataProvider.connect(governor).numOfPools()).to.be.equal(0);
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await coverageDataProvider.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function () {
      await expect(coverageDataProvider.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function () {
      let tx = await coverageDataProvider.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(coverageDataProvider, "GovernancePending").withArgs(deployer.address);
      expect(await coverageDataProvider.governance()).to.equal(governor.address);
      expect(await coverageDataProvider.pendingGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async function () {
      await expect(coverageDataProvider.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async function () {
      let tx = await coverageDataProvider.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(coverageDataProvider, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await coverageDataProvider.governance()).to.equal(deployer.address);
      expect(await coverageDataProvider.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await coverageDataProvider.connect(deployer).setPendingGovernance(governor.address);
      await coverageDataProvider.connect(governor).acceptGovernance();
    });
  });

  describe("set", function() {
    before(async function() {
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(0);
    });

    it("should revert for non-governance", async function() {
      await expect(coverageDataProvider.connect(user).set(UWP_POOL_NAMES.MAINNET_1, ONE_MILLION_USD)).to.be.revertedWith("!governance");
    });

    it("should revert for empty underwriting pool name", async function() {
      await expect(coverageDataProvider.connect(governor).set("", ONE_MILLION_USD)).to.be.revertedWith("empty underwriting pool name");
    });

    it("should set", async function() {
      let tx = await coverageDataProvider.connect(governor).set(UWP_POOL_NAMES.MAINNET_1, 1);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.MAINNET_1, 1);
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(1);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(1);
      expect(await coverageDataProvider.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.MAINNET_1);
      expect(await coverageDataProvider.connect(user).maxCover()).to.be.equal(1);
    });

    it("should set same", async function() {
      let tx = await coverageDataProvider.connect(governor).set(UWP_POOL_NAMES.MAINNET_1, ONE_MILLION_USD);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.MAINNET_1, ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(1);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.MAINNET_1);
      expect(await coverageDataProvider.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD);
    });

    it("should set another", async function() {
      let tx = await coverageDataProvider.connect(governor).set(UWP_POOL_NAMES.AUORA_1, ONE_MILLION_USD);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.AUORA_1, ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(2);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.MAINNET_1);

      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).poolOf(2)).to.be.equal(UWP_POOL_NAMES.AUORA_1);
      expect(await coverageDataProvider.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD.mul(2));
    });
  });

  describe("remove", function() {
    before(async function() {
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(2);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD.mul(2));
    });

    it("should revert for non-governance", async function() {
      await expect(coverageDataProvider.connect(user).remove(UWP_POOL_NAMES.AUORA_1)).to.be.revertedWith("!governance");
    });

    it("should return for non-exists underwriting pool", async function() {
      await coverageDataProvider.connect(governor).remove(UWP_POOL_NAMES.MATIC_1);
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(2);
    });

    it("should remove", async function() {
      let tx = await coverageDataProvider.connect(governor).remove(UWP_POOL_NAMES.MAINNET_1);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolRemoved").withArgs(UWP_POOL_NAMES.MAINNET_1);
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(1);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(0);

      expect(await coverageDataProvider.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.AUORA_1);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD);
    });

    it("should remove another", async function() {
      let tx = await coverageDataProvider.connect(governor).remove(UWP_POOL_NAMES.AUORA_1);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolRemoved").withArgs(UWP_POOL_NAMES.AUORA_1);
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(0);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(0);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(0);
      expect(await coverageDataProvider.connect(user).maxCover()).to.be.equal(0);
      expect(await coverageDataProvider.connect(user).poolOf(1)).to.be.equal("");
      expect(await coverageDataProvider.connect(user).poolOf(2)).to.be.equal("");

    });

    it("can remove pool from list of no pools", async function () {
      let coverageDataProvider2 = await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address]) as CoverageDataProvider;
      await coverageDataProvider2.connect(governor).remove("");
    });
  });

  describe("reset", function() {
    const RESET_POOLS = [UWP_POOL_NAMES.MAINNET_2, UWP_POOL_NAMES.AUORA_2, UWP_POOL_NAMES.MATIC_2];
    const RESET_AMOUNTS = [ONE_MILLION_USD.div(2), ONE_MILLION_USD.div(2), ONE_MILLION_USD.div(2)];

    before(async function() {
      await coverageDataProvider.connect(governor).set(UWP_POOL_NAMES.MAINNET_1, ONE_MILLION_USD);
      await coverageDataProvider.connect(governor).set(UWP_POOL_NAMES.AUORA_1, ONE_MILLION_USD);
      await coverageDataProvider.connect(governor).set(UWP_POOL_NAMES.MATIC_1, ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MATIC_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProvider.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD.mul(3));
      expect(await coverageDataProvider.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.MAINNET_1);
      expect(await coverageDataProvider.connect(user).poolOf(2)).to.be.equal(UWP_POOL_NAMES.AUORA_1);
      expect(await coverageDataProvider.connect(user).poolOf(3)).to.be.equal(UWP_POOL_NAMES.MATIC_1);
    });

    it("should revert for non-governance", async function() {
      await expect(coverageDataProvider.connect(user).reset(RESET_POOLS, RESET_AMOUNTS)).to.be.revertedWith("!governance");
    });

    it("should revert for invalid underwriting pool length", async function() {
      await expect(coverageDataProvider.connect(governor).reset([UWP_POOL_NAMES.MAINNET_2], RESET_AMOUNTS)).to.be.revertedWith("length mismatch");
    });

    it("should revert for invalid underwriting pool amount length", async function() {
      await expect(coverageDataProvider.connect(governor).reset(RESET_POOLS, [ONE_MILLION_USD])).to.be.revertedWith("length mismatch");
    });

    it("should revert for empty underwriting pool name", async function() {
      await expect(coverageDataProvider.connect(governor).reset([UWP_POOL_NAMES.MAINNET_2, "", UWP_POOL_NAMES.MATIC_2], RESET_AMOUNTS)).to.be.revertedWith("empty underwriting pool name");
    });

    it("should reset", async function() {
      let tx = await coverageDataProvider.connect(governor).reset(RESET_POOLS, RESET_AMOUNTS);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolRemoved").withArgs(UWP_POOL_NAMES.MAINNET_1);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolRemoved").withArgs(UWP_POOL_NAMES.AUORA_1);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolRemoved").withArgs(UWP_POOL_NAMES.MATIC_1);

      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.MAINNET_2, RESET_AMOUNTS[0]);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.AUORA_2, RESET_AMOUNTS[1]);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.MATIC_2, RESET_AMOUNTS[2]);

      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(0);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(0);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MATIC_1)).to.be.equal(0);

      expect(await coverageDataProvider.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.MAINNET_2);
      expect(await coverageDataProvider.connect(user).poolOf(2)).to.be.equal(UWP_POOL_NAMES.AUORA_2);
      expect(await coverageDataProvider.connect(user).poolOf(3)).to.be.equal(UWP_POOL_NAMES.MATIC_2);

      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_2)).to.be.equal(RESET_AMOUNTS[0]);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_2)).to.be.equal(RESET_AMOUNTS[1]);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MATIC_2)).to.be.equal(RESET_AMOUNTS[2]);

      expect(await coverageDataProvider.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD.mul(3).div(2));
    });
  });

  describe("uwp updater", async function () {
    it("starts unset", async function () {
      expect(await coverageDataProvider.getUwpUpdater()).eq(ZERO_ADDRESS);
    });
    it("cannot be set by non governance", async function () {
      await expect(coverageDataProvider.connect(user).setUwpUpdater(user.address)).to.be.revertedWith("!governance");
    });
    it("cannot be set to zero address", async function () {
      await expect(coverageDataProvider.connect(governor).setUwpUpdater(ZERO_ADDRESS)).to.be.revertedWith("zero address uwp updater");
    });
    it("can be set by governance", async function () {
      let tx = await coverageDataProvider.connect(governor).setUwpUpdater(deployer.address);
      await expect(tx).to.emit(coverageDataProvider, "UwpUpdaterSet").withArgs(deployer.address);
      expect(await coverageDataProvider.getUwpUpdater()).eq(deployer.address);
    });
    it("uwp updater can update uwp", async function () {
      let tx = await coverageDataProvider.connect(governor).set(UWP_POOL_NAMES.MAINNET_1, 1);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.MAINNET_1, 1);
      expect(await coverageDataProvider.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(1);
    });
  })

});
