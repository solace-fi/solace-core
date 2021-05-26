import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;

import { expectClose } from "./utilities/chai_extensions";
import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";
import { encodePath } from "./utilities/path";
chai.use(solidity);

import UniswapV3ProductArtifact from "../artifacts/contracts/products/UniswapV3Product.sol/UniswapV3Product.json"
import PolicyManagerArtifact from "../artifacts/contracts/PolicyManager.sol/PolicyManager.json"
import ClaimsAdjusterArtifact from "../artifacts/contracts/ClaimsAdjustor.sol/ClaimsAdjustor.json"
import RegistryArtifact from "../artifacts/contracts/Registry.sol/Registry.json";
import SolaceArtifact from "../artifacts/contracts/SOLACE.sol/SOLACE.json"
import WETHArtifact from "../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json";
import MockERC20Artifact from "../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import TreasuryArtifact from "../artifacts/contracts/Treasury.sol/Treasury.json";
import { PolicyManager, ClaimsAdjustor, Registry, UniswapV3Product, Solace, MockWeth, MockErc20, Treasury } from "../typechain";

// uniswap imports
import UniswapV3FactoryArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import SwapRouterArtifact from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";
import NonfungiblePositionManager from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

describe("UniswapV3Product", () => {
  const [deployer, governor, liquidityProvider, user] = provider.getWallets();

  // solace contracts
  let policyManager: PolicyManager;
  let registry: Registry;
  let claimsAdjuster: ClaimsAdjustor;
  let solace: Solace;
  let weth: MockWeth;
  let treasury: Treasury;
  let product: UniswapV3Product;
  let mockToken1: MockErc20; // no path
  let mockToken2: MockErc20; // single pool path
  let mockToken3: MockErc20; // multi pool path
  let mockToken4: MockErc20; // invalid path

  // uniswap contracts
  let uniswapFactory: Contract;
  let uniswapRouter: Contract;
  let uniswapPositionManager: Contract;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_HUNDRED       = BN.from("100");
  const TEN_THOUSAND      = BN.from("10000");
  const HUNDRED_THOUSAND  = BN.from("100000");
  const ONE_ETHER         = BN.from("1000000000000000000");
  const TEN_ETHER         = BN.from("10000000000000000000");
  const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");

  //let coveredPlatform: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"; // testing UniswapFactory for cover
  let coveredPlatform: string;
  const minPeriod = 6450; // this is about 1 day
  const maxPeriod = 45100; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
  const maxCoverAmount = BN.from("100000000000000"); // 10 Ether in wei
  const cancelFee = BN.from("100000000"); // 0.1 Ether in wei or 1% of the maxCoverAmount
  const price = 1000; // price in wei for block/wei

  before(async () => {
    // deploy policy manager
    policyManager = (await deployContract(
      deployer,
      PolicyManagerArtifact
    )) as PolicyManager;

    // deploy registry
    registry = (await deployContract(
      deployer,
      RegistryArtifact
    )) as Registry;

    // deploy claims adjuster
    claimsAdjuster = (await deployContract(
      deployer,
      ClaimsAdjusterArtifact,
      [registry.address]
    )) as ClaimsAdjustor;

    // deploy solace
    solace = (await deployContract(
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
        MockERC20Artifact,
        [
          "Mock Token 1",
          "MKT1",
          ONE_MILLION_ETHER
        ]
    )) as MockErc20;

    // deploy mock token 2
    mockToken2 = (await deployContract(
        deployer,
        MockERC20Artifact,
        [
          "Mock Token 2",
          "MKT2",
          ONE_MILLION_ETHER
        ]
    )) as MockErc20;

    // deploy mock token 3
    mockToken3 = (await deployContract(
        deployer,
        MockERC20Artifact,
        [
          "Mock Token 3",
          "MKT3",
          ONE_MILLION_ETHER
        ]
    )) as MockErc20;

    // deploy mock token 4
    mockToken4 = (await deployContract(
        deployer,
        MockERC20Artifact,
        [
          "Mock Token 4",
          "MKT4",
          ONE_MILLION_ETHER
        ]
    )) as MockErc20;

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
        solace.address,
        uniswapRouter.address,
        weth.address
      ]
    )) as Treasury;

    // deploy BaseProduct
    product = (await deployContract(
      deployer,
      UniswapV3ProductArtifact,
      [
        policyManager.address,
        treasury.address,
        claimsAdjuster.address, // this is for the coveredPlatform
        claimsAdjuster.address,
        price,
        cancelFee,
        minPeriod,
        maxPeriod,
        maxCoverAmount,
        uniswapFactory.address,
        weth.address
      ]
    )) as UniswapV3Product;

    coveredPlatform = uniswapPositionManager.address;

    // transfer tokens
    await solace.connect(deployer).addMinter(governor.address);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solace.connect(governor).transfer(liquidityProvider.address, TEN_ETHER);
    await weth.connect(liquidityProvider).deposit({value: TEN_ETHER});
    await weth.connect(user).deposit({value: TEN_ETHER});
    await mockToken1.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken2.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken3.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken4.transfer(liquidityProvider.address, TEN_ETHER);

    // create pools
    //await createPool(weth, solace, FeeAmount.MEDIUM);
    //await createPool(mockToken2, solace, FeeAmount.LOW);
    //await createPool(mockToken3, weth, FeeAmount.HIGH);

    // add liquidity
    //await mintLpToken(liquidityProvider, weth, solace, FeeAmount.MEDIUM, ONE_ETHER);
    //await mintLpToken(liquidityProvider, mockToken2, solace, FeeAmount.LOW, ONE_ETHER);
    //await mintLpToken(liquidityProvider, mockToken3, weth, FeeAmount.HIGH, ONE_ETHER);

    // encode paths
    //wethPath = encodePath([weth.address, solace.address], [FeeAmount.MEDIUM]);
    //mockToken2Path = encodePath([mockToken2.address, solace.address], [FeeAmount.LOW]);
    //mockToken3Path = encodePath([mockToken3.address, weth.address, solace.address], [FeeAmount.HIGH, FeeAmount.MEDIUM]);
    //mockToken4Path = encodePath([randAddress.address, randAddress.address], [FeeAmount.MEDIUM]);
  })

  describe("governance", function () {
    it("can transfer governance", async function () {
      await product.setGovernance(governor.address);
      expect(await product.governance()).to.equal(governor.address);
    })
  })

  describe("claimsAdjuster", function () {
    it("should set claimsAdjuster", async function () {
      await product.connect(governor).setClaimsAdjuster(claimsAdjuster.address);
      expect(await product.claimsAdjuster()).to.equal(claimsAdjuster.address);
    });
    it("should revert if not called by governance", async function () {
      await expect(product.connect(deployer).setClaimsAdjuster(claimsAdjuster.address)).to.be.revertedWith("!governance");
    });
  })

  describe("productParameters", function () {
    it("can set setPrice", async function () {
      await product.connect(governor).setPrice(price);
      expect(await product.price()).to.equal(price);
    })
    it("should revert if not called by governance", async function () {
      await expect(product.connect(deployer).setClaimsAdjuster(claimsAdjuster.address)).to.be.revertedWith("!governance");
    });
    it("can set cancelFee", async function () {
      await product.connect(governor).setCancelFee(cancelFee);
      expect(await product.cancelFee()).to.equal(cancelFee);
    })
    it("should revert if not called by governance", async function () {
      await expect(product.connect(deployer).setCancelFee(cancelFee)).to.be.revertedWith("!governance");
    });
    it("can set minPeriod", async function () {
      await product.connect(governor).setMinPeriod(minPeriod);
      expect(await product.minPeriod()).to.equal(minPeriod);
    })
    it("should revert if not called by governance", async function () {
      await expect(product.connect(deployer).setMinPeriod(minPeriod)).to.be.revertedWith("!governance");
    });
    it("can set maxPeriod", async function () {
      await product.connect(governor).setMaxPeriod(maxPeriod);
      expect(await product.maxPeriod()).to.equal(maxPeriod);
    })
    it("should revert if not called by governance", async function () {
      await expect(product.connect(deployer).setMaxPeriod(maxPeriod)).to.be.revertedWith("!governance");
    });
    it("can set maxCoverAmount", async function () {
      await product.connect(governor).setMaxCoverAmount(maxCoverAmount);
      expect(await product.maxCoverAmount()).to.equal(maxCoverAmount);
    })
    it("should revert if not called by governance", async function () {
      await expect(product.connect(deployer).setMaxCoverAmount(maxCoverAmount)).to.be.revertedWith("!governance");
    });
  })

  describe("appraisePosition", function () {
    it("no positions should have no value", async function () {
      expect(await product.appraisePosition(liquidityProvider.address, uniswapPositionManager.address)).to.equal(0);
    })

    it("tokens that cannot be converted to eth have no value", async function () {
      await createPool(mockToken1, mockToken2, FeeAmount.LOW);
      let [_, tokenId] = await mintLpToken(liquidityProvider, mockToken1, mockToken2, FeeAmount.LOW, ONE_ETHER);
      expect(await product.appraisePosition(liquidityProvider.address, uniswapPositionManager.address)).to.equal(0);
      await burnLpToken(liquidityProvider, tokenId);
    })

    it("only position in a token/eth pool should only have eth value", async function () {
      await createPool(mockToken1, weth, FeeAmount.LOW);
      let [_, tokenId] = await mintLpToken(liquidityProvider, mockToken1, weth, FeeAmount.LOW, ONE_ETHER);
      expectClose(await product.appraisePosition(liquidityProvider.address, uniswapPositionManager.address), ONE_ETHER);
      await burnLpToken(liquidityProvider, tokenId);
      expect(await product.appraisePosition(liquidityProvider.address, uniswapPositionManager.address)).to.equal(0);
    })

    it("should swap other token in pool with liquidity", async function () {
      // add liquidity to pool
      let [_, tokenId1] = await mintLpToken(liquidityProvider, mockToken1, weth, FeeAmount.LOW, ONE_ETHER);
      // swap eth to mock1
      let balances1 = await getBalances(user);
      await mockToken1.connect(user).approve(uniswapRouter.address, constants.MaxUint256);
      await weth.connect(user).approve(uniswapRouter.address, constants.MaxUint256);
      let tx1 = await uniswapRouter.connect(user).exactInputSingle({
        tokenIn: weth.address,
        tokenOut: mockToken1.address,
        fee: FeeAmount.LOW,
        recipient: user.address,
        deadline: constants.MaxUint256,
        amountIn: HUNDRED_THOUSAND,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
      });
      let balances2 = await getBalances(user);
      let receipt1 = await tx1.wait();
      let gasCost1 = receipt1.gasUsed.mul(tx1.gasPrice);
      // create position
      let [tx2, tokenId2] = await mintLpToken(user, mockToken1, weth, FeeAmount.LOW, balances2.userMock1);
      let receipt2 = await tx2.wait();
      let gasCost2 = receipt2.gasUsed.mul(tx2.gasPrice);
      let balances3 = await getBalances(user);
      // appraise position
      let ethCost = getBalancesDiff(balances1, balances3).userEth.sub(gasCost1).sub(gasCost2);
      let ethValue = await product.appraisePosition(user.address, uniswapPositionManager.address);
      expect(ethValue).to.equal(ethCost);
      // zero pool
      await burnLpToken(liquidityProvider, tokenId1);
      await burnLpToken(user, tokenId2);
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
    await tokenA.connect(liquidityProvider).approve(uniswapPositionManager.address, constants.MaxUint256);
    await tokenB.connect(liquidityProvider).approve(uniswapPositionManager.address, constants.MaxUint256);
    let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
    let tx = await uniswapPositionManager.connect(liquidityProvider).mint({
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
    let tokenId = await uniswapPositionManager.totalSupply();
    return [tx, tokenId];
  }

  async function burnLpToken(
    owner: Wallet,
    tokenId: BigNumberish
  ) {
    let position = await uniswapPositionManager.positions(tokenId);
    await uniswapPositionManager.connect(owner).decreaseLiquidity({
      tokenId: tokenId,
      liquidity: position.liquidity,
      amount0Min: 0,
      amount1Min: 0,
      deadline: constants.MaxUint256
    })
    // token still exists but with zero liquidity
  }

  interface Balances {
    userSolace: BN,
    userEth: BN,
    userWeth: BN,
    userMock1: BN,
    userMock2: BN,
    userMock3: BN,
    userMock4: BN
  }

  async function getBalances(user: Wallet): Promise<Balances> {
    return {
      userSolace: await solace.balanceOf(user.address),
      userEth: await user.getBalance(),
      userWeth: await weth.balanceOf(user.address),
      userMock1: await mockToken1.balanceOf(user.address),
      userMock2: await mockToken2.balanceOf(user.address),
      userMock3: await mockToken3.balanceOf(user.address),
      userMock4: await mockToken4.balanceOf(user.address)
    }
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances) : Balances {
    return {
      userSolace: balances1.userSolace.sub(balances2.userSolace),
      userEth: balances1.userEth.sub(balances2.userEth),
      userWeth: balances1.userWeth.sub(balances2.userWeth),
      userMock1: balances1.userMock1.sub(balances2.userMock1),
      userMock2: balances1.userMock2.sub(balances2.userMock2),
      userMock3: balances1.userMock3.sub(balances2.userMock3),
      userMock4: balances1.userMock4.sub(balances2.userMock4)
    }
  }

  function printBalances(balances: Balances): void {
    console.log("{");
    console.log(`  solace : ${balances.userSolace}`);
    console.log(`  eth    : ${balances.userEth}`);
    console.log(`  weth   : ${balances.userWeth}`);
    console.log(`  mock1  : ${balances.userMock1}`);
    console.log(`  mock2  : ${balances.userMock2}`);
    console.log(`  mock3  : ${balances.userMock3}`);
    console.log(`  mock4  : ${balances.userMock4}`);
    console.log("}");
  }
})
