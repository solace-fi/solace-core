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
import { CoverageDataProviderV2} from "../../typechain";
import { emit } from "process";

describe("CoverageDataProviderV2", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, updater] = provider.getWallets();
  let coverageDataProviderV2: CoverageDataProviderV2;

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

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
  });

  describe("deployment", function() {
    it("should revert if governance is zero address", async function () {
      await expect(deployContract(deployer, artifacts.CoverageDataProviderV2, [ZERO_ADDRESS])).to.be.revertedWith("zero address governance");
    });

    it("should deploy", async function () {
      coverageDataProviderV2 = await deployContract(deployer, artifacts.CoverageDataProviderV2, [governor.address]) as CoverageDataProviderV2;
      expect(await coverageDataProviderV2.governance()).to.equal(governor.address);
    });

    it("should deploy with initial values", async function() {
      expect(await coverageDataProviderV2.connect(governor).maxCover()).to.be.equal(0);
      expect(await coverageDataProviderV2.connect(governor).numOfPools()).to.be.equal(0);
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await coverageDataProviderV2.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function () {
      await expect(coverageDataProviderV2.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function () {
      let tx = await coverageDataProviderV2.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(coverageDataProviderV2, "GovernancePending").withArgs(deployer.address);
      expect(await coverageDataProviderV2.governance()).to.equal(governor.address);
      expect(await coverageDataProviderV2.pendingGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async function () {
      await expect(coverageDataProviderV2.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async function () {
      let tx = await coverageDataProviderV2.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(coverageDataProviderV2, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await coverageDataProviderV2.governance()).to.equal(deployer.address);
      expect(await coverageDataProviderV2.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await coverageDataProviderV2.connect(deployer).setPendingGovernance(governor.address);
      await coverageDataProviderV2.connect(governor).acceptGovernance();
    });
  });

  describe("set", function() {
    before(async function() {
      expect(await coverageDataProviderV2.connect(user).numOfPools()).to.be.equal(0);
    });

    it("should revert for non-governance", async function() {
      await expect(coverageDataProviderV2.connect(user).set([UWP_POOL_NAMES.MAINNET_1], [ONE_MILLION_USD])).to.be.revertedWith("!governance");
    });

    it("should revert for empty underwriting pool name", async function() {
      await expect(coverageDataProviderV2.connect(governor).set([""], [ONE_MILLION_USD])).to.be.revertedWith("empty underwriting pool name");
    });

    it("should set", async function() {
      let tx = await coverageDataProviderV2.connect(governor).set([UWP_POOL_NAMES.MAINNET_1], [1]);
      await expect(tx).to.emit(coverageDataProviderV2, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.MAINNET_1, 1);
      expect(await coverageDataProviderV2.connect(user).numOfPools()).to.be.equal(1);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(1);
      expect(await coverageDataProviderV2.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.MAINNET_1);
      expect(await coverageDataProviderV2.connect(user).maxCover()).to.be.equal(1);
    });

    it("should set same", async function() {
      let tx = await coverageDataProviderV2.connect(governor).set([UWP_POOL_NAMES.MAINNET_1], [ONE_MILLION_USD]);
      await expect(tx).to.emit(coverageDataProviderV2, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.MAINNET_1, ONE_MILLION_USD);
      expect(await coverageDataProviderV2.connect(user).numOfPools()).to.be.equal(1);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProviderV2.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.MAINNET_1);
      expect(await coverageDataProviderV2.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD);
    });

    it("should set multiple", async function() {
      let tx = await coverageDataProviderV2.connect(governor).set([UWP_POOL_NAMES.MAINNET_1, UWP_POOL_NAMES.AUORA_1], [ONE_MILLION_USD, ONE_MILLION_USD]);
      await expect(tx).to.emit(coverageDataProviderV2, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.AUORA_1, ONE_MILLION_USD);
      expect(await coverageDataProviderV2.connect(user).numOfPools()).to.be.equal(2);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProviderV2.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.MAINNET_1);

      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProviderV2.connect(user).poolOf(2)).to.be.equal(UWP_POOL_NAMES.AUORA_1);
      expect(await coverageDataProviderV2.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD.mul(2));
    });
  });

  describe("remove", function() {
    before(async function() {
      expect(await coverageDataProviderV2.connect(user).numOfPools()).to.be.equal(2);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProviderV2.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD.mul(2));
    });

    it("should revert for non-governance", async function() {
      await expect(coverageDataProviderV2.connect(user).remove([UWP_POOL_NAMES.AUORA_1])).to.be.revertedWith("!governance");
    });

    it("should return for non-exists underwriting pool", async function() {
      await coverageDataProviderV2.connect(governor).remove([UWP_POOL_NAMES.MATIC_1]);
      expect(await coverageDataProviderV2.connect(user).numOfPools()).to.be.equal(2);
    });

    it("should remove", async function() {
      let tx = await coverageDataProviderV2.connect(governor).remove([UWP_POOL_NAMES.MAINNET_1]);
      await expect(tx).to.emit(coverageDataProviderV2, "UnderwritingPoolRemoved").withArgs(UWP_POOL_NAMES.MAINNET_1);
      expect(await coverageDataProviderV2.connect(user).numOfPools()).to.be.equal(1);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(0);

      expect(await coverageDataProviderV2.connect(user).poolOf(1)).to.be.equal(UWP_POOL_NAMES.AUORA_1);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(ONE_MILLION_USD);
      expect(await coverageDataProviderV2.connect(user).maxCover()).to.be.equal(ONE_MILLION_USD);
    });

    it("should remove another", async function() {
      let tx = await coverageDataProviderV2.connect(governor).remove([UWP_POOL_NAMES.AUORA_1]);
      await expect(tx).to.emit(coverageDataProviderV2, "UnderwritingPoolRemoved").withArgs(UWP_POOL_NAMES.AUORA_1);
      expect(await coverageDataProviderV2.connect(user).numOfPools()).to.be.equal(0);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(0);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.AUORA_1)).to.be.equal(0);
      expect(await coverageDataProviderV2.connect(user).maxCover()).to.be.equal(0);
      expect(await coverageDataProviderV2.connect(user).poolOf(1)).to.be.equal("");
      expect(await coverageDataProviderV2.connect(user).poolOf(2)).to.be.equal("");

    });

    it("can remove pool from list of no pools", async function () {
      let coverageDataProvider2 = await deployContract(deployer, artifacts.CoverageDataProviderV2, [governor.address]) as CoverageDataProviderV2;
      await coverageDataProvider2.connect(governor).remove([""]);
    });
  });

  describe("add updater", async function () {
    it("starts unset", async function () {
      expect(await coverageDataProviderV2.numsOfUpdater()).eq(ZERO_ADDRESS);
    });
    it("cannot be set by non governance", async function () {
      await expect(coverageDataProviderV2.connect(user).addUpdater(updater.address)).to.be.revertedWith("!governance");
    });
    it("cannot be set to zero address", async function () {
      await expect(coverageDataProviderV2.connect(governor).addUpdater(ZERO_ADDRESS)).to.be.revertedWith("zero address uwp updater");
    });
    it("can be set by governance", async function () {
      let tx = await coverageDataProviderV2.connect(governor).addUpdater(updater.address);
      await expect(tx).to.emit(coverageDataProviderV2, "UwpUpdaterSet").withArgs(updater.address);
      expect(await coverageDataProviderV2.updaterAt(0)).eq(updater.address);
      expect(await coverageDataProviderV2.isUpdater(updater.address)).eq(true);
      expect(await coverageDataProviderV2.numsOfUpdater()).eq(1);
    });
    it("uwp updater can update uwp", async function () {
      let tx = await coverageDataProviderV2.connect(updater).set([UWP_POOL_NAMES.MAINNET_1], [1]);
      await expect(tx).to.emit(coverageDataProviderV2, "UnderwritingPoolSet").withArgs(UWP_POOL_NAMES.MAINNET_1, 1);
      expect(await coverageDataProviderV2.connect(user).balanceOf(UWP_POOL_NAMES.MAINNET_1)).to.be.equal(1);
    });
  });

  describe("remove updater", async function () {
    before( async function() {
      expect(await coverageDataProviderV2.connect(user).isUpdater(updater.address)).eq(true);
    });

    it("do nothing if there is no valid updater", async function () {
     await coverageDataProviderV2.connect(governor).removeUpdater(ZERO_ADDRESS);
    });

    it("can't remove by non governance", async function () {
      await expect(coverageDataProviderV2.connect(user).removeUpdater(updater.address)).to.be.revertedWith("!governance");
    });

    it("can remove by governance", async function () {
      let tx = await coverageDataProviderV2.connect(governor).removeUpdater(updater.address);
      await expect(tx).to.emit(coverageDataProviderV2, "UwpUpdaterRemoved").withArgs(updater.address);
      expect(await coverageDataProviderV2.isUpdater(updater.address)).eq(false);
      expect(await coverageDataProviderV2.numsOfUpdater()).eq(0);
    });

    it("can't not update uwp", async function () {
      await expect(coverageDataProviderV2.connect(updater).set([UWP_POOL_NAMES.MAINNET_1], [1])).to.be.revertedWith("!governance");
    });
  });

});
