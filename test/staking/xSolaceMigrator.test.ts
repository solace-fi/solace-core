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
import { Solace, XSolacev1, XsLocker, XSolaceMigrator } from "./../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

// contracts
let solace: Solace;
let xsolace: XSolacev1;
let xslocker: XsLocker;
let migrator: XSolaceMigrator;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_YEAR = 31536000; // in seconds
const ONE_WEEK = 604800; // in seconds

const chainId = 31337;
const deadline = constants.MaxUint256;

// note that xsolace refers to xsolacev1
describe("xSolaceMigrator", function () {
  const [deployer, governor, user1, user2, user3] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsolace = (await deployContract(deployer, artifacts.xSOLACEV1, [governor.address, solace.address])) as XSolacev1;
    xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;

    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
    await solace.connect(governor).mint(user2.address, ONE_ETHER.mul(100));
    await solace.connect(governor).mint(user3.address, ONE_ETHER.mul(100));
    await solace.connect(user1).approve(xsolace.address, constants.MaxUint256);
    await solace.connect(user2).approve(xsolace.address, constants.MaxUint256);
    await solace.connect(user3).approve(xsolace.address, constants.MaxUint256);
  });

  describe("deployment", function () {
    it("reverts if zero solace", async function () {
      await expect(deployContract(deployer, artifacts.xSolaceMigrator, [ZERO_ADDRESS, xsolace.address, xslocker.address])).to.be.revertedWith("zero address solace");
    });
    it("reverts if zero xsolace", async function () {
      await expect(deployContract(deployer, artifacts.xSolaceMigrator, [solace.address, ZERO_ADDRESS, xslocker.address])).to.be.revertedWith("zero address xsolace");
    });
    it("reverts if zero xslocker", async function () {
      await expect(deployContract(deployer, artifacts.xSolaceMigrator, [solace.address, xsolace.address, ZERO_ADDRESS])).to.be.revertedWith("zero address xslocker");
    });
    it("deploys", async function () {
      migrator = (await deployContract(deployer, artifacts.xSolaceMigrator, [solace.address, xsolace.address, xslocker.address])) as XSolaceMigrator;
      await expectDeployed(migrator.address);
    });
    it("initializes properly", async function () {
      expect(await migrator.solace()).eq(solace.address);
      expect(await migrator.xsolacev1()).eq(xsolace.address);
      expect(await migrator.xsLocker()).eq(xslocker.address);
    });
  });

  describe("migrate", function () {
    it("can migrate zero", async function () {
      let balances1 = await getBalances();
      let solaceAmount = BN.from(0);
      let xsolaceAmount = BN.from(0);
      let lockEnd = 12345;
      await migrator.connect(user1).migrate(xsolaceAmount, lockEnd);
      let lock = await xslocker.locks(1);
      expect(lock.amount).eq(solaceAmount);
      expect(lock.end).eq(lockEnd);
      let balances2 = await getBalances();
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1XSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.user1StakedSolace).eq(solaceAmount);
      expect(balancesDiff.user1Locks).eq(1);
    });
    it("cannot migrate without approval", async function () {
      await xsolace.connect(user1).stake(ONE_ETHER);
      await expect(migrator.connect(user1).migrate(ONE_ETHER, 12345)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      await xsolace.connect(user1).approve(migrator.address, ONE_ETHER.mul(3).div(4));
      await expect(migrator.connect(user1).migrate(ONE_ETHER, 12345)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("migrates", async function () {
      await xsolace.connect(user1).approve(migrator.address, ONE_ETHER);
      let balances1 = await getBalances();
      let solaceAmount = ONE_ETHER;
      let xsolaceAmount = ONE_ETHER;
      let lockEnd = 54321;
      await migrator.connect(user1).migrate(xsolaceAmount, lockEnd);
      let lock = await xslocker.locks(2);
      expect(lock.amount).eq(solaceAmount);
      expect(lock.end).eq(lockEnd);
      let balances2 = await getBalances();
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1XSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.user1StakedSolace).eq(solaceAmount);
      expect(balancesDiff.user1Locks).eq(1);
    });
    it("migrates unbalanced", async function () {
      // user1 owns 10 out of 20 xsolace, convertable to 30 solace
      await xsolace.connect(user1).stake(ONE_ETHER.mul(10));
      await xsolace.connect(user2).stake(ONE_ETHER.mul(10));
      await solace.connect(user1).transfer(xsolace.address, ONE_ETHER.mul(40));
      await xsolace.connect(user1).approve(migrator.address, ONE_ETHER.mul(10));
      let balances1 = await getBalances();
      let solaceAmount = ONE_ETHER.mul(30);
      let xsolaceAmount = ONE_ETHER.mul(10);
      let lockEnd = 999;
      await migrator.connect(user1).migrate(xsolaceAmount, lockEnd);
      let lock = await xslocker.locks(3);
      expect(lock.amount).eq(solaceAmount);
      expect(lock.end).eq(lockEnd);
      let balances2 = await getBalances();
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1XSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.user1StakedSolace).eq(solaceAmount);
      expect(balancesDiff.user1Locks).eq(1);
    });
  });

  describe("migrate signed", function () {
    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACEV1, [governor.address, solace.address])) as XSolacev1;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
      migrator = (await deployContract(deployer, artifacts.xSolaceMigrator, [solace.address, xsolace.address, xslocker.address])) as XSolaceMigrator;

      await solace.connect(governor).addMinter(governor.address);
      await solace.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
      await solace.connect(governor).mint(user2.address, ONE_ETHER.mul(100));
      await solace.connect(governor).mint(user3.address, ONE_ETHER.mul(100));
      await solace.connect(user1).approve(xsolace.address, constants.MaxUint256);
      await solace.connect(user2).approve(xsolace.address, constants.MaxUint256);
      await solace.connect(user3).approve(xsolace.address, constants.MaxUint256);
    });
    it("can migrate zero", async function () {
      let balances1 = await getBalances();
      let solaceAmount = BN.from(0);
      let xsolaceAmount = BN.from(0);
      let lockEnd = 12345;
      let { v, r, s } = await getERC20PermitSignature(user1, migrator.address, xsolace, xsolaceAmount, deadline);
      await migrator.connect(user1).migrateSigned(xsolaceAmount, lockEnd, deadline, v, r, s);
      let lock = await xslocker.locks(1);
      expect(lock.amount).eq(solaceAmount);
      expect(lock.end).eq(lockEnd);
      let balances2 = await getBalances();
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1XSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.user1StakedSolace).eq(solaceAmount);
      expect(balancesDiff.user1Locks).eq(1);
    });
    it("cannot migrate with invalid permit", async function () {
      await xsolace.connect(user1).stake(ONE_ETHER);
      let { v, r, s } = await getERC20PermitSignature(user1, migrator.address, xsolace, 1, deadline);
      await expect(migrator.connect(user1).migrateSigned(2, 0, deadline, v, r, s)).to.be.revertedWith("ERC20Permit: invalid signature");
    });
    it("migrates", async function () {
      let balances1 = await getBalances();
      let solaceAmount = ONE_ETHER;
      let xsolaceAmount = ONE_ETHER;
      let lockEnd = 54321;
      let { v, r, s } = await getERC20PermitSignature(user1, migrator.address, xsolace, xsolaceAmount, deadline);
      await migrator.connect(user1).migrateSigned(xsolaceAmount, lockEnd, deadline, v, r, s);
      let lock = await xslocker.locks(2);
      expect(lock.amount).eq(solaceAmount);
      expect(lock.end).eq(lockEnd);
      let balances2 = await getBalances();
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1XSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.user1StakedSolace).eq(solaceAmount);
      expect(balancesDiff.user1Locks).eq(1);
    });
    it("migrates unbalanced", async function () {
      // user1 owns 10 out of 20 xsolace, convertable to 30 solace
      await xsolace.connect(user1).stake(ONE_ETHER.mul(10));
      await xsolace.connect(user2).stake(ONE_ETHER.mul(10));
      await solace.connect(user1).transfer(xsolace.address, ONE_ETHER.mul(40));
      let balances1 = await getBalances();
      let solaceAmount = ONE_ETHER.mul(30);
      let xsolaceAmount = ONE_ETHER.mul(10);
      let lockEnd = 999;
      let { v, r, s } = await getERC20PermitSignature(user1, migrator.address, xsolace, xsolaceAmount, deadline);
      await migrator.connect(user1).migrateSigned(xsolaceAmount, lockEnd, deadline, v, r, s);
      let lock = await xslocker.locks(3);
      expect(lock.amount).eq(solaceAmount);
      expect(lock.end).eq(lockEnd);
      let balances2 = await getBalances();
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.user1Solace).eq(0);
      expect(balancesDiff.user1XSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.user1StakedSolace).eq(solaceAmount);
      expect(balancesDiff.user1Locks).eq(1);
    });
  });


  interface Balances {
    user1Solace: BN;
    user1StakedSolace: BN;
    user1XSolace: BN;
    user2Solace: BN;
    user2XSolace: BN;
    user2StakedSolace: BN;
    user3Solace: BN;
    user3XSolace: BN;
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
      user1XSolace: await xsolace.balanceOf(user1.address),
      user1StakedSolace: await xslocker.stakedBalance(user1.address),
      user2Solace: await solace.balanceOf(user2.address),
      user2XSolace: await xsolace.balanceOf(user2.address),
      user2StakedSolace: await xslocker.stakedBalance(user2.address),
      user3Solace: await solace.balanceOf(user3.address),
      user3XSolace: await xsolace.balanceOf(user3.address),
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
      user1XSolace: balances1.user1XSolace.sub(balances2.user1XSolace),
      user1StakedSolace: balances1.user1StakedSolace.sub(balances2.user1StakedSolace),
      user2Solace: balances1.user2Solace.sub(balances2.user2Solace),
      user2XSolace: balances1.user2XSolace.sub(balances2.user2XSolace),
      user2StakedSolace: balances1.user2StakedSolace.sub(balances2.user2StakedSolace),
      user3Solace: balances1.user3Solace.sub(balances2.user3Solace),
      user3XSolace: balances1.user3XSolace.sub(balances2.user3XSolace),
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
