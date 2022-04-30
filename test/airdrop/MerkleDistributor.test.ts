import hardhat from "hardhat";
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
import { Solace, MerkleDistributor } from "./../../typechain";
import { toBytes32 } from "./../utilities/setStorage";
import { expectDeployed } from "../utilities/expectDeployed";

describe("MerkleDistributor", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, airdrop_recipient_1, airdrop_recipient_2, greedy_anon] = provider.getWallets();

  // solace contracts
  let solace: Solace;
  let merkleDistributor: MerkleDistributor;

  let snapshot: BN;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const TEN_ETHER = BN.from("10000000000000000000");
  const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");

  before(async function() {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    // it("reverts if zero governor", async function () {
    //   await expect(deployContract(deployer, artifacts.BondDepository, [ZERO_ADDRESS, solace.address])).to.be.revertedWith("zero address governance");
    // });
    // it("reverts if zero solace", async function () {
    //   await expect(deployContract(deployer, artifacts.BondDepository, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address solace");
    // });
    // it("deploys", async function () {
    //   bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address])) as BondDepository;
    //   await expectDeployed(bondDepo.address);
    // });
    // it("starts with correct solace", async function () {
    //   expect(await bondDepo.solace()).eq(solace.address);
    // });
  });

  describe("governance", function() {
    // it("starts with the correct governor", async function() {
    //   expect(await bondDepo.governance()).to.equal(governor.address);
    // });
    // it("rejects setting new governance by non governor", async function() {
    //   await expect(bondDepo.connect(depositor).setPendingGovernance(depositor.address)).to.be.revertedWith("!governance");
    // });
    // it("can set new governance", async function() {
    //   let tx = await bondDepo.connect(governor).setPendingGovernance(deployer.address);
    //   await expect(tx).to.emit(bondDepo, "GovernancePending").withArgs(deployer.address);
    //   expect(await bondDepo.governance()).to.equal(governor.address);
    //   expect(await bondDepo.pendingGovernance()).to.equal(deployer.address);
    // });
    // it("rejects governance transfer by non governor", async function() {
    //   await expect(bondDepo.connect(depositor).acceptGovernance()).to.be.revertedWith("!pending governance");
    // });
    // it("can transfer governance", async function() {
    //   let tx = await bondDepo.connect(deployer).acceptGovernance();
    //   await expect(tx)
    //     .to.emit(bondDepo, "GovernanceTransferred")
    //     .withArgs(governor.address, deployer.address);
    //   expect(await bondDepo.governance()).to.equal(deployer.address);
    //   expect(await bondDepo.pendingGovernance()).to.equal(ZERO_ADDRESS);

    //   await bondDepo.connect(deployer).setPendingGovernance(governor.address);
    //   await bondDepo.connect(governor).acceptGovernance();
    // });
  });

});
