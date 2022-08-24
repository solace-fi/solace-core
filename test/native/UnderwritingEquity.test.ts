import chai from "chai";
import { ethers, waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, Wallet } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { MockErc20, UnderwritingEquity } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

const name = "Solace Native Underwriting Equity";
const symbol = "UWE";
const decimals = 18;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ONE_USDC = BN.from("1000000");
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_NEAR = BN.from("1000000000000000000000000");
const EIGHT_DECIMALS = BN.from("100000000");

describe("UnderwritingEquity", function () {
  let uwp: MockErc20;
  let uwe: UnderwritingEquity;

  const [deployer, governor, user1, user2, user3] = provider.getWallets();
  let artifacts: ArtifactImports;
  let snapshot: BN;

  before(async function () {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy tokens
    uwp = (await deployContract(deployer, artifacts.MockERC20, ["Solace Native Underwriting Pool", "UWP", ONE_ETHER.mul(1000000)])) as MockErc20;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("reverts if zero governance", async function () {
      await expect(deployContract(deployer, artifacts.UnderwritingEquity, [ZERO_ADDRESS, uwp.address])).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero uwp", async function () {
      await expect(deployContract(deployer, artifacts.UnderwritingEquity, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address uwp");
    });
    it("deploys", async function () {
      uwe = (await deployContract(deployer, artifacts.UnderwritingEquity, [governor.address, uwp.address])) as UnderwritingEquity;
      await expectDeployed(uwe.address);
    });
    it("initializes correctly", async function () {
      expect(await uwe.name()).eq(name);
      expect(await uwe.symbol()).eq(symbol);
      expect(await uwe.decimals()).eq(decimals);
      expect(await uwe.issueFee()).eq(0);
      expect(await uwe.issueFeeTo()).eq(ZERO_ADDRESS);
      expect(await uwe.underwritingPool()).eq(uwp.address);
      let paused = await uwe.isPaused();
      expect(paused.depositIsPaused).eq(false);
      expect(paused.withdrawIsPaused).eq(false);
      expect(paused.lendIsPaused).eq(false);
    });
  });

  describe("pause", function () {
    it("starts unpaused", async function () {
      let paused = await uwe.isPaused();
      expect(paused.depositIsPaused).eq(false);
      expect(paused.withdrawIsPaused).eq(false);
      expect(paused.lendIsPaused).eq(false);
    });
    it("cannot be paused by non governor", async function () {
      await expect(uwe.connect(user1).setPause(true, true, true)).to.be.revertedWith("!governance");
    });
    it("can be paused and unpaused", async function () {
      let tx1 = await uwe.connect(governor).setPause(true, false, false);
      await expect(tx1).to.emit(uwe, "PauseSet").withArgs(true, false, false);
      let paused1 = await uwe.isPaused();
      expect(paused1.depositIsPaused).eq(true);
      expect(paused1.withdrawIsPaused).eq(false);
      expect(paused1.lendIsPaused).eq(false);

      let tx2 = await uwe.connect(governor).setPause(false, true, false);
      await expect(tx2).to.emit(uwe, "PauseSet").withArgs(false, true, false);
      let paused2 = await uwe.isPaused();
      expect(paused2.depositIsPaused).eq(false);
      expect(paused2.withdrawIsPaused).eq(true);
      expect(paused2.lendIsPaused).eq(false);

      let tx3 = await uwe.connect(governor).setPause(false, false, true);
      await expect(tx3).to.emit(uwe, "PauseSet").withArgs(false, false, true);
      let paused3 = await uwe.isPaused();
      expect(paused3.depositIsPaused).eq(false);
      expect(paused3.withdrawIsPaused).eq(false);
      expect(paused3.lendIsPaused).eq(true);

      let tx4 = await uwe.connect(governor).setPause(false, false, false);
      await expect(tx4).to.emit(uwe, "PauseSet").withArgs(false, false, false);
      let paused4 = await uwe.isPaused();
      expect(paused4.depositIsPaused).eq(false);
      expect(paused4.withdrawIsPaused).eq(false);
      expect(paused4.lendIsPaused).eq(false);
    });
  });

  describe("issueFee", function () {
    it("starts zero", async function () {
      expect(await uwe.issueFee()).eq(0);
      expect(await uwe.issueFeeTo()).eq(ZERO_ADDRESS);
    });
    it("cannot be set by non governance", async function () {
      await expect(uwe.connect(user1).setIssueFee(0, ZERO_ADDRESS)).to.be.revertedWith("!governance");
    });
    it("set has safety checks", async function () {
      await expect(uwe.connect(governor).setIssueFee(ONE_ETHER.add(1), ZERO_ADDRESS)).to.be.revertedWith("invalid issue fee");
      await expect(uwe.connect(governor).setIssueFee(ONE_ETHER, ZERO_ADDRESS)).to.be.revertedWith("invalid issue fee to");
    });
    it("can be set by governance", async function () {
      let tx = await uwe.connect(governor).setIssueFee(1, governor.address);
      await expect(tx).to.emit(uwe, "IssueFeeSet").withArgs(1, governor.address);
      expect(await uwe.issueFee()).eq(1);
      expect(await uwe.issueFeeTo()).eq(governor.address);
      await uwe.connect(governor).setIssueFee(0, ZERO_ADDRESS);
    });
  });

  describe("deposit", function () {
    it("cannot deposit while paused", async function () {
      await uwe.connect(governor).setPause(true, false, false);
      await expect(uwe.connect(user1).deposit(0, user1.address)).to.be.revertedWith("deposit is paused");
      await uwe.connect(governor).setPause(false, false, false);
    });
    it("cannot deposit without sufficient uwp balance", async function () {
      await uwp.connect(deployer).transfer(user1.address, ONE_ETHER.mul(1000));
      await expect(uwe.connect(user1).deposit(ONE_ETHER.mul(1000).add(1), user1.address)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit without sufficient uwp approval", async function () {
      await expect(uwe.connect(user1).deposit(1, user1.address)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      await uwp.connect(user1).approve(uwe.address, ONE_ETHER.mul(1000));
    });
    it("can deposit 1", async function () {
      // 0 bal 0 ts => mint 1:1
      let amt1 = await uwe.calculateDeposit(ONE_ETHER);
      expect(amt1).eq(ONE_ETHER);
      let amt2 = await uwe.connect(user1).callStatic.deposit(ONE_ETHER, user2.address);
      expect(amt2).eq(ONE_ETHER);
      let tx = await uwe.connect(user1).deposit(ONE_ETHER, user2.address);
      await expect(tx).to.emit(uwe, "DepositMade").withArgs(user1.address, ONE_ETHER, ONE_ETHER);
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, user2.address, ONE_ETHER);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(user1.address, uwe.address, ONE_ETHER);
      expect(await uwe.balanceOf(user1.address)).eq(0);
      expect(await uwe.balanceOf(user2.address)).eq(ONE_ETHER);
      expect(await uwe.totalSupply()).eq(ONE_ETHER);
    });
    it("can deposit 2", async function () {
      // 1 bal 1 ts => mint 1:1
      let amt1 = await uwe.calculateDeposit(ONE_ETHER);
      expect(amt1).eq(ONE_ETHER);
      let amt2 = await uwe.connect(user1).callStatic.deposit(ONE_ETHER, user2.address);
      expect(amt2).eq(ONE_ETHER);
      let tx = await uwe.connect(user1).deposit(ONE_ETHER, user2.address);
      await expect(tx).to.emit(uwe, "DepositMade").withArgs(user1.address, ONE_ETHER, ONE_ETHER);
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, user2.address, ONE_ETHER);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(user1.address, uwe.address, ONE_ETHER);
      expect(await uwe.balanceOf(user1.address)).eq(0);
      expect(await uwe.balanceOf(user2.address)).eq(ONE_ETHER.mul(2));
      expect(await uwe.totalSupply()).eq(ONE_ETHER.mul(2));
    });
    it("can deposit 3", async function () {
      // 4 bal 2 ts => mint 1:2
      await uwp.connect(deployer).transfer(uwe.address, ONE_ETHER.mul(2))
      let amt1 = await uwe.calculateDeposit(ONE_ETHER);
      expect(amt1).eq(ONE_ETHER.div(2));
      let amt2 = await uwe.connect(user1).callStatic.deposit(ONE_ETHER, user2.address);
      expect(amt2).eq(ONE_ETHER.div(2));
      let tx = await uwe.connect(user1).deposit(ONE_ETHER, user2.address);
      await expect(tx).to.emit(uwe, "DepositMade").withArgs(user1.address, ONE_ETHER, ONE_ETHER.div(2));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, user2.address, ONE_ETHER.div(2));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(user1.address, uwe.address, ONE_ETHER);
      expect(await uwe.balanceOf(user1.address)).eq(0);
      expect(await uwe.balanceOf(user2.address)).eq(ONE_ETHER.mul(5).div(2));
      expect(await uwe.totalSupply()).eq(ONE_ETHER.mul(5).div(2));
    });
    it("can deposit 4", async function () {
      // 5 bal 2.5 ts => mint 1:2
      // 1% mint fee
      let issueFee = ONE_ETHER.div(100);
      let invIssueFee = ONE_ETHER.div(100).mul(99);
      await uwe.connect(governor).setIssueFee(issueFee, user3.address);
      let amt1 = await uwe.calculateDeposit(ONE_ETHER);
      expect(amt1).eq(ONE_ETHER.div(2).mul(invIssueFee).div(ONE_ETHER));
      let amt2 = await uwe.connect(user1).callStatic.deposit(ONE_ETHER, user2.address);
      expect(amt2).eq(ONE_ETHER.div(2).mul(invIssueFee).div(ONE_ETHER));
      let tx = await uwe.connect(user1).deposit(ONE_ETHER, user2.address);
      await expect(tx).to.emit(uwe, "DepositMade").withArgs(user1.address, ONE_ETHER, ONE_ETHER.div(2).mul(invIssueFee).div(ONE_ETHER));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, user2.address, ONE_ETHER.div(2).mul(invIssueFee).div(ONE_ETHER));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, user3.address, ONE_ETHER.div(2).mul(issueFee).div(ONE_ETHER));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(user1.address, uwe.address, ONE_ETHER);
      expect(await uwe.balanceOf(user1.address)).eq(0);
      expect(await uwe.balanceOf(user2.address)).eq(ONE_ETHER.mul(5).div(2).add(ONE_ETHER.div(2).mul(invIssueFee).div(ONE_ETHER)));
      expect(await uwe.balanceOf(user3.address)).eq(ONE_ETHER.div(2).mul(issueFee).div(ONE_ETHER));
      expect(await uwe.totalSupply()).eq(ONE_ETHER.mul(6).div(2));
    });
  });

  describe("withdraw", function () {
    before("redeploy", async function () {
      uwe = (await deployContract(deployer, artifacts.UnderwritingEquity, [governor.address, uwp.address])) as UnderwritingEquity;
    });
    it("can withdraw 1", async function () {
      // 0 bal 0 ts => redeem 1:1
      let amt1 = await uwe.calculateWithdraw(0);
      expect(amt1).eq(0);
      let amt2 = await uwe.connect(user1).callStatic.withdraw(0, user2.address);
      expect(amt2).eq(0);
      let tx = await uwe.connect(user1).withdraw(0, user2.address);
      await expect(tx).to.emit(uwe, "WithdrawMade").withArgs(user1.address, 0, 0);
      await expect(tx).to.emit(uwe, "Transfer").withArgs(user1.address, ZERO_ADDRESS, 0);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(uwe.address, user2.address, 0);
      expect(await uwe.balanceOf(user1.address)).eq(0);
      expect(await uwe.balanceOf(user2.address)).eq(0);
      expect(await uwe.totalSupply()).eq(0);
    });
    it("cannot withdraw while paused", async function () {
      await uwe.connect(governor).setPause(false, true, false);
      await expect(uwe.connect(user1).withdraw(0, user1.address)).to.be.revertedWith("withdraw is paused");
      await uwe.connect(governor).setPause(false, false, false);
    });
    it("cannot withdraw more than balance", async function () {
      await uwp.connect(user1).approve(uwe.address, ONE_ETHER.mul(1000));
      await uwe.connect(user1).deposit(ONE_ETHER.mul(5), user1.address);
      await expect(uwe.calculateWithdraw(ONE_ETHER.mul(5).add(1))).to.be.revertedWith("withdraw amount exceeds supply");
      await expect(uwe.withdraw(ONE_ETHER.mul(5).add(1), user2.address)).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
    it("can withdraw 2", async function () {
      // 5 bal 5 ts => redeem 1:1
      let amt1 = await uwe.calculateWithdraw(ONE_ETHER);
      expect(amt1).eq(ONE_ETHER);
      let amt2 = await uwe.connect(user1).callStatic.withdraw(ONE_ETHER, user2.address);
      expect(amt2).eq(ONE_ETHER);
      let tx = await uwe.connect(user1).withdraw(ONE_ETHER, user2.address);
      await expect(tx).to.emit(uwe, "WithdrawMade").withArgs(user1.address, ONE_ETHER, ONE_ETHER);
      await expect(tx).to.emit(uwe, "Transfer").withArgs(user1.address, ZERO_ADDRESS, ONE_ETHER);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(uwe.address, user2.address, ONE_ETHER);
      expect(await uwe.balanceOf(user1.address)).eq(ONE_ETHER.mul(4));
      expect(await uwe.balanceOf(user2.address)).eq(0);
      expect(await uwe.totalSupply()).eq(ONE_ETHER.mul(4));
    });
    it("can withdraw 3", async function () {
      // 8 bal 4 ts => redeem 2:1
      await uwp.connect(deployer).transfer(uwe.address, ONE_ETHER.mul(4));
      let amt1 = await uwe.calculateWithdraw(ONE_ETHER);
      expect(amt1).eq(ONE_ETHER.mul(2));
      let amt2 = await uwe.connect(user1).callStatic.withdraw(ONE_ETHER, user2.address);
      expect(amt2).eq(ONE_ETHER.mul(2));
      let tx = await uwe.connect(user1).withdraw(ONE_ETHER, user2.address);
      await expect(tx).to.emit(uwe, "WithdrawMade").withArgs(user1.address, ONE_ETHER.mul(2), ONE_ETHER);
      await expect(tx).to.emit(uwe, "Transfer").withArgs(user1.address, ZERO_ADDRESS, ONE_ETHER);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(uwe.address, user2.address, ONE_ETHER.mul(2));
      expect(await uwe.balanceOf(user1.address)).eq(ONE_ETHER.mul(3));
      expect(await uwe.balanceOf(user2.address)).eq(0);
      expect(await uwe.totalSupply()).eq(ONE_ETHER.mul(3));
    });
  });

  describe("burn", function () {
    it("cannot burn more than balance", async function () {
      let bal = await uwe.balanceOf(user1.address);
      await expect(uwe.connect(user1).burn(bal.add(1))).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
    it("can burn", async function () {
      let bal1 = await uwe.balanceOf(user1.address);
      let ts1 = await uwe.totalSupply();
      let burnAmount = bal1.div(3);
      expect(burnAmount).gt(0);
      let tx = await uwe.connect(user1).burn(burnAmount);
      await expect(tx).to.emit(uwe, "Transfer").withArgs(user1.address, ZERO_ADDRESS, burnAmount);
      let bal2 = await uwe.balanceOf(user1.address);
      let ts2 = await uwe.totalSupply();
      expect(bal1.sub(bal2)).eq(burnAmount);
      expect(ts1.sub(ts2)).eq(burnAmount);
    });
  });

  describe("lend", function () {
    it("cannot be called by non governor", async function () {
      await expect(uwe.connect(user1).lend(0, user1.address)).to.be.revertedWith("!governance");
    });
    it("cannot be called while paused", async function () {
      await uwe.connect(governor).setPause(false, false, true);
      await expect(uwe.connect(governor).lend(0, user1.address)).to.be.revertedWith("lend is paused");
      await uwe.connect(governor).setPause(false, false, false);
    });
    it("cannot lend more than balance", async function () {
      let bal = await uwp.balanceOf(uwe.address);
      await expect(uwe.connect(governor).lend(bal.add(1), user1.address)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("can lend", async function () {
      let bal11 = await uwp.balanceOf(uwe.address);
      let bal12 = await uwp.balanceOf(user3.address);
      let lendAmount = bal11.div(3);
      expect(lendAmount).gt(0);
      let tx = await uwe.connect(governor).lend(lendAmount, user3.address);
      await expect(tx).to.emit(uwe, "UwpLoaned").withArgs(lendAmount, user3.address);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(uwe.address, user3.address, lendAmount);
      let bal21 = await uwp.balanceOf(uwe.address);
      let bal22 = await uwp.balanceOf(user3.address);
      expect(bal11.sub(bal21)).eq(lendAmount);
      expect(bal22.sub(bal12)).eq(lendAmount);
    });
  });

  describe("rescueTokens", function () {
    it("cannot be called by non governor", async function () {
      await expect(uwe.connect(user1).rescueTokens([], user1.address)).to.be.revertedWith("!governance")
    });
    it("cannot rescue uwp", async function () {
      await expect(uwe.connect(governor).rescueTokens([uwp.address], user1.address)).to.be.revertedWith("cannot rescue uwp")
    });
    it("can rescue tokens", async function () {
      let dai = (await deployContract(deployer, artifacts.MockERC20, ["Dai Stablecoin", "DAI", ONE_ETHER.mul(1000000)])) as MockErc20;
      let weth = (await deployContract(deployer, artifacts.MockERC20, ["Wrapped Ether", "WETH", ONE_ETHER.mul(1000000)])) as MockErc20;
      await dai.connect(deployer).transfer(uwe.address, ONE_ETHER.mul(100));
      await weth.connect(deployer).transfer(uwe.address, ONE_ETHER);
      await uwe.connect(governor).rescueTokens([dai.address, weth.address], user1.address);
      expect(await dai.balanceOf(uwe.address)).eq(0);
      expect(await weth.balanceOf(uwe.address)).eq(0);
      expect(await dai.balanceOf(user1.address)).eq(ONE_ETHER.mul(100));
      expect(await weth.balanceOf(user1.address)).eq(ONE_ETHER);
    });
  });
  //it("", async function () {});
});
