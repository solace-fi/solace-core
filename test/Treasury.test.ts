import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";
import { encodePath } from "./utilities/path";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Treasury, MockErc20, Weth9, Registry, PolicyManager } from "../typechain";

describe("Treasury", function () {
  let artifacts: ArtifactImports;
  // users
  let deployer: Wallet;
  let governor: Wallet;
  let liquidityProvider: Wallet;
  let mockPolicy: Wallet;
  let user: Wallet;
  let randAddress: Wallet;
  let mockProduct: Wallet;

  // solace contracts
  let solaceToken: Solace;
  let treasury: Treasury;
  let weth: Weth9;
  let registry: Registry;
  let policyManager: PolicyManager;
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
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const ONE_HUNDRED = BN.from("100");
  const ONE_ETHER = BN.from("1000000000000000000");
  const TEN_ETHER = BN.from("10000000000000000000");
  const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");

  before(async function () {
    [deployer, governor, liquidityProvider, mockPolicy, user, randAddress, mockProduct] = provider.getWallets();
    artifacts = await import_artifacts();

    // deploy registry contract
    registry = (await deployContract(
      deployer,
      artifacts.Registry,
      [
        governor.address
      ]
    )) as Registry;

    // deploy solace token
    solaceToken = (await deployContract(
      deployer,
      artifacts.SOLACE,
      [
        governor.address,
      ]
    )) as Solace;

    // deploy weth
    weth = (await deployContract(
        deployer,
        artifacts.WETH
    )) as Weth9;

    // deploy mock token 1
    mockToken1 = (await deployContract(
        deployer,
        artifacts.MockERC20,
        [
          "Mock Token 1",
          "MKT1",
          ONE_MILLION_ETHER
        ]
    )) as MockErc20;

    // deploy mock token 2
    mockToken2 = (await deployContract(
        deployer,
        artifacts.MockERC20,
        [
          "Mock Token 2",
          "MKT2",
          ONE_MILLION_ETHER
        ]
    )) as MockErc20;

    // deploy mock token 3
    mockToken3 = (await deployContract(
        deployer,
        artifacts.MockERC20,
        [
          "Mock Token 3",
          "MKT3",
          ONE_MILLION_ETHER
        ]
    )) as MockErc20;

    // deploy mock token 4
    mockToken4 = (await deployContract(
        deployer,
        artifacts.MockERC20,
        [
          "Mock Token 4",
          "MKT4",
          ONE_MILLION_ETHER
        ]
    )) as MockErc20;

    // deploy uniswap factory
    uniswapFactory = (await deployContract(
      deployer,
      artifacts.UniswapV3Factory
    )) as Contract;

    // deploy uniswap router
    uniswapRouter = (await deployContract(
      deployer,
      artifacts.SwapRouter,
      [
        uniswapFactory.address,
        weth.address
      ]
    )) as Contract;

    // deploy uniswap position manager
    uniswapPositionManager = (await deployContract(
      deployer,
      artifacts.NonfungiblePositionManager,
      [
        uniswapFactory.address,
        weth.address,
        ZERO_ADDRESS
      ]
    )) as Contract;

    // deploy treasury contract
    treasury = (await deployContract(
      deployer,
      artifacts.Treasury,
      [
        governor.address,
        uniswapRouter.address,
        weth.address,
        registry.address
      ]
    )) as Treasury;

    // deploy policy manager
    policyManager = (await deployContract(
      deployer,
      artifacts.PolicyManager,
      [
        governor.address
      ]
    )) as PolicyManager;

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
      expect(balancesDiff.treasurySolace).to.equal(0); // shouldnt swap
      expect(balancesDiff.treasuryEth).to.equal(depositAmount); // should hold eth
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
      expect(balancesDiff.treasurySolace).to.equal(0); // shouldnt swap
      expect(balancesDiff.treasuryEth).to.equal(depositAmount); // should hold eth
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
      expect(balancesDiff.treasurySolace).to.equal(0); // shouldnt swap
      expect(balancesDiff.treasuryEth).to.equal(depositAmount); // should hold eth
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
      expect(balancesDiff.treasurySolace).to.equal(0); // shouldnt swap
      expect(balancesDiff.treasuryWeth).to.equal(depositAmount); // should hold weth
      await expect(tx).to.emit(treasury, "TokenDeposited").withArgs(weth.address, depositAmount);
    })

    it("can deposit other token", async function () {
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
  })

  describe("swap", function () {
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

    it("can spend eth", async function () {
      let spendAmount = BN.from("5");
      let balancesBefore = await getBalances(user);
      let tx = await treasury.connect(governor).spend(ETH_ADDRESS, spendAmount, user.address);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(spendAmount.mul(-1));
      expect(balancesDiff.userEth).to.equal(spendAmount);
      await expect(tx).to.emit(treasury, "FundsSpent").withArgs(ETH_ADDRESS, spendAmount, user.address);
    })
  })

  describe("route premiums", function () {
    it("non governor cannot set recipients", async function () {
      await expect(treasury.connect(user).setPremiumRecipients([],[1])).to.be.revertedWith("!governance");
    })

    it("validates recipients", async function () {
      await expect(treasury.connect(governor).setPremiumRecipients([],[1,2])).to.be.revertedWith("length mismatch");
    })

    it("can set recipients", async function () {
      await treasury.connect(governor).setPremiumRecipients([deployer.address],[2,3]);
    })

    it("non governor cannot route premiums", async function () {
      await expect(treasury.connect(user).routePremiums()).to.be.revertedWith("!governance");
    })

    it("can route premiums", async function () {
      let balancesBefore = await getBalances(deployer);
      await treasury.connect(governor).spend(ETH_ADDRESS, balancesBefore.treasuryEth, user.address);
      let depositAmount = 100;
      await treasury.connect(user).depositEth({value: depositAmount});
      await treasury.connect(governor).routePremiums();
      let balancesAfter = await getBalances(deployer);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesAfter.treasuryEth).to.equal(0);
      expect(balancesDiff.userEth).to.equal(40);
      expect(balancesDiff.treasuryWeth).to.equal(60);
    })

    it("non governor cannot wrap eth", async function () {
      await expect(treasury.connect(user).wrap(1)).to.be.revertedWith("!governance");
    })

    it("can wrap eth", async function () {
      let depositAmount = BN.from(100);
      await treasury.connect(user).depositEth({value: depositAmount});
      let wrapAmount = BN.from(50);
      let balancesBefore = await getBalances(user);
      await treasury.connect(governor).wrap(wrapAmount);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(wrapAmount.mul(-1))
      expect(balancesDiff.treasuryWeth).to.equal(wrapAmount)
    })

    it("non governor cannot unwrap eth", async function () {
      await expect(treasury.connect(user).unwrap(1)).to.be.revertedWith("!governance");
    })

    it("can unwrap eth", async function () {
      let unwrapAmount = BN.from(50);
      let balancesBefore = await getBalances(user);
      await treasury.connect(governor).unwrap(unwrapAmount, {gasLimit: 50000});
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(unwrapAmount)
      expect(balancesDiff.treasuryWeth).to.equal(unwrapAmount.mul(-1))
    })
  })

  describe("refund", function () {
    before(async function() {
      await registry.connect(governor).setPolicyManager(policyManager.address);
    })

    it("non product cannot refund", async function () {
      await expect(treasury.connect(mockProduct).refund(user.address, 1)).to.be.revertedWith("!product");
    })

    it("product can refund in full", async function () {
      await policyManager.connect(governor).addProduct(mockProduct.address);
      let balancesBefore = await getBalances(user);
      let refundAmount = balancesBefore.treasuryEth.sub(10);
      await treasury.connect(mockProduct).refund(user.address, refundAmount);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(refundAmount.mul(-1));
      expect(balancesDiff.userEth).to.equal(refundAmount);
    })

    it("product can partially refund", async function () {
      let balancesBefore = await getBalances(user);
      let totalEth = balancesBefore.treasuryEth.add(balancesBefore.treasuryWeth);
      let refundAmount = totalEth.add(10);
      await treasury.connect(mockProduct).refund(user.address, refundAmount);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesAfter.treasuryEth).to.equal(0);
      expect(balancesAfter.treasuryWeth).to.equal(0);
      expect(balancesDiff.userEth).to.equal(totalEth);
      expect(await treasury.unpaidRewards(user.address)).to.equal(10);

      await treasury.connect(deployer).depositEth({value: 20});
      let tx = await treasury.connect(user).withdraw()
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(tx.gasPrice);
      let balancesAfter2 = await getBalances(user);
      let balancesDiff2 = getBalancesDiff(balancesAfter2, balancesBefore);
      expect(balancesDiff2.userEth).to.equal(refundAmount.sub(gasCost));
      expect(await treasury.unpaidRewards(user.address)).to.equal(0);
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
      pool = (new Contract(poolAddress, artifacts.UniswapV3Pool.abi)) as Contract;
    } else {
      pool = (new Contract(ZERO_ADDRESS, artifacts.UniswapV3Pool.abi)) as Contract;
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
