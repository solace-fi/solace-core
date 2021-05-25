import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { expectClose } from "./utilities/chai_extensions";
import { burnBlocks, burnBlocksUntil } from "./utilities/time";
import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";
import { encodePath } from "./utilities/path";
import { bnAddSub, bnMulDiv } from "./utilities/math";
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";
import getPermitNFTSignature from "./utilities/getPermitNFTSignature";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Master, Weth9, MockErc20, SolaceEthLpFarm, LpAppraisor } from "../typechain";

describe("LpAppraisor", function () {
  let artifacts: ArtifactImports;

  // users
  let deployer: Wallet;
  let governor: Wallet;
  let farmer1: Wallet;

  // contracts
  let solaceToken: Solace;
  let master: Master;
  let weth: Weth9;
  let farm: SolaceEthLpFarm;
  let lpTokenAppraisor1: LpAppraisor;
  let lpTokenAppraisor2: LpAppraisor;

  // uniswap contracts
  let uniswapFactory: Contract;
  let uniswapRouter: Contract;
  let lpToken: Contract;

  // pools
  let mediumPool: Contract;

  // vars
  let solacePerBlock = BN.from("100000000000000000000"); // 100 e18
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const TEN_ETHER = BN.from("10000000000000000000");
  const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
  let blockNum: BN;
  let startBlock: BN;
  let endBlock: BN;
  let solaceEthLpFarmType = 3;

  const solaceTokenName = "solace";
  const lpTokenName = "Uniswap V3 Positions NFT-V1";
  const chainId = 31337;
  const deadline = constants.MaxUint256;

  let token1: BN;

  before(async function () {
    [deployer, governor, farmer1, ] = provider.getWallets();
    artifacts = await import_artifacts();

    // deploy solace token
    solaceToken = (await deployContract(
      deployer,
      artifacts.SOLACE,
      [
        governor.address
      ]
    )) as Solace;

    // deploy weth
    weth = (await deployContract(
        deployer,
        artifacts.WETH
    )) as Weth9;

    // deploy master contract
    master = (await deployContract(
      deployer,
      artifacts.Master,
      [
        governor.address,
        solaceToken.address,
        solacePerBlock
      ]
    )) as Master;

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

    // deploy uniswap nft / lp token
    lpToken = (await deployContract(
      deployer,
      artifacts.NonfungiblePositionManager,
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
    await weth.connect(farmer1).deposit({value: TEN_ETHER});

    // approve tokens
    await solaceToken.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
    await weth.connect(farmer1).approve(lpToken.address, constants.MaxUint256);

    // create pools
    mediumPool = await createPool(weth, solaceToken, FeeAmount.MEDIUM);
  })

  describe("governance", function () {
    before(async function () {
      lpTokenAppraisor1 = await deployLpAppraisor(20000, 40000);
      lpTokenAppraisor2 = await deployLpAppraisor(15000, 20000);
      farm = await createSolaceEthLpFarm();
    })

    it("starts with the correct governor", async function () {
      expect(await lpTokenAppraisor1.governance()).to.equal(governor.address);
    })

    it("rejects setting new governance by non governor", async function () {
      await expect(lpTokenAppraisor1.connect(farmer1).setGovernance(farmer1.address)).to.be.revertedWith("!governance");
    })

    it("can set new governance", async function () {
      await lpTokenAppraisor1.connect(governor).setGovernance(deployer.address);
      expect(await lpTokenAppraisor1.governance()).to.equal(governor.address);
      expect(await lpTokenAppraisor1.newGovernance()).to.equal(deployer.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(lpTokenAppraisor1.connect(farmer1).acceptGovernance()).to.be.revertedWith("!governance");
    })

    it("can transfer governance", async function () {
      let tx = await lpTokenAppraisor1.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(lpTokenAppraisor1, "GovernanceTransferred").withArgs(deployer.address);
      expect(await lpTokenAppraisor1.governance()).to.equal(deployer.address);
      expect(await lpTokenAppraisor1.newGovernance()).to.equal(ZERO_ADDRESS);

      await lpTokenAppraisor1.connect(deployer).setGovernance(governor.address);
      await lpTokenAppraisor1.connect(governor).acceptGovernance();
    })
  })

  describe("appraisal", function () {
    it("cannot appraise non existant tokens", async function () {
      await expect(lpTokenAppraisor1.appraise(1)).to.be.reverted;
    })

    it("appraises tokens", async function () {
      token1 = await mintLpToken(farmer1, solaceToken, weth, FeeAmount.MEDIUM, 10000);
      let value1 = await lpTokenAppraisor1.appraise(token1);
      expect(value1).to.be.gt(0); // TODO: test values
      let value2 = await farm.appraise(token1);
      expect(value2).to.be.eq(value1);
    })
  })

  describe("incentive tuning", async function () {
    it("non governance cannot tune the curve", async function () {
      await expect(lpTokenAppraisor1.connect(farmer1).setCurve(10000, 20000)).to.be.revertedWith("!governance");
    })

    it("governance can tune the incentive curve", async function () {
      let value1 = await farm.appraise(token1);
      await lpTokenAppraisor1.connect(governor).setCurve(10000, 20000);
      let value2 = await farm.appraise(token1);
      expect(value2).to.not.eq(value1);
    })

    it("non governance cannot replace the appraisal contract", async function () {
      await expect(farm.connect(farmer1).setAppraisor(lpTokenAppraisor2.address)).to.be.revertedWith("!governance");
    })

    it("governance can replace the appraisal contract", async function () {
      let value2 = await farm.appraise(token1);
      await farm.connect(governor).setAppraisor(lpTokenAppraisor2.address);
      let value3 = await farm.appraise(token1);
      expect(value3).to.not.eq(value2);
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
      pool = await ethers.getContractAt(artifacts.UniswapV3Pool.abi, poolAddress);
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

  async function createSolaceEthLpFarm(
    stakeToken: Contract = lpToken,
    startBlock: BigNumberish = BN.from(0),
    endBlock: BigNumberish = BN.from(0),
    pool: Contract = mediumPool,
    appraisor: LpAppraisor = lpTokenAppraisor1
  ) {
    let farm = (await deployContract(
      deployer,
      artifacts.SolaceEthLpFarm,
      [
        governor.address,
        master.address,
        stakeToken.address,
        solaceToken.address,
        startBlock,
        endBlock,
        pool.address,
        weth.address,
        appraisor.address
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

  async function deployLpAppraisor(
    curve_A: BigNumberish = 20000,
    curve_B: BigNumberish = 40000
  ) {
    let lpTokenAppraisor = (await deployContract(
      deployer,
      artifacts.LpAppraisor,
      [
        governor.address,
        lpToken.address,
        curve_A,
        curve_B
      ]
    )) as LpAppraisor;
    return lpTokenAppraisor;
  }
});
