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
import { Solace } from "./../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

describe("Governance", function() {
  let artifacts: ArtifactImports;
  // users
  let deployer: Wallet;
  let governor: Wallet;
  let user: Wallet;
  let zero_user: SignerWithAddress;
  let max_user: SignerWithAddress;

  // use solace token for governance
  let solace: Solace;

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

    // deploy solace
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    await expectDeployed(solace.address);
  });

  describe("deployment", function () {
    it("reverts zero address governor", async function () {
      await expect(deployContract(deployer, artifacts.SOLACE, [ZERO_ADDRESS])).to.be.revertedWith("zero address governance");
    });
    it("starts with the correct governor", async function() {
      expect(await solace.governance()).to.equal(governor.address);
      expect(await solace.pendingGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("starts unlocked", async function() {
      expect(await solace.governanceIsLocked()).to.equal(false);
    });
  });

  describe("powers", function () {
    it("can call governance only functions", async function () {
      await expect(solace.connect(governor).addMinter(governor.address)).to.not.be.reverted;
    });
    it("non governance cannot call governance only functions", async function () {
      await expect(solace.connect(deployer).addMinter(governor.address)).to.be.revertedWith("!governance");
      await expect(solace.connect(zero_user).addMinter(governor.address)).to.be.revertedWith("!governance");
      await expect(solace.connect(max_user).addMinter(governor.address)).to.be.revertedWith("!governance");
    });
  });

  describe("transfer", function () {
    it("rejects setting new governance by non governor", async function() {
      await expect(solace.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
      await expect(solace.connect(zero_user).setPendingGovernance(zero_user.address)).to.be.revertedWith("!governance");
      await expect(solace.connect(max_user).setPendingGovernance(max_user.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await solace.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(solace, "GovernancePending").withArgs(deployer.address);
      expect(await solace.governance()).to.equal(governor.address);
      expect(await solace.pendingGovernance()).to.equal(deployer.address);
      await expect(solace.connect(governor).addMinter(governor.address)).to.not.be.reverted;
      await expect(solace.connect(deployer).addMinter(governor.address)).to.be.revertedWith("!governance");
      await expect(solace.connect(zero_user).addMinter(governor.address)).to.be.revertedWith("!governance");
      await expect(solace.connect(max_user).addMinter(governor.address)).to.be.revertedWith("!governance");
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(solace.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
      await expect(solace.connect(zero_user).acceptGovernance()).to.be.revertedWith("!pending governance");
      await expect(solace.connect(max_user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function() {
      let tx = await solace.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(solace, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await solace.governance()).to.equal(deployer.address);
      expect(await solace.pendingGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("new governance can use powers", async function () {
      await expect(solace.connect(deployer).addMinter(governor.address)).to.not.be.reverted;
      await expect(solace.connect(governor).addMinter(governor.address)).to.be.revertedWith("!governance");
      await expect(solace.connect(zero_user).addMinter(governor.address)).to.be.revertedWith("!governance");
      await expect(solace.connect(max_user).addMinter(governor.address)).to.be.revertedWith("!governance");
    });
    it("can return governance", async function () {
      await solace.connect(deployer).setPendingGovernance(governor.address);
      await solace.connect(governor).acceptGovernance();
    });
    it("rejects transferring governance to the zero address", async function () {
      expect(await solace.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await expect(solace.connect(zero_user).acceptGovernance()).to.be.revertedWith("zero governance");
    });
  });

  describe("lock", function () {
    it("non governor cannot lock governance", async function () {
      await expect(solace.connect(user).lockGovernance()).to.be.revertedWith("!governance");
      await expect(solace.connect(zero_user).lockGovernance()).to.be.revertedWith("!governance");
      await expect(solace.connect(max_user).lockGovernance()).to.be.revertedWith("!governance");
    });
    it("can lock governance", async function () {
      expect(await solace.governanceIsLocked()).to.equal(false);
      let tx = await solace.connect(governor).lockGovernance();
      await expect(tx).to.emit(solace, "GovernanceTransferred").withArgs(governor.address, MAX_ADDRESS);
      await expect(tx).to.emit(solace, "GovernanceLocked");
      expect(await solace.governanceIsLocked()).to.equal(true);
      expect(await solace.governance()).to.equal(MAX_ADDRESS);
    });
    it("no one can use the governance role", async function () {
      await expect(solace.connect(deployer).addMinter(governor.address)).to.be.revertedWith("governance locked")
      await expect(solace.connect(governor).addMinter(governor.address)).to.be.revertedWith("governance locked");
      await expect(solace.connect(zero_user).addMinter(governor.address)).to.be.revertedWith("governance locked");
      await expect(solace.connect(max_user).addMinter(governor.address)).to.be.revertedWith("governance locked");
    });
    it("no one can use the pending governance role", async function () {
      await expect(solace.connect(deployer).acceptGovernance()).to.be.revertedWith("governance locked")
      await expect(solace.connect(governor).acceptGovernance()).to.be.revertedWith("governance locked");
      await expect(solace.connect(zero_user).acceptGovernance()).to.be.revertedWith("governance locked");
      await expect(solace.connect(max_user).acceptGovernance()).to.be.revertedWith("governance locked");
    });
  });
});
