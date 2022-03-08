import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet, utils } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { getERC20PermitSignature } from "./utilities/getERC20PermitSignature";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, MockErc20, BridgeWrapper } from "./../typechain";
import { expectDeployed } from "./utilities/expectDeployed";

// contracts
let solace: Solace;
let bsolace: MockErc20;
let wrapper: BridgeWrapper;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const deadline = constants.MaxUint256;

describe("BridgeWrapper", function () {
  const [deployer, governor, user1, user2, user3] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    await solace.connect(governor).addMinter(governor.address);
    bsolace = (await deployContract(deployer, artifacts.MockERC20, ["Bridged SOLACE", "bSOLACE", 0])) as MockErc20;
  });

  describe("deployment", function () {
    it("reverts if zero solace", async function () {
      await expect(deployContract(deployer, artifacts.BridgeWrapper, [ZERO_ADDRESS, bsolace.address])).to.be.revertedWith("zero address solace");
    });
    it("reverts if zero bsolace", async function () {
      await expect(deployContract(deployer, artifacts.BridgeWrapper, [solace.address, ZERO_ADDRESS])).to.be.revertedWith("zero address bsolace");
    });
    it("deploys", async function () {
      wrapper = (await deployContract(deployer, artifacts.BridgeWrapper, [solace.address, bsolace.address])) as BridgeWrapper;
      await expectDeployed(wrapper.address);
    });
    it("initializes properly", async function () {
      expect(await wrapper.solace()).eq(solace.address);
      expect(await wrapper.bsolace()).eq(bsolace.address);
    });
  });

  describe("unwrap", function () {
    before(async function () {
      let bal1 = await getBalances();
      expect(bal1.user1Solace).eq(0);
      expect(bal1.user1BSolace).eq(0);
      expect(bal1.user2Solace).eq(0);
      expect(bal1.user2BSolace).eq(0);
      expect(bal1.totalSolace).eq(0);
      expect(bal1.totalBSolace).eq(0);
      expect(bal1.lockedBSolace).eq(0);
    });
    it("cannot unwrap if not solace minter", async function () {
      await expect(wrapper.connect(user1).bsolaceToSolace(0, user2.address)).to.be.revertedWith("!minter");
      await solace.connect(governor).addMinter(wrapper.address);
    });
    it("can unwrap zero", async function () {
      let bal1 = await getBalances();
      let tx = await wrapper.connect(user1).bsolaceToSolace(0, user2.address);
      await expect(tx).to.emit(wrapper, "Unwrapped").withArgs(user1.address, user2.address, 0);
      let bal2 = await getBalances();
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.user1Solace).eq(0);
      expect(bal12.user1BSolace).eq(0);
      expect(bal12.user2Solace).eq(0);
      expect(bal12.user2BSolace).eq(0);
      expect(bal12.totalSolace).eq(0);
      expect(bal12.totalBSolace).eq(0);
      expect(bal12.lockedBSolace).eq(0);
    });
    it("cannot unwrap with insufficient bsolace balance", async function () {
      await bsolace.connect(user1).approve(wrapper.address, 1);
      await expect(wrapper.connect(user1).bsolaceToSolace(1, user2.address)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await bsolace.connect(user1).approve(wrapper.address, 0);
    });
    it("cannot unwrap with insufficient bsolace approval", async function () {
      await bsolace.connect(user1).mintToken(user1.address, ONE_ETHER.mul(1000));
      await expect(wrapper.connect(user1).bsolaceToSolace(1, user2.address)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("can unwrap", async function () {
      let depositAmount = ONE_ETHER.mul(3);
      await bsolace.connect(user1).approve(wrapper.address, depositAmount);
      let bal1 = await getBalances();
      let tx = await wrapper.connect(user1).bsolaceToSolace(depositAmount, user2.address);
      await expect(tx).to.emit(wrapper, "Unwrapped").withArgs(user1.address, user2.address, depositAmount);
      let bal2 = await getBalances();
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.user1Solace).eq(0);
      expect(bal12.user1BSolace).eq(depositAmount.mul(-1));
      expect(bal12.user2Solace).eq(depositAmount);
      expect(bal12.user2BSolace).eq(0);
      expect(bal12.totalSolace).eq(depositAmount);
      expect(bal12.totalBSolace).eq(0);
      expect(bal12.lockedBSolace).eq(depositAmount);
    });
  });

  describe("wrap", function () {
    it("can wrap zero", async function () {
      let bal1 = await getBalances();
      let tx = await wrapper.connect(user1).solaceToBSolace(0, user2.address);
      await expect(tx).to.emit(wrapper, "Wrapped").withArgs(user1.address, user2.address, 0);
      let bal2 = await getBalances();
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.user1Solace).eq(0);
      expect(bal12.user1BSolace).eq(0);
      expect(bal12.user2Solace).eq(0);
      expect(bal12.user2BSolace).eq(0);
      expect(bal12.totalSolace).eq(0);
      expect(bal12.totalBSolace).eq(0);
      expect(bal12.lockedBSolace).eq(0);
    });
    it("cannot wrap with insufficient solace balance", async function () {
      await solace.connect(user1).approve(wrapper.address, 1);
      await expect(wrapper.connect(user1).solaceToBSolace(1, user2.address)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await solace.connect(user1).approve(wrapper.address, 0);
    });
    it("cannot wrap with insufficient solace approval", async function () {
      await expect(wrapper.connect(user2).solaceToBSolace(1, user2.address)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("cannot wrap with insufficient bridge liquidity", async function () {
      await solace.connect(governor).mint(user2.address, ONE_ETHER.mul(2));
      await solace.connect(user2).approve(wrapper.address, ONE_ETHER.mul(4));
      await expect(wrapper.connect(user2).solaceToBSolace(ONE_ETHER.mul(4), user2.address)).to.be.revertedWith("insufficient bridge liquidity");
    });
    it("can unwrap", async function () {
      let depositAmount = ONE_ETHER;
      let bal1 = await getBalances();
      let tx = await wrapper.connect(user2).solaceToBSolace(depositAmount, user3.address);
      await expect(tx).to.emit(wrapper, "Wrapped").withArgs(user2.address, user3.address, depositAmount);
      let bal2 = await getBalances();
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.user2Solace).eq(depositAmount.mul(-1));
      expect(bal12.user2BSolace).eq(0);
      expect(bal12.user3Solace).eq(0);
      expect(bal12.user3BSolace).eq(depositAmount);
      expect(bal12.totalSolace).eq(depositAmount.mul(-1));
      expect(bal12.totalBSolace).eq(0);
      expect(bal12.lockedBSolace).eq(depositAmount.mul(-1));
    });
  });

  describe("wrap signed", function () {
    it("can wrap zero", async function () {
      let bal1 = await getBalances();
      let { v, r, s } = await getERC20PermitSignature(user2, wrapper.address, solace, 0, deadline);
      let tx = await wrapper.connect(user2).solaceToBSolaceSigned(0, user3.address, deadline, v, r, s);
      await expect(tx).to.emit(wrapper, "Wrapped").withArgs(user2.address, user3.address, 0);
      let bal2 = await getBalances();
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.user1Solace).eq(0);
      expect(bal12.user1BSolace).eq(0);
      expect(bal12.user2Solace).eq(0);
      expect(bal12.user2BSolace).eq(0);
      expect(bal12.totalSolace).eq(0);
      expect(bal12.totalBSolace).eq(0);
      expect(bal12.lockedBSolace).eq(0);
    });
    it("cannot wrap with insufficient solace balance", async function () {
      let { v, r, s } = await getERC20PermitSignature(user1, wrapper.address, solace, 1, deadline);
      await expect(wrapper.connect(user1).solaceToBSolaceSigned(1, user2.address, deadline, v, r, s)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot wrap with invalid permit", async function () {
      let { v, r, s } = await getERC20PermitSignature(user1, wrapper.address, solace, 1, deadline);
      await expect(wrapper.connect(user1).solaceToBSolaceSigned(1, user2.address, deadline, v+1, r, s)).to.be.reverted;
    });
    it("cannot wrap with insufficient bridge liquidity", async function () {
      let { v, r, s } = await getERC20PermitSignature(user2, wrapper.address, solace, ONE_ETHER.mul(4), deadline);
      await expect(wrapper.connect(user2).solaceToBSolaceSigned(ONE_ETHER.mul(4), user2.address, deadline, v, r, s)).to.be.revertedWith("insufficient bridge liquidity");
    });
    it("can unwrap", async function () {
      let depositAmount = ONE_ETHER;
      let bal1 = await getBalances();
      let { v, r, s } = await getERC20PermitSignature(user2, wrapper.address, solace, depositAmount, deadline);
      let tx = await wrapper.connect(user2).solaceToBSolaceSigned(depositAmount, user3.address, deadline, v, r, s);
      await expect(tx).to.emit(wrapper, "Wrapped").withArgs(user2.address, user3.address, depositAmount);
      let bal2 = await getBalances();
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.user2Solace).eq(depositAmount.mul(-1));
      expect(bal12.user2BSolace).eq(0);
      expect(bal12.user3Solace).eq(0);
      expect(bal12.user3BSolace).eq(depositAmount);
      expect(bal12.totalSolace).eq(depositAmount.mul(-1));
      expect(bal12.totalBSolace).eq(0);
      expect(bal12.lockedBSolace).eq(depositAmount.mul(-1));
    });
  });

  interface Balances {
    user1Solace: BN;
    user1BSolace: BN;
    user2Solace: BN;
    user2BSolace: BN;
    user3Solace: BN;
    user3BSolace: BN;
    totalSolace: BN;
    totalBSolace: BN;
    lockedBSolace: BN;
  }

  async function getBalances(): Promise<Balances> {
    return {
      user1Solace: await solace.balanceOf(user1.address),
      user1BSolace: await bsolace.balanceOf(user1.address),
      user2Solace: await solace.balanceOf(user2.address),
      user2BSolace: await bsolace.balanceOf(user2.address),
      user3Solace: await solace.balanceOf(user3.address),
      user3BSolace: await bsolace.balanceOf(user3.address),
      totalSolace: await solace.totalSupply(),
      totalBSolace: await bsolace.totalSupply(),
      lockedBSolace: await bsolace.balanceOf(wrapper.address),
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      user1Solace: balances1.user1Solace.sub(balances2.user1Solace),
      user1BSolace: balances1.user1BSolace.sub(balances2.user1BSolace),
      user2Solace: balances1.user2Solace.sub(balances2.user2Solace),
      user2BSolace: balances1.user2BSolace.sub(balances2.user2BSolace),
      user3Solace: balances1.user3Solace.sub(balances2.user3Solace),
      user3BSolace: balances1.user3BSolace.sub(balances2.user3BSolace),
      totalSolace: balances1.totalSolace.sub(balances2.totalSolace),
      totalBSolace: balances1.totalBSolace.sub(balances2.totalBSolace),
      lockedBSolace: balances1.lockedBSolace.sub(balances2.lockedBSolace),
    };
  }
});
