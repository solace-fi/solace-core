import { waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;

import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";
import { encodePath } from "./utilities/path";

// solace imports
import SolaceArtifact from "../artifacts/contracts/SOLACE.sol/SOLACE.json";
import TreasuryArtifact from "../artifacts/contracts/Treasury.sol/Treasury.json";
import MockTokenArtifact from "../artifacts/contracts/mocks/MockToken.sol/MockToken.json";
import WETHArtifact from "../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json";
import { Solace, Treasury, MockToken, MockWeth } from "../typechain";

// uniswap imports
import UniswapV3FactoryArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import SwapRouterArtifact from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";
import NonfungiblePositionManager from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

chai.use(solidity);

// users
let deployer: Wallet;
let governor: Wallet;
let liquidityProvider: Wallet;
let mockPolicy: Wallet;
let user: Wallet;

// uniswap contracts
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let uniswapPositionManager: Contract;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_HUNDRED = BN.from("100");
const ONE_ETHER = BN.from("1000000000000000000");
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");

describe("Treasury", function () {
  // solace contracts
  let solaceToken: Solace;
  let treasury: Treasury;
  let weth: MockWeth;
  let mockToken1: MockToken;
  let mockToken2: MockToken;

  let wethPath: string;
  let mockToken2Path: string;
  let defaultPath: string = "0x";

  before(async function () {
    [deployer, governor, liquidityProvider, mockPolicy, user] = provider.getWallets();

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

    // deploy mock token 1
    mockToken1 = (await deployContract(
        deployer,
        MockTokenArtifact,
        [
          "Mock Token 1",
          "MKT1",
          ONE_MILLION_ETHER
        ]
    )) as MockToken;

    // deploy mock token 2
    mockToken2 = (await deployContract(
        deployer,
        MockTokenArtifact,
        [
          "Mock Token 2",
          "MKT2",
          ONE_MILLION_ETHER
        ]
    )) as MockToken;

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

    // deploy uniswap position manager
    uniswapPositionManager = (await deployContract(
      deployer,
      NonfungiblePositionManager,
      [
        uniswapFactory.address,
        weth.address,
        ZERO_ADDRESS
      ]
    )) as Contract;

    // deploy treasury contract
    treasury = (await deployContract(
      deployer,
      TreasuryArtifact,
      [
        solaceToken.address,
        uniswapRouter.address,
        weth.address
      ]
    )) as Treasury;

    // transfer tokens
    await solaceToken.addMinter(governor.address);
    await solaceToken.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await weth.connect(liquidityProvider).deposit({value: TEN_ETHER});
    await solaceToken.connect(governor).transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken1.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken2.transfer(liquidityProvider.address, TEN_ETHER);
    await weth.connect(mockPolicy).deposit({value: ONE_ETHER});
    await solaceToken.connect(governor).transfer(mockPolicy.address, ONE_ETHER);
    await mockToken1.transfer(mockPolicy.address, ONE_ETHER);
    await mockToken2.transfer(mockPolicy.address, ONE_ETHER);

    // create pools
    await createPool(weth, solaceToken, FeeAmount.MEDIUM);
    await createPool(mockToken2, solaceToken, FeeAmount.LOW);

    // add liquidity
    await addLiquidity(liquidityProvider, weth, solaceToken, FeeAmount.MEDIUM, ONE_ETHER);
    await addLiquidity(liquidityProvider, mockToken2, solaceToken, FeeAmount.LOW, ONE_ETHER);

    // encode paths
    wethPath = encodePath([weth.address, solaceToken.address], [FeeAmount.MEDIUM]);
    mockToken2Path = encodePath([mockToken2.address, solaceToken.address], [FeeAmount.LOW]);
  })

  describe("governance", function () {
    it("begins with correct governor", async function () {
      expect(await treasury.governance()).to.equal(deployer.address);
    })

    it("can transfer governance", async function () {
      await treasury.connect(deployer).setGovernance(governor.address);
      expect(await treasury.governance()).to.equal(governor.address);
    })

    it("reverts governance transfers by non-governor", async function () {
      await expect(treasury.connect(deployer).setGovernance(treasury.address)).to.be.revertedWith("!governance");
    })
  })

  describe("paths", function () {
    it("can set paths", async function () {
      let tx = await treasury.connect(governor).setPath(weth.address, wethPath);
      await expect(tx).to.emit(treasury, "PathSet").withArgs(weth.address, wethPath);
      expect(await weth.allowance(treasury.address, uniswapRouter.address)).to.equal(constants.MaxUint256);
    })

    it("can set empty paths", async function () {
      let tx = await treasury.connect(governor).setPath(mockToken2.address, defaultPath);
      await expect(tx).to.emit(treasury, "PathSet").withArgs(mockToken2.address, defaultPath);
      expect(await mockToken2.allowance(treasury.address, uniswapRouter.address)).to.equal(0);
    })

    it("non governor cannot set paths", async function () {
      await expect(treasury.connect(user).setPath(weth.address, wethPath)).to.be.revertedWith("!governance");
    })

    it("returns paths", async function () {
      expect(await treasury.paths(weth.address)).to.equal(wethPath);
      expect(await treasury.paths(solaceToken.address)).to.equal(defaultPath);
    })
  })

  describe("deposit", function () {
    it("can deposit solace", async function () {
      let depositAmount = ONE_HUNDRED;
      let treasuryBalanceBefore = await solaceToken.balanceOf(treasury.address);
      await solaceToken.connect(mockPolicy).increaseAllowance(treasury.address, depositAmount);
      let tx = await treasury.connect(mockPolicy).depositToken(solaceToken.address, depositAmount);
      let treasuryBalanceAfter = await solaceToken.balanceOf(treasury.address);
      expect(treasuryBalanceAfter.sub(treasuryBalanceBefore)).to.equal(depositAmount); // solace should increase
      expect(tx).to.emit(treasury, "DepositToken").withArgs(solaceToken.address, depositAmount);
    })

    it("can deposit eth", async function () {
      let depositAmount = ONE_HUNDRED;
      let treasurySolaceBalanceBefore = await solaceToken.balanceOf(treasury.address);
      let tx = await treasury.connect(mockPolicy).depositEth({value: depositAmount});
      let treasurySolaceBalanceAfter = await solaceToken.balanceOf(treasury.address);
      let treasuryEthBalanceAfter = await provider.getBalance(treasury.address);
      expect(treasurySolaceBalanceAfter).gt(treasurySolaceBalanceBefore); // solace should increase
      expect(treasuryEthBalanceAfter).to.equal(0); // should swap eth
      expect(tx).to.emit(treasury, "DepositEth").withArgs(depositAmount);
    })

    it("can deposit eth via fallback", async function () {
      let depositAmount = ONE_HUNDRED;
      let treasurySolaceBalanceBefore = await solaceToken.balanceOf(treasury.address);
      let tx = await treasury.connect(mockPolicy).fallback({value: depositAmount});
      let treasurySolaceBalanceAfter = await solaceToken.balanceOf(treasury.address);
      let treasuryEthBalanceAfter = await provider.getBalance(treasury.address);
      expect(treasurySolaceBalanceAfter).gt(treasurySolaceBalanceBefore); // solace should increase
      expect(treasuryEthBalanceAfter).to.equal(0); // should swap eth
      expect(tx).to.emit(treasury, "DepositEth").withArgs(depositAmount);
    })

    it("can deposit weth", async function () {
      let depositAmount = ONE_HUNDRED;
      await weth.connect(mockPolicy).deposit({value: depositAmount});
      await weth.connect(mockPolicy).approve(treasury.address, depositAmount);
      let treasurySolaceBalanceBefore = await solaceToken.balanceOf(treasury.address);
      let tx = await treasury.connect(mockPolicy).depositToken(weth.address, depositAmount);
      let treasurySolaceBalanceAfter = await solaceToken.balanceOf(treasury.address);
      let treasuryWethBalanceAfter = await weth.balanceOf(treasury.address);
      expect(treasurySolaceBalanceAfter).gt(treasurySolaceBalanceBefore); // solace should increase
      expect(treasuryWethBalanceAfter).to.equal(0); // should swap weth
      expect(tx).to.emit(treasury, "DepositToken").withArgs(weth.address, depositAmount);
    })

    it("can deposit other token with no swap path", async function () {
      let depositAmount = ONE_HUNDRED;
      let treasurySolaceBalanceBefore = await solaceToken.balanceOf(treasury.address);
      let treasuryMockBalanceBefore = await mockToken1.balanceOf(treasury.address);
      await mockToken1.connect(mockPolicy).increaseAllowance(treasury.address, depositAmount);
      let tx = await treasury.connect(mockPolicy).depositToken(mockToken1.address, depositAmount);
      let treasurySolaceBalanceAfter = await solaceToken.balanceOf(treasury.address);
      let treasuryMockBalanceAfter = await mockToken1.balanceOf(treasury.address);
      expect(treasurySolaceBalanceAfter).to.equal(treasurySolaceBalanceBefore); // solace should not increase
      expect(treasuryMockBalanceAfter.sub(treasuryMockBalanceBefore)).to.equal(depositAmount); // should hold other token
      expect(tx).to.emit(treasury, "DepositToken").withArgs(mockToken1.address, depositAmount);
    })

    it("can deposit other token with a swap path", async function () {
      await treasury.connect(governor).setPath(mockToken2.address, mockToken2Path);
      let depositAmount = ONE_HUNDRED;
      let treasurySolaceBalanceBefore = await solaceToken.balanceOf(treasury.address);
      await mockToken2.connect(mockPolicy).increaseAllowance(treasury.address, depositAmount);
      let tx = await treasury.connect(mockPolicy).depositToken(mockToken2.address, depositAmount);
      let treasurySolaceBalanceAfter = await solaceToken.balanceOf(treasury.address);
      let treasuryMockBalanceAfter = await mockToken2.balanceOf(treasury.address);
      expect(treasurySolaceBalanceAfter).gt(treasurySolaceBalanceBefore); // solace should increase
      expect(treasuryMockBalanceAfter).to.equal(0); // should swap mock
      expect(tx).to.emit(treasury, "DepositToken").withArgs(mockToken2.address, depositAmount);
    })
  })

  describe("swap external", function () {
    it("non governor cannot swap", async function () {
      await expect(treasury.connect(user).swap(weth.address)).to.be.revertedWith("!governance");
    })

    it("can swap token with no path", async function () {
      let depositAmount = ONE_HUNDRED;
      let treasurySolaceBalanceBefore = await solaceToken.balanceOf(treasury.address);
      let treasuryMockBalanceBefore = await mockToken1.balanceOf(treasury.address);
      await mockToken1.transfer(treasury.address, depositAmount);
      await treasury.connect(governor).swap(mockToken1.address);
      let treasurySolaceBalanceAfter = await solaceToken.balanceOf(treasury.address);
      let treasuryMockBalanceAfter = await mockToken1.balanceOf(treasury.address);
      expect(treasurySolaceBalanceAfter).to.equal(treasurySolaceBalanceBefore); // solace should not increase
      expect(treasuryMockBalanceAfter.sub(treasuryMockBalanceBefore)).to.equal(depositAmount); // should hold other token
    })

    it("can swap token with path", async function () {
      let depositAmount = ONE_HUNDRED;
      let treasurySolaceBalanceBefore = await solaceToken.balanceOf(treasury.address);
      await mockToken2.transfer(treasury.address, depositAmount);
      await treasury.connect(governor).swap(mockToken2.address);
      let treasurySolaceBalanceAfter = await solaceToken.balanceOf(treasury.address);
      let treasuryMockBalanceAfter = await mockToken2.balanceOf(treasury.address);
      expect(treasurySolaceBalanceAfter).gt(treasurySolaceBalanceBefore); // solace should increase
      expect(treasuryMockBalanceAfter).to.equal(0); // should swap mock
    })
  })

  describe("spend", function () {
    it("non governor cannot spend", async function () {
      let balance = await solaceToken.balanceOf(treasury.address);
      await expect(treasury.connect(user).spend(solaceToken.address, balance, governor.address)).to.be.revertedWith("!governance");
    })

    it("can spend solace", async function () {
      let spendAmount = BN.from("5");
      let treasuryBalanceBefore = await solaceToken.balanceOf(treasury.address);
      let userBalanceBefore = await solaceToken.balanceOf(user.address);
      let tx = await treasury.connect(governor).spend(solaceToken.address, spendAmount, user.address);
      let treasuryBalanceAfter = await solaceToken.balanceOf(treasury.address);
      let userBalanceAfter = await solaceToken.balanceOf(user.address);
      expect(treasuryBalanceBefore.sub(treasuryBalanceAfter)).to.equal(spendAmount);
      expect(userBalanceAfter.sub(userBalanceBefore)).to.equal(spendAmount);
      expect(tx).to.emit(treasury, "Spend").withArgs(solaceToken.address, spendAmount, user.address);
    })

    it("can spend unswapped token", async function () {
      let spendAmount = BN.from("5");
      let treasuryBalanceBefore = await mockToken1.balanceOf(treasury.address);
      let userBalanceBefore = await mockToken1.balanceOf(user.address);
      let tx = await treasury.connect(governor).spend(mockToken1.address, spendAmount, user.address);
      let treasuryBalanceAfter = await mockToken1.balanceOf(treasury.address);
      let userBalanceAfter = await mockToken1.balanceOf(user.address);
      expect(treasuryBalanceBefore.sub(treasuryBalanceAfter)).to.equal(spendAmount);
      expect(userBalanceAfter.sub(userBalanceBefore)).to.equal(spendAmount);
      expect(tx).to.emit(treasury, "Spend").withArgs(mockToken1.address, spendAmount, user.address);
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

// adds liquidity to a pool
// @ts-ignore
async function addLiquidity(liquidityProvider: SignerWithAddress, tokenA: Contract, tokenB: Contract, fee: FeeAmount, amount: BigNumberish) {
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
    amount0Max: constants.MaxUint256,
    amount1Max: constants.MaxUint256,
    amount: amount,
    deadline: constants.MaxUint256,
  });
}
