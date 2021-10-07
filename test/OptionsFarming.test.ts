import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;

import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Vault, FarmController, OptionsFarming, CpFarm, Weth9, PolicyManager, RiskManager, Registry } from "../typechain";
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

// uniswap contracts
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let lpToken: Contract;

// pools
let mediumPool: Contract;

// vars
let solacePerSecond: BN = BN.from("100000000000000000000"); // 100 e18
let solacePerSecond2: BN = BN.from("200000000000000000000"); // 200 e18
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
let timestamp: number;
let initTime: number;
let startTime: number;
let endTime: number;

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
    const [deployer, governor, farmer1, farmer2, farmer3, farmer4,receiver] = provider.getWallets();
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
      await solace.connect(governor).transfer(farmer1.address, TEN_ETHER);
      await solace.connect(governor).transfer(farmer2.address, TEN_ETHER);
      await solace.connect(governor).transfer(farmer3.address, TEN_ETHER);
      await solace.connect(governor).transfer(farmer4.address, TEN_ETHER);
      await weth.connect(farmer1).deposit({value: TEN_ETHER});
      await weth.connect(farmer2).deposit({value: TEN_ETHER});
      await weth.connect(farmer3).deposit({value: TEN_ETHER});
      await weth.connect(farmer4).deposit({value: TEN_ETHER});

      // approve tokens
      await solace.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
      await solace.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
      await solace.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
      await solace.connect(farmer4).approve(lpToken.address, constants.MaxUint256);
      await weth.connect(farmer1).approve(lpToken.address, constants.MaxUint256);
      await weth.connect(farmer2).approve(lpToken.address, constants.MaxUint256);
      await weth.connect(farmer3).approve(lpToken.address, constants.MaxUint256);
      await weth.connect(farmer4).approve(lpToken.address, constants.MaxUint256);

      // create pools
      solaceEthPool = await createPool(weth, solace, FeeAmount.MEDIUM);
      solaceEthPool2 = await createPool(weth, solace, FeeAmount.HIGH);
      ethUsdPool = (await ethers.getContractAt(artifacts.UniswapV3Pool.abi, ETH_USD_POOL_ADDRESS)) as Contract;
    })

    describe("governance", function () {
      it("starts with the correct governor", async function () {
        expect(await optionsFarming.governance()).to.equal(governor.address);
      });
      it("rejects setting new governance by non governor", async function () {
        await expect(optionsFarming.connect(farmer1).setGovernance(farmer1.address)).to.be.revertedWith("!governance");
      });
      it("can set new governance", async function () {
        await optionsFarming.connect(governor).setGovernance(deployer.address);
        expect(await optionsFarming.governance()).to.equal(governor.address);
        expect(await optionsFarming.newGovernance()).to.equal(deployer.address);
      });
      it("rejects governance transfer by non governor", async function () {
        await expect(optionsFarming.connect(farmer1).acceptGovernance()).to.be.revertedWith("!governance");
      });
      it("can transfer governance", async function () {
        let tx = await optionsFarming.connect(deployer).acceptGovernance();
        await expect(tx).to.emit(optionsFarming, "GovernanceTransferred").withArgs(deployer.address);
        expect(await optionsFarming.governance()).to.equal(deployer.address);
        expect(await optionsFarming.newGovernance()).to.equal(ZERO_ADDRESS);
        await optionsFarming.connect(deployer).setGovernance(governor.address);
        await optionsFarming.connect(governor).acceptGovernance();
      });
    });

    describe("solace", function () {
      it("starts zero", async function () {
        expect(await optionsFarming.solace()).to.equal(ZERO_ADDRESS);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer1).setSolace(solace.address)).to.be.revertedWith("!governance")
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
        await expect(optionsFarming.connect(farmer1).setFarmController(farmController.address)).to.be.revertedWith("!governance")
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
        await expect(optionsFarming.connect(farmer1).setReceiver(receiver.address)).to.be.revertedWith("!governance")
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
        await expect(optionsFarming.connect(farmer1).setExpiryDuration(1)).to.be.revertedWith("!governance")
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
        await expect(optionsFarming.connect(farmer1).setSolaceEthPool(solaceEthPool.address)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setSolaceEthPool(solaceEthPool.address);
        expect(tx).to.emit(optionsFarming, "SolaceEthPoolSet").withArgs(solaceEthPool.address);
      });
    });

    describe("eth usd pool", function () {
      it("starts zero", async function () {
        expect(await optionsFarming.ethUsdPool()).to.equal(ZERO_ADDRESS);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer1).setEthUsdPool(ethUsdPool.address)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setEthUsdPool(ethUsdPool.address);
        expect(tx).to.emit(optionsFarming, "EthUsdPoolSet").withArgs(ethUsdPool.address);
      });
    });

    describe("twap interval", function () {
      it("starts set", async function () {
        expect(await optionsFarming.twapInterval()).to.equal(TWAP_INTERVAL);
      });
      it("cannot be set by non governance", async function () {
        await expect(optionsFarming.connect(farmer1).setTwapInterval(1)).to.be.revertedWith("!governance")
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
        await expect(optionsFarming.connect(farmer1).setSwapRate(1)).to.be.revertedWith("!governance")
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
        await expect(optionsFarming.connect(farmer1).setPriceFloor(1)).to.be.revertedWith("!governance")
      });
      it("can be set", async function () {
        let tx = await optionsFarming.connect(governor).setPriceFloor(1);
        expect(tx).to.emit(optionsFarming, "PriceFloorSet").withArgs(1);
        await optionsFarming.connect(governor).setPriceFloor(constants.MaxUint256);
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
  });
}
