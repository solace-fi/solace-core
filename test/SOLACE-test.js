const { expect, use } = require('chai');
const { waffle } = require("hardhat");
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
const SOLACE = require('../artifacts/contracts/SOLACE.sol/SOLACE.json');

use(solidity);

describe('SolaceToken', () => {
  const [owner, governor, minter, receiver1, receiver2] = provider.getWallets();

  const name = 'solace.fi';
  const symbol = 'SOLACE';
  ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  beforeEach(async () => {
    token = await deployContract(owner, SOLACE);
  });

  it('has a correct name', async function () {
    expect(await token.name()).to.equal(name);
  });

  it('has a correct symbol', async function () {
    expect(await token.symbol()).to.equal(symbol);
  });

  it('has 18 decimals', async function () {
    expect(await token.decimals()).to.equal(18);
  });

  describe('roles', function () {
    it('can transfer governance', async function () {
      expect(await token.governance()).to.equal(owner.address);
      await token.setGovernance(governor.address);
      expect(await token.governance()).to.equal(governor.address);
    })

    it('rejects governance transfers by non-governor', async function () {
      await expect(token.connect(receiver1).setGovernance(receiver2.address)).to.be.reverted;
    })

    it('can add and remove minters', async function () {
      // note: state reset at start of each block
      await token.setGovernance(governor.address);
      expect(await token.minters(minter.address)).to.equal(false);
      await token.connect(governor).addMinter(minter.address);
      expect(await token.minters(minter.address)).to.equal(true);
      await token.connect(governor).removeMinter(minter.address);
      expect(await token.minters(minter.address)).to.equal(false);
    })

    it('rejects adding and removing minters by non-governor', async function () {
      await expect(token.connect(receiver1).addMinter(receiver2.address)).to.be.reverted;
      await expect(token.connect(receiver1).removeMinter(receiver2.address)).to.be.reverted;
    })

    it('minters can mint', async function () {
      await token.setGovernance(governor.address);
      await token.connect(governor).addMinter(minter.address);
      await token.connect(minter).mint(receiver1.address, 1);
    })

    it('non-minters cannot mint', async function () {
      await expect(token.connect(receiver1.address).mint(receiver1.address, 1)).to.be.reverted;
    })
  })

  describe('_mint', function () {
    const amount = 50;
    it('rejects a null account', async function () {
      await expect(token.mint(ZERO_ADDRESS, amount),).to.be.reverted;
    });

    describe('for a non zero account', function () {
      beforeEach('minting', async function () {
        await token.addMinter(minter.address)
        await token.connect(minter).mint(receiver1.address, amount);
      });

      it('increments totalSupply', async function () {
        expect(await token.totalSupply()).to.equal(amount);
      });

      it('increments recipient balance', async function () {
        expect(await token.balanceOf(receiver1.address)).to.equal(amount);
      });

      it('emits Transfer event', async function () {
        expect(await token.connect(minter).mint(receiver1.address, amount)).to.emit(token, 'Transfer').withArgs(ZERO_ADDRESS, receiver1.address, amount);
      });
    });
  });
});
