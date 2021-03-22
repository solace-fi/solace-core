import { waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN } from "ethers";
import chai from "chai";
const { expect } = chai;

import { burnBlocks, burnBlocksUntil } from "./utilities/time";

import SolaceArtifact from '../artifacts/contracts/SOLACE.sol/SOLACE.json';
import MasterArtifact from '../artifacts/contracts/Master.sol/Master.json';
import MockTokenArtifact from '../artifacts/contracts/mocks/MockToken.sol/MockToken.json';
import { Solace, Master, MockToken } from "../typechain";

chai.use(solidity);

// TODO: due to integer rounding errors, some math may be off by one
// need to test within a threshold of acceptance

describe("Master", function () {
  // users
  // @ts-ignore
  let governor: SignerWithAddress;
  // @ts-ignore
  let farmer1: SignerWithAddress;
  // @ts-ignore
  let farmer2: SignerWithAddress;
  // @ts-ignore
  let farmer3: SignerWithAddress;
  // @ts-ignore
  let farmer4: SignerWithAddress;

  // contracts
  let solaceToken: Solace;
  let master: Master;
  let lpToken: MockToken;
  let cpToken: MockToken;

  // vars
  let solacePerBlock: BN = BN.from("100000000000000000000"); // 100 e18
  let solacePerBlock2: BN = BN.from("200000000000000000000"); // 200 e18
  let farmId: BN;
  let blockNum: BN;
  let startBlock: BN;
  let endBlock: BN;

  before(async function () {
    [governor, farmer1, farmer2, farmer3, farmer4] = provider.getWallets();

    // deploy solace token
    solaceToken = (await deployContract(
      governor,
      SolaceArtifact
    )) as Solace;

    // deploy master contract
    master = (await deployContract(
      governor,
      MasterArtifact,
      [
        solaceToken.address,
        solacePerBlock
      ]
    )) as Master;

    // deploy mock lp token
    lpToken = (await deployContract(
      governor,
      MockTokenArtifact,
      [
        "Mock LP Token",
        "LPT",
        "1000000" // 1M
      ]
    )) as MockToken;

    // deploy mock cp token
    cpToken = (await deployContract(
      governor,
      MockTokenArtifact,
      [
        "Mock CP Token",
        "CPT",
        "1000000" // 1M
      ]
    )) as MockToken;

    // transfer solace token to master contract
    await solaceToken.addMinter(governor.address);
    await solaceToken.mint(master.address, "100000000000000000000000"); // 100K e18
  })

  describe("farm creation", function () {
    it("can create farms", async function () {
      let transaction1: Transaction;
      let transaction2: Transaction;
      // no farms
      expect(await master.farmLength()).to.equal(0);
      // create first farm
      transaction1 = await master.createFarm(cpToken.address, 0, 1, 2);
      expect(transaction1).to.emit(master, "FarmCreated").withArgs(0);
      expect(await master.farmLength()).to.equal(1);
      // create second farm
      transaction2 = await master.createFarm(lpToken.address, 0, 1, 2);
      expect(transaction2).to.emit(master, "FarmCreated").withArgs(1);
      expect(await master.farmLength()).to.equal(2);
    })

    it("rejects farm creation by non governor", async function () {
      await expect(master.connect(farmer1).createFarm(lpToken.address, 0, 1, 2)).to.be.revertedWith("!governance");
    })

    it("returns farm information", async function () {
      let farmInfo: any;
      farmInfo = await master.farmInfo(0);
      expect(farmInfo.token).to.equal(cpToken.address);
      expect(farmInfo.tokensStaked).to.equal(0);
      expect(farmInfo.allocPoints).to.equal(0);
      expect(farmInfo.startBlock).to.equal(1);
      expect(farmInfo.endBlock).to.equal(2);
    })
  })

  describe("deposit and withdraw", function () {
    let farmInfo: any;
    let userInfo: any;
    farmId = BN.from(0);

    it("can deposit", async function () {
      let transaction1: Transaction;
      let transaction2: Transaction;
      let transaction3: Transaction;
      // farmer 1, deposit 1
      await cpToken.transfer(farmer1.address, 3);
      await cpToken.connect(farmer1).increaseAllowance(master.address, 1);
      transaction1 = await master.connect(farmer1).deposit(farmId, 1);
      expect(transaction1).to.emit(master, "Deposit").withArgs(farmer1.address, farmId, 1);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(1);
      expect(await cpToken.balanceOf(master.address)).to.equal(1);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.amount).to.equal(1);
      // farmer 2, deposit 4
      await cpToken.transfer(farmer2.address, 4);
      await cpToken.connect(farmer2).increaseAllowance(master.address, 4);
      transaction2 = await master.connect(farmer2).deposit(farmId, 4);
      expect(transaction2).to.emit(master, "Deposit").withArgs(farmer2.address, farmId, 4);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(5);
      expect(await cpToken.balanceOf(master.address)).to.equal(5);
      userInfo = await master.userInfo(farmId, farmer2.address);
      expect(userInfo.amount).to.equal(4);
      // farmer 1, deposit 2
      await cpToken.connect(farmer1).increaseAllowance(master.address, 2);
      transaction3 = await master.connect(farmer1).deposit(farmId, 2);
      expect(transaction3).to.emit(master, "Deposit").withArgs(farmer1.address, farmId, 2);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(7);
      expect(await cpToken.balanceOf(master.address)).to.equal(7);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.amount).to.equal(3);
    })

    it("cannot deposit when lacking funds", async function () {
      // no funds and no allowance
      await expect(master.connect(farmer1).deposit(farmId, 1)).to.be.reverted;
      // yes funds and no allowance
      await cpToken.transfer(farmer1.address, 1);
      await expect(master.connect(farmer1).deposit(farmId, 1)).to.be.reverted;
      // no funds and yes allowance
      await cpToken.connect(farmer2).increaseAllowance(master.address, 1);
      await expect(master.connect(farmer2).deposit(farmId, 1)).to.be.reverted;
    })

    it("cannot deposit onto a non existant farm", async function () {
      await expect(master.connect(farmer1).deposit(await master.farmLength(), 1)).to.be.revertedWith("farm does not exist");
    })

    it("can withdraw", async function () {
      let transaction1: Transaction;
      let transaction2: Transaction;
      let transaction3: Transaction;
      let balance1: BN;
      let balance2: BN;
      let staked1: BN;
      let staked2: BN;
      // farmer 1, partial withdraw
      balance1 = await cpToken.balanceOf(master.address);
      staked1 = (await master.farmInfo(farmId)).tokensStaked;
      transaction1 = await master.connect(farmer1).withdraw(farmId, 1);
      expect(transaction1).to.emit(master, "Withdraw").withArgs(farmer1.address, farmId, 1);
      balance2 = await cpToken.balanceOf(master.address);
      expect(balance1.sub(balance2)).to.equal(1);
      staked2 = (await master.farmInfo(farmId)).tokensStaked;
      expect(staked1.sub(staked2)).to.equal(1);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.amount).to.equal(2);
      // farmer 1, full withdraw
      balance1 = await cpToken.balanceOf(master.address);
      staked1 = (await master.farmInfo(farmId)).tokensStaked;
      transaction2 = await master.connect(farmer1).withdraw(farmId, 2);
      expect(transaction2).to.emit(master, "Withdraw").withArgs(farmer1.address, farmId, 2);
      balance2 = await cpToken.balanceOf(master.address);
      expect(balance1.sub(balance2)).to.equal(2);
      staked2 = (await master.farmInfo(farmId)).tokensStaked;
      expect(staked1.sub(staked2)).to.equal(2);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.amount).to.equal(0);
      // farmer 2, full withdraw
      balance1 = await cpToken.balanceOf(master.address);
      transaction3 = await master.connect(farmer2).withdraw(farmId, 4);
      expect(transaction3).to.emit(master, "Withdraw").withArgs(farmer2.address, farmId, 4);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(0);
      balance2 = await cpToken.balanceOf(master.address);
      expect(balance1.sub(balance2)).to.equal(4);
      userInfo = await master.userInfo(farmId, farmer2.address);
      expect(userInfo.amount).to.equal(0);
    })

    it("cannot overwithdraw", async function () {
      // withdraw without deposit
      await expect(master.connect(farmer1).withdraw(farmId, 1)).to.be.reverted;
      // withdraw more than deposit
      await cpToken.transfer(farmer1.address, 3);
      await cpToken.connect(farmer1).increaseAllowance(master.address, 3);
      await master.connect(farmer1).deposit(farmId, 3);
      await expect(master.connect(farmer1).withdraw(farmId, 4)).to.be.reverted;
    })

    it("cannot withdraw from a non existant farm", async function () {
      await expect(master.connect(farmer1).withdraw(await master.farmLength(), 1)).to.be.revertedWith("farm does not exist");
    })
  })

  describe("single farm rewards", function () {
    let farmId: BN;
    let allocPoints: BN = BN.from("1");
    // start with 1:4 ownership, switch to 1:19
    let depositAmount1: BN = BN.from("10");
    let depositAmount2: BN = BN.from("40");
    let depositAmount3: BN = BN.from("150");
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let expectedReward1: BN;
    let expectedReward2: BN;
    let receivedReward2: BN;

    beforeEach(async function () {
      await lpToken.connect(farmer1).transfer(governor.address, await lpToken.balanceOf(farmer1.address));
      await lpToken.connect(farmer2).transfer(governor.address, await lpToken.balanceOf(farmer2.address));
      await solaceToken.connect(farmer1).transfer(governor.address, await solaceToken.balanceOf(farmer1.address));
      await solaceToken.connect(farmer2).transfer(governor.address, await solaceToken.balanceOf(farmer2.address));
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(1020);
      await master.createFarm(lpToken.address, allocPoints, startBlock, endBlock);
      farmId = (await master.farmLength()).sub(1);
      await lpToken.transfer(farmer1.address, depositAmount1);
      await lpToken.transfer(farmer2.address, depositAmount2.add(depositAmount3));
      await lpToken.connect(farmer1).increaseAllowance(master.address, depositAmount1);
      await lpToken.connect(farmer2).increaseAllowance(master.address, depositAmount2.add(depositAmount3));
    })

    afterEach(async function () {
      await master.setFarmParams(farmId, 0, 0, false); // remember to deallocate dead farms
      expect(await master.totalAllocPoints()).to.equal(0);
    })

    it("provides rewards to only farmer", async function () {
      let waitBlocks: BN = BN.from("10");
      await master.connect(farmer1).deposit(farmId, depositAmount1);
      await burnBlocksUntil(startBlock.add(waitBlocks));
      // potential withdraw
      pendingReward1 = BN.from(await master.pendingReward(farmId, farmer1.address));
      expectedReward1 = solacePerBlock.mul(waitBlocks);
      expect(pendingReward1).to.equal(expectedReward1);
      // actual withdraw
      await master.connect(farmer1).withdraw(farmId, depositAmount1);
      expect(await lpToken.balanceOf(farmer1.address)).to.equal(depositAmount1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = solacePerBlock.mul(waitBlocks.add(1));
      expect(pendingReward1).to.equal(expectedReward1);
    })

    it("fairly provides rewards to all farmers", async function () {
      let waitBlocks1: BN = BN.from("10");
      let waitBlocks2: BN = BN.from("20");
      let waitBlocks3: BN = BN.from("30");
      // only farmer 1
      await master.connect(farmer1).deposit(farmId, depositAmount1);
      await burnBlocksUntil(startBlock.add(waitBlocks1));
      // add farmer 2
      await master.connect(farmer2).deposit(farmId, depositAmount2);
      await burnBlocks(waitBlocks2);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await master.pendingReward(farmId, farmer1.address));
      expectedReward1 = (
        (solacePerBlock.mul(11).mul(1)).add // 100% ownership for 11 blocks
        (solacePerBlock.mul(20).mul(1).div(5)) // 20% ownership for 20 blocks
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(farmId, farmer2.address));
      expectedReward2 = solacePerBlock.mul(20).mul(4).div(5); // 80% ownership for 20 blocks
      expect(pendingReward2).to.equal(expectedReward2);
      // farmer 2 deposit more
      await master.connect(farmer2).deposit(farmId, depositAmount3);
      await burnBlocks(waitBlocks3);
      // check farmer 1 rewards
      pendingReward1 = BN.from(await master.pendingReward(farmId, farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(1).div(5)).add // 20% ownership for 1 blocks
        (solacePerBlock.mul(30).mul(1).div(20)) // 5% ownership for 30 blocks
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(farmId, farmer2.address));
      receivedReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock.mul(1).mul(4).div(5)).add // 80% ownership for 1 blocks
        (solacePerBlock.mul(30).mul(19).div(20)) // 95% ownership for 30 blocks
      );
      expect(pendingReward2.add(receivedReward2)).to.equal(expectedReward2);
      // farmer 1 withdraw
      await master.connect(farmer1).withdraw(farmId, depositAmount1);
      expect(await lpToken.balanceOf(farmer1.address)).to.equal(depositAmount1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(1).div(20)) // 5% ownership for 1 blocks
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // farmer 2 withdraw
      await master.connect(farmer2).withdraw(farmId, depositAmount2.add(depositAmount3));
      expect(await lpToken.balanceOf(farmer2.address)).to.equal(depositAmount2.add(depositAmount3));
      pendingReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock.mul(1).mul(19).div(20)).add // 95% ownership for 1 blocks
        (solacePerBlock) // 100% ownership for 1 block
        .sub(1) // off by one error
      );
      expect(pendingReward2).to.equal(expectedReward2);
    })

    it("does not distribute rewards before farm start", async function () {
      await master.connect(farmer1).deposit(farmId, depositAmount1);
      await burnBlocksUntil(startBlock);
      expect(await master.pendingReward(farmId, farmer1.address)).to.equal(0);
    })

    it("does not distribute rewards after farm end", async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(5);
      endBlock = blockNum.add(10);
      await master.createFarm(lpToken.address, allocPoints, startBlock, endBlock);
      let farmId2: BN = (await master.farmLength()).sub(1);
      await master.connect(farmer1).deposit(farmId2, depositAmount1);
      await burnBlocksUntil(endBlock);
      let pendingReward1 = await master.pendingReward(farmId2, farmer1.address);
      await burnBlocks(BN.from(10));
      let pendingReward2 = await master.pendingReward(farmId2, farmer1.address);
      expect(pendingReward2).to.equal(pendingReward1);
      await master.setFarmParams(farmId2, 0, 0, false);
    })
  })

  describe("multiple farm rewards", function () {
    // cp and lp farms
    let cpFarmId: BN;
    let lpFarmId: BN;
    // start with 4:1 alloc, switch to 9:1
    let cpAllocPoints1: BN = BN.from("20");
    let cpAllocPoints2: BN = BN.from("45");
    let lpAllocPoints: BN = BN.from("5");
    // 1:4 ownership on cp farm
    let depositAmount1: BN = BN.from("10");
    let depositAmount2: BN = BN.from("40");
    // 13:7 ownership on lp farm
    let depositAmount3: BN = BN.from("130");
    let depositAmount4: BN = BN.from("70");
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let pendingReward3: BN;
    let pendingReward4: BN;
    let expectedReward1: BN;
    let expectedReward2: BN;
    let expectedReward3: BN;
    let expectedReward4: BN;
    // block counters
    let endBlock: BN;
    let burnedBlocks: BN;

    before(async function () {
      await cpToken.connect(farmer1).transfer(governor.address, await cpToken.balanceOf(farmer1.address));
      await cpToken.connect(farmer2).transfer(governor.address, await cpToken.balanceOf(farmer2.address));
      await lpToken.connect(farmer1).transfer(governor.address, await lpToken.balanceOf(farmer1.address));
      await lpToken.connect(farmer2).transfer(governor.address, await lpToken.balanceOf(farmer2.address));
      await solaceToken.connect(farmer1).transfer(governor.address, await solaceToken.balanceOf(farmer1.address));
      await solaceToken.connect(farmer2).transfer(governor.address, await solaceToken.balanceOf(farmer2.address));
    })

    it("creates multiple farms", async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      // farms start and end at different times, math should still work
      await master.createFarm(cpToken.address, cpAllocPoints1, blockNum.add(25), blockNum.add(500));
      cpFarmId = (await master.farmLength()).sub(1);
      await master.createFarm(lpToken.address, lpAllocPoints, blockNum.add(45), blockNum.add(250));
      lpFarmId = (await master.farmLength()).sub(1);
      await cpToken.transfer(farmer1.address, depositAmount1);
      await cpToken.transfer(farmer2.address, depositAmount2);
      await lpToken.transfer(farmer3.address, depositAmount3);
      await lpToken.transfer(farmer4.address, depositAmount4);
      await cpToken.connect(farmer1).increaseAllowance(master.address, depositAmount1);
      await cpToken.connect(farmer2).increaseAllowance(master.address, depositAmount2);
      await lpToken.connect(farmer3).increaseAllowance(master.address, depositAmount3);
      await lpToken.connect(farmer4).increaseAllowance(master.address, depositAmount4);
      await burnBlocksUntil(blockNum.add(25), false);
      await master.massUpdateFarms();
    })

    it("fairly provides rewards to all farmers on all farms", async function () {
      // add farmer 1 to cp farm
      await master.connect(farmer1).deposit(cpFarmId, depositAmount1);
      // wait 10 blocks
      await burnBlocks(BN.from(10));
      // add farmer 3 to lp farm
      await master.connect(farmer3).deposit(lpFarmId, depositAmount3);
      // wait 19 blocks
      await burnBlocks(BN.from(20));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await master.pendingReward(cpFarmId, farmer1.address));
      expectedReward1 = solacePerBlock.mul(31).mul(4).div(5); // 100% ownership of cp farm for 31 blocks at 80% allocation points
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await master.pendingReward(lpFarmId, farmer3.address));
      expectedReward3 = solacePerBlock.mul(13).mul(1).div(5); // 100% ownership of lp farm for 13 blocks at 20% allocation points
      expect(pendingReward3).to.equal(expectedReward3);
      // add farmer 2 to cp farm
      await master.connect(farmer2).deposit(cpFarmId, depositAmount2);
      // wait 30 blocks
      await burnBlocks(BN.from(30));
      // add farmer 4 to lp farm
      await master.connect(farmer4).deposit(lpFarmId, depositAmount4);
      // wait 40 blocks
      await burnBlocks(BN.from(40));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await master.pendingReward(cpFarmId, farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(4).div(5)).add // 100% ownership of cp farm for 1 block at 80% allocation points
        (solacePerBlock.mul(71).mul(4).div(5).div(5)) // 20% ownership of cp farm for 71 blocks at 80% allocation points
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(cpFarmId, farmer2.address));
      expectedReward2 = solacePerBlock.mul(71).mul(16).div(25); // 80% ownership of cp farm for 71 blocks at 80% allocation points
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await master.pendingReward(lpFarmId, farmer3.address));
      expectedReward3 = expectedReward3.add(
        (solacePerBlock.mul(32).mul(1).div(5)).add // 100% ownership of lp farm for 32 blocks at 20% allocation points
        (solacePerBlock.mul(40).mul(65).div(100).div(5)) // 65% ownership of lp farm for 40 blocks at 20% allocation points
        .sub(1) // off by one error
      );
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await master.pendingReward(lpFarmId, farmer4.address));
      expectedReward4 = solacePerBlock.mul(40).mul(35).div(100).div(5); // 35% ownership of lp farm for 40 blocks at 20% allocation points
      expect(pendingReward4).to.equal(expectedReward4);
    })

    it("can change allocation points of farms", async function () {
      await expect(master.connect(farmer1).setFarmParams(cpFarmId, cpAllocPoints2, blockNum.add(500), true)).to.be.revertedWith("!governance");
      await master.setFarmParams(cpFarmId, cpAllocPoints2, blockNum.add(500), true);
      // wait 50 blocks
      await burnBlocks(BN.from(50));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await master.pendingReward(cpFarmId, farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(4).div(5).div(5)).add // 20% ownership of cp farm for 1 block at 80% allocation points
        (solacePerBlock.mul(50).mul(9).div(10).div(5)) // 20% ownership of cp farm for 50 blocks at 90% allocation points
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(cpFarmId, farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock.mul(1).mul(4).div(5).mul(4).div(5)).add // 80% ownership of cp farm for 1 block at 80% allocation points
        (solacePerBlock.mul(50).mul(4).div(5).mul(9).div(10)) // 80% ownership of cp farm for 50 blocks at 90% allocation points
      );
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await master.pendingReward(lpFarmId, farmer3.address));
      expectedReward3 = expectedReward3.add(
        (solacePerBlock.mul(1).mul(65).div(100).div(5)).add // 65% ownership of lp farm for 1 block at 20% allocation points
        (solacePerBlock.mul(50).mul(65).div(100).div(10)) // 65% ownership of lp farm for 50 blocks at 10% allocation points
      );
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await master.pendingReward(lpFarmId, farmer4.address));
      expectedReward4 = expectedReward4.add(
        (solacePerBlock.mul(1).mul(35).div(100).div(5)).add // 35% ownership of lp farm for 1 block at 20% allocation points
        (solacePerBlock.mul(50).mul(35).div(100).div(10)) // 35% ownership of lp farm for 50 blocks at 10% allocation points
      );
      expect(pendingReward4).to.equal(expectedReward4);
    })

    it("can change solace per block", async function () {
      await expect(master.connect(farmer1).setSolacePerBlock(1, true)).to.be.revertedWith("!governance");
      await master.setSolacePerBlock(solacePerBlock2, true);
      await burnBlocks(10);
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await master.pendingReward(cpFarmId, farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(9).div(10).div(5)).add // 20% ownership of cp farm for 1 block at 90% allocation points
        (solacePerBlock2.mul(10).mul(9).div(10).div(5)) // 20% ownership of cp farm for 10 blocks at 90% allocation points with new reward rate
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(cpFarmId, farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock.mul(1).mul(4).div(5).mul(9).div(10)).add // 80% ownership of cp farm for 1 block at 90% allocation points
        (solacePerBlock2.mul(10).mul(4).div(5).mul(9).div(10)) // 80% ownership of cp farm for 10 blocks at 90% allocation points with new reward rate
      );
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await master.pendingReward(lpFarmId, farmer3.address));
      expectedReward3 = expectedReward3.add(
        (solacePerBlock.mul(1).mul(65).div(100).div(10)).add // 65% ownership of lp farm for 1 block at 10% allocation points
        (solacePerBlock2.mul(10).mul(65).div(100).div(10)) // 65% ownership of lp farm for 10 blocks at 10% allocation points with new reward rate
      );
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await master.pendingReward(lpFarmId, farmer4.address));
      expectedReward4 = expectedReward4.add(
        (solacePerBlock.mul(1).mul(35).div(100).div(10)).add // 35% ownership of lp farm for 1 block at 10% allocation points
        (solacePerBlock2.mul(10).mul(35).div(100).div(10)) // 35% ownership of lp farm for 50 blocks at 10% allocation points with new reward rate
      );
      expect(pendingReward4).to.equal(expectedReward4);
    })

    it("can extend farms", async function () {
      endBlock = blockNum.add(300);
      await expect(master.connect(farmer1).setFarmParams(lpFarmId, lpAllocPoints, endBlock, true)).to.be.revertedWith("!governance");
      await master.setFarmParams(lpFarmId, lpAllocPoints, endBlock, true);
    })

    it("ends farms properly", async function () {
      burnedBlocks = await burnBlocksUntil(endBlock);
      // governance manually sets alloc to zero
      await master.setFarmParams(lpFarmId, 0, endBlock, true);
      // wait 60 blocks
      await burnBlocks(BN.from(60));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await master.pendingReward(cpFarmId, farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock2.mul(burnedBlocks.add(2)).mul(9).div(10).div(5)).add // 20% ownership of cp farm for unknown blocks at 90% allocation points
        (solacePerBlock2.mul(60).div(5)) // 20% ownership of cp farm for 60 blocks at 100% allocation points
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(cpFarmId, farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock2.mul(burnedBlocks.add(2)).mul(9).div(10).mul(4).div(5)).add // 80% ownership of cp farm for unknown blocks at 90% allocation points
        (solacePerBlock2.mul(60).mul(4).div(5)) // 80% ownership of cp farm for 60 blocks at 100% allocation points
      );
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await master.pendingReward(lpFarmId, farmer3.address));
      expectedReward3 = expectedReward3.add(
        (solacePerBlock2.mul(burnedBlocks.add(1)).mul(65).div(100).div(10)) // 65% ownership of lp farm for unknown blocks at 10% allocation points
      );
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await master.pendingReward(lpFarmId, farmer4.address));
      expectedReward4 = expectedReward4.add(
        (solacePerBlock2.mul(burnedBlocks.add(1)).mul(35).div(100).div(10)) // 35% ownership of lp farm for unknown blocks at 10% allocation points
      );
      expect(pendingReward4).to.equal(expectedReward4);
    })

    it("allows farmers to cash out", async function () {
      // validate farmer 1 rewards
      await master.connect(farmer1).withdraw(cpFarmId, depositAmount1);
      expect(await cpToken.balanceOf(farmer1.address)).to.equal(depositAmount1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock2.mul(1).div(5)) // 20% ownership of cp farm for 1 block at 100% allocation points
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      await master.connect(farmer2).withdraw(cpFarmId, depositAmount2);
      expect(await cpToken.balanceOf(farmer2.address)).to.equal(depositAmount2);
      pendingReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock2.mul(1).mul(4).div(5)).add // 80% ownership of cp farm for 1 block at 100% allocation points
        (solacePerBlock2) // 100% ownership of cp farm for 1 block at 100% allocation points
      );
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      await master.connect(farmer3).withdraw(lpFarmId, depositAmount3);
      expect(await lpToken.balanceOf(farmer3.address)).to.equal(depositAmount3);
      pendingReward3 = BN.from(await solaceToken.balanceOf(farmer3.address));
      expectedReward3 = expectedReward3;
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      await master.connect(farmer4).withdraw(lpFarmId, depositAmount4);
      expect(await lpToken.balanceOf(farmer4.address)).to.equal(depositAmount4);
      pendingReward4 = BN.from(await solaceToken.balanceOf(farmer4.address));
      expectedReward4 = expectedReward4;
      expect(pendingReward4).to.equal(expectedReward4);
    })
  })
});
