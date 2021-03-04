const { expect, use } = require('chai');
const { waffle } = require("hardhat");
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
const SOLACE = require('../artifacts/contracts/SOLACE.sol/SOLACE.json');

use(solidity);

describe('SolaceToken', () => {
  const [wallet, walletTo, anotherAccount] = provider.getWallets();

  const name = 'solace.fi';
  const symbol = 'SOLACE';
  ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  beforeEach(async () => {
    token = await deployContract(wallet, SOLACE);
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

  describe('_mint', function () {
    const amount = 50;
    it('rejects a null account', async function () {
      await expect(token.mint(ZERO_ADDRESS, amount),).to.be.reverted;
    });

    describe('for a non zero account', function () {
      beforeEach('minting', async function () {
        await token.addMinter(wallet.address)
        await token.mint(wallet.address, amount);
      });

      it('increments totalSupply', async function () {
        expect(await token.totalSupply()).to.equal(amount);
      });

      it('increments recipient balance', async function () {
        expect(await token.balanceOf(wallet.address)).to.equal(amount);
      });

      it('emits Transfer event', async function () {
        expect(await token.mint(wallet.address, amount)).to.emit(token, 'Transfer').withArgs(ZERO_ADDRESS, wallet.address, amount);
      });
    });
  });
});