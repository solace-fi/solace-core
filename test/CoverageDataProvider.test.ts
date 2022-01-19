import hardhat from "hardhat";
import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, MockErc20, MockSlp, CoverageDataProvider, Registry, MockErc20Decimals, Vault, Weth9, MockPriceOracle } from "../typechain";
import { emit } from "process";

describe("CoverageDataProvider", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, underwritingPool, underwritingPool2, asset1, asset2, asset3] = provider.getWallets();

  let coverageDataProvider: CoverageDataProvider;
  let registry: Registry;
  let vault: Vault;
  let weth9: Weth9;

  // assets
  let solace: Solace;
  let solaceUsdcPool: MockSlp;
  let dai: MockErc20;
  let weth: MockErc20;
  let usdc: MockErc20Decimals;
  let wbtc: MockErc20Decimals;
  let usdt: MockErc20Decimals;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_ETH = BN.from("1000000000000000000");
  const TOKEN0 = "0x501ace9c35e60f03a2af4d484f49f9b1efde9f40";
  const TOKEN1 = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const RESERVE0 = BN.from("13250148273341498385651903");
  const RESERVE1 = BN.from("1277929641956");
  const ONE_SOLACE = ONE_ETH;
  const ONE_DAI = ONE_ETH;
  const ONE_WETH = ONE_ETH;
  const ONE_WBTC = BN.from("100000000");
  const ONE_USDT = BN.from("1000000");
  const ONE_USDC = BN.from("1000000");
  const ONE_SLP = ONE_ETH;

  // mainnet addresses
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const SOLACE_USDC_POOL = "0x9C051F8A6648a51eF324D30C235da74D060153aC";
  const AAVE_PRICE_ORACLE = "0xA50ba011c48153De246E5192C8f9258A2ba79Ca9";
  const ASSET_TYPE = {
    "SOLACE": 0,
    "ERC20": 1,
    "WETH": 2,
    "SOLACE_SLP": 3,
    "SLP": 4  
  }


  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy mock assets
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    dai = (await deployContract(deployer, artifacts.MockERC20, ["Dai Stablecoin", "DAI", ONE_DAI.mul(1000000)])) as MockErc20;
    weth = (await deployContract(deployer, artifacts.MockERC20, ["Wrapped Ether", "WETH", ONE_WETH.mul(1000000)])) as MockErc20;
    wbtc = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Wrapped BTC", "WBTC", ONE_WBTC.mul(1000000), 8])) as MockErc20Decimals;
    usdt = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Tether USD", "USDT", ONE_USDT.mul(1000000), 6])) as MockErc20Decimals;
    usdc = (await deployContract(deployer, artifacts.MockERC20Decimals, ["USD Coin", "USDC", ONE_USDC.mul(1000000), 6])) as MockErc20Decimals;
    solaceUsdcPool = (await deployContract(deployer, artifacts.MockSLP, ["SushiSwap LP Token", "SLP", ONE_ETH.mul(1000000), TOKEN0, TOKEN1, RESERVE0, RESERVE1])) as MockSlp;
    // deploy registry
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    weth9 = (await deployContract(deployer,artifacts.WETH)) as Weth9;
    await registry.connect(governor).setWeth(weth9.address); 
    vault = (await deployContract(deployer,artifacts.Vault,[deployer.address,registry.address])) as Vault;
    await registry.connect(governor).setVault(vault.address);
    await registry.connect(governor).setSolace(solace.address);

  });

  describe("deployment", function() {
    it("should revert if governance is zero address", async function () {
      await expect(deployContract(deployer, artifacts.CoverageDataProvider, [ZERO_ADDRESS, registry.address, AAVE_PRICE_ORACLE, SOLACE_USDC_POOL])).to.be.revertedWith("zero address governance");
    });

    it("should revert if registry is zero address", async function () {
      await expect(deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, ZERO_ADDRESS, AAVE_PRICE_ORACLE, SOLACE_USDC_POOL])).to.be.revertedWith("zero address registry");
    });

    it("should revert if price oracle is zero address", async function () {
      await expect(deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry.address, ZERO_ADDRESS, SOLACE_USDC_POOL])).to.be.revertedWith("zero address oracle");
    });

    it("should revert if SOLACE/USDC pool is zero address", async function () {
      await expect(deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry.address, AAVE_PRICE_ORACLE, ZERO_ADDRESS])).to.be.revertedWith("zero address pool");
    });

    it("should revert if SOLACE is zero address", async function () {
      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await expect(deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry2.address, AAVE_PRICE_ORACLE, SOLACE_USDC_POOL])).to.be.revertedWith("zero address solace");
    });

    it("should deploy", async function () {
      coverageDataProvider = await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry.address, AAVE_PRICE_ORACLE, SOLACE_USDC_POOL]) as CoverageDataProvider;
      expect(await coverageDataProvider.connect(governor).registry()).to.be.equal(registry.address);
    });

    it("should deploy with initial values", async function() {
      expect(await coverageDataProvider.connect(governor).registry()).to.be.equal(registry.address);
      expect(await coverageDataProvider.connect(governor).solace()).to.be.equal(solace.address);
      expect(await coverageDataProvider.connect(governor).solaceUsdcPool()).to.be.equal(SOLACE_USDC_POOL);
      expect(await coverageDataProvider.connect(governor).priceOracle()).to.be.equal(AAVE_PRICE_ORACLE);
      expect(await coverageDataProvider.connect(governor).numOfPools()).to.be.equal(0);
      expect(await coverageDataProvider.connect(governor).numOfAssets()).to.be.equal(7);
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await coverageDataProvider.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function () {
      await expect(coverageDataProvider.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function () {
      let tx = await coverageDataProvider.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(coverageDataProvider, "GovernancePending").withArgs(deployer.address);
      expect(await coverageDataProvider.governance()).to.equal(governor.address);
      expect(await coverageDataProvider.pendingGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async function () {
      await expect(coverageDataProvider.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async function () {
      let tx = await coverageDataProvider.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(coverageDataProvider, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await coverageDataProvider.governance()).to.equal(deployer.address);
      expect(await coverageDataProvider.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await coverageDataProvider.connect(deployer).setPendingGovernance(governor.address);
      await coverageDataProvider.connect(governor).acceptGovernance();
    });
  });

  describe("addPools", function() {
    before(async function() {
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(0);
    });

    it("should revert for non-governance", async function() {
      await expect(coverageDataProvider.connect(user).addPools([underwritingPool.address])).to.be.revertedWith("!governance");
    });

    it("should revert for invalid pool size", async function() {
      await expect(coverageDataProvider.connect(governor).addPools([])).to.be.revertedWith("invalid pool length");
    });

    it("should revert for zero address pool", async function() {
      await expect(coverageDataProvider.connect(governor).addPools([underwritingPool.address, ZERO_ADDRESS])).to.be.revertedWith("zero address pool");
    });

    it("should add pool", async function() {
      let tx = await coverageDataProvider.connect(governor).addPools([underwritingPool.address, underwritingPool2.address]);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolAdded").withArgs(underwritingPool.address);
    });

    it("should get underwriting pool count", async function(){
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(2);
    });

    it("should get underwriting pool for the given index", async function() {
      expect(await coverageDataProvider.connect(user).poolAt(1)).to.be.equal(underwritingPool.address);
      expect(await coverageDataProvider.connect(user).poolAt(2)).to.be.equal(underwritingPool2.address);
    });

    it("should get zero address underwriting pool for non-existing pool index", async function() {
      expect(await coverageDataProvider.connect(user).poolAt(0)).to.be.equal(ZERO_ADDRESS);
      expect(await coverageDataProvider.connect(user).poolAt(1000)).to.be.equal(ZERO_ADDRESS);
    });    
  });

  describe("setPoolStatus", function() {
    before(async function() {
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(2);
      expect(await coverageDataProvider.connect(user).poolAt(1)).to.be.equal(underwritingPool.address);
      expect(await coverageDataProvider.connect(user).poolAt(2)).to.be.equal(underwritingPool2.address);

    });

    it("should start with defaults", async function() {
      expect(await coverageDataProvider.connect(user).poolStatus(underwritingPool.address)).to.be.equal(true);
      expect(await coverageDataProvider.connect(user).poolStatus(underwritingPool2.address)).to.be.equal(true);
    });

    it("should revert for non-governance", async function() {
      await expect(coverageDataProvider.connect(user).setPoolStatus(underwritingPool2.address, false)).to.be.revertedWith("!governance");
    });

    it("should revert for zero address underwriting pool", async function() {
      await expect(coverageDataProvider.connect(governor).setPoolStatus(ZERO_ADDRESS, false)).to.be.revertedWith("zero address pool");
    });

    it("should revert for invalid underwriting pool", async function() {
      await expect(coverageDataProvider.connect(governor).setPoolStatus(user.address, false)).to.be.revertedWith("invalid pool");
    });

    it("should set underwriting pool status", async function() {
      let tx = await coverageDataProvider.connect(governor).setPoolStatus(underwritingPool2.address, false);
      await expect(tx).to.emit(coverageDataProvider, "UnderwritingPoolStatusUpdated").withArgs(underwritingPool2.address, false);
    });

    it("should get underwriting pool status", async function() {
      expect(await coverageDataProvider.connect(user).poolStatus(underwritingPool2.address)).to.be.equal(false);
    });

    it("should get false for non-existing underwriting pool", async function() {
      expect(await coverageDataProvider.connect(user).poolStatus(user.address)).to.be.equal(false);
    });
  });

  describe("setRegistry", function() {
    let registry2: Registry;
    
    before(async function() {
      registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    });

    after(async function() {
      await coverageDataProvider.connect(governor).setRegistry(registry.address);
    });

    it("should start with defaults", async function() {
      expect(await coverageDataProvider.connect(user).registry()).to.be.equal(registry.address);
    });

    it("should revert for the non-governance", async function() {
      await expect(coverageDataProvider.connect(user).setRegistry(registry2.address)).to.be.revertedWith("!governance");
    });

    it("should revert for zero address registry", async function() {
      await expect(coverageDataProvider.connect(governor).setRegistry(ZERO_ADDRESS)).to.be.revertedWith("zero address registry");
    });

    it("should revert for zero address solace", async function() {
      await expect(coverageDataProvider.connect(governor).setRegistry(registry2.address)).to.be.revertedWith("zero address solace");
    });

    it("should set registry", async function() {
      await registry2.connect(governor).setSolace(solace.address);
      let tx = await coverageDataProvider.connect(governor).setRegistry(registry2.address);
      await expect(tx).emit(coverageDataProvider, "RegistryUpdated").withArgs(registry2.address);
    });

    it("should get registry", async function() {
      expect(await coverageDataProvider.connect(user).registry()).to.be.equal(registry2.address);
    });
  });

  describe("setSolace", function() {
    after(async function() {
      await coverageDataProvider.connect(governor).setSolace(solace.address);
    });

    it("should start with defaults", async function() {
      expect(await coverageDataProvider.connect(user).solace()).to.be.equal(solace.address);
    });

    it("should revert for the non-governance", async function() {
      await expect(coverageDataProvider.connect(user).setSolace(user.address)).to.be.revertedWith("!governance");
    });

    it("should revert for zero address solace", async function() {
      await expect(coverageDataProvider.connect(governor).setSolace(ZERO_ADDRESS)).to.be.revertedWith("zero address solace");
    });

    it("should set solace", async function() {
      let tx = await coverageDataProvider.connect(governor).setSolace(user.address);
      await expect(tx).emit(coverageDataProvider, "SolaceUpdated").withArgs(user.address);
    });

    it("should get solace", async function() {
      expect(await coverageDataProvider.connect(user).solace()).to.be.equal(user.address);
    });
  });

  describe("setSolaceUsdcPool", function() {
    after(async function() {
      await coverageDataProvider.connect(governor).setSolaceUsdcPool(SOLACE_USDC_POOL);
    });

    it("should start with defaults", async function() {
      expect(await coverageDataProvider.connect(user).solaceUsdcPool()).to.be.equal(SOLACE_USDC_POOL);
    });

    it("should revert for the non-governance", async function() {
      await expect(coverageDataProvider.connect(user).setSolaceUsdcPool(user.address)).to.be.revertedWith("!governance");
    });

    it("should revert for zero SOLACE/USDC pool address", async function() {
      await expect(coverageDataProvider.connect(governor).setSolaceUsdcPool(ZERO_ADDRESS)).to.be.revertedWith("zero address slp");
    });

    it("should set SOLACE/USDC pool", async function() {
      let tx = await coverageDataProvider.connect(governor).setSolaceUsdcPool(user.address);
      await expect(tx).emit(coverageDataProvider, "SolaceUsdcPoolUpdated").withArgs(user.address);
    });

    it("should get SOLACE/USDC pool", async function() {
      expect(await coverageDataProvider.connect(user).solaceUsdcPool()).to.be.equal(user.address);
    });
  });

  describe("setPriceOracle", function() {
    after(async function() {
      await coverageDataProvider.connect(governor).setPriceOracle(AAVE_PRICE_ORACLE);
    });

    it("should start with defaults", async function() {
      expect(await coverageDataProvider.connect(user).priceOracle()).to.be.equal(AAVE_PRICE_ORACLE);
    });

    it("should revert for the non-governance", async function() {
      await expect(coverageDataProvider.connect(user).setPriceOracle(user.address)).to.be.revertedWith("!governance");
    });

    it("should revert for zero address oracle", async function() {
      await expect(coverageDataProvider.connect(governor).setPriceOracle(ZERO_ADDRESS)).to.be.revertedWith("zero address oracle");
    });

    it("should set price oracle", async function() {
      let tx = await coverageDataProvider.connect(governor).setPriceOracle(user.address);
      await expect(tx).emit(coverageDataProvider, "PriceOracleUpdated").withArgs(user.address);
    });

    it("should get price oracle", async function() {
      expect(await coverageDataProvider.connect(user).priceOracle()).to.be.equal(user.address);
    });
  });

  describe("addAsset", function() {
    it("should start with default asset count", async function() {
      expect(await coverageDataProvider.connect(user).numOfAssets()).to.equal(7);
    });

    it("should start with SOLACE", async function() {
      const asset = await coverageDataProvider.connect(user).assetAt(1);
      expect(asset.asset_).to.be.equal(await registry.solace());
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.SOLACE);
    });

    it("should start with correct SOLACE/USDC", async function() {
      const asset = await coverageDataProvider.connect(user).assetAt(2);
      expect(asset.asset_).to.be.equal(SOLACE_USDC_POOL);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.SOLACE_SLP);
    });

    it("should start with correct DAI", async function() {
      const asset = await coverageDataProvider.connect(user).assetAt(3);
      expect(asset.asset_).to.be.equal(DAI);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);
    });

    it("should start with correct WETH", async function() {
      const asset = await coverageDataProvider.connect(user).assetAt(4);
      expect(asset.asset_).to.be.equal(WETH);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.WETH);
    });

    it("should start with correct USDC", async function() {
      const asset = await coverageDataProvider.connect(user).assetAt(5);
      expect(asset.asset_).to.be.equal(USDC);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);
    });

    it("should start with correct WBTC", async function() {
      const asset = await coverageDataProvider.connect(user).assetAt(6);
      expect(asset.asset_).to.be.equal(WBTC);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);
    });

    it("should start with correct USDT", async function() {
      const asset = await coverageDataProvider.connect(user).assetAt(7);
      expect(asset.asset_).to.be.equal(USDT);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);
    });

    it("should get zero address for non-existing asset index", async function() {
      const asset = await coverageDataProvider.connect(user).assetAt(1000);
      expect(asset.asset_).to.be.equal(ZERO_ADDRESS);
    });

    it("should revert for the non-governance", async function() {
      await expect(coverageDataProvider.connect(user).addAsset(asset1.address, ASSET_TYPE.ERC20)).to.be.revertedWith("!governance");
    });

    it("should revert for invalid asset type", async function() {
      await expect(coverageDataProvider.connect(governor).addAsset(asset1.address, 100)).to.be.reverted;
    });

    it("should revert for zero address asset", async function() {
      await expect(coverageDataProvider.connect(governor).addAsset(ZERO_ADDRESS, ASSET_TYPE.ERC20)).to.be.revertedWith("zero address asset");
    });

    it("should not add duplicate asset", async function() {
      await coverageDataProvider.connect(governor).addAsset(DAI, ASSET_TYPE.ERC20);
      expect(await coverageDataProvider.connect(governor).numOfAssets()).to.be.equal(7);
    });

    it("should add asset", async function() {
      let tx = await coverageDataProvider.connect(governor).addAsset(asset1.address, ASSET_TYPE.ERC20);
      await expect(tx).emit(coverageDataProvider, "AssetAdded").withArgs(asset1.address);
      expect(await coverageDataProvider.connect(governor).numOfAssets()).to.be.equal(8);
      const asset = await coverageDataProvider.connect(user).assetAt(8);
      expect(asset.asset_).to.be.equal(asset1.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);
    });
  });

  describe("removeAsset", function() {
    before(async function() {
      expect(await coverageDataProvider.connect(governor).numOfAssets()).to.be.equal(8);
    });

    it("should revert for the non-governance", async function() {
      await expect(coverageDataProvider.connect(user).removeAsset(asset1.address)).to.be.revertedWith("!governance");
    });

    it("should not do anything for non-existing asset", async function() {
      await coverageDataProvider.connect(governor).removeAsset(asset2.address);
      expect(await coverageDataProvider.connect(governor).numOfAssets()).to.be.equal(8);
    });

    it("should remove the asset", async function() {
      let tx = await coverageDataProvider.connect(governor).removeAsset(asset1.address);
      await expect(tx).emit(coverageDataProvider, "AssetRemoved").withArgs(asset1.address);
      expect(await coverageDataProvider.connect(user).numOfAssets()).to.be.equal(7);
    });

    it("should safely remove an asset that is not in the last index of _indexToAsset mapping", async function () {
      // OVERALL - Remove and re-add wBTC @ index 6
      let removedAsset = await coverageDataProvider.connect(user).assetAt(6);
      expect(removedAsset.asset_).to.be.equal(WBTC);
      expect(removedAsset.assetType_).to.be.equal(ASSET_TYPE.ERC20);

      let lastIndexAsset = await coverageDataProvider.connect(user).assetAt(7);
      expect(lastIndexAsset.asset_).to.be.equal(USDT);
      expect(lastIndexAsset.assetType_).to.be.equal(ASSET_TYPE.ERC20);
      
      // Remove WBTC from _indexToAsset
      let tx = await coverageDataProvider.connect(governor).removeAsset(WBTC);
      await expect(tx).emit(coverageDataProvider, "AssetRemoved").withArgs(WBTC);
      expect(await coverageDataProvider.connect(user).numOfAssets()).to.be.equal(6);

      // Check that current index 6 is now the previous index 7 (USDT)
      lastIndexAsset = await coverageDataProvider.connect(user).assetAt(6);
      expect(lastIndexAsset.asset_).to.be.equal(USDT);
      expect(lastIndexAsset.assetType_).to.be.equal(ASSET_TYPE.ERC20);

      // Restore state of _indexToAsset mapping to before unit test started
      await coverageDataProvider.connect(governor).removeAsset(USDT);
      await coverageDataProvider.connect(governor).addAsset(WBTC, ASSET_TYPE.ERC20);
      await coverageDataProvider.connect(governor).addAsset(USDT, ASSET_TYPE.ERC20);
      expect(await coverageDataProvider.connect(user).numOfAssets()).to.be.equal(7);

      removedAsset = await coverageDataProvider.connect(user).assetAt(6);
      expect(removedAsset.asset_).to.be.equal(WBTC);
      expect(removedAsset.assetType_).to.be.equal(ASSET_TYPE.ERC20);

      lastIndexAsset = await coverageDataProvider.connect(user).assetAt(7);
      expect(lastIndexAsset.asset_).to.be.equal(USDT);
      expect(lastIndexAsset.assetType_).to.be.equal(ASSET_TYPE.ERC20);
    })
  });

  describe("setAssets", function() {
    let coverageDataProvider2: CoverageDataProvider;

    before(async function() {
      coverageDataProvider2 = await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry.address, AAVE_PRICE_ORACLE, SOLACE_USDC_POOL]) as CoverageDataProvider;
      expect(await coverageDataProvider2.connect(governor).registry()).to.be.equal(registry.address);
      expect(await coverageDataProvider2.connect(governor).numOfAssets()).to.be.equal(7);
    });

    it("should revert for the non-governance", async function() {
      await expect(coverageDataProvider2.connect(user).setAssets([asset1.address, asset2.address], [ASSET_TYPE.ERC20, ASSET_TYPE.ERC20])).to.be.revertedWith("!governance");
    });

    it("should revert for invalid asset param length", async function() {
      await expect(coverageDataProvider2.connect(governor).setAssets([asset1.address], [ASSET_TYPE.ERC20, ASSET_TYPE.ERC20])).to.be.revertedWith("length mismatch");
    });

    it("should revert for invalid asset type param length", async function() {
      await expect(coverageDataProvider2.connect(governor).setAssets([asset1.address, asset2.address], [ASSET_TYPE.ERC20])).to.be.revertedWith("length mismatch");
    });

    it("should revert for zero asset address", async function() {
      await expect(coverageDataProvider2.connect(governor).setAssets([ZERO_ADDRESS, ZERO_ADDRESS], [ASSET_TYPE.ERC20, ASSET_TYPE.ERC20])).to.be.revertedWith("zero address asset");
    });

    it("should revert for invalid asset type", async function() {
      await expect(coverageDataProvider2.connect(governor).setAssets([asset1.address, asset2.address], [1000, 1000])).to.be.reverted;
    });

    it("should set assets", async function() {
      let tx = await coverageDataProvider2.connect(governor).setAssets([asset1.address, asset2.address], [ASSET_TYPE.ERC20, ASSET_TYPE.ERC20]);
      await expect(tx).emit(coverageDataProvider2, "AssetRemoved").withArgs(DAI);
      await expect(tx).emit(coverageDataProvider2, "AssetAdded").withArgs(asset1.address);
      expect(await coverageDataProvider2.connect(user).numOfAssets()).to.be.equal(2);

      let asset = await coverageDataProvider2.connect(user).assetAt(1);
      expect(asset.asset_).to.be.equal(asset1.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);

      asset = await coverageDataProvider2.connect(user).assetAt(2);
      expect(asset.asset_).to.be.equal(asset2.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);
    });

    it("should not set duplicate assets", async function() {
      let tx = await coverageDataProvider2.connect(governor).setAssets([asset3.address, asset3.address], [ASSET_TYPE.ERC20, ASSET_TYPE.ERC20]);
      await expect(tx).emit(coverageDataProvider2, "AssetRemoved").withArgs(asset1.address);
      await expect(tx).emit(coverageDataProvider2, "AssetAdded").withArgs(asset3.address);
      expect(await coverageDataProvider2.connect(user).numOfAssets()).to.be.equal(1);

      let asset = await coverageDataProvider2.connect(user).assetAt(1);
      expect(asset.asset_).to.be.equal(asset3.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);

      asset = await coverageDataProvider2.connect(user).assetAt(2);
      expect(asset.asset_).to.be.equal(ZERO_ADDRESS);
    });
  });

  describe("getSolacePriceInETH", function() {
    let mockPriceOracle: MockPriceOracle;

    before(async function() {
      mockPriceOracle = (await deployContract(deployer, artifacts.MockPriceOracle)) as MockPriceOracle;
      await mockPriceOracle.deployed();
      await coverageDataProvider.connect(governor).setSolaceUsdcPool(solaceUsdcPool.address);
      await coverageDataProvider.connect(governor).setPriceOracle(mockPriceOracle.address);

      expect(await coverageDataProvider.connect(user).solaceUsdcPool()).to.be.equal(solaceUsdcPool.address);
      expect(await coverageDataProvider.connect(user).priceOracle()).to.be.equal(mockPriceOracle.address);
    });

    after(async function() {
      await coverageDataProvider.connect(governor).setSolaceUsdcPool(SOLACE_USDC_POOL);
      await coverageDataProvider.connect(governor).setPriceOracle(AAVE_PRICE_ORACLE);

      expect(await coverageDataProvider.connect(user).solaceUsdcPool()).to.be.equal(SOLACE_USDC_POOL);
      expect(await coverageDataProvider.connect(user).priceOracle()).to.be.equal(AAVE_PRICE_ORACLE);
    });

    it("should get price", async function() {
      let usdcPriceInETH = BN.from(await mockPriceOracle.getAssetPrice(USDC));
      let solacePriceInETH = RESERVE1.div(RESERVE0).mul(usdcPriceInETH);
      expect(await coverageDataProvider.connect(user).getSolacePriceInETH()).to.be.equal(solacePriceInETH);
    });
  });

  describe("getPoolAmount", function() {
    let mockPriceOracle: MockPriceOracle;
    let asset;
    let underwritingPoolAmount: BN = BN.from(0);

    before(async function() {
      // set underwriting pool
      expect(await coverageDataProvider.connect(user).numOfPools()).to.be.equal(2);
      expect(await coverageDataProvider.connect(user).poolAt(1)).to.be.equal(underwritingPool.address);
      expect(await coverageDataProvider.connect(user).poolAt(2)).to.be.equal(underwritingPool2.address);

      // set oracles
      mockPriceOracle = (await deployContract(deployer, artifacts.MockPriceOracle)) as MockPriceOracle;
      await mockPriceOracle.deployed();
      await coverageDataProvider.connect(governor).setSolaceUsdcPool(solaceUsdcPool.address);
      await coverageDataProvider.connect(governor).setPriceOracle(mockPriceOracle.address);
      await coverageDataProvider.connect(governor).setSolace(solace.address);
      expect(await coverageDataProvider.connect(user).solaceUsdcPool()).to.be.equal(solaceUsdcPool.address);
      expect(await coverageDataProvider.connect(user).priceOracle()).to.be.equal(mockPriceOracle.address);
      expect(await coverageDataProvider.connect(user).solace()).to.be.equal(solace.address);

      // transfer funds to underwriting pool
      await solace.connect(governor).addMinter(governor.address);
      await solace.connect(governor).mint(underwritingPool.address, ONE_SOLACE);
      const solaceBalance = await solace.balanceOf(underwritingPool.address);
      expect(solaceBalance).to.be.equal(ONE_SOLACE);
      const solacePriceInETH = await coverageDataProvider.getSolacePriceInETH();
      underwritingPoolAmount = underwritingPoolAmount.add(solaceBalance.mul(solacePriceInETH));

      await dai.connect(deployer).transfer(underwritingPool.address, ONE_DAI);
      expect(await dai.balanceOf(underwritingPool.address)).to.be.equal(ONE_DAI);
      const daiPriceInETH = await mockPriceOracle.getAssetPrice(dai.address);
      underwritingPoolAmount = underwritingPoolAmount.add(ONE_DAI.mul(daiPriceInETH));

      await weth.connect(deployer).transfer(underwritingPool.address, ONE_WETH);
      expect(await weth.balanceOf(underwritingPool.address)).to.be.equal(ONE_WETH);
      underwritingPoolAmount = underwritingPoolAmount.add(ONE_ETH);

      await wbtc.connect(deployer).transfer(underwritingPool.address, ONE_WBTC);
      expect(await wbtc.balanceOf(underwritingPool.address)).to.be.equal(ONE_WBTC);
      const wbtcPriceInETH = await mockPriceOracle.getAssetPrice(wbtc.address);
      underwritingPoolAmount = underwritingPoolAmount.add(ONE_WBTC.mul(wbtcPriceInETH));

      await usdt.connect(deployer).transfer(underwritingPool.address, ONE_USDT);
      expect(await usdt.balanceOf(underwritingPool.address)).to.be.equal(ONE_USDT);
      const usdtPriceInETH = await mockPriceOracle.getAssetPrice(usdt.address);
      underwritingPoolAmount = underwritingPoolAmount.add(ONE_USDT.mul(usdtPriceInETH));

      await usdc.connect(deployer).transfer(underwritingPool.address, ONE_USDC);
      expect(await usdc.balanceOf(underwritingPool.address)).to.be.equal(ONE_USDC);
      const usdcPriceInETH = await mockPriceOracle.getAssetPrice(usdc.address);
      underwritingPoolAmount = underwritingPoolAmount.add(ONE_USDC.mul(usdcPriceInETH));

      await solaceUsdcPool.connect(deployer).transfer(underwritingPool.address, ONE_SLP);
      expect(await solaceUsdcPool.balanceOf(underwritingPool.address)).to.be.equal(ONE_SLP);
      const solaceAmount = RESERVE0.mul(solacePriceInETH);
      const usdcAmount = RESERVE1.mul(usdcPriceInETH).div(await usdc.decimals());
      underwritingPoolAmount = underwritingPoolAmount.add(solaceAmount.add(usdcAmount).mul(ONE_SLP).div(await solaceUsdcPool.totalSupply()));

      // add underwriting pool eth balance
      underwritingPoolAmount = underwritingPoolAmount.add(await underwritingPool.getBalance());

      // set mock assets
      await coverageDataProvider.connect(governor).setAssets([
         solace.address, 
         dai.address,
         weth.address,
         wbtc.address,
         usdt.address,
         usdc.address,
         solaceUsdcPool.address
        ], 
        [ASSET_TYPE.SOLACE, ASSET_TYPE.ERC20, ASSET_TYPE.WETH, ASSET_TYPE.ERC20, ASSET_TYPE.ERC20, ASSET_TYPE.ERC20, ASSET_TYPE.SOLACE_SLP]
      );
      expect(await coverageDataProvider.connect(user).numOfAssets()).to.be.equal(7);

      asset = await coverageDataProvider.connect(user).assetAt(1);
      expect(asset.asset_).to.be.equal(solace.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.SOLACE);

      asset = await coverageDataProvider.connect(user).assetAt(2);
      expect(asset.asset_).to.be.equal(dai.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);

      asset = await coverageDataProvider.connect(user).assetAt(3);
      expect(asset.asset_).to.be.equal(weth.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.WETH);

      asset = await coverageDataProvider.connect(user).assetAt(4);
      expect(asset.asset_).to.be.equal(wbtc.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);

      asset = await coverageDataProvider.connect(user).assetAt(5);
      expect(asset.asset_).to.be.equal(usdt.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);

      asset = await coverageDataProvider.connect(user).assetAt(6);
      expect(asset.asset_).to.be.equal(usdc.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.ERC20);

      asset = await coverageDataProvider.connect(user).assetAt(7);
      expect(asset.asset_).to.be.equal(solaceUsdcPool.address);
      expect(asset.assetType_).to.be.equal(ASSET_TYPE.SOLACE_SLP);

    });

    it("should return 0 for invalid underwriting pool", async function() {
      expect(await coverageDataProvider.connect(user).getPoolAmount(user.address)).to.be.equal(0);
    });

    it("should return 0 if underwriting pool is disabled", async function() {
      expect(await coverageDataProvider.connect(governor).setPoolStatus(underwritingPool2.address, false));
      expect(await coverageDataProvider.connect(governor).poolStatus(underwritingPool2.address)).to.be.false;
      expect(await coverageDataProvider.connect(user).getPoolAmount(underwritingPool2.address)).to.be.equal(0);
    });

    it("should get underwriting pool amount", async function() {
      expect(await coverageDataProvider.connect(user).getPoolAmount(underwritingPool.address)).to.be.equal(underwritingPoolAmount);
      expect(await coverageDataProvider.connect(user).maxCover()).eq(underwritingPoolAmount) // No assets in vault, and getPoolAmount(underwritingPool2.address) = 0
    });
  });

});
