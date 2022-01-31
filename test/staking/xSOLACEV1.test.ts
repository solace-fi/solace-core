import chai from "chai";
import { ethers, waffle, upgrades } from "hardhat";
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Solace, XSolacev1 } from "./../../typechain";
import { getERC20PermitSignature } from "./../utilities/getERC20PermitSignature";
import { expectDeployed } from "../utilities/expectDeployed";

describe("xSOLACEv1", function () {
  let artifacts: ArtifactImports;
  let solace: Solace;
  let xsolace: XSolacev1;

  const [deployer, governor, depositor1, depositor2, minter] = provider.getWallets();
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_ETHER = BN.from("1000000000000000000");
  const deadline = constants.MaxUint256;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
  });

  describe("deployment", function () {
    it("reverts if zero governance", async function () {
      await expect(deployContract(deployer, artifacts.xSOLACEV1, [ZERO_ADDRESS, solace.address])).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero solace", async function () {
      await expect(deployContract(deployer, artifacts.xSOLACEV1, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address solace");
    });
    it("deploys", async function () {
      xsolace = (await deployContract(deployer, artifacts.xSOLACEV1, [governor.address, solace.address])) as XSolacev1;
      await expectDeployed(xsolace.address);
    });
    it("starts with correct solace", async function () {
      expect(await xsolace.solace()).eq(solace.address);
    });
  });

  describe("stake 1:1", function () {
    it("cannot stake without balance", async function () {
      await expect(xsolace.connect(depositor1).stake(ONE_ETHER)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot stake without approval", async function () {
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(depositor1.address, ONE_ETHER.mul(10));
      await expect(xsolace.connect(depositor1).stake(ONE_ETHER)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("can stake", async function () {
      await solace.connect(depositor1).approve(xsolace.address, ONE_ETHER.mul(2));
      let bal1 = await getBalances(depositor1);
      expect(bal1.totalSolace).eq(ONE_ETHER.mul(10));
      expect(bal1.totalXSolace).eq(0);
      expect(bal1.userSolace).eq(ONE_ETHER.mul(10));
      expect(bal1.userXSolace).eq(0);
      expect(bal1.stakingSolace).eq(0);
      expect(bal1.stakingXSolace).eq(0);
      expect(bal1.allowanceSolace).eq(ONE_ETHER.mul(2));
      expect(bal1.allowanceXSolace).eq(0);
      let amountXSolace1 = await xsolace.connect(depositor1).callStatic.stake(ONE_ETHER);
      expect(amountXSolace1).eq(ONE_ETHER);
      let tx1 = await xsolace.connect(depositor1).stake(ONE_ETHER);
      await expect(tx1).to.emit(xsolace, "Staked").withArgs(depositor1.address, ONE_ETHER, ONE_ETHER);
      let bal2 = await getBalances(depositor1);
      expect(bal2.totalSolace).eq(ONE_ETHER.mul(10));
      expect(bal2.totalXSolace).eq(ONE_ETHER);
      expect(bal2.userSolace).eq(ONE_ETHER.mul(9));
      expect(bal2.userXSolace).eq(ONE_ETHER);
      expect(bal2.stakingSolace).eq(ONE_ETHER);
      expect(bal2.stakingXSolace).eq(0);
      expect(bal2.allowanceSolace).eq(ONE_ETHER);
      expect(bal2.allowanceXSolace).eq(0);
      let amountXSolace2 = await xsolace.connect(depositor1).callStatic.stake(ONE_ETHER);
      expect(amountXSolace2).eq(ONE_ETHER);
      let tx2 = await xsolace.connect(depositor1).stake(ONE_ETHER);
      await expect(tx2).to.emit(xsolace, "Staked").withArgs(depositor1.address, ONE_ETHER, ONE_ETHER);
      let bal3 = await getBalances(depositor1);
      expect(bal3.totalSolace).eq(ONE_ETHER.mul(10));
      expect(bal3.totalXSolace).eq(ONE_ETHER.mul(2));
      expect(bal3.userSolace).eq(ONE_ETHER.mul(8));
      expect(bal3.userXSolace).eq(ONE_ETHER.mul(2));
      expect(bal3.stakingSolace).eq(ONE_ETHER.mul(2));
      expect(bal3.stakingXSolace).eq(0);
      expect(bal3.allowanceSolace).eq(0);
      expect(bal3.allowanceXSolace).eq(0);
    });
    it("can deposit solace with permit", async function () {
      let { v, r, s } = await getERC20PermitSignature(depositor1, xsolace.address, solace, ONE_ETHER);
      let tx1 = await xsolace.connect(depositor2).stakeSigned(depositor1.address, ONE_ETHER, deadline, v, r, s);
      await expect(tx1).to.emit(xsolace, "Staked").withArgs(depositor1.address, ONE_ETHER, ONE_ETHER);
      let bal1 = await getBalances(depositor1);
      expect(bal1.totalSolace).eq(ONE_ETHER.mul(10));
      expect(bal1.totalXSolace).eq(ONE_ETHER.mul(3));
      expect(bal1.userSolace).eq(ONE_ETHER.mul(7));
      expect(bal1.userXSolace).eq(ONE_ETHER.mul(3));
      expect(bal1.stakingSolace).eq(ONE_ETHER.mul(3));
      expect(bal1.stakingXSolace).eq(0);
      expect(bal1.allowanceSolace).eq(0);
      expect(bal1.allowanceXSolace).eq(0);
    });
    it("cannot unstake without balance", async function () {
      await expect(xsolace.connect(depositor2).unstake(ONE_ETHER)).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
    it("can unstake", async function () {
      await xsolace.connect(depositor1).transfer(depositor2.address, ONE_ETHER.mul(3));
      let bal1 = await getBalances(depositor2);
      expect(bal1.totalSolace).eq(ONE_ETHER.mul(10));
      expect(bal1.totalXSolace).eq(ONE_ETHER.mul(3));
      expect(bal1.userSolace).eq(0);
      expect(bal1.userXSolace).eq(ONE_ETHER.mul(3));
      expect(bal1.stakingSolace).eq(ONE_ETHER.mul(3));
      expect(bal1.stakingXSolace).eq(0);
      expect(bal1.allowanceSolace).eq(0);
      expect(bal1.allowanceXSolace).eq(0);
      let amountSolace = await xsolace.connect(depositor2).callStatic.unstake(ONE_ETHER);
      expect(amountSolace).eq(ONE_ETHER);
      let tx1 = await xsolace.connect(depositor2).unstake(ONE_ETHER);
      await expect(tx1).to.emit(xsolace, "Unstaked").withArgs(depositor2.address, ONE_ETHER, ONE_ETHER);
      let bal2 = await getBalances(depositor2);
      expect(bal2.totalSolace).eq(ONE_ETHER.mul(10));
      expect(bal2.totalXSolace).eq(ONE_ETHER.mul(2));
      expect(bal2.userSolace).eq(ONE_ETHER);
      expect(bal2.userXSolace).eq(ONE_ETHER.mul(2));
      expect(bal2.stakingSolace).eq(ONE_ETHER.mul(2));
      expect(bal2.stakingXSolace).eq(0);
      expect(bal2.allowanceSolace).eq(0);
      expect(bal2.allowanceXSolace).eq(0);
    });
  });

  describe("stake uneven", function () {
    before(async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACEV1, [governor.address, solace.address])) as XSolacev1;
      await solace.connect(governor).addMinter(minter.address);
    });
    it("should initially return 1:1 SOLACE:xSOLACE", async function () {
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
    });
    it("should return 1:1 with only solace", async function () {
      await solace.connect(minter).mint(xsolace.address, ONE_ETHER.mul(10));
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
    });
    it("should change with uneven amounts", async function () {
      await solace.connect(minter).mint(depositor1.address, ONE_ETHER.mul(10));
      await solace.connect(depositor1).approve(xsolace.address, ONE_ETHER.mul(10));
      let amountXSolace = await xsolace.connect(depositor1).callStatic.stake(ONE_ETHER.mul(5));
      expect(amountXSolace).eq(ONE_ETHER.mul(5));
      let tx1 = await xsolace.connect(depositor1).stake(ONE_ETHER.mul(5));
      await expect(tx1).to.emit(xsolace, "Staked").withArgs(depositor1.address, ONE_ETHER.mul(5), ONE_ETHER.mul(5));
      let bal1 = await getBalances(depositor1);
      expect(bal1.totalSolace).eq(ONE_ETHER.mul(20));
      expect(bal1.totalXSolace).eq(ONE_ETHER.mul(5));
      expect(bal1.userSolace).eq(ONE_ETHER.mul(5));
      expect(bal1.userXSolace).eq(ONE_ETHER.mul(5));
      expect(bal1.stakingSolace).eq(ONE_ETHER.mul(15));
      expect(bal1.stakingXSolace).eq(0);
      expect(bal1.allowanceSolace).eq(ONE_ETHER.mul(5));
      expect(bal1.allowanceXSolace).eq(0);
      expect(await xsolace.solaceToXSolace(ONE_ETHER.mul(6))).to.equal(ONE_ETHER.mul(2));
      expect(await xsolace.xSolaceToSolace(ONE_ETHER.mul(4))).to.equal(ONE_ETHER.mul(12));
    });
    it("staking should maintain ratio", async function () {
      await solace.connect(minter).mint(depositor2.address, ONE_ETHER.mul(20));
      await solace.connect(depositor2).approve(xsolace.address, ONE_ETHER.mul(20));
      let amountXSolace = await xsolace.connect(depositor2).callStatic.stake(ONE_ETHER.mul(9));
      expect(amountXSolace).eq(ONE_ETHER.mul(3));
      let tx1 = await xsolace.connect(depositor2).stake(ONE_ETHER.mul(9));
      await expect(tx1).to.emit(xsolace, "Staked").withArgs(depositor2.address, ONE_ETHER.mul(9), ONE_ETHER.mul(3));
      let bal1 = await getBalances(depositor2);
      expect(bal1.totalSolace).eq(ONE_ETHER.mul(40));
      expect(bal1.totalXSolace).eq(ONE_ETHER.mul(8));
      expect(bal1.userSolace).eq(ONE_ETHER.mul(11));
      expect(bal1.userXSolace).eq(ONE_ETHER.mul(3));
      expect(bal1.stakingSolace).eq(ONE_ETHER.mul(24));
      expect(bal1.stakingXSolace).eq(0);
      expect(bal1.allowanceSolace).eq(ONE_ETHER.mul(11));
      expect(bal1.allowanceXSolace).eq(0);
      expect(await xsolace.solaceToXSolace(ONE_ETHER.mul(6))).to.equal(ONE_ETHER.mul(2));
      expect(await xsolace.xSolaceToSolace(ONE_ETHER.mul(4))).to.equal(ONE_ETHER.mul(12));
    });
    it("solace rewards should change ratio", async function () {
      await solace.connect(minter).mint(xsolace.address, ONE_ETHER.mul(8));
      let bal1 = await getBalances(depositor2);
      expect(bal1.totalSolace).eq(ONE_ETHER.mul(48));
      expect(bal1.totalXSolace).eq(ONE_ETHER.mul(8));
      expect(bal1.userSolace).eq(ONE_ETHER.mul(11));
      expect(bal1.userXSolace).eq(ONE_ETHER.mul(3));
      expect(bal1.stakingSolace).eq(ONE_ETHER.mul(32));
      expect(bal1.stakingXSolace).eq(0);
      expect(bal1.allowanceSolace).eq(ONE_ETHER.mul(11));
      expect(bal1.allowanceXSolace).eq(0);
      expect(await xsolace.solaceToXSolace(ONE_ETHER.mul(8))).to.equal(ONE_ETHER.mul(2));
      expect(await xsolace.xSolaceToSolace(ONE_ETHER.mul(4))).to.equal(ONE_ETHER.mul(16));
    });
    it("unstaking should maintain ratio", async function () {
      let amountSolace = await xsolace.connect(depositor1).callStatic.unstake(ONE_ETHER.mul(2));
      expect(amountSolace).eq(ONE_ETHER.mul(8));
      let tx1 = await xsolace.connect(depositor2).unstake(ONE_ETHER.mul(2));
      await expect(tx1).to.emit(xsolace, "Unstaked").withArgs(depositor2.address, ONE_ETHER.mul(8), ONE_ETHER.mul(2));
      let bal1 = await getBalances(depositor2);
      expect(bal1.totalSolace).eq(ONE_ETHER.mul(48));
      expect(bal1.totalXSolace).eq(ONE_ETHER.mul(6));
      expect(bal1.userSolace).eq(ONE_ETHER.mul(19));
      expect(bal1.userXSolace).eq(ONE_ETHER.mul(1));
      expect(bal1.stakingSolace).eq(ONE_ETHER.mul(24));
      expect(bal1.stakingXSolace).eq(0);
      expect(bal1.allowanceSolace).eq(ONE_ETHER.mul(11));
      expect(bal1.allowanceXSolace).eq(0);
      expect(await xsolace.solaceToXSolace(ONE_ETHER.mul(8))).to.equal(ONE_ETHER.mul(2));
      expect(await xsolace.xSolaceToSolace(ONE_ETHER.mul(4))).to.equal(ONE_ETHER.mul(16));
    });
    it("burning xsolace should change ratio", async function () {
      await xsolace.connect(depositor1).burn(ONE_ETHER.mul(3));
      let bal1 = await getBalances(depositor1);
      expect(bal1.totalSolace).eq(ONE_ETHER.mul(48));
      expect(bal1.totalXSolace).eq(ONE_ETHER.mul(3));
      expect(bal1.userSolace).eq(ONE_ETHER.mul(5));
      expect(bal1.userXSolace).eq(ONE_ETHER.mul(2));
      expect(bal1.stakingSolace).eq(ONE_ETHER.mul(24));
      expect(bal1.stakingXSolace).eq(0);
      expect(bal1.allowanceSolace).eq(ONE_ETHER.mul(5));
      expect(bal1.allowanceXSolace).eq(0);
      expect(await xsolace.solaceToXSolace(ONE_ETHER.mul(16))).to.equal(ONE_ETHER.mul(2));
      expect(await xsolace.xSolaceToSolace(ONE_ETHER.mul(4))).to.equal(ONE_ETHER.mul(32));
    });
  });

  describe("burn", function () {
    it("anyone can burn", async function () {
      let bal1 = await xsolace.balanceOf(depositor1.address);
      expect(bal1).gt(0);
      await xsolace.connect(depositor1).burn(bal1);
      let bal2 = await xsolace.balanceOf(depositor1.address);
      expect(bal2).eq(0);
    });
    it("cannot burn more than balance", async function () {
      let bal1 = await xsolace.balanceOf(depositor2.address);
      expect(bal1).gt(0);
      await expect(xsolace.connect(depositor2).burn(bal1.add(1))).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
  });

  interface Balances {
    userSolace: BN;
    userXSolace: BN;
    stakingSolace: BN;
    stakingXSolace: BN;
    totalSolace: BN;
    totalXSolace: BN;
    allowanceSolace: BN;
    allowanceXSolace: BN;
  }

  async function getBalances(user: Wallet): Promise<Balances> {
    return {
      userSolace: await solace.balanceOf(user.address),
      userXSolace: await xsolace.balanceOf(user.address),
      stakingSolace: await solace.balanceOf(xsolace.address),
      stakingXSolace: await xsolace.balanceOf(xsolace.address),
      totalSolace: await solace.totalSupply(),
      totalXSolace: await xsolace.totalSupply(),
      allowanceSolace: await solace.allowance(user.address, xsolace.address),
      allowanceXSolace: await xsolace.allowance(user.address, xsolace.address)
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userSolace: balances1.userSolace.sub(balances2.userSolace),
      userXSolace: balances1.userXSolace.sub(balances2.userXSolace),
      stakingSolace: balances1.stakingSolace.sub(balances2.stakingSolace),
      stakingXSolace: balances1.stakingXSolace.sub(balances2.stakingXSolace),
      totalSolace: balances1.totalSolace.sub(balances2.totalSolace),
      totalXSolace: balances1.totalXSolace.sub(balances2.totalXSolace),
      allowanceSolace: balances1.allowanceSolace.sub(balances2.allowanceSolace),
      allowanceXSolace: balances1.allowanceXSolace.sub(balances2.allowanceXSolace)
    };
  }
});
