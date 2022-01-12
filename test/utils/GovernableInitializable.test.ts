import hardhat from "hardhat";
const hre = hardhat;
import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { MockGovernableInitializable } from "./../../typechain";

describe("GovernableInitializable", function() {
  let artifacts: ArtifactImports;
  // users
  let deployer: Wallet;
  let governor: Wallet;
  let user: Wallet;
  let zero_user: SignerWithAddress;
  let max_user: SignerWithAddress;

  let governable: MockGovernableInitializable;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const MAX_ADDRESS = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF";

  before(async function() {
    [deployer, governor, user] = provider.getWallets();
    await hre.network.provider.request({method: "hardhat_impersonateAccount", params: [ZERO_ADDRESS]});
    await deployer.sendTransaction({to: ZERO_ADDRESS, value: BN.from("1000000000000000000")});
    zero_user = await ethers.getSigner(ZERO_ADDRESS);
    await deployer.sendTransaction({to: MAX_ADDRESS, value: BN.from("1000000000000000000")});
    max_user = await ethers.getSigner(MAX_ADDRESS);

    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    governable = (await deployContract(deployer, artifacts.MockGovernableInitializable, [governor.address])) as MockGovernableInitializable;
  });

  describe("deployment", function () {
    it("reverts zero address governor", async function () {
      await expect(deployContract(deployer, artifacts.MockGovernableInitializable, [ZERO_ADDRESS])).to.be.revertedWith("zero address governance");
    });
    it("starts with the correct governor", async function() {
      expect(await governable.governance()).to.equal(governor.address);
      expect(await governable.pendingGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("starts unlocked", async function() {
      expect(await governable.governanceIsLocked()).to.equal(false);
    });
  });

  describe("powers", function () {
    it("can call governance only functions", async function () {
      await expect(governable.connect(governor).doThing()).to.not.be.reverted;
    });
    it("non governance cannot call governance only functions", async function () {
      await expect(governable.connect(deployer).doThing()).to.be.revertedWith("!governance");
      await expect(governable.connect(zero_user).doThing()).to.be.revertedWith("!governance");
      await expect(governable.connect(max_user).doThing()).to.be.revertedWith("!governance");
    });
  });

  describe("transfer", function () {
    it("rejects setting new governance by non governor", async function() {
      await expect(governable.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
      await expect(governable.connect(zero_user).setPendingGovernance(zero_user.address)).to.be.revertedWith("!governance");
      await expect(governable.connect(max_user).setPendingGovernance(max_user.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await governable.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(governable, "GovernancePending").withArgs(deployer.address);
      expect(await governable.governance()).to.equal(governor.address);
      expect(await governable.pendingGovernance()).to.equal(deployer.address);
      await expect(governable.connect(governor).doThing()).to.not.be.reverted;
      await expect(governable.connect(deployer).doThing()).to.be.revertedWith("!governance");
      await expect(governable.connect(zero_user).doThing()).to.be.revertedWith("!governance");
      await expect(governable.connect(max_user).doThing()).to.be.revertedWith("!governance");
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(governable.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
      await expect(governable.connect(zero_user).acceptGovernance()).to.be.revertedWith("!pending governance");
      await expect(governable.connect(max_user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function() {
      let tx = await governable.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(governable, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await governable.governance()).to.equal(deployer.address);
      expect(await governable.pendingGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("new governance can use powers", async function () {
      await expect(governable.connect(deployer).doThing()).to.not.be.reverted;
      await expect(governable.connect(governor).doThing()).to.be.revertedWith("!governance");
      await expect(governable.connect(zero_user).doThing()).to.be.revertedWith("!governance");
      await expect(governable.connect(max_user).doThing()).to.be.revertedWith("!governance");
    });
    it("can return governance", async function () {
      await governable.connect(deployer).setPendingGovernance(governor.address);
      await governable.connect(governor).acceptGovernance();
    });
    it("rejects transferring governance to the zero address", async function () {
      expect(await governable.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await expect(governable.connect(zero_user).acceptGovernance()).to.be.revertedWith("zero governance");
    });
  });

  describe("lock", function () {
    it("non governor cannot lock governance", async function () {
      await expect(governable.connect(user).lockGovernance()).to.be.revertedWith("!governance");
      await expect(governable.connect(zero_user).lockGovernance()).to.be.revertedWith("!governance");
      await expect(governable.connect(max_user).lockGovernance()).to.be.revertedWith("!governance");
    });
    it("can lock governance", async function () {
      expect(await governable.governanceIsLocked()).to.equal(false);
      let tx = await governable.connect(governor).lockGovernance();
      expect(tx).to.emit(governable, "GovernanceTransferred").withArgs(governor.address, MAX_ADDRESS);
      expect(tx).to.emit(governable, "GovernanceLocked");
      expect(await governable.governanceIsLocked()).to.equal(true);
      expect(await governable.governance()).to.equal(MAX_ADDRESS);
    });
    it("no one can use the governance role", async function () {
      await expect(governable.connect(deployer).doThing()).to.be.revertedWith("governance locked")
      await expect(governable.connect(governor).doThing()).to.be.revertedWith("governance locked");
      await expect(governable.connect(zero_user).doThing()).to.be.revertedWith("governance locked");
      await expect(governable.connect(max_user).doThing()).to.be.revertedWith("governance locked");
    });
    it("no one can use the pending governance role", async function () {
      await expect(governable.connect(deployer).acceptGovernance()).to.be.revertedWith("governance locked")
      await expect(governable.connect(governor).acceptGovernance()).to.be.revertedWith("governance locked");
      await expect(governable.connect(zero_user).acceptGovernance()).to.be.revertedWith("governance locked");
      await expect(governable.connect(max_user).acceptGovernance()).to.be.revertedWith("governance locked");
    });
  });
});
