import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet, utils } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { getERC20PermitSignature } from "./../utilities/getERC20PermitSignature";

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Solace, XsLocker, MockListener } from "./../../typechain";

// contracts
let solace: Solace;
let xslocker: XsLocker;
let listener1: MockListener;
let listener2: MockListener;
let listener3: MockListener;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_YEAR = 31536000; // in seconds
const ONE_WEEK = 604800; // in seconds

const TOKEN_NAME = "xsolace lock";
const TOKEN_SYMBOL = "xsLOCK";
const chainId = 31337;
const deadline = constants.MaxUint256;

describe("xsLocker", function () {
  const [deployer, governor, user1, user2, user3] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    await solace.connect(governor).addMinter(governor.address);

    listener1 = (await deployContract(deployer, artifacts.MockListener)) as MockListener;
    listener2 = (await deployContract(deployer, artifacts.MockListener)) as MockListener;
    listener3 = (await deployContract(deployer, artifacts.MockListener)) as MockListener;
  });

  describe("deployment", function () {
    it("reverts if zero governance", async function () {
      await expect(deployContract(deployer, artifacts.xsLocker, [ZERO_ADDRESS, solace.address])).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero solace", async function () {
      await expect(deployContract(deployer, artifacts.xsLocker, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address solace");
    });
    it("deploys", async function () {
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
    });
    it("initializes properly", async function () {
      expect(await xslocker.MAX_LOCK_DURATION()).eq(60*60*24*365*4);
      expect(await xslocker.solace()).eq(solace.address);
      expect(await xslocker.totalNumLocks()).eq(0);
      expect(await xslocker.name()).eq(TOKEN_NAME);
      expect(await xslocker.symbol()).eq(TOKEN_SYMBOL);
      await expect(xslocker.locks(0)).to.be.revertedWith("query for nonexistent token");
      expect(await xslocker.stakedBalance(user1.address)).eq(0);
      expect(await xslocker.getXsLockListeners()).deep.eq([]);
      expect(await xslocker.balanceOf(user1.address)).eq(0);
      expect(await xslocker.totalSupply()).eq(0);
      expect(await xslocker.totalNumLocks()).eq(0);
    });
  });

  describe("create lock", function () {
    it("cannot deposit with no balance", async function () {
      await expect(xslocker.connect(user1).createLock(user2.address, 1, 0)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit with no allowance", async function () {
      await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(10));
      await expect(xslocker.connect(user1).createLock(user2.address, 1, 0)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("cannot deposit over max duration", async function () {
      await solace.connect(user1).approve(xslocker.address, ONE_ETHER.mul(10));
      await provider.send("evm_mine", []);
      let timestamp = (await provider.getBlock('latest')).timestamp + ONE_YEAR*4 + ONE_WEEK;
      await expect(xslocker.connect(user1).createLock(user2.address, 1, timestamp)).to.be.revertedWith("Max lock is 4 years");
    });
    it("can deposit unlocked", async function () {
      let depositAmount = ONE_ETHER;
      let balancesBefore = await getBalances();
      let tx = await xslocker.connect(user1).createLock(user2.address, depositAmount, 0);
      let xsLockID = await xslocker.totalNumLocks();
      expect(xsLockID).eq(1);
      expect(tx).to.emit(xslocker, "LockCreated").withArgs(xsLockID);
      expect(tx).to.emit(xslocker, "Transfer").withArgs(ZERO_ADDRESS, user2.address, xsLockID)
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user1Solace).eq(depositAmount.mul(-1));
      expect(balancesDiff.user1StakedSolace).eq(0);
      expect(balancesDiff.user2Solace).eq(0);
      expect(balancesDiff.user2StakedSolace).eq(depositAmount);
      expect(balancesDiff.totalStakedSolace).eq(depositAmount);
      expect(balancesDiff.user1Locks).eq(0);
      expect(balancesDiff.user2Locks).eq(1);
      expect(balancesDiff.totalNumLocks).eq(1);
      expect(balancesDiff.totalSupply).eq(1);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(depositAmount);
      expect(lock.end).eq(0);
      expect(await xslocker.ownerOf(xsLockID)).eq(user2.address);
    });
    it("can deposit locked", async function () {
      let depositAmount = ONE_ETHER.mul(2);
      await provider.send("evm_mine", []);
      let timestamp = (await provider.getBlock('latest')).timestamp + ONE_WEEK*2;
      let balancesBefore = await getBalances();
      let tx = await xslocker.connect(user1).createLock(user2.address, depositAmount, timestamp);
      let xsLockID = await xslocker.totalNumLocks();
      expect(xsLockID).eq(2);
      expect(tx).to.emit(xslocker, "LockCreated").withArgs(xsLockID);
      expect(tx).to.emit(xslocker, "Transfer").withArgs(ZERO_ADDRESS, user2.address, xsLockID)
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user1Solace).eq(depositAmount.mul(-1));
      expect(balancesDiff.user1StakedSolace).eq(0);
      expect(balancesDiff.user2Solace).eq(0);
      expect(balancesDiff.user2StakedSolace).eq(depositAmount);
      expect(balancesDiff.totalStakedSolace).eq(depositAmount);
      expect(balancesDiff.user1Locks).eq(0);
      expect(balancesDiff.user2Locks).eq(1);
      expect(balancesDiff.totalNumLocks).eq(1);
      expect(balancesDiff.totalSupply).eq(1);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(depositAmount);
      expect(lock.end).eq(timestamp);
      expect(await xslocker.ownerOf(xsLockID)).eq(user2.address);
    });
  });

  describe("create lock signed", function () {
    it("cannot deposit with no balance", async function () {
      let { v, r, s } = await getERC20PermitSignature(user3, xslocker.address, solace, 1, deadline);
      await expect(xslocker.connect(user3).createLockSigned(1, 0, deadline, v, r, s)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit with invalid permit", async function () {
      await solace.connect(governor).mint(user3.address, ONE_ETHER.mul(10));
      let { v, r, s } = await getERC20PermitSignature(user3, xslocker.address, solace, 1, deadline);
      await expect(xslocker.connect(user3).createLockSigned(2, 0, deadline, v, r, s)).to.be.revertedWith("ERC20Permit: invalid signature");
    });
    it("cannot deposit over max duration", async function () {
      let { v, r, s } = await getERC20PermitSignature(user3, xslocker.address, solace, 1, deadline);
      await provider.send("evm_mine", []);
      let timestamp = (await provider.getBlock('latest')).timestamp + ONE_YEAR*4 + ONE_WEEK;
      await expect(xslocker.connect(user3).createLockSigned(1, timestamp, deadline, v, r, s)).to.be.revertedWith("Max lock is 4 years");
    });
    it("can deposit signed unlocked", async function () {
      let depositAmount = ONE_ETHER;
      let balancesBefore = await getBalances();
      let { v, r, s } = await getERC20PermitSignature(user3, xslocker.address, solace, depositAmount, deadline);
      await provider.send("evm_mine", []);
      let tx = await xslocker.connect(user3).createLockSigned(depositAmount, 0, deadline, v, r, s);
      let xsLockID = await xslocker.totalNumLocks();
      expect(xsLockID).eq(3);
      expect(tx).to.emit(xslocker, "LockCreated").withArgs(xsLockID);
      expect(tx).to.emit(xslocker, "Transfer").withArgs(ZERO_ADDRESS, user3.address, xsLockID)
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user3Solace).eq(depositAmount.mul(-1));
      expect(balancesDiff.user3StakedSolace).eq(depositAmount);
      expect(balancesDiff.totalStakedSolace).eq(depositAmount);
      expect(balancesDiff.user3Locks).eq(1);
      expect(balancesDiff.totalNumLocks).eq(1);
      expect(balancesDiff.totalSupply).eq(1);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(depositAmount);
      expect(lock.end).eq(0);
      expect(await xslocker.ownerOf(xsLockID)).eq(user3.address);
    });
    it("can deposit signed locked", async function () {
      let depositAmount = ONE_ETHER;
      let balancesBefore = await getBalances();
      let { v, r, s } = await getERC20PermitSignature(user3, xslocker.address, solace, depositAmount, deadline);
      await provider.send("evm_mine", []);
      let timestamp = (await provider.getBlock('latest')).timestamp + ONE_WEEK*2;
      let tx = await xslocker.connect(user3).createLockSigned(depositAmount, timestamp, deadline, v, r, s);
      let xsLockID = await xslocker.totalNumLocks();
      expect(xsLockID).eq(4);
      expect(tx).to.emit(xslocker, "LockCreated").withArgs(xsLockID);
      expect(tx).to.emit(xslocker, "Transfer").withArgs(ZERO_ADDRESS, user3.address, xsLockID)
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user3Solace).eq(depositAmount.mul(-1));
      expect(balancesDiff.user3StakedSolace).eq(depositAmount);
      expect(balancesDiff.totalStakedSolace).eq(depositAmount);
      expect(balancesDiff.user3Locks).eq(1);
      expect(balancesDiff.totalNumLocks).eq(1);
      expect(balancesDiff.totalSupply).eq(1);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(depositAmount);
      expect(lock.end).eq(timestamp);
      expect(await xslocker.ownerOf(xsLockID)).eq(user3.address);
    });
  });

  describe("increase amount", function () {
    it("cannot deposit to non existant lock", async function () {
      await expect(xslocker.connect(user1).increaseAmount(999, 1)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot deposit with no balance", async function () {
      await solace.connect(user1).transfer(governor.address, await solace.balanceOf(user1.address));
      await expect(xslocker.connect(user1).increaseAmount(1, 1)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit with no allowance", async function () {
      await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(10));
      await solace.connect(user1).approve(xslocker.address, 0);
      await expect(xslocker.connect(user1).increaseAmount(1, 1)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("can deposit", async function () {
      let depositAmount = ONE_ETHER.mul(2);
      let expectedAmount = ONE_ETHER.mul(3);
      let balancesBefore = await getBalances();
      let xsLockID = 1;
      await solace.connect(user1).approve(xslocker.address, ONE_ETHER.mul(10));
      let tx = await xslocker.connect(user1).increaseAmount(xsLockID, depositAmount);
      expect(tx).to.emit(xslocker, "LockUpdated").withArgs(xsLockID, expectedAmount, 0);
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user1Solace).eq(depositAmount.mul(-1));
      expect(balancesDiff.user1StakedSolace).eq(0);
      expect(balancesDiff.user2Solace).eq(0);
      expect(balancesDiff.user2StakedSolace).eq(depositAmount);
      expect(balancesDiff.totalStakedSolace).eq(depositAmount);
      expect(balancesDiff.user1Locks).eq(0);
      expect(balancesDiff.user2Locks).eq(0);
      expect(balancesDiff.totalNumLocks).eq(0);
      expect(balancesDiff.totalSupply).eq(0);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(expectedAmount);
      expect(lock.end).eq(0);
      expect(await xslocker.ownerOf(xsLockID)).eq(user2.address);
    });
  });

  describe("increase amount signed", function () {
    it("cannot deposit to non existant lock", async function () {
      let { v, r, s } = await getERC20PermitSignature(user3, xslocker.address, solace, 1, deadline);
      await expect(xslocker.connect(user3).increaseAmountSigned(999, 1, deadline, v, r, s)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot deposit with no balance", async function () {
      let { v, r, s } = await getERC20PermitSignature(user3, xslocker.address, solace, 1, deadline);
      await solace.connect(user3).transfer(governor.address, await solace.balanceOf(user3.address));
      await expect(xslocker.connect(user3).increaseAmountSigned(1, 1, deadline, v, r, s)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit with invalid permit", async function () {
      let { v, r, s } = await getERC20PermitSignature(user3, xslocker.address, solace, 1, deadline);
      await solace.connect(governor).mint(user3.address, ONE_ETHER.mul(10));
      await expect(xslocker.connect(user3).increaseAmountSigned(1, 2, deadline, v, r, s)).to.be.revertedWith("ERC20Permit: invalid signature");
    });
    it("can deposit", async function () {
      let depositAmount = ONE_ETHER.mul(2);
      let expectedAmount = ONE_ETHER.mul(3);
      let balancesBefore = await getBalances();
      let { v, r, s } = await getERC20PermitSignature(user3, xslocker.address, solace, depositAmount, deadline);
      await provider.send("evm_mine", []);
      let xsLockID = 3;
      await solace.connect(user3).approve(xslocker.address, ONE_ETHER.mul(10));
      let tx = await xslocker.connect(user3).increaseAmountSigned(xsLockID, depositAmount, deadline, v, r, s);
      expect(tx).to.emit(xslocker, "LockUpdated").withArgs(xsLockID, expectedAmount, 0);
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user3Solace).eq(depositAmount.mul(-1));
      expect(balancesDiff.user3StakedSolace).eq(depositAmount);
      expect(balancesDiff.totalStakedSolace).eq(depositAmount);
      expect(balancesDiff.user3Locks).eq(0);
      expect(balancesDiff.totalNumLocks).eq(0);
      expect(balancesDiff.totalSupply).eq(0);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(expectedAmount);
      expect(lock.end).eq(0);
      expect(await xslocker.ownerOf(xsLockID)).eq(user3.address);
    });
  });

  describe("withdraw in full", function () {
    before("create more locks", async function () {
      await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
      await solace.connect(user1).approve(xslocker.address, ONE_ETHER.mul(100));
      await xslocker.connect(user1).setApprovalForAll(user3.address, false);
      await provider.send("evm_mine", []);
      let timestamp = (await provider.getBlock('latest')).timestamp;
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER, 0); // 5
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_WEEK*2); // 6
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(3), 0); // 7
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(4), 0); // 8
    });
    it("cannot withdraw non existant token", async function () {
      await expect(xslocker.connect(user1).withdraw(999, user1.address)).to.be.revertedWith("query for nonexistent token")
    });
    it("cannot withdraw not your token", async function () {
      await expect(xslocker.connect(user2).withdraw(5, user1.address)).to.be.revertedWith("only owner or approved")
    });
    it("cannot withdraw locked token", async function () {
      await expect(xslocker.connect(user1).withdraw(6, user1.address)).to.be.revertedWith("locked")
    });
    it("can withdraw never locked token", async function () {
      let xsLockID = 5;
      let balancesBefore = await getBalances();
      let amount = (await xslocker.locks(xsLockID)).amount;
      let tx = await xslocker.connect(user1).withdraw(xsLockID, user2.address);
      expect(tx).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, amount);
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1StakedSolace).eq(amount.mul(-1));
      expect(balancesDiff.user2Solace).eq(amount);
      expect(balancesDiff.user2StakedSolace).eq(0);
      expect(balancesDiff.totalStakedSolace).eq(amount.mul(-1));
      expect(balancesDiff.user1Locks).eq(-1);
      expect(balancesDiff.user2Locks).eq(0);
      expect(balancesDiff.totalNumLocks).eq(0);
      expect(balancesDiff.totalSupply).eq(-1);
      await expect(xslocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
    });
    it("can withdraw after lock expiration", async function () {
      let xsLockID = 6;
      let balancesBefore = await getBalances();
      let end = (await xslocker.locks(xsLockID)).end.toNumber();
      await provider.send("evm_setNextBlockTimestamp", [end]);
      await provider.send("evm_mine", []);
      let amount = (await xslocker.locks(xsLockID)).amount;
      let tx = await xslocker.connect(user1).withdraw(xsLockID, user2.address);
      expect(tx).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, amount);
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1StakedSolace).eq(amount.mul(-1));
      expect(balancesDiff.user2Solace).eq(amount);
      expect(balancesDiff.user2StakedSolace).eq(0);
      expect(balancesDiff.totalStakedSolace).eq(amount.mul(-1));
      expect(balancesDiff.user1Locks).eq(-1);
      expect(balancesDiff.user2Locks).eq(0);
      expect(balancesDiff.totalNumLocks).eq(0);
      expect(balancesDiff.totalSupply).eq(-1);
      await expect(xslocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
    });
    it("can withdraw if approved for one", async function () {
      let xsLockID = 7;
      let balancesBefore = await getBalances();
      await xslocker.connect(user1).approve(user3.address, xsLockID);
      let amount = (await xslocker.locks(xsLockID)).amount;
      let tx = await xslocker.connect(user3).withdraw(xsLockID, user2.address);
      expect(tx).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, amount);
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1StakedSolace).eq(amount.mul(-1));
      expect(balancesDiff.user2Solace).eq(amount);
      expect(balancesDiff.user2StakedSolace).eq(0);
      expect(balancesDiff.user3Solace).eq(0);
      expect(balancesDiff.user3StakedSolace).eq(0);
      expect(balancesDiff.totalStakedSolace).eq(amount.mul(-1));
      expect(balancesDiff.user1Locks).eq(-1);
      expect(balancesDiff.user2Locks).eq(0);
      expect(balancesDiff.user3Locks).eq(0);
      expect(balancesDiff.totalNumLocks).eq(0);
      expect(balancesDiff.totalSupply).eq(-1);
      await expect(xslocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
    });
    it("can withdraw if approved for all", async function () {
      let xsLockID = 8;
      let balancesBefore = await getBalances();
      await xslocker.connect(user1).setApprovalForAll(user3.address, true);
      let amount = (await xslocker.locks(xsLockID)).amount;
      let tx = await xslocker.connect(user3).withdraw(xsLockID, user2.address);
      expect(tx).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, amount);
      let balancesAfter = await getBalances();
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1StakedSolace).eq(amount.mul(-1));
      expect(balancesDiff.user2Solace).eq(amount);
      expect(balancesDiff.user2StakedSolace).eq(0);
      expect(balancesDiff.user3Solace).eq(0);
      expect(balancesDiff.user3StakedSolace).eq(0);
      expect(balancesDiff.totalStakedSolace).eq(amount.mul(-1));
      expect(balancesDiff.user1Locks).eq(-1);
      expect(balancesDiff.user2Locks).eq(0);
      expect(balancesDiff.user3Locks).eq(0);
      expect(balancesDiff.totalNumLocks).eq(0);
      expect(balancesDiff.totalSupply).eq(-1);
      await expect(xslocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
    });
  });

  describe("withdraw in part", function () {
    before("create more locks", async function () {
      await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
      await solace.connect(user1).approve(xslocker.address, ONE_ETHER.mul(100));
      await xslocker.connect(user1).setApprovalForAll(user3.address, false);
      await provider.send("evm_mine", []);
      let timestamp = (await provider.getBlock('latest')).timestamp;
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER, 0); // 9
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_WEEK*2); // 10
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(3), 0); // 11
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(4), 0); // 12
    });
    it("cannot withdraw non existant token", async function () {
      await expect(xslocker.connect(user1).withdrawInPart(999, user1.address, 1)).to.be.revertedWith("query for nonexistent token")
    });
    it("cannot withdraw not your token", async function () {
      await expect(xslocker.connect(user2).withdrawInPart(9, user1.address, 1)).to.be.revertedWith("only owner or approved")
    });
    it("cannot withdraw locked token", async function () {
      await expect(xslocker.connect(user1).withdrawInPart(10, user1.address, 1)).to.be.revertedWith("locked")
    });
    it("cannot withdraw in excess", async function () {
      await expect(xslocker.connect(user1).withdrawInPart(9, user1.address, ONE_ETHER.mul(2).add(1))).to.be.revertedWith("excess withdraw")
    });
    it("can withdraw never locked token", async function () {
      // in part
      let xsLockID = 9;
      let amount = (await xslocker.locks(xsLockID)).amount;
      let withdrawAmount1 = amount.div(3);
      let withdrawAmount2 = amount.sub(withdrawAmount1);
      let balances1 = await getBalances();
      let tx1 = await xslocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount1);
      expect(tx1).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, withdrawAmount1);
      let balances2 = await getBalances();
      let balances12 = getBalancesDiff(balances2, balances1);
      expect(balances12.user1Solace).eq(0);
      expect(balances12.user1StakedSolace).eq(withdrawAmount1.mul(-1));
      expect(balances12.user2Solace).eq(withdrawAmount1);
      expect(balances12.user2StakedSolace).eq(0);
      expect(balances12.totalStakedSolace).eq(withdrawAmount1.mul(-1));
      expect(balances12.user1Locks).eq(0);
      expect(balances12.user2Locks).eq(0);
      expect(balances12.totalNumLocks).eq(0);
      expect(balances12.totalSupply).eq(0);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(withdrawAmount2);
      expect(lock.end).eq(0);
      // in full
      let tx2 = await xslocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount2);
      expect(tx2).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, withdrawAmount2);
      let balances3 = await getBalances();
      let balances23 = getBalancesDiff(balances3, balances2);
      expect(balances23.user1Solace).eq(0);
      expect(balances23.user1StakedSolace).eq(withdrawAmount2.mul(-1));
      expect(balances23.user2Solace).eq(withdrawAmount2);
      expect(balances23.user2StakedSolace).eq(0);
      expect(balances23.totalStakedSolace).eq(withdrawAmount2.mul(-1));
      expect(balances23.user1Locks).eq(-1);
      expect(balances23.user2Locks).eq(0);
      expect(balances23.totalNumLocks).eq(0);
      expect(balances23.totalSupply).eq(-1);
      await expect(xslocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
    });
    it("can withdraw after lock expiration", async function () {
      // in part
      let xsLockID = 10;
      let end = (await xslocker.locks(xsLockID)).end.toNumber();
      await provider.send("evm_setNextBlockTimestamp", [end]);
      await provider.send("evm_mine", []);
      let amount = (await xslocker.locks(xsLockID)).amount;
      let withdrawAmount1 = amount.div(3);
      let withdrawAmount2 = amount.sub(withdrawAmount1);
      let balances1 = await getBalances();
      let tx1 = await xslocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount1);
      expect(tx1).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, withdrawAmount1);
      let balances2 = await getBalances();
      let balances12 = getBalancesDiff(balances2, balances1);
      expect(balances12.user1Solace).eq(0);
      expect(balances12.user1StakedSolace).eq(withdrawAmount1.mul(-1));
      expect(balances12.user2Solace).eq(withdrawAmount1);
      expect(balances12.user2StakedSolace).eq(0);
      expect(balances12.totalStakedSolace).eq(withdrawAmount1.mul(-1));
      expect(balances12.user1Locks).eq(0);
      expect(balances12.user2Locks).eq(0);
      expect(balances12.totalNumLocks).eq(0);
      expect(balances12.totalSupply).eq(0);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(withdrawAmount2);
      expect(lock.end).eq(end);
      // in full
      let tx2 = await xslocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount2);
      expect(tx2).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, withdrawAmount2);
      let balances3 = await getBalances();
      let balances23 = getBalancesDiff(balances3, balances2);
      expect(balances23.user1Solace).eq(0);
      expect(balances23.user1StakedSolace).eq(withdrawAmount2.mul(-1));
      expect(balances23.user2Solace).eq(withdrawAmount2);
      expect(balances23.user2StakedSolace).eq(0);
      expect(balances23.totalStakedSolace).eq(withdrawAmount2.mul(-1));
      expect(balances23.user1Locks).eq(-1);
      expect(balances23.user2Locks).eq(0);
      expect(balances23.totalNumLocks).eq(0);
      expect(balances23.totalSupply).eq(-1);
      await expect(xslocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
    });
    it("can withdraw if approved for one", async function () {
      // in part
      let xsLockID = 11;
      await xslocker.connect(user1).approve(user3.address, xsLockID);
      let amount = (await xslocker.locks(xsLockID)).amount;
      let withdrawAmount1 = amount.div(3);
      let withdrawAmount2 = amount.sub(withdrawAmount1);
      let balances1 = await getBalances();
      let tx1 = await xslocker.connect(user3).withdrawInPart(xsLockID, user2.address, withdrawAmount1);
      expect(tx1).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, withdrawAmount1);
      let balances2 = await getBalances();
      let balances12 = getBalancesDiff(balances2, balances1);
      expect(balances12.user1Solace).eq(0);
      expect(balances12.user1StakedSolace).eq(withdrawAmount1.mul(-1));
      expect(balances12.user2Solace).eq(withdrawAmount1);
      expect(balances12.user2StakedSolace).eq(0);
      expect(balances12.user3Solace).eq(0);
      expect(balances12.user3StakedSolace).eq(0);
      expect(balances12.totalStakedSolace).eq(withdrawAmount1.mul(-1));
      expect(balances12.user1Locks).eq(0);
      expect(balances12.user2Locks).eq(0);
      expect(balances12.user3Locks).eq(0);
      expect(balances12.totalNumLocks).eq(0);
      expect(balances12.totalSupply).eq(0);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(withdrawAmount2);
      expect(lock.end).eq(0);
      // in full
      let tx2 = await xslocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount2);
      expect(tx2).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, withdrawAmount2);
      let balances3 = await getBalances();
      let balances23 = getBalancesDiff(balances3, balances2);
      expect(balances23.user1Solace).eq(0);
      expect(balances23.user1StakedSolace).eq(withdrawAmount2.mul(-1));
      expect(balances23.user2Solace).eq(withdrawAmount2);
      expect(balances23.user2StakedSolace).eq(0);
      expect(balances23.user3Solace).eq(0);
      expect(balances23.user3StakedSolace).eq(0);
      expect(balances23.totalStakedSolace).eq(withdrawAmount2.mul(-1));
      expect(balances23.user1Locks).eq(-1);
      expect(balances23.user2Locks).eq(0);
      expect(balances23.user3Locks).eq(0);
      expect(balances23.totalNumLocks).eq(0);
      expect(balances23.totalSupply).eq(-1);
      await expect(xslocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
    });
    it("can withdraw if approved for all", async function () {
      // in part
      let xsLockID = 12;
      await xslocker.connect(user1).setApprovalForAll(user3.address, true);
      let amount = (await xslocker.locks(xsLockID)).amount;
      let withdrawAmount1 = amount.div(3);
      let withdrawAmount2 = amount.sub(withdrawAmount1);
      let balances1 = await getBalances();
      let tx1 = await xslocker.connect(user3).withdrawInPart(xsLockID, user2.address, withdrawAmount1);
      expect(tx1).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, withdrawAmount1);
      let balances2 = await getBalances();
      let balances12 = getBalancesDiff(balances2, balances1);
      expect(balances12.user1Solace).eq(0);
      expect(balances12.user1StakedSolace).eq(withdrawAmount1.mul(-1));
      expect(balances12.user2Solace).eq(withdrawAmount1);
      expect(balances12.user2StakedSolace).eq(0);
      expect(balances12.user3Solace).eq(0);
      expect(balances12.user3StakedSolace).eq(0);
      expect(balances12.totalStakedSolace).eq(withdrawAmount1.mul(-1));
      expect(balances12.user1Locks).eq(0);
      expect(balances12.user2Locks).eq(0);
      expect(balances12.user3Locks).eq(0);
      expect(balances12.totalNumLocks).eq(0);
      expect(balances12.totalSupply).eq(0);
      let lock = await xslocker.locks(xsLockID);
      expect(lock.amount).eq(withdrawAmount2);
      expect(lock.end).eq(0);
      // in full
      let tx2 = await xslocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount2);
      expect(tx2).to.emit(xslocker, "Withdrawl").withArgs(xsLockID, withdrawAmount2);
      let balances3 = await getBalances();
      let balances23 = getBalancesDiff(balances3, balances2);
      expect(balances23.user1Solace).eq(0);
      expect(balances23.user1StakedSolace).eq(withdrawAmount2.mul(-1));
      expect(balances23.user2Solace).eq(withdrawAmount2);
      expect(balances23.user2StakedSolace).eq(0);
      expect(balances23.user3Solace).eq(0);
      expect(balances23.user3StakedSolace).eq(0);
      expect(balances23.totalStakedSolace).eq(withdrawAmount2.mul(-1));
      expect(balances23.user1Locks).eq(-1);
      expect(balances23.user2Locks).eq(0);
      expect(balances23.user3Locks).eq(0);
      expect(balances23.totalNumLocks).eq(0);
      expect(balances23.totalSupply).eq(-1);
      await expect(xslocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
    });
  });

  describe("withdraw multiple", function () {
    before("create more locks", async function () {
      await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
      await solace.connect(user1).approve(xslocker.address, ONE_ETHER.mul(100));
      await xslocker.connect(user1).setApprovalForAll(user3.address, false);
      await provider.send("evm_mine", []);
      let timestamp = (await provider.getBlock('latest')).timestamp;
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER, 0); // 13
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_WEEK*2); // 14
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(3), 0); // 15
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(4), 0); // 16
    });
    it("can withdraw none", async function () {
      let balances1 = await getBalances();
      await xslocker.connect(user1).withdrawMany([], user1.address);
      let balances2 = await getBalances();
      let balances12 = getBalancesDiff(balances2, balances1);
      expect(balances12.user1Solace).eq(0);
      expect(balances12.user1StakedSolace).eq(0);
      expect(balances12.user2Solace).eq(0);
      expect(balances12.user2StakedSolace).eq(0);
      expect(balances12.user3Solace).eq(0);
      expect(balances12.user3StakedSolace).eq(0);
      expect(balances12.totalStakedSolace).eq(0);
      expect(balances12.user1Locks).eq(0);
      expect(balances12.user2Locks).eq(0);
      expect(balances12.user3Locks).eq(0);
      expect(balances12.totalNumLocks).eq(0);
      expect(balances12.totalSupply).eq(0);
    });
    it("cannot withdraw multiple if one fails", async function () {
      await expect(xslocker.connect(user1).withdrawMany([999], user1.address)).to.be.revertedWith("query for nonexistent token");
      await expect(xslocker.connect(user2).withdrawMany([13], user1.address)).to.be.revertedWith("only owner or approved");
      await expect(xslocker.connect(user1).withdrawMany([14], user1.address)).to.be.revertedWith("locked");
    });
    it("can withdraw multiple", async function () {
      let end = (await xslocker.locks(14)).end.toNumber();
      await provider.send("evm_setNextBlockTimestamp", [end]);
      await provider.send("evm_mine", []);
      let expectedAmount = ONE_ETHER.mul(6);
      let balances1 = await getBalances();
      await xslocker.connect(user1).withdrawMany([13, 14, 15], user2.address);
      let balances2 = await getBalances();
      let balances12 = getBalancesDiff(balances2, balances1);
      expect(balances12.user1Solace).eq(0);
      expect(balances12.user1StakedSolace).eq(expectedAmount.mul(-1));
      expect(balances12.user2Solace).eq(expectedAmount);
      expect(balances12.user2StakedSolace).eq(0);
      expect(balances12.user3Solace).eq(0);
      expect(balances12.user3StakedSolace).eq(0);
      expect(balances12.totalStakedSolace).eq(expectedAmount.mul(-1));
      expect(balances12.user1Locks).eq(-3);
      expect(balances12.user2Locks).eq(0);
      expect(balances12.user3Locks).eq(0);
      expect(balances12.totalNumLocks).eq(0);
      expect(balances12.totalSupply).eq(-3);
      await expect(xslocker.locks(13)).to.be.revertedWith("query for nonexistent token");
      await expect(xslocker.locks(14)).to.be.revertedWith("query for nonexistent token");
      await expect(xslocker.locks(15)).to.be.revertedWith("query for nonexistent token");
    });
  });

  describe("extend lock", function () {
    before("create more locks", async function () {
      await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
      await solace.connect(user1).approve(xslocker.address, ONE_ETHER.mul(100));
      await xslocker.connect(user1).setApprovalForAll(user3.address, false);
      await provider.send("evm_mine", []);
      let timestamp = (await provider.getBlock('latest')).timestamp;
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER, 0); // 17
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_WEEK*2); // 18
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(3), 0); // 19
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(4), 0); // 20
    });
    it("cannot extend non existant lock", async function () {
      await expect(xslocker.connect(user1).extendLock(999, 1)).to.be.revertedWith("ERC721: operator query for nonexistent token");
    });
    it("cannot extend not your lock", async function () {
      await expect(xslocker.connect(user2).extendLock(17, 1)).to.be.revertedWith("only owner or approved");
    });
    it("cannot extend over four years", async function () {
      let timestamp = (await provider.getBlock('latest')).timestamp;
      await expect(xslocker.connect(user1).extendLock(17, timestamp+ONE_YEAR*4+ONE_WEEK)).to.be.revertedWith("Max lock is 4 years");
    });
    it("cannot take time off", async function () {
      let end = (await xslocker.locks(18)).end;
      await expect(xslocker.connect(user1).extendLock(18, end.sub(1))).to.be.revertedWith("not extended");
    });
    it("can extend lock", async function () {
      let xsLockID = 18;
      let lock1 = await xslocker.locks(xsLockID);
      let newEnd = lock1.end.add(ONE_YEAR);
      let tx = await xslocker.connect(user1).extendLock(xsLockID, newEnd);
      expect(tx).to.emit(xslocker, "LockUpdated").withArgs(xsLockID, lock1.amount, newEnd);
      let lock2 = await xslocker.locks(xsLockID);
      expect(lock2.amount).eq(lock1.amount);
      expect(lock2.end).eq(newEnd);
    });
    it("can extend lock from unlock", async function () {
      // extend to another time in the past
      let xsLockID = 17;
      let lock1 = await xslocker.locks(xsLockID);
      let newEnd2 = lock1.end.add(ONE_YEAR * 20);
      let tx2 = await xslocker.connect(user1).extendLock(xsLockID, newEnd2);
      expect(tx2).to.emit(xslocker, "LockUpdated").withArgs(xsLockID, lock1.amount, newEnd2);
      let lock3 = await xslocker.locks(xsLockID);
      expect(lock3.amount).eq(lock1.amount);
      expect(lock3.end).eq(newEnd2);
      // extend to some time in the future
      let newEnd3 = (await provider.getBlock('latest')).timestamp + ONE_YEAR;
      let tx3 = await xslocker.connect(user1).extendLock(xsLockID, newEnd3);
      expect(tx3).to.emit(xslocker, "LockUpdated").withArgs(xsLockID, lock1.amount, newEnd3);
      let lock4 = await xslocker.locks(xsLockID);
      expect(lock4.amount).eq(lock1.amount);
      expect(lock4.end).eq(newEnd3);
    });
    it("can extend if approved", async function () {
      let xsLockID = 17;
      await xslocker.connect(user1).approve(user2.address, xsLockID);
      let newEnd = (await provider.getBlock('latest')).timestamp + ONE_YEAR * 2;
      let lock1 = await xslocker.locks(xsLockID);
      let tx1 = await xslocker.connect(user1).extendLock(xsLockID, newEnd);
      expect(tx1).to.emit(xslocker, "LockUpdated").withArgs(xsLockID, lock1.amount, newEnd);
      let lock2 = await xslocker.locks(xsLockID);
      expect(lock2.amount).eq(lock1.amount);
      expect(lock2.end).eq(newEnd);
    });
  });

  describe("listeners", function () {
    it("non governor cannot add or remove listeners", async function () {
      await expect(xslocker.connect(user1).addXsLockListener(user1.address)).to.be.revertedWith("!governance");
      await expect(xslocker.connect(user1).removeXsLockListener(user1.address)).to.be.revertedWith("!governance");
    });
    it("governor can add and remove listeners", async function () {
      expect(await xslocker.getXsLockListeners()).deep.eq([]);
      let tx1 = await xslocker.connect(governor).addXsLockListener(listener1.address);
      expect(tx1).to.emit(xslocker, "xsLockListenerAdded").withArgs(listener1.address);
      expect(await xslocker.getXsLockListeners()).deep.eq([listener1.address]);
      let tx2 = await xslocker.connect(governor).addXsLockListener(listener2.address);
      expect(tx2).to.emit(xslocker, "xsLockListenerAdded").withArgs(listener2.address);
      expect(await xslocker.getXsLockListeners()).deep.eq([listener1.address, listener2.address]);
      let tx3 = await xslocker.connect(governor).addXsLockListener(listener3.address);
      expect(tx3).to.emit(xslocker, "xsLockListenerAdded").withArgs(listener3.address);
      expect(await xslocker.getXsLockListeners()).deep.eq([listener1.address, listener2.address, listener3.address]);
      let tx4 = await xslocker.connect(governor).removeXsLockListener(listener3.address);
      expect(tx4).to.emit(xslocker, "xsLockListenerRemoved").withArgs(listener3.address);
      expect(await xslocker.getXsLockListeners()).deep.eq([listener1.address, listener2.address]);
    });
    it("listeners hear mint", async function () {
      let block = await provider.getBlock('latest');
      let blocknum = block.number;
      let xsLockID = (await xslocker.totalNumLocks()).add(1);
      let end = ONE_WEEK * 52 * 20;
      await xslocker.connect(user1).createLock(user2.address, ONE_ETHER, end);
      // listener 1
      let lastUpdate1 = await listener1.lastUpdate();
      expect(lastUpdate1.blocknum).eq(blocknum+1);
      expect(lastUpdate1.caller).eq(xslocker.address);
      expect(lastUpdate1.xsLockID).eq(xsLockID);
      expect(lastUpdate1.oldOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate1.newOwner).eq(user2.address);
      expect(lastUpdate1.oldLock.amount).eq(0);
      expect(lastUpdate1.oldLock.end).eq(0);
      expect(lastUpdate1.newLock.amount).eq(ONE_ETHER);
      expect(lastUpdate1.newLock.end).eq(end);
      // listener 2
      let lastUpdate2 = await listener2.lastUpdate();
      expect(lastUpdate2.blocknum).eq(blocknum+1);
      expect(lastUpdate2.caller).eq(xslocker.address);
      expect(lastUpdate2.xsLockID).eq(xsLockID);
      expect(lastUpdate2.oldOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate2.newOwner).eq(user2.address);
      expect(lastUpdate2.oldLock.amount).eq(0);
      expect(lastUpdate2.oldLock.end).eq(0);
      expect(lastUpdate2.newLock.amount).eq(ONE_ETHER);
      expect(lastUpdate2.newLock.end).eq(end);
      // listener 3, detached
      let lastUpdate3 = await listener3.lastUpdate();
      expect(lastUpdate3.blocknum).eq(0);
      expect(lastUpdate3.caller).eq(ZERO_ADDRESS);
      expect(lastUpdate3.xsLockID).eq(0);
      expect(lastUpdate3.oldOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.newOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.oldLock.amount).eq(0);
      expect(lastUpdate3.oldLock.end).eq(0);
      expect(lastUpdate3.newLock.amount).eq(0);
      expect(lastUpdate3.newLock.end).eq(0);
    });
    it("listeners hear burn", async function () {
      let block = await provider.getBlock('latest');
      let blocknum = block.number;
      let end = ONE_WEEK * 52 * 20;
      let xsLockID = await xslocker.totalNumLocks();
      await xslocker.connect(user2).withdraw(xsLockID, user3.address);
      // listener 1
      let lastUpdate1 = await listener1.lastUpdate();
      expect(lastUpdate1.blocknum).eq(blocknum+1);
      expect(lastUpdate1.caller).eq(xslocker.address);
      expect(lastUpdate1.xsLockID).eq(xsLockID);
      expect(lastUpdate1.oldOwner).eq(user2.address);
      expect(lastUpdate1.newOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate1.oldLock.amount).eq(ONE_ETHER);
      expect(lastUpdate1.oldLock.end).eq(end);
      expect(lastUpdate1.newLock.amount).eq(0);
      expect(lastUpdate1.newLock.end).eq(0);
      // listener 2
      let lastUpdate2 = await listener2.lastUpdate();
      expect(lastUpdate2.blocknum).eq(blocknum+1);
      expect(lastUpdate2.caller).eq(xslocker.address);
      expect(lastUpdate2.xsLockID).eq(xsLockID);
      expect(lastUpdate2.oldOwner).eq(user2.address);
      expect(lastUpdate2.newOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate2.oldLock.amount).eq(ONE_ETHER);
      expect(lastUpdate2.oldLock.end).eq(end);
      expect(lastUpdate2.newLock.amount).eq(0);
      expect(lastUpdate2.newLock.end).eq(0);
      // listener 3, detached
      let lastUpdate3 = await listener3.lastUpdate();
      expect(lastUpdate3.blocknum).eq(0);
      expect(lastUpdate3.caller).eq(ZERO_ADDRESS);
      expect(lastUpdate3.xsLockID).eq(0);
      expect(lastUpdate3.oldOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.newOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.oldLock.amount).eq(0);
      expect(lastUpdate3.oldLock.end).eq(0);
      expect(lastUpdate3.newLock.amount).eq(0);
      expect(lastUpdate3.newLock.end).eq(0);
    });
    it("listeners hear transfer", async function () {
      let end = ONE_WEEK * 52 * 20;
      await xslocker.connect(user1).createLock(user2.address, ONE_ETHER, end);
      let block = await provider.getBlock('latest');
      let blocknum = block.number;
      let xsLockID = await xslocker.totalNumLocks();
      await xslocker.connect(user2).transfer(user3.address, xsLockID);
      // listener 1
      let lastUpdate1 = await listener1.lastUpdate();
      expect(lastUpdate1.blocknum).eq(blocknum+1);
      expect(lastUpdate1.caller).eq(xslocker.address);
      expect(lastUpdate1.xsLockID).eq(xsLockID);
      expect(lastUpdate1.oldOwner).eq(user2.address);
      expect(lastUpdate1.newOwner).eq(user3.address);
      expect(lastUpdate1.oldLock.amount).eq(ONE_ETHER);
      expect(lastUpdate1.oldLock.end).eq(end);
      expect(lastUpdate1.newLock.amount).eq(ONE_ETHER);
      expect(lastUpdate1.newLock.end).eq(end);
      // listener 2
      let lastUpdate2 = await listener2.lastUpdate();
      expect(lastUpdate2.blocknum).eq(blocknum+1);
      expect(lastUpdate2.caller).eq(xslocker.address);
      expect(lastUpdate2.xsLockID).eq(xsLockID);
      expect(lastUpdate2.oldOwner).eq(user2.address);
      expect(lastUpdate2.newOwner).eq(user3.address);
      expect(lastUpdate2.oldLock.amount).eq(ONE_ETHER);
      expect(lastUpdate2.oldLock.end).eq(end);
      expect(lastUpdate2.newLock.amount).eq(ONE_ETHER);
      expect(lastUpdate2.newLock.end).eq(end);
      // listener 3, detached
      let lastUpdate3 = await listener3.lastUpdate();
      expect(lastUpdate3.blocknum).eq(0);
      expect(lastUpdate3.caller).eq(ZERO_ADDRESS);
      expect(lastUpdate3.xsLockID).eq(0);
      expect(lastUpdate3.oldOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.newOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.oldLock.amount).eq(0);
      expect(lastUpdate3.oldLock.end).eq(0);
      expect(lastUpdate3.newLock.amount).eq(0);
      expect(lastUpdate3.newLock.end).eq(0);
    });
    it("listeners hear increase amount", async function () {
      let end = ONE_WEEK * 52 * 20;
      let amount1 = ONE_ETHER;
      let depositAmount = ONE_ETHER.mul(2);
      let amount2 = ONE_ETHER.mul(3);
      let block = await provider.getBlock('latest');
      let blocknum = block.number;
      let xsLockID = await xslocker.totalNumLocks();
      await xslocker.connect(user1).increaseAmount(xsLockID, depositAmount);
      // listener 1
      let lastUpdate1 = await listener1.lastUpdate();
      expect(lastUpdate1.blocknum).eq(blocknum+1);
      expect(lastUpdate1.caller).eq(xslocker.address);
      expect(lastUpdate1.xsLockID).eq(xsLockID);
      expect(lastUpdate1.oldOwner).eq(user3.address);
      expect(lastUpdate1.newOwner).eq(user3.address);
      expect(lastUpdate1.oldLock.amount).eq(amount1);
      expect(lastUpdate1.oldLock.end).eq(end);
      expect(lastUpdate1.newLock.amount).eq(amount2);
      expect(lastUpdate1.newLock.end).eq(end);
      // listener 2
      let lastUpdate2 = await listener2.lastUpdate();
      expect(lastUpdate2.blocknum).eq(blocknum+1);
      expect(lastUpdate2.caller).eq(xslocker.address);
      expect(lastUpdate2.xsLockID).eq(xsLockID);
      expect(lastUpdate2.oldOwner).eq(user3.address);
      expect(lastUpdate2.newOwner).eq(user3.address);
      expect(lastUpdate2.oldLock.amount).eq(amount1);
      expect(lastUpdate2.oldLock.end).eq(end);
      expect(lastUpdate2.newLock.amount).eq(amount2);
      expect(lastUpdate2.newLock.end).eq(end);
      // listener 3, detached
      let lastUpdate3 = await listener3.lastUpdate();
      expect(lastUpdate3.blocknum).eq(0);
      expect(lastUpdate3.caller).eq(ZERO_ADDRESS);
      expect(lastUpdate3.xsLockID).eq(0);
      expect(lastUpdate3.oldOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.newOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.oldLock.amount).eq(0);
      expect(lastUpdate3.oldLock.end).eq(0);
      expect(lastUpdate3.newLock.amount).eq(0);
      expect(lastUpdate3.newLock.end).eq(0);
    });
    it("listeners hear extend lock", async function () {
      let end1 = ONE_WEEK * 52 * 20;
      let end2 = ONE_WEEK * 52 * 30;
      let amount = ONE_ETHER.mul(3);
      let block = await provider.getBlock('latest');
      let blocknum = block.number;
      let xsLockID = await xslocker.totalNumLocks();
      await xslocker.connect(user3).extendLock(xsLockID, end2);
      // listener 1
      let lastUpdate1 = await listener1.lastUpdate();
      expect(lastUpdate1.blocknum).eq(blocknum+1);
      expect(lastUpdate1.caller).eq(xslocker.address);
      expect(lastUpdate1.xsLockID).eq(xsLockID);
      expect(lastUpdate1.oldOwner).eq(user3.address);
      expect(lastUpdate1.newOwner).eq(user3.address);
      expect(lastUpdate1.oldLock.amount).eq(amount);
      expect(lastUpdate1.oldLock.end).eq(end1);
      expect(lastUpdate1.newLock.amount).eq(amount);
      expect(lastUpdate1.newLock.end).eq(end2);
      // listener 2
      let lastUpdate2 = await listener2.lastUpdate();
      expect(lastUpdate2.blocknum).eq(blocknum+1);
      expect(lastUpdate2.caller).eq(xslocker.address);
      expect(lastUpdate2.xsLockID).eq(xsLockID);
      expect(lastUpdate2.oldOwner).eq(user3.address);
      expect(lastUpdate2.newOwner).eq(user3.address);
      expect(lastUpdate2.oldLock.amount).eq(amount);
      expect(lastUpdate2.oldLock.end).eq(end1);
      expect(lastUpdate2.newLock.amount).eq(amount);
      expect(lastUpdate2.newLock.end).eq(end2);
      // listener 3, detached
      let lastUpdate3 = await listener3.lastUpdate();
      expect(lastUpdate3.blocknum).eq(0);
      expect(lastUpdate3.caller).eq(ZERO_ADDRESS);
      expect(lastUpdate3.xsLockID).eq(0);
      expect(lastUpdate3.oldOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.newOwner).eq(ZERO_ADDRESS);
      expect(lastUpdate3.oldLock.amount).eq(0);
      expect(lastUpdate3.oldLock.end).eq(0);
      expect(lastUpdate3.newLock.amount).eq(0);
      expect(lastUpdate3.newLock.end).eq(0);
    });
  });

  describe("lock transfer", function () {
    it("cannot transfer when locked", async function () {
      let timestamp = (await provider.getBlock('latest')).timestamp + ONE_YEAR;
      await xslocker.connect(user1).createLock(user1.address, 1, timestamp);
      let xsLockID = await xslocker.totalNumLocks();
      await expect(xslocker.connect(user1).transfer(user2.address, xsLockID)).to.be.revertedWith("locked");
      await expect(xslocker.connect(user1).safeTransfer(user2.address, xsLockID)).to.be.revertedWith("locked");
      await xslocker.connect(user1).approve(user2.address, xsLockID);
      await expect(xslocker.connect(user2).transferFrom(user1.address, user2.address, xsLockID)).to.be.revertedWith("locked");
      await expect(xslocker.connect(user2)['safeTransferFrom(address,address,uint256)'](user1.address, user2.address, xsLockID)).to.be.revertedWith("locked");
      await expect(xslocker.connect(user1).withdraw(xsLockID, user2.address)).to.be.revertedWith("locked");
    });
    it("can transfer when unlocked", async function () {
      let timestamp = (await provider.getBlock('latest')).timestamp + ONE_YEAR;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      let xsLockID = await xslocker.totalNumLocks();
      await xslocker.connect(user1).transfer(user2.address, xsLockID);
      expect(await xslocker.ownerOf(xsLockID)).eq(user2.address);
      await xslocker.connect(user2).safeTransfer(user1.address, xsLockID);
      expect(await xslocker.ownerOf(xsLockID)).eq(user1.address);
      await xslocker.connect(user1).approve(user2.address, xsLockID);
      await xslocker.connect(user2).transferFrom(user1.address, user2.address, xsLockID);
      expect(await xslocker.ownerOf(xsLockID)).eq(user2.address);
      await xslocker.connect(user2).approve(user1.address, xsLockID);
      await xslocker.connect(user1)['safeTransferFrom(address,address,uint256)'](user2.address, user1.address, xsLockID);
      expect(await xslocker.ownerOf(xsLockID)).eq(user1.address);
      await xslocker.connect(user1).withdraw(xsLockID, user2.address);
    });
  });

  describe("lock view", function () {
    it("nonexistent", async function () {
      await expect(xslocker.ownerOf(999)).to.be.revertedWith("query for nonexistent token");
      await expect(xslocker.locks(999)).to.be.revertedWith("query for nonexistent token");
      await expect(xslocker.isLocked(999)).to.be.revertedWith("query for nonexistent token");
      await expect(xslocker.timeLeft(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("unlocked", async function () {
      // end = 0
      await xslocker.connect(user1).createLock(user1.address, 123, 0);
      let xsLockID = await xslocker.totalNumLocks();
      expect(await xslocker.ownerOf(xsLockID)).eq(user1.address);
      let lock = await xslocker.locks(xsLockID)
      expect(lock.amount).eq(123);
      expect(lock.end).eq(0);
      expect(await xslocker.isLocked(xsLockID)).eq(false);
      expect(await xslocker.timeLeft(xsLockID)).eq(0);
      // end in past
      await xslocker.connect(user1).createLock(user1.address, 456, 789);
      xsLockID = await xslocker.totalNumLocks();
      expect(await xslocker.ownerOf(xsLockID)).eq(user1.address);
      lock = await xslocker.locks(xsLockID)
      expect(lock.amount).eq(456);
      expect(lock.end).eq(789);
      expect(await xslocker.isLocked(xsLockID)).eq(false);
      expect(await xslocker.timeLeft(xsLockID)).eq(0);
    });
    it("locked", async function () {
      // end in future
      let block = await provider.getBlock('latest');
      let end = block.timestamp + ONE_YEAR + 1;
      await xslocker.connect(user1).createLock(user1.address, 123, end);
      let xsLockID = await xslocker.totalNumLocks();
      expect(await xslocker.ownerOf(xsLockID)).eq(user1.address);
      let lock = await xslocker.locks(xsLockID)
      expect(lock.amount).eq(123);
      expect(lock.end).eq(end);
      expect(await xslocker.isLocked(xsLockID)).eq(true);
      expect(await xslocker.timeLeft(xsLockID)).eq(ONE_YEAR);
      // still before end
      await provider.send("evm_setNextBlockTimestamp", [block.timestamp+ONE_WEEK+1]);
      await provider.send("evm_mine", []);
      expect(await xslocker.ownerOf(xsLockID)).eq(user1.address);
      lock = await xslocker.locks(xsLockID)
      expect(lock.amount).eq(123);
      expect(lock.end).eq(end);
      expect(await xslocker.isLocked(xsLockID)).eq(true);
      expect(await xslocker.timeLeft(xsLockID)).eq(ONE_YEAR-ONE_WEEK);
      // after end
      await provider.send("evm_setNextBlockTimestamp", [end]);
      await provider.send("evm_mine", []);
      expect(await xslocker.ownerOf(xsLockID)).eq(user1.address);
      lock = await xslocker.locks(xsLockID)
      expect(lock.amount).eq(123);
      expect(lock.end).eq(end);
      expect(await xslocker.isLocked(xsLockID)).eq(false);
      expect(await xslocker.timeLeft(xsLockID)).eq(0);
    });
  });

  describe("uri", function () {
    it("cannot get the uri of non existant token", async function () {
      await expect(xslocker.tokenURI(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("starts simple", async function () {
      expect(await xslocker.baseURI()).eq("");
      expect(await xslocker.tokenURI(4)).eq("4");
    });
    it("non governor cannot set base uri", async function () {
      await expect(xslocker.connect(user1).setBaseURI("asdf")).to.be.revertedWith("!governance");
    });
    it("governor can set base uri", async function () {
      let base = "https://solace.fi/xsLocks?xsLockID=";
      let tx = await xslocker.connect(governor).setBaseURI(base);
      expect(tx).to.emit(xslocker, "BaseURISet").withArgs(base);
      expect(await xslocker.baseURI()).eq(base);
      expect(await xslocker.tokenURI(4)).eq(base+"4");
    });
  });

  interface Balances {
    user1Solace: BN;
    user1StakedSolace: BN;
    user2Solace: BN;
    user2StakedSolace: BN;
    user3Solace: BN;
    user3StakedSolace: BN;
    totalStakedSolace: BN;
    user1Locks: BN;
    user2Locks: BN;
    user3Locks: BN;
    totalNumLocks: BN;
    totalSupply: BN;
  }

  async function getBalances(): Promise<Balances> {
    return {
      user1Solace: await solace.balanceOf(user1.address),
      user1StakedSolace: await xslocker.stakedBalance(user1.address),
      user2Solace: await solace.balanceOf(user2.address),
      user2StakedSolace: await xslocker.stakedBalance(user2.address),
      user3Solace: await solace.balanceOf(user3.address),
      user3StakedSolace: await xslocker.stakedBalance(user3.address),
      totalStakedSolace: await solace.balanceOf(xslocker.address),
      user1Locks: await xslocker.balanceOf(user1.address),
      user2Locks: await xslocker.balanceOf(user2.address),
      user3Locks: await xslocker.balanceOf(user3.address),
      totalNumLocks: await xslocker.totalNumLocks(),
      totalSupply: await xslocker.totalSupply()
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      user1Solace: balances1.user1Solace.sub(balances2.user1Solace),
      user1StakedSolace: balances1.user1StakedSolace.sub(balances2.user1StakedSolace),
      user2Solace: balances1.user2Solace.sub(balances2.user2Solace),
      user2StakedSolace: balances1.user2StakedSolace.sub(balances2.user2StakedSolace),
      user3Solace: balances1.user3Solace.sub(balances2.user3Solace),
      user3StakedSolace: balances1.user3StakedSolace.sub(balances2.user3StakedSolace),
      totalStakedSolace: balances1.totalStakedSolace.sub(balances2.totalStakedSolace),
      user1Locks: balances1.user1Locks.sub(balances2.user1Locks),
      user2Locks: balances1.user2Locks.sub(balances2.user2Locks),
      user3Locks: balances1.user3Locks.sub(balances2.user3Locks),
      totalNumLocks: balances1.totalNumLocks.sub(balances2.totalNumLocks),
      totalSupply: balances1.totalSupply.sub(balances2.totalSupply)
    };
  }
});
