import hardhat from "hardhat";
import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, XSolace, MockErc20, Weth9, MockErc20Permit, BondDepository, BondTellerEth } from "../typechain";
import { expectClose } from "./utilities/math";
import { getERC20PermitSignature } from "./utilities/getERC20PermitSignature";

const deadline = constants.MaxUint256;
const VESTING_TERM = 432000; // 5 days
const HALF_LIFE = 2592000; // 30 days
const MAX_BPS = 10000;

const MAX_UINT40 = BN.from("1099511627775");

describe("BondTellerETH", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, depositor1, depositor2, minter, dao, underwritingPool, dao2, underwritingPool2] = provider.getWallets();

  // solace contracts
  let solace: Solace;
  let xsolace: XSolace;
  let bondDepo: BondDepository;
  let teller1: BondTellerEth;
  let teller2: BondTellerEth;
  let weth9: Weth9;
  let weth10: MockErc20Permit;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const ONE_ETHER = BN.from("1000000000000000000");

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
    weth9 = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    await weth9.connect(deployer).deposit({value: ONE_ETHER.mul(100)});
    weth10 = (await deployContract(deployer, artifacts.MockERC20Permit, ["Wrapped Ether 10", "WETH10", ONE_ETHER.mul(1000000), 18])) as MockErc20Permit;
    bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address])) as BondDepository;
    await solace.connect(governor).addMinter(minter.address);
    await solace.connect(minter).mint(bondDepo.address, ONE_ETHER.mul(1000));
  });

  describe("initialization", function () {
    it("can deploy implementation", async function () {
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await bondDepo.connect(governor).addTeller(teller1.address);
    });
    it("starts with no name, symbol, or supply", async function () {
      expect(await teller1.name()).eq("");
      expect(await teller1.symbol()).eq("");
      expect(await teller1.totalSupply()).eq(0);
    });
    it("reverts if zero governor", async function () {
      await expect(teller1.initialize("Solace ETH Bond", ZERO_ADDRESS, solace.address, xsolace.address, underwritingPool.address, dao.address, weth9.address, bondDepo.address)).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero solace", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, ZERO_ADDRESS, xsolace.address, underwritingPool.address, dao.address, weth9.address, bondDepo.address)).to.be.revertedWith("zero address solace");
    });
    it("reverts if zero xsolace", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, ZERO_ADDRESS, underwritingPool.address, dao.address, weth9.address, bondDepo.address)).to.be.revertedWith("zero address xsolace");
    });
    it("reverts if zero pool", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, xsolace.address, ZERO_ADDRESS, dao.address, weth9.address, bondDepo.address)).to.be.revertedWith("zero address pool");
    });
    it("reverts if zero dao", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, ZERO_ADDRESS, weth9.address, bondDepo.address)).to.be.revertedWith("zero address dao");
    });
    it("reverts if zero principal", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, ZERO_ADDRESS, bondDepo.address)).to.be.revertedWith("zero address principal");
    });
    it("reverts if zero bond depo", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, weth9.address, ZERO_ADDRESS)).to.be.revertedWith("zero address bond depo");
    });
    it("inits", async function () {
      await teller1.initialize("Solace ETH Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, weth9.address, bondDepo.address);
    });
    it("inits with a name and symbol", async function () {
      expect(await teller1.name()).eq("Solace ETH Bond");
      expect(await teller1.symbol()).eq("SBT");
    });
    it("starts with correct solace", async function () {
      expect(await teller1.solace()).eq(solace.address);
    });
    it("starts with correct xsolace", async function () {
      expect(await teller1.xsolace()).eq(xsolace.address);
    });
    it("starts with correct pool", async function () {
      expect(await teller1.underwritingPool()).eq(underwritingPool.address);
    });
    it("starts with correct dao", async function () {
      expect(await teller1.dao()).eq(dao.address);
    });
    it("starts with correct principal", async function () {
      expect(await teller1.principal()).eq(weth9.address);
    });
    it("can deploy proxy", async function () {
      teller2 = await deployProxyTeller("Solace ETH Bond", teller1.address, weth10.address);
    });
    it("inits proxy with a name and symbol", async function () {
      expect(await teller2.name()).eq("Solace ETH Bond");
      expect(await teller2.symbol()).eq("SBT");
    });
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await teller1.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(teller1.connect(depositor1).setPendingGovernance(depositor1.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await teller1.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(teller1, "GovernancePending").withArgs(deployer.address);
      expect(await teller1.governance()).to.equal(governor.address);
      expect(await teller1.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(teller1.connect(depositor1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function() {
      let tx = await teller1.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(teller1, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await teller1.governance()).to.equal(deployer.address);
      expect(await teller1.pendingGovernance()).to.equal(ZERO_ADDRESS);

      await teller1.connect(deployer).setPendingGovernance(governor.address);
      await teller1.connect(governor).acceptGovernance();
    });
  });

  describe("pause/unpause", function () {
    it("non governance cannot pause/unpause", async function () {
      await expect(teller1.connect(depositor1).pause()).to.be.revertedWith("!governance");
      await expect(teller1.connect(depositor1).unpause()).to.be.revertedWith("!governance");
    });
    it("governance can pause and unpause", async function () {
      expect(await teller1.paused()).to.be.false;
      let tx1 = await teller1.connect(governor).pause();
      expect(tx1).to.emit(teller1, "Paused");
      expect(await teller1.paused()).to.be.true;
      let tx2 = await teller1.connect(governor).pause();
      expect(tx2).to.emit(teller1, "Paused");
      expect(await teller1.paused()).to.be.true;
      let tx3 = await teller1.connect(governor).unpause();
      expect(tx3).to.emit(teller1, "Unpaused");
      expect(await teller1.paused()).to.be.false;
      let tx4 = await teller1.connect(governor).unpause();
      expect(tx4).to.emit(teller1, "Unpaused");
      expect(await teller1.paused()).to.be.false;
    });
  });

  describe("terms", function () {
    it("starts unset", async function () {});
    it("cannot be set by governance", async function () {});
    it("verifies inputs", async function () {});
    it("can be set", async function () {});
    it("", async function () {});
  });

  describe("depositEth", async function () {
    let BOND_FEE = 300;
    let DAO_FEE = 200;

    it("cannot deposit with insufficient balance", async function () {
      await expect(teller1.connect(depositor1).depositEth(1, depositor1.address, false, { value: constants.MaxUint256 })).to.be.reverted;
    });
    it("cannot deposit to zero address", async function () {
      await expect(teller1.connect(depositor1).depositEth(1, ZERO_ADDRESS, false, { value: 1 })).to.be.revertedWith("invalid address");
    });
    it("cannot deposit while paused", async function () {
      await teller1.connect(governor).pause();
      await expect(teller1.connect(depositor1).depositEth(1, depositor1.address, false, { value: 1 })).to.be.revertedWith("cannot deposit while paused");
      await teller1.connect(governor).unpause();
    });
    it("cannot deposit before initialization", async function () {
      await expect(teller1.calculateAmountIn(1, false)).to.be.revertedWith("not initialized");
      await expect(teller1.calculateAmountOut(1, false)).to.be.revertedWith("not initialized");
      await expect(teller1.connect(depositor1).depositEth(1, depositor1.address, false, { value: 1 })).to.be.revertedWith("not initialized");
    });
    it("cannot deposit before start", async function () {
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: 0, capacityIsPayout: false, startTime: blockTimestamp+10, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: 1 })).to.be.revertedWith("bond not yet started");
    });
    it("cannot deposit after conclusion", async function () {
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: 0, capacityIsPayout: false, startTime: 0, endTime: blockTimestamp-1, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: 1 })).to.be.revertedWith("bond concluded");
    });
    it("cannot divide by zero price", async function () {
      await teller1.connect(governor).setTerms({startPrice: 1, minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: 0, capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: 1});
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await provider.send("evm_setNextBlockTimestamp", [blockTimestamp + 99999]);
      await provider.send("evm_mine", []);
      expect(await teller1.bondPrice()).eq(0);
      await expect(teller1.calculateAmountIn(1, false)).to.be.revertedWith("zero price");
      await expect(teller1.calculateAmountOut(1, false)).to.be.revertedWith("zero price");
      await expect(teller1.connect(depositor1).depositEth(1, depositor1.address, false, { value: 1 })).to.be.revertedWith("invalid price");
    });
    it("cannot exceed capacity in principal", async function () {
      expect(await teller1.capacity()).eq(0);
      expect(await teller1.capacityIsPayout()).eq(false);

      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(false);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.add(1), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: ONE_ETHER.add(1) })).to.be.revertedWith("bond at capacity");
    });
    it("cannot exceed capacity in payout", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: true, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(true);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(5), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.mul(2).add(2), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: ONE_ETHER.mul(2).add(1) })).to.be.revertedWith("bond at capacity");
    });
    it("cannot be over max payout", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond too large");
      await expect(teller1.calculateAmountOut(ONE_ETHER.mul(4).add(10), false)).to.be.revertedWith("bond too large");
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: ONE_ETHER.mul(4).add(1) })).to.be.revertedWith("bond too large");
    });
    it("slippage protection", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      expect(await teller1.calculateAmountIn(ONE_ETHER.mul(3).div(2), false)).eq(ONE_ETHER.mul(3));
      expect(await teller1.calculateAmountOut(ONE_ETHER.mul(3), false)).eq(ONE_ETHER.mul(3).div(2));
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: ONE_ETHER.mul(3) })).to.be.revertedWith("slippage protection: insufficient output");
      expect(await teller1.calculateAmountIn(ONE_ETHER.mul(3).div(2), true)).eq(ONE_ETHER.mul(3));
      expect(await teller1.calculateAmountOut(ONE_ETHER.mul(3), true)).eq(ONE_ETHER.mul(3).div(2));
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, true, { value: ONE_ETHER.mul(3) })).to.be.revertedWith("slippage protection: insufficient output");
    });
    it("cannot deposit with insufficient bond depo solace", async function () {
      let bal1 = await solace.balanceOf(bondDepo.address);
      await bondDepo.connect(governor).returnSolace(depositor1.address, bal1);
      await expect(teller1.connect(depositor1).depositEth(0, depositor1.address, false, { value: 2 })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await solace.connect(depositor1).transfer(bondDepo.address, bal1);
    });
    it("can deposit", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});

      await teller1.connect(governor).setFees(BOND_FEE, DAO_FEE);
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await teller1.connect(depositor1).depositEth(ONE_ETHER, depositor1.address, false, { value: ONE_ETHER.mul(3) });
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(1);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      expect(bal12.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost))
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoEth).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(bal12.tellerCapacity).eq(bondInfo.pricePaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
    it("can deposit and stake", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: true, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(xsolace.address, ONE_ETHER);
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, true);
      let tx1 = await teller1.connect(depositor1).depositEth(ONE_ETHER, depositor1.address, true, { value: ONE_ETHER.mul(3) });
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(2);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(xsolace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(0);
      expect(bal12.vestingXSolace).eq(bondInfo.payoutAmount);
      expectClose(bal12.totalXSolace, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      expect(bal12.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost));
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoEth).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expectClose(bal12.tellerCapacity, bondInfo.pricePaid.mul(-1).div(2), 1e14);
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
    it("deposits have minimum price", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER, minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await teller1.connect(depositor1).depositEth(ONE_ETHER, depositor1.address, false, { value: ONE_ETHER.mul(3) });
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(3);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      expect(bal12.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost));
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoEth).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(bal12.tellerCapacity).eq(bondInfo.pricePaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
  });

  describe("redeem", function () {
    it("cannot redeem non existent token", async function () {
      await expect(teller1.connect(depositor1).redeem(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot redeem not your token", async function () {
      await expect(teller1.connect(depositor2).redeem(1)).to.be.revertedWith("!bonder");
    });
    it("cannot redeem before maturation", async function () {
      await expect(teller1.connect(depositor1).redeem(1)).to.be.revertedWith("bond not yet redeemable");
    });
    it("can redeem", async function () {
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await provider.send("evm_setNextBlockTimestamp", [blockTimestamp + VESTING_TERM]);
      await provider.send("evm_mine", []);
      let bondInfo = await teller1.bonds(1);
      let tx1 = await teller1.connect(depositor1).redeem(1);
      expect(tx1).to.emit(teller1, "RedeemBond").withArgs(1, depositor1.address, solace.address, bondInfo.payoutAmount);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(bondInfo.payoutAmount);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount.mul(-1));
      expect(bal12.vestingXSolace).eq(0);
      expect(bal12.stakingSolace).eq(0);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(-1);
      expect(bal12.totalBonds).eq(-1);
    });
    it("can redeem with approval", async function () {
      let bal1 = await getBalances(teller1, depositor2);
      let bondID = 2;
      await teller1.connect(depositor1).approve(depositor2.address, bondID);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await provider.send("evm_setNextBlockTimestamp", [blockTimestamp + VESTING_TERM]);
      await provider.send("evm_mine", []);
      let bondInfo = await teller1.bonds(bondID);
      let tx1 = await teller1.connect(depositor2).redeem(bondID);
      expect(tx1).to.emit(teller1, "RedeemBond").withArgs(bondID, depositor2.address, xsolace.address, bondInfo.payoutAmount);
      let bal2 = await getBalances(teller1, depositor2);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingSolace).eq(0);
      expect(bal12.vestingXSolace).eq(bondInfo.payoutAmount.mul(-1));
      expect(bal12.stakingSolace).eq(0);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(0);
      expect(bal12.totalBonds).eq(-1);
    });
    it("cannot double redeem", async function () {
      await expect(teller1.connect(depositor1).redeem(1)).to.be.revertedWith("query for nonexistent token");
    });
  });

  describe("depositWeth", async function () {
    let BOND_FEE = 300;
    let DAO_FEE = 200;

    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(bondDepo.address, ONE_ETHER.mul(1000));
      await bondDepo.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address);
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await bondDepo.connect(governor).addTeller(teller1.address);
      await teller1.initialize("Solace ETH Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, weth9.address, bondDepo.address);
      teller2 = await deployProxyTeller("Solace USDC Bond", teller1.address, weth10.address);
    });

    it("cannot deposit with insufficient balance", async function () {
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit without allowance", async function () {
      await weth9.connect(deployer).transfer(depositor1.address, ONE_ETHER.mul(100));
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("cannot permit a non erc20permit token", async function () {
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller1.address, weth9, 1, constants.MaxUint256, 1);
      await expect(teller1.connect(depositor1).depositWethSigned(1, 1, depositor1.address, false, deadline, v, r, s)).to.be.reverted;
    });
    it("cannot deposit to zero address", async function () {
      await weth9.connect(depositor1).approve(teller1.address, constants.MaxUint256);
      await expect(teller1.connect(depositor1).depositWeth(1, 1, ZERO_ADDRESS, false)).to.be.revertedWith("invalid address");
    });
    it("cannot deposit while paused", async function () {
      await teller1.connect(governor).pause();
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("cannot deposit while paused");
      await teller1.connect(governor).unpause();
    });
    it("cannot deposit before initialization", async function () {
      await expect(teller1.calculateAmountIn(1, false)).to.be.revertedWith("not initialized");
      await expect(teller1.calculateAmountOut(1, false)).to.be.revertedWith("not initialized");
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("not initialized");
    });
    it("cannot deposit before start", async function () {
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: blockTimestamp+10, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await expect(teller1.connect(depositor1).depositWeth(1, ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond not yet started");
    });
    it("cannot deposit after conclusion", async function () {
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: blockTimestamp-1, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await expect(teller1.connect(depositor1).depositWeth(1, ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond concluded");
    });
    it("cannot divide by zero price", async function () {
      await teller1.connect(governor).setTerms({startPrice: 1, minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: 1});
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await provider.send("evm_setNextBlockTimestamp", [blockTimestamp + 99999]);
      await provider.send("evm_mine", []);
      expect(await teller1.bondPrice()).eq(0);
      await expect(teller1.calculateAmountIn(1, false)).to.be.revertedWith("zero price");
      await expect(teller1.calculateAmountOut(1, false)).to.be.revertedWith("zero price");
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("invalid price");
    });
    it("cannot exceed capacity in principal", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(false);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.add(1), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).depositWeth(ONE_ETHER.add(1), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond at capacity");
    });
    it("cannot exceed capacity in payout", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: true, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(true);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(5), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.mul(2).add(2), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(2).add(1), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond at capacity");
    });
    it("cannot be over max payout", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond too large");
      await expect(teller1.calculateAmountOut(ONE_ETHER.mul(4).add(10), false)).to.be.revertedWith("bond too large");
      await expect(teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(4).add(1), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond too large");
    });
    it("slippage protection", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      expect(await teller1.calculateAmountIn(ONE_ETHER.mul(3).div(2), false)).eq(ONE_ETHER.mul(3));
      expect(await teller1.calculateAmountOut(ONE_ETHER.mul(3), false)).eq(ONE_ETHER.mul(3).div(2));
      await expect(teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("slippage protection: insufficient output");
      expect(await teller1.calculateAmountIn(ONE_ETHER.mul(3).div(2), true)).eq(ONE_ETHER.mul(3));
      expect(await teller1.calculateAmountOut(ONE_ETHER.mul(3), true)).eq(ONE_ETHER.mul(3).div(2));
      await expect(teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER.mul(2), depositor1.address, true)).to.be.revertedWith("slippage protection: insufficient output");
    });
    it("can deposit", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await teller1.connect(governor).setFees(BOND_FEE, DAO_FEE);
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(1);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userWeth9).eq(ONE_ETHER.mul(-3));
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoWeth9).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolWeth9).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(bal12.tellerCapacity).eq(bondInfo.pricePaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
    it("can deposit and stake", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: true, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(xsolace.address, ONE_ETHER);
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, true);
      let tx1 = await teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, true);
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(2);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(xsolace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(0);
      expect(bal12.vestingXSolace).eq(bondInfo.payoutAmount);
      expectClose(bal12.totalXSolace, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      expect(bal12.userWeth9).eq(ONE_ETHER.mul(-3));
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoWeth9).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolWeth9).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expectClose(bal12.tellerCapacity, bondInfo.pricePaid.mul(-1).div(2), 1e14);
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
    it("deposits have minimum price", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER, minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(3);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userWeth9).eq(ONE_ETHER.mul(-3));
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoWeth9).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolWeth9).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(bal12.tellerCapacity).eq(bondInfo.pricePaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
  });

  describe("deposit signed", function () {
    let BOND_FEE = 300;
    let DAO_FEE = 200;

    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(bondDepo.address, ONE_ETHER.mul(1000));
      await bondDepo.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address);
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await bondDepo.connect(governor).addTeller(teller1.address);
      await teller1.initialize("Solace ETH Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, weth9.address, bondDepo.address);
      teller2 = await deployProxyTeller("Solace USDC Bond", teller1.address, weth10.address);
    });
    it("can deposit signed", async function () {
      await teller2.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await teller2.connect(governor).setFees(BOND_FEE, DAO_FEE);
      await weth10.connect(deployer).transfer(depositor1.address, ONE_ETHER.mul(100));
      let bal1 = await getBalances(teller2, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, false);
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, weth10, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositWethSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false, deadline, v, r, s);
      let bondID1 = await teller2.numBonds();
      expect(bondID1).eq(1);
      let bondInfo = await teller2.bonds(bondID1);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller2, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(ONE_ETHER.mul(-3));
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(bal12.tellerCapacity).eq(bondInfo.pricePaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
    it("can deposit signed and stake", async function () {
      await teller2.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: true, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(xsolace.address, ONE_ETHER);
      let bal1 = await getBalances(teller2, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, true);
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, weth10, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositWethSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, true, deadline, v, r, s);
      let bondID1 = await teller2.numBonds();
      expect(bondID1).eq(2);
      let bondInfo = await teller2.bonds(bondID1);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(xsolace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller2, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(0);
      expect(bal12.vestingXSolace).eq(bondInfo.payoutAmount);
      expectClose(bal12.totalXSolace, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(ONE_ETHER.mul(-3));
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expectClose(bal12.tellerCapacity, bondInfo.pricePaid.mul(-1).div(2), 1e14);
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
    it("deposits have minimum price", async function () {
      await teller2.connect(governor).setTerms({startPrice: ONE_ETHER, minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      let bal1 = await getBalances(teller2, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, false);
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, weth10, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositWethSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false, deadline, v, r, s);
      let bondID1 = await teller2.numBonds();
      expect(bondID1).eq(3);
      let bondInfo = await teller2.bonds(bondID1);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller2, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(ONE_ETHER.mul(-3));
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(bal12.tellerCapacity).eq(bondInfo.pricePaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
  });

  describe("deposit via fallback", async function () {
    let BOND_FEE = 300;
    let DAO_FEE = 200;

    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(bondDepo.address, ONE_ETHER.mul(1000));
      await bondDepo.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address);
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await bondDepo.connect(governor).addTeller(teller1.address);
      await teller1.initialize("Solace ETH Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, weth9.address, bondDepo.address);
      teller2 = await deployProxyTeller("Solace USDC Bond", teller1.address, weth10.address);
    });

    it("cannot deposit while paused", async function () {
      await teller1.connect(governor).pause();
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0x"})).to.be.revertedWith("cannot deposit while paused");
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0xabcd"})).to.be.revertedWith("cannot deposit while paused");
      await expect(teller1.connect(depositor1).depositEth(1, depositor1.address, false, { value: 1 })).to.be.revertedWith("cannot deposit while paused");
      await teller1.connect(governor).unpause();
    });
    it("cannot deposit before initialization", async function () {
      await expect(teller1.calculateAmountIn(1, false)).to.be.revertedWith("not initialized");
      await expect(teller1.calculateAmountOut(1, false)).to.be.revertedWith("not initialized");
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0x"})).to.be.revertedWith("not initialized");
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0xabcd"})).to.be.revertedWith("not initialized");
      await expect(teller1.connect(depositor1).depositEth(1, depositor1.address, false, { value: 1 })).to.be.revertedWith("not initialized");
    });
    it("cannot deposit before start", async function () {
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: false, startTime: blockTimestamp+10, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0x"})).to.be.revertedWith("bond not yet started");
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0xabcd"})).to.be.revertedWith("bond not yet started");
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: 1 })).to.be.revertedWith("bond not yet started");
    });
    it("cannot deposit after conclusion", async function () {
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: false, startTime: 0, endTime: blockTimestamp-1, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0x"})).to.be.revertedWith("bond concluded");
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0xabcd"})).to.be.revertedWith("bond concluded");
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: 1 })).to.be.revertedWith("bond concluded");
    });
    it("cannot divide by zero price", async function () {
      await teller1.connect(governor).setTerms({startPrice: 1, minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: 1});
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await provider.send("evm_setNextBlockTimestamp", [blockTimestamp + 99999]);
      await provider.send("evm_mine", []);
      expect(await teller1.bondPrice()).eq(0);
      await expect(teller1.calculateAmountIn(1, false)).to.be.revertedWith("zero price");
      await expect(teller1.calculateAmountOut(1, false)).to.be.revertedWith("zero price");
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0x"})).to.be.revertedWith("invalid price");
      await expect(depositor1.sendTransaction({to: teller1.address, value: 1, data: "0xabcd"})).to.be.revertedWith("invalid price");
      await expect(teller1.connect(depositor1).depositEth(1, depositor1.address, false, { value: 1 })).to.be.revertedWith("invalid price");
    });
    it("cannot exceed capacity in principal", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(false);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.add(1), false)).to.be.revertedWith("bond at capacity");
      await expect(depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(2), data: "0x"})).to.be.revertedWith("bond at capacity");
      await expect(depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(2), data: "0xabcd"})).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: ONE_ETHER.add(1) })).to.be.revertedWith("bond at capacity");
    });
    it("cannot exceed capacity in payout", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: true, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(true);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(5), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.mul(2).add(2), false)).to.be.revertedWith("bond at capacity");
      await expect(depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(2), data: "0x"})).to.be.revertedWith("bond at capacity");
      await expect(depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(2), data: "0xabcd"})).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: ONE_ETHER.mul(2).add(1) })).to.be.revertedWith("bond at capacity");
    });
    it("cannot be over max payout", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond too large");
      await expect(teller1.calculateAmountOut(ONE_ETHER.mul(4).add(10), false)).to.be.revertedWith("bond too large");
      await expect(depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(4).add(1), data: "0x"})).to.be.revertedWith("bond too large");
      await expect(depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(4).add(1), data: "0xabcd"})).to.be.revertedWith("bond too large");
      await expect(teller1.connect(depositor1).depositEth(ONE_ETHER.mul(2), depositor1.address, false, { value: ONE_ETHER.mul(4).add(1) })).to.be.revertedWith("bond too large");
    });
    it("can deposit", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await teller1.connect(governor).setFees(BOND_FEE, DAO_FEE);
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(3), data: "0x"});
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(1);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      expect(bal12.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost))
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoEth).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(bal12.tellerCapacity).eq(bondInfo.pricePaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
    it("deposits have minimum price", async function () {
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER, minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(3), data: "0xabcd"});
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(2);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      expect(bal12.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost));
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(0);
      expect(bal12.daoEth).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoWeth9).eq(0);
      expect(bal12.daoWeth10).eq(0);
      expect(bal12.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(bal12.poolWeth10).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(bal12.tellerCapacity).eq(bondInfo.pricePaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
  });

  describe("set terms", async function () {
    let BOND_FEE = 300;
    let DAO_FEE = 200;

    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(bondDepo.address, ONE_ETHER.mul(1000));
      await bondDepo.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address);
      teller2 = await deployProxyTeller("Solace USDC Bond", teller1.address, weth10.address);
    });
    it("terms start unset", async function () {
      await expect(teller2.bondPrice()).to.be.reverted;
      expect(await teller2.nextPrice()).eq(0);
      expect(await teller2.vestingTerm()).eq(0);
      expect(await teller2.startTime()).eq(0);
      expect(await teller2.endTime()).eq(0);
      expect(await teller2.minimumPrice()).eq(0);
      expect(await teller2.halfLife()).eq(0);
      expect(await teller2.capacity()).eq(0);
      expect(await teller2.capacityIsPayout()).eq(false);
      expect(await teller2.maxPayout()).eq(0);
      expect(await teller2.priceAdjNum()).eq(0);
      expect(await teller2.priceAdjDenom()).eq(0);
      expect(await teller2.termsSet()).eq(false);
      expect(await teller2.lastPriceUpdate()).eq(0);
    });
    it("non governance cannot set terms", async function () {
      await expect(teller2.connect(depositor1).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE})).to.be.revertedWith("!governance");
    });
    it("validates inputs", async function () {
      await expect(teller2.connect(governor).setTerms({startPrice: 0, minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: 0, capacityIsPayout: false, startTime: 0, endTime: 0, vestingTerm: 0, halfLife: 0})).to.be.revertedWith("invalid price");
      await expect(teller2.connect(governor).setTerms({startPrice: 1, minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 0, capacity: 0, capacityIsPayout: false, startTime: 0, endTime: 0, vestingTerm: 0, halfLife: 0})).to.be.revertedWith("1/0");
      await expect(teller2.connect(governor).setTerms({startPrice: 1, minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: 0, capacityIsPayout: false, startTime: 3, endTime: 2, vestingTerm: 0, halfLife: 0})).to.be.revertedWith("invalid dates");
      await expect(teller2.connect(governor).setTerms({startPrice: 1, minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: 0, capacityIsPayout: false, startTime: 2, endTime: 3, vestingTerm: 0, halfLife: 0})).to.be.revertedWith("invalid halflife");
    });
    it("can set terms", async function () {
      let tx = await teller2.connect(governor).setTerms({startPrice: 1, minimumPrice: 2, maxPayout: 3, priceAdjNum: 5, priceAdjDenom: 6, capacity: 7, capacityIsPayout: true, startTime: 8, endTime: 9, vestingTerm: 10, halfLife: 11});
      expect(tx).to.emit(teller2, "TermsSet");
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      expect(await teller2.bondPrice()).eq(2);
      expect(await teller2.nextPrice()).eq(1);
      expect(await teller2.vestingTerm()).eq(10);
      expect(await teller2.startTime()).eq(8);
      expect(await teller2.endTime()).eq(9);
      expect(await teller2.minimumPrice()).eq(2);
      expect(await teller2.halfLife()).eq(11);
      expect(await teller2.capacity()).eq(7);
      expect(await teller2.capacityIsPayout()).eq(true);
      expect(await teller2.maxPayout()).eq(3);
      expect(await teller2.priceAdjNum()).eq(5);
      expect(await teller2.priceAdjDenom()).eq(6);
      expect(await teller2.termsSet()).eq(true);
      expectClose(await teller2.lastPriceUpdate(), blockTimestamp, 5);
    });
  });

  describe("set fees", async function () {
    let BOND_FEE = 300;
    let DAO_FEE = 200;

    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(bondDepo.address, ONE_ETHER.mul(1000));
      await bondDepo.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address);
      teller2 = await deployProxyTeller("Solace USDC Bond", teller1.address, weth10.address);
    });
    it("fees start unset", async function () {
      expect(await teller2.bondFeeBps()).eq(0);
      expect(await teller2.daoFeeBps()).eq(0);
    });
    it("non governance cannot set fees", async function () {
      await expect(teller2.connect(depositor1).setFees(0, 0)).to.be.revertedWith("!governance");
    });
    it("validates inputs", async function () {
      await expect(teller2.connect(governor).setFees(10001, 0)).to.be.revertedWith("invalid bond fee");
      await expect(teller2.connect(governor).setFees(0, 10001)).to.be.revertedWith("invalid dao fee");
    });
    it("can set fees", async function () {
      let tx = teller2.connect(governor).setFees(BOND_FEE, DAO_FEE);
      expect(tx).to.emit(teller2, "FeesSet");
      expect(await teller2.bondFeeBps()).eq(BOND_FEE);
      expect(await teller2.daoFeeBps()).eq(DAO_FEE);
    });
    it("can set to zero", async function () {
      let tx = teller2.connect(governor).setFees(0, 0);
      expect(tx).to.emit(teller2, "FeesSet");
      expect(await teller2.bondFeeBps()).eq(0);
      expect(await teller2.daoFeeBps()).eq(0);
    });
  });

  describe("set addresses", function () {
    let BOND_FEE = 300;
    let DAO_FEE = 200;

    let solace2: Solace;
    let xsolace2: XSolace;
    let bondDepo2: BondDepository;

    before("redeploy", async function () {
      solace2 = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace2 = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace2.connect(governor).addMinter(minter.address);
      bondDepo2 = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace2.address, xsolace2.address, underwritingPool.address, dao.address])) as BondDepository;
      await solace2.connect(minter).mint(bondDepo2.address, ONE_ETHER.mul(1000));
      await bondDepo2.connect(governor).addTeller(teller1.address);
    });
    it("non governance cannot set addresses", async function () {
      await expect(teller1.connect(depositor1).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address, weth9.address, bondDepo.address)).to.be.revertedWith("!governance");
    });
    it("validates input", async function () {
      await expect(teller1.connect(governor).setAddresses(ZERO_ADDRESS, xsolace.address, underwritingPool.address, dao.address, weth9.address, bondDepo.address)).to.be.revertedWith("zero address solace");
      await expect(teller1.connect(governor).setAddresses(solace.address, ZERO_ADDRESS, underwritingPool.address, dao.address, weth9.address, bondDepo.address)).to.be.revertedWith("zero address xsolace");
      await expect(teller1.connect(governor).setAddresses(solace.address, xsolace.address, ZERO_ADDRESS, dao.address, weth9.address, bondDepo.address)).to.be.revertedWith("zero address pool");
      await expect(teller1.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, ZERO_ADDRESS, weth9.address, bondDepo.address)).to.be.revertedWith("zero address dao");
      await expect(teller1.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address, ZERO_ADDRESS, bondDepo.address)).to.be.revertedWith("zero address principal");
      await expect(teller1.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address, weth9.address, ZERO_ADDRESS)).to.be.revertedWith("zero address bond depo");
    })
    it("governance can set addresses", async function () {
      let tx = await teller1.connect(governor).setAddresses(solace2.address, xsolace2.address, underwritingPool2.address, dao2.address, weth10.address, bondDepo2.address);
      expect(tx).to.emit(teller1, "AddressesSet");
      expect(await teller1.solace()).eq(solace2.address);
      expect(await teller1.xsolace()).eq(xsolace2.address);
      expect(await teller1.underwritingPool()).eq(underwritingPool2.address);
      expect(await teller1.dao()).eq(dao2.address);
      expect(await teller1.principal()).eq(weth10.address);
      expect(await teller1.bondDepo()).eq(bondDepo2.address);
    });
    it("uses new addresses", async function () {
      await weth10.connect(deployer).transfer(depositor1.address, ONE_ETHER.mul(100));
      await weth10.connect(depositor1).approve(teller1.address, constants.MaxUint256);
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER, minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(3);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace2.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(await solace2.balanceOf(teller1.address)).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(await solace2.balanceOf(xsolace2.address), ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(ONE_ETHER.mul(-3));
      expect(bal12.daoWeth9).eq(0);
      expect(await weth10.balanceOf(dao2.address)).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(await weth10.balanceOf(underwritingPool2.address)).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(bal12.tellerCapacity).eq(bondInfo.pricePaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
  });

  interface Balances {
    userSolace: BN;
    userXSolace: BN;
    vestingSolace: BN;
    vestingXSolace: BN;
    stakingSolace: BN;
    totalXSolace: BN;

    userEth: BN;
    userWeth9: BN;
    userWeth10: BN;
    daoEth: BN;
    daoWeth9: BN;
    daoWeth10: BN;
    poolEth: BN;
    poolWeth9: BN;
    poolWeth10: BN;

    userBonds: BN;
    totalBonds: BN;

    tellerCapacity: BN;
    tellerBondPrice: BN;
  }

  async function getBalances(teller: Contract, user: Wallet): Promise<Balances> {
    return {
      userSolace: await solace.balanceOf(user.address),
      userXSolace: await xsolace.balanceOf(user.address),
      vestingSolace: await solace.balanceOf(teller.address),
      vestingXSolace: await xsolace.balanceOf(teller.address),
      stakingSolace: await solace.balanceOf(xsolace.address),
      totalXSolace: await xsolace.totalSupply(),

      userEth: await provider.getBalance(user.address),
      userWeth9: await weth9.balanceOf(user.address),
      userWeth10: await weth10.balanceOf(user.address),
      daoEth: await provider.getBalance(dao.address),
      daoWeth9: await weth9.balanceOf(dao.address),
      daoWeth10: await weth10.balanceOf(dao.address),
      poolEth: await provider.getBalance(underwritingPool.address),
      poolWeth9: await weth9.balanceOf(underwritingPool.address),
      poolWeth10: await weth10.balanceOf(underwritingPool.address),

      userBonds: await teller.balanceOf(user.address),
      totalBonds: await teller.totalSupply(),

      tellerCapacity: await teller.capacity(),
      tellerBondPrice: await teller.bondPrice()
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userSolace: balances1.userSolace.sub(balances2.userSolace),
      userXSolace: balances1.userXSolace.sub(balances2.userXSolace),
      vestingSolace: balances1.vestingSolace.sub(balances2.vestingSolace),
      vestingXSolace: balances1.vestingXSolace.sub(balances2.vestingXSolace),
      stakingSolace: balances1.stakingSolace.sub(balances2.stakingSolace),
      totalXSolace: balances1.totalXSolace.sub(balances2.totalXSolace),

      userEth: balances1.userEth.sub(balances2.userEth),
      userWeth9: balances1.userWeth9.sub(balances2.userWeth9),
      userWeth10: balances1.userWeth10.sub(balances2.userWeth10),
      daoEth: balances1.daoEth.sub(balances2.daoEth),
      daoWeth9: balances1.daoWeth9.sub(balances2.daoWeth9),
      daoWeth10: balances1.daoWeth10.sub(balances2.daoWeth10),
      poolEth: balances1.poolEth.sub(balances2.poolEth),
      poolWeth9: balances1.poolWeth9.sub(balances2.poolWeth9),
      poolWeth10: balances1.poolWeth10.sub(balances2.poolWeth10),

      userBonds: balances1.userBonds.sub(balances2.userBonds),
      totalBonds: balances1.totalBonds.sub(balances2.totalBonds),

      tellerCapacity: balances1.tellerCapacity.sub(balances2.tellerCapacity),
      tellerBondPrice: balances1.tellerBondPrice.sub(balances2.tellerBondPrice),
    };
  }

  async function deployProxyTeller(name: string, implAddress: string, tokenAddress: string) {
    let newTeller;
    let tx = await bondDepo.connect(governor).createBondTeller(name, governor.address, implAddress, tokenAddress);
    let events = (await tx.wait())?.events;
    if(events && events.length > 0) {
      let event = events[0];
      newTeller = await ethers.getContractAt(artifacts.BondTellerETH.abi, event?.args?.["deployment"]) as BondTellerEth;
    } else throw "no deployment";
    expect(newTeller.address).not.eq(ZERO_ADDRESS);
    return newTeller;
  }
});
