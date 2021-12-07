import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, XSolace, Vault, OptionsFarming, FarmRewards, CpFarm, Weth9, PolicyManager, RiskManager, Registry, MockErc20Decimals, MockErc20Permit } from "../typechain";
import { bnAddSub, bnMulDiv, expectClose } from "./utilities/math";
import { getERC20PermitSignature } from "./utilities/getERC20PermitSignature";
import { readFileSync } from "fs";

chai.use(solidity);

// contracts
let solace: Solace;
let xsolace: XSolace;
let farmRewards: FarmRewards;

// tokens
let usdc: MockErc20Permit;
let usdt: MockErc20Decimals;
let dai: MockErc20Permit;
let uni: MockErc20Permit;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_THOUSAND_ETHER = BN.from("1000000000000000000000");
const FIFTY_THOUSAND_ETHER = BN.from("50000000000000000000000");
const REWARD_AMOUNT = ONE_THOUSAND_ETHER;
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
const FOUR_THOUSAND_USDC = BN.from("4000000000");

const VESTING_START = 1638316800; // midnight UTC before December 1, 2021
const VESTING_END = 1651363200; // midnight UTC before May 1, 2022
const SOLACE_PER_XSOLACE = 21;
const SOLACE_PER_XSOLACE_FULL = ONE_ETHER.mul(SOLACE_PER_XSOLACE);
const PRICE_USDC = BN.from("30000").mul(SOLACE_PER_XSOLACE); // 3 cents USDC per solace
const PRICE_DAI = BN.from("30000000000000000").mul(SOLACE_PER_XSOLACE); // 3 cents DAI per solace
const deadline = constants.MaxUint256;

describe("FarmRewards", function () {
  const [deployer, governor, farmer1, farmer2, trader, receiver] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy tokens
    usdc = (await deployContract(deployer, artifacts.MockERC20Permit, ["USD Coin", "USDC", constants.MaxUint256, 6])) as MockErc20Permit;
    usdt = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Tether USD", "USDT", constants.MaxUint256, 6])) as MockErc20Decimals;
    dai = (await deployContract(deployer, artifacts.MockERC20Permit, ["DAI Stablecoin", "DAI", constants.MaxUint256, 18])) as MockErc20Permit;
    uni = (await deployContract(deployer, artifacts.MockERC20Permit, ["UNI", "UNI", constants.MaxUint256, 18])) as MockErc20Permit;

    // deploy solace contracts
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;

    // transfer tokens
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solace.connect(governor).approve(xsolace.address, constants.MaxUint256);
    await xsolace.connect(governor).stake(ONE_MILLION_ETHER);
    await dai.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await usdc.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await usdt.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await uni.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await dai.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await usdc.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await usdt.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await uni.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
  });

  describe("deployment", function () {
    it("verifies inputs", async function () {
      await expect(deployContract(deployer, artifacts.FarmRewards, [ZERO_ADDRESS, xsolace.address, receiver.address, 1])).to.be.revertedWith("zero address governance");
      await expect(deployContract(deployer, artifacts.FarmRewards, [governor.address, ZERO_ADDRESS, receiver.address, 1])).to.be.revertedWith("zero address xsolace");
      await expect(deployContract(deployer, artifacts.FarmRewards, [governor.address, xsolace.address, ZERO_ADDRESS, 1])).to.be.revertedWith("zero address receiver");
    });
    it("deploys successfully", async function () {
      farmRewards = (await deployContract(deployer, artifacts.FarmRewards, [governor.address, xsolace.address, receiver.address, SOLACE_PER_XSOLACE_FULL])) as FarmRewards;
      await solace.connect(governor).mint(farmRewards.address, ONE_MILLION_ETHER);
    });
    it("returns correct values", async function () {
      expect(await farmRewards.xsolace()).eq(xsolace.address);
      expect(await farmRewards.receiver()).eq(receiver.address);
      expect(await farmRewards.vestingStart()).eq(VESTING_START);
      expect(await farmRewards.vestingEnd()).eq(VESTING_END);
      expect(await farmRewards.solacePerXSolace()).eq(SOLACE_PER_XSOLACE_FULL);
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await farmRewards.governance()).to.equal(governor.address);
    });
    it("rejects setting pending governance by non governor", async function () {
      await expect(farmRewards.connect(farmer1).setPendingGovernance(farmer1.address)).to.be.revertedWith("!governance");
    });
    it("can set pending governance", async function () {
      let tx = await farmRewards.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(farmRewards, "GovernancePending").withArgs(deployer.address);
      expect(await farmRewards.governance()).to.equal(governor.address);
      expect(await farmRewards.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(farmRewards.connect(farmer1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function () {
      let tx = await farmRewards.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(farmRewards, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await farmRewards.governance()).to.equal(deployer.address);
      expect(await farmRewards.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await farmRewards.connect(deployer).setPendingGovernance(governor.address);
      await farmRewards.connect(governor).acceptGovernance();
    });
  });

  describe("supported tokens", function () {
    it("starts with no supported tokens", async function () {
      expect(await farmRewards.tokenInSupported(dai.address)).eq(false);
    });
    it("non governance cannot add supported tokens", async function () {
      await expect(farmRewards.connect(trader).supportTokens([])).to.be.revertedWith("!governance");
    });
    it("cannot add zero address", async function () {
      await expect(farmRewards.connect(governor).supportTokens([dai.address, ZERO_ADDRESS])).to.be.revertedWith("zero address token");
    });
    it("can add support for tokens", async function () {
      await farmRewards.connect(governor).supportTokens([dai.address, usdc.address, usdt.address]);
      expect(await farmRewards.tokenInSupported(dai.address)).eq(true);
      expect(await farmRewards.tokenInSupported(usdc.address)).eq(true);
      expect(await farmRewards.tokenInSupported(usdt.address)).eq(true);
      expect(await farmRewards.tokenInSupported(uni.address)).eq(false);
    });
  });

  describe("receiver", function () {
    it("starts set", async function () {
      expect(await farmRewards.receiver()).to.equal(receiver.address);
    });
    it("cannot be set by non governance", async function () {
      await expect(farmRewards.connect(farmer1).setReceiver(trader.address)).to.be.revertedWith("!governance");
    });
    it("cannot set to zero", async function () {
      await expect(farmRewards.connect(governor).setReceiver(ZERO_ADDRESS)).to.be.revertedWith("zero address receiver");
    });
    it("can be set", async function () {
      let tx = await farmRewards.connect(governor).setReceiver(trader.address);
      expect(tx).to.emit(farmRewards, "ReceiverSet").withArgs(trader.address);
      expect(await farmRewards.receiver()).to.equal(trader.address);
      await farmRewards.connect(governor).setReceiver(receiver.address);
    });
  });

  describe("set farmed rewards", function () {
    it("cannot be set by non governance", async function () {
      await expect(farmRewards.connect(trader).setFarmedRewards([],[])).to.be.revertedWith("!governance");
    });
    it("checks length mismatch", async function () {
      await expect(farmRewards.connect(governor).setFarmedRewards([],[1])).to.be.revertedWith("length mismatch");
    })
    it("can be set", async function () {
      let farmers;
      let rewards;
      try {
        farmers = JSON.parse(readFileSync("./stash/cp farmers.json").toString());
        rewards = JSON.parse(readFileSync("./stash/cp farm rewards.json").toString());
        if(farmers.length != rewards.length) throw("length mismatch");
      } catch (e) {
        console.log('e')
        farmers = [deployer.address, governor.address, farmer1.address, farmer2.address, trader.address, receiver.address];
        rewards = [11, 12, 13, 14, 15, 16];
      }
      await farmRewards.connect(governor).setFarmedRewards(farmers, rewards);
      for(var i = 0; i < farmers.length; ++i) {
        expect(await farmRewards.farmedRewards(farmers[i])).eq(rewards[i]);
      }
    });
  });

  describe("calculate amounts", function () {
    it("cannot use unsupported tokens", async function () {
      await expect(farmRewards.calculateAmountIn(uni.address, 1)).to.be.revertedWith("token in not supported");
      await expect(farmRewards.calculateAmountOut(uni.address, 1)).to.be.revertedWith("token in not supported");
    });
    it("can calculate amount in", async function () {
      const ONE_HUNDRED_SOLACE = ONE_ETHER.mul(100);
      expect(await farmRewards.calculateAmountIn(dai.address, ONE_HUNDRED_SOLACE)).eq(PRICE_DAI.mul(100));
      expect(await farmRewards.calculateAmountIn(usdc.address, ONE_HUNDRED_SOLACE)).eq(PRICE_USDC.mul(100));
    });
    it("can calculate amount out", async function () {
      const ONE_HUNDRED_DAI = ONE_ETHER.mul(100);
      const ONE_HUNDRED_USDC = BN.from("100000000");
      expect(await farmRewards.calculateAmountOut(dai.address, ONE_HUNDRED_DAI)).eq(ONE_ETHER.mul(100).mul(100).div(3).div(SOLACE_PER_XSOLACE));
      expect(await farmRewards.calculateAmountOut(usdc.address, ONE_HUNDRED_USDC)).eq(ONE_ETHER.mul(100).mul(100).div(3).div(SOLACE_PER_XSOLACE));
    });
  });

  describe("redeem", function () {
    let tolerance = BN.from("10000000000000000"); // 1e15
    before(async function () {
      await farmRewards.connect(governor).setFarmedRewards([farmer1.address], [ONE_ETHER.mul(10000)]);
      await farmRewards.connect(governor).setFarmedRewards([farmer2.address], [ONE_ETHER.mul(10000)]);
      await xsolace.connect(governor).transfer(farmRewards.address, ONE_MILLION_ETHER);
    });
    it("non farmer should not be eligible for rewards", async function () {
      expect(await farmRewards.purchaseableVestedXSolace(trader.address)).eq(0);
    });
    it("farmer should be eligible for rewards", async function () {
      expect(await farmRewards.purchaseableVestedXSolace(farmer1.address)).gt(0);
    })
    it("cannot redeem with unsupported token", async function () {
      await expect(farmRewards.connect(trader).redeem(uni.address, 1)).to.be.revertedWith("token in not supported");
    });
    it("can redeem using too much input", async function () {
      let amountIn1 = ONE_ETHER.mul(10000);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(dai.address, amountIn1);
      let bal1 = await getBalances(farmer1.address);
      await dai.connect(farmer1).approve(farmRewards.address, amountIn1);
      await farmRewards.connect(farmer1).redeem(dai.address, amountIn1);
      let bal2 = await getBalances(farmer1.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      let actualAmountOut1 = bal12.userXSolace;
      expect(actualAmountOut1).to.be.lt(expectedAmountOut1);
      expectClose(actualAmountOut1, bal1.purchaseableVestedXSolace, tolerance);
      expect(bal12.farmRewardsXSolace.mul(-1)).eq(actualAmountOut1);
      expect(bal2.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn1 = await farmRewards.calculateAmountIn(dai.address, actualAmountOut1);
      expect(expectedAmountIn1).to.be.lt(amountIn1);
      expectClose(expectedAmountIn1, bal12.userDAI.mul(-1), tolerance);

      let amountIn2 = BN.from(1000000).mul(10000);
      let expectedAmountOut2 = await farmRewards.calculateAmountOut(usdc.address, amountIn2);
      await usdc.connect(farmer1).approve(farmRewards.address, amountIn2);
      await farmRewards.connect(farmer1).redeem(usdc.address, amountIn2);
      let bal3 = await getBalances(farmer1.address);
      let bal23 = getBalancesDiff(bal3, bal2);
      let actualAmountOut2 = bal23.userXSolace;
      expect(actualAmountOut2).to.be.lt(expectedAmountOut2);
      expectClose(actualAmountOut2, bal2.purchaseableVestedXSolace, tolerance);
      expect(bal23.farmRewardsXSolace.mul(-1)).eq(actualAmountOut2);
      expect(bal3.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn2 = await farmRewards.calculateAmountIn(usdc.address, actualAmountOut2);
      expect(expectedAmountIn2).to.be.lt(amountIn2);
      expectClose(expectedAmountIn2, bal23.userUSDC.mul(-1), 10000);
    });
    it("can redeem signed using too much input", async function () {
      let amountIn1 = ONE_ETHER.mul(10000);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(dai.address, amountIn1);
      let bal1 = await getBalances(farmer2.address);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewards.address, dai, amountIn1);
      await farmRewards.connect(trader).redeemSigned(dai.address, amountIn1, farmer2.address, deadline, v, r, s);
      let bal2 = await getBalances(farmer2.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      let actualAmountOut1 = bal12.userXSolace;
      expect(actualAmountOut1).to.be.lt(expectedAmountOut1);
      expectClose(actualAmountOut1, bal1.purchaseableVestedXSolace, tolerance);
      expect(bal12.farmRewardsXSolace.mul(-1)).eq(actualAmountOut1);
      expect(bal2.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn1 = await farmRewards.calculateAmountIn(dai.address, actualAmountOut1);
      expect(expectedAmountIn1).to.be.lt(amountIn1);
      expectClose(expectedAmountIn1, bal12.userDAI.mul(-1), tolerance);

      let amountIn2 = BN.from(1000000).mul(10000);
      let expectedAmountOut2 = await farmRewards.calculateAmountOut(usdc.address, amountIn2);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewards.address, usdc, amountIn2);
      await farmRewards.connect(trader).redeemSigned(usdc.address, amountIn2, farmer2.address, deadline, v, r, s);
      let bal3 = await getBalances(farmer2.address);
      let bal23 = getBalancesDiff(bal3, bal2);
      let actualAmountOut2 = bal23.userXSolace;
      expect(actualAmountOut2).to.be.lt(expectedAmountOut2);
      expectClose(actualAmountOut2, bal2.purchaseableVestedXSolace, tolerance);
      expect(bal23.farmRewardsXSolace.mul(-1)).eq(actualAmountOut2);
      expect(bal3.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn2 = await farmRewards.calculateAmountIn(usdc.address, actualAmountOut2);
      expect(expectedAmountIn2).to.be.lt(amountIn2);
      expectClose(expectedAmountIn2, bal23.userUSDC.mul(-1), 10000);
    });
    it("can redeem using reasonable input", async function () {
      let timestamp = (VESTING_START+VESTING_END)/2; // halfway vested
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);

      let amountIn1 = ONE_ETHER.mul(100);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(dai.address, amountIn1);
      let bal1 = await getBalances(farmer1.address);
      await dai.connect(farmer1).approve(farmRewards.address, amountIn1);
      await farmRewards.connect(farmer1).redeem(dai.address, amountIn1);
      let bal2 = await getBalances(farmer1.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userXSolace).to.be.eq(expectedAmountOut1);
      expect(bal12.farmRewardsXSolace.mul(-1)).to.be.eq(expectedAmountOut1);
      expect(bal12.userDAI.mul(-1)).eq(amountIn1);

      let amountIn2 = BN.from(1000000).mul(100);
      let expectedAmountOut2 = await farmRewards.calculateAmountOut(usdc.address, amountIn2);
      await usdc.connect(farmer1).approve(farmRewards.address, amountIn2);
      await farmRewards.connect(farmer1).redeem(usdc.address, amountIn2);
      let bal3 = await getBalances(farmer1.address);
      let bal23 = getBalancesDiff(bal3, bal2);
      expect(bal23.userXSolace).to.be.eq(expectedAmountOut2);
      expect(bal23.farmRewardsXSolace.mul(-1)).to.be.eq(expectedAmountOut2);
      expect(bal23.userUSDC.mul(-1)).eq(amountIn2);
    });
    it("can redeem signed using reasonable input", async function () {
      let amountIn1 = ONE_ETHER.mul(100);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(dai.address, amountIn1);
      let bal1 = await getBalances(farmer2.address);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewards.address, dai, amountIn1);
      await farmRewards.connect(trader).redeemSigned(dai.address, amountIn1, farmer2.address, deadline, v, r, s);
      let bal2 = await getBalances(farmer2.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userXSolace).to.be.eq(expectedAmountOut1);
      expect(bal12.farmRewardsXSolace.mul(-1)).to.be.eq(expectedAmountOut1);
      expect(bal12.userDAI.mul(-1)).eq(amountIn1);

      let amountIn2 = BN.from(1000000).mul(100);
      let expectedAmountOut2 = await farmRewards.calculateAmountOut(usdc.address, amountIn2);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewards.address, usdc, amountIn2);
      await farmRewards.connect(trader).redeemSigned(usdc.address, amountIn2, farmer2.address, deadline, v, r, s);
      let bal3 = await getBalances(farmer2.address);
      let bal23 = getBalancesDiff(bal3, bal2);
      expect(bal23.userXSolace).to.be.eq(expectedAmountOut2);
      expect(bal23.farmRewardsXSolace.mul(-1)).to.be.eq(expectedAmountOut2);
      expect(bal23.userUSDC.mul(-1)).eq(amountIn2);
    });
    it("can redeem in full", async function () {
      let timestamp = VESTING_END+1; // fully vested
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);

      let amountIn1 = BN.from(1000000).mul(10000);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(usdt.address, amountIn1);
      let bal1 = await getBalances(farmer1.address);
      await usdt.connect(farmer1).approve(farmRewards.address, amountIn1);
      await farmRewards.connect(farmer1).redeem(usdt.address, amountIn1);
      let bal2 = await getBalances(farmer1.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      let actualAmountOut1 = bal12.userXSolace;
      expect(actualAmountOut1).to.be.lt(expectedAmountOut1);
      expectClose(actualAmountOut1, bal1.purchaseableVestedXSolace, tolerance);
      expect(bal12.farmRewardsXSolace.mul(-1)).eq(actualAmountOut1);
      expect(bal2.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn1 = await farmRewards.calculateAmountIn(usdt.address, actualAmountOut1);
      expect(expectedAmountIn1).to.be.lt(amountIn1);
      expectClose(expectedAmountIn1, bal12.userUSDT.mul(-1), tolerance);
    });
  });

  describe("return xSOLACE", function () {
    it("cannot be called by non governance", async function () {
      await expect(farmRewards.connect(trader).returnXSolace(1)).to.be.revertedWith("!governance");
    });
    it("can return xSOLACE", async function () {
      let bal1 = await getBalances(receiver.address);
      await farmRewards.connect(governor).returnXSolace(ONE_ETHER);
      let bal2 = await getBalances(receiver.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userXSolace).eq(ONE_ETHER);
      expect(bal12.farmRewardsXSolace).eq(ONE_ETHER.mul(-1));
    });
  });

  interface Balances {
    userXSolace: BN;
    farmRewardsXSolace: BN;
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
    return {
      userXSolace: await xsolace.balanceOf(user),
      farmRewardsXSolace: await xsolace.balanceOf(farmRewards.address),
      redeemedRewards: await farmRewards.redeemedRewards(user),
      purchaseableVestedXSolace: await farmRewards.purchaseableVestedXSolace(user),
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
      userXSolace: balances1.userXSolace.sub(balances2.userXSolace),
      farmRewardsXSolace: balances1.farmRewardsXSolace.sub(balances2.farmRewardsXSolace),
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
