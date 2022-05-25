import chai from "chai";
import { waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, Wallet } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { Scp, MockScpRetainer } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";
import { toAbiEncoded } from "../utilities/setStorage";

describe("SCP", function () {
  let scp: Scp;
  const [deployer, governor, user1, user2, scpMover1, scpMover2] = provider.getWallets();
  const name = "scp";
  const symbol = "SCP";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  const MINT_SIGHASH          = "0xd1a1beb4";
  const TRANSFER_FROM_SIGHASH = "0x23b872dd";
  const BURN_SIGHASH          = "0x9dc29fac";
  const WITHDRAW_SIGHASH      = "0xf3fef3a3";

  let scpRetainer1: MockScpRetainer;
  let scpRetainer2: MockScpRetainer;

  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
  });

  describe("deployment", function () {
    it("cannot deploy with zero address governance", async function () {
      await expect(deployContract(deployer, artifacts.SCP, [ZERO_ADDRESS])).to.be.revertedWith("zero address governance");
    });
    it("deploys successfully", async function () {
      scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
      await expectDeployed(scp.address);
    });
    it("has a correct name", async function () {
      expect(await scp.name()).eq(name);
    });
    it("has a correct symbol", async function () {
      expect(await scp.symbol()).eq(symbol);
    });
    it("has 18 decimals", async function () {
      expect(await scp.decimals()).eq(18);
    });
    it("has a correct governance", async function () {
      expect(await scp.governance()).eq(governor.address);
    });
    it("starts with no supply", async function () {
      expect(await scp.totalSupply()).eq(0);
      expect(await scp.balanceOf(user1.address)).eq(0);
      expect(await scp.balanceOfNonRefundable(user1.address)).eq(0);
    });
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await scp.governance()).eq(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(scp.connect(user1).setPendingGovernance(user1.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await scp.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(scp, "GovernancePending").withArgs(deployer.address);
      expect(await scp.governance()).eq(governor.address);
      expect(await scp.pendingGovernance()).eq(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(scp.connect(user1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function() {
      let tx = await scp.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(scp, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await scp.governance()).eq(deployer.address);
      expect(await scp.pendingGovernance()).eq(ZERO_ADDRESS);

      await scp.connect(deployer).setPendingGovernance(governor.address);
      await scp.connect(governor).acceptGovernance();
    });
  });

  describe("scp movers", function () {
    it("starts with no movers", async function () {
      expect(await scp.scpMoverLength()).eq(0);
      await expect(scp.scpMoverList(0)).to.be.reverted; // index out of bounds
      expect(await scp.isScpMover(ZERO_ADDRESS)).eq(false);
      expect(await scp.isScpMover(scpMover1.address)).eq(false);
    });
    it("non governance cannot add or remove movers", async function () {
      await expect(scp.connect(scpMover1).setScpMoverStatuses([],[])).to.be.revertedWith("!governance");
    });
    it("cannot add or remove with mismatched length", async function () {
      await expect(scp.connect(governor).setScpMoverStatuses([],[false])).to.be.revertedWith("length mismatch");
    });
    it("governance can add or remove movers", async function () {
      let tx = await scp.connect(governor).setScpMoverStatuses([scpMover1.address, scpMover2.address, user1.address], [true, true, false]);
      await expect(tx).to.emit(scp, "ScpMoverStatusSet").withArgs(scpMover1.address, true);
      await expect(tx).to.emit(scp, "ScpMoverStatusSet").withArgs(scpMover2.address, true);
      await expect(tx).to.emit(scp, "ScpMoverStatusSet").withArgs(user1.address, false);
      expect(await scp.scpMoverLength()).eq(2);
      expect(await scp.scpMoverList(0)).eq(scpMover1.address);
      expect(await scp.scpMoverList(1)).eq(scpMover2.address);
      await expect(scp.scpMoverList(2)).to.be.reverted; // index out of bounds
      expect(await scp.isScpMover(ZERO_ADDRESS)).eq(false);
      expect(await scp.isScpMover(scpMover1.address)).eq(true);
      expect(await scp.isScpMover(scpMover2.address)).eq(true);
      expect(await scp.isScpMover(user1.address)).eq(false);
    });
  });

  describe("scp retainers", function () {
    before(async function () {
      scpRetainer1 = (await deployContract(deployer, artifacts.MockSCPRetainer)) as MockScpRetainer;
      scpRetainer2 = (await deployContract(deployer, artifacts.MockSCPRetainer)) as MockScpRetainer;
    })
    it("starts with no retainers", async function () {
      expect(await scp.scpRetainerLength()).eq(0);
      await expect(scp.scpRetainerList(0)).to.be.reverted; // index out of bounds
      expect(await scp.isScpRetainer(ZERO_ADDRESS)).eq(false);
      expect(await scp.isScpRetainer(scpRetainer1.address)).eq(false);
    });
    it("non governance cannot add or remove retainers", async function () {
      await expect(scp.connect(user1).setScpRetainerStatuses([],[])).to.be.revertedWith("!governance");
    });
    it("cannot add or remove with mismatched length", async function () {
      await expect(scp.connect(governor).setScpRetainerStatuses([],[false])).to.be.revertedWith("length mismatch");
    });
    it("governance can add or remove retainers", async function () {
      let tx = await scp.connect(governor).setScpRetainerStatuses([scpRetainer1.address, scpRetainer2.address, user1.address], [true, true, false]);
      await expect(tx).to.emit(scp, "ScpRetainerStatusSet").withArgs(scpRetainer1.address, true);
      await expect(tx).to.emit(scp, "ScpRetainerStatusSet").withArgs(scpRetainer2.address, true);
      await expect(tx).to.emit(scp, "ScpRetainerStatusSet").withArgs(user1.address, false);
      expect(await scp.scpRetainerLength()).eq(2);
      expect(await scp.scpRetainerList(0)).eq(scpRetainer1.address);
      expect(await scp.scpRetainerList(1)).eq(scpRetainer2.address);
      await expect(scp.scpRetainerList(2)).to.be.reverted; // index out of bounds
      expect(await scp.isScpRetainer(ZERO_ADDRESS)).eq(false);
      expect(await scp.isScpRetainer(scpRetainer1.address)).eq(true);
      expect(await scp.isScpRetainer(scpRetainer2.address)).eq(true);
      expect(await scp.isScpRetainer(user1.address)).eq(false);
    });
    it("minScpRequired is sum of retainers minScpRequired", async function () {
      expect(await scp.minScpRequired(ZERO_ADDRESS)).eq(0);
      await scpRetainer1.setMinScpRequired(ZERO_ADDRESS, 2);
      await scpRetainer2.setMinScpRequired(ZERO_ADDRESS, 3);
      expect(await scp.minScpRequired(ZERO_ADDRESS)).eq(5);
    });
  });

  describe("allowance", function () {
    it("is always zero", async function () {
      expect(await scp.allowance(user1.address, user2.address)).eq(0);
    });
    it("does not support approve", async function () {
      await expect(scp.connect(user1).approve(user2.address, 0)).to.be.revertedWith("SCP: token not approvable");
    });
  });

  describe("mint", function () {
    it("non mover cannot mint", async function () {
      await expect(scp.connect(user1).mint(user1.address, 1, false)).to.be.revertedWith("!scp mover");
    });
    it("cannot mint to zero address", async function () {
      await expect(scp.connect(scpMover1).mint(ZERO_ADDRESS, 1, false)).to.be.revertedWith("SCP: mint to the zero address");
    });
    it("mover can mint", async function () {
      let b1 = await getBalances();

      let tx1 = await scp.connect(scpMover1).mint(user1.address, 100, false);
      await expect(tx1).to.emit(scp, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 100);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(100);
      expect(bd21.balanceOfs[2]).eq(100);
      expect(bd21.balanceOfNonRefundables[2]).eq(100);

      let tx2 = await scp.connect(scpMover2).mint(user2.address, 200, true);
      await expect(tx2).to.emit(scp, "Transfer").withArgs(ZERO_ADDRESS, user2.address, 200);
      let b3 = await getBalances();
      let bd32 = getBalancesDiff(b3, b2);
      expect(bd32.totalSupply).eq(200);
      expect(bd32.balanceOfs[3]).eq(200);
      expect(bd32.balanceOfNonRefundables[3]).eq(0);

      let tx3 = await scp.connect(scpMover1).mint(user1.address, 400, false);
      await expect(tx3).to.emit(scp, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 400);
      let b4 = await getBalances();
      let bd43 = getBalancesDiff(b4, b3);
      expect(bd43.totalSupply).eq(400);
      expect(bd43.balanceOfs[2]).eq(400);
      expect(bd43.balanceOfNonRefundables[2]).eq(400);

      let tx4 = await scp.connect(scpMover1).mint(user1.address, 800, true);
      await expect(tx4).to.emit(scp, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 800);
      let b5 = await getBalances();
      let bd54 = getBalancesDiff(b5, b4);
      expect(bd54.totalSupply).eq(800);
      expect(bd54.balanceOfs[2]).eq(800);
      expect(bd54.balanceOfNonRefundables[2]).eq(0);
    });
    it("can mint many via multicall", async function () {
      let b1 = await getBalances();
      let tx = await scp.connect(scpMover1).multicall([
        `${MINT_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(100)}${toAbiEncoded(1)}`,
        `${MINT_SIGHASH}${toAbiEncoded(user2.address)}${toAbiEncoded(200)}${toAbiEncoded(0)}`,
      ]);
      await expect(tx).to.emit(scp, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 100);
      await expect(tx).to.emit(scp, "Transfer").withArgs(ZERO_ADDRESS, user2.address, 200);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(300);
      expect(bd21.balanceOfs[2]).eq(100);
      expect(bd21.balanceOfNonRefundables[2]).eq(0);
      expect(bd21.balanceOfs[3]).eq(200);
      expect(bd21.balanceOfNonRefundables[3]).eq(200);
    });
  });

  describe("transfer", function () {
    it("non mover cannot transfer", async function () {
      await expect(scp.connect(user1).transfer(user1.address, 1)).to.be.revertedWith("!scp mover");
      await expect(scp.connect(user1).transferFrom(user2.address, user1.address, 1)).to.be.revertedWith("!scp mover");
    });
    it("cannot transfer to or from zero address", async function () {
      await expect(scp.connect(scpMover1).transfer(ZERO_ADDRESS, 1)).to.be.revertedWith("SCP: transfer to the zero address");
      await expect(scp.connect(scpMover1).transferFrom(ZERO_ADDRESS, user1.address, 1)).to.be.revertedWith("SCP: transfer from the zero address");
      await expect(scp.connect(scpMover1).transferFrom(user1.address, ZERO_ADDRESS, 1)).to.be.revertedWith("SCP: transfer to the zero address");
    });
    it("cannot transfer more than balance", async function () {
      let bal = await scp.balanceOf(user1.address);
      await expect(scp.connect(scpMover1).transferFrom(user1.address, user2.address, bal.add(1))).to.be.revertedWith("SCP: transfer amount exceeds balance");
    });
    it("transfers", async function () {
      await scp.connect(scpMover1).mint(scpMover1.address, 1000, true);
      let b1 = await getBalances();

      let tx1 = await scp.connect(scpMover1).transfer(user1.address, 100);
      await expect(tx1).to.emit(scp, "Transfer").withArgs(scpMover1.address, user1.address, 100);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(0);
      expect(bd21.balanceOfs[0]).eq(-100);
      expect(bd21.balanceOfNonRefundables[0]).eq(0);
      expect(bd21.balanceOfs[2]).eq(100);
      expect(bd21.balanceOfNonRefundables[2]).eq(0);

      let tx2 = await scp.connect(scpMover1).transferFrom(user1.address, user2.address, 200);
      await expect(tx2).to.emit(scp, "Transfer").withArgs(user1.address, user2.address, 200);
      let b3 = await getBalances();
      let bd32 = getBalancesDiff(b3, b2);
      expect(bd32.totalSupply).eq(0);
      expect(bd32.balanceOfs[2]).eq(-200);
      expect(bd32.balanceOfNonRefundables[2]).eq(-200);
      expect(bd32.balanceOfs[3]).eq(200);
      expect(bd32.balanceOfNonRefundables[3]).eq(200);

      // partly nonrefundable
      let tx3 = await scp.connect(scpMover1).transferFrom(user1.address, user2.address, 400);
      await expect(tx3).to.emit(scp, "Transfer").withArgs(user1.address, user2.address, 400);
      let b4 = await getBalances();
      let bd43 = getBalancesDiff(b4, b3);
      expect(bd43.totalSupply).eq(0);
      expect(bd43.balanceOfs[2]).eq(-400);
      expect(bd43.balanceOfNonRefundables[2]).eq(-300);
      expect(bd43.balanceOfs[3]).eq(400);
      expect(bd43.balanceOfNonRefundables[3]).eq(300);
    });
    it("cannot transfer more than balance", async function () {
      let bal1 = await scp.balanceOf(scpMover1.address);
      await expect(scp.connect(scpMover1).transfer(user2.address, bal1.add(1))).to.be.revertedWith("SCP: transfer amount exceeds balance");
      let bal2 = await scp.balanceOf(user1.address);
      await expect(scp.connect(scpMover1).transferFrom(user1.address, user2.address, bal2.add(1))).to.be.revertedWith("SCP: transfer amount exceeds balance");
    });
    it("can transfer many via multicall", async function () {
      let b1 = await getBalances();
      let tx = await scp.connect(scpMover1).multicall([
        `${TRANSFER_FROM_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(scpMover1.address)}${toAbiEncoded(100)}`,
        `${TRANSFER_FROM_SIGHASH}${toAbiEncoded(user2.address)}${toAbiEncoded(scpMover2.address)}${toAbiEncoded(200)}`,
      ]);
      await expect(tx).to.emit(scp, "Transfer").withArgs(user1.address, scpMover1.address, 100);
      await expect(tx).to.emit(scp, "Transfer").withArgs(user2.address, scpMover2.address, 200);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(0);
      expect(bd21.balanceOfs[0]).eq(100);
      expect(bd21.balanceOfs[1]).eq(200);
      expect(bd21.balanceOfs[2]).eq(-100);
      expect(bd21.balanceOfs[3]).eq(-200);
    });
  });

  describe("burn", function () {
    before("redeploy", async function () {
      scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
      await scp.connect(governor).setScpMoverStatuses([scpMover1.address, scpMover2.address, user1.address], [true, true, false]);
      await scp.connect(governor).setScpRetainerStatuses([scpRetainer1.address, scpRetainer2.address, user1.address], [true, true, false]);
      await scp.connect(scpMover1).mint(user1.address, 100, false);
      await scp.connect(scpMover1).mint(user2.address, 500, false);
      await scp.connect(scpMover1).mint(user2.address, 200, true);
    });
    it("non mover cannot burn", async function () {
      await expect(scp.connect(user1).burn(user1.address, 1)).to.be.revertedWith("!scp mover");
    });
    it("cannot burn from zero address", async function () {
      await expect(scp.connect(scpMover1).burn(ZERO_ADDRESS, 1)).to.be.revertedWith("SCP: burn from the zero address");
    });
    it("mover can burn", async function () {
      let b1 = await getBalances();

      // fully nonrefundable
      let tx1 = await scp.connect(scpMover1).burn(user2.address, 100);
      await expect(tx1).to.emit(scp, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 100);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(-100);
      expect(bd21.balanceOfs[3]).eq(-100);
      expect(bd21.balanceOfNonRefundables[3]).eq(-100);

      // partly nonrefundable
      let tx2 = await scp.connect(scpMover1).burn(user2.address, 500);
      await expect(tx2).to.emit(scp, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 500);
      let b3 = await getBalances();
      let bd32 = getBalancesDiff(b3, b2);
      expect(bd32.totalSupply).eq(-500);
      expect(bd32.balanceOfs[3]).eq(-500);
      expect(bd32.balanceOfNonRefundables[3]).eq(-400);

      // fully refundable
      let tx3 = await scp.connect(scpMover1).burn(user2.address, 100);
      await expect(tx3).to.emit(scp, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 100);
      let b4 = await getBalances();
      let bd43 = getBalancesDiff(b4, b3);
      expect(bd43.totalSupply).eq(-100);
      expect(bd43.balanceOfs[3]).eq(-100);
      expect(bd43.balanceOfNonRefundables[3]).eq(0);
    });
    it("cannot burn more than balance", async function () {
      let bal = await scp.balanceOf(user1.address);
      await expect(scp.connect(scpMover1).burn(user1.address, bal.add(1))).to.be.revertedWith("SCP: burn amount exceeds balance");
    });
    it("can burn many via multicall", async function () {
      await scp.connect(scpMover1).mint(user2.address, 200, true);
      let b1 = await getBalances();
      let tx = await scp.connect(scpMover1).multicall([
        `${BURN_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(100)}`,
        `${BURN_SIGHASH}${toAbiEncoded(user2.address)}${toAbiEncoded(200)}`,
      ]);
      await expect(tx).to.emit(scp, "Transfer").withArgs(user1.address, ZERO_ADDRESS, 100);
      await expect(tx).to.emit(scp, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 200);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(-300);
      expect(bd21.balanceOfs[2]).eq(-100);
      expect(bd21.balanceOfs[3]).eq(-200);
    });
  });

  describe("withdraw", function () {
    before("redeploy", async function () {
      scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
      await scp.connect(governor).setScpMoverStatuses([scpMover1.address, scpMover2.address, user1.address], [true, true, false]);
      await scp.connect(governor).setScpRetainerStatuses([scpRetainer1.address, scpRetainer2.address, user1.address], [true, true, false]);
      await scp.connect(scpMover1).mint(user2.address, 500, true);
    });
    it("non mover cannot withdraw", async function () {
      await expect(scp.connect(user1).withdraw(user1.address, 1)).to.be.revertedWith("!scp mover");
    });
    it("cannot withdraw from zero address", async function () {
      await expect(scp.connect(scpMover1).withdraw(ZERO_ADDRESS, 1)).to.be.revertedWith("SCP: withdraw from the zero address");
    });
    it("mover can withdraw", async function () {
      let b1 = await getBalances();

      let tx1 = await scp.connect(scpMover1).withdraw(user2.address, 100);
      await expect(tx1).to.emit(scp, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 100);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(-100);
      expect(bd21.balanceOfs[3]).eq(-100);
      expect(bd21.balanceOfNonRefundables[3]).eq(0);

      let tx2 = await scp.connect(scpMover1).withdraw(user2.address, 300);
      await expect(tx2).to.emit(scp, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 300);
      let b3 = await getBalances();
      let bd32 = getBalancesDiff(b3, b2);
      expect(bd32.totalSupply).eq(-300);
      expect(bd32.balanceOfs[3]).eq(-300);
      expect(bd32.balanceOfNonRefundables[3]).eq(0);
    });
    it("cannot withdraw more than refundable balance", async function () {
      let bal = await scp.balanceOf(user1.address);
      let bnr = await scp.balanceOfNonRefundable(user1.address);
      let br = bal.sub(bnr);
      await expect(scp.connect(scpMover1).withdraw(user1.address, br.add(1))).to.be.revertedWith("SCP: withdraw amount exceeds balance");
    });
    it("cannot withdraw to below min", async function () {
      let bal1 = await scp.balanceOf(user2.address);
      await scp.connect(scpMover1).transferFrom(user2.address, deployer.address, bal1);
      await scp.connect(scpMover1).mint(user2.address, 60, true);
      await scpRetainer1.setMinScpRequired(user2.address, 50);
      await expect(scp.connect(scpMover1).withdraw(user2.address, 20)).to.be.revertedWith("SCP: withdraw to below min");

      let bal2 = await scp.balanceOf(user2.address);
      await scp.connect(scpMover1).transferFrom(user2.address, deployer.address, bal2);
      await scp.connect(scpMover1).mint(user2.address, 60, false);
      await scpRetainer1.setMinScpRequired(user2.address, 50);
      await expect(scp.connect(scpMover1).withdraw(user2.address, 20)).to.be.revertedWith("SCP: withdraw amount exceeds balance");
    });
    it("can withdraw many via multicall", async function () {
      await scp.connect(scpMover1).mint(user1.address, 500, true);
      await scp.connect(scpMover1).mint(user2.address, 500, true);
      let b1 = await getBalances();
      let tx = await scp.connect(scpMover1).multicall([
        `${WITHDRAW_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(100)}`,
        `${WITHDRAW_SIGHASH}${toAbiEncoded(user2.address)}${toAbiEncoded(200)}`,
      ]);
      await expect(tx).to.emit(scp, "Transfer").withArgs(user1.address, ZERO_ADDRESS, 100);
      await expect(tx).to.emit(scp, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 200);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(-300);
      expect(bd21.balanceOfs[2]).eq(-100);
      expect(bd21.balanceOfs[3]).eq(-200);
    });
  });

  describe("multicall", function () {
    before("redeploy", async function () {
      scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
      await scp.connect(governor).setScpMoverStatuses([scpMover1.address, scpMover2.address, user1.address], [true, true, false]);
    });
    it("can bundle multiple calls", async function () {
      let b1 = await getBalances();
      let tx = await scp.connect(scpMover1).multicall([
        `${MINT_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(500)}${toAbiEncoded(1)}`,
        `${MINT_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(600)}${toAbiEncoded(0)}`,
        `${TRANSFER_FROM_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(user2.address)}${toAbiEncoded(800)}`,
        `${WITHDRAW_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(100)}`,
        `${BURN_SIGHASH}${toAbiEncoded(user2.address)}${toAbiEncoded(200)}`,
      ]);
      await expect(tx).to.emit(scp, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 500);
      await expect(tx).to.emit(scp, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 600);
      await expect(tx).to.emit(scp, "Transfer").withArgs(user1.address, user2.address, 800);
      await expect(tx).to.emit(scp, "Transfer").withArgs(user1.address, ZERO_ADDRESS, 100);
      await expect(tx).to.emit(scp, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 200);
      let b2 = await getBalances();
      expect(b2.totalSupply).eq(800);
      expect(b2.balanceOfs[2]).eq(200);
      expect(b2.balanceOfNonRefundables[2]).eq(0);
      expect(b2.balanceOfs[3]).eq(600);
      expect(b2.balanceOfNonRefundables[3]).eq(400);
    });
    it("bundle fails if one fails", async function () {
      await expect(scp.connect(scpMover1).multicall([
        `${MINT_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(500)}${toAbiEncoded(1)}`,
        `${WITHDRAW_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(10000)}`
      ])).to.be.reverted;
    });
  });

  interface Balances {
    totalSupply: BN;
    balanceOfs: BN[];
    balanceOfNonRefundables: BN[];
  }

  async function getBalances(): Promise<Balances> {
    let balanceOfs = [];
    let balanceOfNonRefundables = [];
    let users = [scpMover1, scpMover2, user1, user2];
    for(var i = 0; i < users.length; ++i) {
      balanceOfs.push(await scp.balanceOf(users[i].address));
      balanceOfNonRefundables.push(await scp.balanceOfNonRefundable(users[i].address));
    }
    return {
      totalSupply: await scp.totalSupply(),
      balanceOfs: balanceOfs,
      balanceOfNonRefundables: balanceOfNonRefundables
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    let balanceOfs = [];
    let balanceOfNonRefundables = [];
    for(var i = 0; i < balances1.balanceOfs.length; ++i) {
      balanceOfs.push(balances1.balanceOfs[i].sub(balances2.balanceOfs[i]))
      balanceOfNonRefundables.push(balances1.balanceOfNonRefundables[i].sub(balances2.balanceOfNonRefundables[i]))
    }
    return {
      totalSupply: balances1.totalSupply.sub(balances2.totalSupply),
      balanceOfs: balanceOfs,
      balanceOfNonRefundables: balanceOfNonRefundables
    };
  }
})
