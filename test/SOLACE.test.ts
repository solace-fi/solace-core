import chai from "chai";
import { waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace } from "../typechain";

const ONE_BILLION = BN.from("1000000000000000000000000000");
const TWO_BILLION = BN.from("2000000000000000000000000000");
const THREE_BILLION = BN.from("3000000000000000000000000000");
const FOUR_BILLION = BN.from("4000000000000000000000000000");

describe("SOLACE", function () {
  let solace: Solace;
  const [owner, governor, minter, receiver1, receiver2] = provider.getWallets();
  const name = "solace";
  const symbol = "SOLACE";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const amount = BN.from("1000000000000000000");
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await owner.sendTransaction({to:owner.address}); // for some reason this helps solidity-coverage
    solace = (await deployContract(owner, artifacts.SOLACE, [governor.address])) as Solace;
  });

  describe("deployment", function () {
    it("has a correct name", async function () {
      expect(await solace.name()).to.equal(name);
    });
    it("has a correct symbol", async function () {
      expect(await solace.symbol()).to.equal(symbol);
    });
    it("has 18 decimals", async function () {
      expect(await solace.decimals()).to.equal(18);
    });
    it("has a correct governance", async function () {
      expect(await solace.governance()).to.equal(governor.address);
    });
  });

  describe("_mint", function () {
    it("rejects a null account", async function () {
      await expect(solace.mint(ZERO_ADDRESS, amount)).to.be.reverted;
    });
    describe("for a non zero account", function () {
      before("minting", async function () {
        await solace.connect(governor).addMinter(minter.address)
        await solace.connect(minter).mint(receiver1.address, amount);
      });
      it("increments totalSupply", async function () {
        expect(await solace.totalSupply()).to.equal(amount);
      });
      it("increments recipient balance", async function () {
        expect(await solace.balanceOf(receiver1.address)).to.equal(amount);
      });
      it("emits Transfer event", async function () {
        expect(await solace.connect(minter).mint(receiver1.address, amount)).to.emit(solace, "Transfer").withArgs(ZERO_ADDRESS, receiver1.address, amount);
      });
    });
  });

  describe("mint", function () {
    it("allows minters to mint", async function () {
      let balanceBefore = await solace.balanceOf(receiver1.address);
      let supplyBefore = await solace.totalSupply();
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(receiver1.address, amount);
      expect(await solace.balanceOf(receiver1.address)).to.equal(amount.add(balanceBefore));
      expect(await solace.totalSupply()).to.equal(amount.add(supplyBefore));
    });
    it("reverts mint() called by non-minters", async function () {
      await expect(solace.connect(receiver1).mint(receiver1.address,amount)).to.be.reverted;
    });
    it("has a soft cap", async function () {
      expect(await solace.maxSupply()).to.equal(ONE_BILLION);
    });
    it("can mint up to the cap", async function () {
      let supply = await solace.totalSupply();
      expect(supply).to.be.lt(ONE_BILLION);
      let diff = ONE_BILLION.sub(supply);
      await solace.connect(minter).mint(receiver1.address, diff);
      expect(await solace.totalSupply()).to.equal(ONE_BILLION);
    });
    it("cannot mint more than the cap", async function () {
      await expect(solace.connect(minter).mint(receiver1.address, 1)).to.be.revertedWith("capped");
    });
    it("non governance cannot change cap", async function () {
      await expect(solace.connect(minter).setMaxSupply(TWO_BILLION)).to.be.revertedWith("!governance")
    });
    it("governance can change cap", async function () {
      let tx1 = await solace.connect(governor).setMaxSupply(FOUR_BILLION);
      expect(tx1).to.emit(solace, "MaxSupplySet").withArgs(FOUR_BILLION);
      let tx2 = await solace.connect(governor).setMaxSupply(THREE_BILLION);
      expect(tx2).to.emit(solace, "MaxSupplySet").withArgs(THREE_BILLION);
    });
    it("can mint to new cap", async function () {
      let supply = await solace.totalSupply();
      let diff = THREE_BILLION.sub(supply);
      await solace.connect(minter).mint(receiver1.address, diff);
    });
    it("cannot lower cap under current supply", async function () {
      await expect(solace.connect(governor).setMaxSupply(TWO_BILLION)).to.be.revertedWith("max < current supply")
    });
  });

  describe("minters", function () {
    it("governor is minter", async function () {
      expect(await solace.isMinter(governor.address)).to.be.true;
    });
    it("can add minters", async function (){
      let tx = await solace.connect(governor).addMinter(minter.address);
      expect(tx).to.emit(solace, "MinterAdded").withArgs(minter.address);
      expect(await solace.isMinter(minter.address)).to.equal(true);
    });
    it("can remove minters", async function () {
      let tx = await solace.connect(governor).removeMinter(minter.address);
      expect(tx).to.emit(solace, "MinterRemoved").withArgs(minter.address);
      expect(await solace.isMinter(minter.address)).to.equal(false);
    });
    it("reverts when !governance adds / removes minters", async function () {
      await expect(solace.connect(receiver1).addMinter(receiver2.address)).to.be.reverted;
      await expect(solace.connect(receiver1).removeMinter(receiver2.address)).to.be.reverted;
    });
    it("cannot add zero address minter", async function () {
      await expect(solace.connect(governor).addMinter(ZERO_ADDRESS)).to.be.revertedWith("zero address");
    });
  });

  describe("governance", function () {
    it("can transfer governance", async function () {
      expect(await solace.governance()).to.equal(governor.address);
      let tx1 = await solace.connect(governor).setGovernance(owner.address);
      expect(tx1).to.emit(solace, "GovernancePending").withArgs(owner.address);
      expect(await solace.governance()).to.equal(governor.address);
      expect(await solace.pendingGovernance()).to.equal(owner.address);
      let tx2 = await solace.connect(owner).acceptGovernance();
      await expect(tx2).to.emit(solace, "GovernanceTransferred").withArgs(governor.address, owner.address);
      expect(await solace.governance()).to.equal(owner.address);
      expect(await solace.pendingGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("reverts governance transfers by non-governor", async function () {
      await expect(solace.connect(receiver1).setGovernance(receiver2.address)).to.be.reverted;
      await solace.connect(owner).setGovernance(governor.address);
      await expect(solace.connect(receiver1).acceptGovernance()).to.be.revertedWith("!governance");
      await solace.connect(governor).acceptGovernance();
    });
  });
})
