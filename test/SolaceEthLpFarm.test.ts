import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;

import { burnBlocks, burnBlocksUntil } from "./utilities/time";
import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";
import { encodePath } from "./utilities/path";
import { bnAddSub, bnMulDiv } from "./utilities/math";
import { getPermitDigest, sign, getDomainSeparator } from './utilities/signature';
import getPermitNFTSignature from './utilities/getPermitNFTSignature';

import SolaceArtifact from "../artifacts/contracts/SOLACE.sol/SOLACE.json";
import MasterArtifact from "../artifacts/contracts/Master.sol/Master.json";
import WETHArtifact from "../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json";
import MockERC20Artifact from "../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import SolaceEthLpFarmArtifact from "../artifacts/contracts/SolaceEthLpFarm.sol/SolaceEthLpFarm.json";
import { Solace, Master, MockWeth, MockErc20, SolaceEthLpFarm } from "../typechain";

// uniswap imports
import UniswapV3FactoryArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import SwapRouterArtifact from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";
import NonfungiblePositionManagerArtifact from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

chai.use(solidity);

// TODO: due to integer rounding errors, some math may be off by one
// need to test within a threshold of acceptance

describe("SolaceEthLpFarm", function () {
  // users
  let deployer: Wallet;
  let governor: Wallet;
  let farmer1: Wallet;
  let farmer2: Wallet;
  let farmer3: Wallet;
  let farmer4: Wallet;
  let trader: Wallet;

  // contracts
  let solaceToken: Solace;
  let master: Master;
  let weth: MockWeth;
  let mockToken1: MockErc20;
  let farm: SolaceEthLpFarm;

  // uniswap contracts
  let uniswapFactory: Contract;
  let uniswapRouter: Contract;
  let lpToken: Contract;

  // pools
  let mediumPool: Contract;
  //let mediumPool: IUniswapV3Pool;
  let highPool: Contract;
  let mock1SolacePool: Contract;

  // vars
  let solacePerBlock = BN.from("100000000000000000000"); // 100 e18
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const TEN_ETHER = BN.from("10000000000000000000");
  const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
  let blockNum: BN;
  let startBlock: BN;
  let endBlock: BN;
  let solaceEthLpFarmType = 3;

  const solaceTokenName = "solace.fi";
  const lpTokenName = "Uniswap V3 Positions NFT-V1";
  const chainId = 31337;
  const deadline = constants.MaxUint256;

  before(async function () {
    [deployer, governor, farmer1, farmer2, farmer3, farmer4, trader] = provider.getWallets();

    // deploy solace token
    solaceToken = (await deployContract(
      deployer,
      SolaceArtifact,
      [
        governor.address
      ]
    )) as Solace;

    // deploy weth
    weth = (await deployContract(
        deployer,
        WETHArtifact
    )) as MockWeth;

    // deploy mock token 1
    mockToken1 = (await deployContract(
        deployer,
        MockERC20Artifact,
        [
          "Mock Token 1",
          "MKT1",
          ONE_MILLION_ETHER
        ]
    )) as MockErc20;

    // deploy master contract
    master = (await deployContract(
      deployer,
      MasterArtifact,
      [
        governor.address,
        solaceToken.address,
        solacePerBlock
      ]
    )) as Master;

    // deploy uniswap factory
    uniswapFactory = (await deployContract(
      deployer,
      UniswapV3FactoryArtifact
    )) as Contract;

    // deploy uniswap router
    uniswapRouter = (await deployContract(
      deployer,
      SwapRouterArtifact,
      [
        uniswapFactory.address,
        weth.address
      ]
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

    // transfer tokens
    await solaceToken.connect(governor).addMinter(governor.address);
    await solaceToken.connect(governor).mint(master.address, ONE_MILLION_ETHER);
    await solaceToken.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solaceToken.connect(governor).transfer(farmer1.address, TEN_ETHER);
    await solaceToken.connect(governor).transfer(farmer2.address, TEN_ETHER);
    await solaceToken.connect(governor).transfer(farmer3.address, TEN_ETHER);
    await solaceToken.connect(governor).transfer(farmer4.address, TEN_ETHER);
    await solaceToken.connect(governor).transfer(trader.address, TEN_ETHER);
    await weth.connect(farmer1).deposit({value: TEN_ETHER});
    await weth.connect(farmer2).deposit({value: TEN_ETHER});
    await weth.connect(farmer3).deposit({value: TEN_ETHER});
    await weth.connect(farmer4).deposit({value: TEN_ETHER});
    await weth.connect(trader).deposit({value: TEN_ETHER});
    await mockToken1.transfer(farmer1.address, TEN_ETHER);
    await mockToken1.transfer(trader.address, TEN_ETHER);

    // approve tokens
    await solaceToken.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await solaceToken.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await solaceToken.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
    await solaceToken.connect(farmer4).approve(lpToken.address, constants.MaxUint256);
    await solaceToken.connect(trader).approve(uniswapRouter.address, constants.MaxUint256);
    await weth.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer4).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(trader).approve(uniswapRouter.address, constants.MaxUint256);
    await mockToken1.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await mockToken1.connect(trader).approve(uniswapRouter.address, constants.MaxUint256);

    // create pools
    mediumPool = await createPool(weth, solaceToken, FeeAmount.MEDIUM);
    highPool = await createPool(weth, solaceToken, FeeAmount.HIGH);
    mock1SolacePool = await createPool(mockToken1, solaceToken, FeeAmount.MEDIUM);
  })

  describe("farm creation", function () {
    startBlock = BN.from(5), endBlock = BN.from(6);

    it("can create farms", async function () {
      farm = await createSolaceEthLpFarm(lpToken, startBlock, endBlock, mediumPool);
    })

    it("returns farm information", async function () {
      expect(await farm.master()).to.equal(master.address);
      expect(await farm.lpToken()).to.equal(lpToken.address);
      expect(await farm.solace()).to.equal(solaceToken.address);
      expect(await farm.blockReward()).to.equal(0);
      expect(await farm.startBlock()).to.equal(startBlock);
      expect(await farm.endBlock()).to.equal(endBlock);
      expect(await farm.farmType()).to.equal(solaceEthLpFarmType);
      expect(await farm.valueStaked()).to.equal(0);
    })
  })

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await farm.governance()).to.equal(governor.address);
    })

    it("can transfer governance", async function () {
      await farm.connect(governor).setGovernance(deployer.address);
      expect(await farm.governance()).to.equal(deployer.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(farm.connect(governor).setGovernance(deployer.address)).to.be.revertedWith("!governance");
      await farm.connect(deployer).setGovernance(governor.address);
    })
  })

  describe("deposit and withdraw", function () {
    let userInfo: any;
    let tokenId1: BN, tokenId2: BN, tokenId3: BN, tokenId4: BN, tokenId5: BN;
    let depositAmount1 = BN.from(1);
    let depositAmount2 = BN.from(4);
    let depositAmount3 = BN.from(2);
    let depositAmount4 = BN.from(9);
    let depositAmount5 = BN.from(25);
    let tokenValue1: BN;
    let tokenValue2: BN;
    let tokenValue3: BN;
    let tokenValue4: BN;
    let tokenValue5: BN;
    let tokenValue12: BN;
    let tokenValue13: BN;
    let tokenValue123: BN;

    before(async function () {
      farm = await createSolaceEthLpFarm(lpToken, startBlock, endBlock, mediumPool);
    })

    it("can deposit", async function () {
      // empty
      expect(await farm.countDeposited(farmer1.address)).to.equal(0);
      expect(await farm.listDeposited(farmer1.address)).to.deep.equal([ [], [] ]);
      // farmer 1, deposit 1
      tokenId1 = await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, depositAmount1);
      tokenValue1 = await farm.appraise(tokenId1);
      expect((await farm.tokenInfo(tokenId1)).depositor).to.equal(ZERO_ADDRESS);
      await lpToken.connect(farmer1).approve(farm.address, tokenId1);
      let tx1 = await farm.connect(farmer1).deposit(tokenId1);
      await expect(tx1).to.emit(farm, "Deposit").withArgs(farmer1.address, tokenId1);
      expect(await lpToken.balanceOf(farm.address)).to.equal(1);
      userInfo = await farm.userInfo(farmer1.address);
      expect(await farm.countDeposited(farmer1.address)).to.equal(1);
      expect(await farm.getDeposited(farmer1.address, 0)).to.deep.equal([tokenId1, tokenValue1]);
      expect(await farm.listDeposited(farmer1.address)).to.deep.equal([ [tokenId1], [tokenValue1] ]);
      expect((await farm.tokenInfo(tokenId1)).depositor).to.equal(farmer1.address);
      // farmer 2, deposit 4
      tokenId2 = await mintLpToken(farmer2, weth, solaceToken, FeeAmount.MEDIUM, depositAmount2);
      tokenValue2 = await farm.appraise(tokenId2);
      tokenValue12 = tokenValue1.add(tokenValue2);
      await lpToken.connect(farmer2).approve(farm.address, tokenId2);
      let tx2 = await farm.connect(farmer2).deposit(tokenId2);
      await expect(tx2).to.emit(farm, "Deposit").withArgs(farmer2.address, tokenId2);
      expect(await lpToken.balanceOf(farm.address)).to.equal(2);
      userInfo = await farm.userInfo(farmer2.address);
      expect(await farm.countDeposited(farmer2.address)).to.equal(1);
      expect(await farm.getDeposited(farmer2.address, 0)).to.deep.equal([ tokenId2, tokenValue2 ]);
      expect(await farm.listDeposited(farmer2.address)).to.deep.equal([ [tokenId2], [tokenValue2] ]);
      expect((await farm.tokenInfo(tokenId2)).depositor).to.equal(farmer2.address);
      // farmer 1, deposit 2
      tokenId3 = await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, depositAmount3);
      tokenValue3 = await farm.appraise(tokenId3);
      tokenValue13 = tokenValue1.add(tokenValue3);
      tokenValue123 = tokenValue1.add(tokenValue2).add(tokenValue3);
      await lpToken.connect(farmer1).approve(farm.address, tokenId3);
      let tx3 = await farm.connect(farmer1).deposit(tokenId3);
      await expect(tx3).to.emit(farm, "Deposit").withArgs(farmer1.address, tokenId3);
      expect(await lpToken.balanceOf(farm.address)).to.equal(3);
      userInfo = await farm.userInfo(farmer1.address);
      expect(await farm.countDeposited(farmer1.address)).to.equal(2);
      expect(await farm.getDeposited(farmer1.address, 1)).to.deep.equal([ tokenId3, tokenValue3 ]);
      expect(await farm.listDeposited(farmer1.address)).to.deep.equal([ [tokenId1,tokenId3], [tokenValue1,tokenValue3] ]);
      expect((await farm.tokenInfo(tokenId3)).depositor).to.equal(farmer1.address);
    })

    it("can deposit via permit", async function () {
      tokenId4 = await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, depositAmount4);
      tokenValue4 = await farm.appraise(tokenId4);
      expect((await farm.tokenInfo(tokenId4)).depositor).to.equal(ZERO_ADDRESS);
      const { v, r, s } = await getPermitNFTSignature(farmer1, lpToken, farm.address, tokenId4, deadline);
      let tx1 = await farm.connect(farmer1).depositSigned(farmer1.address, tokenId4, deadline, v, r, s);
      await expect(tx1).to.emit(farm, "Deposit").withArgs(farmer1.address, tokenId4);
      expect(await lpToken.balanceOf(farm.address)).to.equal(4);
      userInfo = await farm.userInfo(farmer1.address);
      expect(await farm.countDeposited(farmer1.address)).to.equal(3);
      expect(await farm.getDeposited(farmer1.address, 2)).to.deep.equal([ tokenId4, tokenValue4 ]);
      expect(await farm.listDeposited(farmer1.address)).to.deep.equal([ [tokenId1,tokenId3,tokenId4], [tokenValue1,tokenValue3,tokenValue4] ]);
      expect((await farm.tokenInfo(tokenId4)).depositor).to.equal(farmer1.address);
    })

    it("can deposit via mintAndDeposit", async function () {
      let balancesBefore = await getBalances(farmer1);
      let excessiveDepositAmount = depositAmount5.mul(10);
      let nonce = await solaceToken.nonces(farmer1.address);
      let approve = {
        owner: farmer1.address,
        spender: farm.address,
        value: excessiveDepositAmount
      };
      let digest = getPermitDigest(solaceTokenName, solaceToken.address, chainId, approve, nonce, deadline);
      let { v, r, s } = sign(digest, Buffer.from(farmer1.privateKey.slice(2), 'hex'));
      let tx1 = await farm.connect(farmer1).mintAndDeposit({
          depositor: farmer1.address,
          amountSolace: excessiveDepositAmount,
          amount0Desired: depositAmount5,
          amount1Desired: depositAmount5,
          amount0Min: 0,
          amount1Min: 0,
          deadline: deadline,
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          v: v,
          r: r,
          s: s,
      }, {value: excessiveDepositAmount});
      tokenId5 = await lpToken.totalSupply();
      tokenValue5 = await farm.appraise(tokenId5);
      await expect(tx1).to.emit(farm, "Deposit").withArgs(farmer1.address, tokenId5);
      let balancesAfter = await getBalances(farmer1);
      let balancesDiff = getBalancesDiff(balancesBefore, balancesAfter);
      let receipt = await tx1.wait();
      let gasCost = receipt.gasUsed.mul(tx1.gasPrice);
      expect(balancesDiff.userEth).to.equal(depositAmount5.add(gasCost));
      expect(balancesDiff.userSolace).to.equal(depositAmount5);
      expect(await farm.countDeposited(farmer1.address)).to.equal(4);
      expect(await farm.getDeposited(farmer1.address, 3)).to.deep.equal([ tokenId5, tokenValue5 ]);
      expect(await farm.listDeposited(farmer1.address)).to.deep.equal([ [tokenId1,tokenId3,tokenId4,tokenId5], [tokenValue1,tokenValue3,tokenValue4,tokenValue5] ]);
      expect((await farm.tokenInfo(tokenId5)).depositor).to.equal(farmer1.address);
      let position = await lpToken.positions(tokenId5);
      expect(position.token0 == solaceToken.address || position.token1 == solaceToken.address);
      expect(position.token0 == weth.address || position.token1 == weth.address);
      expect(position.tickLower).to.equal(getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]));
      expect(position.tickUpper).to.equal(getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]));
    })

    it("cannot deposit when lacking funds", async function () {
      // non existant token
      let tokenId = (await lpToken.totalSupply()).add(2);
      await expect(farm.connect(farmer1).deposit(tokenId)).to.be.reverted;
      // deposit without approval
      tokenId = await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, 1);
      await expect(farm.connect(farmer1).deposit(tokenId)).to.be.reverted;
      // deposit someone elses token
      await expect(farm.connect(farmer2).deposit(tokenId)).to.be.reverted;
      await lpToken.connect(farmer1).approve(farm.address, tokenId);
      await expect(farm.connect(farmer2).deposit(tokenId)).to.be.reverted;
    })

    it("cannot deposit tokens from other pools", async function () {
      // high fee pool
      let tokenId1 = await mintLpToken(
        farmer1,
        weth,
        solaceToken,
        FeeAmount.HIGH,
        1,
        getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        getMaxTick(TICK_SPACINGS[FeeAmount.HIGH])
      );
      await lpToken.connect(farmer1).approve(farm.address, tokenId1);
      await expect(farm.connect(farmer1).deposit(tokenId1)).to.be.revertedWith("wrong pool");
      // mock token pool
      let tokenId2 = await mintLpToken(
        farmer1,
        mockToken1,
        solaceToken,
        FeeAmount.MEDIUM,
        1,
        getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM])
      );
      await lpToken.connect(farmer1).approve(farm.address, tokenId2);
      await expect(farm.connect(farmer1).deposit(tokenId2)).to.be.revertedWith("wrong pool");
    })

    it("can withdraw rewards", async function () {
      await farm.connect(farmer1).withdrawRewards(); // value checked in later tests
    })

    it("can withdraw deposited tokens", async function () {
      let balance1: BN;
      let balance2: BN;
      // farmer 1, partial withdraw
      balance1 = await lpToken.balanceOf(farm.address);
      let tx5 = await farm.connect(farmer1).withdraw(tokenId5);
      await expect(tx5).to.emit(farm, "Withdraw").withArgs(farmer1.address, tokenId5);
      balance2 = await lpToken.balanceOf(farm.address);
      expect(balance1.sub(balance2)).to.equal(1);
      userInfo = await farm.userInfo(farmer1.address);
      expect(await farm.countDeposited(farmer1.address)).to.equal(3);
      expect((await farm.tokenInfo(tokenId5)).depositor).to.equal(ZERO_ADDRESS);
      // farmer 1, partial withdraw
      balance1 = await lpToken.balanceOf(farm.address);
      let tx4 = await farm.connect(farmer1).withdraw(tokenId4);
      await expect(tx4).to.emit(farm, "Withdraw").withArgs(farmer1.address, tokenId4);
      balance2 = await lpToken.balanceOf(farm.address);
      expect(balance1.sub(balance2)).to.equal(1);
      userInfo = await farm.userInfo(farmer1.address);
      expect(await farm.countDeposited(farmer1.address)).to.equal(2);
      expect((await farm.tokenInfo(tokenId4)).depositor).to.equal(ZERO_ADDRESS);
      // farmer 1, partial withdraw
      balance1 = await lpToken.balanceOf(farm.address);
      let tx1 = await farm.connect(farmer1).withdraw(tokenId1);
      await expect(tx1).to.emit(farm, "Withdraw").withArgs(farmer1.address, tokenId1);
      balance2 = await lpToken.balanceOf(farm.address);
      expect(balance1.sub(balance2)).to.equal(1);
      userInfo = await farm.userInfo(farmer1.address);
      expect(await farm.countDeposited(farmer1.address)).to.equal(1);
      expect(await farm.getDeposited(farmer1.address, 0)).to.deep.equal([ tokenId3, tokenValue3 ]);
      expect(await farm.listDeposited(farmer1.address)).to.deep.equal([ [tokenId3], [tokenValue3] ]);
      expect((await farm.tokenInfo(tokenId1)).depositor).to.equal(ZERO_ADDRESS);
      // farmer 1, full withdraw
      balance1 = await lpToken.balanceOf(farm.address);
      let tx2 = await farm.connect(farmer1).withdraw(tokenId3);
      await expect(tx2).to.emit(farm, "Withdraw").withArgs(farmer1.address, tokenId3);
      balance2 = await lpToken.balanceOf(farm.address);
      expect(balance1.sub(balance2)).to.equal(1);
      userInfo = await farm.userInfo(farmer1.address);
      expect(await farm.countDeposited(farmer1.address)).to.equal(0);
      expect(await farm.listDeposited(farmer1.address)).to.deep.equal([ [], [] ]);
      expect((await farm.tokenInfo(tokenId3)).depositor).to.equal(ZERO_ADDRESS);
      // farmer 2, full withdraw
      balance1 = await lpToken.balanceOf(farm.address);
      let tx3 = await farm.connect(farmer2).withdraw(tokenId2);
      await expect(tx3).to.emit(farm, "Withdraw").withArgs(farmer2.address, tokenId2);
      balance2 = await lpToken.balanceOf(farm.address);
      expect(balance1.sub(balance2)).to.equal(1);
      userInfo = await farm.userInfo(farmer2.address);
      expect(await farm.countDeposited(farmer2.address)).to.equal(0);
      expect(await farm.listDeposited(farmer2.address)).to.deep.equal([ [], [] ]);
      expect((await farm.tokenInfo(tokenId2)).depositor).to.equal(ZERO_ADDRESS);
    })

    it("cannot overwithdraw", async function () {
      // withdraw without deposit
      await expect(farm.connect(farmer1).withdraw(tokenId1)).to.be.reverted;
      // deposit one and withdraw another
      await lpToken.connect(farmer1).approve(farm.address, tokenId1);
      await farm.connect(farmer1).deposit(tokenId1);
      await expect(farm.connect(farmer1).withdraw(tokenId3)).to.be.reverted;
      // withdraw a token someone else deposited
      await expect(farm.connect(farmer2).withdraw(tokenId1)).to.be.reverted;
    })
  })

  describe("updates", async function () {
    beforeEach(async function () {
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(10);
      endBlock = blockNum.add(100);
      farm = await createSolaceEthLpFarm(lpToken, startBlock, endBlock, mediumPool);
    })

    it("can update a single farm", async function () {
      // init
      expect(await farm.lastRewardBlock()).to.equal(startBlock);
      // update before start
      await farm.updateFarm();
      expect(await farm.lastRewardBlock()).to.equal(startBlock);
      // update after start
      await burnBlocks(30);
      await farm.updateFarm();
      blockNum = BN.from(await provider.getBlockNumber());
      expect(await farm.lastRewardBlock()).to.equal(blockNum);
      // update after end
      await burnBlocks(90);
      await farm.updateFarm();
      expect(await farm.lastRewardBlock()).to.equal(endBlock);
    })
  })

  describe("rewards", function () {
    // TODO: token appraisal does NOT properly account for liquidity range
    // a position in the range [0,1] has 333x more liquidity than a position in the entire range
    // this simply tests if the tokens are activated or deactivated as price changes

    let allocPoints = BN.from("1");
    // tokens
    let tokenId1: BN;
    let tokenId2: BN;
    let tokenId3: BN;
    let depositAmount1 = BN.from("10");
    let depositAmount2 = BN.from("40");
    let depositAmount3 = BN.from("190");
    let tokenValue1: BN;
    let tokenValue2: BN;
    let tokenValue3: BN;
    let tokenValue12: BN;
    let tokenValue13: BN;
    let tokenValue23: BN;
    let tokenValue123: BN;
    // reward math variables
    let pendingReward1: BN;
    let pendingReward2: BN;
    let expectedPendingReward1: BN;
    let expectedPendingReward2: BN;
    let expectedReceivedReward1: BN;
    let expectedReceivedReward2: BN;
    let receivedReward1: BN;
    let receivedReward2: BN;
    let balanceBefore1: BN;
    let balanceBefore2: BN;
    let balanceAfter1: BN;
    let balanceAfter2: BN;
    // ticks
    let tick: BN;
    let spacing = TICK_SPACINGS[FeeAmount.MEDIUM]; // 60

    before(async function () {
      // transfer some solace
      await solaceToken.connect(governor).transfer(farmer1.address, 10000);
      await solaceToken.connect(governor).transfer(farmer2.address, 10000);
      // zero out other farm rewards
      let numFarms = await master.numFarms();
      for(var i = BN.from(1); i.lte(numFarms); i = i.add(1)) {
        await master.setAllocPoints(i, 0);
      }
      // create farm
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(400);
      farm = await createSolaceEthLpFarm(lpToken, startBlock, endBlock, mediumPool);
      await master.connect(governor).registerFarm(farm.address, allocPoints);
    })

    it("accounts for token values", async function () {
      // mint tokens
      tick = BN.from((await mediumPool.slot0()).tick);
      // range [-1, +2]
      tokenId1 = await mintLpToken(
        farmer1,
        weth,
        solaceToken,
        FeeAmount.MEDIUM,
        depositAmount1,
        tick.sub(1 * spacing),
        tick.add(2 * spacing)
      );
      tokenValue1 = await farm.appraise(tokenId1);
      await lpToken.connect(farmer1).approve(farm.address, tokenId1);
      await farm.connect(farmer1).deposit(tokenId1);
      expect((await farm.userInfo(farmer1.address)).value).to.equal(tokenValue1);
      expect(await farm.valueStaked()).to.equal(tokenValue1);
      // range [0, +1]
      tokenId2 = await mintLpToken(
        farmer2,
        weth,
        solaceToken,
        FeeAmount.MEDIUM,
        depositAmount2,
        tick.add(0 * spacing),
        tick.add(1 * spacing)
      );
      tokenValue2 = await farm.appraise(tokenId2);
      tokenValue12 = tokenValue1.add(tokenValue2);
      await lpToken.connect(farmer2).approve(farm.address, tokenId2);
      await farm.connect(farmer2).deposit(tokenId2);
      expect((await farm.userInfo(farmer2.address)).value).to.equal(tokenValue2);
      expect(await farm.valueStaked()).to.equal(tokenValue12);
      // range [+1, +2]
      tokenId3 = await mintLpToken(
        farmer2,
        weth,
        solaceToken,
        FeeAmount.MEDIUM,
        depositAmount3,
        tick.add(1 * spacing),
        tick.add(2 * spacing)
      );
      tokenValue3 = await farm.appraise(tokenId3);
      tokenValue13 = tokenValue1.add(tokenValue3);
      tokenValue23 = tokenValue2.add(tokenValue3);
      tokenValue123 = tokenValue1.add(tokenValue2).add(tokenValue3);
      await lpToken.connect(farmer2).approve(farm.address, tokenId3);
      await farm.connect(farmer2).deposit(tokenId3);
      expect((await farm.userInfo(farmer2.address)).value).to.equal(tokenValue2); // token 3 not in range
      expect(await farm.valueStaked()).to.equal(tokenValue12);

      balanceBefore1 = await solaceToken.balanceOf(farmer1.address);
      balanceBefore2 = await solaceToken.balanceOf(farmer2.address);
    })

    it("only values tokens in range", async function () {
      // at range [0,1]
      await burnBlocksUntil(startBlock.add(10));
      // check farmer 1 rewards
      pendingReward1 = await farm.pendingRewards(farmer1.address)
      expectedPendingReward1 = bnMulDiv([solacePerBlock, 10, tokenValue1], [tokenValue12]) // ?% ownership for 10 blocks
      expect(pendingReward1).to.equal(expectedPendingReward1);
      // check farmer 2 rewards
      pendingReward2 = await farm.pendingRewards(farmer2.address)
      expectedPendingReward2 = bnMulDiv([solacePerBlock, 10, tokenValue2], [tokenValue12]); // ?% ownership for 10 blocks
      expect(pendingReward2).to.equal(expectedPendingReward2);
    })

    it("may lag behind pool swap left", async function () {
      // swap to range [-1,0]
      let solaceWethPath = encodePath([solaceToken.address, weth.address], [FeeAmount.MEDIUM]);
      let wethSolacePath = encodePath([weth.address, solaceToken.address], [FeeAmount.MEDIUM]);
      let path = BN.from(solaceToken.address).lt(BN.from(weth.address)) ? solaceWethPath : wethSolacePath;
      await uniswapRouter.connect(trader).exactInput({
        path: path,
        recipient: trader.address,
        deadline: constants.MaxUint256,
        amountIn: 5,
        amountOutMinimum: 0
      });
      let newTick = (await mediumPool.slot0()).tick; // -43
      expect(newTick).to.be.gte(tick.sub(spacing));
      expect(newTick).to.be.lt(tick);
      // farm doesn't now about tick cross yet
      expect((await farm.userInfo(farmer1.address)).value).to.equal(tokenValue1);
      expect((await farm.userInfo(farmer2.address)).value).to.equal(tokenValue2);
      expect(await farm.valueStaked()).to.equal(tokenValue12);
      await burnBlocks(20);
      // check farmer 1 rewards
      pendingReward1 = await farm.pendingRewards(farmer1.address)
      expectedPendingReward1 = bnAddSub([
        expectedPendingReward1,
        bnMulDiv([solacePerBlock, 21, tokenValue1], [tokenValue12]) // ?% ownership for 21 blocks
      ]);
      expect(pendingReward1).to.equal(expectedPendingReward1);
      // check farmer 2 rewards
      pendingReward2 = await farm.pendingRewards(farmer2.address);
      expectedPendingReward2 = bnAddSub([
        expectedPendingReward2,
        bnMulDiv([solacePerBlock, 21, tokenValue2], [tokenValue12]), // ?% ownership for 21 blocks
        1 // off by one error
      ]);
      expect(pendingReward2).to.equal(expectedPendingReward2);
    })

    it("catches up to pool swap left after update", async function () {
      // update
      await farm.updateFarm();
      expect((await farm.userInfo(farmer1.address)).value).to.equal(tokenValue1);
      expect((await farm.userInfo(farmer2.address)).value).to.equal(0);
      expect(await farm.valueStaked()).to.equal(tokenValue1);
      await burnBlocks(30);
      // check farmer 1 rewards
      pendingReward1 = await farm.pendingRewards(farmer1.address)
      expectedPendingReward1 = bnAddSub([
        expectedPendingReward1,
        bnMulDiv([solacePerBlock, 1, tokenValue1], [tokenValue12]), // ?% ownership for 1 block
        bnMulDiv([solacePerBlock, 30]) // 100% ownership for 30 blocks
      ]);
      expect(pendingReward1).to.equal(expectedPendingReward1);
      // check farmer 2 rewards
      pendingReward2 = await farm.pendingRewards(farmer2.address);
      expectedPendingReward2 = bnAddSub([
        expectedPendingReward2,
        bnMulDiv([solacePerBlock, 1, tokenValue2], [tokenValue12]), // ?% ownership for 1 block
        1 // off by one error
      ]);
      expect(pendingReward2).to.equal(expectedPendingReward2);
    })

    it("may lag behind pool swap right", async function () {
      // swap to range [+1,+2]
      let solaceWethPath = encodePath([solaceToken.address, weth.address], [FeeAmount.MEDIUM]);
      let wethSolacePath = encodePath([weth.address, solaceToken.address], [FeeAmount.MEDIUM]);
      let path = BN.from(solaceToken.address).lt(BN.from(weth.address)) ? wethSolacePath : solaceWethPath;
      await uniswapRouter.connect(trader).exactInput({
        path: path,
        recipient: trader.address,
        deadline: constants.MaxUint256,
        amountIn: 70,
        amountOutMinimum: 0
      });
      let newTick = (await mediumPool.slot0()).tick; // +65
      expect(newTick).to.be.gte(tick.add(spacing));
      expect(newTick).to.be.lt(tick.add(2 * spacing));
      // farm doesn't now about tick cross yet
      expect((await farm.userInfo(farmer1.address)).value).to.equal(tokenValue1);
      expect((await farm.userInfo(farmer2.address)).value).to.equal(0);
      expect(await farm.valueStaked()).to.equal(tokenValue1);
      await burnBlocks(40);
      // check farmer 1 rewards
      pendingReward1 = await farm.pendingRewards(farmer1.address)
      expectedPendingReward1 = bnAddSub([
        expectedPendingReward1,
        bnMulDiv([solacePerBlock, 41]) // 100% ownership for 41 blocks
      ]);
      expect(pendingReward1).to.equal(expectedPendingReward1);
      // check farmer 2 rewards
      pendingReward2 = await farm.pendingRewards(farmer2.address);
      expectedPendingReward2 = expectedPendingReward2;
      expect(pendingReward2).to.equal(expectedPendingReward2);
    })

    it("catches up to pool swap right after update", async function () {
      // update
      await farm.updateFarm();
      expect((await farm.userInfo(farmer1.address)).value).to.equal(tokenValue1);
      expect((await farm.userInfo(farmer2.address)).value).to.equal(tokenValue3);
      expect(await farm.valueStaked()).to.equal(tokenValue13);
      await burnBlocks(50);
      // check farmer 1 rewards
      pendingReward1 = await farm.pendingRewards(farmer1.address)
      expectedPendingReward1 = bnAddSub([
        expectedPendingReward1,
        bnMulDiv([solacePerBlock, 1]), // 100% ownership for 1 block
        bnMulDiv([solacePerBlock, 50, tokenValue1], [tokenValue13]) // ?% ownership for 50 blocks
      ]);
      expect(pendingReward1).to.equal(expectedPendingReward1);
      // check farmer 2 rewards
      pendingReward2 = await farm.pendingRewards(farmer2.address);
      expectedPendingReward2 = bnAddSub([
        expectedPendingReward2,
        bnMulDiv([solacePerBlock, 50, tokenValue3], [tokenValue13]), // ?% ownership for 50 blocks
        1 // off by one error
      ]);
      expect(pendingReward2).to.equal(expectedPendingReward2);
    })

    it("can withdraw rewards", async function () {
      // farmer 1 withdraw rewards
      await farm.connect(farmer1).withdrawRewards();
      balanceAfter1 = await solaceToken.balanceOf(farmer1.address);
      expectedReceivedReward1 = bnAddSub([
        expectedPendingReward1,
        bnMulDiv([solacePerBlock, 1, tokenValue1], [tokenValue13]), // ?% ownership for 1 blocks
        1 // off by one error
      ]);
      receivedReward1 = balanceAfter1.sub(balanceBefore1);
      expect(receivedReward1).to.equal(expectedReceivedReward1);
      // farmer 2 withdraw rewards
      await farm.connect(farmer2).withdrawRewards();
      balanceAfter2 = await solaceToken.balanceOf(farmer2.address);
      expectedReceivedReward2 = bnAddSub([
        expectedPendingReward2,
        bnMulDiv([solacePerBlock, 2, tokenValue3], [tokenValue13]) // ?% ownership for 2 blocks
      ]);
      receivedReward2 = balanceAfter2.sub(balanceBefore2);
      expect(receivedReward2).to.equal(expectedReceivedReward2);
    })

    it("can withdraw stake", async function () {
      // farmer 2 withdraw token 2
      await farm.connect(farmer2).withdraw(tokenId2);
      expect((await farm.userInfo(farmer2.address)).value).to.equal(tokenValue3);
      expect(await farm.valueStaked()).to.equal(tokenValue13);
      await burnBlocks(60);
      // check farmer 1 rewards
      pendingReward1 = await farm.pendingRewards(farmer1.address);
      expectedPendingReward1 = bnMulDiv([solacePerBlock, 62, tokenValue1], [tokenValue13]); // ?% ownership for 62 blocks
      expect(pendingReward1).to.equal(expectedPendingReward1);
      // check farmer 2 rewards
      balanceAfter2 = await solaceToken.balanceOf(farmer2.address);
      expectedReceivedReward2 = bnAddSub([
        expectedReceivedReward2,
        bnMulDiv([solacePerBlock, 1, tokenValue3], [tokenValue13]), // ?% ownership for 1 blocks
        1 // off by one error
      ]);
      receivedReward2 = balanceAfter2.sub(balanceBefore2);
      expect(receivedReward2).to.equal(expectedReceivedReward2);
      pendingReward2 = await farm.pendingRewards(farmer2.address);
      expectedPendingReward2 = bnMulDiv([solacePerBlock, 60, tokenValue3], [tokenValue13]).add(1); // ?% ownership for 60 block, off by one error
      expect(pendingReward2).to.equal(expectedPendingReward2);
      // farmer 1 withdraw token 1
      await farm.connect(farmer1).withdraw(tokenId1);
      expect((await farm.userInfo(farmer1.address)).value).to.equal(0);
      expect(await farm.valueStaked()).to.equal(tokenValue3);
      await burnBlocks(70);
      // check farmer 1 rewards
      balanceAfter1 = await solaceToken.balanceOf(farmer1.address);
      expectedReceivedReward1 = bnAddSub([
        expectedReceivedReward1,
        expectedPendingReward1,
        bnMulDiv([solacePerBlock, 1, tokenValue1], [tokenValue13]), // ?% ownership for 1 block
        1 // off by one error
      ]);
      receivedReward1 = balanceAfter1.sub(balanceBefore1);
      expect(receivedReward1).to.equal(expectedReceivedReward1);
      pendingReward1 = await farm.pendingRewards(farmer1.address);
      expect(pendingReward1).to.equal(0);
      // check farmer 2 rewards
      pendingReward2 = await farm.pendingRewards(farmer2.address);
      expectedPendingReward2 = bnAddSub([
        expectedPendingReward2,
        bnMulDiv([solacePerBlock, 1, tokenValue3], [tokenValue13]), // ?% ownership for 1 block
        bnMulDiv([solacePerBlock, 70]) // 100% ownership for 70 blocks
      ]);
      expect(pendingReward2).to.equal(expectedPendingReward2);
      // farmer 2 withdraw token 3
      await farm.connect(farmer2).withdraw(tokenId3);
      expect((await farm.userInfo(farmer2.address)).value).to.equal(0);
      expect(await farm.valueStaked()).to.equal(0);
      // check farmer 2 rewards
      balanceAfter2 = await solaceToken.balanceOf(farmer2.address);
      expectedReceivedReward2 = bnAddSub([
        expectedReceivedReward2,
        expectedPendingReward2,
        bnMulDiv([solacePerBlock, 1]) // 100% ownership for 1 block
      ]);
      receivedReward2 = balanceAfter2.sub(balanceBefore2);
      expect(receivedReward2).to.equal(expectedReceivedReward2);
      pendingReward2 = await farm.pendingRewards(farmer2.address);
      expect(pendingReward2).to.equal(0);
    })
  })

  describe("beginning and end", function () {
    let allocPoints = BN.from("1");

    beforeEach(async function () {
      // transfer some solace
      await solaceToken.connect(governor).transfer(farmer1.address, 10000);
      await solaceToken.connect(governor).transfer(farmer2.address, 10000);
      // create farm
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(30);
      farm = await createSolaceEthLpFarm(lpToken, startBlock, endBlock, mediumPool);
      await master.connect(governor).registerFarm(farm.address, allocPoints);
    })

    it("does not distribute rewards before farm start", async function () {
      let tokenId = await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, 100);
      await lpToken.connect(farmer1).approve(farm.address, tokenId);
      await farm.connect(farmer1).deposit(tokenId);
      await burnBlocksUntil(startBlock);
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
    })

    it("does not distribute rewards after farm end", async function () {
      let tokenId = await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, 100);
      await lpToken.connect(farmer1).approve(farm.address, tokenId);
      await farm.connect(farmer1).deposit(tokenId);
      await burnBlocksUntil(endBlock);
      let pendingReward1 = await farm.pendingRewards(farmer1.address);
      await burnBlocks(10);
      let pendingReward2 = await farm.pendingRewards(farmer1.address);
      expect(pendingReward2).to.equal(pendingReward1);
    })
  })

  describe("safe rewards", function () {
    before(async function () {
      // transfer some solace
      await solaceToken.connect(governor).transfer(farmer1.address, 10000);
      // create farm
      blockNum = BN.from(await provider.getBlockNumber());
      startBlock = blockNum.add(20);
      endBlock = blockNum.add(30);
      farm = await createSolaceEthLpFarm(lpToken, startBlock, endBlock, mediumPool);
      await master.connect(governor).registerFarm(farm.address, 100);
      // increase solace distribution
      await master.connect(governor).setSolacePerBlock(await solaceToken.balanceOf(master.address));
      // deposit token
      let tokenId = await mintLpToken(farmer1, weth, solaceToken, FeeAmount.MEDIUM, 100);
      await lpToken.connect(farmer1).approve(farm.address, tokenId);
      await farm.connect(farmer1).deposit(tokenId);
      await burnBlocksUntil(endBlock);
    })

    it("tracks unpaid rewards", async function () {
      expect((await farm.userInfo(farmer1.address)).unpaidRewards).to.equal(0);
      let pendingReward1 = await farm.pendingRewards(farmer1.address);
      let masterBalance = await solaceToken.balanceOf(master.address);
      expect(pendingReward1).to.be.gt(masterBalance);
      let farmerBalanceBefore = await solaceToken.balanceOf(farmer1.address);
      await farm.connect(farmer1).withdrawRewards();
      let farmerBalanceAfter = await solaceToken.balanceOf(farmer1.address);
      expect(farmerBalanceAfter.sub(farmerBalanceBefore)).to.equal(masterBalance);
      expect(await solaceToken.balanceOf(master.address)).to.equal(0);
      let expectedUnpaid = pendingReward1.sub(masterBalance);
      expect((await farm.userInfo(farmer1.address)).unpaidRewards).to.equal(expectedUnpaid);
      let pendingReward2 = await farm.pendingRewards(farmer1.address);
      expect(pendingReward2).to.equal(expectedUnpaid);
    })

    it("pays when funds are available", async function () {
      let unpaidRewards = (await farm.userInfo(farmer1.address)).unpaidRewards;
      await solaceToken.connect(governor).mint(master.address, unpaidRewards);
      let farmerBalanceBefore = await solaceToken.balanceOf(farmer1.address);
      await farm.connect(farmer1).withdrawRewards();
      let farmerBalanceAfter = await solaceToken.balanceOf(farmer1.address);
      expect(farmerBalanceAfter.sub(farmerBalanceBefore)).to.equal(unpaidRewards);
      expect((await farm.userInfo(farmer1.address)).unpaidRewards).to.equal(0);
      expect(await farm.pendingRewards(farmer1.address)).to.equal(0);
    })
  })

  // helper functions

  // uniswap requires tokens to be in order
  function sortTokens(tokenA: string, tokenB: string) {
    return BN.from(tokenA).lt(BN.from(tokenB)) ? [tokenA, tokenB] : [tokenB, tokenA];
  }

  // creates, initializes, and returns a pool
  async function createPool(tokenA: Contract, tokenB: Contract, fee: FeeAmount) {
    let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
    let pool: Contract;
    let tx = await uniswapFactory.createPool(token0, token1, fee);
    let events = (await tx.wait()).events;
    expect(events && events.length > 0 && events[0].args && events[0].args.pool);
    if(events && events.length > 0 && events[0].args && events[0].args.pool) {
      let poolAddress = events[0].args.pool;
      pool = await ethers.getContractAt(UniswapV3PoolArtifact.abi, poolAddress);
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

  async function createSolaceEthLpFarm(
    stakeToken: Contract = lpToken,
    startBlock: BigNumberish = BN.from(0),
    endBlock: BigNumberish = BN.from(0),
    pool: Contract = mediumPool
  ) {
    let farm = (await deployContract(
      deployer,
      SolaceEthLpFarmArtifact,
      [
        governor.address,
        master.address,
        stakeToken.address,
        solaceToken.address,
        startBlock,
        endBlock,
        pool.address,
        weth.address
      ]
    )) as SolaceEthLpFarm;
    return farm;
  }

  // mints an lp token by providing liquidity
  async function mintLpToken(
    liquidityProvider: Wallet,
    tokenA: Contract,
    tokenB: Contract,
    fee: FeeAmount,
    amount: BigNumberish,
    tickLower: BigNumberish = getMinTick(TICK_SPACINGS[fee]),
    tickUpper: BigNumberish = getMaxTick(TICK_SPACINGS[fee])
  ) {
    let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
    await lpToken.connect(liquidityProvider).mint({
      token0: token0,
      token1: token1,
      tickLower: tickLower,
      tickUpper: tickUpper,
      fee: fee,
      recipient: liquidityProvider.address,
      amount0Desired: amount,
      amount1Desired: amount,
      amount0Min: 0,
      amount1Min: 0,
      deadline: constants.MaxUint256,
    });
    let tokenId = await lpToken.totalSupply();
    return tokenId;
  }

  interface Balances {
    userEth: BN,
    userSolace: BN
  }

  async function getBalances(user: Wallet): Promise<Balances> {
    return {
      userEth: await user.getBalance(),
      userSolace: await solaceToken.balanceOf(user.address),
    }
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances) : Balances {
    return {
      userEth: balances1.userEth.sub(balances2.userEth),
      userSolace: balances1.userSolace.sub(balances2.userSolace)
    }
  }
});
