import hardhat from "hardhat";
import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, XSolace, MockErc20, MockErc20Permit, BondDepository, BondTellerErc20 } from "../typechain";
import { expectClose } from "./utilities/math";

const chainId = 31337;
const deadline = constants.MaxUint256;
const VESTING_TERM = 432000; // 5 days
const HALF_LIFE = 2592000; // 30 days
const MAX_BPS = 10000;

const MAX_UINT64 = BN.from("0xffffffffffffffff");

describe("BondTellerERC20", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, depositor1, depositor2, dao, minter, underwritingPool] = provider.getWallets();

  // solace contracts
  let solace: Solace;
  let xsolace: XSolace;
  let bondDepo: BondDepository;
  //let tellerErc20Impl: BondTellerErc20;
  let teller1: BondTellerErc20;
  let teller2: BondTellerErc20;
  let tkn1: MockErc20;
  let tkn2: MockErc20Permit;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const ONE_ETHER = BN.from("1000000000000000000");

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
    tkn1 = (await deployContract(deployer, artifacts.MockERC20, ["Dai Stablecoin", "DAI", ONE_ETHER.mul(1000000)])) as MockErc20;
    tkn2 = (await deployContract(deployer, artifacts.MockERC20Permit, ["Wrapped Ether", "WETH", ONE_ETHER.mul(1000000)])) as MockErc20Permit;
    bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address])) as BondDepository;
    await solace.connect(governor).addMinter(bondDepo.address);
  });

  describe("initialization", function () {
    it("can deploy implementation", async function () {
      teller1 = (await deployContract(deployer, artifacts.BondTellerERC20)) as BondTellerErc20;
      await bondDepo.connect(governor).addTeller(teller1.address);
    });
    it("starts with no name, symbol, or supply", async function () {
      expect(await teller1.name()).eq("");
      expect(await teller1.symbol()).eq("");
      expect(await teller1.totalSupply()).eq(0);
    });
    it("reverts if zero governor", async function () {
      await expect(teller1.initialize(ZERO_ADDRESS, solace.address, xsolace.address, underwritingPool.address, dao.address, tkn1.address, bondDepo.address)).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero solace", async function () {
      await expect(teller1.initialize(governor.address, ZERO_ADDRESS, xsolace.address, underwritingPool.address, dao.address, tkn1.address, bondDepo.address)).to.be.revertedWith("zero address solace");
    });
    it("reverts if zero xsolace", async function () {
      await expect(teller1.initialize(governor.address, solace.address, ZERO_ADDRESS, underwritingPool.address, dao.address, tkn1.address, bondDepo.address)).to.be.revertedWith("zero address xsolace");
    });
    it("reverts if zero pool", async function () {
      await expect(teller1.initialize(governor.address, solace.address, xsolace.address, ZERO_ADDRESS, dao.address, tkn1.address, bondDepo.address)).to.be.revertedWith("zero address pool");
    });
    it("reverts if zero dao", async function () {
      await expect(teller1.initialize(governor.address, solace.address, xsolace.address, underwritingPool.address, ZERO_ADDRESS, tkn1.address, bondDepo.address)).to.be.revertedWith("zero address dao");
    });
    it("reverts if zero principal", async function () {
      await expect(teller1.initialize(governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, ZERO_ADDRESS, bondDepo.address)).to.be.revertedWith("zero address principal");
    });
    it("reverts if zero bond depo", async function () {
      await expect(teller1.initialize(governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, tkn1.address, ZERO_ADDRESS)).to.be.revertedWith("zero address bond depo");
    });
    it("inits", async function () {
      await teller1.initialize(governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, tkn1.address, bondDepo.address);
    });
    it("inits with a name and symbol", async function () {
      expect(await teller1.name()).eq("SOLACE-DAI Bond");
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
      expect(await teller1.principal()).eq(tkn1.address);
    });
    it("can deploy proxy", async function () {
      teller2 = await deployProxyTeller(teller1.address, tkn2.address);
    });
    it("inits proxy with a name and symbol", async function () {
      expect(await teller2.name()).eq("SOLACE-WETH Bond");
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

  describe("deposit", async function () {
    let STAKE_FEE = 300;
    let DAO_FEE = 200;

    it("cannot deposit with insufficient balance", async function () {
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit without allowance", async function () {
      await tkn1.connect(deployer).transfer(depositor1.address, ONE_ETHER.mul(100));
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("cannot permit a non erc20permit token", async function () {
      let nonce = 1;
      let approve = {
        owner: depositor1.address,
        spender: teller1.address,
        value: 1,
      };
      let digest = getPermitDigest(await tkn1.name(), tkn1.address, chainId, approve, nonce, deadline);
      let { v, r, s } = sign(digest, Buffer.from(depositor1.privateKey.slice(2), "hex"));
      await expect(teller1.connect(depositor1).depositSigned(1, 1, depositor1.address, false, deadline, v, r, s)).to.be.revertedWith("Transaction reverted: function selector was not recognized and there's no fallback function");
    });
    it("cannot deposit to zero address", async function () {
      await tkn1.connect(depositor1).approve(teller1.address, constants.MaxUint256);
      await expect(teller1.connect(depositor1).deposit(1, 1, ZERO_ADDRESS, false)).to.be.revertedWith("invalid address");
    });
    it("cannot deposit while paused", async function () {
      await teller1.connect(governor).pause();
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("cannot deposit while paused");
      await teller1.connect(governor).unpause();
    });
    it("cannot deposit before initialization", async function () {
      await expect(teller1.calculateAmountIn(1, false)).to.be.reverted;
      await expect(teller1.calculateAmountOut(1, false)).to.be.reverted;
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("not initialized");
    });
    it("cannot deposit before start", async function () {
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await teller1.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, blockTimestamp+10, MAX_UINT64, 0, HALF_LIFE, 0, false, 0, 1);
      await expect(teller1.connect(depositor1).deposit(1, ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond not yet started");
    });
    it("cannot deposit after conclusion", async function () {
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await teller1.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, 0, blockTimestamp-1, 0, HALF_LIFE, 0, false, 0, 1);
      await expect(teller1.connect(depositor1).deposit(1, ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond concluded");
    });
    it("cannot divide by zero price", async function () {
      await teller1.connect(governor).setTerms(1, VESTING_TERM, 0, MAX_UINT64, 0, 1, 0, false, 0, 1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      await provider.send("evm_setNextBlockTimestamp", [blockTimestamp + 99999]);
      await provider.send("evm_mine", []);
      expect(await teller1.bondPrice()).eq(0);
      await expect(teller1.calculateAmountIn(1, false)).to.be.reverted;
      await expect(teller1.calculateAmountOut(1, false)).to.be.reverted;
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("invalid price");
    });
    it("cannot exceed capacity in principal", async function () {
      expect(await teller1.capacity()).eq(0);
      expect(await teller1.capacityIsPayout()).eq(false);

      await teller1.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, 0, MAX_UINT64, 0, HALF_LIFE, ONE_ETHER, false, 0, 1);
      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(false);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.add(1), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).deposit(ONE_ETHER.add(1), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond at capacity");
    });
    it("cannot exceed capacity in payout", async function () {
      await teller1.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, 0, MAX_UINT64, 0, HALF_LIFE, ONE_ETHER, true, 0, 1);
      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(true);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(5), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.mul(2).add(2), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).deposit(ONE_ETHER.mul(2).add(1), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond at capacity");
    });
    it("cannot be over max payout", async function () {
      await teller1.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, 0, MAX_UINT64, 0, HALF_LIFE, ONE_ETHER.mul(10), false, ONE_ETHER.mul(2), 1);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond too large");
      await expect(teller1.calculateAmountOut(ONE_ETHER.mul(4).add(10), false)).to.be.revertedWith("bond too large");
      await expect(teller1.connect(depositor1).deposit(ONE_ETHER.mul(4).add(1), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond too large");
    });
    it("slippage protection", async function () {
      await teller1.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, 0, MAX_UINT64, 0, HALF_LIFE, ONE_ETHER.mul(10), false, ONE_ETHER.mul(2), 1);
      expect(await teller1.calculateAmountIn(ONE_ETHER.mul(3).div(2), false)).eq(ONE_ETHER.mul(3));
      expect(await teller1.calculateAmountOut(ONE_ETHER.mul(3), false)).eq(ONE_ETHER.mul(3).div(2));
      await expect(teller1.connect(depositor1).deposit(ONE_ETHER.mul(3), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("slippage protection: insufficient output");
      expect(await teller1.calculateAmountIn(ONE_ETHER.mul(3).div(2), true)).eq(ONE_ETHER.mul(3));
      expect(await teller1.calculateAmountOut(ONE_ETHER.mul(3), true)).eq(ONE_ETHER.mul(3).div(2));
      await expect(teller1.connect(depositor1).deposit(ONE_ETHER.mul(3), ONE_ETHER.mul(2), depositor1.address, true)).to.be.revertedWith("slippage protection: insufficient output");
    });
    it("can deposit", async function () {
      await teller1.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, 0, MAX_UINT64, 0, HALF_LIFE, ONE_ETHER.mul(10), false, ONE_ETHER.mul(2), 1);
      await teller1.connect(governor).setFees(STAKE_FEE, DAO_FEE);
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await teller1.connect(depositor1).deposit(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(1);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(STAKE_FEE).div(MAX_BPS), 1e14);
      //expect(bal12.stakingSolace).eq(0);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userTkn1).eq(ONE_ETHER.mul(-3));
      expect(bal12.userTkn2).eq(0);
      expect(bal12.daoTkn1).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoTkn2).eq(0);
      expect(bal12.poolTkn1).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolTkn2).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      // TODO: check capacity and next price
    });
    it("can deposit and stake", async function () {
      await teller1.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, 0, MAX_UINT64, 0, HALF_LIFE, ONE_ETHER.mul(10), true, ONE_ETHER.mul(2), 1);
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(xsolace.address, ONE_ETHER);
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, true);
      let tx1 = await teller1.connect(depositor1).deposit(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, true);
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(2);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(xsolace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(0);
      expect(bal12.vestingXSolace).eq(bondInfo.payoutAmount);
      expectClose(bal12.totalXSolace, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      expect(bal12.userTkn1).eq(ONE_ETHER.mul(-3));
      expect(bal12.userTkn2).eq(0);
      expect(bal12.daoTkn1).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoTkn2).eq(0);
      expect(bal12.poolTkn1).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolTkn2).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      // TODO: check capacity and next price
    });
    it("deposits have minimum price", async function () {
      await teller1.connect(governor).setTerms(ONE_ETHER, VESTING_TERM, 0, MAX_UINT64, ONE_ETHER.mul(2), HALF_LIFE, ONE_ETHER.mul(10), false, ONE_ETHER.mul(2), 1);
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await teller1.connect(depositor1).deposit(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(3);
      let bondInfo = await teller1.bonds(bondID1);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(STAKE_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userTkn1).eq(ONE_ETHER.mul(-3));
      expect(bal12.userTkn2).eq(0);
      expect(bal12.daoTkn1).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.daoTkn2).eq(0);
      expect(bal12.poolTkn1).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.poolTkn2).eq(0);
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      // TODO: check capacity and next price
    });
    it("", async function () {});
    it("", async function () {});
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
      expect(bal12.userTkn1).eq(0);
      expect(bal12.userTkn2).eq(0);
      expect(bal12.daoTkn1).eq(0);
      expect(bal12.daoTkn2).eq(0);
      expect(bal12.poolTkn1).eq(0);
      expect(bal12.poolTkn2).eq(0);
      expect(bal12.userBonds).eq(-1);
      expect(bal12.totalBonds).eq(-1);
    });
    it("can redeem with approval", async function () {
      //await teller1.connect(depositor2).redeem(1);
    });
    it("cannot double redeem", async function () {
      await expect(teller1.connect(depositor1).redeem(1)).to.be.revertedWith("query for nonexistent token");
    });
  });

  describe("deposit signed", function () {
    let STAKE_FEE = 300;
    let DAO_FEE = 200;

    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace.connect(governor).addMinter(bondDepo.address);
      await bondDepo.connect(governor).setParams(solace.address, xsolace.address, underwritingPool.address, dao.address);
      teller2 = await deployProxyTeller(teller1.address, tkn2.address);
    });
    it("can deposit signed", async function () {
      await teller2.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, 0, MAX_UINT64, 0, HALF_LIFE, ONE_ETHER.mul(10), false, ONE_ETHER.mul(2), 1);
      await teller2.connect(governor).setFees(STAKE_FEE, DAO_FEE);
      await tkn2.connect(deployer).transfer(depositor1.address, ONE_ETHER.mul(100));
      let bal1 = await getBalances(teller2, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, false);
      let nonce = await tkn2.nonces(depositor1.address);
      let approve = {
        owner: depositor1.address,
        spender: teller2.address,
        value: ONE_ETHER.mul(3),
      };
      let digest = getPermitDigest(await tkn2.name(), tkn2.address, chainId, approve, nonce, deadline);
      let { v, r, s } = sign(digest, Buffer.from(depositor1.privateKey.slice(2), "hex"));
      let tx1 = await teller2.connect(depositor1).depositSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false, deadline, v, r, s);
      let bondID1 = await teller2.numBonds();
      expect(bondID1).eq(1);
      let bondInfo = await teller2.bonds(bondID1);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller2, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(STAKE_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userTkn1).eq(0);
      expect(bal12.userTkn2).eq(ONE_ETHER.mul(-3));
      expect(bal12.daoTkn1).eq(0);
      expect(bal12.daoTkn2).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.poolTkn1).eq(0);
      expect(bal12.poolTkn2).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      // TODO: check capacity and next price
    });
    it("can deposit signed and stake", async function () {
      await teller2.connect(governor).setTerms(ONE_ETHER.mul(2), VESTING_TERM, 0, MAX_UINT64, 0, HALF_LIFE, ONE_ETHER.mul(10), true, ONE_ETHER.mul(2), 1);
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(xsolace.address, ONE_ETHER);
      let bal1 = await getBalances(teller2, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, true);
      let nonce = await tkn2.nonces(depositor1.address);
      let approve = {
        owner: depositor1.address,
        spender: teller2.address,
        value: ONE_ETHER.mul(3),
      };
      let digest = getPermitDigest(await tkn2.name(), tkn2.address, chainId, approve, nonce, deadline);
      let { v, r, s } = sign(digest, Buffer.from(depositor1.privateKey.slice(2), "hex"));
      let tx1 = await teller2.connect(depositor1).depositSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, true, deadline, v, r, s);
      let bondID1 = await teller2.numBonds();
      expect(bondID1).eq(2);
      let bondInfo = await teller2.bonds(bondID1);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(xsolace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller2, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(0);
      expect(bal12.vestingXSolace).eq(bondInfo.payoutAmount);
      expectClose(bal12.totalXSolace, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      expect(bal12.userTkn1).eq(0);
      expect(bal12.userTkn2).eq(ONE_ETHER.mul(-3));
      expect(bal12.daoTkn1).eq(0);
      expect(bal12.daoTkn2).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.poolTkn1).eq(0);
      expect(bal12.poolTkn2).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      // TODO: check capacity and next price
    });
    it("deposits have minimum price", async function () {
      await teller2.connect(governor).setTerms(ONE_ETHER, VESTING_TERM, 0, MAX_UINT64, ONE_ETHER.mul(2), HALF_LIFE, ONE_ETHER.mul(10), false, ONE_ETHER.mul(2), 1);
      let bal1 = await getBalances(teller2, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, false);
      let nonce = await tkn2.nonces(depositor1.address);
      let approve = {
        owner: depositor1.address,
        spender: teller2.address,
        value: ONE_ETHER.mul(3),
      };
      let digest = getPermitDigest(await tkn2.name(), tkn2.address, chainId, approve, nonce, deadline);
      let { v, r, s } = sign(digest, Buffer.from(depositor1.privateKey.slice(2), "hex"));
      let tx1 = await teller2.connect(depositor1).depositSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false, deadline, v, r, s);
      let bondID1 = await teller2.numBonds();
      expect(bondID1).eq(3);
      let bondInfo = await teller2.bonds(bondID1);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID1, bondInfo.pricePaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.maturation);
      expect(bondInfo.pricePaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-STAKE_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.maturation, VESTING_TERM+blockTimestamp+1, 5);
      let bal2 = await getBalances(teller2, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(bal12.userXSolace).eq(0);
      expect(bal12.vestingSolace).eq(bondInfo.payoutAmount);
      expect(bal12.vestingXSolace).eq(0);
      expectClose(bal12.stakingSolace, ONE_ETHER.mul(3).div(2).mul(STAKE_FEE).div(MAX_BPS), 1e14);
      expect(bal12.totalXSolace).eq(0);
      expect(bal12.userTkn1).eq(0);
      expect(bal12.userTkn2).eq(ONE_ETHER.mul(-3));
      expect(bal12.daoTkn1).eq(0);
      expect(bal12.daoTkn2).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(bal12.poolTkn1).eq(0);
      expect(bal12.poolTkn2).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      // TODO: check capacity and next price
    });
  });

  interface Balances {
    userSolace: BN;
    userXSolace: BN;
    vestingSolace: BN;
    vestingXSolace: BN;
    stakingSolace: BN;
    totalXSolace: BN;

    userTkn1: BN;
    userTkn2: BN;
    daoTkn1: BN;
    daoTkn2: BN;
    poolTkn1: BN;
    poolTkn2: BN;

    userBonds: BN;
    totalBonds: BN;
  }

  async function getBalances(teller: Contract, user: Wallet): Promise<Balances> {
    return {
      userSolace: await solace.balanceOf(user.address),
      userXSolace: await xsolace.balanceOf(user.address),
      vestingSolace: await solace.balanceOf(teller.address),
      vestingXSolace: await xsolace.balanceOf(teller.address),
      stakingSolace: await solace.balanceOf(xsolace.address),
      totalXSolace: await xsolace.totalSupply(),

      userTkn1: await tkn1.balanceOf(user.address),
      userTkn2: await tkn2.balanceOf(user.address),
      daoTkn1: await tkn1.balanceOf(dao.address),
      daoTkn2: await tkn2.balanceOf(dao.address),
      poolTkn1: await tkn1.balanceOf(underwritingPool.address),
      poolTkn2: await tkn2.balanceOf(underwritingPool.address),

      userBonds: await teller.balanceOf(user.address),
      totalBonds: await teller.totalSupply()
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

      userTkn1: balances1.userTkn1.sub(balances2.userTkn1),
      userTkn2: balances1.userTkn2.sub(balances2.userTkn2),
      daoTkn1: balances1.daoTkn1.sub(balances2.daoTkn1),
      daoTkn2: balances1.daoTkn2.sub(balances2.daoTkn2),
      poolTkn1: balances1.poolTkn1.sub(balances2.poolTkn1),
      poolTkn2: balances1.poolTkn2.sub(balances2.poolTkn2),

      userBonds: balances1.userBonds.sub(balances2.userBonds),
      totalBonds: balances1.totalBonds.sub(balances2.totalBonds)
    };
  }

  async function deployProxyTeller(implAddress: string, tokenAddress: string) {
    let newTeller;
    let tx = await bondDepo.connect(governor).createBondTeller(governor.address, implAddress, tokenAddress);
    let events = (await tx.wait())?.events;
    if(events && events.length > 0) {
      let event = events[0];
      newTeller = await ethers.getContractAt(artifacts.BondTellerERC20.abi, event?.args?.["deployment"]) as BondTellerErc20;
    } else throw "no deployment";
    expect(newTeller.address).not.eq(ZERO_ADDRESS);
    return newTeller;
  }
});
