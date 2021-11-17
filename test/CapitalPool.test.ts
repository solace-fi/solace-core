import chai from "chai";
import { ethers, waffle, upgrades } from "hardhat";
import { BigNumber as BN, BigNumberish, constants } from "ethers";
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { CapitalPool, Weth9, MockErc20 } from "../typechain";

describe("CapitalPool", function () {
  let artifacts: ArtifactImports;
  let pool: CapitalPool;
  let weth: Weth9;
  let tkn: MockErc20;

  const [owner, governor, newGovernor, depositor, manager, receiver] = provider.getWallets();

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const ONE_ETHER = BN.from("1000000000000000000");
  const TWO_ETHER = BN.from("2000000000000000000");
  const THREE_ETHER = BN.from("3000000000000000000");
  const FOUR_ETHER = BN.from("4000000000000000000");
  const TEN_ETHER = BN.from("10000000000000000000");

  before(async function () {
    artifacts = await import_artifacts();
    await owner.sendTransaction({to:owner.address}); // for some reason this helps solidity-coverage

    pool = (await deployContract(owner, artifacts.CapitalPool, [governor.address])) as CapitalPool;
    weth = (await deployContract(owner, artifacts.WETH)) as Weth9;
    tkn = (await deployContract(owner, artifacts.MockERC20, ["Mock Token", "MOCK", TEN_ETHER])) as MockErc20;
    await tkn.transfer(depositor.address, TEN_ETHER);
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await pool.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function () {
      await expect(pool.connect(depositor).setPendingGovernance(depositor.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function () {
      let tx = await pool.connect(governor).setPendingGovernance(newGovernor.address);
      expect(tx).to.emit(pool, "GovernancePending").withArgs(newGovernor.address);
      expect(await pool.governance()).to.equal(governor.address);
      expect(await pool.pendingGovernance()).to.equal(newGovernor.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(pool.connect(depositor).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function () {
      let tx = await pool.connect(newGovernor).acceptGovernance();
      await expect(tx)
        .to.emit(pool, "GovernanceTransferred")
        .withArgs(governor.address, newGovernor.address);
      expect(await pool.governance()).to.equal(newGovernor.address);
      expect(await pool.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await pool.connect(newGovernor).setPendingGovernance(governor.address);
      await pool.connect(governor).acceptGovernance();
    });
  });

  describe("receive", function () {
    it("should receive eth", async function () {
      expect(await provider.getBalance(pool.address)).eq(0);
      await depositor.sendTransaction({to: pool.address, value: ONE_ETHER, data: "0x"});
      expect(await provider.getBalance(pool.address)).eq(ONE_ETHER);
      await depositor.sendTransaction({to: pool.address, value: TWO_ETHER, data: "0x"});
      expect(await provider.getBalance(pool.address)).eq(THREE_ETHER);
      await depositor.sendTransaction({to: pool.address, value: ONE_ETHER, data: "0xabcd"});
      expect(await provider.getBalance(pool.address)).eq(FOUR_ETHER);
    });
    it("should receive erc20s", async function () {
      expect(await tkn.balanceOf(pool.address)).eq(0);
      await tkn.connect(depositor).transfer(pool.address, ONE_ETHER);
      expect(await tkn.balanceOf(pool.address)).eq(ONE_ETHER);
      await tkn.connect(depositor).transfer(pool.address, TWO_ETHER);
      expect(await tkn.balanceOf(pool.address)).eq(THREE_ETHER);
    })
  });

  describe("asset managers", function () {
    it("non governance cannot add managers", async function () {
      await expect(pool.connect(depositor).addAssetManager(depositor.address)).to.be.revertedWith("!governance");
    });
    it("cannot add zero address manager", async function () {
      await expect(pool.connect(governor).addAssetManager(ZERO_ADDRESS)).to.be.revertedWith("zero address manager");
    });
    it("governance can add managers", async function () {
      expect(await pool.isAssetManager(manager.address)).to.be.false;
      let tx1 = await pool.connect(governor).addAssetManager(manager.address);
      expect(await pool.isAssetManager(manager.address)).to.be.true;
      expect(tx1).to.emit(pool, "AssetManagerAdded").withArgs(manager.address);
      let tx2 = await pool.connect(governor).addAssetManager(manager.address);
      expect(await pool.isAssetManager(manager.address)).to.be.true;
      expect(tx2).to.emit(pool, "AssetManagerAdded").withArgs(manager.address);
      let tx3 = await pool.connect(governor).addAssetManager(depositor.address);
      expect(await pool.isAssetManager(depositor.address)).to.be.true;
      expect(tx3).to.emit(pool, "AssetManagerAdded");
    });
    it("non governance cannot remove managers", async function () {
      await expect(pool.connect(depositor).removeAssetManager(depositor.address)).to.be.revertedWith("!governance");
    });
    it("cannot remove zero address manager", async function () {
      await expect(pool.connect(governor).removeAssetManager(ZERO_ADDRESS)).to.be.revertedWith("zero address manager");
    });
    it("governance can remove managers", async function () {
      expect(await pool.isAssetManager(depositor.address)).to.be.true;
      let tx1 = await pool.connect(governor).removeAssetManager(depositor.address);
      expect(await pool.isAssetManager(depositor.address)).to.be.false;
      expect(tx1).to.emit(pool, "AssetManagerRemoved").withArgs(depositor.address);
      let tx2 = await pool.connect(governor).removeAssetManager(depositor.address);
      expect(await pool.isAssetManager(depositor.address)).to.be.false;
      expect(tx2).to.emit(pool, "AssetManagerRemoved").withArgs(depositor.address);
    });
    it("non managers cannot manage assets", async function () {
      await expect(pool.connect(depositor).manageAsset(ETH_ADDRESS, 1, receiver.address)).to.be.revertedWith("!asset manager");
      await expect(pool.connect(depositor).manageAsset(tkn.address, 1, receiver.address)).to.be.revertedWith("!asset manager");
    });
    it("cannot manage non tokens", async function () {
      await expect(pool.connect(manager).manageAsset(ZERO_ADDRESS, 1, receiver.address)).to.be.reverted;
      await expect(pool.connect(manager).manageAsset(depositor.address, 1, receiver.address)).to.be.reverted;
    });
    it("cannot send assets to zero address", async function () {
      await expect(pool.connect(manager).manageAsset(ETH_ADDRESS, 1, ZERO_ADDRESS)).to.be.revertedWith("zero address receiver");
      await expect(pool.connect(manager).manageAsset(tkn.address, 1, ZERO_ADDRESS)).to.be.revertedWith("zero address receiver");
    });
    it("managers can pull eth", async function () {
      let bal1r = await provider.getBalance(receiver.address);
      let bal1p = await provider.getBalance(pool.address);
      let tx1 = await pool.connect(manager).manageAsset(ETH_ADDRESS, ONE_ETHER, receiver.address);
      let bal2r = await provider.getBalance(receiver.address);
      let bal2p = await provider.getBalance(pool.address);
      expect(bal1p.sub(bal2p)).eq(ONE_ETHER);
      expect(bal2r.sub(bal1r)).eq(ONE_ETHER);
      expect(tx1).to.emit(pool, "AssetsSent").withArgs(ETH_ADDRESS, ONE_ETHER, receiver.address);
      let tx2 = await pool.connect(manager).manageAsset(ETH_ADDRESS, ONE_ETHER, receiver.address);
      let bal3r = await provider.getBalance(receiver.address);
      let bal3p = await provider.getBalance(pool.address);
      expect(bal2p.sub(bal3p)).eq(ONE_ETHER);
      expect(bal3r.sub(bal2r)).eq(ONE_ETHER);
      expect(tx2).to.emit(pool, "AssetsSent").withArgs(ETH_ADDRESS, ONE_ETHER, receiver.address);
      let tx3 = await pool.connect(manager).manageAsset(ETH_ADDRESS, TEN_ETHER, receiver.address);
      let bal4r = await provider.getBalance(receiver.address);
      let bal4p = await provider.getBalance(pool.address);
      expect(bal3p.sub(bal4p)).eq(bal3p);
      expect(bal4r.sub(bal3r)).eq(bal3p);
      expect(tx3).to.emit(pool, "AssetsSent").withArgs(ETH_ADDRESS, bal3p, receiver.address);
    });
    it("managers can pull erc20", async function () {
      let bal1r = await tkn.balanceOf(receiver.address);
      let bal1p = await tkn.balanceOf(pool.address);
      let tx1 = await pool.connect(manager).manageAsset(tkn.address, ONE_ETHER, receiver.address);
      let bal2r = await tkn.balanceOf(receiver.address);
      let bal2p = await tkn.balanceOf(pool.address);
      expect(bal1p.sub(bal2p)).eq(ONE_ETHER);
      expect(bal2r.sub(bal1r)).eq(ONE_ETHER);
      expect(tx1).to.emit(pool, "AssetsSent").withArgs(tkn.address, ONE_ETHER, receiver.address);
      let tx2 = await pool.connect(manager).manageAsset(tkn.address, ONE_ETHER, receiver.address);
      let bal3r = await tkn.balanceOf(receiver.address);
      let bal3p = await tkn.balanceOf(pool.address);
      expect(bal2p.sub(bal3p)).eq(ONE_ETHER);
      expect(bal3r.sub(bal2r)).eq(ONE_ETHER);
      expect(tx2).to.emit(pool, "AssetsSent").withArgs(tkn.address, ONE_ETHER, receiver.address);
      let tx3 = await pool.connect(manager).manageAsset(tkn.address, TEN_ETHER, receiver.address);
      let bal4r = await tkn.balanceOf(receiver.address);
      let bal4p = await tkn.balanceOf(pool.address);
      expect(bal3p.sub(bal4p)).eq(bal3p);
      expect(bal4r.sub(bal3r)).eq(bal3p);
      expect(tx3).to.emit(pool, "AssetsSent").withArgs(tkn.address, bal3p, receiver.address);
    });
  });
});
