import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, XSolace, MockErc20, MockErc20Permit, BondDepositoryV2, BondTellerErc20V2, Weth9 } from "../typechain";
import { expectClose } from "./utilities/math";
import { getERC20PermitSignature } from "./utilities/getERC20PermitSignature";

// common tokens
let weth: Weth9;
let dai: MockErc20;
let scp: MockErc20Permit;
// let solace_usdc_slp: MockErc20Permit;
// let usdc: MockErc20;
// let wbtc: MockErc20;
// let usdt: MockErc20;

// solace contracts
let solace: Solace;
let xsolace: XSolace;
let bondDepository: BondDepositoryV2;
let teller1: BondTellerErc20V2;
let teller2: BondTellerErc20V2;

// vars
const deadline = constants.MaxUint256;
const VESTING_TERM = 432000; // 5 days
const HALF_LIFE = 2592000; // 30 days
const MAX_BPS = 10000;
const MAX_UINT40 = BN.from((`${2**40 - 1}`).toString());

const BOND_FEE = 300;
const DAO_FEE = 200;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ONE_ETHER = BN.from("1000000000000000000");
const TEN_THOUSAND_ETHER = BN.from("10000000000000000000000");
const ONE_HUNDRED_THOUSAND_ETHER = BN.from("100000000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");

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

describe("BondTellerERC20V2", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, depositor1, depositor2, minter, dao, underwritingPool, dao2, underwritingPool2, randomGreedyPerson] = provider.getWallets();

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy common token contracts
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    dai = (await deployContract(deployer, artifacts.MockERC20, ["DAI", "DAI", ONE_MILLION_ETHER])) as MockErc20;
    scp = (await deployContract(deployer, artifacts.MockERC20Permit, ["SCP", "SCP", ONE_MILLION_ETHER, 18])) as MockErc20Permit;

    // deploy solace contracts
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
    bondDepository = (await deployContract(deployer, artifacts.BondDepositoryV2, [governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address])) as BondDepositoryV2;

    // mint 1M SOLACE to the governor
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(bondDepository.address, ONE_MILLION_ETHER);
  });

  describe("before initialization", function() {
    it("1M SOLACE has been minted to bondDepository", async function() {
      const bondDepository_SOLACE_balance = await solace.balanceOf(bondDepository.address);
      expect(bondDepository_SOLACE_balance).to.equal(ONE_MILLION_ETHER);
    })
    it("can deploy implementation", async function () {
      teller1 = (await deployContract(deployer, artifacts.BondTellerERC20V2)) as BondTellerErc20V2;
      await bondDepository.connect(governor).addTeller(teller1.address);
    });
    it("starts with no name, symbol, or supply", async function () {
      expect(await teller1.name()).eq("");
      expect(await teller1.symbol()).eq("");
      expect(await teller1.totalSupply()).eq(0);
    });
    it("reverts if zero governor", async function () {
      await expect(teller1.initialize("Solace DAI Bond", ZERO_ADDRESS, solace.address, xsolace.address, underwritingPool.address, dao.address, dai.address, bondDepository.address)).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero solace", async function () {
      await expect(teller1.initialize("Solace DAI Bond", governor.address, ZERO_ADDRESS, xsolace.address, underwritingPool.address, dao.address, dai.address, bondDepository.address)).to.be.revertedWith("zero address solace");
    });
    it("reverts if zero xsolace", async function () {
      await expect(teller1.initialize("Solace DAI Bond", governor.address, solace.address, ZERO_ADDRESS, underwritingPool.address, dao.address, dai.address, bondDepository.address)).to.be.revertedWith("zero address xsolace");
    });
    it("reverts if zero pool", async function () {
      await expect(teller1.initialize("Solace DAI Bond", governor.address, solace.address, xsolace.address, ZERO_ADDRESS, dao.address, dai.address, bondDepository.address)).to.be.revertedWith("zero address pool");
    });
    it("reverts if zero dao", async function () {
      await expect(teller1.initialize("Solace DAI Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, ZERO_ADDRESS, dai.address, bondDepository.address)).to.be.revertedWith("zero address dao");
    });
    it("reverts if zero principal", async function () {
      await expect(teller1.initialize("Solace DAI Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, ZERO_ADDRESS, bondDepository.address)).to.be.revertedWith("zero address principal");
    });
    it("reverts if zero bond depo", async function () {
      await expect(teller1.initialize("Solace DAI Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, dai.address, ZERO_ADDRESS)).to.be.revertedWith("zero address bond depo");
    });

    // Test cases before initialization
  })

  describe("initialization", function () {
    it("inits", async function () {
      await teller1.initialize("Solace DAI Bond", governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address, dai.address, bondDepository.address);
    });
    it("inits with a name and symbol", async function () {
      expect(await teller1.name()).eq("Solace DAI Bond");
      expect(await teller1.symbol()).eq("SBT V2");
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
      expect(await teller1.principal()).eq(dai.address);
    });
    it("starts with correct bondDepository", async function () {
      expect(await teller1.bondDepo()).eq(bondDepository.address);
    });

    it("can deploy proxy", async function () {
      teller2 = await deployProxyTeller("Solace SCP Bond", teller1.address, scp.address);
    });
    it("inits proxy with a name and symbol", async function () {
      expect(await teller2.name()).eq("Solace SCP Bond");
      expect(await teller2.symbol()).eq("SBT V2");
    });
    it("proxy starts with correct solace", async function () {
      expect(await teller2.solace()).eq(solace.address);
    });
    it("proxy starts with correct xsolace", async function () {
      expect(await teller2.xsolace()).eq(xsolace.address);
    });
    it("proxy starts with correct pool", async function () {
      expect(await teller2.underwritingPool()).eq(underwritingPool.address);
    });
    it("proxy starts with correct dao", async function () {
      expect(await teller2.dao()).eq(dao.address);
    });
    it("proxy starts with correct principal", async function () {
      expect(await teller2.principal()).eq(scp.address);
    });
    it("proxy starts with correct bondDepository", async function () {
      expect(await teller2.bondDepo()).eq(bondDepository.address);
    });
  })

  describe("governance functions for teller1", function() {
    it("starts with the correct governor", async function() {
      expect(await teller1.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(teller1.connect(deployer).setPendingGovernance(deployer.address)).to.be.revertedWith("!governance");
    });
    it("can set pending governance", async function() {
      let tx = await teller1.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(teller1, "GovernancePending").withArgs(deployer.address);
      expect(await teller1.governance()).to.equal(governor.address);
      expect(await teller1.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer to an account not set as pendingGovernance", async function() {
      await expect(teller1.connect(governor).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance to the intended pendingGovernance address", async function() {
      let tx = await teller1.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(teller1, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await teller1.governance()).to.equal(deployer.address);
      expect(await teller1.pendingGovernance()).to.equal(ZERO_ADDRESS);

      // setPendingGovernance test complete, undo changes to storage variables
      await teller1.connect(deployer).setPendingGovernance(governor.address);
      await teller1.connect(governor).acceptGovernance();
      expect(await teller1.governance()).to.equal(governor.address);
    });
  });

  describe("governance functions for teller2", function() {
    it("starts with the correct governor", async function() {
      expect(await teller2.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(teller2.connect(deployer).setPendingGovernance(deployer.address)).to.be.revertedWith("!governance");
    });
    it("can set pending governance", async function() {
      let tx = await teller2.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(teller2, "GovernancePending").withArgs(deployer.address);
      expect(await teller2.governance()).to.equal(governor.address);
      expect(await teller2.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer to an account not set as pendingGovernance", async function() {
      await expect(teller2.connect(governor).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance to the intended pendingGovernance address", async function() {
      let tx = await teller2.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(teller2, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await teller2.governance()).to.equal(deployer.address);
      expect(await teller2.pendingGovernance()).to.equal(ZERO_ADDRESS);

      // setPendingGovernance test complete, undo changes to storage variables
      await teller2.connect(deployer).setPendingGovernance(governor.address);
      await teller2.connect(governor).acceptGovernance();
      expect(await teller2.governance()).to.equal(governor.address);
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
      let tx2 = await teller1.connect(governor).unpause();
      expect(tx2).to.emit(teller1, "Unpaused");
      expect(await teller1.paused()).to.be.false;
    });
    it("cannot deposit while paused", async function () {
      await teller1.connect(governor).pause();
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("cannot deposit while paused");
      await teller1.connect(governor).unpause();
    });
    it("cannot depositSigned while paused", async function () {
      await teller2.connect(governor).pause();
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, scp, ONE_ETHER);
      await expect(teller2.connect(depositor1).depositSigned(ONE_ETHER, ONE_ETHER, depositor1.address, false, deadline, v, r, s)).to.be.revertedWith("cannot deposit while paused");
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
      expect(await teller1.daoFeeBps()).to.equal(0);
      expect(await teller1.bondFeeBps()).to.equal(0);
    })
    it("non-governance cannot call setTerms()", async function () {
      await expect(teller1.connect(depositor1).setTerms(DEFAULT_BOND_TERMS)).to.be.revertedWith("!governance");
      await expect(teller2.connect(depositor1).setTerms(DEFAULT_BOND_TERMS)).to.be.revertedWith("!governance");
    })
    it("cannot deposit() or depositSigned()", async function () {
      await expect(teller1.calculateAmountIn(1, false)).to.be.revertedWith("not initialized");
      await expect(teller1.calculateAmountOut(1, false)).to.be.revertedWith("not initialized");
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("not initialized");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, ONE_ETHER);
      await expect(teller2.connect(depositor2).depositSigned(ONE_ETHER, ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("not initialized");
    });
  })

  describe("ERC20 guards", function() {
    it("cannot deposit or depositSigned with insufficient balance", async function () {
      // setTerms for first time
      await teller1.connect(governor).setTerms(DEFAULT_BOND_TERMS);
      await teller2.connect(governor).setTerms(DEFAULT_BOND_TERMS);
      expect(await dai.balanceOf(depositor1.address)).to.equal(0)
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, 1);
      await expect(teller2.connect(depositor2).depositSigned(1, 0, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit without allowance", async function () {
      // Transfer 100 DAI to depositor1
      await dai.connect(deployer).transfer(depositor1.address, 100);
      expect(await dai.balanceOf(depositor1.address)).to.equal(100)
      await expect(teller1.connect(deployer).deposit(100, 0, depositor1.address, false)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      await dai.connect(depositor1).transfer(deployer.address, 100);
    });
    it("cannot permit a non erc20permit token", async function () {
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller1.address, dai, 1, constants.MaxUint256, 1);
      await expect(teller1.connect(depositor1).depositSigned(1, 1, depositor1.address, false, deadline, v, r, s)).to.be.revertedWith("Transaction reverted: function selector was not recognized and there's no fallback function");
    });
  })

  describe("term parameter guards", function() {
    before(async function() {
      // Transfer 100K DAI to depositor1
      await dai.connect(depositor1).approve(teller1.address, constants.MaxUint256);
      await dai.connect(deployer).transfer(depositor1.address, ONE_HUNDRED_THOUSAND_ETHER);
      expect(await dai.balanceOf(depositor1.address)).to.equal(ONE_HUNDRED_THOUSAND_ETHER);

      // Transfer 100K SCP to depositor2
      await scp.connect(deployer).transfer(depositor2.address, ONE_HUNDRED_THOUSAND_ETHER);
      expect(await scp.balanceOf(depositor2.address)).to.equal(ONE_HUNDRED_THOUSAND_ETHER);
    })
    
    it("cannot deposit or depositSigned with a zero address depositor", async function() {
      await expect(teller1.connect(depositor1).deposit(1, 1, ZERO_ADDRESS, false)).to.be.revertedWith("invalid address");

      // Unable to use ZERO_ADDRESS as 'owner' parameter for getERC20PermitSignature => Unable to test depositSigned with a zero address depositor
      // We can consider this path safe on the assumption that the private keys to the zero address won't be found

      // let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, ONE_ETHER);
      // await expect(teller2.connect(depositor2).depositSigned(ONE_ETHER, ONE_ETHER, ZERO_ADDRESS, false, deadline, v, r, s)).to.be.revertedWith("invalid address");
    })
    it("cannot deposit or depositSigned before startTime", async function () {
      const blockTimestamp = await getCurrentTimestamp()
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startTime = blockTimestamp + 10
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("bond not yet started");

      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, ONE_ETHER);
      await expect(teller2.connect(depositor2).depositSigned(ONE_ETHER, ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond not yet started");
    });
    it("cannot deposit or depositSigned after endTime", async function () {
      const blockTimestamp = await getCurrentTimestamp()
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.endTime = blockTimestamp - 1
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("bond concluded");

      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, ONE_ETHER);
      await expect(teller2.connect(depositor2).depositSigned(ONE_ETHER, ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond concluded");
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
      await expect(teller1.connect(depositor1).deposit(1, 1, depositor1.address, false)).to.be.revertedWith("invalid price");

      await expect(teller2.calculateAmountIn(1, false)).to.be.revertedWith("zero price");
      await expect(teller2.calculateAmountOut(1, false)).to.be.revertedWith("zero price");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, ONE_ETHER);
      await expect(teller2.connect(depositor2).depositSigned(ONE_ETHER, ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("invalid price");
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
      await expect(teller1.connect(depositor1).deposit(ONE_ETHER.add(1), ONE_ETHER.mul(2), depositor1.address, false)).to.be.revertedWith("bond at capacity");

      expect(await teller2.capacity()).eq(ONE_ETHER);
      expect(await teller2.capacityIsPayout()).eq(false);
      await expect(teller2.calculateAmountIn(ONE_ETHER.mul(3), false)).to.be.revertedWith("bond at capacity");
      await expect(teller2.calculateAmountOut(ONE_ETHER.add(1), false)).to.be.revertedWith("bond at capacity");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, ONE_ETHER.add(1));
      await expect(teller2.connect(depositor2).depositSigned(ONE_ETHER.add(1), ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond at capacity");
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
      await expect(teller1.connect(depositor1).deposit(ONE_ETHER.add(2), 0, depositor1.address, false)).to.be.revertedWith("bond at capacity");

      expect(await teller2.capacity()).eq(ONE_ETHER);
      expect(await teller2.capacityIsPayout()).eq(true);
      await expect(teller2.calculateAmountIn(ONE_ETHER.add(2), false)).to.be.revertedWith("bond at capacity");
      await expect(teller2.calculateAmountOut(ONE_ETHER.add(2), false)).to.be.revertedWith("bond at capacity");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, ONE_ETHER.add(2));
      await expect(teller2.connect(depositor2).depositSigned(ONE_ETHER.add(2), 0, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond at capacity");
    });
    it("calculateAmountIn, calculateAmountOut, deposit and depositSigned will respect maxPayout", async function() {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.maxPayout = ONE_ETHER;
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await expect(teller1.calculateAmountOut(ONE_ETHER.add(2), false)).to.be.revertedWith("bond too large");
      await expect(teller1.calculateAmountIn(ONE_ETHER.add(2), false)).to.be.revertedWith("bond too large");
      await expect(teller1.connect(depositor1).deposit(ONE_ETHER.add(2), 0, depositor1.address, false)).to.be.revertedWith("bond too large");
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, ONE_ETHER.add(2));
      await expect(teller2.connect(depositor2).depositSigned(ONE_ETHER.add(2), 0, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("bond too large");
    })
    it("slippage protection - deposit() and depositSigned() respect minAmountOut", async function () {
      await teller1.connect(governor).setTerms(DEFAULT_BOND_TERMS);
      await teller2.connect(governor).setTerms(DEFAULT_BOND_TERMS);

      // set minAmountOut = ONE_ETHER
      // Find corresponding amountIn needed to get this minAmountOut
      const amountIn1 = await teller1.calculateAmountIn(ONE_ETHER, false);
      const amountOut1 = await teller1.calculateAmountOut(amountIn1, false); // This line to help branch coverage
      await expect(teller1.connect(depositor1).deposit(amountIn1.sub(1), ONE_ETHER, depositor1.address, false)).to.be.revertedWith("slippage protection: insufficient output");
      // Block-scope here to avoid v, r, s namespace conflict
      {
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, amountIn1.sub(1));
      await expect(teller2.connect(depositor2).depositSigned(amountIn1.sub(1), ONE_ETHER, depositor2.address, false, deadline, v, r, s)).to.be.revertedWith("slippage protection: insufficient output");
      }

      const amountIn2 = await teller1.calculateAmountIn(ONE_ETHER, true);
      await expect(teller1.connect(depositor1).deposit(amountIn2.sub(1), ONE_ETHER, depositor1.address, true)).to.be.revertedWith("slippage protection: insufficient output");
      {
      let { v, r, s } = await getERC20PermitSignature(depositor2, teller2.address, scp, amountIn2.sub(1));
      await expect(teller2.connect(depositor2).depositSigned(amountIn2.sub(1), ONE_ETHER, depositor2.address, true, deadline, v, r, s)).to.be.revertedWith("slippage protection: insufficient output");
      }
    });
    it("cannot deposit with insufficient SOLACE in bondDepository", async function () {
      let balances_before_deposit = await solace.balanceOf(bondDepository.address);
      await bondDepository.connect(governor).returnSolace(depositor1.address, balances_before_deposit);
      await expect(teller1.connect(depositor1).deposit(2, 0, depositor1.address, false)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await solace.connect(depositor1).transfer(bondDepository.address, balances_before_deposit);
    });
  })

  describe("deposit cases", function() {
    it("test deposit 1 - deposit 3 DAI, starting SOLACE price of 2 DAI", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await teller1.connect(governor).setFees(BOND_FEE, DAO_FEE)
      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);

      // Tx to purchase bond
      let tx1 = await teller1.connect(depositor1).deposit(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);

      // Confirm CreateBond event emitted
      let bondID = await teller1.numBonds();
      expect(bondID).eq(1);
      let bondInfo = await teller1.bonds(bondID);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);

      // Confirm minted bond has desired parameters
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)
 
      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.userXSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.vestingXSolace).eq(0);
      expectClose(change_in_balances.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(change_in_balances.totalXSolace).eq(0);
      expect(change_in_balances.userDai).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.userScp).eq(0);
      expect(change_in_balances.daoDai).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.daoScp).eq(0);
      expect(change_in_balances.poolDai).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS))
      expect(change_in_balances.poolScp).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    })
    it("test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 DAI, starting SOLACE price of 2 DAI", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      MODIFIED_BOND_TERMS.capacityIsPayout = true;
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);

      // Mint 1 SOLACE to xSOLACE          
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(xsolace.address, ONE_ETHER);

      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, true);

      // Deposit 
      let tx1 = await teller1.connect(depositor1).deposit(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, true);

      // Confirm bond parameters
      let bondID = await teller1.numBonds();
      expect(bondID).eq(2);
      let bondInfo = await teller1.bonds(bondID);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);

      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(xsolace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.userXSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(0);
      expect(change_in_balances.vestingXSolace).eq(bondInfo.payoutAmount);
      expectClose(change_in_balances.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      // Before this point xsolace.totalSupply() = 0 
      // => amount of xSolace minted = amount of SOLACE staked
      expectClose(change_in_balances.totalXSolace, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expect(change_in_balances.userDai).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.userScp).eq(0);
      expect(change_in_balances.daoDai).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.daoScp).eq(0);
      expect(change_in_balances.poolDai).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS))
      expect(change_in_balances.poolScp).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expectClose(change_in_balances.tellerCapacity, bondInfo.principalPaid.mul(-1).div(2), 1e14);
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14)
    });
    it("test deposit 3 - deposit 3 DAI, set startPrice = 1 but minimumPrice = 2", async function() {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.minimumPrice = ONE_ETHER.mul(2)
      await teller1.connect(governor).setTerms(MODIFIED_BOND_TERMS);

      let balances_before_deposit = await getBalances(teller1, depositor1);
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);

      // Deposit 
      let tx1 = await teller1.connect(depositor1).deposit(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);

      // Confirm bond parameters
      let bondID = await teller1.numBonds();
      expect(bondID).eq(3);
      let bondInfo = await teller1.bonds(bondID);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.userXSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.vestingXSolace).eq(0);
      expectClose(change_in_balances.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(change_in_balances.totalXSolace).eq(0)
      expect(change_in_balances.userDai).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.userScp).eq(0);
      expect(change_in_balances.daoDai).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.daoScp).eq(0);
      expect(change_in_balances.poolDai).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS))
      expect(change_in_balances.poolScp).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14)
    })
  })

  describe("claimPayout after deposit cases", function() {
    it("cannot claimPayout for a non-existent bondID", async function () {
      await expect(teller1.connect(depositor1).claimPayout(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer", async function () {
      await expect(teller1.connect(randomGreedyPerson).claimPayout(1)).to.be.revertedWith("!bonder");
    });
    it("approves depositor2 to claimPayout on Bond 3 (which was minted by depositor)", async function() {
      // We will be testing claimPayout with approval from an approved proxy account
      // Replaces "can redeem with approval" unit test in original test script
      const bondID = 3
      await teller1.connect(depositor1).approve(depositor2.address, bondID);
    })
    it("t = 0, expect claimPayout will work but there will be miniscule payout", async function() {
      // Query bond.payoutAlreadyClaimed values
      let bondInfo_1 = await teller1.bonds(1);
      let bondInfo_2 = await teller1.bonds(2);
      let bondInfo_3 = await teller1.bonds(3);
      expect(bondInfo_1.payoutAlreadyClaimed).eq(0)
      expect(bondInfo_2.payoutAlreadyClaimed).eq(0)
      expect(bondInfo_3.payoutAlreadyClaimed).eq(0)

      let balances_before_claimpayout = await getBalances(teller1, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller1, depositor2)
      await teller1.connect(depositor1).claimPayout(1)
      await teller1.connect(depositor1).claimPayout(2)
      await teller1.connect(depositor2).claimPayout(3)
      let balances_after_claimpayout = await getBalances(teller1, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller1, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Query bond.payoutAlreadyClaimed values again
      // Some time has passed from when we minted these bonds, so values will be non-zero
      // We check that the claimed amount is less than 1/10000 of the total bond payout
      bondInfo_1 = await teller1.bonds(1);
      bondInfo_2 = await teller1.bonds(2);
      bondInfo_3 = await teller1.bonds(3); 
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))
      expect(bondInfo_3.payoutAlreadyClaimed).to.be.below(bondInfo_3.payoutAmount.mul(1).div(10000))
      
      // Check change_in_balances for depositor1 and teller1
      expectClose(change_in_balances.userSolace, 0, 1e14)
      expectClose(change_in_balances.userXSolace, 0, 1e14)
      expectClose(change_in_balances.vestingSolace, 0, 1e14)
      expectClose(change_in_balances.vestingXSolace, 0, 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.totalXSolace).to.eq(0)
      expect(change_in_balances.userDai).to.eq(0)
      expect(change_in_balances.userScp).to.eq(0)
      expect(change_in_balances.daoDai).to.eq(0)
      expect(change_in_balances.daoScp).to.eq(0)
      expect(change_in_balances.poolDai).to.eq(0)
      expect(change_in_balances.poolScp).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, 0, 1e14)
      expect(change_in_balances_depositor2.userXSolace).eq(0)
      expect(change_in_balances_depositor2.userDai).to.eq(0)
      expect(change_in_balances_depositor2.userScp).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
    })
    it("t = halfway through vesting, expect half of tokens to be claimable", async function() {
      let bondInfo_1 = await teller1.bonds(1);
      let bondInfo_2 = await teller1.bonds(2);
      let bondInfo_3 = await teller1.bonds(3);
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))
      expect(bondInfo_3.payoutAlreadyClaimed).to.be.below(bondInfo_3.payoutAmount.mul(1).div(10000))

      // // Skip time to halfway through vesting
      const blockTimestamp = await getCurrentTimestamp()
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM/2]);

      let balances_before_claimpayout = await getBalances(teller1, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller1, depositor2)
      await teller1.connect(depositor1).claimPayout(1)
      await teller1.connect(depositor1).claimPayout(2)
      await teller1.connect(depositor2).claimPayout(3)
      let balances_after_claimpayout = await getBalances(teller1, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller1, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      bondInfo_1 = await teller1.bonds(1);
      bondInfo_2 = await teller1.bonds(2);
      bondInfo_3 = await teller1.bonds(3); 
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_3.payoutAlreadyClaimed, bondInfo_3.payoutAmount.mul(5000).div(10000), 1e14)

      // Check change_in_balances for depositor1 and teller1
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.userXSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_3.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expectClose(change_in_balances.vestingXSolace, bondInfo_2.payoutAmount.mul(5000).div(10000).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.totalXSolace).to.eq(0)
      expect(change_in_balances.userDai).to.eq(0)
      expect(change_in_balances.userScp).to.eq(0)
      expect(change_in_balances.daoDai).to.eq(0)
      expect(change_in_balances.daoScp).to.eq(0)
      expect(change_in_balances.poolDai).to.eq(0)
      expect(change_in_balances.poolScp).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_3.payoutAmount.mul(5000).div(10000), 1e14)
      expect(change_in_balances_depositor2.userXSolace).eq(0)
      expect(change_in_balances_depositor2.userDai).to.eq(0)
      expect(change_in_balances_depositor2.userScp).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
    })
    it("t=after vesting complete, expect all tokens claimed & bonds burned", async function() {
      let bondInfo_1 = await teller1.bonds(1);
      let bondInfo_2 = await teller1.bonds(2);
      let bondInfo_3 = await teller1.bonds(3); 
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_3.payoutAlreadyClaimed, bondInfo_3.payoutAmount.mul(5000).div(10000), 1e14)

      // Skip time to after vesting completed
      const blockTimestamp = await getCurrentTimestamp()
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM + 1]);

      let balances_before_claimpayout = await getBalances(teller1, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller1, depositor2)
      let tx1 = await teller1.connect(depositor1).claimPayout(1)
      let tx2 = await teller1.connect(depositor1).claimPayout(2)
      let tx3 = await teller1.connect(depositor2).claimPayout(3)
      expect(tx1).to.emit(teller1, "BurnBond").withArgs(1, depositor1.address, solace.address, bondInfo_1.payoutAmount);
      expect(tx2).to.emit(teller1, "BurnBond").withArgs(2, depositor1.address, xsolace.address, bondInfo_2.payoutAmount);
      expect(tx3).to.emit(teller1, "BurnBond").withArgs(3, depositor2.address, solace.address, bondInfo_3.payoutAmount);
      let balances_after_claimpayout = await getBalances(teller1, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller1, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Check change_in_balances for depositor1 and teller1
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.userXSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_3.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expectClose(change_in_balances.vestingXSolace, bondInfo_2.payoutAmount.mul(5000).div(10000).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.totalXSolace).to.eq(0)
      expect(change_in_balances.userDai).to.eq(0)
      expect(change_in_balances.userScp).to.eq(0)
      expect(change_in_balances.daoDai).to.eq(0)
      expect(change_in_balances.daoScp).to.eq(0)
      expect(change_in_balances.poolDai).to.eq(0)
      expect(change_in_balances.poolScp).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(-3)
      expect(change_in_balances.totalBonds).to.eq(-3)
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_3.payoutAmount.mul(5000).div(10000), 1e14)
      expect(change_in_balances_depositor2.userXSolace).eq(0)
      expect(change_in_balances_depositor2.userDai).to.eq(0)
      expect(change_in_balances_depositor2.userScp).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
    })
    it("claimPayout fails after BondBurned event", async function() {
      await expect(teller1.connect(depositor1).claimPayout(1)).to.be.revertedWith("query for nonexistent token");
      await expect(teller1.connect(depositor1).claimPayout(2)).to.be.revertedWith("query for nonexistent token");
      await expect(teller1.connect(depositor2).claimPayout(3)).to.be.revertedWith("query for nonexistent token");
    })
  })

  describe("depositSigned cases", function () {
    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(bondDepository.address, ONE_ETHER.mul(1000));
      await bondDepository.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address);
      teller2 = await deployProxyTeller("Solace SCP Bond", teller1.address, scp.address);
    });
    it("test depositSigned 1 - deposit 3 DAI, starting SOLACE price of 2 DAI", async function () {
      // Environment setup
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
      await teller2.connect(governor).setFees(BOND_FEE, DAO_FEE)  
      await scp.connect(deployer).transfer(depositor1.address, ONE_ETHER.mul(100));
      let balances_before_deposit = await getBalances(teller2, depositor1);

      // Check state variables
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, false);

      // depositSigned() tx
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, scp, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false, deadline, v, r, s);
      
      // Confirm CreateBond event emitted with correct arguments
      let bondID = await teller2.numBonds();
      expect(bondID).eq(1);
      let bondInfo = await teller2.bonds(bondID);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);

      // Confirm minted bond has desired parameters
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller2.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)
  
      // Confirm balances
      let balances_after_deposit = await getBalances(teller2, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.userXSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.vestingXSolace).eq(0);
      expectClose(change_in_balances.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(change_in_balances.totalXSolace).eq(0);
      expect(change_in_balances.userDai).eq(0);
      expect(change_in_balances.userScp).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.daoDai).eq(0);
      expect(change_in_balances.daoScp).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.poolDai).eq(0);
      expect(change_in_balances.poolScp).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(await xsolace.solaceToXSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(await xsolace.xSolaceToSolace(ONE_ETHER)).to.equal(ONE_ETHER);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
    it("test depositSigned 2 - capacityIsPayout = true && stake = true, deposit 3 DAI, starting SOLACE price of 2 DAI", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.startPrice = ONE_ETHER.mul(2)
      MODIFIED_BOND_TERMS.minimumPrice = 0
      MODIFIED_BOND_TERMS.capacityIsPayout = true;
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);
  
      // Mint 1 SOLACE to xSOLACE          
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(xsolace.address, ONE_ETHER);

      let balances_before_deposit = await getBalances(teller2, depositor1);
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), true);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, true);
      
      // Deposit
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, scp, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, true, deadline, v, r, s);
  
      // Confirm bond parameters
      let bondID = await teller2.numBonds();
      expect(bondID).eq(2);
      let bondInfo = await teller2.bonds(bondID);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);

      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(xsolace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller2.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller2, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.userXSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(0);
      expect(change_in_balances.vestingXSolace).eq(bondInfo.payoutAmount);
      expectClose(change_in_balances.totalXSolace, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(change_in_balances.stakingSolace, ONE_ETHER.mul(3).div(2), 1e14);
      expect(change_in_balances.userDai).eq(0);
      expect(change_in_balances.userScp).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.daoDai).eq(0);
      expect(change_in_balances.daoScp).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.poolDai).eq(0);
      expect(change_in_balances.poolScp).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expectClose(change_in_balances.tellerCapacity, bondInfo.principalPaid.mul(-1).div(2), 1e14);
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
    it("test depositSigned 3 - deposit 3 DAI, set startPrice = 1 but minimumPrice = 2", async function () {
      let MODIFIED_BOND_TERMS = {...DEFAULT_BOND_TERMS}
      MODIFIED_BOND_TERMS.minimumPrice = ONE_ETHER.mul(2)
      await teller2.connect(governor).setTerms(MODIFIED_BOND_TERMS);

      let balances_before_deposit = await getBalances(teller2, depositor1);
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, false);

      // Deposit
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, scp, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false, deadline, v, r, s);
      
      // Confirm bond parameters
      let bondID = await teller2.numBonds();
      expect(bondID).eq(3);
      let bondInfo = await teller2.bonds(bondID);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller2.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller2, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.userXSolace).eq(0);
      expect(change_in_balances.vestingSolace).eq(bondInfo.payoutAmount);
      expect(change_in_balances.vestingXSolace).eq(0);
      expectClose(change_in_balances.stakingSolace, ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(change_in_balances.totalXSolace).eq(0);
      expect(change_in_balances.userDai).eq(0);
      expect(change_in_balances.userScp).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.daoDai).eq(0);
      expect(change_in_balances.daoScp).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.poolDai).eq(0);
      expect(change_in_balances.poolScp).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });
  });

  describe("claimPayout after depositSigned cases", function() {
    it("cannot claimPayout for a non-existent bondID", async function () {
      await expect(teller2.connect(depositor1).claimPayout(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer", async function () {
      await expect(teller2.connect(randomGreedyPerson).claimPayout(1)).to.be.revertedWith("!bonder");
    });
    it("approves depositor2 to claimPayout on Bond 3 (which was minted by depositor)", async function() {
      // We will be testing claimPayout with approval from an approved proxy account
      // Replaces "can redeem with approval" unit test in original test script
      const bondID = 3
      await teller2.connect(depositor1).approve(depositor2.address, bondID);
    })
    it("t = 0, expect claimPayout will work but there will be miniscule payout", async function() {
      // Query bond.payoutAlreadyClaimed values
      let bondInfo_1 = await teller2.bonds(1);
      let bondInfo_2 = await teller2.bonds(2);
      let bondInfo_3 = await teller2.bonds(3);
      expect(bondInfo_1.payoutAlreadyClaimed).eq(0)
      expect(bondInfo_2.payoutAlreadyClaimed).eq(0)
      expect(bondInfo_3.payoutAlreadyClaimed).eq(0)

      let balances_before_claimpayout = await getBalances(teller2, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller2, depositor2)
      await teller2.connect(depositor1).claimPayout(1)
      await teller2.connect(depositor1).claimPayout(2)
      await teller2.connect(depositor2).claimPayout(3)
      let balances_after_claimpayout = await getBalances(teller2, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller2, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Query bond.payoutAlreadyClaimed values again
      // Some time has passed from when we minted these bonds, so values will be non-zero
      // We check that the claimed amount is less than 1/10000 of the total bond payout
      bondInfo_1 = await teller2.bonds(1);
      bondInfo_2 = await teller2.bonds(2);
      bondInfo_3 = await teller2.bonds(3); 
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))
      expect(bondInfo_3.payoutAlreadyClaimed).to.be.below(bondInfo_3.payoutAmount.mul(1).div(10000))
      
      // Check change_in_balances for depositor1 and teller2
      expectClose(change_in_balances.userSolace, 0, 1e14)
      expectClose(change_in_balances.userXSolace, 0, 1e14)
      expectClose(change_in_balances.vestingSolace, 0, 1e14)
      expectClose(change_in_balances.vestingXSolace, 0, 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.totalXSolace).to.eq(0)
      expect(change_in_balances.userDai).to.eq(0)
      expect(change_in_balances.userScp).to.eq(0)
      expect(change_in_balances.daoDai).to.eq(0)
      expect(change_in_balances.daoScp).to.eq(0)
      expect(change_in_balances.poolDai).to.eq(0)
      expect(change_in_balances.poolScp).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, 0, 1e14)
      expect(change_in_balances_depositor2.userXSolace).eq(0)
      expect(change_in_balances_depositor2.userDai).to.eq(0)
      expect(change_in_balances_depositor2.userScp).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
    })
    it("t = halfway through vesting, expect half of tokens to be claimable", async function() {
      let bondInfo_1 = await teller2.bonds(1);
      let bondInfo_2 = await teller2.bonds(2);
      let bondInfo_3 = await teller2.bonds(3);
      expect(bondInfo_1.payoutAlreadyClaimed).to.be.below(bondInfo_1.payoutAmount.mul(1).div(10000))
      expect(bondInfo_2.payoutAlreadyClaimed).to.be.below(bondInfo_2.payoutAmount.mul(1).div(10000))
      expect(bondInfo_3.payoutAlreadyClaimed).to.be.below(bondInfo_3.payoutAmount.mul(1).div(10000))

      // // Skip time to halfway through vesting
      const blockTimestamp = await getCurrentTimestamp()
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM/2]);

      let balances_before_claimpayout = await getBalances(teller2, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller2, depositor2)
      await teller2.connect(depositor1).claimPayout(1)
      await teller2.connect(depositor1).claimPayout(2)
      await teller2.connect(depositor2).claimPayout(3)
      let balances_after_claimpayout = await getBalances(teller2, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller2, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      bondInfo_1 = await teller2.bonds(1);
      bondInfo_2 = await teller2.bonds(2);
      bondInfo_3 = await teller2.bonds(3); 
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_3.payoutAlreadyClaimed, bondInfo_3.payoutAmount.mul(5000).div(10000), 1e14)

      // Check change_in_balances for depositor1 and teller2
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.userXSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_3.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expectClose(change_in_balances.vestingXSolace, bondInfo_2.payoutAmount.mul(5000).div(10000).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.totalXSolace).to.eq(0)
      expect(change_in_balances.userDai).to.eq(0)
      expect(change_in_balances.userScp).to.eq(0)
      expect(change_in_balances.daoDai).to.eq(0)
      expect(change_in_balances.daoScp).to.eq(0)
      expect(change_in_balances.poolDai).to.eq(0)
      expect(change_in_balances.poolScp).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(0)
      expect(change_in_balances.totalBonds).to.eq(0)
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_3.payoutAmount.mul(5000).div(10000), 1e14)
      expect(change_in_balances_depositor2.userXSolace).eq(0)
      expect(change_in_balances_depositor2.userDai).to.eq(0)
      expect(change_in_balances_depositor2.userScp).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
    })
    it("t=after vesting complete, expect all tokens claimed & bonds burned", async function() {
      let bondInfo_1 = await teller2.bonds(1);
      let bondInfo_2 = await teller2.bonds(2);
      let bondInfo_3 = await teller2.bonds(3); 
      expectClose(bondInfo_1.payoutAlreadyClaimed, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_2.payoutAlreadyClaimed, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(bondInfo_3.payoutAlreadyClaimed, bondInfo_3.payoutAmount.mul(5000).div(10000), 1e14)

      // Skip time to after vesting completed
      const blockTimestamp = await getCurrentTimestamp()
      await provider.send("evm_mine", [blockTimestamp + VESTING_TERM + 1]);

      let balances_before_claimpayout = await getBalances(teller2, depositor1)
      let balances_before_claimpayout_depositor2 = await getBalances(teller2, depositor2)
      let tx1 = await teller2.connect(depositor1).claimPayout(1)
      let tx2 = await teller2.connect(depositor1).claimPayout(2)
      let tx3 = await teller2.connect(depositor2).claimPayout(3)
      expect(tx1).to.emit(teller2, "BurnBond").withArgs(1, depositor1.address, solace.address, bondInfo_1.payoutAmount);
      expect(tx2).to.emit(teller2, "BurnBond").withArgs(2, depositor1.address, xsolace.address, bondInfo_2.payoutAmount);
      expect(tx3).to.emit(teller2, "BurnBond").withArgs(3, depositor2.address, solace.address, bondInfo_3.payoutAmount);
      let balances_after_claimpayout = await getBalances(teller2, depositor1);
      let balances_after_claimpayout_depositor2 = await getBalances(teller2, depositor2);
      let change_in_balances = getBalancesDiff(balances_after_claimpayout, balances_before_claimpayout);
      let change_in_balances_depositor2 = getBalancesDiff(balances_after_claimpayout_depositor2, balances_before_claimpayout_depositor2);

      // Check change_in_balances for depositor1 and teller2
      expectClose(change_in_balances.userSolace, bondInfo_1.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.userXSolace, bondInfo_2.payoutAmount.mul(5000).div(10000), 1e14)
      expectClose(change_in_balances.vestingSolace, ((bondInfo_1.payoutAmount.mul(5000).div(10000)).add(bondInfo_3.payoutAmount.mul(5000).div(10000))).mul(-1), 1e14)
      expectClose(change_in_balances.vestingXSolace, bondInfo_2.payoutAmount.mul(5000).div(10000).mul(-1), 1e14)
      expect(change_in_balances.stakingSolace).to.eq(0)
      expect(change_in_balances.totalXSolace).to.eq(0)
      expect(change_in_balances.userDai).to.eq(0)
      expect(change_in_balances.userScp).to.eq(0)
      expect(change_in_balances.daoDai).to.eq(0)
      expect(change_in_balances.daoScp).to.eq(0)
      expect(change_in_balances.poolDai).to.eq(0)
      expect(change_in_balances.poolScp).to.eq(0)
      expect(change_in_balances.userBonds).to.eq(-3)
      expect(change_in_balances.totalBonds).to.eq(-3)
      expect(change_in_balances.tellerCapacity).to.eq(0)
      // Don't care about change in bond price here

      // Check change_in_balances for depositor2
      expectClose(change_in_balances_depositor2.userSolace, bondInfo_3.payoutAmount.mul(5000).div(10000), 1e14)
      expect(change_in_balances_depositor2.userXSolace).eq(0)
      expect(change_in_balances_depositor2.userDai).to.eq(0)
      expect(change_in_balances_depositor2.userScp).to.eq(0)
      expect(change_in_balances_depositor2.userBonds).to.eq(0)
    })
    it("claimPayout fails after BondBurned event", async function() {
      await expect(teller2.connect(depositor1).claimPayout(1)).to.be.revertedWith("query for nonexistent token");
      await expect(teller2.connect(depositor1).claimPayout(2)).to.be.revertedWith("query for nonexistent token");
      await expect(teller2.connect(depositor2).claimPayout(3)).to.be.revertedWith("query for nonexistent token");
    })
  })

  describe("set terms", async function () {
    before("redeploy", async function () {
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(bondDepository.address, ONE_ETHER.mul(1000));
      await bondDepository.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address);
      teller2 = await deployProxyTeller("Solace SCP Bond", teller1.address, scp.address);
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
      expect(tx).to.emit(teller2, "TermsSet");
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
      xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(bondDepository.address, ONE_ETHER.mul(1000));
      await bondDepository.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address);
      teller2 = await deployProxyTeller("Solace SCP Bond", teller1.address, scp.address);
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
    let solace2: Solace;
    let xsolace2: XSolace;
    let bondDepository2: BondDepositoryV2

    before("deploy new instance of solace, xsolace and bondDepository", async function () {  
      solace2 = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      xsolace2 = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;
      await solace2.connect(governor).addMinter(minter.address);
      bondDepository2 = (await deployContract(deployer, artifacts.BondDepositoryV2, [governor.address, solace2.address, xsolace2.address, underwritingPool.address, dao.address])) as BondDepositoryV2;
      await solace2.connect(minter).mint(bondDepository2.address, ONE_ETHER.mul(1000));
      await bondDepository2.connect(governor).addTeller(teller1.address);
    });
    it("non governance cannot set addresses", async function () {
      await expect(teller1.connect(depositor1).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address, dai.address, bondDepository.address)).to.be.revertedWith("!governance");
    });
    it("validates input", async function () {
      await expect(teller1.connect(governor).setAddresses(ZERO_ADDRESS, xsolace.address, underwritingPool.address, dao.address, dai.address, bondDepository.address)).to.be.revertedWith("zero address solace");
      await expect(teller1.connect(governor).setAddresses(solace.address, ZERO_ADDRESS, underwritingPool.address, dao.address, dai.address, bondDepository.address)).to.be.revertedWith("zero address xsolace");
      await expect(teller1.connect(governor).setAddresses(solace.address, xsolace.address, ZERO_ADDRESS, dao.address, dai.address, bondDepository.address)).to.be.revertedWith("zero address pool");
      await expect(teller1.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, ZERO_ADDRESS, dai.address, bondDepository.address)).to.be.revertedWith("zero address dao");
      await expect(teller1.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address, ZERO_ADDRESS, bondDepository.address)).to.be.revertedWith("zero address principal");
      await expect(teller1.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, dao.address, dai.address, ZERO_ADDRESS)).to.be.revertedWith("zero address bond depo");
    })
    it("governance can set addresses", async function () {
      let tx = await teller1.connect(governor).setAddresses(solace2.address, xsolace2.address, underwritingPool2.address, dao2.address, scp.address, bondDepository2.address);
      expect(tx).to.emit(teller1, "AddressesSet");
      expect(await teller1.solace()).eq(solace2.address);
      expect(await teller1.xsolace()).eq(xsolace2.address);
      expect(await teller1.underwritingPool()).eq(underwritingPool2.address);
      expect(await teller1.dao()).eq(dao2.address);
      expect(await teller1.principal()).eq(scp.address);
      expect(await teller1.bondDepo()).eq(bondDepository2.address);
    });
    it("uses new addresses", async function () {
      // Transfer 100 SCP to depositor1
      await scp.connect(deployer).transfer(depositor1.address, ONE_ETHER.mul(100));
      await scp.connect(depositor1).approve(teller1.address, constants.MaxUint256);

      // Set terms
      await teller1.connect(governor).setTerms({startPrice: ONE_ETHER, minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      let balances_before_deposit = await getBalances(teller1, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller1.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller1.calculateAmountIn(predictedAmountOut, false);

      // Deposit
      let tx1 = await teller1.connect(depositor1).deposit(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false);

      // Confirm bond parameters
      let bondID = await teller1.numBonds();
      expect(bondID).eq(4);
      let bondInfo = await teller1.bonds(bondID);
      expect(tx1).to.emit(teller1, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace2.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2).mul(MAX_BPS-BOND_FEE).div(MAX_BPS), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller1.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller1, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);
      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.userXSolace).eq(0);
      expect(await solace2.balanceOf(teller1.address)).eq(bondInfo.payoutAmount);
      expect(change_in_balances.vestingXSolace).eq(0);
      expectClose(await solace2.balanceOf(xsolace2.address), ONE_ETHER.mul(3).div(2).mul(BOND_FEE).div(MAX_BPS), 1e14);
      expect(change_in_balances.totalXSolace).eq(0);
      expect(change_in_balances.userDai).eq(0);
      expect(change_in_balances.userScp).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.daoDai).eq(0);
      expect(await scp.balanceOf(dao2.address)).eq(ONE_ETHER.mul(3).mul(DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.poolDai).eq(0);
      expect(await scp.balanceOf(underwritingPool2.address)).eq(ONE_ETHER.mul(3).mul(MAX_BPS-DAO_FEE).div(MAX_BPS));
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10).mul(MAX_BPS).div(MAX_BPS-BOND_FEE), 1e14);
    });

    it("can depositSigned()", async function() {
      // Purpose of this test is to cover branch within depositSigned() when daoFee = 0
      expect(await teller2.bondFeeBps()).eq(0);
      expect(await teller2.daoFeeBps()).eq(0);
      
      // Transfer 100 DAI to depositor1
      await dai.connect(deployer).transfer(depositor1.address, ONE_ETHER.mul(100));
      
      // Set terms
      await teller2.connect(governor).setTerms({startPrice: ONE_ETHER, minimumPrice: ONE_ETHER.mul(2), maxPayout: ONE_ETHER.mul(2), priceAdjNum: 1, priceAdjDenom: 10, capacity: ONE_ETHER.mul(10), capacityIsPayout: false, startTime: 0, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
      let balances_before_deposit = await getBalances(teller2, depositor1);
      const blockTimestamp = (await provider.getBlock('latest')).timestamp;
      let predictedAmountOut = await teller2.calculateAmountOut(ONE_ETHER.mul(3), false);
      let predictedAmountIn = await teller2.calculateAmountIn(predictedAmountOut, false);

      // depositSigned
      let { v, r, s } = await getERC20PermitSignature(depositor1, teller2.address, scp, ONE_ETHER.mul(3));
      let tx1 = await teller2.connect(depositor1).depositSigned(ONE_ETHER.mul(3), ONE_ETHER, depositor1.address, false, deadline, v, r, s)

      // Confirm bond parameters
      let bondID = await teller2.numBonds();
      expect(bondID).eq(1);
      let bondInfo = await teller2.bonds(bondID);
      expect(tx1).to.emit(teller2, "CreateBond").withArgs(bondID, bondInfo.principalPaid, bondInfo.payoutToken, bondInfo.payoutAmount, bondInfo.vestingStart, bondInfo.localVestingTerm);
      
      expect(bondInfo.principalPaid).eq(ONE_ETHER.mul(3));
      expect(bondInfo.payoutToken).eq(solace.address);
      expectClose(predictedAmountIn, ONE_ETHER.mul(3), 1e14);
      expectClose(predictedAmountOut, ONE_ETHER.mul(3).div(2), 1e14);
      expectClose(bondInfo.payoutAmount, predictedAmountOut, 1e14);
      expect(bondInfo.localVestingTerm).eq(await teller2.globalVestingTerm())
      expect(bondInfo.payoutAlreadyClaimed).eq(0)

      // Confirm balances
      let balances_after_deposit = await getBalances(teller2, depositor1);
      let change_in_balances = getBalancesDiff(balances_after_deposit, balances_before_deposit);

      expect(change_in_balances.userSolace).eq(0);
      expect(change_in_balances.userXSolace).eq(0);
      expect(await solace.balanceOf(teller2.address)).eq(bondInfo.payoutAmount);
      expect(change_in_balances.vestingXSolace).eq(0);
      expect(await solace.balanceOf(xsolace.address)).eq(0)
      expect(change_in_balances.totalXSolace).eq(0);
      expect(change_in_balances.userDai).eq(0);
      expect(change_in_balances.userScp).eq(ONE_ETHER.mul(-3));
      expect(change_in_balances.daoDai).eq(0);
      expect(change_in_balances.poolDai).eq(0);
      expect(change_in_balances.userBonds).eq(1);
      expect(change_in_balances.totalBonds).eq(1);
      expect(change_in_balances.tellerCapacity).eq(bondInfo.principalPaid.mul(-1));
      expectClose(change_in_balances.tellerBondPrice, bondInfo.payoutAmount.div(10), 1e14);
    })
  });

  interface Balances {
    userSolace: BN;
    userXSolace: BN;
    vestingSolace: BN;
    vestingXSolace: BN;
    stakingSolace: BN;
    totalXSolace: BN;

    userDai: BN;
    userScp: BN;
    daoDai: BN;
    daoScp: BN;
    poolDai: BN;
    poolScp: BN;

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

      userDai: await dai.balanceOf(user.address),
      userScp: await scp.balanceOf(user.address),
      daoDai: await dai.balanceOf(dao.address),
      daoScp: await scp.balanceOf(dao.address),
      poolDai: await dai.balanceOf(underwritingPool.address),
      poolScp: await scp.balanceOf(underwritingPool.address),

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

      userDai: balances1.userDai.sub(balances2.userDai),
      userScp: balances1.userScp.sub(balances2.userScp),
      daoDai: balances1.daoDai.sub(balances2.daoDai),
      daoScp: balances1.daoScp.sub(balances2.daoScp),
      poolDai: balances1.poolDai.sub(balances2.poolDai),
      poolScp: balances1.poolScp.sub(balances2.poolScp),

      userBonds: balances1.userBonds.sub(balances2.userBonds),
      totalBonds: balances1.totalBonds.sub(balances2.totalBonds),

      tellerCapacity: balances1.tellerCapacity.sub(balances2.tellerCapacity),
      tellerBondPrice: balances1.tellerBondPrice.sub(balances2.tellerBondPrice),
    };
  }

  async function deployProxyTeller(name: string, implAddress: string, tokenAddress: string) {
    let newTeller;
    let tx = await bondDepository.connect(governor).createBondTeller(name, governor.address, implAddress, tokenAddress);
    let events = (await tx.wait())?.events;
    if(events && events.length > 0) {
      let event = events[0];
      newTeller = await ethers.getContractAt(artifacts.BondTellerERC20V2.abi, event?.args?.["deployment"]) as BondTellerErc20V2;
    } else throw "no deployment";
    expect(newTeller.address).not.eq(ZERO_ADDRESS);
    return newTeller;
  }

  async function getCurrentTimestamp() {
    const currentTimestamp = (await provider.getBlock('latest')).timestamp
    return currentTimestamp
  } 

});
