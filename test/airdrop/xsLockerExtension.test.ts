import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet, utils } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Solace, XsLocker, XsLockerExtension } from "./../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

// contracts
let solace: Solace;
let xslocker: XsLocker;
let xslockerextension: XsLockerExtension;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");

describe("xsLockerExtension", function () {
  const [deployer, governor, user1, user2, user3] = provider.getWallets();
  let artifacts: ArtifactImports;
  let snapshot: BN;

  before(async function () {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // Deploy SOLACE
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    await solace.connect(governor).addMinter(governor.address);

    // Deploy xsLocker
    xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
    await expectDeployed(xslocker.address);

  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("reverts if zero solace", async function () {
      await expect(deployContract(deployer, artifacts.xsLockerExtension, [ZERO_ADDRESS, xslocker.address])).to.be.revertedWith("zero address solace");
    });
    it("reverts if zero xslocker", async function () {
      await expect(deployContract(deployer, artifacts.xsLockerExtension, [solace.address, ZERO_ADDRESS])).to.be.revertedWith("zero address xslocker");
    });
    it("deploys", async function () {
      xslockerextension = (await deployContract(deployer, artifacts.xsLockerExtension, [solace.address, xslocker.address])) as XsLockerExtension;
      await expectDeployed(xslockerextension.address);
    });
    it("initializes properly", async function () {
      expect(await xslockerextension.solace()).eq(solace.address);
      expect(await xslockerextension.xslocker()).eq(xslocker.address);
      expect(await solace.allowance(xslockerextension.address, xslocker.address)).eq(constants.MaxUint256);
    });
  });


  describe("increase amount multiple", function () {
    before(async function () {
        // Create locks 1, 2 and 3
        await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
        await solace.connect(user1).approve(xslocker.address, ONE_ETHER.mul(100));
        await xslocker.connect(user1).createLock(user1.address, ONE_ETHER, 0);
        await xslocker.connect(user1).createLock(user2.address, ONE_ETHER, 0);
        await xslocker.connect(user1).createLock(user3.address, ONE_ETHER, 0);
    });
    it("cannot deposit with no balance", async function () {
      const balance = await solace.balanceOf(user1.address)
      await solace.connect(user1).transfer(governor.address, balance);
      await expect(xslockerextension.connect(user1).increaseAmountMultiple([1], [ONE_ETHER])).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit with no allowance", async function () {
      const balance = await solace.balanceOf(governor.address)
      await solace.connect(governor).transfer(user1.address, balance);
      await expect(xslockerextension.connect(user1).increaseAmountMultiple([1], [1])).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("cannot provide mismatched array lengths", async function () {
      await expect(xslockerextension.connect(user1).increaseAmountMultiple([1], [1, 1])).to.be.revertedWith("array length mismatch");
    });
    it("will single refund for non-existent lock", async function () {
      const balance = await solace.balanceOf(user1.address)
      await solace.connect(user1).approve(xslockerextension.address, ONE_ETHER.mul(100));
      let tx = await xslockerextension.connect(user1).increaseAmountMultiple([999], [1])
      await expect(tx).to.emit(xslockerextension, "SolaceNotDistributed").withArgs(999, 1);
      await expect(tx).to.emit(xslockerextension, "SolaceRefunded").withArgs(1);
      // Balance should not change
      expect(balance).eq(await solace.balanceOf(user1.address))
    });
    it("will process multiple deposits", async function () {
      const INITIAL_USER1_BALANCE = await solace.balanceOf(user1.address)
      const INITIAL_XSLOCKER_BALANCE = await solace.balanceOf(xslocker.address)
      const AMOUNT1 = ONE_ETHER;
      const AMOUNT2 = ONE_ETHER.mul(2);
      const AMOUNT3 = ONE_ETHER.mul(3);

      let tx = await xslockerextension.connect(user1).increaseAmountMultiple([1, 2, 3], [AMOUNT1, AMOUNT2, AMOUNT3]);
      let lock1 = await xslocker.locks(1)
      let lock2 = await xslocker.locks(2)
      let lock3 = await xslocker.locks(3)

      await expect(tx).to.emit(xslockerextension, "SolaceDistributed").withArgs(1, AMOUNT1);
      await expect(tx).to.emit(xslockerextension, "SolaceDistributed").withArgs(2, AMOUNT2);
      await expect(tx).to.emit(xslockerextension, "SolaceDistributed").withArgs(3, AMOUNT3);

      await expect(tx).to.emit(xslocker, "LockUpdated").withArgs(1, lock1.amount, lock1.end);
      await expect(tx).to.emit(xslocker, "LockUpdated").withArgs(2, lock2.amount, lock2.end);
      await expect(tx).to.emit(xslocker, "LockUpdated").withArgs(3, lock3.amount, lock3.end);

      await expect(tx).to.emit(solace, "Transfer").withArgs(xslockerextension.address, xslocker.address, AMOUNT1);
      await expect(tx).to.emit(solace, "Transfer").withArgs(xslockerextension.address, xslocker.address, AMOUNT2);
      await expect(tx).to.emit(solace, "Transfer").withArgs(xslockerextension.address, xslocker.address, AMOUNT3);

      expect (await solace.balanceOf(user1.address)).eq(INITIAL_USER1_BALANCE.sub(AMOUNT1).sub(AMOUNT2).sub(AMOUNT3))
      expect (await solace.balanceOf(xslocker.address)).eq((AMOUNT1).add(AMOUNT2).add(AMOUNT3).add(INITIAL_XSLOCKER_BALANCE))
    });
    it("will properly process multiple deposits and multiple refunds", async function () {
      const INITIAL_USER1_BALANCE = await solace.balanceOf(user1.address)
      const INITIAL_XSLOCKER_BALANCE = await solace.balanceOf(xslocker.address)
      const AMOUNT1 = ONE_ETHER;
      const AMOUNT2 = ONE_ETHER.mul(2);
      const AMOUNT3 = ONE_ETHER.mul(3);
      const AMOUNT4 = ONE_ETHER.mul(4);

      let tx = await xslockerextension.connect(user1).increaseAmountMultiple([1, 900, 3, 300], [AMOUNT1, AMOUNT2, AMOUNT3, AMOUNT4]);
      let lock1 = await xslocker.locks(1)
      let lock3 = await xslocker.locks(3)

      await expect(tx).to.emit(xslockerextension, "SolaceDistributed").withArgs(1, AMOUNT1);
      await expect(tx).to.emit(xslockerextension, "SolaceDistributed").withArgs(3, AMOUNT3);

      await expect(tx).to.emit(xslockerextension, "SolaceNotDistributed").withArgs(900, AMOUNT2);
      await expect(tx).to.emit(xslockerextension, "SolaceNotDistributed").withArgs(300, AMOUNT4);

      await expect(tx).to.emit(xslocker, "LockUpdated").withArgs(1, lock1.amount, lock1.end);
      await expect(tx).to.emit(xslocker, "LockUpdated").withArgs(3, lock3.amount, lock3.end);

      await expect(tx).to.emit(solace, "Transfer").withArgs(xslockerextension.address, xslocker.address, AMOUNT1);
      await expect(tx).to.emit(solace, "Transfer").withArgs(xslockerextension.address, xslocker.address, AMOUNT3);

      await expect(tx).to.emit(xslockerextension, "SolaceRefunded").withArgs(AMOUNT2.add(AMOUNT4));

      expect (await solace.balanceOf(user1.address)).eq(INITIAL_USER1_BALANCE.sub(AMOUNT1).sub(AMOUNT3))
      expect (await solace.balanceOf(xslocker.address)).eq((AMOUNT1).add(AMOUNT3).add(INITIAL_XSLOCKER_BALANCE))
    })
  });

});
