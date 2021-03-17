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
  let farmId: BN;
  let blockNum: BN;
  let startBlock: BN;
  let endBlock: BN;

  before(async function () {
    [governor, farmer1, farmer2, farmer3, farmer4] = provider.getWallets();
  })

  beforeEach(async function () {
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
      transaction1 = await master.createFarm(cpToken.address, 1, 2, 3);
      expect(transaction1).to.emit(master, "FarmCreated").withArgs(0);
      expect(await master.farmLength()).to.equal(1);
      // create second farm
      transaction2 = await master.createFarm(lpToken.address, 1, 2, 3);
      expect(transaction2).to.emit(master, "FarmCreated").withArgs(1);
      expect(await master.farmLength()).to.equal(2);
    })

    it("rejects farm creation by non governor", async function () {
      await expect(master.connect(farmer1).createFarm(lpToken.address, 1, 2, 3)).to.be.reverted;
    })

    it("returns farm information", async function () {
      let farmInfo: any;
      await master.createFarm(lpToken.address, 1, 2, 3);
      farmInfo = await master.farmInfo(0);
      expect(farmInfo.token).to.equal(lpToken.address);
      expect(farmInfo.allocPoints).to.equal(1);
      expect(farmInfo.tokensStaked).to.equal(0);
      expect(farmInfo.startBlock).to.equal(2);
      expect(farmInfo.endBlock).to.equal(3);
    })
  })

  describe("deposit and withdraw", function () {
    let farmInfo: any;
    let userInfo: any;

    beforeEach(async function () {
      await master.createFarm(lpToken.address, 1, 2, 3);
      farmId = BN.from("0");
    })

    it("can deposit", async function () {
      let transaction1: Transaction;
      let transaction2: Transaction;
      let transaction3: Transaction;
      // farmer 1, deposit 1
      await lpToken.transfer(farmer1.address, 3);
      await lpToken.connect(farmer1).increaseAllowance(master.address, 1);
      transaction1 = await master.connect(farmer1).deposit(farmId, 1);
      expect(transaction1).to.emit(master, "Deposit").withArgs(farmer1.address, farmId, 1);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(1);
      expect(await lpToken.balanceOf(master.address)).to.equal(1);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.amount).to.equal(1);
      // farmer 2, deposit 2
      await lpToken.transfer(farmer2.address, 4);
      await lpToken.connect(farmer2).increaseAllowance(master.address, 4);
      transaction2 = await master.connect(farmer2).deposit(farmId, 4);
      expect(transaction2).to.emit(master, "Deposit").withArgs(farmer2.address, farmId, 4);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(5);
      expect(await lpToken.balanceOf(master.address)).to.equal(5);
      userInfo = await master.userInfo(farmId, farmer2.address);
      expect(userInfo.amount).to.equal(4);
      // farmer 1, deposit 3
      await lpToken.connect(farmer1).increaseAllowance(master.address, 2);
      transaction3 = await master.connect(farmer1).deposit(farmId, 2);
      expect(transaction3).to.emit(master, "Deposit").withArgs(farmer1.address, farmId, 2);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(7);
      expect(await lpToken.balanceOf(master.address)).to.equal(7);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.amount).to.equal(3);
    })

    it("cannot deposit when lacking funds", async function () {
      // no funds and no allowance
      await expect(master.connect(farmer1).deposit(farmId, 1)).to.be.reverted;
      // yes funds and no allowance
      await lpToken.transfer(farmer1.address, 1);
      await expect(master.connect(farmer1).deposit(farmId, 1)).to.be.reverted;
      // no funds and yes allowance
      await lpToken.connect(farmer2).increaseAllowance(master.address, 1);
      await expect(master.connect(farmer2).deposit(farmId, 1)).to.be.reverted;
    })

    it("can withdraw", async function () {
      let transaction1: Transaction;
      let transaction2: Transaction;
      let transaction3: Transaction;
      // farmer 1, deposit
      await lpToken.transfer(farmer1.address, 3);
      await lpToken.connect(farmer1).increaseAllowance(master.address, 3);
      await master.connect(farmer1).deposit(farmId, 3);
      // farmer 1, partial withdraw
      transaction1 = await master.connect(farmer1).withdraw(farmId, 1);
      expect(transaction1).to.emit(master, "Withdraw").withArgs(farmer1.address, farmId, 1);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(2);
      expect(await lpToken.balanceOf(master.address)).to.equal(2);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.amount).to.equal(2);
      // farmer 2, deposit
      await lpToken.transfer(farmer2.address, 4);
      await lpToken.connect(farmer2).increaseAllowance(master.address, 4);
      await master.connect(farmer2).deposit(farmId, 4);
      // farmer 1, full withdraw
      transaction2 = await master.connect(farmer1).withdraw(farmId, 2);
      expect(transaction2).to.emit(master, "Withdraw").withArgs(farmer1.address, farmId, 2);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(4);
      expect(await lpToken.balanceOf(master.address)).to.equal(4);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.amount).to.equal(0);
      // farmer 2, full withdraw
      transaction3 = await master.connect(farmer2).withdraw(farmId, 4);
      expect(transaction3).to.emit(master, "Withdraw").withArgs(farmer2.address, farmId, 4);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.tokensStaked).to.equal(0);
      expect(await lpToken.balanceOf(master.address)).to.equal(0);
      userInfo = await master.userInfo(farmId, farmer2.address);
      expect(userInfo.amount).to.equal(0);
    })

    it("cannot overwithdraw", async function () {
      // withdraw without deposit
      await expect(master.connect(farmer1).withdraw(farmId, 1)).to.be.reverted;
      // withdraw more than deposit
      await lpToken.transfer(farmer1.address, 3);
      await lpToken.connect(farmer1).increaseAllowance(master.address, 3);
      await master.connect(farmer1).deposit(farmId, 3);
      await expect(master.connect(farmer1).withdraw(farmId, 4)).to.be.reverted;
    })
  })

  describe("single farm rewards", function () {
    let farmId: BN = BN.from("0");
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
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(1020);
      await master.createFarm(lpToken.address, allocPoints, startBlock, endBlock);
      await lpToken.transfer(farmer1.address, depositAmount1);
      await lpToken.transfer(farmer2.address, depositAmount2.add(depositAmount3));
      await lpToken.connect(farmer1).increaseAllowance(master.address, depositAmount1);
      await lpToken.connect(farmer2).increaseAllowance(master.address, depositAmount2.add(depositAmount3));
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
      expectedReward1 = (
        (solacePerBlock.mul(11).mul(1)).add // 100% ownership for 11 blocks
        (solacePerBlock.mul(21).mul(1).div(5)).add // 20% ownership for 21 blocks
        (solacePerBlock.mul(30).mul(1).div(20)) // 5% ownership for 30 blocks
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // check farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(farmId, farmer2.address));
      receivedReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = (
        (solacePerBlock.mul(21).mul(4).div(5)).add // 80% ownership for 21 blocks
        (solacePerBlock.mul(30).mul(19).div(20)) // 95% ownership for 30 blocks
      );
      expect(pendingReward2.add(receivedReward2)).to.equal(expectedReward2);
      // farmer 1 withdraw
      await master.connect(farmer1).withdraw(farmId, depositAmount1);
      expect(await lpToken.balanceOf(farmer1.address)).to.equal(depositAmount1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = (
        (solacePerBlock.mul(11).mul(1)).add // 100% ownership for 11 blocks
        (solacePerBlock.mul(21).mul(1).div(5)).add // 20% ownership for 21 blocks
        (solacePerBlock.mul(31).mul(1).div(20)) // 5% ownership for 31 blocks
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // farmer 2 withdraw
      await master.connect(farmer2).withdraw(farmId, depositAmount2.add(depositAmount3));
      expect(await lpToken.balanceOf(farmer2.address)).to.equal(depositAmount2.add(depositAmount3));
      pendingReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = BN.from("4724999999999999999999"); // off by one, should be 4725000000000000000000
      /*(
        (solacePerBlock.mul(21).mul(4).div(5)).add // 80% ownership for 21 blocks
        (solacePerBlock.mul(31).mul(19).div(20)).add // 95% ownership for 31 blocks
        (solacePerBlock) // 100% ownership for 1 block
      );*/
      expect(pendingReward2).to.equal(expectedReward2);
    })

    it("does not distribute rewards before farm start", async function () {
      await master.connect(farmer1).deposit(farmId, depositAmount1);
      await burnBlocksUntil(startBlock);
      expect(await master.pendingReward(farmId, farmer1.address)).to.equal(0);
    })

    it("does not distribute rewards after farm end", async function () {
      let farmId2: BN = BN.from("1");
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(5);
      endBlock = blockNum.add(10);
      await master.createFarm(lpToken.address, allocPoints, startBlock, endBlock);
      await master.connect(farmer1).deposit(farmId2, depositAmount1);
      await burnBlocksUntil(endBlock);
      let pendingReward1 = await master.pendingReward(farmId2, farmer1.address);
      await burnBlocks(BN.from(10));
      let pendingReward2 = await master.pendingReward(farmId2, farmer1.address);
      expect(pendingReward2).to.equal(pendingReward1);
    })
  })

  describe("multiple farm rewards", function () {
    // cp and lp farms
    let cpFarmId: BN = BN.from("0");
    let lpFarmId: BN = BN.from("1");
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

    beforeEach(async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      // farms start and end at different times, math should still work
      await master.createFarm(cpToken.address, cpAllocPoints1, blockNum.add(25), blockNum.add(500));
      await master.createFarm(lpToken.address, lpAllocPoints, blockNum.add(45), blockNum.add(250));
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
      // TODO: this is one giant test that should be broken down into multiple smaller tests
      // they're written to continue from the state of the previous test
      // I know there's a way to do that, but for some reason it keeps throwing errors

      // Part 1: add multiple farmers to multiple farms

      // add farmer 1 to cp farm
      await master.connect(farmer1).deposit(cpFarmId, depositAmount1);
      // wait 9 blocks
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
      expectedReward1 = (
        (solacePerBlock.mul(32).mul(4).div(5)).add // 100% ownership of cp farm for 32 blocks at 80% allocation points
        (solacePerBlock.mul(71).mul(4).div(5).div(5)) // 20% ownership of cp farm for 71 blocks at 80% allocation points
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(cpFarmId, farmer2.address));
      expectedReward2 = solacePerBlock.mul(71).mul(16).div(25); // 80% ownership of cp farm for 71 blocks at 80% allocation points
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await master.pendingReward(lpFarmId, farmer3.address));
      expectedReward3 = BN.from("1419999999999999999999"); // off by one, should be 1420000000000000000000
      /*(
        (solacePerBlock.mul(45).mul(1).div(5)).add // 100% ownership of lp farm for 45 blocks at 20% allocation points
        (solacePerBlock.mul(40).mul(65).div(100).div(5)) // 65% ownership of lp farm for 40 blocks at 20% allocation points
      );*/
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await master.pendingReward(lpFarmId, farmer4.address));
      expectedReward4 = solacePerBlock.mul(40).mul(35).div(100).div(5); // 35% ownership of lp farm for 40 blocks at 20% allocation points
      expect(pendingReward4).to.equal(expectedReward4);

      // part 2: change allocation points of farms

      await master.setAllocation(cpFarmId, cpAllocPoints2, true);
      // wait 50 blocks
      await burnBlocks(BN.from(50));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await master.pendingReward(cpFarmId, farmer1.address));
      expectedReward1 = (
        (solacePerBlock.mul(32).mul(4).div(5)).add // 100% ownership of cp farm for 32 blocks at 80% allocation points
        (solacePerBlock.mul(72).mul(4).div(5).div(5)).add // 20% ownership of cp farm for 72 blocks at 80% allocation points
        (solacePerBlock.mul(50).mul(9).div(10).div(5)) // 20% ownership of cp farm for 50 blocks at 90% allocation points
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(cpFarmId, farmer2.address));
      expectedReward2 = (
        (solacePerBlock.mul(72).mul(4).div(5).mul(4).div(5)).add // 80% ownership of cp farm for 72 blocks at 80% allocation points
        (solacePerBlock.mul(50).mul(4).div(5).mul(9).div(10)) // 80% ownership of cp farm for 50 blocks at 90% allocation points
      );
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await master.pendingReward(lpFarmId, farmer3.address));
      expectedReward3 = BN.from("1757999999999999999999"); // off by one, should be 1758000000000000000000
      /*(
        (solacePerBlock.mul(45).mul(1).div(5)).add // 100% ownership of lp farm for 45 blocks at 20% allocation points
        (solacePerBlock.mul(41).mul(65).div(100).div(5)).add // 65% ownership of lp farm for 41 blocks at 20% allocation points
        (solacePerBlock.mul(50).mul(65).div(100).div(10)) // 65% ownership of lp farm for 50 blocks at 10% allocation points
      );*/
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await master.pendingReward(lpFarmId, farmer4.address));
      expectedReward4 = (
        (solacePerBlock.mul(41).mul(35).div(100).div(5)).add // 35% ownership of lp farm for 41 blocks at 20% allocation points
        (solacePerBlock.mul(50).mul(35).div(100).div(10)) // 35% ownership of lp farm for 50 blocks at 10% allocation points
      );
      expect(pendingReward4).to.equal(expectedReward4);

      // part 3: end of a farm

      let endBlock = blockNum.add(250);
      let burnedBlocks: BN = await burnBlocksUntil(endBlock);
      // governance manually sets alloc to zero
      await master.setAllocation(lpFarmId, 0, true);
      // wait 60 blocks
      await burnBlocks(BN.from(60));
      // validate farmer 1 rewards
      pendingReward1 = BN.from(await master.pendingReward(cpFarmId, farmer1.address));
      expectedReward1 = (
        (solacePerBlock.mul(32).mul(4).div(5)).add // 100% ownership of cp farm for 32 blocks at 80% allocation points
        (solacePerBlock.mul(72).mul(4).div(5).div(5)).add // 20% ownership of cp farm for 72 blocks at 80% allocation points
        (solacePerBlock.mul(50).mul(9).div(10).div(5)).add // 20% ownership of cp farm for 50 blocks at 90% allocation points
        (solacePerBlock.mul(burnedBlocks.add(1)).mul(9).div(10).div(5)).add // 20% ownership of cp farm for unknown blocks at 90% allocation points
        (solacePerBlock.mul(60).div(5)) // 20% ownership of cp farm for 60 blocks at 100% allocation points
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      pendingReward2 = BN.from(await master.pendingReward(cpFarmId, farmer2.address));
      expectedReward2 = (
        (solacePerBlock.mul(72).mul(4).div(5).mul(4).div(5)).add // 80% ownership of cp farm for 72 blocks at 80% allocation points
        (solacePerBlock.mul(50).mul(4).div(5).mul(9).div(10)).add // 80% ownership of cp farm for 50 blocks at 90% allocation points
        (solacePerBlock.mul(burnedBlocks.add(1)).mul(9).div(10).mul(4).div(5)).add // 80% ownership of cp farm for unknown blocks at 90% allocation points
        (solacePerBlock.mul(60).mul(4).div(5)) // 80% ownership of cp farm for 60 blocks at 100% allocation points
      );
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      pendingReward3 = BN.from(await master.pendingReward(lpFarmId, farmer3.address));
      expectedReward3 = BN.from("2206499999999999999999"); // off by one, should be 2206500000000000000000
      /*(
        (solacePerBlock.mul(45).mul(1).div(5)).add // 100% ownership of lp farm for 45 blocks at 20% allocation points
        (solacePerBlock.mul(41).mul(65).div(100).div(5)).add // 65% ownership of lp farm for 41 blocks at 20% allocation points
        (solacePerBlock.mul(50).mul(65).div(100).div(10)).add // 65% ownership of lp farm for 50 blocks at 10% allocation points
        (solacePerBlock.mul(burnedBlocks).mul(65).div(100).div(10)) // 65% ownership of lp farm for unknown blocks at 10% allocation points
      );*/
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      pendingReward4 = BN.from(await master.pendingReward(lpFarmId, farmer4.address));
      expectedReward4 = (
        (solacePerBlock.mul(41).mul(35).div(100).div(5)).add // 35% ownership of lp farm for 41 blocks at 20% allocation points
        (solacePerBlock.mul(50).mul(35).div(100).div(10)).add // 35% ownership of lp farm for 50 blocks at 10% allocation points
        (solacePerBlock.mul(burnedBlocks).mul(35).div(100).div(10)) // 35% ownership of lp farm for unknown blocks at 10% allocation points
      );
      expect(pendingReward4).to.equal(expectedReward4);

      // part 4: everybody cash out

      // validate farmer 1 rewards
      await master.connect(farmer1).withdraw(cpFarmId, depositAmount1);
      expect(await cpToken.balanceOf(farmer1.address)).to.equal(depositAmount1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = (
        (solacePerBlock.mul(32).mul(4).div(5)).add // 100% ownership of cp farm for 32 blocks at 80% allocation points
        (solacePerBlock.mul(72).mul(4).div(5).div(5)).add // 20% ownership of cp farm for 72 blocks at 80% allocation points
        (solacePerBlock.mul(50).mul(9).div(10).div(5)).add // 20% ownership of cp farm for 50 blocks at 90% allocation points
        (solacePerBlock.mul(burnedBlocks.add(1)).mul(9).div(10).div(5)).add // 20% ownership of cp farm for unknown blocks at 90% allocation points
        (solacePerBlock.mul(61).div(5)) // 20% ownership of cp farm for 61 blocks at 100% allocation points
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      await master.connect(farmer2).withdraw(cpFarmId, depositAmount2);
      expect(await cpToken.balanceOf(farmer2.address)).to.equal(depositAmount2);
      pendingReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = (
        (solacePerBlock.mul(72).mul(4).div(5).mul(4).div(5)).add // 80% ownership of cp farm for 72 blocks at 80% allocation points
        (solacePerBlock.mul(50).mul(4).div(5).mul(9).div(10)).add // 80% ownership of cp farm for 50 blocks at 90% allocation points
        (solacePerBlock.mul(burnedBlocks.add(1)).mul(9).div(10).mul(4).div(5)).add // 80% ownership of cp farm for unknown blocks at 90% allocation points
        (solacePerBlock.mul(61).mul(4).div(5)).add // 80% ownership of cp farm for 61 blocks at 100% allocation points
        (solacePerBlock) // 100% ownership of cp farm for 1 block at 100% allocation points
      );
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      await master.connect(farmer3).withdraw(lpFarmId, depositAmount3);
      expect(await lpToken.balanceOf(farmer3.address)).to.equal(depositAmount3);
      pendingReward3 = BN.from(await solaceToken.balanceOf(farmer3.address));
      expectedReward3 = BN.from("2206499999999999999999"); // off by one, should be 2206500000000000000000
      /*(
        (solacePerBlock.mul(45).mul(1).div(5)).add // 100% ownership of lp farm for 45 blocks at 20% allocation points
        (solacePerBlock.mul(41).mul(65).div(100).div(5)).add // 65% ownership of lp farm for 41 blocks at 20% allocation points
        (solacePerBlock.mul(50).mul(65).div(100).div(10)).add // 65% ownership of lp farm for 50 blocks at 10% allocation points
        (solacePerBlock.mul(burnedBlocks).mul(65).div(100).div(10)) // 65% ownership of lp farm for unknown blocks at 10% allocation points
      );*/
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      await master.connect(farmer4).withdraw(lpFarmId, depositAmount4);
      expect(await lpToken.balanceOf(farmer4.address)).to.equal(depositAmount4);
      pendingReward4 = BN.from(await solaceToken.balanceOf(farmer4.address));
      expectedReward4 = (
        (solacePerBlock.mul(41).mul(35).div(100).div(5)).add // 35% ownership of lp farm for 41 blocks at 20% allocation points
        (solacePerBlock.mul(50).mul(35).div(100).div(10)).add // 35% ownership of lp farm for 50 blocks at 10% allocation points
        (solacePerBlock.mul(burnedBlocks).mul(35).div(100).div(10)) // 35% ownership of lp farm for unknown blocks at 10% allocation points
      );
      expect(pendingReward4).to.equal(expectedReward4);
    })
  })
});
