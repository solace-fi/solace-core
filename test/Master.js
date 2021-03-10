const { expect, use } = require("chai");
const { waffle } = require("hardhat");
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

use(solidity);

describe("Master", function () {
    const [owner, farmer1, farmer2] = provider.getWallets();

    beforeEach(async function () {
        // deploy solace token
        solaceTokenFactory = await ethers.getContractFactory("SOLACE");
        solaceToken = await solaceTokenFactory.deploy();
        // deploy master contract
        masterFactory = await ethers.getContractFactory("Master");
        master = await masterFactory.deploy(solaceToken.address);
        // deploy dummy lp token
        dummyLpFactory = await ethers.getContractFactory("DummyLpToken");
        lpToken = await dummyLpFactory.deploy();
    });

    describe("farm creation", function () {
        it("can create farms", async function () {
            // no farms
            expect(await master.farmLength()).to.equal(0);
            // create first farm
            transaction = await master.createFarm(lpToken.address, 0, 1, 2);
            expect(transaction).to.emit(master, "FarmCreated").withArgs(0);
            expect(await master.farmLength()).to.equal(1);
            // create second farm
            transaction = await master.createFarm(lpToken.address, 0, 1, 2);
            expect(transaction).to.emit(master, "FarmCreated").withArgs(1);
            expect(await master.farmLength()).to.equal(2);
        })

        it("rejects farm creation by non owner", async function () {
            await expect(master.connect(farmer1).createFarm(lpToken.address, 0, 1, 1)).to.be.reverted;
        })

        it("returns farm information", async function () {
            await master.createFarm(lpToken.address, 0, 1, 2);
            farmInfo = await master.farmInfo(0);
            expect(farmInfo.token).to.equal(lpToken.address);
            expect(farmInfo.startBlock).to.equal(0);
            expect(farmInfo.endBlock).to.equal(1);
            expect(farmInfo.blockReward).to.equal(2);
            expect(farmInfo.numFarmers).to.equal(0);
            expect(farmInfo.tokensStaked).to.equal(0);
        })
    })

    describe("deposit and withdraw", function () {
        beforeEach(async function () {
            await master.createFarm(lpToken.address, 0, 1, 2);
            farmId = 0;
        })

        it("can deposit", async function () {
            // farmer 1, deposit 1
            await lpToken.transfer(farmer1.address, 3);
            await lpToken.connect(farmer1).increaseAllowance(master.address, 1);
            transaction = await master.connect(farmer1).deposit(farmId, 1);
            expect(transaction).to.emit(master, "Deposit").withArgs(farmer1.address, farmId, 1);
            farmInfo = await master.farmInfo(farmId);
            expect(farmInfo.numFarmers).to.equal(1);
            expect(farmInfo.tokensStaked).to.equal(1);
            expect(await lpToken.balanceOf(master.address)).to.equal(1);
            userInfo = await master.userInfo(farmId, farmer1.address);
            expect(userInfo.amount).to.equal(1);
            // farmer 2, deposit 2
            await lpToken.transfer(farmer2.address, 4);
            await lpToken.connect(farmer2).increaseAllowance(master.address, 4);
            transaction = await master.connect(farmer2).deposit(farmId, 4);
            expect(transaction).to.emit(master, "Deposit").withArgs(farmer2.address, farmId, 4);
            farmInfo = await master.farmInfo(farmId);
            expect(farmInfo.numFarmers).to.equal(2);
            expect(farmInfo.tokensStaked).to.equal(5);
            expect(await lpToken.balanceOf(master.address)).to.equal(5);
            userInfo = await master.userInfo(farmId, farmer2.address);
            expect(userInfo.amount).to.equal(4);
            // farmer 1, deposit 3
            await lpToken.connect(farmer1).increaseAllowance(master.address, 2);
            transaction = await master.connect(farmer1).deposit(farmId, 2);
            expect(transaction).to.emit(master, "Deposit").withArgs(farmer1.address, farmId, 2);
            farmInfo = await master.farmInfo(farmId);
            expect(farmInfo.numFarmers).to.equal(2);
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
            // farmer 1, deposit
            await lpToken.transfer(farmer1.address, 3);
            await lpToken.connect(farmer1).increaseAllowance(master.address, 3);
            await master.connect(farmer1).deposit(farmId, 3);
            // farmer 1, partial withdraw
            transaction = await master.connect(farmer1).withdraw(farmId, 1);
            expect(transaction).to.emit(master, "Withdraw").withArgs(farmer1.address, farmId, 1);
            farmInfo = await master.farmInfo(farmId);
            expect(farmInfo.numFarmers).to.equal(1);
            expect(farmInfo.tokensStaked).to.equal(2);
            expect(await lpToken.balanceOf(master.address)).to.equal(2);
            userInfo = await master.userInfo(farmId, farmer1.address);
            expect(userInfo.amount).to.equal(2);
            // farmer 2, deposit
            await lpToken.transfer(farmer2.address, 4);
            await lpToken.connect(farmer2).increaseAllowance(master.address, 4);
            await master.connect(farmer2).deposit(farmId, 4);
            // farmer 1, full withdraw
            transaction = await master.connect(farmer1).withdraw(farmId, 2);
            expect(transaction).to.emit(master, "Withdraw").withArgs(farmer1.address, farmId, 2);
            farmInfo = await master.farmInfo(farmId);
            expect(farmInfo.numFarmers).to.equal(1);
            expect(farmInfo.tokensStaked).to.equal(4);
            expect(await lpToken.balanceOf(master.address)).to.equal(4);
            userInfo = await master.userInfo(farmId, farmer1.address);
            expect(userInfo.amount).to.equal(0);
            // farmer 2, full withdraw
            transaction = await master.connect(farmer2).withdraw(farmId, 4);
            expect(transaction).to.emit(master, "Withdraw").withArgs(farmer2.address, farmId, 4);
            farmInfo = await master.farmInfo(farmId);
            expect(farmInfo.numFarmers).to.equal(0);
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

    describe("rewards", function () {
        beforeEach(async function () {
            blockReward = 100 // one hundred
            blockNum = await provider.getBlockNumber()
            // farm starts in 20 blocks, ends in 50 blocks, 100 solace per block
            await master.createFarm(lpToken.address, blockNum+20, blockNum+50, blockReward);
            farmId = 0;
            depositAmount1 = 10;
            depositAmount2 = 40;
            await lpToken.transfer(farmer1.address, depositAmount1);
            await lpToken.transfer(farmer2.address, depositAmount2);
            await lpToken.connect(farmer1).increaseAllowance(master.address, depositAmount1);
            await lpToken.connect(farmer2).increaseAllowance(master.address, depositAmount2);
        })

        it("provides rewards to only farmer", async function () {
            await master.connect(farmer1).deposit(farmId, depositAmount1);
            // burn blocks to pass time
            farmInfo = await master.farmInfo(farmId);
            farmStartBlock = farmInfo["startBlock"]-0;
            waitBlocks = 10
            curBlock = (await provider.getBlockNumber())-0;
            while(curBlock+1 < farmStartBlock+waitBlocks){
                curBlock = (await provider.getBlockNumber())-0;
                await lpToken.transfer(owner.address, 1);
            }
            curBlock = (await provider.getBlockNumber())-0;
            pendingReward1 = await master.pendingReward(farmId, farmer1.address);
            expectedReward1 = blockReward * waitBlocks;
            expect(pendingReward1).to.equal(expectedReward1);
        })

        it("fairly provides rewards to all farmers", async function () {
            // only farmer 1
            await master.connect(farmer1).deposit(farmId, depositAmount1);
            farmInfo = await master.farmInfo(farmId);
            farmStartBlock = farmInfo["startBlock"]-0;
            waitBlocks1 = 10
            curBlock = (await provider.getBlockNumber())-0;
            while(curBlock+1 < farmStartBlock+waitBlocks1){
                curBlock = (await provider.getBlockNumber())-0;
                await lpToken.transfer(owner.address, 1);
            }
            // add farmer 2
            await master.connect(farmer2).deposit(farmId, depositAmount2);
            farmInfo = await master.farmInfo(farmId);
            farmStartBlock = farmInfo["startBlock"]-0;
            waitBlocks2 = 21
            curBlock = (await provider.getBlockNumber())-0;
            while(curBlock+1 < farmStartBlock+waitBlocks2){
                curBlock = (await provider.getBlockNumber())-0;
                await lpToken.transfer(owner.address, 1);
            }
            curBlock = (await provider.getBlockNumber())-0;
            // check farmer 1 rewards
            pendingReward1 = await master.pendingReward(farmId, farmer1.address);
            expectedReward11 = blockReward * 11 * 1; // 100% ownership for 11 blocks
            expectedReward12 = blockReward * 10 * 1 / 5; // 20% ownership for 10 blocks
            expectedReward1 = expectedReward11 + expectedReward12;
            expect(pendingReward1).to.equal(expectedReward1);
            // check farmer 2 rewards
            pendingReward2 = await master.pendingReward(farmId, farmer2.address);
            expectedReward2 = blockReward * 10 * 4 / 5; // 80% ownership for 10 blocks
            expect(pendingReward2).to.equal(expectedReward2);
        })
    })
});
