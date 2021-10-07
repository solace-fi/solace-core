import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;

import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Vault, FarmController, OptionsFarming, CpFarm, Weth9, PolicyManager, RiskManager, Registry, MockFaultyReceiver } from "../typechain";
import { bnAddSub, bnMulDiv, expectClose } from "./utilities/math";

chai.use(solidity);

// contracts
let solace: Solace;
let farmController: FarmController;
let optionsFarming: OptionsFarming;
let vault: Vault;
let weth: Weth9;
let registry: Registry;
let policyManager: PolicyManager;
let riskManager: RiskManager;

let faultyReceiver: MockFaultyReceiver;

// uniswap contracts
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let lpToken: Contract;


// vars
let solacePerSecond: BN = BN.from("100000000000000000000"); // 100 e18
let solacePerSecond2: BN = BN.from("200000000000000000000"); // 200 e18
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
const Q96 = BN.from("0x1000000000000000000000000");

const EXPIRY_DURATION = 2592000; // 30 days
const TWAP_INTERVAL = 3600; // one hour
const SWAP_RATE = 10000; // 100%
const PRICE_FLOOR = 30000; // 3 cents USDC per solace

const WETH_ADDRESS              = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const UNISWAP_FACTORY_ADDRESS   = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const UNISWAP_POSITIONS_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const UNISWAP_ROUTER_ADDRESS    = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const ETH_USD_POOL_ADDRESS      = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";
let solaceEthPool: Contract;
let solaceEthPool2: Contract;
let ethUsdPool: Contract;

if(process.env.FORK_NETWORK === "mainnet"){
  describe("OptionsFarming", function () {
    const [deployer, governor, farmer, trader,receiver] = provider.getWallets();
    let artifacts: ArtifactImports;

    before(async function () {
      artifacts = await import_artifacts();
      await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

      weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;

      // fetch uniswap contracts
      uniswapFactory = (await ethers.getContractAt(artifacts.UniswapV3Factory.abi, UNISWAP_FACTORY_ADDRESS)) as Contract;
      lpToken = (await ethers.getContractAt(artifacts.NonfungiblePositionManager.abi, UNISWAP_POSITIONS_ADDRESS)) as Contract;
      uniswapRouter = (await ethers.getContractAt(artifacts.SwapRouter.abi, UNISWAP_ROUTER_ADDRESS)) as Contract;

      // deploy solace contracts
      registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await registry.connect(governor).setWeth(weth.address);
      vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
      await registry.connect(governor).setVault(vault.address);
      policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
      await registry.connect(governor).setPolicyManager(policyManager.address);
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
      await registry.connect(governor).setRiskManager(riskManager.address);
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      await registry.connect(governor).setSolace(solace.address);
      optionsFarming = (await deployContract(deployer, artifacts.OptionsFarming, [governor.address])) as OptionsFarming;
      await registry.connect(governor).setOptionsFarming(optionsFarming.address);
      farmController = (await deployContract(deployer, artifacts.FarmController, [governor.address, optionsFarming.address, solacePerSecond])) as FarmController;
      await registry.connect(governor).setFarmController(farmController.address);

      // transfer tokens
      await solace.connect(governor).addMinter(governor.address);
      await solace.connect(governor).mint(optionsFarming.address, ONE_MILLION_ETHER);
      await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
      await solace.connect(governor).transfer(farmer.address, TEN_ETHER);
      await solace.connect(governor).transfer(trader.address, TEN_ETHER);
      await weth.connect(farmer).deposit({value: TEN_ETHER});
      await weth.connect(trader).deposit({value: TEN_ETHER});

      // approve tokens
      await solace.connect(farmer).approve(lpToken.address, constants.MaxUint256);
      await weth.connect(farmer).approve(lpToken.address, constants.MaxUint256);
      await solace.connect(trader).approve(lpToken.address, constants.MaxUint256);
      await weth.connect(trader).approve(lpToken.address, constants.MaxUint256);
      await solace.connect(farmer).approve(uniswapRouter.address, constants.MaxUint256);
      await weth.connect(farmer).approve(uniswapRouter.address, constants.MaxUint256);
      await solace.connect(trader).approve(uniswapRouter.address, constants.MaxUint256);
      await weth.connect(trader).approve(uniswapRouter.address, constants.MaxUint256);

      // create pools
      solaceEthPool = await createPool(weth, solace, FeeAmount.MEDIUM);
      solaceEthPool2 = await createPool(weth, solace, FeeAmount.HIGH);
      ethUsdPool = (await ethers.getContractAt(artifacts.UniswapV3Pool.abi, ETH_USD_POOL_ADDRESS)) as Contract;

      faultyReceiver = await (deployContract(deployer, artifacts.MockFaultyReceiver)) as MockFaultyReceiver;
    })

    describe("governance", function () {
      it("starts with the correct governor", async function () {
        expect(await optionsFarming.governance()).to.equal(governor.address);
      });
      it("rejects setting pending governance by non governor", async function () {
        await expect(optionsFarming.connect(farmer).setGovernance(farmer.address)).to.be.revertedWith("!governance");
      });
      it("can set pending governance", async function () {
        let tx = await optionsFarming.connect(governor).setGovernance(deployer.address);
        expect(tx).to.emit(optionsFarming, "GovernancePending").withArgs(deployer.address);
        expect(await optionsFarming.governance()).to.equal(governor.address);
        expect(await optionsFarming.pendingGovernance()).to.equal(deployer.address);
      });
      it("rejects governance transfer by non governor", async function () {
        await expect(optionsFarming.connect(farmer).acceptGovernance()).to.be.revertedWith("!governance");
      });
      it("can transfer governance", async function () {
        let tx = await optionsFarming.connect(deployer).acceptGovernance();
        await expect(tx).to.emit(optionsFarming, "GovernanceTransferred").withArgs(governor.address, deployer.address);
        expect(await optionsFarming.governance()).to.equal(deployer.address);
        expect(await optionsFarming.pendingGovernance()).to.equal(ZERO_ADDRESS);
        await optionsFarming.connect(deployer).setGovernance(governor.address);
        await optionsFarming.connect(governor).acceptGovernance();
      });
    });

    describe("solace", function () {
      it("starts zero", async function () {
        expect(await optionsFarming.solace()).to.equal(ZERO_ADDRESS);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer).setSolace(solace.address)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setSolace(solace.address);
        expect(tx).to.emit(optionsFarming, "SolaceSet").withArgs(solace.address);
      });
    });

    describe("farm controller", function () {
      it("starts zero", async function () {
        expect(await optionsFarming.farmController()).to.equal(ZERO_ADDRESS);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer).setFarmController(farmController.address)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setFarmController(farmController.address);
        expect(tx).to.emit(optionsFarming, "FarmControllerSet").withArgs(farmController.address);
      });
    });

    describe("receiver", function () {
      it("starts zero", async function () {
        expect(await optionsFarming.receiver()).to.equal(ZERO_ADDRESS);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer).setReceiver(receiver.address)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setReceiver(receiver.address);
        expect(tx).to.emit(optionsFarming, "ReceiverSet").withArgs(receiver.address);
      });
    });

    describe("expiry duration", function () {
      it("starts set", async function () {
        expect(await optionsFarming.expiryDuration()).to.equal(EXPIRY_DURATION);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer).setExpiryDuration(1)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setExpiryDuration(1);
        expect(tx).to.emit(optionsFarming, "ExpiryDurationSet").withArgs(1);
        await optionsFarming.connect(governor).setExpiryDuration(EXPIRY_DURATION);
      });
    });

    describe("solace eth pool", function () {
      it("starts zero", async function () {
        expect(await optionsFarming.solaceEthPool()).to.equal(ZERO_ADDRESS);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer).setSolaceEthPool(solaceEthPool.address, false)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let solaceIsToken0 = BN.from(solace.address).lt(BN.from(weth.address));
        let tx = await optionsFarming.connect(governor).setSolaceEthPool(solaceEthPool.address, solaceIsToken0);
        expect(tx).to.emit(optionsFarming, "SolaceEthPoolSet").withArgs(solaceEthPool.address);
      });
    });

    describe("eth usd pool", function () {
      it("starts zero", async function () {
        expect(await optionsFarming.ethUsdPool()).to.equal(ZERO_ADDRESS);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer).setEthUsdPool(ethUsdPool.address, false)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let usdIsToken0 = true;
        let tx = await optionsFarming.connect(governor).setEthUsdPool(ethUsdPool.address, usdIsToken0);
        expect(tx).to.emit(optionsFarming, "EthUsdPoolSet").withArgs(ethUsdPool.address);
      });
    });

    describe("twap interval", function () {
      it("starts set", async function () {
        expect(await optionsFarming.twapInterval()).to.equal(TWAP_INTERVAL);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer).setTwapInterval(1)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setTwapInterval(1);
        expect(tx).to.emit(optionsFarming, "TwapIntervalSet").withArgs(1);
        await optionsFarming.connect(governor).setTwapInterval(TWAP_INTERVAL);
      });
    });

    describe("swap rate", function () {
      it("starts set", async function () {
        expect(await optionsFarming.swapRate()).to.equal(10000);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer).setSwapRate(1)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setSwapRate(1);
        expect(tx).to.emit(optionsFarming, "SwapRateSet").withArgs(1);
        await optionsFarming.connect(governor).setSwapRate(10000);
      });
    });

    describe("price floor", function () {
      it("starts infinite", async function () {
        expect(await optionsFarming.priceFloor()).to.equal(constants.MaxUint256);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer).setPriceFloor(1)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setPriceFloor(1);
        expect(tx).to.emit(optionsFarming, "PriceFloorSet").withArgs(1);
        await optionsFarming.connect(governor).setPriceFloor(constants.MaxUint256);
      });
    });

    describe("sendValue", function () {
      it("can be called by anyone", async function () {
        await optionsFarming.sendValue();
      });
      it("does nothing if receiver is not set", async function () {
        await optionsFarming.connect(governor).setReceiver(ZERO_ADDRESS);
        await deployer.sendTransaction({to:optionsFarming.address, value:10});
        let balancesBefore = await getBalances(receiver.address);
        expect(balancesBefore.optionsFarmingEth).to.equal(10);
        await optionsFarming.sendValue();
        let balancesAfter = await getBalances(receiver.address);
        let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
        expect(balancesDiff.userEth).to.equal(0);
        expect(balancesDiff.optionsFarmingEth).to.equal(0);
      });
      it("sends value on set receiver", async function () {
        let balancesBefore = await getBalances(receiver.address);
        await optionsFarming.connect(governor).setReceiver(receiver.address);
        let balancesAfter = await getBalances(receiver.address);
        let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
        expect(balancesDiff.userEth).to.equal(10);
        expect(balancesDiff.optionsFarmingEth).to.equal(-10);
      });
      it("can send no value", async function () {
        let balancesBefore = await getBalances(receiver.address);
        await optionsFarming.sendValue();
        let balancesAfter = await getBalances(receiver.address);
        let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
        expect(balancesDiff.userEth).to.equal(0);
        expect(balancesDiff.optionsFarmingEth).to.equal(0);
      });
      it("can send value", async function () {
        await deployer.sendTransaction({to:optionsFarming.address, value:10});
        let balancesBefore = await getBalances(receiver.address);
        await optionsFarming.sendValue();
        let balancesAfter = await getBalances(receiver.address);
        let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
        expect(balancesDiff.userEth).to.equal(10);
        expect(balancesDiff.optionsFarmingEth).to.equal(-10);
      });
      it("succeeds even if receiver reverts", async function () {
        await optionsFarming.connect(governor).setReceiver(faultyReceiver.address);
        await deployer.sendTransaction({to:optionsFarming.address, value:10});
        let balancesBefore = await getBalances(faultyReceiver.address);
        expect(balancesBefore.optionsFarmingEth).to.equal(10);
        await expect(optionsFarming.sendValue()).to.not.be.reverted;
        let balancesAfter = await getBalances(faultyReceiver.address);
        let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
        expect(balancesDiff.userEth).to.equal(0);
        expect(balancesDiff.optionsFarmingEth).to.equal(0);
      })
    });

    describe("calculate strike price", function () {
      before(async function () {
        await optionsFarming.connect(governor).setSolace(ZERO_ADDRESS);
        await optionsFarming.connect(governor).setSolaceEthPool(ZERO_ADDRESS, false);
        await optionsFarming.connect(governor).setEthUsdPool(ZERO_ADDRESS, false);
      });
      it("reverts if solace not set", async function () {
        await expect(optionsFarming.calculateStrikePrice(1)).to.be.revertedWith("solace not set");
      });
      it("reverts if neither pool is set", async function () {
        await optionsFarming.connect(governor).setSolace(solace.address);
        await expect(optionsFarming.calculateStrikePrice(1)).to.be.revertedWith("pools not set");
      });
      context("eth-usd pool", async function () {
        it("", async function () {});
      });
      context("solace-eth pool", async function () {
        before(async function () {
          await optionsFarming.connect(governor).setSwapRate(7500); // 75%
        });
        // test solace is and is not token 0
        for(var tokenI in [0, 1]) {
          let token0 = (tokenI === "0");
          context(`solace ${token0 ? 'is' : 'is not'} token0`, async function () {
            before(async function () {
              // redploy solace until order is correct
              let orderCorrect = false;
              while(!orderCorrect) {
                solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
                let solaceIsToken0 = BN.from(solace.address).lt(BN.from(weth.address));
                orderCorrect = (solaceIsToken0 === token0);
              }
              await optionsFarming.connect(governor).setSolace(solace.address);
              solaceEthPool = await createPool(weth, solace, FeeAmount.MEDIUM);
              await optionsFarming.connect(governor).setSolaceEthPool(solaceEthPool.address, token0);
              await solace.connect(governor).mint(trader.address, TEN_ETHER);
              await solace.connect(trader).approve(lpToken.address, constants.MaxUint256);
              await solace.connect(trader).approve(uniswapRouter.address, constants.MaxUint256);
            });
            it("can use spot price", async function () {
              // 1 solace = 1 eth
              await optionsFarming.connect(governor).setTwapInterval(0);
              let slot0 = await solaceEthPool.slot0();
              expect(slot0.tick).to.equal(0);
              expect(slot0.sqrtPriceX96).to.equal(Q96);
              let rewardAmount = BN.from("1123456789012345678"); // 1.1 e18
              let strikePrice = await optionsFarming.calculateStrikePrice(rewardAmount);
              let expectedStrikePrice = rewardAmount.mul(7500).div(10000);
              expect(strikePrice).to.equal(expectedStrikePrice);
              // 1 solace > 1 eth
              await mintLpToken(trader, solace, weth, FeeAmount.MEDIUM, ONE_ETHER);
              let amountIn = BN.from("200000000000000000"); // 0.2 eth
              await uniswapRouter.connect(trader).exactInputSingle({tokenIn: weth.address, tokenOut: solace.address, fee: FeeAmount.MEDIUM, recipient: trader.address, deadline: constants.MaxUint256, amountIn: amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0});
              slot0 = await solaceEthPool.slot0();
              expect(slot0.tick).to.not.equal(0);
              expect(slot0.sqrtPriceX96).to.not.equal(Q96);
              let solaceBalance = await solace.balanceOf(solaceEthPool.address);
              let wethBalance = await weth.balanceOf(solaceEthPool.address);
              expect(wethBalance).to.be.gt(solaceBalance);
              strikePrice = await optionsFarming.calculateStrikePrice(rewardAmount);
              expectedStrikePrice = rewardAmount.mul(wethBalance).div(solaceBalance).mul(7500).div(10000);
              let tolerance = BN.from(1000000000000000); // 1e15
              expectClose(strikePrice, expectedStrikePrice, tolerance);
            });
            it("should revert if not enough observations", async function () {
              await optionsFarming.connect(governor).setTwapInterval(TWAP_INTERVAL);
              await expect(optionsFarming.calculateStrikePrice(1)).to.be.revertedWith("OLD");
            });
            it("can use twap", async function () {
              // swap eth for solace over time
              await solaceEthPool.increaseObservationCardinalityNext(10);
              await provider.send("evm_mine", []);
              let timestamp = (await provider.getBlock('latest')).timestamp;
              for(var i = 0; i < 5; ++i) {
                await provider.send("evm_setNextBlockTimestamp", [timestamp+1000*(i+1)]);
                let amountIn = BN.from("100000000000000000"); // 0.1 eth
                await uniswapRouter.connect(trader).exactInputSingle({tokenIn: weth.address, tokenOut: solace.address, fee: FeeAmount.MEDIUM, recipient: trader.address, deadline: constants.MaxUint256, amountIn: amountIn, amountOutMinimum: 0, sqrtPriceLimitX96: 0});
              }
              let slot0 = await solaceEthPool.slot0();
              expect(slot0.tick).to.not.equal(0);
              expect(slot0.sqrtPriceX96).to.not.equal(Q96);
              let rewardAmount = BN.from("1123456789012345678"); // 1.1 e18
              let strikePrice = await optionsFarming.calculateStrikePrice(rewardAmount);
              let expectedStrikePrice = BN.from("1799600000000000000");
              let tolerance = BN.from(1000000000000000); // 1e15
              expectClose(strikePrice, expectedStrikePrice, tolerance);
            });
          });
        }
      });
    });

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
      if (events && events.length > 0 && events[0].args && events[0].args.pool) {
        let poolAddress = events[0].args.pool;
        pool = await ethers.getContractAt(artifacts.UniswapV3Pool.abi, poolAddress);
      } else {
        pool = new Contract(ZERO_ADDRESS, artifacts.UniswapV3Pool.abi) as Contract;
        expect(true).to.equal(false);
      }
      expect(pool).to.exist;
      if (pool) {
        let sqrtPrice = encodePriceSqrt(1, 1);
        await pool.connect(governor).initialize(sqrtPrice);
      }
      return pool;
    }

    async function createCpFarm(startTime: BigNumberish = BN.from(0), endTime: BigNumberish = BN.from(0), vaultAddress: string = vault.address) {
      let farm = (await deployContract(deployer, artifacts.CpFarm, [
        governor.address,
        farmController.address,
        vaultAddress,
        startTime,
        endTime,
        weth.address,
      ])) as CpFarm;
      return farm;
    }

    interface Balances {
      userSolace: BN;
      userEth: BN;
      optionsFarmingSolace: BN;
      optionsFarmingEth: BN;
    }

    async function getBalances(user: string): Promise<Balances> {
      return {
        userSolace: await solace.balanceOf(user),
        userEth: await provider.getBalance(user),
        optionsFarmingSolace: await solace.balanceOf(optionsFarming.address),
        optionsFarmingEth: await provider.getBalance(optionsFarming.address)
      };
    }

    function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
      return {
        userSolace: balances1.userSolace.sub(balances2.userSolace),
        userEth: balances1.userEth.sub(balances2.userEth),
        optionsFarmingSolace: balances1.optionsFarmingSolace.sub(balances2.optionsFarmingSolace),
        optionsFarmingEth: balances1.optionsFarmingEth.sub(balances2.optionsFarmingEth)
      };
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
  });
}
