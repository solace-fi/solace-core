import { waffle, ethers } from "hardhat";
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
import MockERC20Artifact from "../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import WETHArtifact from "../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json";
import { Solace, Treasury, MockErc20, MockWeth } from "../typechain";

// uniswap imports
import UniswapV3FactoryArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import SwapRouterArtifact from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";
import NonfungiblePositionManager from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

chai.use(solidity);

describe("Treasury", function () {
  // users
  let deployer: any;
  let governor: any;
  let liquidityProvider: any;
  let mockPolicy: any;
  let user: any;
  let randAddress: any;

  // solace contracts
  let solaceToken: Solace;
  let treasury: Treasury;
  let weth: MockWeth;
  let mockToken1: MockErc20; // no path
  let mockToken2: MockErc20; // single pool path
  let mockToken3: MockErc20; // multi pool path
  let mockToken4: MockErc20; // invalid path

  let wethPath: string;
  let mockToken2Path: string;
  let mockToken3Path: string;
  let mockToken4Path: string;
  let defaultPath: string = "0x";

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

  before(async function () {
    const network = await provider.getNetwork();
    if(network.chainId == 31337) {
      console.log(``);
      console.log(`    #############################################################################################`);
      console.log(`    #                                                                                           #`);
      console.log(`    #  NOTICE:                                                                                  #`);
      console.log(`    #                                                                                           #`);
      console.log(`    #  This test will throw errors when run on the hardhat network.                             #`);
      console.log(`    #  Hardhat is aware of the issue but have not fixed it yet.                                 #`);
      console.log(`    #  You will need to run this test on a different network.                                   #`);
      console.log(`    #  Run "ganache-cli" in another terminal.                                                   #`);
      console.log(`    #  Then run "npx hardhat test test/Treasury.test.ts --network localhost" in this terminal.  #`);
      console.log(`    #                                                                                           #`);
      console.log(`    #############################################################################################`);
      console.log(``);
      [deployer, governor, liquidityProvider, mockPolicy, user, randAddress] = provider.getWallets();
    } else {
      [deployer, governor, liquidityProvider, mockPolicy, user, randAddress] = await ethers.getSigners();
    }

    // deploy solace token
    solaceToken = (await deployContract(
      deployer,
      SolaceArtifact,
      [
        governor.address,
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
        governor.address,
        solaceToken.address,
        uniswapRouter.address,
        weth.address
      ]
    )) as Treasury;

    // transfer tokens
    await solaceToken.connect(governor).addMinter(governor.address);
    await solaceToken.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await weth.connect(liquidityProvider).deposit({value: TEN_ETHER});
    await solaceToken.connect(governor).transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken1.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken2.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken3.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken4.transfer(liquidityProvider.address, TEN_ETHER);
    await weth.connect(mockPolicy).deposit({value: ONE_ETHER});
    await solaceToken.connect(governor).transfer(mockPolicy.address, ONE_ETHER);
    await mockToken1.transfer(mockPolicy.address, ONE_ETHER);
    await mockToken2.transfer(mockPolicy.address, ONE_ETHER);
    await mockToken3.transfer(mockPolicy.address, ONE_ETHER);
    await mockToken4.transfer(mockPolicy.address, ONE_ETHER);

    // create pools
    await createPool(weth, solaceToken, FeeAmount.MEDIUM);
    await createPool(mockToken2, solaceToken, FeeAmount.LOW);
    await createPool(mockToken3, weth, FeeAmount.HIGH);

    // add liquidity
    await addLiquidity(liquidityProvider, weth, solaceToken, FeeAmount.MEDIUM, ONE_ETHER);
    await addLiquidity(liquidityProvider, mockToken2, solaceToken, FeeAmount.LOW, ONE_ETHER);
    await addLiquidity(liquidityProvider, mockToken3, weth, FeeAmount.HIGH, ONE_ETHER);

    // encode paths
    wethPath = encodePath([weth.address, solaceToken.address], [FeeAmount.MEDIUM]);
    mockToken2Path = encodePath([mockToken2.address, solaceToken.address], [FeeAmount.LOW]);
    mockToken3Path = encodePath([mockToken3.address, weth.address, solaceToken.address], [FeeAmount.HIGH, FeeAmount.MEDIUM]);
    mockToken4Path = encodePath([randAddress.address, randAddress.address], [FeeAmount.MEDIUM]);
  })

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await treasury.governance()).to.equal(governor.address);
    })

    it("rejects setting new governance by non governor", async function () {
      await expect(treasury.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    })

    it("can set new governance", async function () {
      await treasury.connect(governor).setGovernance(deployer.address);
      expect(await treasury.governance()).to.equal(governor.address);
      expect(await treasury.newGovernance()).to.equal(deployer.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(treasury.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    })

    it("can transfer governance", async function () {
      let tx = await treasury.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(treasury, "GovernanceTransferred").withArgs(deployer.address);
      expect(await treasury.governance()).to.equal(deployer.address);
      expect(await treasury.newGovernance()).to.equal(ZERO_ADDRESS);

      await treasury.connect(deployer).setGovernance(governor.address);
      await treasury.connect(governor).acceptGovernance();
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
      let balancesBefore = await getBalances(mockPolicy);
      await solaceToken.connect(mockPolicy).increaseAllowance(treasury.address, depositAmount);
      let tx = await treasury.connect(mockPolicy).depositToken(solaceToken.address, depositAmount);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(depositAmount); // solace should increase
      await expect(tx).to.emit(treasury, "TokenDeposited").withArgs(solaceToken.address, depositAmount);
    })

    it("can deposit eth via depositEth", async function () {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      let tx = await treasury.connect(mockPolicy).depositEth({value: depositAmount});
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.be.gt(0); // solace should increase
      expect(balancesAfter.treasuryEth).to.equal(0); // should swap eth
      await expect(tx).to.emit(treasury, "EthDeposited").withArgs(depositAmount);
    })

    it("can deposit eth via receive", async function () {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      let tx = await mockPolicy.sendTransaction({
        to: treasury.address,
        value: depositAmount,
        data: "0x"
      });
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.be.gt(0); // solace should increase
      expect(balancesAfter.treasuryEth).to.equal(0); // should swap eth
      await expect(tx).to.emit(treasury, "EthDeposited").withArgs(depositAmount);
    })

    it("can deposit eth via fallback", async function () {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      let tx = await mockPolicy.sendTransaction({
        to: treasury.address,
        value: depositAmount,
        data: "0xabcd"
      });
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.be.gt(0); // solace should increase
      expect(balancesAfter.treasuryEth).to.equal(0); // should swap eth
      await expect(tx).to.emit(treasury, "EthDeposited").withArgs(depositAmount);
    })

    it("can deposit weth", async function () {
      let depositAmount = ONE_HUNDRED;
      await weth.connect(mockPolicy).deposit({value: depositAmount});
      await weth.connect(mockPolicy).approve(treasury.address, depositAmount);
      let balancesBefore = await getBalances(mockPolicy);
      let tx = await treasury.connect(mockPolicy).depositToken(weth.address, depositAmount);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.be.gt(0); // solace should increase
      expect(balancesAfter.treasuryWeth).to.equal(0); // should swap weth
      await expect(tx).to.emit(treasury, "TokenDeposited").withArgs(weth.address, depositAmount);
    })

    it("can deposit other token with no swap path", async function () {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockToken1.connect(mockPolicy).increaseAllowance(treasury.address, depositAmount);
      let tx = await treasury.connect(mockPolicy).depositToken(mockToken1.address, depositAmount);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(0); // solace should not increase
      expect(balancesDiff.treasuryMock1).to.equal(depositAmount); // should hold other token
      await expect(tx).to.emit(treasury, "TokenDeposited").withArgs(mockToken1.address, depositAmount);
    })

    it("can deposit other token with a swap path", async function () {
      await treasury.connect(governor).setPath(mockToken2.address, mockToken2Path);
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockToken2.connect(mockPolicy).increaseAllowance(treasury.address, depositAmount);
      let tx = await treasury.connect(mockPolicy).depositToken(mockToken2.address, depositAmount);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.be.gt(0); // solace should increase
      expect(balancesAfter.treasuryMock2).to.equal(0); // should swap mock
      await expect(tx).to.emit(treasury, "TokenDeposited").withArgs(mockToken2.address, depositAmount);
    })

    it("can deposit other token with a multi pool swap path", async function () {
      // path: mockToken3 -> weth (high fee) -> solace (medium fee)
      await treasury.connect(governor).setPath(mockToken3.address, mockToken3Path);
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockToken3.connect(mockPolicy).increaseAllowance(treasury.address, depositAmount);
      let tx = await treasury.connect(mockPolicy).depositToken(mockToken3.address, depositAmount);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.be.gt(0); // solace should increase
      expect(balancesAfter.treasuryMock3).to.equal(0); // should swap mock
      await expect(tx).to.emit(treasury, "TokenDeposited").withArgs(mockToken3.address, depositAmount);
    })

    it("can deposit other token even with uniswap errors", async function () {
      await treasury.connect(governor).setPath(mockToken4.address, mockToken4Path);
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockToken4.connect(mockPolicy).increaseAllowance(treasury.address, depositAmount);
      let tx = await treasury.connect(mockPolicy).depositToken(mockToken4.address, depositAmount);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(0); // solace should not increase
      expect(balancesDiff.treasuryMock4).to.equal(depositAmount); // should hold mock
      await expect(tx).to.emit(treasury, "TokenDeposited").withArgs(mockToken4.address, depositAmount);
    })
  })

  describe("swap external", function () {
    it("non governor cannot swap", async function () {
      await expect(treasury.connect(user).swap(wethPath, 100, 0)).to.be.revertedWith("!governance");
    })

    it("cannot swap token with no path", async function () {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockToken1.transfer(treasury.address, depositAmount);
      await expect(treasury.connect(governor).swap(defaultPath, 100, 0)).to.be.reverted;
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(0); // solace should not increase
      expect(balancesDiff.treasuryMock1).to.equal(depositAmount); // should hold other token
    })

    it("can swap token with a swap path", async function () {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockToken2.transfer(treasury.address, depositAmount);
      await treasury.connect(governor).swap(mockToken2Path, await mockToken2.balanceOf(treasury.address), 0);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.be.gt(0); // solace should increase
      expect(balancesAfter.treasuryMock2).to.equal(0); // should swap mock
    })

    it("can swap token with a multi pool swap path", async function () {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockToken3.transfer(treasury.address, depositAmount);
      await treasury.connect(governor).swap(mockToken3Path, await mockToken3.balanceOf(treasury.address), 0);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.be.gt(0); // solace should increase
      expect(balancesAfter.treasuryMock3).to.equal(0); // should swap mock
    })

    it("cannot swap token with uniswap errors", async function () {
      await treasury.connect(governor).setPath(mockToken4.address, mockToken4Path);
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockToken4.transfer(treasury.address, depositAmount);
      await expect(treasury.connect(governor).swap(mockToken4Path, 100, 0)).to.be.reverted;
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(0); // solace should not increase
      expect(balancesDiff.treasuryMock4).to.equal(depositAmount); // should hold mock
    })

    it("reverts if not enough received", async function () {
      let amountIn = ONE_HUNDRED;
      await mockToken2.transfer(treasury.address, amountIn);
      let amountOut = 99
      await expect(treasury.connect(governor).swap(mockToken2Path, amountIn, amountOut)).to.be.revertedWith("Too little received");
    })
  })

  describe("spend", function () {
    it("non governor cannot spend", async function () {
      await expect(treasury.connect(user).spend(solaceToken.address, 100, governor.address)).to.be.revertedWith("!governance");
    })

    it("can spend solace", async function () {
      let spendAmount = BN.from("5");
      let balancesBefore = await getBalances(user);
      let tx = await treasury.connect(governor).spend(solaceToken.address, spendAmount, user.address);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(spendAmount.mul(-1));
      expect(balancesDiff.userSolace).to.equal(spendAmount);
      await expect(tx).to.emit(treasury, "FundsSpent").withArgs(solaceToken.address, spendAmount, user.address);
    })

    it("can spend unswapped token", async function () {
      let spendAmount = BN.from("5");
      let balancesBefore = await getBalances(user);
      let tx = await treasury.connect(governor).spend(mockToken1.address, spendAmount, user.address);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryMock1).to.equal(spendAmount.mul(-1));
      expect(balancesDiff.userMock1).to.equal(spendAmount);
      await expect(tx).to.emit(treasury, "FundsSpent").withArgs(mockToken1.address, spendAmount, user.address);
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

  interface Balances {
    userSolace: BN,
    userEth: BN,
    userWeth: BN,
    userMock1: BN,
    userMock2: BN,
    userMock3: BN,
    userMock4: BN,
    treasurySolace: BN,
    treasuryEth: BN,
    treasuryWeth: BN,
    treasuryMock1: BN,
    treasuryMock2: BN,
    treasuryMock3: BN,
    treasuryMock4: BN,
  }

  async function getBalances(user: Wallet): Promise<Balances> {
    return {
      userSolace: await solaceToken.balanceOf(user.address),
      userEth: await user.getBalance(),
      userWeth: await weth.balanceOf(user.address),
      userMock1: await mockToken1.balanceOf(user.address),
      userMock2: await mockToken2.balanceOf(user.address),
      userMock3: await mockToken3.balanceOf(user.address),
      userMock4: await mockToken4.balanceOf(user.address),
      treasurySolace: await solaceToken.balanceOf(treasury.address),
      treasuryEth: await provider.getBalance(treasury.address),
      treasuryWeth: await weth.balanceOf(treasury.address),
      treasuryMock1: await mockToken1.balanceOf(treasury.address),
      treasuryMock2: await mockToken2.balanceOf(treasury.address),
      treasuryMock3: await mockToken3.balanceOf(treasury.address),
      treasuryMock4: await mockToken4.balanceOf(treasury.address)
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
      userMock4: balances1.userMock4.sub(balances2.userMock4),
      treasurySolace: balances1.treasurySolace.sub(balances2.treasurySolace),
      treasuryEth: balances1.treasuryEth.sub(balances2.treasuryEth),
      treasuryWeth: balances1.treasuryWeth.sub(balances2.treasuryWeth),
      treasuryMock1: balances1.treasuryMock1.sub(balances2.treasuryMock1),
      treasuryMock2: balances1.treasuryMock2.sub(balances2.treasuryMock2),
      treasuryMock3: balances1.treasuryMock3.sub(balances2.treasuryMock3),
      treasuryMock4: balances1.treasuryMock4.sub(balances2.treasuryMock4)
    }
  }
});
