import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet, utils } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, XsLocker, XSolace } from "../typechain";
import { expectClose } from "./utilities/math";

// contracts
let solace: Solace;
let xslocker: XsLocker;
let xsolace: XSolace;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_YEAR = 31536000; // in seconds
const ONE_WEEK = 604800; // in seconds
const PRECISION = 1e12;

const MAX_LOCK_DURATION = 126144000; // 60*60*24*365*4 = 4 years in seconds
const MAX_LOCK_MULTIPLIER_BPS = 40000;  // 4X
const UNLOCKED_MULTIPLIER_BPS = 10000; // 1X
const MAX_BPS = 10000;

const TOKEN_NAME = "xsolace";
const TOKEN_SYMBOL = "xSOLACE";

describe("xSOLACE", function () {
  const [deployer, governor, user1, user2, user3] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    await solace.connect(governor).addMinter(governor.address);
    xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as unknown as XsLocker;

    await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
    await solace.connect(governor).mint(user2.address, ONE_ETHER.mul(100));
    await solace.connect(governor).mint(user3.address, ONE_ETHER.mul(100));
    await solace.connect(user1).approve(xslocker.address, constants.MaxUint256);
    await solace.connect(user2).approve(xslocker.address, constants.MaxUint256);
    await solace.connect(user3).approve(xslocker.address, constants.MaxUint256);
  });

  describe("deployment", function () {
    it("reverts if zero xslocker", async function () {
      await expect(deployContract(deployer, artifacts.xSOLACE, [ZERO_ADDRESS])).to.be.revertedWith("zero address xslocker");
    });
    it("deploys", async function () {
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [xslocker.address])) as XSolace;
    });
    it("initializes properly", async function () {
      expect(await xsolace.MAX_LOCK_DURATION()).eq(MAX_LOCK_DURATION);
      expect(await xsolace.MAX_LOCK_MULTIPLIER_BPS()).eq(MAX_LOCK_MULTIPLIER_BPS);
      expect(await xsolace.UNLOCKED_MULTIPLIER_BPS()).eq(UNLOCKED_MULTIPLIER_BPS);
      expect(await xsolace.name()).eq(TOKEN_NAME);
      expect(await xsolace.symbol()).eq(TOKEN_SYMBOL);
      expect(await xsolace.decimals()).eq(18);
      expect(await xsolace.allowance(user1.address, user2.address)).eq(0);
    });
  });

  describe("cannot be transferred", function () {
    it("cannot transfer", async function () {
      await expect(xsolace.connect(user1).transfer(user2.address, 1)).to.be.revertedWith("xSOLACE transfer not allowed");
    });
    it("cannot transferFrom", async function () {
      await expect(xsolace.connect(user1).transferFrom(user1.address, user2.address, 1)).to.be.revertedWith("xSOLACE transfer not allowed");
    });
    it("cannot approve", async function () {
      await expect(xsolace.connect(user1).approve(user2.address, 1)).to.be.revertedWith("xSOLACE transfer not allowed");
    });
  });

  describe("accounts correctly", function () {
    it("starts zero", async function () {
      expect(await xsolace.balanceOf(user1.address)).eq(0);
      expect(await xsolace.totalSupply()).eq(0);
      await expect(xsolace.balanceOfLock(0)).to.be.revertedWith("query for nonexistent token");
      await checkConsistancy();
    });
    it("accounts for unlocked stake", async function () {
      // deposit 1: unlocked
      await xslocker.connect(user1).createLock(user2.address, ONE_ETHER, 0);
      expect(await xsolace.balanceOfLock(1)).eq(ONE_ETHER);
      expect(await xsolace.balanceOf(user1.address)).eq(0);
      expect(await xsolace.balanceOf(user2.address)).eq(ONE_ETHER);
      expect(await xsolace.balanceOf(user3.address)).eq(0);
      expect(await xsolace.totalSupply()).eq(ONE_ETHER);
      await checkConsistancy();
      // deposit 2: unlocked
      await xslocker.connect(user1).createLock(user3.address, ONE_ETHER.mul(2), 0);
      expect(await xsolace.balanceOfLock(2)).eq(ONE_ETHER.mul(2));
      expect(await xsolace.balanceOf(user1.address)).eq(0);
      expect(await xsolace.balanceOf(user2.address)).eq(ONE_ETHER);
      expect(await xsolace.balanceOf(user3.address)).eq(ONE_ETHER.mul(2));
      expect(await xsolace.totalSupply()).eq(ONE_ETHER.mul(3));
      await checkConsistancy();
    });
    it("accounts for unlocked stake", async function () {
      // deposit 3: locked 4 years, 4x multiplier
      let block = await provider.getBlock('latest');
      let timestamp1 = block.timestamp + ONE_YEAR*4 + 1;
      await xslocker.connect(user1).createLock(user1.address, ONE_ETHER, timestamp1);
      expect(await xsolace.balanceOfLock(3)).eq(ONE_ETHER.mul(4));
      expect(await xsolace.balanceOf(user1.address)).eq(ONE_ETHER.mul(4));
      expect(await xsolace.balanceOf(user2.address)).eq(ONE_ETHER);
      expect(await xsolace.balanceOf(user3.address)).eq(ONE_ETHER.mul(2));
      expect(await xsolace.totalSupply()).eq(ONE_ETHER.mul(7));
      await checkConsistancy();
      // deposit 4: locked 1 year, 1.75x multiplier
      // y = (3x/4 + 1)*amount. x = 12, y = 21
      let timestamp2 = block.timestamp + ONE_YEAR + 2;
      await xslocker.connect(user1).createLock(user2.address, ONE_ETHER.mul(12), timestamp2);
      expect(await xsolace.balanceOfLock(4)).eq(ONE_ETHER.mul(21));
      expectClose(await xsolace.balanceOf(user1.address), ONE_ETHER.mul(4), PRECISION);
      expect(await xsolace.balanceOf(user2.address)).eq(ONE_ETHER.mul(22));
      expect(await xsolace.balanceOf(user3.address)).eq(ONE_ETHER.mul(2));
      expectClose(await xsolace.totalSupply(), ONE_ETHER.mul(28), PRECISION);
      await checkConsistancy();
    });
    it("accounts for time", async function () {
      let timestamp = (await provider.getBlock('latest')).timestamp + ONE_YEAR*2;
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);
      expect(await xsolace.balanceOfLock(1)).eq(ONE_ETHER); // never locked
      expect(await xsolace.balanceOfLock(2)).eq(ONE_ETHER.mul(2)); // never locked
      expectClose(await xsolace.balanceOfLock(3), ONE_ETHER.mul(5).div(2), PRECISION); // still locked
      expect(await xsolace.balanceOfLock(4)).eq(ONE_ETHER.mul(12)); // became unlocked
      expectClose(await xsolace.balanceOf(user1.address), ONE_ETHER.mul(5).div(2), PRECISION);
      expect(await xsolace.balanceOf(user2.address)).eq(ONE_ETHER.mul(13));
      expect(await xsolace.balanceOf(user3.address)).eq(ONE_ETHER.mul(2));
      expectClose(await xsolace.totalSupply(), ONE_ETHER.mul(35).div(2), PRECISION);
      await checkConsistancy();
    });
    it("accounts for withdraw", async function () {
      await xslocker.connect(user2).withdraw(1, user2.address);
      await expect(xsolace.balanceOfLock(1)).to.be.revertedWith("query for nonexistent token");
      expect(await xsolace.balanceOfLock(2)).eq(ONE_ETHER.mul(2)); // never locked
      expectClose(await xsolace.balanceOfLock(3), ONE_ETHER.mul(5).div(2), PRECISION); // still locked
      expect(await xsolace.balanceOfLock(4)).eq(ONE_ETHER.mul(12)); // became unlocked
      expectClose(await xsolace.balanceOf(user1.address), ONE_ETHER.mul(5).div(2), PRECISION);
      expect(await xsolace.balanceOf(user2.address)).eq(ONE_ETHER.mul(12));
      expect(await xsolace.balanceOf(user3.address)).eq(ONE_ETHER.mul(2));
      expectClose(await xsolace.totalSupply(), ONE_ETHER.mul(33).div(2), PRECISION);
      await checkConsistancy();
    });
  });

  // tests each lock is close to predicted value
  // each user's xsolace is the sum of their xslocks
  // total xsolace is the sum of all xslocks
  async function checkConsistancy() {
    let predXsolaceUserBalances = new Map<string, BN>();
    let predXsolaceTotalSupply = BN.from(0);
    let xslockerTotalSupply = (await xslocker.totalSupply()).toNumber();
    for(let i = 0; i < xslockerTotalSupply; ++i) {
      let xsLockID = await xslocker.tokenByIndex(i);
      let realXsolaceValue = await xsolace.balanceOfLock(xsLockID);
      let predXsolaceValue = await predictBalanceOfLock(xsLockID);
      expectClose(realXsolaceValue, predXsolaceValue, PRECISION);
      predXsolaceTotalSupply = predXsolaceTotalSupply.add(realXsolaceValue);
      let owner = await xslocker.ownerOf(xsLockID);
      if(!predXsolaceUserBalances.has(owner)) predXsolaceUserBalances.set(owner, BN.from(0));
      let predBalance = predXsolaceUserBalances.get(owner) ?? BN.from(0);
      predXsolaceUserBalances.set(owner, predBalance.add(realXsolaceValue));
    }
    let realXsolaceTotalSupply = await xsolace.totalSupply();
    expect(realXsolaceTotalSupply).eq(predXsolaceTotalSupply);
    predXsolaceUserBalances.forEach(async (predBalance, user) => {
      let realXsolaceUserBalance = await xsolace.balanceOf(user);
      expect(realXsolaceUserBalance).eq(predBalance);
    });
  }

  async function predictBalanceOfLock(xsLockID: BigNumberish) {
    let exists = await xslocker.exists(xsLockID);
    if(!exists) {
      await expect(xsolace.balanceOfLock(xsLockID)).to.be.revertedWith("query for nonexistent token");
      return -1;
    }
    let block = await provider.getBlock('latest');
    let lock = await xslocker.locks(xsLockID);
    let base = lock.amount.mul(UNLOCKED_MULTIPLIER_BPS).div(MAX_BPS);
    let bonus = (lock.end.lte(block.timestamp))
      ? 0 // unlocked
      : lock.amount.mul(lock.end.toNumber() - block.timestamp).mul(MAX_LOCK_MULTIPLIER_BPS - UNLOCKED_MULTIPLIER_BPS).div(MAX_LOCK_DURATION * MAX_BPS); // locked
    let expectedAmount = base.add(bonus);
    return expectedAmount;
  }
});
