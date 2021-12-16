// ATTACK VECTOR THAT THIS TEST FILE DOESN'T COVER - IF THE 
// Bond principal tokens = DAI, ETH, USDC, SOLACE-USDC SLP, SCP, WBTC, USDT => Should we have test more than just MockErc20 and Weth9 contracts here? Are we missing something by modelling every non-ETH token as a MockERC20 token?
// Wtf is the SCP token?

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

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, XSolace, MockErc20, Weth9, Registry, BondTellerErc20V2, BondTellerEthV2, BondDepositoryV2 } from "../typechain";
import { toBytes32 } from "./utilities/setStorage";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";

// common tokens
let dai: MockErc20;
let weth: Weth9;
let usdc: MockErc20;
let solace_usdc_slp: MockErc20;
let scp: MockErc20;
let wbtc: MockErc20;
let usdt: MockErc20

// solace contracts
let solace: Solace;
let xsolace: XSolace;
let bondDepository: BondDepositoryV2;

// teller contracts
let tellerErc20Implementation: BondTellerErc20V2;
let tellerEthImplementation: BondTellerEthV2;
let teller_DAI: BondTellerErc20V2;
let teller_ETH: BondTellerEthV2;
let teller_USDC: BondTellerErc20V2;
let teller_SOLACE_USDC_SLP: BondTellerErc20V2;
let teller_SCP: BondTellerErc20V2;
let teller_WBTC: BondTellerErc20V2;
let teller_USDT: BondTellerErc20V2;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_HUNDRED_THOUSAND_ETHER = BN.from("100000000000000000000000");
const NINE_HUNDRED_THOUSAND_ETHER = BN.from("900000000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");

describe("BondDepository_V2", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, mockTeller, dao, underwritingPool, bond_purchaser, randomGreedyPerson] = provider.getWallets();

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy common token contracts
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    dai = (await deployContract(deployer, artifacts.MockERC20, ["DAI", "DAI", ONE_MILLION_ETHER])) as MockErc20;
    usdc = (await deployContract(deployer, artifacts.MockERC20, ["USDC", "USDC", ONE_MILLION_ETHER])) as MockErc20;
    solace_usdc_slp = (await deployContract(deployer, artifacts.MockERC20, ["SOLACE-USDC SLP", "SOLACE-USDC SLP", ONE_MILLION_ETHER])) as MockErc20;
    scp = (await deployContract(deployer, artifacts.MockERC20, ["SCP", "SCP", ONE_MILLION_ETHER])) as MockErc20;
    wbtc = (await deployContract(deployer, artifacts.MockERC20, ["WBTC", "WBTC", ONE_MILLION_ETHER])) as MockErc20;
    usdt = (await deployContract(deployer, artifacts.MockERC20, ["USDT", "USDT", ONE_MILLION_ETHER])) as MockErc20;

    // deploy solace contracts
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;

    // mint 10 WETH to the bond_purchaser
    await weth.connect(bond_purchaser).deposit({ value: TEN_ETHER });

    // mint 1M SOLACE to the governor
    await solace.connect(governor).addMinter(governor.address);
  });

  describe("deployment", function () {
    it("verifies constructor arguments", async function () {
      await expect(deployContract(deployer, artifacts.BondDepositoryV2, [ZERO_ADDRESS, solace.address, xsolace.address, underwritingPool.address, dao.address])).to.be.revertedWith("zero address governance");
      await expect(deployContract(deployer, artifacts.BondDepositoryV2, [governor.address, ZERO_ADDRESS, xsolace.address, underwritingPool.address, dao.address])).to.be.revertedWith("zero address solace");
      await expect(deployContract(deployer, artifacts.BondDepositoryV2, [governor.address, solace.address, ZERO_ADDRESS, underwritingPool.address, dao.address])).to.be.revertedWith("zero address xsolace");
      await expect(deployContract(deployer, artifacts.BondDepositoryV2, [governor.address, solace.address, xsolace.address, ZERO_ADDRESS, dao.address])).to.be.revertedWith("zero address pool");
      await expect(deployContract(deployer, artifacts.BondDepositoryV2, [governor.address, solace.address, xsolace.address, underwritingPool.address, ZERO_ADDRESS])).to.be.revertedWith("zero address dao");
    })
    it("deploys successfully", async function () {
      // UNSURE - is this really a unit test? Do we have an assertion to test if the contract deployed?
      bondDepository = (await deployContract(deployer, artifacts.BondDepositoryV2, [governor.address, solace.address, xsolace.address, underwritingPool.address, dao.address])) as BondDepositoryV2;
      expect(bondDepository.address).to.not.equal(ZERO_ADDRESS)
    })
    it("Mints 1M SOLACE tokens to the BondDepository contract", async function () {
      await solace.connect(governor).mint(bondDepository.address, ONE_MILLION_ETHER);
      const bondDepository_SOLACE_balance = await solace.balanceOf(bondDepository.address);
      expect(bondDepository_SOLACE_balance).to.equal(ONE_MILLION_ETHER);
    });
    it("sets correct values for storage variables from constructor", async function () {
      expect(await bondDepository.solace()).eq(solace.address)
      expect(await bondDepository.xsolace()).eq(xsolace.address)
      expect(await bondDepository.underwritingPool()).eq(underwritingPool.address)
      expect(await bondDepository.dao()).eq(dao.address)
      
    })
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await bondDepository.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(bondDepository.connect(deployer).setPendingGovernance(deployer.address)).to.be.revertedWith("!governance");
    });
    it("can set pending governance", async function() {
      let tx = await bondDepository.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(bondDepository, "GovernancePending").withArgs(deployer.address);
      expect(await bondDepository.governance()).to.equal(governor.address);
      expect(await bondDepository.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer to an account not set as pendingGovernance", async function() {
      await expect(bondDepository.connect(governor).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance to the intended pendingGovernance address", async function() {
      let tx = await bondDepository.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(bondDepository, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await bondDepository.governance()).to.equal(deployer.address);
      expect(await bondDepository.pendingGovernance()).to.equal(ZERO_ADDRESS);

      // setPendingGovernance test complete, undo changes to storage variables
      await bondDepository.connect(deployer).setPendingGovernance(governor.address);
      await bondDepository.connect(governor).acceptGovernance();
      expect(await bondDepository.governance()).to.equal(governor.address);
    });
  });

  describe("t = After deployment, before Bond Tellers created", function() {
    it("Only governance can call returnSolace()", async function() {
      // attempt returnSolace() from all accounts but governor, and expect reverting transactions
      await expect(bondDepository.connect(deployer).returnSolace(deployer.address, ONE_MILLION_ETHER)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(mockTeller).returnSolace(mockTeller.address, ONE_MILLION_ETHER)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(dao).returnSolace(dao.address, ONE_MILLION_ETHER)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(underwritingPool).returnSolace(underwritingPool.address, ONE_MILLION_ETHER)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(bond_purchaser).returnSolace(bond_purchaser.address, ONE_MILLION_ETHER)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(randomGreedyPerson).returnSolace(randomGreedyPerson.address, ONE_MILLION_ETHER)).to.be.revertedWith("!governance");

      // return 1M SOLACE from bondDepository to governor
      await bondDepository.connect(governor).returnSolace(governor.address, ONE_MILLION_ETHER);

      // transfer back 1M SOLACE from governor to bondDepository
      await solace.connect(governor).transfer(bondDepository.address, ONE_MILLION_ETHER);
      const bondDepository_SOLACE_balance = await solace.balanceOf(bondDepository.address);
      expect(bondDepository_SOLACE_balance).to.equal(ONE_MILLION_ETHER);
    })
    it("No address can call pullSolace(), as no Teller has been added yet", async function() {
      await expect(bondDepository.connect(deployer).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(governor).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(mockTeller).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(dao).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(underwritingPool).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(bond_purchaser).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(randomGreedyPerson).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
    })
    it("Non-governance cannot call setAddresses", async function() {
      await expect(bondDepository.connect(deployer).setAddresses(solace.address, xsolace.address, deployer.address, deployer.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(mockTeller).setAddresses(solace.address, xsolace.address, mockTeller.address, mockTeller.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(dao).setAddresses(solace.address, xsolace.address, dao.address, dao.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(underwritingPool).setAddresses(solace.address, xsolace.address, underwritingPool.address, underwritingPool.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(bond_purchaser).setAddresses(solace.address, xsolace.address, bond_purchaser.address, bond_purchaser.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(randomGreedyPerson).setAddresses(solace.address, xsolace.address, randomGreedyPerson.address, randomGreedyPerson.address)).to.be.revertedWith("!governance");
    })
    it("Non-governance cannot call removeTeller", async function() {
      await expect(bondDepository.connect(deployer).removeTeller(ZERO_ADDRESS)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(mockTeller).removeTeller(ZERO_ADDRESS)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(dao).removeTeller(ZERO_ADDRESS)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(underwritingPool).removeTeller(ZERO_ADDRESS)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(bond_purchaser).removeTeller(ZERO_ADDRESS)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(randomGreedyPerson).removeTeller(ZERO_ADDRESS)).to.be.revertedWith("!governance");
    })
    it("Non-governance cannot call addTeller", async function() {
      await expect(bondDepository.connect(deployer).addTeller(deployer.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(mockTeller).addTeller(mockTeller.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(dao).addTeller(dao.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(underwritingPool).addTeller(underwritingPool.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(bond_purchaser).addTeller(bond_purchaser.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(randomGreedyPerson).addTeller(randomGreedyPerson.address)).to.be.revertedWith("!governance");
    })
  })

  describe("add Teller addresses, but not yet create Teller contracts", function() {
    it("governance can add tellers", async function() {
      expect(await bondDepository.isTeller(mockTeller.address)).to.be.false;
      let tx1 = await bondDepository.connect(governor).addTeller(mockTeller.address);
      expect(tx1).to.emit(bondDepository, "TellerAdded").withArgs(mockTeller.address);
      expect(await bondDepository.isTeller(mockTeller.address)).to.be.true;
    })
    it("non-governance cannot remove tellers", async function () {
      await expect(bondDepository.connect(deployer).removeTeller(mockTeller.address)).to.be.revertedWith("!governance")
      await expect(bondDepository.connect(mockTeller).removeTeller(mockTeller.address)).to.be.revertedWith("!governance")
      await expect(bondDepository.connect(dao).removeTeller(mockTeller.address)).to.be.revertedWith("!governance")
      await expect(bondDepository.connect(underwritingPool).removeTeller(mockTeller.address)).to.be.revertedWith("!governance")
      await expect(bondDepository.connect(bond_purchaser).removeTeller(mockTeller.address)).to.be.revertedWith("!governance")
      await expect(bondDepository.connect(randomGreedyPerson).removeTeller(mockTeller.address)).to.be.revertedWith("!governance")
    })
    it("governance can remove tellers", async function() {
      let tx1 = await bondDepository.connect(governor).removeTeller(mockTeller.address);
      expect(tx1).to.emit(bondDepository, "TellerRemoved").withArgs(mockTeller.address);
      expect(await bondDepository.isTeller(mockTeller.address)).to.be.false;
    })
    it("non tellers cannot pull solace", async function () {
      await expect(bondDepository.connect(mockTeller).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(deployer).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(governor).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(mockTeller).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(dao).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(underwritingPool).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(bond_purchaser).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
      await expect(bondDepository.connect(randomGreedyPerson).pullSolace(ONE_MILLION_ETHER)).to.be.revertedWith("!teller");
    });
    it("tellers cannot mint SOLACE tokens", async function () {
      await bondDepository.connect(governor).addTeller(mockTeller.address);
      await expect(solace.connect(mockTeller).mint(mockTeller.address, ONE_MILLION_ETHER)).to.be.revertedWith("!minter");
    });
    it("tellers cannot pullSolace if there is no SOLACE in the BondDepository", async function() {
      // return 1M SOLACE from bondDepository to governor
      await bondDepository.connect(governor).returnSolace(governor.address, ONE_MILLION_ETHER);

      await expect(bondDepository.connect(mockTeller).pullSolace(1)).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      // transfer back 1M SOLACE from governor to bondDepository
      await solace.connect(governor).transfer(bondDepository.address, ONE_MILLION_ETHER);
      const bondDepository_SOLACE_balance = await solace.balanceOf(bondDepository.address);
      expect(bondDepository_SOLACE_balance).to.equal(ONE_MILLION_ETHER);
    })
    it("tellers can pullSolace if there is SOLACE in the BondDepository", async function() {
      await bondDepository.connect(mockTeller).pullSolace(ONE_HUNDRED_THOUSAND_ETHER);
      expect(await solace.balanceOf(mockTeller.address)).eq(ONE_HUNDRED_THOUSAND_ETHER);
      expect(await solace.balanceOf(bondDepository.address)).eq(NINE_HUNDRED_THOUSAND_ETHER);

      // Return the pulled SOLACE
      await solace.connect(mockTeller).transfer(bondDepository.address, ONE_HUNDRED_THOUSAND_ETHER);
      expect(await solace.balanceOf(mockTeller.address)).eq(0);
      expect(await solace.balanceOf(bondDepository.address)).eq(ONE_MILLION_ETHER);
    })
  })

  describe("create Bond Teller contracts", function () {
    before(async function () {
      tellerErc20Implementation = (await deployContract(deployer, artifacts.BondTellerERC20V2)) as BondTellerErc20V2;
      tellerEthImplementation = (await deployContract(deployer, artifacts.BondTellerEthV2)) as BondTellerEthV2;
    });

    it("non governance cannot create tellers", async function () {
      await expect(bondDepository.connect(deployer).createBondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(deployer).create2BondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, toBytes32(0), dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(mockTeller).createBondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(mockTeller).create2BondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, toBytes32(0), dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(dao).createBondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(dao).create2BondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, toBytes32(0), dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(underwritingPool).createBondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(underwritingPool).create2BondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, toBytes32(0), dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(bond_purchaser).createBondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(bond_purchaser).create2BondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, toBytes32(0), dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(randomGreedyPerson).createBondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, dai.address)).to.be.revertedWith("!governance");
      await expect(bondDepository.connect(randomGreedyPerson).create2BondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, toBytes32(0), dai.address)).to.be.revertedWith("!governance");
    });

    it("governance can create Bond Tellers", async function() {
      
      let tx1 = await bondDepository.connect(governor).createBondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, dai.address);
      let events1 = (await tx1.wait())?.events;
      if(events1 && events1.length > 0) {
        let event1 = events1[0];
        teller_DAI = await ethers.getContractAt(artifacts.BondTellerERC20V2.abi, event1?.args?.["deployment"]) as BondTellerErc20V2;
      } else throw "no deployment";
      expect(teller_DAI.address).not.eq(ZERO_ADDRESS);

      let tx2 = await bondDepository.connect(governor).create2BondTeller("Solace ETH Bond", governor.address, tellerEthImplementation.address, toBytes32(0), weth.address);
      let events2 = (await tx2.wait())?.events;
      if(events2 && events2.length > 0) {
        let event2 = events2[0];
        teller_ETH = await ethers.getContractAt(artifacts.BondTellerEthV2.abi, event2?.args?.["deployment"]) as BondTellerEthV2;
      } else throw "no deployment";
      expect(teller_ETH.address).not.eq(teller_DAI.address);      

      let tx3 = await bondDepository.connect(governor).create2BondTeller("Solace USDC Bond", governor.address, tellerErc20Implementation.address, toBytes32(1),usdc.address);
      let events3 = (await tx3.wait())?.events;
      if(events3 && events3.length > 0) {
        let event3 = events3[0];
        teller_USDC = await ethers.getContractAt(artifacts.BondTellerERC20V2.abi, event3?.args?.["deployment"]) as BondTellerErc20V2;
      } else throw "no deployment";
      expect(teller_USDC.address).not.eq(teller_ETH.address);

      let tx4 = await bondDepository.connect(governor).create2BondTeller("Solace SOLACE-USDC SLP Bond", governor.address, tellerErc20Implementation.address,toBytes32(2), solace_usdc_slp.address);
      let events4 = (await tx4.wait())?.events;
      if(events4 && events4.length > 0) {
        let event4 = events4[0];
        teller_SOLACE_USDC_SLP = await ethers.getContractAt(artifacts.BondTellerERC20V2.abi, event4?.args?.["deployment"]) as BondTellerErc20V2;
      } else throw "no deployment";
      expect(teller_SOLACE_USDC_SLP.address).not.eq(teller_USDC.address);

      let tx5 = await bondDepository.connect(governor).create2BondTeller("Solace WBTC Bond", governor.address, tellerErc20Implementation.address,toBytes32(3), wbtc.address);
      let events5 = (await tx5.wait())?.events;
      if(events5 && events5.length > 0) {
        let event5 = events5[0];
        teller_WBTC = await ethers.getContractAt(artifacts.BondTellerERC20V2.abi, event5?.args?.["deployment"]) as BondTellerErc20V2;
      } else throw "no deployment";
      expect(teller_WBTC.address).not.eq(teller_SOLACE_USDC_SLP.address);

      let tx6 = await bondDepository.connect(governor).create2BondTeller("Solace SCP Bond", governor.address, tellerErc20Implementation.address,toBytes32(4), scp.address);
      let events6 = (await tx6.wait())?.events;
      if(events6 && events6.length > 0) {
        let event6 = events6[0];
        teller_SCP = await ethers.getContractAt(artifacts.BondTellerERC20V2.abi, event6?.args?.["deployment"]) as BondTellerErc20V2;
      } else throw "no deployment";
      expect(teller_SCP.address).not.eq(teller_WBTC.address);

      let tx7 = await bondDepository.connect(governor).create2BondTeller("Solace USDT Bond", governor.address, tellerErc20Implementation.address,toBytes32(5), usdt.address);
      let events7 = (await tx7.wait())?.events;
      if(events7 && events7.length > 0) {
        let event7 = events7[0];
        teller_USDT = await ethers.getContractAt(artifacts.BondTellerERC20V2.abi, event7?.args?.["deployment"]) as BondTellerErc20V2;
      } else throw "no deployment";
      expect(teller_USDT.address).not.eq(teller_SCP.address);
      })
    });

    describe("t = after Bond Teller contracts deployed", function () {
      it("returnSolace cannot return more SOLACE than balance of BondDepository contract", async function () {
        let bal = await solace.balanceOf(bondDepository.address);
        await expect(bondDepository.connect(governor).returnSolace(governor.address, bal.add(1))).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      })
      it("governor can call returnSOLACE", async function () {
        await bondDepository.connect(governor).returnSolace(governor.address, ONE_MILLION_ETHER);
        expect(await solace.balanceOf(bondDepository.address)).eq(0);
        expect(await solace.balanceOf(governor.address)).eq(ONE_MILLION_ETHER);
      })
      it("governor cannot use setAddresses() to set a zero address", async function () {
        await expect(bondDepository.connect(governor).setAddresses(ZERO_ADDRESS, xsolace.address, underwritingPool.address, dao.address)).to.be.revertedWith("zero address solace");
        await expect(bondDepository.connect(governor).setAddresses(solace.address, ZERO_ADDRESS, underwritingPool.address, dao.address)).to.be.revertedWith("zero address xsolace");
        await expect(bondDepository.connect(governor).setAddresses(solace.address, xsolace.address, ZERO_ADDRESS, dao.address)).to.be.revertedWith("zero address pool");
        await expect(bondDepository.connect(governor).setAddresses(solace.address, xsolace.address, underwritingPool.address, ZERO_ADDRESS)).to.be.revertedWith("zero address dao");
      })
      it("governance can call setAddresses()", async function () {
          let tx = await bondDepository.connect(governor).setAddresses(weth.address, dai.address, solace.address, xsolace.address);
          expect(tx).to.emit(bondDepository, "ParamsSet").withArgs(weth.address, dai.address, solace.address, xsolace.address);
          expect(await bondDepository.solace()).eq(weth.address);
          expect(await bondDepository.xsolace()).eq(dai.address);
          expect(await bondDepository.underwritingPool()).eq(solace.address);
          expect(await bondDepository.dao()).eq(xsolace.address);
      });
    })

    describe("Lock governance", async function() {
      it("non governance cannot call lockGovernance()", async function () {
          await expect(bondDepository.connect(deployer).lockGovernance()).to.be.revertedWith("!governance");
          await expect(bondDepository.connect(mockTeller).lockGovernance()).to.be.revertedWith("!governance");
          await expect(bondDepository.connect(dao).lockGovernance()).to.be.revertedWith("!governance");
          await expect(bondDepository.connect(underwritingPool).lockGovernance()).to.be.revertedWith("!governance");
          await expect(bondDepository.connect(bond_purchaser).lockGovernance()).to.be.revertedWith("!governance");
          await expect(bondDepository.connect(randomGreedyPerson).lockGovernance()).to.be.revertedWith("!governance");
      })

      it("governance can call lockGovernance()", async function () {
          let tx = await bondDepository.connect(governor).lockGovernance();
          await expect(tx).to.emit(bondDepository, "GovernanceTransferred").withArgs(governor.address, "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF");
          await expect(tx).to.emit(bondDepository, "GovernanceLocked").withArgs();
          expect(await bondDepository.governanceIsLocked()).to.be.true;
          expect(await bondDepository.governance()).to.equal("0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF");
          expect(await bondDepository.pendingGovernance()).to.equal("0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF");
      });

      it("governance can no longer call returnSolace", async function() {
          await expect(bondDepository.connect(governor).returnSolace(governor.address, 1)).to.be.revertedWith("governance locked");
      })

      it("governance can no longer call setAddresses", async function() {
          await expect(bondDepository.connect(governor).setAddresses(weth.address, dai.address, solace.address, xsolace.address)).to.be.revertedWith("governance locked");
      })
      it("governance can no longer call addTeller", async function() {
          await expect(bondDepository.connect(governor).addTeller(weth.address)).to.be.revertedWith("governance locked");
      })
      it("governance can no longer call removeTeller", async function() {
          await expect(bondDepository.connect(governor).removeTeller(weth.address)).to.be.revertedWith("governance locked");
      })
      it("governance can no longer call createBondTeller", async function() {
          await expect(bondDepository.connect(governor).createBondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, dai.address)).to.be.revertedWith("governance locked");
      })
      it("governance can no longer call create2BondTeller", async function() {
          await expect(bondDepository.connect(governor).create2BondTeller("Solace DAI Bond", governor.address, tellerErc20Implementation.address, toBytes32(7), dai.address)).to.be.revertedWith("governance locked");
      })
    })

});
