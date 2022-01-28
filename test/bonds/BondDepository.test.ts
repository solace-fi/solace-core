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

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Solace, XSolacev1, MockErc20, Weth9, Registry, BondDepository, BondTellerErc20, BondTellerEth } from "./../../typechain";
import { toBytes32 } from "./../utilities/setStorage";

describe("BondDepository", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, minter, depositor, mockTeller, dao, underwritingPool] = provider.getWallets();

  // solace contracts
  let weth: Weth9;
  let solace: Solace;
  let xsolace: XSolacev1;
  let bondDepo: BondDepository;
  let dai: MockErc20;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const TEN_ETHER = BN.from("10000000000000000000");
  const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsolace = (await deployContract(deployer, artifacts.xSOLACEV1, [governor.address, solace.address])) as XSolacev1;
    dai = (await deployContract(deployer, artifacts.MockERC20, ["DAI", "DAI", ONE_MILLION_ETHER])) as MockErc20;
    await weth.connect(depositor).deposit({ value: TEN_ETHER });
    await solace.connect(governor).addMinter(minter.address);
  });

  describe("deployment", function () {
    it("reverts if zero governor", async function () {
      await expect(deployContract(deployer, artifacts.BondDepository, [ZERO_ADDRESS, solace.address])).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero solace", async function () {
      await expect(deployContract(deployer, artifacts.BondDepository, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address solace");
    });
    it("deploys", async function () {
      bondDepo = (await deployContract(deployer, artifacts.BondDepository, [governor.address, solace.address])) as BondDepository;
    });
    it("starts with correct solace", async function () {
      expect(await bondDepo.solace()).eq(solace.address);
    });
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await bondDepo.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(bondDepo.connect(depositor).setPendingGovernance(depositor.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await bondDepo.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(bondDepo, "GovernancePending").withArgs(deployer.address);
      expect(await bondDepo.governance()).to.equal(governor.address);
      expect(await bondDepo.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(bondDepo.connect(depositor).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function() {
      let tx = await bondDepo.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(bondDepo, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await bondDepo.governance()).to.equal(deployer.address);
      expect(await bondDepo.pendingGovernance()).to.equal(ZERO_ADDRESS);

      await bondDepo.connect(deployer).setPendingGovernance(governor.address);
      await bondDepo.connect(governor).acceptGovernance();
    });
  });

  describe("tellers", function () {
    it("non governance cannot add tellers", async function () {
      await expect(bondDepo.connect(mockTeller).addTeller(mockTeller.address)).to.be.revertedWith("!governance")
    });
    it("governance can add tellers", async function () {
      expect(await bondDepo.isTeller(mockTeller.address)).to.be.false;
      let tx1 = await bondDepo.connect(governor).addTeller(mockTeller.address);
      await expect(tx1).to.emit(bondDepo, "TellerAdded").withArgs(mockTeller.address);
      expect(await bondDepo.isTeller(mockTeller.address)).to.be.true;
      let tx2 = await bondDepo.connect(governor).addTeller(mockTeller.address);
      await expect(tx2).to.emit(bondDepo, "TellerAdded").withArgs(mockTeller.address);
      expect(await bondDepo.isTeller(mockTeller.address)).to.be.true;
    });
    it("non governance cannot remove tellers", async function () {
      await expect(bondDepo.connect(mockTeller).removeTeller(mockTeller.address)).to.be.revertedWith("!governance")
    });
    it("governance can remove tellers", async function () {
      expect(await bondDepo.isTeller(mockTeller.address)).to.be.true;
      let tx1 = await bondDepo.connect(governor).removeTeller(mockTeller.address);
      await expect(tx1).to.emit(bondDepo, "TellerRemoved").withArgs(mockTeller.address);
      expect(await bondDepo.isTeller(mockTeller.address)).to.be.false;
      let tx2 = await bondDepo.connect(governor).removeTeller(mockTeller.address);
      await expect(tx2).to.emit(bondDepo, "TellerRemoved").withArgs(mockTeller.address);
      expect(await bondDepo.isTeller(mockTeller.address)).to.be.false;
    });
    it("non tellers cannot pull solace", async function () {
      await expect(bondDepo.connect(mockTeller).pullSolace(1)).to.be.revertedWith("!teller");
    });
    it("tellers should not mint directly via solace", async function () {
      await expect(solace.connect(mockTeller).mint(mockTeller.address, 1)).to.be.revertedWith("!minter");
    });
    it("will fail if depo is not minter", async function () {
      await bondDepo.connect(governor).addTeller(mockTeller.address);
      await expect(bondDepo.connect(mockTeller).pullSolace(1)).to.be.revertedWith("!minter");
    });
    it("tellers can pull solace", async function () {
      expect(await solace.balanceOf(bondDepo.address)).eq(0);
      expect(await solace.balanceOf(mockTeller.address)).eq(0);
      await solace.connect(governor).addMinter(bondDepo.address);
      await bondDepo.connect(mockTeller).pullSolace(1);
      expect(await solace.balanceOf(bondDepo.address)).eq(0);
      expect(await solace.balanceOf(mockTeller.address)).eq(1);
      await bondDepo.connect(mockTeller).pullSolace(2);
      expect(await solace.balanceOf(bondDepo.address)).eq(0);
      expect(await solace.balanceOf(mockTeller.address)).eq(3);
    });
  });
  /*
  describe("create teller", function () {
    let tellerErc20Impl: BondTellerErc20;
    let tellerEthImpl: BondTellerEth;
    let teller1: BondTellerErc20;
    let teller2: BondTellerErc20;
    let teller3: BondTellerErc20;
    let teller4: BondTellerErc20;
    let teller5: BondTellerEth;

    before(async function () {
      tellerErc20Impl = (await deployContract(deployer, artifacts.BondTellerERC20)) as BondTellerErc20;
      tellerEthImpl = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
    });
    it("non governance cannot create tellers", async function () {
      await expect(bondDepo.connect(depositor).createBondTeller("Solace USDC Bond", governor.address, tellerErc20Impl.address, weth.address)).to.be.revertedWith("!governance");
      await expect(bondDepo.connect(depositor).create2BondTeller("Solace USDC Bond", governor.address, tellerErc20Impl.address, toBytes32(0), weth.address)).to.be.revertedWith("!governance");
    });
    it("governance can create tellers", async function () {
      let tx1 = await bondDepo.connect(governor).createBondTeller("Solace USDC Bond", governor.address, tellerErc20Impl.address, weth.address);
      let events1 = (await tx1.wait())?.events;
      if(events1 && events1.length > 0) {
        let event1 = events1[0];
        teller1 = await ethers.getContractAt(artifacts.BondTellerERC20.abi, event1?.args?.["deployment"]) as BondTellerErc20;
      } else throw "no deployment";
      expect(teller1.address).not.eq(ZERO_ADDRESS);

      let tx2 = await bondDepo.connect(governor).createBondTeller("Solace SOLACE-DAI SLP Bond", governor.address, tellerErc20Impl.address, weth.address);
      let events2 = (await tx2.wait())?.events;
      if(events2 && events2.length > 0) {
        let event2 = events2[0];
        teller2 = await ethers.getContractAt(artifacts.BondTellerERC20.abi, event2?.args?.["deployment"]) as BondTellerErc20;
      } else throw "no deployment";
      expect(teller2.address).not.eq(teller1.address);

      let tx3 = await bondDepo.connect(governor).create2BondTeller("Solace SOLACE-USDC SLP Bond", governor.address, tellerErc20Impl.address, toBytes32(0), weth.address);
      let events3 = (await tx3.wait())?.events;
      if(events3 && events3.length > 0) {
        let event3 = events3[0];
        teller3 = await ethers.getContractAt(artifacts.BondTellerERC20.abi, event3?.args?.["deployment"]) as BondTellerErc20;
      } else throw "no deployment";
      expect(teller3.address).not.eq(teller2.address);

      let tx4 = await bondDepo.connect(governor).create2BondTeller("Solace USDC Bond", governor.address, tellerErc20Impl.address, toBytes32(1), dai.address);
      let events4 = (await tx4.wait())?.events;
      if(events4 && events4.length > 0) {
        let event4 = events4[0];
        teller4 = await ethers.getContractAt(artifacts.BondTellerERC20.abi, event4?.args?.["deployment"]) as BondTellerErc20;
      } else throw "no deployment";
      expect(teller4.address).not.eq(teller3.address);

      let tx5 = await bondDepo.connect(governor).createBondTeller("Solace ETH Bond", governor.address, tellerEthImpl.address, weth.address);
      let events5 = (await tx5.wait())?.events;
      if(events5 && events5.length > 0) {
        let event5 = events5[0];
        teller5 = await ethers.getContractAt(artifacts.BondTellerETH.abi, event5?.args?.["deployment"]) as BondTellerEth;
      } else throw "no deployment";
      expect(teller5.address).not.eq(teller4.address);
    });
  });
  */
});
