import chai from "chai";
import { waffle } from "hardhat";
import SolaceArtifact from "../artifacts/contracts/SOLACE.sol/SOLACE.json"
import { Solace } from "../typechain";

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);

describe("SolaceToken", () => {
  let solace: Solace;
  const [owner, governor, minter, receiver1, receiver2] = provider.getWallets();
  const name = "solace";
  const symbol = "SOLACE";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const amount = 10

  beforeEach(async () => {
    solace = (await deployContract(
      owner,
      SolaceArtifact,
      [
        owner.address
      ]
    )) as Solace;
  })

  it("has a correct name", async function () {
    expect(await solace.name()).to.equal(name);
  })

  it("has a correct symbol", async function () {
    expect(await solace.symbol()).to.equal(symbol);
  })

  it("has 18 decimals", async function () {
    expect(await solace.decimals()).to.equal(18);
  })

  it("has a correct governance", async function () {
    expect(await solace.governance()).to.equal(owner.address);
  })

  describe("_mint", function () {
    it("rejects a null account", async function () {
      await expect(solace.mint(ZERO_ADDRESS, amount),).to.be.reverted;
    })

    describe("for a non zero account", function () {
      beforeEach("minting", async function () {
        await solace.addMinter(minter.address)
        await solace.connect(minter).mint(receiver1.address, amount);
      })

      it("increments totalSupply", async function () {
        expect(await solace.totalSupply()).to.equal(amount);
      })

      it("increments recipient balance", async function () {
        expect(await solace.balanceOf(receiver1.address)).to.equal(amount);
      })

      it("emits Transfer event", async function () {
        expect(await solace.connect(minter).mint(receiver1.address, amount)).to.emit(solace, "Transfer").withArgs(ZERO_ADDRESS, receiver1.address, amount);
      })
    })
  })

  describe("mint", function () {
    it("allows minters to mint", async function () {
      await solace.connect(owner).addMinter(minter.address);
      await solace.connect(minter).mint(receiver1.address, amount);
      expect(await solace.balanceOf(receiver1.address)).to.equal(amount);
      expect(await solace.totalSupply()).to.equal(amount);
    })

    it("reverts mint() called by non-minters", async function () {
      await expect(solace.connect(receiver1).mint(receiver1.address,amount)).to.be.reverted;
    })
  })

  describe('minters', function () {
    it('owner is minter', async function () {
      expect(await solace.minters(owner.address)).to.be.true;
    })

    it('can add minters', async function (){
      await solace.connect(owner).addMinter(minter.address);
      expect(await solace.minters(minter.address)).to.equal(true);
    })

    it("can remove minters", async function () {
      await solace.connect(owner).removeMinter(minter.address);
      expect(await solace.minters(minter.address)).to.equal(false);
    })

    it("reverts when !governance adds / removes minters", async function () {
      await expect(solace.connect(receiver1).addMinter(receiver2.address)).to.be.reverted;
      await expect(solace.connect(receiver1).removeMinter(receiver2.address)).to.be.reverted;
    })
  })

  describe("governance", function () {
    it("can transfer governance", async function () {
      expect(await solace.governance()).to.equal(owner.address);
      await solace.connect(owner).setGovernance(governor.address);
      expect(await solace.governance()).to.equal(owner.address);
      expect(await solace.newGovernance()).to.equal(governor.address);
      let tx = await solace.connect(governor).acceptGovernance();
      await expect(tx).to.emit(solace, "GovernanceTransferred").withArgs(governor.address);
      expect(await solace.governance()).to.equal(governor.address);
      expect(await solace.newGovernance()).to.equal(ZERO_ADDRESS);
    })

    it("reverts governance transfers by non-governor", async function () {
      await expect(solace.connect(receiver1).setGovernance(receiver2.address)).to.be.reverted;
      await solace.connect(owner).setGovernance(governor.address);
      await expect(solace.connect(receiver1).acceptGovernance()).to.be.revertedWith("!governance");
    })
  })
})
