import { waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;

import { burnBlocks, burnBlocksUntil } from "./utilities/time";
import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";

import SolaceArtifact from '../artifacts/contracts/SOLACE.sol/SOLACE.json';
import MasterArtifact from '../artifacts/contracts/Master.sol/Master.json';
import VaultArtifact from '../artifacts/contracts/Vault.sol/Vault.json'
import WETHArtifact from "../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json";
import UniswapLpAppraiserArtifact from "../artifacts/contracts/UniswapLpAppraiser.sol/UniswapLpAppraiser.json";
import { Solace, Vault, Master, MockWeth, UniswapLpAppraiser } from "../typechain";

// uniswap imports
import UniswapV3FactoryArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import NonfungiblePositionManagerArtifact from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

chai.use(solidity);

// TODO: due to integer rounding errors, some math may be off by one
// need to test within a threshold of acceptance

// users
let deployer: Wallet;
let governor: Wallet;
let farmer1: Wallet;
let farmer2: Wallet;
let farmer3: Wallet;
let farmer4: Wallet;

// contracts
let solaceToken: Solace;
let master: Master;
let cpToken: Vault;
let weth: MockWeth;
let lpAppraiser: UniswapLpAppraiser;

// uniswap contracts
let uniswapFactory: Contract;
let lpToken: Contract;

// vars
let solacePerBlock: BN = BN.from("100000000000000000000"); // 100 e18
let solacePerBlock2: BN = BN.from("200000000000000000000"); // 200 e18
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
let blockNum: BN;
let startBlock: BN;
let endBlock: BN;

describe("Master", function () {
  before(async function () {
    [deployer, governor, farmer1, farmer2, farmer3, farmer4] = provider.getWallets();

    // deploy solace token
    solaceToken = (await deployContract(
      deployer,
      SolaceArtifact
    )) as Solace;

    // deploy weth
    weth = (await deployContract(
        deployer,
        WETHArtifact
    )) as MockWeth;

    // deploy master contract
    master = (await deployContract(
      deployer,
      MasterArtifact,
      [
        solaceToken.address,
        solacePerBlock
      ]
    )) as Master;

    // deploy vault / cp token
    cpToken = (await deployContract(
        deployer,
        VaultArtifact
    )) as Vault;

    // deploy uniswap factory
    uniswapFactory = (await deployContract(
      deployer,
      UniswapV3FactoryArtifact
    )) as Contract;

    // deploy uniswap nft / lp token
    lpToken = (await deployContract(
      deployer,
      NonfungiblePositionManagerArtifact,
      [
        uniswapFactory.address,
        weth.address,
        ZERO_ADDRESS
      ]
    )) as Contract;

    // deploy uniswap lp appraiser
    lpAppraiser = (await deployContract(
      deployer,
      UniswapLpAppraiserArtifact,
      [
        lpToken.address
      ]
    )) as UniswapLpAppraiser;

    // transfer tokens
    await solaceToken.addMinter(governor.address);
    await solaceToken.connect(governor).mint(master.address, ONE_MILLION_ETHER);
    await solaceToken.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solaceToken.connect(governor).transfer(farmer1.address, TEN_ETHER);
    await solaceToken.connect(governor).transfer(farmer2.address, TEN_ETHER);
    await solaceToken.connect(governor).transfer(farmer3.address, TEN_ETHER);
    await solaceToken.connect(governor).transfer(farmer4.address, TEN_ETHER);
    await weth.connect(farmer1).deposit({value: TEN_ETHER});
    await weth.connect(farmer2).deposit({value: TEN_ETHER});
    await weth.connect(farmer3).deposit({value: TEN_ETHER});
    await weth.connect(farmer4).deposit({value: TEN_ETHER});

    // approve tokens
    await solaceToken.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await solaceToken.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await solaceToken.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
    await solaceToken.connect(farmer4).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer4).approve(lpToken.address, constants.MaxUint256);

    // create pools
    await createPool(weth, solaceToken, FeeAmount.MEDIUM);
    await createPool(weth, solaceToken, FeeAmount.HIGH);

    // appraise pool
    await lpAppraiser.setPoolValue(weth.address, solaceToken.address, FeeAmount.MEDIUM, 1);
  })

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await master.governance()).to.equal(deployer.address);
    })

    it("can transfer governance", async function () {
      await master.connect(deployer).setGovernance(governor.address);
      expect(await master.governance()).to.equal(governor.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(master.connect(deployer).setGovernance(governor.address)).to.be.revertedWith("!governance");
    })
  })

  describe("farm creation", function () {
    it("can create erc20 farms", async function () {
      // no farms
      expect(await master.numFarms()).to.equal(0);
      // create first farm
      let tx1 = await master.connect(governor).createFarmErc20(cpToken.address, 0, 1, 2);
      await expect(tx1).to.emit(master, "Erc20FarmCreated").withArgs(0);
      expect(await master.numFarms()).to.equal(1);
    })

    it("can create erc721 farms", async function () {
      // create second farm
      let tx = await master.connect(governor).createFarmErc721(lpToken.address, lpAppraiser.address, 0, 1, 2);
      await expect(tx).to.emit(master, "Erc721FarmCreated").withArgs(1);
      expect(await master.numFarms()).to.equal(2);
    })

    it("rejects farm creation by non governor", async function () {
      await expect(master.connect(farmer1).createFarmErc20(cpToken.address, 0, 1, 2)).to.be.revertedWith("!governance");
      await expect(master.connect(farmer1).createFarmErc721(lpToken.address, lpAppraiser.address, 0, 1, 2)).to.be.revertedWith("!governance");
    })

    it("returns farm information", async function () {
      let farmInfo1 = await master.farmInfo(0);
      expect(farmInfo1.token).to.equal(cpToken.address);
      expect(farmInfo1.appraiser).to.equal(ZERO_ADDRESS);
      expect(farmInfo1.valueStaked).to.equal(0);
      expect(farmInfo1.allocPoints).to.equal(0);
      expect(farmInfo1.startBlock).to.equal(1);
      expect(farmInfo1.endBlock).to.equal(2);
      expect(await master.farmIsErc20(0)).to.equal(true);
      expect(await master.farmIsErc721(0)).to.equal(false);

      let farmInfo2 = await master.farmInfo(1);
      expect(farmInfo2.token).to.equal(lpToken.address);
      expect(farmInfo2.appraiser).to.equal(lpAppraiser.address);
      expect(farmInfo2.valueStaked).to.equal(0);
      expect(farmInfo2.allocPoints).to.equal(0);
      expect(farmInfo2.startBlock).to.equal(1);
      expect(farmInfo2.endBlock).to.equal(2);
      expect(await master.farmIsErc20(1)).to.equal(false);
      expect(await master.farmIsErc721(1)).to.equal(true);

      expect(await master.farmIsErc20(2)).to.equal(false);
      expect(await master.farmIsErc721(2)).to.equal(false);
    })
  })

  describe("deposit and withdraw cp token / erc20", function () {
    let farmInfo: any;
    let userInfo: any;
    let farmId = BN.from(0);

    it("can deposit", async function () {
      let depositAmount1 = BN.from(1);
      let depositAmount2 = BN.from(4);
      let depositAmount3 = BN.from(2);
      let tx1: Transaction;
      let tx2: Transaction;
      let tx3: Transaction;
      // farmer 1, deposit 1
      await mintCpToken(farmer1, depositAmount1.add(depositAmount3));
      await cpToken.connect(farmer1).increaseAllowance(master.address, depositAmount1);
      tx1 = await master.connect(farmer1).depositErc20(farmId, 1);
      await expect(tx1).to.emit(master, "DepositErc20").withArgs(farmer1.address, farmId, depositAmount1);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.valueStaked).to.equal(depositAmount1);
      expect(await cpToken.balanceOf(master.address)).to.equal(depositAmount1);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.value).to.equal(1);
      // farmer 2, deposit 4
      await mintCpToken(farmer2, depositAmount2);
      await cpToken.connect(farmer2).increaseAllowance(master.address, depositAmount2);
      tx2 = await master.connect(farmer2).depositErc20(farmId, depositAmount2);
      await expect(tx2).to.emit(master, "DepositErc20").withArgs(farmer2.address, farmId, depositAmount2);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.valueStaked).to.equal(depositAmount1.add(depositAmount2));
      expect(await cpToken.balanceOf(master.address)).to.equal(depositAmount1.add(depositAmount2));
      userInfo = await master.userInfo(farmId, farmer2.address);
      expect(userInfo.value).to.equal(depositAmount2);
      // farmer 1, deposit 2
      await cpToken.connect(farmer1).increaseAllowance(master.address, depositAmount3);
      tx3 = await master.connect(farmer1).depositErc20(farmId, depositAmount3);
      await expect(tx3).to.emit(master, "DepositErc20").withArgs(farmer1.address, farmId, depositAmount3);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.valueStaked).to.equal(depositAmount1.add(depositAmount2).add(depositAmount3));
      expect(await cpToken.balanceOf(master.address)).to.equal(depositAmount1.add(depositAmount2).add(depositAmount3));
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.value).to.equal(depositAmount1.add(depositAmount3));
    })

    it("cannot deposit when lacking funds", async function () {
      // no funds and no allowance
      await expect(master.connect(farmer1).depositErc20(farmId, 1)).to.be.reverted;
      // yes funds and no allowance
      await mintCpToken(farmer1, 1);
      await expect(master.connect(farmer1).depositErc20(farmId, 1)).to.be.reverted;
      // no funds and yes allowance
      await cpToken.connect(farmer2).increaseAllowance(master.address, 1);
      await expect(master.connect(farmer2).depositErc20(farmId, 1)).to.be.reverted;
    })

    it("cannot deposit onto a non existant farm", async function () {
      await expect(master.connect(farmer1).depositErc20(await master.numFarms(), 1)).to.be.revertedWith("not an erc20 farm");
    })

    it("can withdraw", async function () {
      let tx1: Transaction;
      let tx2: Transaction;
      let tx3: Transaction;
      let balance1: BN;
      let balance2: BN;
      let staked1: BN;
      let staked2: BN;
      // farmer 1, partial withdraw
      balance1 = await cpToken.balanceOf(master.address);
      staked1 = (await master.farmInfo(farmId)).valueStaked;
      tx1 = await master.connect(farmer1).withdrawErc20(farmId, 1);
      await expect(tx1).to.emit(master, "WithdrawErc20").withArgs(farmer1.address, farmId, 1);
      balance2 = await cpToken.balanceOf(master.address);
      expect(balance1.sub(balance2)).to.equal(1);
      staked2 = (await master.farmInfo(farmId)).valueStaked;
      expect(staked1.sub(staked2)).to.equal(1);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.value).to.equal(2);
      // farmer 1, full withdraw
      balance1 = await cpToken.balanceOf(master.address);
      staked1 = (await master.farmInfo(farmId)).valueStaked;
      tx2 = await master.connect(farmer1).withdrawErc20(farmId, 2);
      await expect(tx2).to.emit(master, "WithdrawErc20").withArgs(farmer1.address, farmId, 2);
      balance2 = await cpToken.balanceOf(master.address);
      expect(balance1.sub(balance2)).to.equal(2);
      staked2 = (await master.farmInfo(farmId)).valueStaked;
      expect(staked1.sub(staked2)).to.equal(2);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.value).to.equal(0);
      // farmer 2, full withdraw
      balance1 = await cpToken.balanceOf(master.address);
      tx3 = await master.connect(farmer2).withdrawErc20(farmId, 4);
      await expect(tx3).to.emit(master, "WithdrawErc20").withArgs(farmer2.address, farmId, 4);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.valueStaked).to.equal(0);
      balance2 = await cpToken.balanceOf(master.address);
      expect(balance1.sub(balance2)).to.equal(4);
      userInfo = await master.userInfo(farmId, farmer2.address);
      expect(userInfo.value).to.equal(0);
    })

    it("cannot overwithdraw", async function () {
      // withdraw without deposit
      await expect(master.connect(farmer1).withdrawErc20(farmId, 1)).to.be.reverted;
      // withdraw more than deposit
      await mintCpToken(farmer1, 3);
      await cpToken.connect(farmer1).increaseAllowance(master.address, 3);
      await master.connect(farmer1).depositErc20(farmId, 3);
      await expect(master.connect(farmer1).withdrawErc20(farmId, 4)).to.be.reverted;
    })

    it("cannot withdraw from a non existant farm", async function () {
      await expect(master.connect(farmer1).withdrawErc20(await master.numFarms(), 1)).to.be.revertedWith("not an erc20 farm");
    })
  })

  describe("deposit and withdraw lp token / erc721", function () {
    let farmInfo: any;
    let userInfo: any;
    let farmId = BN.from(1);
    let tokenId1: BN, tokenId2: BN, tokenId3: BN;
    let depositAmount1 = BN.from(1);
    let depositAmount2 = BN.from(4);
    let depositAmount3 = BN.from(2);

    it("can deposit", async function () {
      // farmer 1, deposit 1
      await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, depositAmount1);
      tokenId1 = await lpToken.totalSupply();
      await lpToken.connect(farmer1).approve(master.address, tokenId1);
      let tx1 = await master.connect(farmer1).depositErc721(farmId, tokenId1);
      await expect(tx1).to.emit(master, "DepositErc721").withArgs(farmer1.address, farmId, tokenId1);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.valueStaked).to.equal(depositAmount1);
      expect(await lpToken.balanceOf(master.address)).to.equal(1);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.value).to.equal(depositAmount1);
      // farmer 2, deposit 4
      await mintLpToken(farmer2, weth, solaceToken, FeeAmount.MEDIUM, depositAmount2);
      tokenId2 = await lpToken.totalSupply();
      await lpToken.connect(farmer2).approve(master.address, tokenId2);
      let tx2 = await master.connect(farmer2).depositErc721(farmId, tokenId2);
      await expect(tx2).to.emit(master, "DepositErc721").withArgs(farmer2.address, farmId, tokenId2);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.valueStaked).to.equal(depositAmount1.add(depositAmount2));
      expect(await lpToken.balanceOf(master.address)).to.equal(2);
      userInfo = await master.userInfo(farmId, farmer2.address);
      expect(userInfo.value).to.equal(depositAmount2);
      // farmer 1, deposit 2
      await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, depositAmount3);
      tokenId3 = await lpToken.totalSupply();
      await lpToken.connect(farmer1).approve(master.address, tokenId3);
      let tx3 = await master.connect(farmer1).depositErc721(farmId, tokenId3);
      await expect(tx3).to.emit(master, "DepositErc721").withArgs(farmer1.address, farmId, tokenId3);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.valueStaked).to.equal(depositAmount1.add(depositAmount2).add(depositAmount3));
      expect(await lpToken.balanceOf(master.address)).to.equal(3);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.value).to.equal(depositAmount1.add(depositAmount3));
    })

    it("cannot deposit when lacking funds", async function () {
      // non existant token
      let tokenId = (await lpToken.totalSupply()).add(2);
      await expect(master.connect(farmer1).depositErc721(farmId, tokenId)).to.be.reverted;
      // deposit without approval
      await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, 1);
      tokenId = await lpToken.totalSupply();
      await expect(master.connect(farmer1).depositErc721(farmId, tokenId)).to.be.reverted;
      // deposit someone elses token
      await expect(master.connect(farmer2).depositErc721(farmId, tokenId)).to.be.reverted;
      await lpToken.connect(farmer1).approve(master.address, tokenId);
      await expect(master.connect(farmer2).depositErc721(farmId, tokenId)).to.be.reverted;
    })

    it("cannot deposit onto a non existant farm", async function () {
      await expect(master.connect(farmer1).depositErc721(await master.numFarms(), 1)).to.be.revertedWith("not an erc721 farm");
    })

    it("can withdraw", async function () {
      let balance1: BN;
      let balance2: BN;
      let staked1: BN;
      let staked2: BN;
      // farmer 1, partial withdraw
      balance1 = await lpToken.balanceOf(master.address);
      staked1 = (await master.farmInfo(farmId)).valueStaked;
      let tx1 = await master.connect(farmer1).withdrawErc721(farmId, tokenId1);
      await expect(tx1).to.emit(master, "WithdrawErc721").withArgs(farmer1.address, farmId, tokenId1);
      balance2 = await lpToken.balanceOf(master.address);
      expect(balance1.sub(balance2)).to.equal(1);
      staked2 = (await master.farmInfo(farmId)).valueStaked;
      expect(staked1.sub(staked2)).to.equal(depositAmount1);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.value).to.equal(depositAmount3);
      // farmer 1, full withdraw
      balance1 = await lpToken.balanceOf(master.address);
      staked1 = (await master.farmInfo(farmId)).valueStaked;
      let tx2 = await master.connect(farmer1).withdrawErc721(farmId, tokenId3);
      await expect(tx2).to.emit(master, "WithdrawErc721").withArgs(farmer1.address, farmId, tokenId3);
      balance2 = await lpToken.balanceOf(master.address);
      expect(balance1.sub(balance2)).to.equal(1);
      staked2 = (await master.farmInfo(farmId)).valueStaked;
      expect(staked1.sub(staked2)).to.equal(depositAmount3);
      userInfo = await master.userInfo(farmId, farmer1.address);
      expect(userInfo.value).to.equal(0);
      // farmer 2, full withdraw
      balance1 = await lpToken.balanceOf(master.address);
      let tx3 = await master.connect(farmer2).withdrawErc721(farmId, tokenId2);
      await expect(tx3).to.emit(master, "WithdrawErc721").withArgs(farmer2.address, farmId, tokenId2);
      farmInfo = await master.farmInfo(farmId);
      expect(farmInfo.valueStaked).to.equal(0);
      balance2 = await lpToken.balanceOf(master.address);
      expect(balance1.sub(balance2)).to.equal(1);
      userInfo = await master.userInfo(farmId, farmer2.address);
      expect(userInfo.value).to.equal(0);
    })

    it("cannot overwithdraw", async function () {
      // withdraw without deposit
      await expect(master.connect(farmer1).withdrawErc721(farmId, tokenId1)).to.be.reverted;
      // deposit one and withdraw another
      await lpToken.connect(farmer1).approve(master.address, tokenId1);
      await master.connect(farmer1).depositErc721(farmId, tokenId1);
      await expect(master.connect(farmer1).withdrawErc721(farmId, tokenId3)).to.be.reverted;
      // withdraw a token someone else deposited
      await expect(master.connect(farmer2).withdrawErc721(farmId, tokenId1)).to.be.reverted;
    })

    it("cannot withdraw from a non existant farm", async function () {
      await expect(master.connect(farmer1).withdrawErc721(await master.numFarms(), 0)).to.be.revertedWith("not an erc721 farm");
    })

    it("deposits and withdraws tokens at the same value", async function () {
      // before deposit
      let farmValue1 = (await master.farmInfo(farmId)).valueStaked;
      let userValue1 = (await master.userInfo(farmId, farmer1.address)).value;
      await lpAppraiser.setPoolValue(weth.address, solaceToken.address, FeeAmount.HIGH, 10);
      await mintLpToken(farmer1, weth, solaceToken, FeeAmount.HIGH, 7);
      let tokenId = lpToken.totalSupply();
      expect(await lpAppraiser.appraise(tokenId)).to.equal(70);
      // deposit
      await lpToken.connect(farmer1).approve(master.address, tokenId);
      await master.connect(farmer1).depositErc721(farmId, tokenId);
      let farmValue2 = (await master.farmInfo(farmId)).valueStaked;
      let userValue2 = (await master.userInfo(farmId, farmer1.address)).value;
      expect(farmValue2.sub(farmValue1)).to.equal(70);
      expect(userValue2.sub(userValue1)).to.equal(70);
      // change pool value
      await lpAppraiser.setPoolValue(weth.address, solaceToken.address, FeeAmount.HIGH, 20);
      expect(await lpAppraiser.appraise(tokenId)).to.equal(140);
      let farmValue3 = (await master.farmInfo(farmId)).valueStaked;
      let userValue3 = (await master.userInfo(farmId, farmer1.address)).value;
      expect(farmValue3.sub(farmValue1)).to.equal(70);
      expect(userValue3.sub(userValue1)).to.equal(70);
      // withdraw
      await master.connect(farmer1).withdrawErc721(farmId, tokenId);
      expect(await lpAppraiser.appraise(tokenId)).to.equal(140);
      let farmValue4 = (await master.farmInfo(farmId)).valueStaked;
      let userValue4 = (await master.userInfo(farmId, farmer1.address)).value;
      expect(farmValue4).to.equal(farmValue1);
      expect(userValue4).to.equal(userValue1);
    })
  })

  describe("single cp token / erc20 farm rewards", function () {
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
      await cpToken.connect(farmer1).transfer(governor.address, await cpToken.balanceOf(farmer1.address));
      await cpToken.connect(farmer2).transfer(governor.address, await cpToken.balanceOf(farmer2.address));
      await solaceToken.connect(farmer1).transfer(governor.address, await solaceToken.balanceOf(farmer1.address));
      await solaceToken.connect(farmer2).transfer(governor.address, await solaceToken.balanceOf(farmer2.address));
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(1020);
      farmId = await master.numFarms();
      await master.connect(governor).createFarmErc20(cpToken.address, allocPoints, startBlock, endBlock);
      await mintCpToken(farmer1, depositAmount1);
      await mintCpToken(farmer2, depositAmount2.add(depositAmount3));
      await cpToken.connect(farmer1).increaseAllowance(master.address, depositAmount1);
      await cpToken.connect(farmer2).increaseAllowance(master.address, depositAmount2.add(depositAmount3));
    })

    afterEach(async function () {
      await master.connect(governor).setFarmParams(farmId, 0, 0, false); // remember to deallocate dead farms
      expect(await master.totalAllocPoints()).to.equal(0);
    })

    it("provides rewards to only farmer", async function () {
      let waitBlocks: BN = BN.from("10");
      await master.connect(farmer1).depositErc20(farmId, depositAmount1);
      await burnBlocksUntil(startBlock.add(waitBlocks));
      // potential withdraw
      pendingReward1 = BN.from(await master.pendingReward(farmId, farmer1.address));
      expectedReward1 = solacePerBlock.mul(waitBlocks);
      expect(pendingReward1).to.equal(expectedReward1);
      // actual withdraw
      await master.connect(farmer1).withdrawErc20(farmId, depositAmount1);
      expect(await cpToken.balanceOf(farmer1.address)).to.equal(depositAmount1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = solacePerBlock.mul(waitBlocks.add(1));
      expect(pendingReward1).to.equal(expectedReward1);
    })

    it("fairly provides rewards to all farmers", async function () {
      let waitBlocks1: BN = BN.from("10");
      let waitBlocks2: BN = BN.from("20");
      let waitBlocks3: BN = BN.from("30");
      // only farmer 1
      await master.connect(farmer1).depositErc20(farmId, depositAmount1);
      await burnBlocksUntil(startBlock.add(waitBlocks1));
      // add farmer 2
      await master.connect(farmer2).depositErc20(farmId, depositAmount2);
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
      await master.connect(farmer2).depositErc20(farmId, depositAmount3);
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
      await master.connect(farmer1).withdrawErc20(farmId, depositAmount1);
      expect(await cpToken.balanceOf(farmer1.address)).to.equal(depositAmount1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(1).div(20)) // 5% ownership for 1 blocks
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // farmer 2 withdraw
      await master.connect(farmer2).withdrawErc20(farmId, depositAmount2.add(depositAmount3));
      expect(await cpToken.balanceOf(farmer2.address)).to.equal(depositAmount2.add(depositAmount3));
      pendingReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock.mul(1).mul(19).div(20)).add // 95% ownership for 1 blocks
        (solacePerBlock) // 100% ownership for 1 block
        .sub(1) // off by one error
      );
      expect(pendingReward2).to.equal(expectedReward2);
    })

    it("does not distribute rewards before farm start", async function () {
      await master.connect(farmer1).depositErc20(farmId, depositAmount1);
      await burnBlocksUntil(startBlock);
      expect(await master.pendingReward(farmId, farmer1.address)).to.equal(0);
    })

    it("does not distribute rewards after farm end", async function () {
      await master.connect(farmer1).depositErc20(farmId, depositAmount1);
      await burnBlocksUntil(endBlock);
      let pendingReward1 = await master.pendingReward(farmId, farmer1.address);
      await burnBlocks(BN.from(10));
      let pendingReward2 = await master.pendingReward(farmId, farmer1.address);
      expect(pendingReward2).to.equal(pendingReward1);
    })
  })

  describe("single lp token / erc721 farm rewards", function () {
    let farmId: BN;
    let allocPoints: BN = BN.from("1");
    // start with 1:4 ownership, switch to 1:19
    let depositAmount1: BN = BN.from("10");
    let depositAmount2: BN = BN.from("40");
    let depositAmount3: BN = BN.from("150");
    let tokenId1: BN;
    let tokenId2: BN;
    let tokenId3: BN;
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let expectedReward1: BN;
    let expectedReward2: BN;
    let receivedReward2: BN;

    beforeEach(async function () {
      // transfer some solace
      await solaceToken.connect(governor).transfer(farmer1.address, 10000);
      await solaceToken.connect(governor).transfer(farmer2.address, 10000);
      // create farm
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(100);
      farmId = await master.numFarms();
      await master.connect(governor).createFarmErc721(lpToken.address, lpAppraiser.address, allocPoints, startBlock, endBlock);
      // token 1
      await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, depositAmount1);
      tokenId1 = await lpToken.totalSupply();
      await lpToken.connect(farmer1).approve(master.address, tokenId1);
      // token 2
      await mintLpToken(farmer2, weth, solaceToken, FeeAmount.MEDIUM, depositAmount2);
      tokenId2 = await lpToken.totalSupply();
      await lpToken.connect(farmer2).approve(master.address, tokenId2);
      // token 3
      await mintLpToken(farmer2, weth, solaceToken, FeeAmount.MEDIUM, depositAmount3);
      tokenId3 = await lpToken.totalSupply();
      await lpToken.connect(farmer2).approve(master.address, tokenId3);
      // zero out solace balances
      await solaceToken.connect(farmer1).transfer(governor.address, await solaceToken.balanceOf(farmer1.address));
      await solaceToken.connect(farmer2).transfer(governor.address, await solaceToken.balanceOf(farmer2.address));
    })

    afterEach(async function () {
      await master.connect(governor).setFarmParams(farmId, 0, 0, false); // remember to deallocate dead farms
      expect(await master.totalAllocPoints()).to.equal(0);
    })

    it("provides rewards to only farmer", async function () {
      let waitBlocks: BN = BN.from("10");
      await master.connect(farmer1).depositErc721(farmId, tokenId1);
      await burnBlocksUntil(startBlock.add(waitBlocks));
      // potential withdraw
      pendingReward1 = BN.from(await master.pendingReward(farmId, farmer1.address));
      expectedReward1 = solacePerBlock.mul(waitBlocks);
      expect(pendingReward1).to.equal(expectedReward1);
      // actual withdraw
      await master.connect(farmer1).withdrawErc721(farmId, tokenId1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = solacePerBlock.mul(waitBlocks.add(1));
      expect(pendingReward1).to.equal(expectedReward1);
    })

    it("fairly provides rewards to all farmers", async function () {
      let waitBlocks1: BN = BN.from("10");
      let waitBlocks2: BN = BN.from("20");
      let waitBlocks3: BN = BN.from("30");
      // only farmer 1
      await master.connect(farmer1).depositErc721(farmId, tokenId1);
      await burnBlocksUntil(startBlock.add(waitBlocks1));
      // add farmer 2
      await master.connect(farmer2).depositErc721(farmId, tokenId2);
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
      await master.connect(farmer2).depositErc721(farmId, tokenId3);
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
      await master.connect(farmer1).withdrawErc721(farmId, tokenId1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock.mul(1).mul(1).div(20)) // 5% ownership for 1 blocks
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // farmer 2 withdraw
      await master.connect(farmer2).withdrawErc721(farmId, tokenId2);
      await master.connect(farmer2).withdrawErc721(farmId, tokenId3);
      pendingReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock.mul(1).mul(19).div(20)).add // 95% ownership for 1 blocks
        (solacePerBlock.mul(2)) // 100% ownership for 2 blocks
        .sub(1) // off by one error
      );
      expect(pendingReward2).to.equal(expectedReward2);
      // farmer 2 withdraw
    })

    it("does not distribute rewards before farm start", async function () {
      await master.connect(farmer1).depositErc721(farmId, tokenId1);
      await burnBlocksUntil(startBlock);
      expect(await master.pendingReward(farmId, farmer1.address)).to.equal(0);
    })

    it("does not distribute rewards after farm end", async function () {
      await master.connect(farmer1).depositErc721(farmId, tokenId1);
      await burnBlocksUntil(endBlock);
      let pendingReward1 = await master.pendingReward(farmId, farmer1.address);
      await burnBlocks(BN.from(10));
      let pendingReward2 = await master.pendingReward(farmId, farmer1.address);
      expect(pendingReward2).to.equal(pendingReward1);
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
    let tokenId3: BN;
    let tokenId4: BN;
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
      // farmer 1 tokens
      await cpToken.connect(farmer1).transfer(governor.address, await cpToken.balanceOf(farmer1.address));
      await mintCpToken(farmer1, depositAmount1);
      await cpToken.connect(farmer1).increaseAllowance(master.address, depositAmount1);
      // farmer 2 tokens
      await cpToken.connect(farmer2).transfer(governor.address, await cpToken.balanceOf(farmer2.address));
      await mintCpToken(farmer2, depositAmount2);
      await cpToken.connect(farmer2).increaseAllowance(master.address, depositAmount2);
      // farmer 3 tokens
      await solaceToken.connect(governor).transfer(farmer3.address, 10000);
      await mintLpToken(farmer3, weth, solaceToken, FeeAmount.MEDIUM, depositAmount3);
      tokenId3 = await lpToken.totalSupply();
      await lpToken.connect(farmer3).approve(master.address, tokenId3);
      // farmer 4 tokens
      await solaceToken.connect(governor).transfer(farmer4.address, 10000);
      await mintLpToken(farmer4, weth, solaceToken, FeeAmount.MEDIUM, depositAmount4);
      tokenId4 = await lpToken.totalSupply();
      await lpToken.connect(farmer4).approve(master.address, tokenId4);
      // zero out solace balances
      await solaceToken.connect(farmer1).transfer(governor.address, await solaceToken.balanceOf(farmer1.address));
      await solaceToken.connect(farmer2).transfer(governor.address, await solaceToken.balanceOf(farmer2.address));
      await solaceToken.connect(farmer3).transfer(governor.address, await solaceToken.balanceOf(farmer3.address));
      await solaceToken.connect(farmer4).transfer(governor.address, await solaceToken.balanceOf(farmer4.address));
    })

    it("creates multiple farms", async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      // farms start and end at different times, math should still work
      cpFarmId = await master.numFarms();
      await master.connect(governor).createFarmErc20(cpToken.address, cpAllocPoints1, blockNum.add(25), blockNum.add(500));
      lpFarmId = await master.numFarms();
      await master.connect(governor).createFarmErc721(lpToken.address, lpAppraiser.address, lpAllocPoints, blockNum.add(45), blockNum.add(250));
      await burnBlocksUntil(blockNum.add(25), false);
      await master.massUpdateFarms();
    })

    it("fairly provides rewards to all farmers on all farms", async function () {
      // add farmer 1 to cp farm
      await master.connect(farmer1).depositErc20(cpFarmId, depositAmount1);
      // wait 10 blocks
      await burnBlocks(BN.from(10));
      // add farmer 3 to lp farm
      await master.connect(farmer3).depositErc721(lpFarmId, tokenId3);
      // wait 20 blocks
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
      await master.connect(farmer2).depositErc20(cpFarmId, depositAmount2);
      // wait 30 blocks
      await burnBlocks(BN.from(30));
      // add farmer 4 to lp farm
      await master.connect(farmer4).depositErc721(lpFarmId, tokenId4);
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
      await master.connect(governor).setFarmParams(cpFarmId, cpAllocPoints2, blockNum.add(500), true);
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
      await master.connect(governor).setSolacePerBlock(solacePerBlock2, true);
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
      await master.connect(governor).setFarmParams(lpFarmId, lpAllocPoints, endBlock, true);
    })

    it("ends farms properly", async function () {
      burnedBlocks = await burnBlocksUntil(endBlock);
      // governance manually sets alloc to zero
      await master.connect(governor).setFarmParams(lpFarmId, 0, endBlock, true);
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
      await master.connect(farmer1).withdrawErc20(cpFarmId, depositAmount1);
      expect(await cpToken.balanceOf(farmer1.address)).to.equal(depositAmount1);
      pendingReward1 = BN.from(await solaceToken.balanceOf(farmer1.address));
      expectedReward1 = expectedReward1.add(
        (solacePerBlock2.mul(1).div(5)) // 20% ownership of cp farm for 1 block at 100% allocation points
      );
      expect(pendingReward1).to.equal(expectedReward1);
      // validate farmer 2 rewards
      await master.connect(farmer2).withdrawErc20(cpFarmId, depositAmount2);
      expect(await cpToken.balanceOf(farmer2.address)).to.equal(depositAmount2);
      pendingReward2 = BN.from(await solaceToken.balanceOf(farmer2.address));
      expectedReward2 = expectedReward2.add(
        (solacePerBlock2.mul(1).mul(4).div(5)).add // 80% ownership of cp farm for 1 block at 100% allocation points
        (solacePerBlock2) // 100% ownership of cp farm for 1 block at 100% allocation points
      );
      expect(pendingReward2).to.equal(expectedReward2);
      // validate farmer 3 rewards
      await master.connect(farmer3).withdrawErc721(lpFarmId, tokenId3);
      expect(await lpToken.balanceOf(farmer3.address)).to.equal(1);
      pendingReward3 = BN.from(await solaceToken.balanceOf(farmer3.address));
      expectedReward3 = expectedReward3;
      expect(pendingReward3).to.equal(expectedReward3);
      // validate farmer 4 rewards
      await master.connect(farmer4).withdrawErc721(lpFarmId, tokenId4);
      expect(await lpToken.balanceOf(farmer4.address)).to.equal(1);
      pendingReward4 = BN.from(await solaceToken.balanceOf(farmer4.address));
      expectedReward4 = expectedReward4;
      expect(pendingReward4).to.equal(expectedReward4);
    })
  })
});

// helper functions

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
  if(events && events.length > 0 && events[0].args && events[0].args.pool) {
    let poolAddress = events[0].args.pool;
    pool = (new Contract(poolAddress, UniswapV3PoolArtifact.abi)) as Contract;
  } else {
    pool = (new Contract(ZERO_ADDRESS, UniswapV3PoolArtifact.abi)) as Contract;
    expect(true).to.equal(false);
  }
  expect(pool).to.exist;
  if(pool){
    let sqrtPrice = encodePriceSqrt(1,1);
    await pool.connect(governor).initialize(sqrtPrice);
  }
  return pool;
}

// mints some cp tokens by depositing eth
// @ts-ignore
async function mintCpToken(depositor: SignerWithAddress, amount: BigNumberish) {
  let balanceBefore = await cpToken.balanceOf(depositor.address);
  await cpToken.connect(depositor).deposit({ value: amount });
  let balanceAfter = await cpToken.balanceOf(depositor.address);
  expect(balanceAfter.sub(balanceBefore)).to.equal(amount);
}

// mints an lp token by providing liquidity
// @ts-ignore
async function mintLpToken(liquidityProvider: SignerWithAddress, tokenA: Contract, tokenB: Contract, fee: FeeAmount, amount: BigNumberish) {
  let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
  await lpToken.connect(liquidityProvider).mint({
    token0: token0,
    token1: token1,
    tickLower: getMinTick(TICK_SPACINGS[fee]),
    tickUpper: getMaxTick(TICK_SPACINGS[fee]),
    fee: fee,
    recipient: liquidityProvider.address,
    amount0Max: constants.MaxUint256,
    amount1Max: constants.MaxUint256,
    amount: amount,
    deadline: constants.MaxUint256,
  });
  let tokenId = await lpToken.totalSupply();
  let position = await lpToken.positions(tokenId);
  expect(position.liquidity).to.equal(amount);
}
