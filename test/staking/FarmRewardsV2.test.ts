import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Solace, XSolacev1, FarmRewards, XsLocker, FarmRewardsV2, MockErc20Decimals, MockErc20Permit } from "./../../typechain";
import { bnAddSub, bnMulDiv, expectClose } from "./../utilities/math";
import { getERC20PermitSignature } from "./../utilities/getERC20PermitSignature";
import { readFileSync } from "fs";

chai.use(solidity);

// contracts
let solace: Solace;
let xsolace: XSolacev1;
let farmRewards: FarmRewards;
let xslocker: XsLocker;
let farmRewardsv2: FarmRewardsV2;

// tokens
let usdc: MockErc20Permit;
let usdt: MockErc20Decimals;
let dai: MockErc20Permit;
let uni: MockErc20Permit;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
const PRECISION = 100;
const PRECISION2 = 1e14;

const VESTING_END = 1651363200; // midnight UTC before May 1, 2022
const PRICE_USDC = BN.from("30000"); // 3 cents USDC per solace
const PRICE_DAI = BN.from("30000000000000000"); // 3 cents DAI per solace
const deadline = constants.MaxUint256;

describe("FarmRewardsV2", function () {
  const [deployer, governor, farmer1, farmer2, farmer3, trader, receiver] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy tokens
    usdc = (await deployContract(deployer, artifacts.MockERC20Permit, ["USD Coin", "USDC", constants.MaxUint256, 6])) as MockErc20Permit;
    usdt = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Tether USD", "USDT", constants.MaxUint256, 6])) as MockErc20Decimals;
    dai = (await deployContract(deployer, artifacts.MockERC20Permit, ["DAI Stablecoin", "DAI", constants.MaxUint256, 18])) as MockErc20Permit;
    uni = (await deployContract(deployer, artifacts.MockERC20Permit, ["UNI", "UNI", constants.MaxUint256, 18])) as MockErc20Permit;

    // deploy solace contracts pt 1
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsolace = (await deployContract(deployer, artifacts.xSOLACEV1, [governor.address, solace.address])) as XSolacev1;
    // transfer tokens
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solace.connect(governor).approve(xsolace.address, constants.MaxUint256);
    await xsolace.connect(governor).stake(ONE_ETHER);
    await solace.connect(governor).transfer(xsolace.address, ONE_ETHER.mul(20));
    // deploy solace contracts pt 1
    farmRewards = (await deployContract(deployer, artifacts.FarmRewards, [governor.address, xsolace.address, receiver.address, await xsolace.xSolaceToSolace(ONE_ETHER)])) as FarmRewards;
    await farmRewards.connect(governor).supportTokens([dai.address, usdc.address, usdt.address]);
    xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;

    // transfer tokens
    await xsolace.connect(governor).stake(ONE_ETHER.mul(100000));
    await xsolace.connect(governor).transfer(farmRewards.address, await xsolace.balanceOf(governor.address));
    await dai.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await usdc.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await usdt.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await uni.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await dai.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await usdc.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await usdt.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await uni.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await usdc.connect(deployer).transfer(farmer3.address, ONE_MILLION_ETHER);
  });

  describe("deployment", function () {
    it("verifies inputs", async function () {
      await expect(deployContract(deployer, artifacts.FarmRewardsV2, [ZERO_ADDRESS, solace.address, xsolace.address, farmRewards.address, xslocker.address, receiver.address])).to.be.revertedWith("zero address governance");
      await expect(deployContract(deployer, artifacts.FarmRewardsV2, [governor.address, ZERO_ADDRESS, xsolace.address, farmRewards.address, xslocker.address, receiver.address])).to.be.revertedWith("zero address solace");
      await expect(deployContract(deployer, artifacts.FarmRewardsV2, [governor.address, solace.address, ZERO_ADDRESS, farmRewards.address, xslocker.address, receiver.address])).to.be.revertedWith("zero address xsolace");
      await expect(deployContract(deployer, artifacts.FarmRewardsV2, [governor.address, solace.address, xsolace.address, ZERO_ADDRESS, xslocker.address, receiver.address])).to.be.revertedWith("zero address farm rewards v1");
      await expect(deployContract(deployer, artifacts.FarmRewardsV2, [governor.address, solace.address, xsolace.address, farmRewards.address, ZERO_ADDRESS, receiver.address])).to.be.revertedWith("zero address xslocker");
      await expect(deployContract(deployer, artifacts.FarmRewardsV2, [governor.address, solace.address, xsolace.address, farmRewards.address, xslocker.address, ZERO_ADDRESS])).to.be.revertedWith("zero address receiver");
    });
    it("deploys successfully", async function () {
      farmRewardsv2 = (await deployContract(deployer, artifacts.FarmRewardsV2, [governor.address, solace.address, xsolace.address, farmRewards.address, xslocker.address, receiver.address])) as FarmRewardsV2;
    });
    it("returns correct values", async function () {
      expect(await farmRewardsv2.solace()).eq(solace.address);
      expect(await farmRewardsv2.xsolacev1()).eq(xsolace.address);
      expect(await farmRewardsv2.farmRewardsv1()).eq(farmRewards.address);
      expect(await farmRewardsv2.xsLocker()).eq(xslocker.address);
      expect(await farmRewardsv2.receiver()).eq(receiver.address);
      expect(await farmRewardsv2.VESTING_END()).eq(VESTING_END);
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await farmRewardsv2.governance()).to.equal(governor.address);
    });
    it("rejects setting pending governance by non governor", async function () {
      await expect(farmRewardsv2.connect(farmer1).setPendingGovernance(farmer1.address)).to.be.revertedWith("!governance");
    });
    it("can set pending governance", async function () {
      let tx = await farmRewardsv2.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(farmRewardsv2, "GovernancePending").withArgs(deployer.address);
      expect(await farmRewardsv2.governance()).to.equal(governor.address);
      expect(await farmRewardsv2.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(farmRewardsv2.connect(farmer1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function () {
      let tx = await farmRewardsv2.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(farmRewardsv2, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await farmRewardsv2.governance()).to.equal(deployer.address);
      expect(await farmRewardsv2.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await farmRewardsv2.connect(deployer).setPendingGovernance(governor.address);
      await farmRewardsv2.connect(governor).acceptGovernance();
    });
  });

  describe("receiver", function () {
    it("starts set", async function () {
      expect(await farmRewardsv2.receiver()).to.equal(receiver.address);
    });
    it("cannot be set by non governance", async function () {
      await expect(farmRewardsv2.connect(farmer1).setReceiver(trader.address)).to.be.revertedWith("!governance");
    });
    it("cannot set to zero", async function () {
      await expect(farmRewardsv2.connect(governor).setReceiver(ZERO_ADDRESS)).to.be.revertedWith("zero address receiver");
    });
    it("can be set", async function () {
      let tx = await farmRewardsv2.connect(governor).setReceiver(trader.address);
      //expect(tx).to.emit(farmRewardsv2, "ReceiverSet").withArgs(trader.address);
      expect(await farmRewardsv2.receiver()).to.equal(trader.address);
      await farmRewardsv2.connect(governor).setReceiver(receiver.address);
    });
  });

  describe("calculate amounts", function () {
    it("cannot use unsupported tokens", async function () {
      await expect(farmRewardsv2.calculateAmountIn(uni.address, 1)).to.be.revertedWith("token in not supported");
      await expect(farmRewardsv2.calculateAmountOut(uni.address, 1)).to.be.revertedWith("token in not supported");
    });
    it("can calculate amount in", async function () {
      const ONE_HUNDRED_SOLACE = ONE_ETHER.mul(100);
      expect(await farmRewardsv2.calculateAmountIn(dai.address, ONE_HUNDRED_SOLACE)).eq(PRICE_DAI.mul(100));
      expect(await farmRewardsv2.calculateAmountIn(usdc.address, ONE_HUNDRED_SOLACE)).eq(PRICE_USDC.mul(100));
    });
    it("can calculate amount out", async function () {
      const ONE_HUNDRED_DAI = ONE_ETHER.mul(100);
      const ONE_HUNDRED_USDC = BN.from("100000000");
      expect(await farmRewardsv2.calculateAmountOut(dai.address, ONE_HUNDRED_DAI)).eq(ONE_ETHER.mul(100).mul(100).div(3));
      expect(await farmRewardsv2.calculateAmountOut(usdc.address, ONE_HUNDRED_USDC)).eq(ONE_ETHER.mul(100).mul(100).div(3));
    });
    it("purchaseable solace", async function () {
      let balances1 = await getBalances(farmer1.address);
      expect(await farmRewardsv2.purchaseableXSolace(farmer1.address)).eq(0);
      expect(await farmRewardsv2.purchaseableSolace(farmer1.address)).eq(0);
      await farmRewards.connect(governor).setFarmedRewards([farmer1.address, farmer2.address, farmer3.address], [ONE_ETHER.mul(30), ONE_ETHER, ONE_ETHER]);
      expect(await farmRewardsv2.purchaseableXSolace(farmer1.address)).eq(ONE_ETHER.mul(30));
      expect(await farmRewardsv2.purchaseableSolace(farmer1.address)).eq(await xsolace.xSolaceToSolace(ONE_ETHER.mul(30)));
      await dai.connect(farmer1).approve(farmRewards.address, constants.MaxUint256);
      let daiAmount = await farmRewards.calculateAmountIn(dai.address, ONE_ETHER);
      await farmRewards.connect(farmer1).redeem(dai.address, daiAmount);
      let balances2 = await getBalances(farmer1.address);
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.userDAI).eq(daiAmount.mul(-1));
      expect(balancesDiff.userXSolace).eq(ONE_ETHER);
      expect(await farmRewardsv2.purchaseableXSolace(farmer1.address)).eq(ONE_ETHER.mul(29));
      expect(await farmRewardsv2.purchaseableSolace(farmer1.address)).eq(await xsolace.xSolaceToSolace(ONE_ETHER.mul(29)));
    })
  });

  describe("redeem without v1 governance", function () {
    it("reverts redeem", async function () {
      await expect(farmRewardsv2.connect(farmer1).redeem(dai.address, 1)).to.be.revertedWith("!governance");
    });
    it("reverts redeem signed", async function () {
      var { v, r, s } = await getERC20PermitSignature(farmer1, farmRewardsv2.address, dai, 1);
      await expect(farmRewardsv2.connect(farmer1).redeemSigned(dai.address, 1, farmer1.address, deadline, v, r, s)).to.be.revertedWith("!governance");
    });
  });

  describe("accept v1 governance", function () {
    it("reverts if v1 pending governance not set", async function () {
      await expect(farmRewardsv2.connect(governor).acceptFarmRewardsV1Governance()).to.be.revertedWith("!pending governance");
    });
    it("reverts if not called by v2 governance", async function () {
      await farmRewards.connect(governor).setPendingGovernance(farmRewardsv2.address);
      await expect(farmRewardsv2.connect(farmer1).acceptFarmRewardsV1Governance()).to.be.revertedWith("!governance");
    });
    it("accepts v1 governance", async function () {
      await farmRewardsv2.connect(governor).acceptFarmRewardsV1Governance();
      expect(await farmRewards.governance()).eq(farmRewardsv2.address);
      expect(await farmRewards.receiver()).eq(farmRewardsv2.address);
    });
  });

  describe("redeem", function () {
    it("reverts if token not supported", async function () {
      await expect(farmRewardsv2.connect(farmer1).redeem(uni.address, 1)).to.be.revertedWith("token in not supported");
    });
    it("can redeem in part", async function () {
      expect(await farmRewardsv2.userLock(farmer1.address)).eq(0);
      let balances1 = await getBalances(farmer1.address);
      let xsolaceAmount = ONE_ETHER;
      let solaceAmount = await xsolace.xSolaceToSolace(xsolaceAmount);
      let daiAmount = await farmRewards.calculateAmountIn(dai.address, xsolaceAmount);
      await dai.connect(farmer1).approve(farmRewardsv2.address, constants.MaxUint256);
      await farmRewardsv2.connect(farmer1).redeem(dai.address, daiAmount);
      let balances2 = await getBalances(farmer1.address);
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.redeemedRewards).eq(0);
      expect(balancesDiff.farmedRewards).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.farmRewardsXSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.userDAI).eq(daiAmount.mul(-1));
      expect(balancesDiff.receiverDAI).eq(daiAmount);
      expect(balancesDiff.userSolace).eq(0);
      expect(balancesDiff.userXSolace).eq(0);
      expect(await farmRewardsv2.userLock(farmer1.address)).eq(1);
      let lock = await xslocker.locks(1);
      expect(lock.amount).eq(solaceAmount);
      expect(lock.end).eq(VESTING_END);
    });
    it("can redeem in full", async function () {
      let lock1 = await xslocker.locks(1);
      let balances1 = await getBalances(farmer1.address);
      let xsolaceAmount = balances1.farmedRewards.sub(balances1.redeemedRewards);
      let solaceAmount = await xsolace.xSolaceToSolace(xsolaceAmount);
      let daiAmount = await farmRewards.calculateAmountIn(dai.address, xsolaceAmount);
      await dai.connect(farmer1).approve(farmRewardsv2.address, constants.MaxUint256);
      await farmRewardsv2.connect(farmer1).redeem(dai.address, daiAmount);
      let balances2 = await getBalances(farmer1.address);
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.redeemedRewards).eq(0);
      expect(balances2.farmedRewards).eq(balances1.redeemedRewards);
      expect(balancesDiff.farmedRewards).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.farmRewardsXSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.userDAI).eq(daiAmount.mul(-1));
      expect(balancesDiff.receiverDAI).eq(daiAmount);
      expect(balancesDiff.userSolace).eq(0);
      expect(balancesDiff.userXSolace).eq(0);
      expect(await farmRewardsv2.userLock(farmer1.address)).eq(1);
      let lock = await xslocker.locks(1);
      expect(lock.amount).eq(lock1.amount.add(solaceAmount));
      expect(lock.end).eq(VESTING_END);
    });
    it("can redeem in v1 then in v2", async function () {
      // v1
      expect(await farmRewardsv2.userLock(farmer2.address)).eq(0);
      let balances1 = await getBalances(farmer2.address);
      let xsolaceAmount1 = balances1.purchaseableVestedXSolace;
      let solaceAmount1 = await xsolace.xSolaceToSolace(xsolaceAmount1);
      let daiAmount1 = await farmRewards.calculateAmountIn(dai.address, xsolaceAmount1);
      await dai.connect(farmer2).approve(farmRewards.address, constants.MaxUint256);
      await farmRewards.connect(farmer2).redeem(dai.address, daiAmount1);
      let balances2 = await getBalances(farmer2.address);
      let balances12 = getBalancesDiff(balances2, balances1);
      expectClose(balances12.redeemedRewards, xsolaceAmount1, PRECISION);
      expect(balances12.farmedRewards).eq(0);
      expectClose(balances12.farmRewardsXSolace, xsolaceAmount1.mul(-1), PRECISION);
      expect(balances12.userDAI).eq(daiAmount1.mul(-1));
      expect(balances12.receiverDAI).eq(0);
      expect(balances12.userSolace).eq(0);
      expectClose(balances12.userXSolace, xsolaceAmount1, PRECISION);
      expectClose(await dai.balanceOf(farmRewardsv2.address), daiAmount1, PRECISION);
      // v2
      let xsolaceAmount2 = balances2.farmedRewards.sub(balances2.redeemedRewards);
      let solaceAmount2 = await xsolace.xSolaceToSolace(xsolaceAmount2);
      let daiAmount2 = await farmRewards.calculateAmountIn(dai.address, xsolaceAmount2);
      await dai.connect(farmer2).approve(farmRewardsv2.address, constants.MaxUint256);
      await farmRewardsv2.connect(farmer2).redeem(dai.address, daiAmount2);
      let balances3 = await getBalances(farmer2.address);
      let balances23 = getBalancesDiff(balances3, balances2);
      expect(balances23.redeemedRewards).eq(0);
      expectClose(balances3.farmedRewards, balances2.redeemedRewards, PRECISION);
      expectClose(balances23.farmedRewards, xsolaceAmount2.mul(-1), PRECISION);
      expectClose(balances23.farmRewardsXSolace, xsolaceAmount2.mul(-1), PRECISION);
      expect(balances23.userDAI).eq(daiAmount2.mul(-1));
      expect(balances23.receiverDAI).eq(daiAmount1.add(daiAmount2));
      expect(balances23.userSolace).eq(0);
      expect(balances23.userXSolace).eq(0);
      expect(await farmRewardsv2.userLock(farmer2.address)).eq(2);
      let lock = await xslocker.locks(2);
      expectClose(lock.amount, solaceAmount2, PRECISION);
      expect(lock.end).eq(VESTING_END);
      expect(await dai.balanceOf(farmRewardsv2.address)).eq(0);
    });
    it("can redeem in full in usdc", async function () {
      let balances1 = await getBalances(farmer3.address);
      let xsolaceAmount = balances1.farmedRewards.sub(balances1.redeemedRewards);
      let solaceAmount = await xsolace.xSolaceToSolace(xsolaceAmount);
      let usdcAmount = await farmRewards.calculateAmountIn(usdc.address, xsolaceAmount);
      await usdc.connect(farmer3).approve(farmRewardsv2.address, constants.MaxUint256);
      await farmRewardsv2.connect(farmer3).redeem(usdc.address, usdcAmount.mul(2));
      let balances2 = await getBalances(farmer3.address);
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.redeemedRewards).eq(0);
      expect(balances2.farmedRewards).eq(balances1.redeemedRewards);
      expect(balancesDiff.farmedRewards).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.farmRewardsXSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.userUSDC).eq(usdcAmount.mul(-1));
      expect(balancesDiff.receiverUSDC).eq(usdcAmount);
      expect(balancesDiff.userSolace).eq(0);
      expect(balancesDiff.userXSolace).eq(0);
      expect(await farmRewardsv2.userLock(farmer3.address)).eq(3);
      let lock = await xslocker.locks(3);
      expect(lock.amount).eq(solaceAmount);
      expect(lock.end).eq(VESTING_END);
    });
  });

  describe("redeem signed", function () {
    before("redeploy", async function () {
      // deploy solace contracts pt 1
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACEV1, [governor.address, solace.address])) as XSolacev1;
      // transfer tokens
      await solace.connect(governor).addMinter(governor.address);
      await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
      await solace.connect(governor).approve(xsolace.address, constants.MaxUint256);
      await xsolace.connect(governor).stake(ONE_ETHER);
      await solace.connect(governor).transfer(xsolace.address, ONE_ETHER.mul(20));
      // deploy solace contracts pt 1
      farmRewards = (await deployContract(deployer, artifacts.FarmRewards, [governor.address, xsolace.address, receiver.address, await xsolace.xSolaceToSolace(ONE_ETHER)])) as FarmRewards;
      await farmRewards.connect(governor).setFarmedRewards([farmer1.address, farmer2.address, farmer3.address], [ONE_ETHER.mul(30), ONE_ETHER, ONE_ETHER]);
      await farmRewards.connect(governor).supportTokens([dai.address, usdc.address, usdt.address]);
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
      // transfer tokens
      await xsolace.connect(governor).stake(ONE_ETHER.mul(100000));
      await xsolace.connect(governor).transfer(farmRewards.address, await xsolace.balanceOf(governor.address));
      // setup farm rewards v2
      farmRewardsv2 = (await deployContract(deployer, artifacts.FarmRewardsV2, [governor.address, solace.address, xsolace.address, farmRewards.address, xslocker.address, receiver.address])) as FarmRewardsV2;
      await farmRewards.connect(governor).setPendingGovernance(farmRewardsv2.address);
      await farmRewardsv2.connect(governor).acceptFarmRewardsV1Governance();
    });
    it("reverts if token not supported", async function () {
      var { v, r, s } = await getERC20PermitSignature(farmer1, farmRewardsv2.address, uni, 1);
      await expect(farmRewardsv2.connect(farmer1).redeemSigned(uni.address, 1, farmer1.address, deadline, v, r, s)).to.be.revertedWith("token in not supported");
    });
    it("can redeem in part", async function () {
      expect(await farmRewardsv2.userLock(farmer1.address)).eq(0);
      let balances1 = await getBalances(farmer1.address);
      let xsolaceAmount = ONE_ETHER;
      let solaceAmount = await xsolace.xSolaceToSolace(xsolaceAmount);
      let daiAmount = await farmRewards.calculateAmountIn(dai.address, xsolaceAmount);
      var { v, r, s } = await getERC20PermitSignature(farmer1, farmRewardsv2.address, dai, daiAmount);
      await farmRewardsv2.connect(farmer1).redeemSigned(dai.address, daiAmount, farmer1.address, deadline, v, r ,s);
      let balances2 = await getBalances(farmer1.address);
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.redeemedRewards).eq(0);
      expect(balancesDiff.farmedRewards).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.farmRewardsXSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.userDAI).eq(daiAmount.mul(-1));
      expect(balancesDiff.receiverDAI).eq(daiAmount);
      expect(balancesDiff.userSolace).eq(0);
      expect(balancesDiff.userXSolace).eq(0);
      expect(await farmRewardsv2.userLock(farmer1.address)).eq(1);
      let lock = await xslocker.locks(1);
      expect(lock.amount).eq(solaceAmount);
      expect(lock.end).eq(VESTING_END);
    });
    it("can redeem in full", async function () {
      let lock1 = await xslocker.locks(1);
      let balances1 = await getBalances(farmer1.address);
      let xsolaceAmount = balances1.farmedRewards.sub(balances1.redeemedRewards);
      let solaceAmount = await xsolace.xSolaceToSolace(xsolaceAmount);
      let daiAmount = await farmRewards.calculateAmountIn(dai.address, xsolaceAmount);
      var { v, r, s } = await getERC20PermitSignature(farmer1, farmRewardsv2.address, dai, daiAmount);
      await farmRewardsv2.connect(farmer1).redeemSigned(dai.address, daiAmount, farmer1.address, deadline, v, r, s);
      let balances2 = await getBalances(farmer1.address);
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.redeemedRewards).eq(0);
      expect(balances2.farmedRewards).eq(balances1.redeemedRewards);
      expect(balancesDiff.farmedRewards).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.farmRewardsXSolace).eq(xsolaceAmount.mul(-1));
      expect(balancesDiff.userDAI).eq(daiAmount.mul(-1));
      expect(balancesDiff.receiverDAI).eq(daiAmount);
      expect(balancesDiff.userSolace).eq(0);
      expect(balancesDiff.userXSolace).eq(0);
      expect(await farmRewardsv2.userLock(farmer1.address)).eq(1);
      let lock = await xslocker.locks(1);
      expect(lock.amount).eq(lock1.amount.add(solaceAmount));
      expect(lock.end).eq(VESTING_END);
    });
    it("can redeem in v1 then in v2", async function () {
      // v1
      expect(await farmRewardsv2.userLock(farmer2.address)).eq(0);
      let balances1 = await getBalances(farmer2.address);
      let xsolaceAmount1 = balances1.purchaseableVestedXSolace;
      let solaceAmount1 = await xsolace.xSolaceToSolace(xsolaceAmount1);
      let daiAmount1 = await farmRewards.calculateAmountIn(dai.address, xsolaceAmount1);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewards.address, dai, daiAmount1);
      await farmRewards.connect(farmer2).redeemSigned(dai.address, daiAmount1, farmer2.address, deadline, v, r, s);
      let balances2 = await getBalances(farmer2.address);
      let balances12 = getBalancesDiff(balances2, balances1);
      expectClose(balances12.redeemedRewards, xsolaceAmount1, PRECISION);
      expect(balances12.farmedRewards).eq(0);
      expectClose(balances12.farmRewardsXSolace, xsolaceAmount1.mul(-1), PRECISION);
      expect(balances12.userDAI).eq(daiAmount1.mul(-1));
      expect(balances12.receiverDAI).eq(0);
      expect(balances12.userSolace).eq(0);
      expectClose(balances12.userXSolace, xsolaceAmount1, PRECISION);
      expectClose(await dai.balanceOf(farmRewardsv2.address), daiAmount1, PRECISION);
      // v2
      let xsolaceAmount2 = balances2.farmedRewards.sub(balances2.redeemedRewards);
      let solaceAmount2 = await xsolace.xSolaceToSolace(xsolaceAmount2);
      let daiAmount2 = await farmRewards.calculateAmountIn(dai.address, xsolaceAmount2);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewardsv2.address, dai, daiAmount2);
      await farmRewardsv2.connect(farmer2).redeemSigned(dai.address, daiAmount2, farmer2.address, deadline, v, r, s);
      let balances3 = await getBalances(farmer2.address);
      let balances23 = getBalancesDiff(balances3, balances2);
      expect(balances23.redeemedRewards).eq(0);
      expectClose(balances3.farmedRewards, balances2.redeemedRewards, PRECISION);
      expectClose(balances23.farmedRewards, xsolaceAmount2.mul(-1), PRECISION);
      expectClose(balances23.farmRewardsXSolace, xsolaceAmount2.mul(-1), PRECISION);
      expect(balances23.userDAI).eq(daiAmount2.mul(-1));
      expect(balances23.receiverDAI).eq(daiAmount1.add(daiAmount2));
      expect(balances23.userSolace).eq(0);
      expect(balances23.userXSolace).eq(0);
      expect(await farmRewardsv2.userLock(farmer2.address)).eq(2);
      let lock = await xslocker.locks(2);
      expectClose(lock.amount, solaceAmount2, PRECISION);
      expect(lock.end).eq(VESTING_END);
      expect(await dai.balanceOf(farmRewardsv2.address)).eq(0);
    });
    it("can withdraw and create new lock", async function () {
      // create lock 1
      let balances1 = await getBalances(farmer3.address);
      let xsolaceAmount1 = ONE_ETHER.div(3);
      let solaceAmount1 = await xsolace.xSolaceToSolace(xsolaceAmount1);
      let usdcAmount1 = await farmRewards.calculateAmountIn(usdc.address, xsolaceAmount1);
      var { v, r, s } = await getERC20PermitSignature(farmer3, farmRewardsv2.address, usdc, usdcAmount1);
      await farmRewardsv2.connect(farmer3).redeemSigned(usdc.address, usdcAmount1, farmer3.address, deadline, v, r, s);
      let balances2 = await getBalances(farmer3.address);
      let balances12 = getBalancesDiff(balances2, balances1);
      expect(balances12.redeemedRewards).eq(0);
      expectClose(balances12.farmedRewards, xsolaceAmount1.mul(-1), PRECISION2);
      expectClose(balances12.farmRewardsXSolace, xsolaceAmount1.mul(-1), PRECISION2);
      expect(balances12.userUSDC).eq(usdcAmount1.mul(-1));
      expect(balances12.receiverUSDC).eq(usdcAmount1);
      expect(balances12.userSolace).eq(0);
      expect(balances12.userXSolace).eq(0);
      expect(await farmRewardsv2.userLock(farmer3.address)).eq(3);
      let lock1 = await xslocker.locks(3);
      expectClose(lock1.amount, solaceAmount1, PRECISION2);
      expect(lock1.end).eq(VESTING_END);
      // withdraw lock 1
      let block = await provider.getBlock('latest');
      if(block.timestamp < VESTING_END) {
        await provider.send("evm_setNextBlockTimestamp", [VESTING_END]);
        await provider.send("evm_mine", []);
      }
      await xslocker.connect(farmer3).withdraw(3, farmer3.address);
      let balances3 = await getBalances(farmer3.address);
      let balances23 = getBalancesDiff(balances3, balances2);
      expectClose(balances23.userSolace, solaceAmount1, PRECISION2);
      // create lock 2
      let xsolaceAmount2 = ONE_ETHER.mul(2).div(3);
      let solaceAmount2 = await xsolace.xSolaceToSolace(xsolaceAmount2);
      let usdcAmount2 = await farmRewards.calculateAmountIn(usdc.address, xsolaceAmount2);
      var { v, r, s } = await getERC20PermitSignature(farmer3, farmRewardsv2.address, usdc, usdcAmount2.mul(2));
      await farmRewardsv2.connect(farmer3).redeemSigned(usdc.address, usdcAmount2.mul(2), farmer3.address, deadline, v, r, s);
      let balances4 = await getBalances(farmer3.address);
      let balances34 = getBalancesDiff(balances4, balances3);
      expect(balances34.redeemedRewards).eq(0);
      expectClose(balances34.farmedRewards, xsolaceAmount2.mul(-1), PRECISION2);
      expectClose(balances34.farmRewardsXSolace, xsolaceAmount2.mul(-1), PRECISION2);
      expectClose(balances34.userUSDC, usdcAmount2.mul(-1), PRECISION2);
      expectClose(balances34.receiverUSDC, usdcAmount2, PRECISION2);
      expect(balances34.userSolace).eq(0);
      expect(balances34.userXSolace).eq(0);
      expect(await farmRewardsv2.userLock(farmer3.address)).eq(4);
      let lock2 = await xslocker.locks(4);
      expectClose(lock2.amount, solaceAmount2, PRECISION2);
      expect(lock2.end).eq(VESTING_END);
    });
  });

  describe("return v1 governance", function () {
    it("reverts if not called by v2 governance", async function () {
      await expect(farmRewardsv2.connect(farmer1).setFarmRewardsV1Governance(governor.address, receiver.address)).to.be.revertedWith("!governance");
    });
    it("returns v1 governance", async function () {
      await farmRewardsv2.connect(governor).setFarmRewardsV1Governance(governor.address, receiver.address);
      expect(await farmRewards.governance()).eq(farmRewardsv2.address);
      expect(await farmRewards.pendingGovernance()).eq(governor.address);
      expect(await farmRewards.receiver()).eq(receiver.address);
      await farmRewards.connect(governor).acceptGovernance();
      expect(await farmRewards.governance()).eq(governor.address);
      expect(await farmRewards.pendingGovernance()).eq(ZERO_ADDRESS);
    });
  });

  describe("rescue tokens", function () {
    it("cannot be called by non governance", async function () {
      await expect(farmRewardsv2.connect(trader).rescueTokens(uni.address, 1)).to.be.revertedWith("!governance");
    });
    it("can rescue tokens", async function () {
      await usdt.connect(farmer1).transfer(farmRewardsv2.address, 15);
      let bal1 = await getBalances(farmer1.address);
      await farmRewardsv2.connect(governor).rescueTokens(usdt.address, 10);
      let bal2 = await getBalances(farmer1.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userUSDT).eq(0);
      expect(bal12.receiverUSDT).eq(10);
      expect(await usdt.balanceOf(farmRewardsv2.address)).eq(5);
    });
  });

  interface Balances {
    userSolace: BN;
    userXSolace: BN;
    farmRewardsXSolace: BN;
    farmedRewards: BN;
    redeemedRewards: BN;
    purchaseableVestedXSolace: BN;
    userDAI: BN;
    userUSDC: BN;
    userUSDT: BN;
    receiverDAI: BN;
    receiverUSDC: BN;
    receiverUSDT: BN;
  }

  async function getBalances(user: string): Promise<Balances> {
    // may throw
    let purchaseableVestedXSolace: BN;
    try { purchaseableVestedXSolace = await farmRewards.purchaseableVestedXSolace(user); }
    catch(e) { purchaseableVestedXSolace = constants.MaxUint256; }

    return {
      userSolace: await solace.balanceOf(user),
      userXSolace: await xsolace.balanceOf(user),
      farmRewardsXSolace: await xsolace.balanceOf(farmRewards.address),
      farmedRewards: await farmRewards.farmedRewards(user),
      redeemedRewards: await farmRewards.redeemedRewards(user),
      purchaseableVestedXSolace: purchaseableVestedXSolace,
      userDAI: await dai.balanceOf(user),
      userUSDC: await usdc.balanceOf(user),
      userUSDT: await usdt.balanceOf(user),
      receiverDAI: await dai.balanceOf(receiver.address),
      receiverUSDC: await usdc.balanceOf(receiver.address),
      receiverUSDT: await usdt.balanceOf(receiver.address)
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userSolace: balances1.userSolace.sub(balances2.userSolace),
      userXSolace: balances1.userXSolace.sub(balances2.userXSolace),
      farmRewardsXSolace: balances1.farmRewardsXSolace.sub(balances2.farmRewardsXSolace),
      farmedRewards: balances1.farmedRewards.sub(balances2.farmedRewards),
      redeemedRewards: balances1.redeemedRewards.sub(balances2.redeemedRewards),
      purchaseableVestedXSolace: balances1.purchaseableVestedXSolace.sub(balances2.purchaseableVestedXSolace),
      userDAI: balances1.userDAI.sub(balances2.userDAI),
      userUSDC: balances1.userUSDC.sub(balances2.userUSDC),
      userUSDT: balances1.userUSDT.sub(balances2.userUSDT),
      receiverDAI: balances1.receiverDAI.sub(balances2.receiverDAI),
      receiverUSDC: balances1.receiverUSDC.sub(balances2.receiverUSDC),
      receiverUSDT: balances1.receiverUSDT.sub(balances2.receiverUSDT)
    };
  }
});
