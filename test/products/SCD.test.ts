import chai from "chai";
import { waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, Wallet } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { SCD, MockScdRetainer } from "./../../typechain";
import { expectDeployed } from "./../utilities/expectDeployed";

describe("SCD", function () {
  let scd: SCD;
  const [deployer, governor, user1, user2, scdMover1, scdMover2] = provider.getWallets();
  const name = "scd";
  const symbol = "SCD";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  let scdRetainer1: MockScdRetainer;
  let scdRetainer2: MockScdRetainer;

  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
  });

  describe("deployment", function () {
    it("cannot deploy with zero address governance", async function () {
      await expect(deployContract(deployer, artifacts.SCD, [ZERO_ADDRESS])).to.be.revertedWith("zero address governance");
    });
    it("deploys successfully", async function () {
      scd = (await deployContract(deployer, artifacts.SCD, [governor.address])) as SCD;
      await expectDeployed(scd.address);
    });
    it("has a correct name", async function () {
      expect(await scd.name()).eq(name);
    });
    it("has a correct symbol", async function () {
      expect(await scd.symbol()).eq(symbol);
    });
    it("has 18 decimals", async function () {
      expect(await scd.decimals()).eq(18);
    });
    it("has a correct governance", async function () {
      expect(await scd.governance()).eq(governor.address);
    });
    it("starts with no supply", async function () {
      expect(await scd.totalSupply()).eq(0);
      expect(await scd.balanceOf(user1.address)).eq(0);
      expect(await scd.balanceOfNonRefundable(user1.address)).eq(0);
    });
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await scd.governance()).eq(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(scd.connect(user1).setPendingGovernance(user1.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await scd.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(scd, "GovernancePending").withArgs(deployer.address);
      expect(await scd.governance()).eq(governor.address);
      expect(await scd.pendingGovernance()).eq(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(scd.connect(user1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function() {
      let tx = await scd.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(scd, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await scd.governance()).eq(deployer.address);
      expect(await scd.pendingGovernance()).eq(ZERO_ADDRESS);

      await scd.connect(deployer).setPendingGovernance(governor.address);
      await scd.connect(governor).acceptGovernance();
    });
  });

  describe("scd movers", function () {
    it("starts with no movers", async function () {
      expect(await scd.scdMoverLength()).eq(0);
      await expect(scd.scdMoverList(0)).to.be.reverted; // index out of bounds
      expect(await scd.isScdMover(ZERO_ADDRESS)).eq(false);
      expect(await scd.isScdMover(scdMover1.address)).eq(false);
    });
    it("non governance cannot add or remove movers", async function () {
      await expect(scd.connect(scdMover1).setScdMoverStatuses([],[])).to.be.revertedWith("!governance");
    });
    it("cannot add or remove with mismatched length", async function () {
      await expect(scd.connect(governor).setScdMoverStatuses([],[false])).to.be.revertedWith("length mismatch");
    });
    it("governance can add or remove movers", async function () {
      let tx = await scd.connect(governor).setScdMoverStatuses([scdMover1.address, scdMover2.address, user1.address], [true, true, false]);
      await expect(tx).to.emit(scd, "ScdMoverStatusSet").withArgs(scdMover1.address, true);
      await expect(tx).to.emit(scd, "ScdMoverStatusSet").withArgs(scdMover2.address, true);
      await expect(tx).to.emit(scd, "ScdMoverStatusSet").withArgs(user1.address, false);
      expect(await scd.scdMoverLength()).eq(2);
      expect(await scd.scdMoverList(0)).eq(scdMover1.address);
      expect(await scd.scdMoverList(1)).eq(scdMover2.address);
      await expect(scd.scdMoverList(2)).to.be.reverted; // index out of bounds
      expect(await scd.isScdMover(ZERO_ADDRESS)).eq(false);
      expect(await scd.isScdMover(scdMover1.address)).eq(true);
      expect(await scd.isScdMover(scdMover2.address)).eq(true);
      expect(await scd.isScdMover(user1.address)).eq(false);
    });
  });

  describe("scd retainers", function () {
    before(async function () {
      scdRetainer1 = (await deployContract(deployer, artifacts.MockSCDRetainer)) as MockScdRetainer;
      scdRetainer2 = (await deployContract(deployer, artifacts.MockSCDRetainer)) as MockScdRetainer;
    })
    it("starts with no retainers", async function () {
      expect(await scd.scdRetainerLength()).eq(0);
      await expect(scd.scdRetainerList(0)).to.be.reverted; // index out of bounds
      expect(await scd.isScdRetainer(ZERO_ADDRESS)).eq(false);
      expect(await scd.isScdRetainer(scdRetainer1.address)).eq(false);
    });
    it("non governance cannot add or remove retainers", async function () {
      await expect(scd.connect(user1).setScdRetainerStatuses([],[])).to.be.revertedWith("!governance");
    });
    it("cannot add or remove with mismatched length", async function () {
      await expect(scd.connect(governor).setScdRetainerStatuses([],[false])).to.be.revertedWith("length mismatch");
    });
    it("governance can add or remove retainers", async function () {
      let tx = await scd.connect(governor).setScdRetainerStatuses([scdRetainer1.address, scdRetainer2.address, user1.address], [true, true, false]);
      await expect(tx).to.emit(scd, "ScdRetainerStatusSet").withArgs(scdRetainer1.address, true);
      await expect(tx).to.emit(scd, "ScdRetainerStatusSet").withArgs(scdRetainer2.address, true);
      await expect(tx).to.emit(scd, "ScdRetainerStatusSet").withArgs(user1.address, false);
      expect(await scd.scdRetainerLength()).eq(2);
      expect(await scd.scdRetainerList(0)).eq(scdRetainer1.address);
      expect(await scd.scdRetainerList(1)).eq(scdRetainer2.address);
      await expect(scd.scdRetainerList(2)).to.be.reverted; // index out of bounds
      expect(await scd.isScdRetainer(ZERO_ADDRESS)).eq(false);
      expect(await scd.isScdRetainer(scdRetainer1.address)).eq(true);
      expect(await scd.isScdRetainer(scdRetainer2.address)).eq(true);
      expect(await scd.isScdRetainer(user1.address)).eq(false);
    });
    it("minScdRequired is sum of retainers minScdRequired", async function () {
      expect(await scd.minScdRequired(ZERO_ADDRESS)).eq(0);
      await scdRetainer1.setMinScdRequired(ZERO_ADDRESS, 2);
      await scdRetainer2.setMinScdRequired(ZERO_ADDRESS, 3);
      expect(await scd.minScdRequired(ZERO_ADDRESS)).eq(5);
    });
  });

  describe("allowance", function () {
    it("is always zero", async function () {
      expect(await scd.allowance(user1.address, user2.address)).eq(0);
    });
    it("does not support approve", async function () {
      await expect(scd.connect(user1).approve(user2.address, 0)).to.be.revertedWith("SCD: token not approvable");
    });
  });

  describe("mint", function () {
    it("non mover cannot mint", async function () {
      await expect(scd.connect(user1).mint(user1.address, 1, false)).to.be.revertedWith("!scd mover");
    });
    it("cannot mint to zero address", async function () {
      await expect(scd.connect(scdMover1).mint(ZERO_ADDRESS, 1, false)).to.be.revertedWith("SCD: mint to the zero address");
    });
    it("mover can mint", async function () {
      let b1 = await getBalances();

      let tx1 = await scd.connect(scdMover1).mint(user1.address, 100, false);
      await expect(tx1).to.emit(scd, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 100);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(100);
      expect(bd21.balanceOfs[2]).eq(100);
      expect(bd21.balanceOfNonRefundables[2]).eq(100);

      let tx2 = await scd.connect(scdMover2).mint(user2.address, 200, true);
      await expect(tx2).to.emit(scd, "Transfer").withArgs(ZERO_ADDRESS, user2.address, 200);
      let b3 = await getBalances();
      let bd32 = getBalancesDiff(b3, b2);
      expect(bd32.totalSupply).eq(200);
      expect(bd32.balanceOfs[3]).eq(200);
      expect(bd32.balanceOfNonRefundables[3]).eq(0);

      let tx3 = await scd.connect(scdMover1).mint(user1.address, 400, false);
      await expect(tx3).to.emit(scd, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 400);
      let b4 = await getBalances();
      let bd43 = getBalancesDiff(b4, b3);
      expect(bd43.totalSupply).eq(400);
      expect(bd43.balanceOfs[2]).eq(400);
      expect(bd43.balanceOfNonRefundables[2]).eq(400);

      let tx4 = await scd.connect(scdMover1).mint(user1.address, 800, true);
      await expect(tx4).to.emit(scd, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 800);
      let b5 = await getBalances();
      let bd54 = getBalancesDiff(b5, b4);
      expect(bd54.totalSupply).eq(800);
      expect(bd54.balanceOfs[2]).eq(800);
      expect(bd54.balanceOfNonRefundables[2]).eq(0);
    });
  });

  describe("transfer", function () {
    it("non mover cannot transfer", async function () {
      await expect(scd.connect(user1).transfer(user1.address, 1)).to.be.revertedWith("!scd mover");
      await expect(scd.connect(user1).transferFrom(user2.address, user1.address, 1)).to.be.revertedWith("!scd mover");
    });
    it("cannot transfer to or from zero address", async function () {
      await expect(scd.connect(scdMover1).transfer(ZERO_ADDRESS, 1)).to.be.revertedWith("SCD: transfer to the zero address");
      await expect(scd.connect(scdMover1).transferFrom(ZERO_ADDRESS, user1.address, 1)).to.be.revertedWith("SCD: transfer from the zero address");
      await expect(scd.connect(scdMover1).transferFrom(user1.address, ZERO_ADDRESS, 1)).to.be.revertedWith("SCD: transfer to the zero address");
    });
    it("cannot transfer more than balance", async function () {
      let bal = await scd.balanceOf(user1.address);
      await expect(scd.connect(scdMover1).transferFrom(user1.address, user2.address, bal.add(1))).to.be.revertedWith("SCD: transfer amount exceeds balance");
    });
    it("transfers", async function () {
      await scd.connect(scdMover1).mint(scdMover1.address, 1000, true);
      let b1 = await getBalances();

      let tx1 = await scd.connect(scdMover1).transfer(user1.address, 100);
      await expect(tx1).to.emit(scd, "Transfer").withArgs(scdMover1.address, user1.address, 100);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(0);
      expect(bd21.balanceOfs[0]).eq(-100);
      expect(bd21.balanceOfNonRefundables[0]).eq(0);
      expect(bd21.balanceOfs[2]).eq(100);
      expect(bd21.balanceOfNonRefundables[2]).eq(0);

      let tx2 = await scd.connect(scdMover1).transferFrom(user1.address, user2.address, 200);
      await expect(tx2).to.emit(scd, "Transfer").withArgs(user1.address, user2.address, 200);
      let b3 = await getBalances();
      let bd32 = getBalancesDiff(b3, b2);
      expect(bd32.totalSupply).eq(0);
      expect(bd32.balanceOfs[2]).eq(-200);
      expect(bd32.balanceOfNonRefundables[2]).eq(-200);
      expect(bd32.balanceOfs[3]).eq(200);
      expect(bd32.balanceOfNonRefundables[3]).eq(200);

      // partly nonrefundable
      let tx3 = await scd.connect(scdMover1).transferFrom(user1.address, user2.address, 400);
      await expect(tx3).to.emit(scd, "Transfer").withArgs(user1.address, user2.address, 400);
      let b4 = await getBalances();
      let bd43 = getBalancesDiff(b4, b3);
      expect(bd43.totalSupply).eq(0);
      expect(bd43.balanceOfs[2]).eq(-400);
      expect(bd43.balanceOfNonRefundables[2]).eq(-300);
      expect(bd43.balanceOfs[3]).eq(400);
      expect(bd43.balanceOfNonRefundables[3]).eq(300);
    });
    it("cannot transfer more than balance", async function () {
      let bal1 = await scd.balanceOf(scdMover1.address);
      await expect(scd.connect(scdMover1).transfer(user2.address, bal1.add(1))).to.be.revertedWith("SCD: transfer amount exceeds balance");
      let bal2 = await scd.balanceOf(user1.address);
      await expect(scd.connect(scdMover1).transferFrom(user1.address, user2.address, bal2.add(1))).to.be.revertedWith("SCD: transfer amount exceeds balance");
    });
  });

  describe("burn", function () {
    it("non mover cannot burn", async function () {
      await expect(scd.connect(user1).burn(user1.address, 1)).to.be.revertedWith("!scd mover");
    });
    it("cannot burn from zero address", async function () {
      await expect(scd.connect(scdMover1).burn(ZERO_ADDRESS, 1)).to.be.revertedWith("SCD: burn from the zero address");
    });
    it("mover can burn", async function () {
      let b1 = await getBalances();

      // fully nonrefundable
      let tx1 = await scd.connect(scdMover1).burn(user2.address, 100);
      await expect(tx1).to.emit(scd, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 100);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(-100);
      expect(bd21.balanceOfs[3]).eq(-100);
      expect(bd21.balanceOfNonRefundables[3]).eq(-100);

      // partly nonrefundable
      let tx2 = await scd.connect(scdMover1).burn(user2.address, 500);
      await expect(tx2).to.emit(scd, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 500);
      let b3 = await getBalances();
      let bd32 = getBalancesDiff(b3, b2);
      expect(bd32.totalSupply).eq(-500);
      expect(bd32.balanceOfs[3]).eq(-500);
      expect(bd32.balanceOfNonRefundables[3]).eq(-400);

      // fully refundable
      let tx3 = await scd.connect(scdMover1).burn(user2.address, 100);
      await expect(tx3).to.emit(scd, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 100);
      let b4 = await getBalances();
      let bd43 = getBalancesDiff(b4, b3);
      expect(bd43.totalSupply).eq(-100);
      expect(bd43.balanceOfs[3]).eq(-100);
      expect(bd43.balanceOfNonRefundables[3]).eq(0);
    });
    it("cannot burn more than balance", async function () {
      let bal = await scd.balanceOf(user1.address);
      await expect(scd.connect(scdMover1).burn(user1.address, bal.add(1))).to.be.revertedWith("SCD: burn amount exceeds balance");
    });
  });

  describe("withdraw", function () {
    it("non mover cannot withdraw", async function () {
      await expect(scd.connect(user1).withdraw(user1.address, 1)).to.be.revertedWith("!scd mover");
    });
    it("cannot withdraw from zero address", async function () {
      await expect(scd.connect(scdMover1).withdraw(ZERO_ADDRESS, 1)).to.be.revertedWith("SCD: withdraw from the zero address");
    });
    it("mover can withdraw", async function () {
      await scd.connect(scdMover1).mint(user2.address, 300, false);
      await scd.connect(scdMover1).mint(user2.address, 300, true);
      let b1 = await getBalances();

      console.log(b1.balanceOfs[2].toString())
      console.log(b1.balanceOfNonRefundables[2].toString())

      console.log(b1.balanceOfs[3].toString())
      console.log(b1.balanceOfNonRefundables[3].toString())

      // fully nonrefundable
      let tx1 = await scd.connect(scdMover1).withdraw(user2.address, 100);
      await expect(tx1).to.emit(scd, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 100);
      let b2 = await getBalances();
      let bd21 = getBalancesDiff(b2, b1);
      expect(bd21.totalSupply).eq(-100);
      expect(bd21.balanceOfs[3]).eq(-100);
      expect(bd21.balanceOfNonRefundables[3]).eq(-100);

      // partly nonrefundable
      let tx2 = await scd.connect(scdMover1).withdraw(user2.address, 300);
      await expect(tx2).to.emit(scd, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 300);
      let b3 = await getBalances();
      let bd32 = getBalancesDiff(b3, b2);
      expect(bd32.totalSupply).eq(-300);
      expect(bd32.balanceOfs[3]).eq(-300);
      expect(bd32.balanceOfNonRefundables[3]).eq(-200);

      // fully refundable
      let tx3 = await scd.connect(scdMover1).withdraw(user2.address, 200);
      await expect(tx3).to.emit(scd, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 200);
      let b4 = await getBalances();
      let bd43 = getBalancesDiff(b4, b3);
      expect(bd43.totalSupply).eq(-200);
      expect(bd43.balanceOfs[3]).eq(-200);
      expect(bd43.balanceOfNonRefundables[3]).eq(0);
    });
    it("cannot withdraw more than balance", async function () {
      let bal = await scd.balanceOf(user1.address);
      await expect(scd.connect(scdMover1).withdraw(user1.address, bal.add(1))).to.be.revertedWith("SCD: withdraw amount exceeds balance");
    });
    it("cannot withdraw to below min", async function () {
      await scdRetainer1.setMinScdRequired(user2.address, 50);
      await scd.connect(scdMover1).withdraw(user2.address, 40);
      await expect(scd.connect(scdMover1).withdraw(user2.address, 40)).to.be.revertedWith("SCD: withdraw to below min");
    });
  });
  /*
  console.log(b2.balanceOfs[2].toString())
  console.log(b2.balanceOfNonRefundables[2].toString())

  console.log(b2.balanceOfs[3].toString())
  console.log(b2.balanceOfNonRefundables[3].toString())
  */

  interface Balances {
    totalSupply: BN;
    balanceOfs: BN[];
    balanceOfNonRefundables: BN[];
  }

  async function getBalances(): Promise<Balances> {
    let balanceOfs = [];
    let balanceOfNonRefundables = [];
    let users = [scdMover1, scdMover2, user1, user2];
    for(var i = 0; i < users.length; ++i) {
      balanceOfs.push(await scd.balanceOf(users[i].address));
      balanceOfNonRefundables.push(await scd.balanceOfNonRefundable(users[i].address));
    }
    return {
      totalSupply: await scd.totalSupply(),
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
