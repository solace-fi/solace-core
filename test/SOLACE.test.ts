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
      await solace.connect(governor).addMinter(minter.address);
      let balance1 = await solace.balanceOf(receiver1.address);
      let supply1 = await solace.totalSupply();
      await solace.connect(minter).mint(receiver1.address, amount);
      let balance2 = await solace.balanceOf(receiver1.address);
      let supply2 = await solace.totalSupply();
      expect(balance2).to.equal(amount.add(balance1));
      expect(supply2).to.equal(amount.add(supply1));
      await solace.connect(minter).mint(receiver1.address, amount);
      let balance3 = await solace.balanceOf(receiver1.address);
      let supply3 = await solace.totalSupply();
      expect(balance3).to.equal(amount.add(balance2));
      expect(supply3).to.equal(amount.add(supply2));
    });
    it("reverts mint() called by non-minters", async function () {
      await expect(solace.connect(receiver1).mint(receiver1.address,amount)).to.be.reverted;
    });
  });

  describe("minters", function () {
    it("governor is not minter", async function () {
      expect(await solace.isMinter(governor.address)).to.be.false;
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

  describe("burn", function () {
    it("anyone can burn their own balance", async function () {
      let balance1 = await solace.balanceOf(receiver1.address);
      let supply1 = await solace.totalSupply();
      let burnAmount1 = balance1.div(2);
      let burnAmount2 = balance1.sub(burnAmount1);
      await solace.connect(receiver1).burn(burnAmount1);
      let balance2 = await solace.balanceOf(receiver1.address);
      let supply2 = await solace.totalSupply();
      expect(balance1.sub(balance2)).to.equal(burnAmount1);
      expect(supply1.sub(supply2)).to.equal(burnAmount1);
      await solace.connect(receiver1).burn(burnAmount2);
      let balance3 = await solace.balanceOf(receiver1.address);
      let supply3 = await solace.totalSupply();
      expect(balance3).to.equal(0);
      expect(supply1.sub(supply3)).to.equal(balance1);
    });
    it("cannot burn more than balance", async function () {
      await expect(solace.connect(receiver2).burn(1)).to.be.revertedWith("ERC20: burn amount exceeds balance");
      await solace.connect(governor).addMinter(minter.address);
      await solace.connect(minter).mint(receiver2.address, 2);
      await expect(solace.connect(receiver2).burn(3)).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
  });

  describe("governance", function () {
    it("can transfer governance", async function () {
      expect(await solace.governance()).to.equal(governor.address);
      let tx1 = await solace.connect(governor).setPendingGovernance(owner.address);
      expect(tx1).to.emit(solace, "GovernancePending").withArgs(owner.address);
      expect(await solace.governance()).to.equal(governor.address);
      expect(await solace.pendingGovernance()).to.equal(owner.address);
      let tx2 = await solace.connect(owner).acceptGovernance();
      await expect(tx2).to.emit(solace, "GovernanceTransferred").withArgs(governor.address, owner.address);
      expect(await solace.governance()).to.equal(owner.address);
      expect(await solace.pendingGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("reverts governance transfers by non-governor", async function () {
      await expect(solace.connect(receiver1).setPendingGovernance(receiver2.address)).to.be.reverted;
      await solace.connect(owner).setPendingGovernance(governor.address);
      await expect(solace.connect(receiver1).acceptGovernance()).to.be.revertedWith("!pending governance");
      await solace.connect(governor).acceptGovernance();
    });
  });
})
