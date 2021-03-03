// import {expect, use} from 'chai';
const { expect, use } = require('chai');
const {Contract} = require('ethers');
const {deployContract, MockProvider, solidity} = require('ethereum-waffle');
const SOLACE = require('../artifacts/contracts/SOLACE.sol/SOLACE.json');

use(solidity);

describe('SolaceToken', () => {
  const [wallet, walletTo] = new MockProvider().getWallets();
  // let token: Contract;

  beforeEach(async () => {
    token = await deployContract(wallet, SOLACE, [1000]);
  });

  it('Assigns initial balance', async () => {
    expect(await token.balanceOf(wallet.address)).to.equal(1000);
  });

  it('Transfer emits event', async () => {
    await expect(token.transfer(walletTo.address, 7))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, walletTo.address, 7);
  });

  it('Can not transfer above the amount', async () => {
    await expect(token.transfer(walletTo.address, 1007))
      .to.be.revertedWith('VM Exception while processing transaction: revert ERC20: transfer amount exceeds balance');
  });

  it('Send transaction changes receiver balance', async () => {
    await expect(() => wallet.sendTransaction({to: walletTo.address, gasPrice: 0, value: 200}))
      .to.changeBalance(walletTo, 200);
  });

  it('Send transaction changes sender and receiver balances', async () => {
    await expect(() =>  wallet.sendTransaction({to: walletTo.address, gasPrice: 0, value: 200}))
      .to.changeBalances([wallet, walletTo], [-200, 200]);
  });
});