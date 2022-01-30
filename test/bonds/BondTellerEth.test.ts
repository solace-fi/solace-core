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

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Solace, XsLocker, Weth9, Weth10, BondDepository, BondTellerEth } from "./../../typechain";
import { expectClose } from "./../utilities/math";
import { getERC20PermitSignature } from "./../utilities/getERC20PermitSignature";
import { expectDeployed } from "../utilities/expectDeployed";

const deadline = constants.MaxUint256;
const VESTING_TERM = 432000; // 5 days
const HALF_LIFE = 2592000; // 30 days
const MAX_BPS = 10000;
const PROTOCOL_FEE = 200;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ONE_ETHER = BN.from("1000000000000000000");

const MAX_UINT40 = BN.from("1099511627775");

// solace contracts
let solace: Solace;
let xslocker: XsLocker;
let bondDepo: BondDepository;
let teller1: BondTellerEth;
let teller2: BondTellerEth;

let weth9: Weth9;
let weth10: Weth10;

interface BOND_GLOBAL_TERMS {
  startPrice: BigNumberish,
  minimumPrice: BigNumberish,
  maxPayout: BigNumberish,
  priceAdjNum: BigNumberish,
  priceAdjDenom: BigNumberish,
  capacity: BigNumberish,
  capacityIsPayout: boolean,
  startTime: BigNumberish,
  endTime: BigNumberish,
  globalVestingTerm: BigNumberish,
  halfLife: BigNumberish
}

const DEFAULT_BOND_TERMS:BOND_GLOBAL_TERMS = {
  startPrice: ONE_ETHER,
  minimumPrice: ONE_ETHER,
  maxPayout: ONE_ETHER.mul(2),
  priceAdjNum: 1,
  priceAdjDenom: 10,
  capacity: ONE_ETHER.mul(10),
  capacityIsPayout: false,
  startTime: 0,
  endTime: MAX_UINT40,
  globalVestingTerm: VESTING_TERM,
  halfLife: HALF_LIFE
}

describe("BondTellerETH", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, depositor1, depositor2, minter, dao, underwritingPool, dao2, underwritingPool2, randomGreedyPerson] = provider.getWallets();

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
    weth9 = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    weth10 = (await deployContract(deployer, artifacts.WETH10)) as Weth10;
    await weth9.connect(deployer).deposit({value: ONE_ETHER.mul(100)});
    await weth10.connect(deployer).deposit({value: ONE_ETHER.mul(100)});
    bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address])) as BondDepository;
    await solace.connect(governor).addMinter(bondDepo.address);
  });

  describe("before initialization", function () {
    it("can deploy implementation", async function () {
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await expectDeployed(teller1.address);
      await bondDepo.connect(governor).addTeller(teller1.address);
      teller2 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await expectDeployed(teller2.address);
      await bondDepo.connect(governor).addTeller(teller2.address);
    });
    it("starts with no name, symbol, or supply", async function () {
      expect(await teller1.name()).eq("");
      expect(await teller1.symbol()).eq("");
      expect(await teller1.totalSupply()).eq(0);
    });
    it("reverts if zero governor", async function () {
      await expect(teller1.initialize("Solace ETH Bond", ZERO_ADDRESS, solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address)).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero solace", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, ZERO_ADDRESS, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address)).to.be.revertedWith("zero address solace");
    });
    it("reverts if zero xslocker", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, ZERO_ADDRESS, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address)).to.be.revertedWith("zero address xslocker");
    });
    it("reverts if zero pool", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, xslocker.address, ZERO_ADDRESS, dao.address, weth9.address, false, bondDepo.address)).to.be.revertedWith("zero address pool");
    });
    it("reverts if zero dao", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, ZERO_ADDRESS, weth9.address, false, bondDepo.address)).to.be.revertedWith("zero address dao");
    });
    it("reverts if zero principal", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, ZERO_ADDRESS, false, bondDepo.address)).to.be.revertedWith("zero address principal");
    });
    it("reverts if zero bond depo", async function () {
      await expect(teller1.initialize("Solace ETH Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, ZERO_ADDRESS)).to.be.revertedWith("zero address bond depo");
    });
  });

  describe("initialization", function () {
    it("inits", async function () {
      await teller1.initialize("Solace ETH Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address);
      await teller2.initialize("Solace ETH Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth10.address, true, bondDepo.address);
    });
    it("inits with a name and symbol", async function () {
      expect(await teller1.name()).eq("Solace ETH Bond");
      expect(await teller1.symbol()).eq("SBT");
    });
    it("starts with correct solace", async function () {
      expect(await teller1.solace()).eq(solace.address);
    });
    it("starts with correct xslocker", async function () {
      expect(await teller1.xsLocker()).eq(xslocker.address);
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
    it("starts with correct bond depo", async function () {
      expect(await teller1.bondDepo()).eq(bondDepo.address);
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
      await expect(tx).to.emit(teller1, "GovernancePending").withArgs(deployer.address);
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
      await expect(tx1).to.emit(teller1, "Paused");
      expect(await teller1.paused()).to.be.true;
      let tx2 = await teller1.connect(governor).pause();
      await expect(tx2).to.emit(teller1, "Paused");
      expect(await teller1.paused()).to.be.true;
      let tx3 = await teller1.connect(governor).unpause();
      await expect(tx3).to.emit(teller1, "Unpaused");
      expect(await teller1.paused()).to.be.false;
      let tx4 = await teller1.connect(governor).unpause();
      await expect(tx4).to.emit(teller1, "Unpaused");
      expect(await teller1.paused()).to.be.false;
    });
    it("cannot deposit while paused", async function () {
      await teller1.connect(governor).pause();
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("cannot deposit while paused");
      await teller1.connect(governor).unpause();
    });
    it("cannot depositSigned while paused", async function () {
      await teller2.connect(governor).pause();
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, weth10, ONE_ETHER);
      await expect(teller2.connect(depositor1).depositWethSigned(ONE_ETHER, ONE_ETHER, depositor1.address, false, deadline, v, r, s)).to.be.revertedWith("cannot deposit while paused");
      await teller2.connect(governor).unpause();
    });
  });

  describe("before setTerms() called", function() {
    it("terms begin unset", async function() {
      expect(await teller1.nextPrice()).to.equal(0);
      expect(await teller1.minimumPrice()).to.equal(0);
      expect(await teller1.maxPayout()).to.equal(0);
      expect(await teller1.priceAdjNum()).to.equal(0);
      expect(await teller1.priceAdjDenom()).to.equal(0);
      expect(await teller1.capacity()).to.equal(0);
      expect(await teller1.capacityIsPayout()).to.equal(false);
      expect(await teller1.startTime()).to.equal(0);
      expect(await teller1.endTime()).to.equal(0);
      expect(await teller1.globalVestingTerm()).to.equal(0);
      expect(await teller1.halfLife()).to.equal(0);
      expect(await teller1.termsSet()).to.equal(false);
      expect(await teller1.lastPriceUpdate()).to.equal(0);
    })
    it("other global variables also begin unset", async function() {
      expect(await teller1.numBonds()).to.equal(0);
      expect(await teller1.protocolFeeBps()).to.equal(0);
    })
    it("non-governance cannot call setTerms()", async function () {
      await expect(teller1.connect(depositor1).setTerms(DEFAULT_BOND_TERMS)).to.be.revertedWith("!governance");
      await expect(teller2.connect(depositor1).setTerms(DEFAULT_BOND_TERMS)).to.be.revertedWith("!governance");
    })
    it("cannot deposit() or depositSigned()", async function () {
      await expect(teller1.calculateAmountIn(1, false)).to.be.revertedWith("not initialized");
      await expect(teller1.calculateAmountOut(1, false)).to.be.revertedWith("not initialized");
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("not initialized");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, ONE_ETHER);
      await expect(teller2.connect(depositor2).depositWethSigned(ONE_ETHER, ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("not initialized");
    });
  });

  describe("ERC20 guards", function() {
    it("cannot deposit or depositSigned with insufficient balance", async function () {
      // setTerms for first time
      await teller1.connect(governor).setTerms(DEFAULT_BOND_TERMS);
      await teller2.connect(governor).setTerms(DEFAULT_BOND_TERMS);
      expect(await weth9.balanceOf(depositor1.address)).to.equal(0);
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, 1);
      await expect(teller2.connect(depositor2).depositWethSigned(1, 0, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("WETH: transfer amount exceeds balance");
    });
    it("cannot deposit without allowance", async function () {
      // Transfer 100 WETH9 to depositor1
      await weth9.connect(deployer).transfer(depositor1.address, 100);
      expect(await weth9.balanceOf(depositor1.address)).to.equal(100)
      await expect(teller1.connect(deployer).depositWeth(100, 0, depositor1.address, false)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      await weth9.connect(depositor1).transfer(deployer.address, 100);
    });
    it("cannot permit a non erc20permit token", async function () {
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller1.address, weth9, 1, constants.MaxUint256, 1);
      await expect(teller1.connect(depositor1).depositWethSigned(1, 1, depositor1.address, false, deadline, v, r, s)).to.be.revertedWith("principal does not support permit");
    });
  })

  describe("term parameter guards", function() {
    before(async function() {
      // Transfer 100K WETH9 to depositor1
      await weth9.connect(depositor1).approve(teller1.address, constants.MaxUint256);
      await weth9.connect(deployer).transfer(depositor1.address, ONE_ETHER.mul(100));
      expect(await weth9.balanceOf(depositor1.address)).to.equal(ONE_ETHER.mul(100));

      // Transfer 100K WETH10 to depositor2
      await weth10.connect(deployer).transfer(depositor2.address, ONE_ETHER.mul(100));
      expect(await weth10.balanceOf(depositor2.address)).to.equal(ONE_ETHER.mul(100));
    })

    it("cannot deposit or depositSigned with a zero address depositor", async function() {
      await expect(teller1.connect(depositor1).depositWeth(1, 1, ZERO_ADDRESS, false)).to.be.revertedWith("invalid address");

      // Unable to use ZERO_ADDRESS as 'owner' parameter for getERC20PermitSignature => Unable to test depositSigned with a zero address depositor
      // We can consider this path safe on the assumption that the private keys to the zero address won't be found

      // let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, ONE_ETHER);
      // await expect(teller2.connect(depositor2).depositWethSigned(ONE_ETHER, ONE_ETHER, ZERO_ADDRESS, false, deadline, v, r, s)).to.be.revertedWith("invalid address");
    })
    it("cannot deposit or depositSigned before startTime", async function () {
      const blockTimestamp = await getCurrentTimestamp()
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startTime = blockTimestamp + 10
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("bond not yet started");

      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, ONE_ETHER);
      await expect(teller2.connect(depositor2).depositWethSigned(ONE_ETHER, ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond not yet started");
    });
    it("cannot deposit or depositSigned after endTime", async function () {
      const blockTimestamp = await getCurrentTimestamp()
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.endTime = blockTimestamp - 1
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("bond concluded");

      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, ONE_ETHER);
      await expect(teller2.connect(depositor2).depositWethSigned(ONE_ETHER, ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond concluded");
    });
    it("cannot deposit or depositSigned if bondPrice decayed to 0", async function() {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.minimumPrice = 0;
      MODIFIED_BOND_TERMS.halfLife = 1;
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);

      const blockTimestamp = await getCurrentTimestamp()
      await provider.send("evm_mine", [blockTimestamp + 60]);
      expect(await getCurrentTimestamp()).to.equal(blockTimestamp + 60);
      expect(await teller1.bondPrice()).eq(0);
      expect(await teller2.bondPrice()).eq(0);

      await expect(teller1.calculateAmountIn(1, false)).to.be.revertedWith("zero price");
      await expect(teller1.calculateAmountOut(1, false)).to.be.revertedWith("zero price");
      await expect(teller1.connect(depositor1).depositWeth(1, 1, depositor1.address, false)).to.be.revertedWith("invalid price");

      await expect(teller2.calculateAmountIn(1, false)).to.be.revertedWith("zero price");
      await expect(teller2.calculateAmountOut(1, false)).to.be.revertedWith("zero price");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, ONE_ETHER);
      await expect(teller2.connect(depositor2).depositWethSigned(ONE_ETHER, ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("invalid price");
    })
    it("Given capacityIsPayout = false, deposit or depositSigned will revert if `principal paid > capacity`", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2);
      MODIFIED_BOND_TERMS.capacity = ONE_ETHER;
      MODIFIED_BOND_TERMS.capacityIsPayout = false;
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);

      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(false);
      await expect(teller1.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.add(1), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).depositWeth(ONE_ETHER.add(1), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond at capacity");

      expect(await teller2.capacity()).eq(ONE_ETHER);
      expect(await teller2.capacityIsPayout()).eq(false);
      await expect(teller2.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond at capacity");
      await expect(teller2.calculateAmountOut(ONE_ETHER.add(1), false)).to.be.revertedWith("bond at capacity");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, ONE_ETHER.add(1));
      await expect(teller2.connect(depositor2).depositWethSigned(ONE_ETHER.add(1), ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond at capacity");
    });
    it("Given capacityIsPayout = true, deposit or depositSigned will revert if `payout > capacity`", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER;
      MODIFIED_BOND_TERMS.capacity = ONE_ETHER;
      MODIFIED_BOND_TERMS.capacityIsPayout = true;
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);

      expect(await teller1.capacity()).eq(ONE_ETHER);
      expect(await teller1.capacityIsPayout()).eq(true);
      await expect(teller1.calculateAmountIn(ONE_ETHER.add(2), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.calculateAmountOut(ONE_ETHER.add(2), false)).to.be.revertedWith("bond at capacity");
      await expect(teller1.connect(depositor1).depositWeth(ONE_ETHER.add(2), 0, depositor1.address, false)).to.be.revertedWith("bond at capacity");

      expect(await teller2.capacity()).eq(ONE_ETHER);
      expect(await teller2.capacityIsPayout()).eq(true);
      await expect(teller2.calculateAmountIn(ONE_ETHER.add(2), false)).to.be.revertedWith("bond at capacity");
      await expect(teller2.calculateAmountOut(ONE_ETHER.add(2), false)).to.be.revertedWith("bond at capacity");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, ONE_ETHER.add(2));
      await expect(teller2.connect(depositor2).depositWethSigned(ONE_ETHER.add(2), 0, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond at capacity");
    });
    it("calculateAmountIn, calculateAmountOut, deposit and depositSigned will respect maxPayout", async function() {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.maxPayout = ONE_ETHER;
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await expect(teller1.calculateAmountOut(ONE_ETHER.add(2), false)).to.be.revertedWith("bond too large");
      await expect(teller1.calculateAmountIn(ONE_ETHER.add(2), false)).to.be.revertedWith("bond too large");
      await expect(teller1.connect(depositor1).depositWeth(ONE_ETHER.add(2), 0, depositor1.address, false)).to.be.revertedWith("bond too large");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, ONE_ETHER.add(2));
      await expect(teller2.connect(depositor2).depositWethSigned(ONE_ETHER.add(2), 0, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond too large");
    })
    it("slippage protection - deposit() and depositSigned() respect minAmountOut", async function () {
      await teller1.connect(governor).setTerms(DEFAULT_BOND_TERMS);
      await teller2.connect(governor).setTerms(DEFAULT_BOND_TERMS);

      // set minAmountOut = ONE_ETHER
      // Find corresponding amountIn needed to get this minAmountOut
      const amountIn1 = await teller1.calculateAmountIn(ONE_ETHER, false);
      const amountOut1 = await teller1.calculateAmountOut(amountIn1, false); // This line to help branch coverage
      await expect(teller1.connect(depositor1).depositWeth(amountIn1.sub(1), ONE_ETHER, depositor1.address, false)).to.be.revertedWith("slippage protection");
      // Block-scope here to avoid v, r, s namespace conflict
      {
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, amountIn1.sub(1));
      await expect(teller2.connect(depositor2).depositWethSigned(amountIn1.sub(1), ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("slippage protection");
      }

      const amountIn2 = await teller1.calculateAmountIn(ONE_ETHER, true);
      await expect(teller1.connect(depositor1).depositWeth(amountIn2.sub(1), ONE_ETHER, depositor1.address, true)).to.be.revertedWith("slippage protection");
      {
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, weth10, amountIn2.sub(1));
      await expect(teller2.connect(depositor2).depositWethSigned(amountIn2.sub(1), ONE_ETHER, depositor2.address, true, deadline, v, r, s)).to.be.revertedWith("slippage protection");
      }
    });
    it("cannot deposit if bondDepo is not solace minter", async function () {
      await solace.connect(governor).removeMinter(bondDepo.address);
      await expect(teller1.connect(depositor1).depositWeth(2, 0, depositor1.address, false)).to.be.revertedWith("!minter");
      await solace.connect(governor).addMinter(bondDepo.address);
    });
    it("cannot deposit if teller not registered", async function () {
      await bondDepo.connect(governor).removeTeller(teller1.address);
      await expect(teller1.connect(depositor1).depositWeth(2, 0, depositor1.address, false)).to.be.revertedWith("!teller");
      await bondDepo.connect(governor).addTeller(teller1.address);
    });
  })

  describe("depositEth cases", function () {
    it("test deposit 1 - deposit 3 ETH, starting SOLACE price of 2 ETH", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = 0;
      await teller1.connect(governor).setFees(protocolFee);
      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);

      // Tx to purchase bond
      let tx1 = await teller1.connect(depositor1).depositEth(ONE_ETHER, depositor1.address, false, {value: ONE_ETHER.mul(3)});
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm CreateBond event emitted
      let bondID = await teller1.numBonds();
      expect(bondID).eq(1);
      let bondInfo = await teller1.bonds(bondID);
      await expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);

      // Confirm minted bond has desired parameters
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm());
      const blockTimestamp = await getCurrentTimestamp();
      expect(bondInfo.vestingStart).eq(blockTimestamp);
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.stakingSolace).eq(0);
      expect(change_in_balances.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost));
      expect(change_in_balances.userWeth9).eq(0);
      expect(change_in_balances.userWeth10).eq(0);
      expect(change_in_balances.daoEth).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.daoWeth9).eq(0);
      expect(change_in_balances.daoWeth10).eq(0);
      expect(change_in_balances.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.poolWeth9).eq(0);
      expect(change_in_balances.poolWeth10).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14);
    })
    it("test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 ETH, starting SOLACE price of 2 ETH", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      MODIFIED_BOND_TERMS.capacityIsPayout = true;
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = PROTOCOL_FEE;
      await teller1.connect(governor).setFees(protocolFee);

      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, true);

      // Deposit
      let tx1 = await teller1.connect(depositor1).depositEth(ONE_ETHER, depositor1.address, true, {value: ONE_ETHER.mul(3)});
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm lock parameters
      let lockID = await xslocker.totalNumLocks();
      expect(lockID).eq(1);
      let lockInfo = await xslocker.locks(lockID);
      await expect(tx1).to.emit(xslocker, "LockCreated").withArgs(lockID);

      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(lockInfo.amount, predictedAmountOut, 1e14);
      const blockTimestamp = await getCurrentTimestamp();
      let expectedEnd = (await teller1.globalVestingTerm()) + blockTimestamp;
      expect(lockInfo.end).eq(expectedEnd);

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(0);
      expectClose(change_in_balances.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      expect(change_in_balances.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost));
      expect(change_in_balances.userWeth9).eq(0);
      expect(change_in_balances.userWeth10).eq(0);
      expect(change_in_balances.daoEth).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.daoWeth9).eq(0);
      expect(change_in_balances.daoWeth10).eq(0);
      expect(change_in_balances.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.poolWeth9).eq(0);
      expect(change_in_balances.poolWeth10).eq(0);
      expect(change_in_balances.userBonds).eq(0);
      expect(change_in_balances.totalBonds).eq(0);
      expect(change_in_balances.userLocks).eq(1);
      expect(change_in_balances.totalLocks).eq(1);
      expect(change_in_balances.tellerCapacity).eq(lockInfo.amount.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, lockInfo.amount.div(10), 1e14);
    });
    it("test deposit 3 - deposit 3 ETH, set startPrice = 1 but minimumPrice = 2", async function() {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.minimumPrice = ONE_ETHER.mul(2)
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = PROTOCOL_FEE;
      await teller1.connect(governor).setFees(protocolFee);

      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);

      // Deposit
      let tx1 = await teller1.connect(depositor1).depositEth(ONE_ETHER, depositor1.address, false, {value: ONE_ETHER.mul(3)});
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm bond parameters
      let bondID = await teller1.numBonds();
      expect(bondID).eq(2);
      let bondInfo = await teller1.bonds(bondID);
      await expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.stakingSolace).eq(0);
      expect(change_in_balances.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost));
      expect(change_in_balances.userWeth9).eq(0);
      expect(change_in_balances.userWeth10).eq(0);
      expect(change_in_balances.daoEth).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.daoWeth9).eq(0);
      expect(change_in_balances.daoWeth10).eq(0);
      expect(change_in_balances.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.poolWeth9).eq(0);
      expect(change_in_balances.poolWeth10).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14)
    })
  })

  describe("claimPayout after depositEth cases", function() {
    it("cannot claimPayout for a non-existent bondID", async function () {
      await expect(teller1.connect(depositor1).claimPayout(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer", async function () {
      await expect(teller1.connect(randomGreedyPerson).claimPayout(1)).to.be.revertedWith("!bonder");
    });
    it("approves depositor2 to claimPayout on Bond 2 (which was minted by depositor)", async function() {
      // We will be testing claimPayout with approval from an approved proxy account
      // Replaces "can redeem with approval" unit test in original test script
      const bondID = 2
      await teller1.connect(depositor1).approve(depositor2.address, bondID);
    })
    it("t = 0, expect claimPayout will work but there will be miniscule payout", async function() {
      // Query bond.payoutAlreadyClaimed values
      let bondInfo_1 = await teller1.bonds(1);
      let bondInfo_2 = await teller1.bonds(2);
      expect(bondInfo_1.payoutAlreadyClaimed).eq(0)
      expect(bondInfo_2.payoutAlreadyClaimed).eq(0)

      let balances_before_claimpayout = await getBalances(teller1, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller1, depositor2)
      await teller1.connect(depositor1).claimPayout(1)
      await teller1.connect(depositor1).claimPayout(2)
      let balances_after_claimpayout = await getBalances(teller1, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller1, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Query bond.payoutAlreadyClaimed values again
      // Some time has passed from when we minted these bonds, so values will be non-zero
      // We check that the claimed amount is less than 1/10000 of the total bond payout
      bondInfo_1 = await teller1.bonds(1);
      bondInfo_2 = await teller1.bonds(2);
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))

      // Check change_in_balances for depositor1 and teller1
      expectClose(change_in_balances.userSolace, 0, 1e14)
      expectClose(change_in_balances.vestingSolace, 0, 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.userWeth9).to.eq(0)
      expect(change_in_balances.userWeth10).to.eq(0)
      expect(change_in_balances.daoWeth9).to.eq(0)
      expect(change_in_balances.daoWeth10).to.eq(0)
      expect(change_in_balances.poolWeth9).to.eq(0)
      expect(change_in_balances.poolWeth10).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, 0, 1e14)
      expect(change_in_balances_depositor2.userWeth9).to.eq(0)
      expect(change_in_balances_depositor2.userWeth10).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
      expect(change_in_balances_depositor2.userLocks).eq(0);
      expect(change_in_balances_depositor2.totalLocks).eq(0);
    })
    it("t = 0, expect withdraw lock to revert", async function() {
      await expect(xslocker.connect(depositor1).withdraw(1, depositor1.address)).to.be.revertedWith("locked");
    });
    it("t = halfway through vesting, expect half of tokens to be claimable", async function() {
      let bondInfo_1 = await teller1.bonds(1);
      let bondInfo_2 = await teller1.bonds(2);
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))

      // // Skip time to halfway through vesting
      const blockTimestamp = await getCurrentTimestamp();
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM/2]);

      let balances_before_claimpayout = await getBalances(teller1, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller1, depositor2)
      await teller1.connect(depositor1).claimPayout(1)
      await teller1.connect(depositor2).claimPayout(2)
      let balances_after_claimpayout = await getBalances(teller1, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller1, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      bondInfo_1 = await teller1.bonds(1);
      bondInfo_2 = await teller1.bonds(2);
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)

      // Check change_in_balances for depositor1 and teller1
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_2.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.userWeth9).to.eq(0)
      expect(change_in_balances.userWeth10).to.eq(0)
      expect(change_in_balances.daoWeth9).to.eq(0)
      expect(change_in_balances.daoWeth10).to.eq(0)
      expect(change_in_balances.poolWeth9).to.eq(0)
      expect(change_in_balances.poolWeth10).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      //expect(change_in_balances_depositor2.userXSolace).eq(0)
      expect(change_in_balances_depositor2.userWeth9).to.eq(0)
      expect(change_in_balances_depositor2.userWeth10).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
      expect(change_in_balances_depositor2.userLocks).eq(0);
      expect(change_in_balances_depositor2.totalLocks).eq(0);
    })
    it("t = halfway through vesting, expect withdraw lock to revert", async function() {
      await expect(xslocker.connect(depositor1).withdraw(1, depositor1.address)).to.be.revertedWith("locked");
    });
    it("t = after vesting complete, expect all tokens claimed & bonds burned", async function() {
      let bondInfo_1 = await teller1.bonds(1);
      let bondInfo_2 = await teller1.bonds(2);
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)

      // Skip time to after vesting completed
      const blockTimestamp = await getCurrentTimestamp()
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM + 1]);

      let balances_before_claimpayout = await getBalances(teller1, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller1, depositor2)
      let tx1 = await teller1.connect(depositor1).claimPayout(1)
      let tx2 = await teller1.connect(depositor2).claimPayout(2)
      await expect(tx1).to.emit(teller1, "RedeemBond").withArgs(1, depositor1.address, bondInfo_1.payoutAmount.sub(bondInfo_1.payoutAlreadyClaimed));
      await expect(tx2).to.emit(teller1, "RedeemBond").withArgs(2, depositor2.address, bondInfo_2.payoutAmount.sub(bondInfo_2.payoutAlreadyClaimed));
      let balances_after_claimpayout = await getBalances(teller1, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller1, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Check change_in_balances for depositor1 and teller1
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_2.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.userWeth9).to.eq(0)
      expect(change_in_balances.userWeth10).to.eq(0)
      expect(change_in_balances.daoWeth9).to.eq(0)
      expect(change_in_balances.daoWeth10).to.eq(0)
      expect(change_in_balances.poolWeth9).to.eq(0)
      expect(change_in_balances.poolWeth10).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(-2)
      expect(change_in_balances.totalBonds).to.eq(-2)
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expect(change_in_balances_depositor2.userWeth9).to.eq(0)
      expect(change_in_balances_depositor2.userWeth10).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
      expect(change_in_balances_depositor2.userLocks).eq(0);
      expect(change_in_balances_depositor2.totalLocks).eq(0);
    })
    it("t = after vesting complete, expect withdraw lock to succeed", async function() {
      let balances1 = await getBalances(teller1, depositor1);
      let lockInfo = await xslocker.locks(1);
      let tx = await xslocker.connect(depositor1).withdraw(1, depositor1.address);
      await expect(tx).to.emit(xslocker, "Withdrawl").withArgs(1, lockInfo.amount);
      let balances2 = await getBalances(teller1, depositor1);
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.userSolace).eq(lockInfo.amount);
      expect(balancesDiff.stakingSolace).eq(lockInfo.amount.mul(-1));
      expect(balancesDiff.userLocks).eq(-1);
      expect(balancesDiff.totalLocks).eq(-1);
    });
    it("claimPayout fails after BondBurned event", async function() {
      await expect(teller1.connect(depositor1).claimPayout(1)).to.be.revertedWith("query for nonexistent token");
      await expect(teller1.connect(depositor1).claimPayout(2)).to.be.revertedWith("query for nonexistent token");
      await expect(teller1.connect(depositor2).claimPayout(3)).to.be.revertedWith("query for nonexistent token");
    })
  })

  describe("depositWeth cases", function () {
    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
      bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address])) as BondDepository;
      await solace.connect(governor).addMinter(bondDepo.address);
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller1.connect(governor).initialize("Solace WETH9 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller1.address);
      teller2 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller2.connect(governor).initialize("Solace WETH10 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth10.address, true, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller2.address);
      await weth9.connect(depositor1).approve(teller1.address, constants.MaxUint256);
    });
    it("test deposit 1 - deposit 3 WETH9, starting SOLACE price of 2 WETH9", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = 0;
      await teller1.connect(governor).setFees(protocolFee);
      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);

      // Tx to purchase bond
      let tx1 = await teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm CreateBond event emitted
      let bondID = await teller1.numBonds();
      expect(bondID).eq(1);
      let bondInfo = await teller1.bonds(bondID);
      await expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);

      // Confirm minted bond has desired parameters
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm());
      const blockTimestamp = await getCurrentTimestamp();
      expect(bondInfo.vestingStart).eq(blockTimestamp);
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.stakingSolace).eq(0);
      expect(change_in_balances.userEth).eq(gasCost.mul(-1));
      expect(change_in_balances.userWeth9).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.userWeth10).eq(0);
      expect(change_in_balances.daoEth).eq(0);
      expect(change_in_balances.daoWeth9).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.daoWeth10).eq(0);
      expect(change_in_balances.poolEth).eq(0);
      expect(change_in_balances.poolWeth9).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.poolWeth10).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14);
    })
    it("test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 WETH9, starting SOLACE price of 2 WETH9", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      MODIFIED_BOND_TERMS.capacityIsPayout = true;
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = PROTOCOL_FEE;
      await teller1.connect(governor).setFees(protocolFee);

      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, true);

      // Deposit
      let tx1 = await teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, true);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm lock parameters
      let lockID = await xslocker.totalNumLocks();
      expect(lockID).eq(1);
      let lockInfo = await xslocker.locks(lockID);
      await expect(tx1).to.emit(xslocker, "LockCreated").withArgs(lockID);

      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(lockInfo.amount, predictedAmountOut, 1e14);
      const blockTimestamp = await getCurrentTimestamp();
      let expectedEnd = (await teller1.globalVestingTerm()) + blockTimestamp;
      expect(lockInfo.end).eq(expectedEnd);

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(0);
      expectClose(change_in_balances.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      expect(change_in_balances.userEth).eq(gasCost.mul(-1));
      expect(change_in_balances.userWeth9).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.userWeth10).eq(0);
      expect(change_in_balances.daoEth).eq(0);
      expect(change_in_balances.daoWeth9).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.daoWeth10).eq(0);
      expect(change_in_balances.poolEth).eq(0);
      expect(change_in_balances.poolWeth9).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.poolWeth10).eq(0);
      expect(change_in_balances.userBonds).eq(0);
      expect(change_in_balances.totalBonds).eq(0);
      expect(change_in_balances.userLocks).eq(1);
      expect(change_in_balances.totalLocks).eq(1);
      expect(change_in_balances.tellerCapacity).eq(lockInfo.amount.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, lockInfo.amount.div(10), 1e14);
    });
    it("test deposit 3 - deposit 3 WETH9, set startPrice = 1 but minimumPrice = 2", async function() {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.minimumPrice = ONE_ETHER.mul(2)
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = PROTOCOL_FEE;
      await teller1.connect(governor).setFees(protocolFee);

      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);

      // Deposit
      let tx1 = await teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm bond parameters
      let bondID = await teller1.numBonds();
      expect(bondID).eq(2);
      let bondInfo = await teller1.bonds(bondID);
      await expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.stakingSolace).eq(0);
      expect(change_in_balances.userEth).eq(gasCost.mul(-1));
      expect(change_in_balances.userWeth9).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.userWeth10).eq(0);
      expect(change_in_balances.daoEth).eq(0);
      expect(change_in_balances.daoWeth9).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.daoWeth10).eq(0);
      expect(change_in_balances.poolEth).eq(0);
      expect(change_in_balances.poolWeth9).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.poolWeth10).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14)
    })
  })

  describe("claimPayout after depositWeth cases", function() {
    it("cannot claimPayout for a non-existent bondID", async function () {
      await expect(teller1.connect(depositor1).claimPayout(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer", async function () {
      await expect(teller1.connect(randomGreedyPerson).claimPayout(1)).to.be.revertedWith("!bonder");
    });
    it("approves depositor2 to claimPayout on Bond 2 (which was minted by depositor)", async function() {
      // We will be testing claimPayout with approval from an approved proxy account
      // Replaces "can redeem with approval" unit test in original test script
      const bondID = 2
      await teller1.connect(depositor1).approve(depositor2.address, bondID);
    })
    it("t = 0, expect claimPayout will work but there will be miniscule payout", async function() {
      // Query bond.payoutAlreadyClaimed values
      let bondInfo_1 = await teller1.bonds(1);
      let bondInfo_2 = await teller1.bonds(2);
      expect(bondInfo_1.payoutAlreadyClaimed).eq(0)
      expect(bondInfo_2.payoutAlreadyClaimed).eq(0)

      let balances_before_claimpayout = await getBalances(teller1, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller1, depositor2)
      await teller1.connect(depositor1).claimPayout(1)
      await teller1.connect(depositor1).claimPayout(2)
      let balances_after_claimpayout = await getBalances(teller1, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller1, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Query bond.payoutAlreadyClaimed values again
      // Some time has passed from when we minted these bonds, so values will be non-zero
      // We check that the claimed amount is less than 1/10000 of the total bond payout
      bondInfo_1 = await teller1.bonds(1);
      bondInfo_2 = await teller1.bonds(2);
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))

      // Check change_in_balances for depositor1 and teller1
      expectClose(change_in_balances.userSolace, 0, 1e14)
      expectClose(change_in_balances.vestingSolace, 0, 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.userWeth9).to.eq(0)
      expect(change_in_balances.userWeth10).to.eq(0)
      expect(change_in_balances.daoWeth9).to.eq(0)
      expect(change_in_balances.daoWeth10).to.eq(0)
      expect(change_in_balances.poolWeth9).to.eq(0)
      expect(change_in_balances.poolWeth10).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, 0, 1e14)
      expect(change_in_balances_depositor2.userWeth9).to.eq(0)
      expect(change_in_balances_depositor2.userWeth10).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
      expect(change_in_balances_depositor2.userLocks).eq(0);
      expect(change_in_balances_depositor2.totalLocks).eq(0);
    })
    it("t = 0, expect withdraw lock to revert", async function() {
      await expect(xslocker.connect(depositor1).withdraw(1, depositor1.address)).to.be.revertedWith("locked");
    });
    it("t = halfway through vesting, expect half of tokens to be claimable", async function() {
      let bondInfo_1 = await teller1.bonds(1);
      let bondInfo_2 = await teller1.bonds(2);
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))

      // // Skip time to halfway through vesting
      const blockTimestamp = await getCurrentTimestamp();
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM/2]);

      let balances_before_claimpayout = await getBalances(teller1, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller1, depositor2)
      await teller1.connect(depositor1).claimPayout(1)
      await teller1.connect(depositor2).claimPayout(2)
      let balances_after_claimpayout = await getBalances(teller1, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller1, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      bondInfo_1 = await teller1.bonds(1);
      bondInfo_2 = await teller1.bonds(2);
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)

      // Check change_in_balances for depositor1 and teller1
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_2.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.userWeth9).to.eq(0)
      expect(change_in_balances.userWeth10).to.eq(0)
      expect(change_in_balances.daoWeth9).to.eq(0)
      expect(change_in_balances.daoWeth10).to.eq(0)
      expect(change_in_balances.poolWeth9).to.eq(0)
      expect(change_in_balances.poolWeth10).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      //expect(change_in_balances_depositor2.userXSolace).eq(0)
      expect(change_in_balances_depositor2.userWeth9).to.eq(0)
      expect(change_in_balances_depositor2.userWeth10).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
      expect(change_in_balances_depositor2.userLocks).eq(0);
      expect(change_in_balances_depositor2.totalLocks).eq(0);
    })
    it("t = halfway through vesting, expect withdraw lock to revert", async function() {
      await expect(xslocker.connect(depositor1).withdraw(1, depositor1.address)).to.be.revertedWith("locked");
    });
    it("t = after vesting complete, expect all tokens claimed & bonds burned", async function() {
      let bondInfo_1 = await teller1.bonds(1);
      let bondInfo_2 = await teller1.bonds(2);
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)

      // Skip time to after vesting completed
      const blockTimestamp = await getCurrentTimestamp()
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM + 1]);

      let balances_before_claimpayout = await getBalances(teller1, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller1, depositor2)
      let tx1 = await teller1.connect(depositor1).claimPayout(1)
      let tx2 = await teller1.connect(depositor2).claimPayout(2)
      await expect(tx1).to.emit(teller1, "RedeemBond").withArgs(1, depositor1.address, bondInfo_1.payoutAmount.sub(bondInfo_1.payoutAlreadyClaimed));
      await expect(tx2).to.emit(teller1, "RedeemBond").withArgs(2, depositor2.address, bondInfo_2.payoutAmount.sub(bondInfo_2.payoutAlreadyClaimed));
      let balances_after_claimpayout = await getBalances(teller1, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller1, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Check change_in_balances for depositor1 and teller1
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_2.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.userWeth9).to.eq(0)
      expect(change_in_balances.userWeth10).to.eq(0)
      expect(change_in_balances.daoWeth9).to.eq(0)
      expect(change_in_balances.daoWeth10).to.eq(0)
      expect(change_in_balances.poolWeth9).to.eq(0)
      expect(change_in_balances.poolWeth10).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(-2)
      expect(change_in_balances.totalBonds).to.eq(-2)
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expect(change_in_balances_depositor2.userWeth9).to.eq(0)
      expect(change_in_balances_depositor2.userWeth10).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
      expect(change_in_balances_depositor2.userLocks).eq(0);
      expect(change_in_balances_depositor2.totalLocks).eq(0);
    })
    it("t = after vesting complete, expect withdraw lock to succeed", async function() {
      let balances1 = await getBalances(teller1, depositor1);
      let lockInfo = await xslocker.locks(1);
      let tx = await xslocker.connect(depositor1).withdraw(1, depositor1.address);
      await expect(tx).to.emit(xslocker, "Withdrawl").withArgs(1, lockInfo.amount);
      let balances2 = await getBalances(teller1, depositor1);
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.userSolace).eq(lockInfo.amount);
      expect(balancesDiff.stakingSolace).eq(lockInfo.amount.mul(-1));
      expect(balancesDiff.userLocks).eq(-1);
      expect(balancesDiff.totalLocks).eq(-1);
    });
    it("claimPayout fails after BondBurned event", async function() {
      await expect(teller1.connect(depositor1).claimPayout(1)).to.be.revertedWith("query for nonexistent token");
      await expect(teller1.connect(depositor1).claimPayout(2)).to.be.revertedWith("query for nonexistent token");
      await expect(teller1.connect(depositor2).claimPayout(3)).to.be.revertedWith("query for nonexistent token");
    })
  })

  describe("depositWethSigned cases", function () {
    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
      bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address])) as BondDepository;
      await solace.connect(governor).addMinter(bondDepo.address);
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller1.connect(governor).initialize("Solace WETH9 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller1.address);
      teller2 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller2.connect(governor).initialize("Solace WETH10 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth10.address, true, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller2.address);
      await weth9.connect(depositor1).approve(teller2.address, constants.MaxUint256);
      await weth10.connect(depositor1).approve(teller2.address, constants.MaxUint256);
      await weth10.connect(depositor1).deposit({value: ONE_ETHER.mul(100)});
    });
    it("test deposit 1 - deposit 3 WETH10, starting SOLACE price of 2 WETH10", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = 0;
      await teller2.connect(governor).setFees(protocolFee);
      let balances_before_deposit = await getBalances(teller2, depositor1);
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, false);

      // Tx to purchase bond
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, weth10, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositWethSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false, deadline, v, r, s);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm CreateBond event emitted
      let bondID = await teller2.numBonds();
      expect(bondID).eq(1);
      let bondInfo = await teller2.bonds(bondID);
      await expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);

      // Confirm minted bond has desired parameters
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller2.globalVestingTerm());
      const blockTimestamp = await getCurrentTimestamp();
      expect(bondInfo.vestingStart).eq(blockTimestamp);
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller2, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.stakingSolace).eq(0);
      expect(change_in_balances.userEth).eq(gasCost.mul(-1));
      expect(change_in_balances.userWeth9).eq(0);
      expect(change_in_balances.userWeth10).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.daoEth).eq(0);
      expect(change_in_balances.daoWeth9).eq(0);
      expect(change_in_balances.daoWeth10).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.poolEth).eq(0);
      expect(change_in_balances.poolWeth9).eq(0);
      expect(change_in_balances.poolWeth10).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14);
    })
    it("test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 WETH10, starting SOLACE price of 2 WETH10", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      MODIFIED_BOND_TERMS.capacityIsPayout = true;
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = PROTOCOL_FEE;
      await teller2.connect(governor).setFees(protocolFee);

      let balances_before_deposit = await getBalances(teller2, depositor1);
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, true);

      // Deposit
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, weth10, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositWethSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, true, deadline, v, r, s);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm lock parameters
      let lockID = await xslocker.totalNumLocks();
      expect(lockID).eq(1);
      let lockInfo = await xslocker.locks(lockID);
      await expect(tx1).to.emit(xslocker, "LockCreated").withArgs(lockID);

      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(lockInfo.amount, predictedAmountOut, 1e14);
      const blockTimestamp = await getCurrentTimestamp();
      let expectedEnd = (await teller2.globalVestingTerm()) + blockTimestamp;
      expect(lockInfo.end).eq(expectedEnd);

      // Confirm balances
      let balances_after_deposit = await getBalances(teller2, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(0);
      expectClose(change_in_balances.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      expect(change_in_balances.userEth).eq(gasCost.mul(-1));
      expect(change_in_balances.userWeth9).eq(0);
      expect(change_in_balances.userWeth10).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.daoEth).eq(0);
      expect(change_in_balances.daoWeth9).eq(0);
      expect(change_in_balances.daoWeth10).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.poolEth).eq(0);
      expect(change_in_balances.poolWeth9).eq(0);
      expect(change_in_balances.poolWeth10).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.userBonds).eq(0);
      expect(change_in_balances.totalBonds).eq(0);
      expect(change_in_balances.userLocks).eq(1);
      expect(change_in_balances.totalLocks).eq(1);
      expect(change_in_balances.tellerCapacity).eq(lockInfo.amount.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, lockInfo.amount.div(10), 1e14);
    });
    it("test deposit 3 - deposit 3 WETH10, set startPrice = 1 but minimumPrice = 2", async function() {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.minimumPrice = ONE_ETHER.mul(2)
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = PROTOCOL_FEE;
      await teller2.connect(governor).setFees(protocolFee);

      let balances_before_deposit = await getBalances(teller2, depositor1);
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, false);

      // Deposit
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, weth10, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositWethSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false, deadline, v, r, s);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm bond parameters
      let bondID = await teller2.numBonds();
      expect(bondID).eq(2);
      let bondInfo = await teller2.bonds(bondID);
      await expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller2.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller2, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.stakingSolace).eq(0);
      expect(change_in_balances.userEth).eq(gasCost.mul(-1));
      expect(change_in_balances.userWeth9).eq(0);
      expect(change_in_balances.userWeth10).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.daoEth).eq(0);
      expect(change_in_balances.daoWeth9).eq(0);
      expect(change_in_balances.daoWeth10).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.poolEth).eq(0);
      expect(change_in_balances.poolWeth9).eq(0);
      expect(change_in_balances.poolWeth10).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14)
    })
  })

  describe("claimPayout after depositWethSigned cases", function() {
    it("cannot claimPayout for a non-existent bondID", async function () {
      await expect(teller2.connect(depositor1).claimPayout(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer", async function () {
      await expect(teller2.connect(randomGreedyPerson).claimPayout(1)).to.be.revertedWith("!bonder");
    });
    it("approves depositor2 to claimPayout on Bond 2 (which was minted by depositor)", async function() {
      // We will be testing claimPayout with approval from an approved proxy account
      // Replaces "can redeem with approval" unit test in original test script
      const bondID = 2
      await teller2.connect(depositor1).approve(depositor2.address, bondID);
    })
    it("t = 0, expect claimPayout will work but there will be miniscule payout", async function() {
      // Query bond.payoutAlreadyClaimed values
      let bondInfo_1 = await teller2.bonds(1);
      let bondInfo_2 = await teller2.bonds(2);
      expect(bondInfo_1.payoutAlreadyClaimed).eq(0)
      expect(bondInfo_2.payoutAlreadyClaimed).eq(0)

      let balances_before_claimpayout = await getBalances(teller2, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller2, depositor2)
      await teller2.connect(depositor1).claimPayout(1)
      await teller2.connect(depositor1).claimPayout(2)
      let balances_after_claimpayout = await getBalances(teller2, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller2, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Query bond.payoutAlreadyClaimed values again
      // Some time has passed from when we minted these bonds, so values will be non-zero
      // We check that the claimed amount is less than 1/10000 of the total bond payout
      bondInfo_1 = await teller2.bonds(1);
      bondInfo_2 = await teller2.bonds(2);
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))

      // Check change_in_balances for depositor1 and teller2
      expectClose(change_in_balances.userSolace, 0, 1e14)
      expectClose(change_in_balances.vestingSolace, 0, 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.userWeth9).to.eq(0)
      expect(change_in_balances.userWeth10).to.eq(0)
      expect(change_in_balances.daoWeth9).to.eq(0)
      expect(change_in_balances.daoWeth10).to.eq(0)
      expect(change_in_balances.poolWeth9).to.eq(0)
      expect(change_in_balances.poolWeth10).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, 0, 1e14)
      expect(change_in_balances_depositor2.userWeth9).to.eq(0)
      expect(change_in_balances_depositor2.userWeth10).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
      expect(change_in_balances_depositor2.userLocks).eq(0);
      expect(change_in_balances_depositor2.totalLocks).eq(0);
    })
    it("t = 0, expect withdraw lock to revert", async function() {
      await expect(xslocker.connect(depositor1).withdraw(1, depositor1.address)).to.be.revertedWith("locked");
    });
    it("t = halfway through vesting, expect half of tokens to be claimable", async function() {
      let bondInfo_1 = await teller2.bonds(1);
      let bondInfo_2 = await teller2.bonds(2);
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))

      // // Skip time to halfway through vesting
      const blockTimestamp = await getCurrentTimestamp();
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM/2]);

      let balances_before_claimpayout = await getBalances(teller2, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller2, depositor2)
      await teller2.connect(depositor1).claimPayout(1)
      await teller2.connect(depositor2).claimPayout(2)
      let balances_after_claimpayout = await getBalances(teller2, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller2, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      bondInfo_1 = await teller2.bonds(1);
      bondInfo_2 = await teller2.bonds(2);
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)

      // Check change_in_balances for depositor1 and teller2
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_2.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.userWeth9).to.eq(0)
      expect(change_in_balances.userWeth10).to.eq(0)
      expect(change_in_balances.daoWeth9).to.eq(0)
      expect(change_in_balances.daoWeth10).to.eq(0)
      expect(change_in_balances.poolWeth9).to.eq(0)
      expect(change_in_balances.poolWeth10).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      //expect(change_in_balances_depositor2.userXSolace).eq(0)
      expect(change_in_balances_depositor2.userWeth9).to.eq(0)
      expect(change_in_balances_depositor2.userWeth10).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
      expect(change_in_balances_depositor2.userLocks).eq(0);
      expect(change_in_balances_depositor2.totalLocks).eq(0);
    })
    it("t = halfway through vesting, expect withdraw lock to revert", async function() {
      await expect(xslocker.connect(depositor1).withdraw(1, depositor1.address)).to.be.revertedWith("locked");
    });
    it("t = after vesting complete, expect all tokens claimed & bonds burned", async function() {
      let bondInfo_1 = await teller2.bonds(1);
      let bondInfo_2 = await teller2.bonds(2);
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)

      // Skip time to after vesting completed
      const blockTimestamp = await getCurrentTimestamp()
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM + 1]);

      let balances_before_claimpayout = await getBalances(teller2, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller2, depositor2)
      let tx1 = await teller2.connect(depositor1).claimPayout(1)
      let tx2 = await teller2.connect(depositor2).claimPayout(2)
      await expect(tx1).to.emit(teller2, "RedeemBond").withArgs(1, depositor1.address, bondInfo_1.payoutAmount.sub(bondInfo_1.payoutAlreadyClaimed));
      await expect(tx2).to.emit(teller2, "RedeemBond").withArgs(2, depositor2.address, bondInfo_2.payoutAmount.sub(bondInfo_2.payoutAlreadyClaimed));
      let balances_after_claimpayout = await getBalances(teller2, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller2, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Check change_in_balances for depositor1 and teller2
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_2.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.userWeth9).to.eq(0)
      expect(change_in_balances.userWeth10).to.eq(0)
      expect(change_in_balances.daoWeth9).to.eq(0)
      expect(change_in_balances.daoWeth10).to.eq(0)
      expect(change_in_balances.poolWeth9).to.eq(0)
      expect(change_in_balances.poolWeth10).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(-2)
      expect(change_in_balances.totalBonds).to.eq(-2)
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expect(change_in_balances_depositor2.userWeth9).to.eq(0)
      expect(change_in_balances_depositor2.userWeth10).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
      expect(change_in_balances_depositor2.userLocks).eq(0);
      expect(change_in_balances_depositor2.totalLocks).eq(0);
    })
    it("t = after vesting complete, expect withdraw lock to succeed", async function() {
      let balances1 = await getBalances(teller2, depositor1);
      let lockInfo = await xslocker.locks(1);
      let tx = await xslocker.connect(depositor1).withdraw(1, depositor1.address);
      await expect(tx).to.emit(xslocker, "Withdrawl").withArgs(1, lockInfo.amount);
      let balances2 = await getBalances(teller2, depositor1);
      let balancesDiff = getBalancesDiff(balances2, balances1);
      expect(balancesDiff.userSolace).eq(lockInfo.amount);
      expect(balancesDiff.stakingSolace).eq(lockInfo.amount.mul(-1));
      expect(balancesDiff.userLocks).eq(-1);
      expect(balancesDiff.totalLocks).eq(-1);
    });
    it("claimPayout fails after BondBurned event", async function() {
      await expect(teller2.connect(depositor1).claimPayout(1)).to.be.revertedWith("query for nonexistent token");
      await expect(teller2.connect(depositor1).claimPayout(2)).to.be.revertedWith("query for nonexistent token");
      await expect(teller2.connect(depositor2).claimPayout(3)).to.be.revertedWith("query for nonexistent token");
    })
  })

  describe("deposit via receive() cases", function () {
    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
      bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address])) as BondDepository;
      await solace.connect(governor).addMinter(bondDepo.address);
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller1.connect(governor).initialize("Solace WETH9 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller1.address);
      teller2 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller2.connect(governor).initialize("Solace WETH10 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth10.address, true, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller2.address);
      await weth9.connect(depositor1).approve(teller1.address, constants.MaxUint256);
    });
    it("test deposit", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = 0;
      await teller1.connect(governor).setFees(protocolFee);
      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);

      // Tx to purchase bond
      let tx1 = await depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(3)});
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm CreateBond event emitted
      let bondID = await teller1.numBonds();
      expect(bondID).eq(1);
      let bondInfo = await teller1.bonds(bondID);
      await expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);

      // Confirm minted bond has desired parameters
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm());
      const blockTimestamp = await getCurrentTimestamp();
      expect(bondInfo.vestingStart).eq(blockTimestamp);
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.stakingSolace).eq(0);
      expect(change_in_balances.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost));
      expect(change_in_balances.userWeth9).eq(0);
      expect(change_in_balances.userWeth10).eq(0);
      expect(change_in_balances.daoEth).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.daoWeth9).eq(0);
      expect(change_in_balances.daoWeth10).eq(0);
      expect(change_in_balances.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.poolWeth9).eq(0);
      expect(change_in_balances.poolWeth10).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14);
    });
  });

  describe("deposit via fallback() cases", function () {
    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
      bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address])) as BondDepository;
      await solace.connect(governor).addMinter(bondDepo.address);
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller1.connect(governor).initialize("Solace WETH9 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller1.address);
      teller2 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller2.connect(governor).initialize("Solace WETH10 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth10.address, true, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller2.address);
      await weth9.connect(depositor1).approve(teller1.address, constants.MaxUint256);
    });
    it("test deposit", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let protocolFee = 0;
      await teller1.connect(governor).setFees(protocolFee);
      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);

      // Tx to purchase bond
      let tx1 = await depositor1.sendTransaction({to: teller1.address, value: ONE_ETHER.mul(3), data: "0xabcd"});
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm CreateBond event emitted
      let bondID = await teller1.numBonds();
      expect(bondID).eq(1);
      let bondInfo = await teller1.bonds(bondID);
      await expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);

      // Confirm minted bond has desired parameters
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm());
      const blockTimestamp = await getCurrentTimestamp();
      expect(bondInfo.vestingStart).eq(blockTimestamp);
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.stakingSolace).eq(0);
      expect(change_in_balances.userEth).eq(ONE_ETHER.mul(-3).sub(gasCost));
      expect(change_in_balances.userWeth9).eq(0);
      expect(change_in_balances.userWeth10).eq(0);
      expect(change_in_balances.daoEth).eq(ONE_ETHER.mul(3).mul(protocolFee).div(MAX_BPS));
      expect(change_in_balances.daoWeth9).eq(0);
      expect(change_in_balances.daoWeth10).eq(0);
      expect(change_in_balances.poolEth).eq(ONE_ETHER.mul(3).mul(MAX_BPS-protocolFee).div(MAX_BPS))
      expect(change_in_balances.poolWeth9).eq(0);
      expect(change_in_balances.poolWeth10).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.userLocks).eq(0);
      expect(change_in_balances.totalLocks).eq(0);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14);
    });
  });

  describe("set terms", async function () {
    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
      bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address])) as BondDepository;
      await solace.connect(governor).addMinter(bondDepo.address);
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller1.connect(governor).initialize("Solace WETH9 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller1.address);
      teller2 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller2.connect(governor).initialize("Solace WETH10 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth10.address, true, bondDepo.address);
      await bondDepo.connect(governor).addTeller(teller2.address);
    });
    it("terms start unset", async function () {
      await expect(teller2.bondPrice()).to.be.reverted;
      expect(await teller2.nextPrice()).eq(0);
      expect(await teller2.globalVestingTerm()).eq(0);
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
      await expect(teller2.connect(depositor1).setTerms({startPrice: ONE_ETHER.mul(2), minimumPrice: 0, maxPayout: ONE_ETHER.mul(2), priceAdjNum: 0, priceAdjDenom: 1, capacity: ONE_ETHER, capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE})).to.be.revertedWith("!governance");
    });
    it("validates inputs", async function () {
      await expect(teller2.connect(governor).setTerms({startPrice: 0, minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: 0, capacityIsPayout: false, startTime: 0, endTime: 0, globalVestingTerm: 0, halfLife: 0})).to.be.revertedWith("invalid price");
      await expect(teller2.connect(governor).setTerms({startPrice: 1, minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 0, capacity: 0, capacityIsPayout: false, startTime: 0, endTime: 0, globalVestingTerm: 0, halfLife: 0})).to.be.revertedWith("1/0");
      await expect(teller2.connect(governor).setTerms({startPrice: 1, minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: 0, capacityIsPayout: false, startTime: 3, endTime: 2, globalVestingTerm: 0, halfLife: 0})).to.be.revertedWith("invalid dates");
      await expect(teller2.connect(governor).setTerms({startPrice: 1, minimumPrice: 0, maxPayout: 0, priceAdjNum: 0, priceAdjDenom: 1, capacity: 0, capacityIsPayout: false, startTime: 2, endTime: 3, globalVestingTerm: 0, halfLife: 0})).to.be.revertedWith("invalid halflife");
    });
    it("can set terms", async function () {
      let tx = await teller2.connect(governor).setTerms({startPrice: 1, minimumPrice: 2, maxPayout: 3, priceAdjNum: 5, priceAdjDenom: 6, capacity: 7, capacityIsPayout: true, startTime: 8, endTime: 9, globalVestingTerm: 10, halfLife: 11});
      await expect(tx).to.emit(teller2, "TermsSet");
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      expect(await teller2.bondPrice()).eq(2);
      expect(await teller2.nextPrice()).eq(1);
      expect(await teller2.globalVestingTerm()).eq(10);
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

    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xslocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;
      bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address])) as BondDepository;
      await solace.connect(governor).addMinter(bondDepo.address);
      teller2 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller2.connect(governor).initialize("Solace WETH10 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth10.address, true, bondDepo.address);
    });
    it("fees start unset", async function () {
      expect(await teller2.protocolFeeBps()).eq(0);
    });
    it("non governance cannot set fees", async function () {
      await expect(teller2.connect(depositor1).setFees(0)).to.be.revertedWith("!governance");
    });
    it("validates inputs", async function () {
      await expect(teller2.connect(governor).setFees(10001)).to.be.revertedWith("invalid protocol fee");
    });
    it("can set fees", async function () {
      let tx = teller2.connect(governor).setFees(PROTOCOL_FEE);
      await expect(tx).to.emit(teller2, "FeesSet");
      expect(await teller2.protocolFeeBps()).eq(PROTOCOL_FEE);
    });
    it("can set to zero", async function () {
      let tx = teller2.connect(governor).setFees(0);
      await expect(tx).to.emit(teller2, "FeesSet");
      expect(await teller2.protocolFeeBps()).eq(0);
    });
  });

  describe("set addresses", function () {
    let solace2: Solace;
    let xslocker2: XsLocker;
    let bondDepo2: BondDepository;

    before("redeploy", async function () {
      solace2 = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xslocker2 = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace2.address])) as XsLocker;
      bondDepo2 = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace2.address])) as BondDepository;
      await solace2.connect(governor).addMinter(bondDepo2.address);
      teller1 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller1.connect(governor).initialize("Solace WETH9 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo.address);
      await bondDepo2.connect(governor).addTeller(teller1.address);
      teller2 = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
      await teller2.connect(governor).initialize("Solace WETH10 Bond", governor.address, solace.address, xslocker.address, underwritingPool.address, dao.address, weth10.address, true, bondDepo.address);
      await bondDepo2.connect(governor).addTeller(teller2.address);
    });
    it("non governance cannot set addresses", async function () {
      await expect(teller1.connect(depositor1).setAddresses(solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo2.address)).to.be.revertedWith("!governance");
    });
    it("validates input", async function () {
      await expect(teller1.connect(governor).setAddresses(ZERO_ADDRESS, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, bondDepo2.address)).to.be.revertedWith("zero address solace");
      await expect(teller1.connect(governor).setAddresses(solace.address, ZERO_ADDRESS, underwritingPool.address, dao.address, weth9.address, false, bondDepo2.address)).to.be.revertedWith("zero address xslocker");
      await expect(teller1.connect(governor).setAddresses(solace.address, xslocker.address, ZERO_ADDRESS, dao.address, weth9.address, false, bondDepo2.address)).to.be.revertedWith("zero address pool");
      await expect(teller1.connect(governor).setAddresses(solace.address, xslocker.address, underwritingPool.address, ZERO_ADDRESS, weth9.address, false, bondDepo2.address)).to.be.revertedWith("zero address dao");
      await expect(teller1.connect(governor).setAddresses(solace.address, xslocker.address, underwritingPool.address, dao.address, ZERO_ADDRESS, true, bondDepo2.address)).to.be.revertedWith("zero address principal");
      await expect(teller1.connect(governor).setAddresses(solace.address, xslocker.address, underwritingPool.address, dao.address, weth9.address, false, ZERO_ADDRESS)).to.be.revertedWith("zero address bond depo");
    })
    it("governance can set addresses", async function () {
      let tx = await teller1.connect(governor).setAddresses(solace2.address, xslocker2.address, underwritingPool2.address, dao2.address, weth10.address, true, bondDepo2.address);
      await expect(tx).to.emit(teller1, "AddressesSet");
      expect(await teller1.solace()).eq(solace2.address);
      expect(await teller1.xsLocker()).eq(xslocker2.address);
      expect(await teller1.underwritingPool()).eq(underwritingPool2.address);
      expect(await teller1.dao()).eq(dao2.address);
      expect(await teller1.principal()).eq(weth10.address);
      expect(await teller1.isPermittable()).eq(true);
      expect(await teller1.bondDepo()).eq(bondDepo2.address);
    });
    it("uses new addresses", async function () {
      await weth10.connect(depositor1).approve(teller1.address, constants.MaxUint256);
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER, minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      await teller1.connect(governor).setFees(PROTOCOL_FEE);
      let bal1 = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);
      let tx1 = await teller1.connect(depositor1).depositWeth(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);
      let bondID1 = await teller1.numBonds();
      expect(bondID1).eq(1);
      let bondInfo = await teller1.bonds(bondID1);
      await expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID1, bondInfo.principalPaid, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.vestingStart, blockTimestamp+1, 5);
      expectClose(bondInfo.localVestingTerm, VESTING_TERM, 5);
      let bal2 = await getBalances(teller1, depositor1);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userSolace).eq(0);
      expect(await solace2.balanceOf(teller1.address)).eq(bondInfo.payoutAmount);
      expect(bal12.userWeth9).eq(0);
      expect(bal12.userWeth10).eq(ONE_ETHER.mul(-3));
      expect(bal12.daoWeth9).eq(0);
      expect(await weth10.balanceOf(dao2.address)).eq(ONE_ETHER.mul(3).mul(PROTOCOL_FEE).div(MAX_BPS));
      expect(bal12.poolWeth9).eq(0);
      expect(await weth10.balanceOf(underwritingPool2.address)).eq(ONE_ETHER.mul(3).mul(MAX_BPS-PROTOCOL_FEE).div(MAX_BPS));
      expect(bal12.userBonds).eq(1);
      expect(bal12.totalBonds).eq(1);
      expect(bal12.userLocks).eq(0);
      expect(bal12.totalLocks).eq(0);
      expect(bal12.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(bal12.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14);
    });
  });

  interface Balances {
    userSolace: BN;
    vestingSolace: BN;
    stakingSolace: BN;

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
    userLocks: BN;
    totalLocks: BN;

    tellerCapacity: BN;
    tellerBondPrice: BN;
  }

  async function getBalances(teller: Contract, user: Wallet): Promise<Balances> {
    return {
      userSolace: await solace.balanceOf(user.address),
      vestingSolace: await solace.balanceOf(teller.address),
      stakingSolace: await solace.balanceOf(xslocker.address),

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
      userLocks: await xslocker.balanceOf(user.address),
      totalLocks: await xslocker.totalSupply(),

      tellerCapacity: await teller.capacity(),
      tellerBondPrice: await teller.bondPrice()
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userSolace: balances1.userSolace.sub(balances2.userSolace),
      vestingSolace: balances1.vestingSolace.sub(balances2.vestingSolace),
      stakingSolace: balances1.stakingSolace.sub(balances2.stakingSolace),

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
      userLocks: balances1.userLocks.sub(balances2.userLocks),
      totalLocks: balances1.totalLocks.sub(balances2.totalLocks),

      tellerCapacity: balances1.tellerCapacity.sub(balances2.tellerCapacity),
      tellerBondPrice: balances1.tellerBondPrice.sub(balances2.tellerBondPrice),
    };
  }

  async function getCurrentTimestamp() {
    const currentTimestamp = (await provider.getBlock('latest')).timestamp;
    return currentTimestamp;
  }
});
