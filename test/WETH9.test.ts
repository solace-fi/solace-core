import chai from "chai";
import { waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Weth9 } from "./../typechain";
import { expectDeployed } from "./utilities/expectDeployed";

describe("WETH9", function () {
  let weth: Weth9;
  const [deployer, user1, user2] = provider.getWallets();
  const name = "Wrapped Ether";
  const symbol = "WETH";
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    await expectDeployed(weth.address);
  });

  describe("deployment", function () {
    it("has a correct name", async function () {
      expect(await weth.name()).to.equal(name);
    });
    it("has a correct symbol", async function () {
      expect(await weth.symbol()).to.equal(symbol);
    });
    it("has 18 decimals", async function () {
      expect(await weth.decimals()).to.equal(18);
    });
  });

  describe("deposit", function () {
    it("starts with zero balance and supply", async function () {
      expect(await weth.balanceOf(user1.address)).eq(0);
      expect(await weth.totalSupply()).eq(0);
    });
    it("can deposit via deposit()", async function () {
      let tx1 = await weth.connect(user1).deposit({value: 1});
      await expect(tx1).to.emit(weth, "Deposit").withArgs(user1.address, 1);
      expect(await weth.balanceOf(user1.address)).eq(1);
      expect(await weth.totalSupply()).eq(1);
      let tx2 = await weth.connect(user2).deposit({value: 2});
      await expect(tx2).to.emit(weth, "Deposit").withArgs(user2.address, 2);
      expect(await weth.balanceOf(user2.address)).eq(2);
      expect(await weth.totalSupply()).eq(3);
    });
    it("can deposit via receive", async function () {
      let tx1 = await user1.sendTransaction({to: weth.address, value: 4});
      await expect(tx1).to.emit(weth, "Deposit").withArgs(user1.address, 4);
      expect(await weth.balanceOf(user1.address)).eq(5);
      expect(await weth.totalSupply()).eq(7);
      let tx2 = await user2.sendTransaction({to: weth.address, value: 8});
      await expect(tx2).to.emit(weth, "Deposit").withArgs(user2.address, 8);
      expect(await weth.balanceOf(user2.address)).eq(10);
      expect(await weth.totalSupply()).eq(15);
    });
    it("can deposit via fallback", async function () {
      let tx1 = await user1.sendTransaction({to: weth.address, value: 16, data: "0xabcd"});
      await expect(tx1).to.emit(weth, "Deposit").withArgs(user1.address, 16);
      expect(await weth.balanceOf(user1.address)).eq(21);
      expect(await weth.totalSupply()).eq(31);
      let tx2 = await user2.sendTransaction({to: weth.address, value: 32, data: "0xdcba"});
      await expect(tx2).to.emit(weth, "Deposit").withArgs(user2.address, 32);
      expect(await weth.balanceOf(user2.address)).eq(42);
      expect(await weth.totalSupply()).eq(63);
    });
  });

  describe("withdraw", function () {
    it("can withdraw", async function () {
      let tx1 = await weth.connect(user1).withdraw(3);
      await expect(tx1).to.emit(weth, "Withdrawal").withArgs(user1.address, 3);
      expect(await weth.balanceOf(user1.address)).eq(18);
      expect(await weth.totalSupply()).eq(60);
      let tx2 = await weth.connect(user2).withdraw(5);
      await expect(tx2).to.emit(weth, "Withdrawal").withArgs(user2.address, 5);
      expect(await weth.balanceOf(user2.address)).eq(37);
      expect(await weth.totalSupply()).eq(55);
    });
    it("cannot over withdraw", async function () {
      await expect(weth.connect(user1).withdraw(100)).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
  });
})
