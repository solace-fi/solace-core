import hardhat from "hardhat";
const hre = hardhat;
import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace } from "../typechain";

describe("Governance", function() {
  let artifacts: ArtifactImports;
  // users
  let deployer: Wallet;
  let governor: Wallet;
  let user: Wallet;

  // use solace token for governance
  let solace: Solace;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  before(async function() {
    [deployer, governor, user] = provider.getWallets();
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy solace
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await solace.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(solace.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await solace.connect(governor).setGovernance(deployer.address);
      expect(tx).to.emit(solace, "GovernancePending").withArgs(deployer.address);
      expect(await solace.governance()).to.equal(governor.address);
      expect(await solace.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(solace.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    });
    it("can transfer governance", async function() {
      let tx = await solace.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(solace, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await solace.governance()).to.equal(deployer.address);
      expect(await solace.pendingGovernance()).to.equal(ZERO_ADDRESS);

      await solace.connect(deployer).setGovernance(governor.address);
      await solace.connect(governor).acceptGovernance();
    });
    it("rejects transferring governance to the zero address", async function () {
      await hre.network.provider.request({method: "hardhat_impersonateAccount", params: [ZERO_ADDRESS]});
      await deployer.sendTransaction({to: ZERO_ADDRESS, value: BN.from("1000000000000000000")});
      const zero_user = await ethers.getSigner(ZERO_ADDRESS);
      await expect(solace.connect(zero_user).acceptGovernance()).to.be.revertedWith("zero governance");
    });
  });
});
