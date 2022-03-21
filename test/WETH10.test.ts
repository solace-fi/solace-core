import chai from "chai";
import { waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Weth10, MockErc677, MockFaultyReceiver } from "./../typechain";
import { expectDeployed } from "./utilities/expectDeployed";
import { getDomainSeparator } from "./utilities/signature";
import { getERC20PermitSignature } from "./utilities/getERC20PermitSignature";
import { constants, utils } from "ethers";
import { toAbiEncoded } from "./utilities/setStorage";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const chainId = 31337;
const deadline = constants.MaxUint256;

const WITHDRAW_SIGHASH = "2e1a7d4d";
const WITHDRAW_TO_SIGHASH = "205c2878";
const WITHDRAW_FROM_SIGHASH = "9555a942";

describe("WETH10", function () {
  let weth: Weth10;
  let mockErc677: MockErc677;
  let mockFaultyReceiver: MockFaultyReceiver;
  const [deployer, user1, user2] = provider.getWallets();
  const name = "Wrapped Ether v10";
  const symbol = "WETH10";
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    weth = (await deployContract(deployer, artifacts.WETH10)) as Weth10;
    await expectDeployed(weth.address);
    mockErc677 = (await deployContract(deployer, artifacts.MockERC677)) as MockErc677;
    mockFaultyReceiver = (await deployContract(deployer, artifacts.MockFaultyReceiver)) as MockFaultyReceiver;
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
    it("has correct domain separator", async function () {
      expect(await weth.DOMAIN_SEPARATOR()).eq(getDomainSeparator(name, weth.address, chainId));
    });
    it("has correct CALLBACK_SUCCESS", async function () {
      expect(await weth.CALLBACK_SUCCESS()).eq(utils.keccak256(utils.toUtf8Bytes("ERC3156FlashBorrower.onFlashLoan")));
    });
    it("has correct PERMIT_TYPEHASH", async function () {
      expect(await weth.PERMIT_TYPEHASH()).eq(utils.keccak256(utils.toUtf8Bytes("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")));
    });
  });

  describe("deposit", function () {
    it("starts with zero balance and supply", async function () {
      expect(await weth.balanceOf(user1.address)).eq(0);
      expect(await weth.totalSupply()).eq(0);
    });
    it("can deposit via deposit()", async function () {
      let tx1 = await weth.connect(user1).deposit({value: 1});
      await expect(tx1).to.emit(weth, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 1);
      expect(await weth.balanceOf(user1.address)).eq(1);
      expect(await weth.totalSupply()).eq(1);
      let tx2 = await weth.connect(user2).deposit({value: 2});
      await expect(tx2).to.emit(weth, "Transfer").withArgs(ZERO_ADDRESS, user2.address, 2);
      expect(await weth.balanceOf(user2.address)).eq(2);
      expect(await weth.totalSupply()).eq(3);
    });
    it("can deposit via receive", async function () {
      let tx1 = await user1.sendTransaction({to: weth.address, value: 4});
      await expect(tx1).to.emit(weth, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 4);
      expect(await weth.balanceOf(user1.address)).eq(5);
      expect(await weth.totalSupply()).eq(7);
      let tx2 = await user2.sendTransaction({to: weth.address, value: 8});
      await expect(tx2).to.emit(weth, "Transfer").withArgs(ZERO_ADDRESS, user2.address, 8);
      expect(await weth.balanceOf(user2.address)).eq(10);
      expect(await weth.totalSupply()).eq(15);
    });
    it("can deposit via depositTo()", async function () {
      let tx1 = await weth.connect(user2).depositTo(user1.address, {value: 16});
      await expect(tx1).to.emit(weth, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 16);
      expect(await weth.balanceOf(user1.address)).eq(21);
      expect(await weth.totalSupply()).eq(31);
      let tx2 = await weth.connect(user2).depositTo(user2.address, {value: 32});
      await expect(tx2).to.emit(weth, "Transfer").withArgs(ZERO_ADDRESS, user2.address, 32);
      expect(await weth.balanceOf(user2.address)).eq(42);
      expect(await weth.totalSupply()).eq(63);
    });
    it("can deposit via depositToAndCall()", async function () {
      // call to user fails
      await expect(weth.connect(user2).depositToAndCall(user1.address, "0xabcd", {value: 64})).to.be.revertedWith("Transaction reverted: function call to a non-contract account");
      // call to contract succeeds
      let tx2 = await weth.connect(user2).depositToAndCall(mockErc677.address, "0xabcd", {value: 64});
      await expect(tx2).to.emit(weth, "Transfer").withArgs(ZERO_ADDRESS, mockErc677.address, 64);
      await expect(tx2).to.emit(mockErc677, "TokenTransferred").withArgs(user2.address, 64, "0xabcd");
      expect(await weth.balanceOf(mockErc677.address)).eq(64);
      expect(await weth.totalSupply()).eq(127);
    });
  });

  describe("withdraw", function () {
    it("can withdraw", async function () {
      let tx1 = await weth.connect(user1).withdraw(3);
      await expect(tx1).to.emit(weth, "Transfer").withArgs(user1.address, ZERO_ADDRESS, 3);
      expect(await weth.balanceOf(user1.address)).eq(18);
      expect(await weth.totalSupply()).eq(124);
      let tx2 = await weth.connect(user2).withdraw(5);
      await expect(tx2).to.emit(weth, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 5);
      expect(await weth.balanceOf(user2.address)).eq(37);
      expect(await weth.totalSupply()).eq(119);
    });
    it("cannot over withdraw", async function () {
      await expect(weth.connect(user1).withdraw(100)).to.be.revertedWith("WETH: burn amount exceeds balance");
    });
    it("checks for eth transfer fail", async function () {
      let tx1 = await mockFaultyReceiver.forwardCall(weth.address, "0x", {value: 1});
      await expect(tx1).to.emit(weth, "Transfer").withArgs(ZERO_ADDRESS, mockFaultyReceiver.address, 1);
      expect(await weth.balanceOf(mockFaultyReceiver.address)).eq(1);
      expect(await weth.totalSupply()).eq(120);
      // withdraw 1
      let data = `0x${WITHDRAW_SIGHASH}${toAbiEncoded(1)}`;
      await expect(mockFaultyReceiver.forwardCall(weth.address, data)).to.be.reverted;
    })
  });

  describe("withdrawTo", function () {
    it("can withdraw", async function () {
      let tx1 = await weth.connect(user1).withdrawTo(user2.address, 3);
      await expect(tx1).to.emit(weth, "Transfer").withArgs(user1.address, ZERO_ADDRESS, 3);
      expect(await weth.balanceOf(user1.address)).eq(15);
      expect(await weth.totalSupply()).eq(117);
      let tx2 = await weth.connect(user2).withdrawTo(user2.address, 5);
      await expect(tx2).to.emit(weth, "Transfer").withArgs(user2.address, ZERO_ADDRESS, 5);
      expect(await weth.balanceOf(user2.address)).eq(32);
      expect(await weth.totalSupply()).eq(112);
    });
    it("cannot over withdraw", async function () {
      await expect(weth.connect(user1).withdrawTo(user1.address, 100)).to.be.revertedWith("WETH: burn amount exceeds balance");
    });
    it("checks for eth transfer fail", async function () {
      // withdrawTo self 1
      let data = `0x${WITHDRAW_TO_SIGHASH}${toAbiEncoded(mockFaultyReceiver.address)}${toAbiEncoded(1)}`;
      await expect(mockFaultyReceiver.forwardCall(weth.address, data)).to.be.reverted;
    })
  });

  describe("withdrawFrom", function () {
    it("cannot withdraw from other without allowance", async function () {
      await expect(weth.connect(user2).withdrawFrom(user1.address, user2.address, 5)).to.be.revertedWith("WETH: request exceeds allowance");
    })
    it("can withdraw", async function () {
      // from self to other
      let tx1 = await weth.connect(user1).withdrawFrom(user1.address, user2.address, 3);
      await expect(tx1).to.emit(weth, "Transfer").withArgs(user1.address, ZERO_ADDRESS, 3);
      expect(await weth.balanceOf(user1.address)).eq(12);
      expect(await weth.totalSupply()).eq(109);
      // from other to self
      await weth.connect(user1).approve(user2.address, 7);
      expect(await weth.allowance(user1.address, user2.address)).eq(7);
      let tx2 = await weth.connect(user2).withdrawFrom(user1.address, user2.address, 5);
      await expect(tx2).to.emit(weth, "Transfer").withArgs(user1.address, ZERO_ADDRESS, 5);
      expect(await weth.balanceOf(user1.address)).eq(7);
      expect(await weth.balanceOf(user2.address)).eq(32);
      expect(await weth.totalSupply()).eq(104);
      expect(await weth.allowance(user1.address, user2.address)).eq(2);
      // with max approval
      await weth.connect(user1).approve(user2.address, constants.MaxUint256);
      expect(await weth.allowance(user1.address, user2.address)).eq(constants.MaxUint256);
      let tx3 = await weth.connect(user2).withdrawFrom(user1.address, user2.address, 5);
      await expect(tx3).to.emit(weth, "Transfer").withArgs(user1.address, ZERO_ADDRESS, 5);
      expect(await weth.balanceOf(user1.address)).eq(2);
      expect(await weth.balanceOf(user2.address)).eq(32);
      expect(await weth.totalSupply()).eq(99);
      expect(await weth.allowance(user1.address, user2.address)).eq(constants.MaxUint256);
    });
    it("cannot over withdraw", async function () {
      await expect(weth.connect(user1).withdrawFrom(user1.address, user2.address, 100)).to.be.revertedWith("WETH: burn amount exceeds balance");
    });
    it("checks for eth transfer fail", async function () {
      // withdrawFrom user1 self 1
      await weth.connect(user1).approve(mockFaultyReceiver.address, 1);
      let data = `0x${WITHDRAW_FROM_SIGHASH}${toAbiEncoded(user1.address)}${toAbiEncoded(mockFaultyReceiver.address)}${toAbiEncoded(1)}`;
      await expect(mockFaultyReceiver.forwardCall(weth.address, data)).to.be.reverted;
    })
  });
});
