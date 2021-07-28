import { waffle, ethers } from 'hardhat';
const { deployContract, solidity } = waffle;
import { MockProvider } from 'ethereum-waffle';
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from 'ethers';
import chai from 'chai';
const { expect } = chai;
chai.use(solidity);

import { expectClose } from './utilities/chai_extensions';
import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from './utilities/uniswap';
import { burnBlocks, burnBlocksUntil } from './utilities/time';
import { bnAddSub, bnMulDiv } from './utilities/math';
import { getPermitDigest, sign, getDomainSeparator } from './utilities/signature';

import { import_artifacts, ArtifactImports } from './utilities/artifact_importer';
import { Solace, Vault, Master, Weth9, CpFarm } from '../typechain';

// contracts
let solaceToken: Solace;
let master: Master;
let vault: Vault;
let farm1: CpFarm;
let weth: Weth9;

// uniswap contracts
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let uniswapPositionManager: Contract;

// vars
let solacePerBlock = BN.from('100000000000000000000'); // 100 e18
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TEN_ETHER = BN.from('10000000000000000000');
const ONE_MILLION_ETHER = BN.from('1000000000000000000000000');
let blockNum: BN;
let startBlock: BN;
let endBlock: BN;
let cpFarmType = 1;

const cpTokenName = 'Solace CP Token';
const chainId = 31337;
const deadline = constants.MaxUint256;

describe('CpFarm', function () {
  const [deployer, governor, farmer1, farmer2, mockVault, liquidityProvider] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();

    // deploy solace token
    solaceToken = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;

    // deploy weth
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;

    // deploy master contract
    master = (await deployContract(deployer, artifacts.Master, [governor.address, solaceToken.address, solacePerBlock])) as Master;

    // deploy vault / cp token
    vault = (await deployContract(deployer, artifacts.Vault, [governor.address, ZERO_ADDRESS, weth.address])) as Vault;

    // deploy uniswap factory
    uniswapFactory = (await deployContract(deployer, artifacts.UniswapV3Factory)) as Contract;

    // deploy uniswap router
    uniswapRouter = (await deployContract(deployer, artifacts.SwapRouter, [uniswapFactory.address, weth.address])) as Contract;

    // deploy uniswap position manager
    uniswapPositionManager = (await deployContract(deployer, artifacts.NonfungiblePositionManager, [uniswapFactory.address, weth.address, ZERO_ADDRESS])) as Contract;

    // transfer tokens
    await solaceToken.connect(governor).addMinter(governor.address);
    await solaceToken.connect(governor).mint(master.address, ONE_MILLION_ETHER);
    await solaceToken.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solaceToken.connect(governor).mint(liquidityProvider.address, TEN_ETHER);
    await weth.connect(liquidityProvider).deposit({ value: TEN_ETHER });

    // create pool
    await createPool(weth, solaceToken, FeeAmount.MEDIUM);
    // add liquidity
    await addLiquidity(liquidityProvider, weth, solaceToken, FeeAmount.MEDIUM, TEN_ETHER);
  });

  describe('farm creation', function () {
    (startBlock = BN.from(5)), (endBlock = BN.from(6));

    it('can create farms', async function () {
      farm1 = await createCpFarm(startBlock, endBlock);
    });

    it('returns farm information', async function () {
      expect(await farm1.master()).to.equal(master.address);
      expect(await farm1.vault()).to.equal(vault.address);
      expect(await farm1.solace()).to.equal(solaceToken.address);
      expect(await farm1.blockReward()).to.equal(0);
      expect(await farm1.startBlock()).to.equal(startBlock);
      expect(await farm1.endBlock()).to.equal(endBlock);
      expect(await farm1.farmType()).to.equal(cpFarmType);
      expect(await farm1.valueStaked()).to.equal(0);
    });
  });

  describe('governance', function () {
    it('starts with the correct governor', async function () {
      expect(await farm1.governance()).to.equal(governor.address);
    });

    it('rejects setting new governance by non governor', async function () {
      await expect(farm1.connect(farmer1).setGovernance(farmer1.address)).to.be.revertedWith('!governance');
    });

    it('can set new governance', async function () {
      await farm1.connect(governor).setGovernance(deployer.address);
      expect(await farm1.governance()).to.equal(governor.address);
      expect(await farm1.newGovernance()).to.equal(deployer.address);
    });

    it('rejects governance transfer by non governor', async function () {
      await expect(farm1.connect(farmer1).acceptGovernance()).to.be.revertedWith('!governance');
    });

    it('can transfer governance', async function () {
      let tx = await farm1.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(farm1, 'GovernanceTransferred').withArgs(deployer.address);
      expect(await farm1.governance()).to.equal(deployer.address);
      expect(await farm1.newGovernance()).to.equal(ZERO_ADDRESS);

      await farm1.connect(deployer).setGovernance(governor.address);
      await farm1.connect(governor).acceptGovernance();
    });
  });

  describe('deposit and withdraw', function () {
    let balancesBefore: Balances, balancesAfter: Balances, balancesDiff: Balances;

    it('can deposit eth', async function () {
      // farmer 1, deposit 1 wei
      let depositAmount1 = BN.from(1);
      balancesBefore = await getBalances(farmer1, farm1);
      let tx1 = await farm1.connect(farmer1).depositEth({ value: depositAmount1 });
      await expect(tx1).to.emit(farm1, 'EthDeposited').withArgs(farmer1.address, depositAmount1);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount1);
      expect(balancesDiff.farmCp).to.equal(depositAmount1);
      expect(balancesDiff.userStake).to.equal(depositAmount1);
      // farmer 2, deposit 4 wei
      let depositAmount2 = BN.from(4);
      balancesBefore = await getBalances(farmer2, farm1);
      let tx2 = await farm1.connect(farmer2).depositEth({ value: depositAmount2 });
      await expect(tx2).to.emit(farm1, 'EthDeposited').withArgs(farmer2.address, depositAmount2);
      balancesAfter = await getBalances(farmer2, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount2);
      expect(balancesDiff.farmCp).to.equal(depositAmount2);
      expect(balancesDiff.userStake).to.equal(depositAmount2);
      // farmer 1, deposit 2 wei
      let depositAmount3 = BN.from(2);
      balancesBefore = await getBalances(farmer1, farm1);
      let tx3 = await farm1.connect(farmer1).depositEth({ value: depositAmount3 });
      await expect(tx3).to.emit(farm1, 'EthDeposited').withArgs(farmer1.address, depositAmount3);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount3);
      expect(balancesDiff.farmCp).to.equal(depositAmount3);
      expect(balancesDiff.userStake).to.equal(depositAmount3);
    });

    it('can deposit eth via receive', async function () {
      let depositAmount4 = BN.from(48);
      balancesBefore = await getBalances(farmer2, farm1);
      let tx = await farmer2.sendTransaction({
        to: farm1.address,
        value: depositAmount4,
        data: '0x',
      });
      await expect(tx).to.emit(farm1, 'EthDeposited').withArgs(farmer2.address, depositAmount4);
      balancesAfter = await getBalances(farmer2, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount4);
      expect(balancesDiff.farmCp).to.equal(depositAmount4);
      expect(balancesDiff.userStake).to.equal(depositAmount4);
    });

    it('can deposit eth via fallback', async function () {
      let depositAmount5 = BN.from(12345);
      balancesBefore = await getBalances(farmer2, farm1);
      let tx = await farmer2.sendTransaction({
        to: farm1.address,
        value: depositAmount5,
        data: '0xabcd',
      });
      await expect(tx).to.emit(farm1, 'EthDeposited').withArgs(farmer2.address, depositAmount5);
      balancesAfter = await getBalances(farmer2, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount5);
      expect(balancesDiff.farmCp).to.equal(depositAmount5);
      expect(balancesDiff.userStake).to.equal(depositAmount5);
    });

    it('cannot deposit eth when lacking funds', async function () {
      let depositAmount = (await farmer1.getBalance()).add(1);
      // throws InvalidInputError before it can revert
      let error = false;
      try {
        await farm1.connect(farmer1).depositEth({ value: depositAmount });
      } catch (e) {
        error = true;
      }
      expect(error);
    });

    it('can deposit cp', async function () {
      // farmer 1, deposit 13 cp
      let depositAmount6 = BN.from(13);
      balancesBefore = await getBalances(farmer1, farm1);
      await vault.connect(farmer1).deposit({ value: depositAmount6 });
      await vault.connect(farmer1).increaseAllowance(farm1.address, depositAmount6);
      let tx1 = await farm1.connect(farmer1).depositCp(depositAmount6);
      await expect(tx1).to.emit(farm1, 'CpDeposited').withArgs(farmer1.address, depositAmount6);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount6);
      expect(balancesDiff.farmCp).to.equal(depositAmount6);
      expect(balancesDiff.userStake).to.equal(depositAmount6);
      // farmer 2, deposit 25
      let depositAmount7 = BN.from(25);
      balancesBefore = await getBalances(farmer2, farm1);
      await vault.connect(farmer2).deposit({ value: depositAmount7 });
      await vault.connect(farmer2).increaseAllowance(farm1.address, depositAmount7);
      let tx2 = await farm1.connect(farmer2).depositCp(depositAmount7);
      await expect(tx2).to.emit(farm1, 'CpDeposited').withArgs(farmer2.address, depositAmount7);
      balancesAfter = await getBalances(farmer2, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount7);
      expect(balancesDiff.farmCp).to.equal(depositAmount7);
      expect(balancesDiff.userStake).to.equal(depositAmount7);
    });

    it('can deposit cp via permit', async function () {
      // farmer 1, deposit 111 cp
      let depositAmount8 = BN.from(111);
      balancesBefore = await getBalances(farmer1, farm1);
      await vault.connect(farmer1).deposit({ value: depositAmount8 });
      let nonce = await vault.nonces(farmer1.address);
      let approve = {
        owner: farmer1.address,
        spender: farm1.address,
        value: depositAmount8,
      };
      let digest = getPermitDigest(cpTokenName, vault.address, chainId, approve, nonce, deadline);
      let { v, r, s } = sign(digest, Buffer.from(farmer1.privateKey.slice(2), 'hex'));
      let tx1 = await farm1.connect(farmer2).depositCpSigned(farmer1.address, depositAmount8, deadline, v, r, s);
      await expect(tx1).to.emit(farm1, 'CpDeposited').withArgs(farmer1.address, depositAmount8);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.farmStake).to.equal(depositAmount8);
      expect(balancesDiff.farmCp).to.equal(depositAmount8);
      expect(balancesDiff.userStake).to.equal(depositAmount8);
    });

    it('cannot deposit cp when lacking funds', async function () {
      // no funds and no allowance
      await expect(farm1.connect(farmer1).depositCp(1)).to.be.reverted;
      // yes funds and no allowance
      await vault.connect(farmer1).deposit({ value: 1 });
      await expect(farm1.connect(farmer1).depositCp(1)).to.be.reverted;
      // no funds and yes allowance
      await vault.connect(farmer2).increaseAllowance(farm1.address, 1);
      await expect(farm1.connect(farmer2).depositCp(1)).to.be.reverted;
    });

    it("cannot withdraw another user's rewards", async function () {
      await expect(farm1.connect(farmer1).withdrawRewardsForUser(farmer2.address)).to.be.revertedWith('!master');
    });

    it('can withdraw rewards', async function () {
      await farm1.connect(farmer1).withdrawRewards(); // value checked in later tests
      await farm1.connect(farmer1).withdrawRewardsForUser(farmer1.address); // value checked in later tests
    });

    it('can withdraw eth', async function () {
      // farmer 1, partial withdraw
      let withdrawAmount1 = BN.from(99);
      balancesBefore = await getBalances(farmer1, farm1);
      let tx1 = await farm1.connect(farmer1).withdrawEth(withdrawAmount1, { gasLimit: 200000 }); // TODO: make gas more predictable?
      await expect(tx1).to.emit(farm1, 'EthWithdrawn').withArgs(farmer1.address, withdrawAmount1);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(tx1.gasPrice || 0);
      expect(balancesDiff.userEth).to.equal(withdrawAmount1.sub(gasCost));
      expect(balancesDiff.farmStake).to.equal(withdrawAmount1.mul(-1));
      expect(balancesDiff.farmCp).to.equal(withdrawAmount1.mul(-1));
      expect(balancesDiff.userStake).to.equal(withdrawAmount1.mul(-1));
    });

    it('can withdraw cp', async function () {
      // farmer 1, partial withdraw
      let withdrawAmount2 = BN.from(20);
      balancesBefore = await getBalances(farmer1, farm1);
      let tx1 = await farm1.connect(farmer1).withdrawCp(withdrawAmount2);
      await expect(tx1).to.emit(farm1, 'CpWithdrawn').withArgs(farmer1.address, withdrawAmount2);
      balancesAfter = await getBalances(farmer1, farm1);
      balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.userCp).to.equal(withdrawAmount2);
      expect(balancesDiff.farmStake).to.equal(withdrawAmount2.mul(-1));
      expect(balancesDiff.farmCp).to.equal(withdrawAmount2.mul(-1));
      expect(balancesDiff.userStake).to.equal(withdrawAmount2.mul(-1));
    });

    it('cannot overwithdraw', async function () {
      let withdrawAmount = (await farm1.userInfo(farmer1.address)).value.add(1);
      await expect(farm1.connect(farmer1).withdrawEth(withdrawAmount)).to.be.reverted;
      await expect(farm1.connect(farmer1).withdrawCp(withdrawAmount)).to.be.reverted;
    });
  });

  describe('updates', async function () {
    let farm2: CpFarm;
    let allocPoints = BN.from(0);

    before(async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(10);
      endBlock = blockNum.add(100);
      farm2 = await createCpFarm(startBlock, endBlock);
      //await master.connect(governor).registerFarm(farm2.address, allocPoints);
    });

    it('can update a single farm', async function () {
      // init
      expect(await farm2.lastRewardBlock()).to.equal(startBlock);
      // update before start
      await farm2.updateFarm();
      expect(await farm2.lastRewardBlock()).to.equal(startBlock);
      // update after start
      await burnBlocks(30);
      await farm2.updateFarm();
      blockNum = BN.from(await provider.getBlockNumber());
      expect(await farm2.lastRewardBlock()).to.equal(blockNum);
      // update after end
      await burnBlocks(90);
      await farm2.updateFarm();
      expect(await farm2.lastRewardBlock()).to.equal(endBlock);
    });

    it('can set end', async function () {
      await expect(farm2.connect(farmer1).setEnd(1)).to.be.revertedWith('!governance');
      let newEndBlock = endBlock.add(50);
      await farm2.connect(governor).setEnd(newEndBlock);
      blockNum = BN.from(await provider.getBlockNumber());
      expect(await farm2.lastRewardBlock()).to.equal(blockNum);
      expect(await farm2.endBlock()).to.equal(newEndBlock);
    });
  });

  describe('rewards', function () {
    let farmId: BN;
    let farm: CpFarm;
    let allocPoints = BN.from('1');
    // start with 1:4 ownership, switch to 1:19
    let depositAmount1 = BN.from('10');
    let depositAmount2 = BN.from('40');
    let depositAmount3 = BN.from('150');
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let expectedReward1: BN;
    let expectedReward2: BN;
    let receivedReward2: BN;

    beforeEach(async function () {
      await vault.connect(farmer1).transfer(governor.address, await vault.balanceOf(farmer1.address));
      await vault.connect(farmer2).transfer(governor.address, await vault.balanceOf(farmer2.address));
      await solaceToken.connect(farmer1).transfer(governor.address, await solaceToken.balanceOf(farmer1.address));
      await solaceToken.connect(farmer2).transfer(governor.address, await solaceToken.balanceOf(farmer2.address));
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(200);
      farm = await createCpFarm(startBlock, endBlock);
      await master.connect(governor).registerFarm(farm.address, allocPoints);
      farmId = await master.numFarms();
    });

    afterEach(async function () {
      await master.connect(governor).setAllocPoints(farmId, 0); // remember to deallocate dead farms
      expect(await master.totalAllocPoints()).to.equal(0);
    });

    it('provides rewards to only farmer', async function () {
      let waitBlocks = BN.from('10');
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      expect(await solaceToken.balanceOf(farmer1.address)).to.equal(0);
      await burnBlocksUntil(startBlock.add(waitBlocks));
      // potential withdraw
      pendingReward1 = await farm.pendingRewards(farmer1.address);
      expectedReward1 = solacePerBlock.mul(waitBlocks);
      expectClose(pendingReward1, expectedReward1);
      // actual withdraw
      await farm.connect(farmer1).withdrawEth(depositAmount1);
      pendingReward1 = await solaceToken.balanceOf(farmer1.address);
      expectedReward1 = solacePerBlock.mul(waitBlocks.add(1));
      expectClose(pendingReward1, expectedReward1);
    });

    it('fairly provides rewards to all farmers', async function () {
      let waitBlocks1 = BN.from('10');
      let waitBlocks2 = BN.from('20');
      let waitBlocks3 = BN.from('30');
      let waitBlocks4 = BN.from('40');
      let waitBlocks5 = BN.from('50');
      // only farmer 1
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      await burnBlocksUntil(startBlock.add(waitBlocks1));
      // add farmer 2
      await farm.connect(farmer2).depositEth({ value: depositAmount2 });
      await burnBlocks(waitBlocks2);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await farm.pendingRewards(farmer1.address));
      expectedReward1 = solacePerBlock.mul(11).mul(1).add(
        // 100% ownership for 11 blocks
        solacePerBlock.mul(20).mul(1).div(5)
      ); // 20% ownership for 20 blocks
      expectClose(pendingReward1, expectedReward1);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await farm.pendingRewards(farmer2.address));
      expectedReward2 = solacePerBlock.mul(20).mul(4).div(5); // 80% ownership for 20 blocks
      expectClose(pendingReward2, expectedReward2);
      // farmer 2 deposit more
      await farm.connect(farmer2).depositEth({ value: depositAmount3 });
      await burnBlocks(waitBlocks3);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await farm.pendingRewards(farmer1.address));
      expectedReward1 = expectedReward1.add(
        solacePerBlock.mul(1).mul(1).div(5).add(
          // 20% ownership for 1 blocks
          solacePerBlock.mul(30).mul(1).div(20)
        ) // 5% ownership for 30 blocks
      );
      expectClose(pendingReward1, expectedReward1);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await farm.pendingRewards(farmer2.address));
      receivedReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        solacePerBlock.mul(1).mul(4).div(5).add(
          // 80% ownership for 1 blocks
          solacePerBlock.mul(30).mul(19).div(20)
        ) // 95% ownership for 30 blocks
      );
      expectClose(pendingReward2.add(receivedReward2), expectedReward2);

      // farmer 1 withdraw rewards
      await farm.connect(farmer1).withdrawRewards();
      expect(await vault.balanceOf(farmer1.address)).to.equal(0);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        solacePerBlock.mul(1).mul(1).div(20) // 5% ownership for 1 blocks
      );
      expectClose(pendingReward1, expectedReward1);
      // farmer 2 withdraw rewards
      await farm.connect(farmer2).withdrawRewards();
      expect(await vault.balanceOf(farmer2.address)).to.equal(0);
      pendingReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        solacePerBlock.mul(2).mul(19).div(20) // 95% ownership for 2 blocks
      );
      expectClose(pendingReward2, expectedReward2);
      await burnBlocks(waitBlocks4);

      // farmer 1 withdraw stake
      await farm.connect(farmer1).withdrawEth(depositAmount1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        solacePerBlock.mul(42).mul(1).div(20) // 5% ownership for 42 blocks
      );
      expectClose(pendingReward1, expectedReward1);
      await burnBlocks(waitBlocks5);
      // farmer 2 withdraw stake
      await farm.connect(farmer2).withdrawEth(depositAmount2.add(depositAmount3));
      pendingReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        solacePerBlock.mul(41).mul(19).div(20).add(
          // 95% ownership for 41 blocks
          solacePerBlock.mul(51)
        ) // 100% ownership for 51 blocks
      );
      expectClose(pendingReward2, expectedReward2);
    });

    it('does not distribute rewards before farm start', async function () {
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      await burnBlocksUntil(startBlock);
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
    });

    it('does not distribute rewards after farm end', async function () {
      await farm.connect(farmer1).depositEth({ value: depositAmount1 });
      await burnBlocksUntil(endBlock);
      let pendingReward1 = await farm.pendingRewards(farmer1.address);
      await burnBlocks(BN.from(10));
      let pendingReward2 = await farm.pendingRewards(farmer1.address);
      expectClose(pendingReward2, pendingReward1);
    });
  });

  describe('safe rewards', function () {
    let farm3: CpFarm;

    before(async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(30);
      farm3 = await createCpFarm(startBlock, endBlock);
      await master.connect(governor).registerFarm(farm3.address, 100);
      // increase solace distribution
      await master.connect(governor).setSolacePerBlock(await solaceToken.balanceOf(master.address));
      // deposit tokens
      await farm3.connect(farmer1).depositEth({ value: 1 });
      await burnBlocksUntil(endBlock);
    });

    it('tracks unpaid rewards', async function () {
      expect((await farm3.userInfo(farmer1.address)).unpaidRewards).to.equal(0);
      let pendingReward1 = await farm3.pendingRewards(farmer1.address);
      let masterBalance = await solaceToken.balanceOf(master.address);
      expect(pendingReward1).to.be.gt(masterBalance);
      let farmerBalanceBefore = await solaceToken.balanceOf(farmer1.address);
      await farm3.connect(farmer1).withdrawRewards();
      let farmerBalanceAfter = await solaceToken.balanceOf(farmer1.address);
      expect(farmerBalanceAfter.sub(farmerBalanceBefore)).to.equal(masterBalance);
      expect(await solaceToken.balanceOf(master.address)).to.equal(0);
      let expectedUnpaid = pendingReward1.sub(masterBalance);
      expect((await farm3.userInfo(farmer1.address)).unpaidRewards).to.equal(expectedUnpaid);
      let pendingReward2 = await farm3.pendingRewards(farmer1.address);
      expect(pendingReward2).to.equal(expectedUnpaid);
    });

    it('pays when funds are available', async function () {
      let unpaidRewards = (await farm3.userInfo(farmer1.address)).unpaidRewards;
      await solaceToken.connect(governor).mint(master.address, unpaidRewards);
      let farmerBalanceBefore = await solaceToken.balanceOf(farmer1.address);
      await farm3.connect(farmer1).withdrawRewards();
      let farmerBalanceAfter = await solaceToken.balanceOf(farmer1.address);
      expect(farmerBalanceAfter.sub(farmerBalanceBefore)).to.equal(unpaidRewards);
      expect((await farm3.userInfo(farmer1.address)).unpaidRewards).to.equal(0);
      expect(await farm3.pendingRewards(farmer1.address)).to.equal(0);
    });
  });

  describe('edge cases', function () {
    let farm4: CpFarm;
    let depositAmount: BN;

    before(async function () {
      farm4 = await createCpFarm(0, 1000, mockVault.address);
      depositAmount = BN.from(100);
    });

    it('can receive eth from vault via receive()', async function () {
      let balancesBefore = await getBalances(mockVault, farm4);
      let tx = await mockVault.sendTransaction({
        to: farm4.address,
        value: depositAmount,
        data: '0x',
      });
      let balancesAfter = await getBalances(mockVault, farm4);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(tx.gasPrice || 0);
      expect(balancesDiff.userEth).to.equal(depositAmount.mul(-1).sub(gasCost));
      expect(balancesDiff.userStake).to.equal(0); // vault gains no stake
    });

    it('can receive eth from vault via fallback()', async function () {
      let balancesBefore = await getBalances(mockVault, farm4);
      let tx = await mockVault.sendTransaction({
        to: farm4.address,
        value: depositAmount,
        data: '0xabcd',
      });
      let balancesAfter = await getBalances(mockVault, farm4);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(tx.gasPrice || 0);
      expect(balancesDiff.userEth).to.equal(depositAmount.mul(-1).sub(gasCost));
      expect(balancesDiff.userStake).to.equal(0); // vault gains no stake
    });

    it('rejects setRewards by non master', async function () {
      await expect(farm4.connect(governor).setRewards(ONE_MILLION_ETHER)).to.be.revertedWith('!master');
      await expect(farm4.connect(farmer1).setRewards(ONE_MILLION_ETHER)).to.be.revertedWith('!master');
    });

    it('can get multiplier', async function () {
      await master.connect(governor).registerFarm(farm4.address, 1);
      let blockReward = await farm4.blockReward();
      expect(await farm4.getMultiplier(20, 30)).to.equal(blockReward.mul(10));
      expect(await farm4.getMultiplier(30, 20)).to.equal(0);
    });
  });

  describe('compound rewards', function () {
    let farm4: CpFarm;

    before(async function () {
      // deactivate all previous farms
      let numFarms = (await master.numFarms()).toNumber();
      for (var farmNum = 1; farmNum <= numFarms; ++farmNum) {
        await master.connect(governor).setAllocPoints(farmNum, 0);
      }
      await master.connect(governor).setSolacePerBlock(solacePerBlock);
      await solaceToken.connect(governor).mint(master.address, ONE_MILLION_ETHER);
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(30);
      farm4 = await createCpFarm(startBlock, endBlock);
      await master.connect(governor).registerFarm(farm4.address, 100);
    });

    it('does nothing if no rewards to compound', async function () {
      let balancesBefore = await getBalances(farmer1, farm4);
      await expect(await farm4.connect(farmer1).compoundRewards())
        .to.not.emit(farm4, 'RewardsCompounded')
        .withArgs(farmer1.address);
      let balancesAfter = await getBalances(farmer1, farm4);
      expect(balancesAfter.userStake).to.equal(0);
      expect(balancesAfter.masterSolace).to.equal(balancesBefore.masterSolace);
    });

    it('users can compound rewards', async function () {
      let waitBlocks = BN.from('10');
      let depositAmount = BN.from('20');
      await farm4.connect(farmer1).depositEth({ value: depositAmount });
      await burnBlocksUntil(startBlock.add(waitBlocks));
      let balancesBefore = await getBalances(farmer1, farm4);
      await expect(await farm4.connect(farmer1).compoundRewards())
        .to.emit(farm4, 'RewardsCompounded')
        .withArgs(farmer1.address);
      let balancesAfter = await getBalances(farmer1, farm4);
      expect(balancesAfter.userStake).to.be.gt(balancesBefore.userStake);
      expect(balancesAfter.masterSolace).to.be.lt(balancesBefore.masterSolace);
    });
  });

  // helper functions

  async function createCpFarm(startBlock: BigNumberish = BN.from(0), endBlock: BigNumberish = BN.from(0), vaultAddress: string = vault.address) {
    let farm = (await deployContract(deployer, artifacts.CpFarm, [
      governor.address,
      master.address,
      vaultAddress,
      solaceToken.address,
      startBlock,
      endBlock,
      uniswapRouter.address,
      weth.address,
    ])) as CpFarm;
    return farm;
  }

  interface Balances {
    userEth: BN;
    userCp: BN;
    userStake: BN;
    userPendingRewards: BN;
    farmCp: BN;
    farmStake: BN;
    masterSolace: BN;
  }

  async function getBalances(user: Wallet, farm: CpFarm): Promise<Balances> {
    return {
      userEth: await user.getBalance(),
      userCp: await vault.balanceOf(user.address),
      userStake: (await farm.userInfo(user.address)).value,
      userPendingRewards: await farm.pendingRewards(user.address),
      farmCp: await vault.balanceOf(farm.address),
      farmStake: await farm.valueStaked(),
      masterSolace: await solaceToken.balanceOf(master.address),
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userEth: balances1.userEth.sub(balances2.userEth),
      userCp: balances1.userCp.sub(balances2.userCp),
      userStake: balances1.userStake.sub(balances2.userStake),
      userPendingRewards: balances1.userPendingRewards.sub(balances2.userPendingRewards),
      farmCp: balances1.farmCp.sub(balances2.farmCp),
      farmStake: balances1.farmStake.sub(balances2.farmStake),
      masterSolace: balances1.masterSolace.sub(balances2.masterSolace),
    };
  }

  // uniswap requires tokens to be in order
  function sortTokens(tokenA: string, tokenB: string) {
    return BN.from(tokenA).lt(BN.from(tokenB)) ? [tokenA, tokenB] : [tokenB, tokenA];
  }

  // creates, initializes, and returns a pool
  async function createPool(tokenA: Contract, tokenB: Contract, fee: FeeAmount) {
    let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
    let pool;
    let tx = await uniswapFactory.createPool(token0, token1, fee);
    let events = (await tx.wait()).events;
    expect(events && events.length > 0 && events[0].args && events[0].args.pool);
    if (events && events.length > 0 && events[0].args && events[0].args.pool) {
      let poolAddress = events[0].args.pool;
      pool = new Contract(poolAddress, artifacts.UniswapV3Pool.abi) as Contract;
    } else {
      pool = new Contract(ZERO_ADDRESS, artifacts.UniswapV3Pool.abi) as Contract;
      expect(true).to.equal(false);
    }
    expect(pool).to.exist;
    if (pool) {
      let sqrtPrice = encodePriceSqrt(1, 1);
      await pool.connect(governor).initialize(sqrtPrice);
    }
    return pool;
  }

  // adds liquidity to a pool
  async function addLiquidity(liquidityProvider: Wallet, tokenA: Contract, tokenB: Contract, fee: FeeAmount, amount: BigNumberish) {
    await tokenA.connect(liquidityProvider).approve(uniswapPositionManager.address, amount);
    await tokenB.connect(liquidityProvider).approve(uniswapPositionManager.address, amount);
    let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
    await uniswapPositionManager.connect(liquidityProvider).mint({
      token0: token0,
      token1: token1,
      tickLower: getMinTick(TICK_SPACINGS[fee]),
      tickUpper: getMaxTick(TICK_SPACINGS[fee]),
      fee: fee,
      recipient: liquidityProvider.address,
      amount0Desired: amount,
      amount1Desired: amount,
      amount0Min: 0,
      amount1Min: 0,
      deadline: constants.MaxUint256,
    });
  }
});
