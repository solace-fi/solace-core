import chai from "chai";
import { ethers, waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, Wallet } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { SolaceMegaOracle, MockErc20, MockErc20Decimals } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ONE_USDC = BN.from("1000000");
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_NEAR = BN.from("1000000000000000000000000");
const EIGHT_DECIMALS = BN.from("100000000");

describe("SolaceMegaOracle", function () {
  let oracle: SolaceMegaOracle;
  let dai: MockErc20;
  let usdc: MockErc20;
  let weth: MockErc20;
  let near: MockErc20;
  let wbtc: MockErc20;

  const [deployer, governor, user, updater1, updater2] = provider.getWallets();
  let artifacts: ArtifactImports;
  let snapshot: BN;

  before(async function () {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy tokens
    dai = (await deployContract(deployer, artifacts.MockERC20, ["Dai Stablecoin", "DAI", 0])) as MockErc20;
    weth = (await deployContract(deployer, artifacts.MockERC20, ["Wrapped Ether", "WETH", 0])) as MockErc20;
    near = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Near", "NEAR", 0, 24])) as MockErc20Decimals;
    usdc = (await deployContract(deployer, artifacts.MockERC20Decimals, ["USD Coin", "USDC", 0, 24])) as MockErc20Decimals;
    wbtc = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Wrapped Bitcoin", "WBTC", 0, 8])) as MockErc20Decimals;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("reverts if zero governance", async function () {
      await expect(deployContract(deployer, artifacts.SolaceMegaOracle, [ZERO_ADDRESS])).to.be.revertedWith("zero address governance");
    });
    it("deploys", async function () {
      oracle = (await deployContract(deployer, artifacts.SolaceMegaOracle, [governor.address])) as SolaceMegaOracle;
      await expectDeployed(oracle.address);
    });
  });

  describe("updaters", function () {
    it("non governance cannot set updaters", async function () {
      await expect(oracle.connect(user).setUpdaterStatuses([],[])).to.be.revertedWith("!governance");
    });
    it("reverts length mismatch", async function () {
      await expect(oracle.connect(governor).setUpdaterStatuses([],[true])).to.be.revertedWith("length mismatch");
    });
    it("governance can set updaters", async function () {
      let tx = await oracle.connect(governor).setUpdaterStatuses([updater1.address, updater2.address], [true, false]);
      await expect(tx).to.emit(oracle, "UpdaterSet").withArgs(updater1.address, true);
      await expect(tx).to.emit(oracle, "UpdaterSet").withArgs(updater2.address, false);
      expect(await oracle.isUpdater(updater1.address)).eq(true);
      expect(await oracle.isUpdater(updater2.address)).eq(false);
    });
  });

  describe("setting feeds", function () {
    it("starts with no feeds", async function () {
      expect(await oracle.tokensLength()).eq(0);
      await expect(oracle.tokenByIndex(0)).to.be.revertedWith("index out of bounds");
    });
    it("non updater cannot add feeds", async function () {
      await expect(oracle.connect(user).addPriceFeeds([])).to.be.revertedWith("!updater");
    });
    it("updater can add feeds", async function () {
      // first feeds
      let tx1 = await oracle.connect(updater1).addPriceFeeds([
        { token: dai.address, latestPrice: ONE_ETHER.mul(1), tokenDecimals: 18, priceFeedDecimals: 18 },
        { token: weth.address, latestPrice: EIGHT_DECIMALS.mul(1300), tokenDecimals: 18, priceFeedDecimals: 8 },
      ]);
      await expect(tx1).to.emit(oracle, "PriceFeedAdded").withArgs(dai.address);
      await expect(tx1).to.emit(oracle, "PriceFeedAdded").withArgs(weth.address);
      let data1 = await oracle.priceFeedForToken(dai.address);
      expect(data1.token).eq(dai.address);
      expect(data1.latestPrice).eq(ONE_ETHER.mul(1));
      expect(data1.tokenDecimals).eq(18);
      expect(data1.priceFeedDecimals).eq(18);
      let data2 = await oracle.priceFeedForToken(weth.address);
      expect(data2.token).eq(weth.address);
      expect(data2.latestPrice).eq(EIGHT_DECIMALS.mul(1300));
      expect(data2.tokenDecimals).eq(18);
      expect(data2.priceFeedDecimals).eq(8);
      expect(await oracle.tokensLength()).eq(2);
      expect(await oracle.tokenByIndex(0)).eq(dai.address);
      expect(await oracle.tokenByIndex(1)).eq(weth.address);
      await expect(oracle.tokenByIndex(2)).to.be.revertedWith("index out of bounds");

      // more feeds
      let tx2 = await oracle.connect(updater1).addPriceFeeds([
        { token: weth.address, latestPrice: EIGHT_DECIMALS.mul(1400), tokenDecimals: 18, priceFeedDecimals: 8 },
        { token: near.address, latestPrice: ONE_ETHER.mul(4), tokenDecimals: 24, priceFeedDecimals: 18 },
      ]);
      await expect(tx2).to.emit(oracle, "PriceFeedAdded").withArgs(weth.address);
      await expect(tx2).to.emit(oracle, "PriceFeedAdded").withArgs(near.address);
      let data3 = await oracle.priceFeedForToken(weth.address);
      expect(data3.token).eq(weth.address);
      expect(data3.latestPrice).eq(EIGHT_DECIMALS.mul(1400));
      expect(data3.tokenDecimals).eq(18);
      expect(data3.priceFeedDecimals).eq(8);
      let data4 = await oracle.priceFeedForToken(near.address);
      expect(data4.token).eq(near.address);
      expect(data4.latestPrice).eq(ONE_ETHER.mul(4));
      expect(data4.tokenDecimals).eq(24);
      expect(data4.priceFeedDecimals).eq(18);
      expect(await oracle.tokensLength()).eq(3);
      expect(await oracle.tokenByIndex(0)).eq(dai.address);
      expect(await oracle.tokenByIndex(1)).eq(weth.address);
      expect(await oracle.tokenByIndex(2)).eq(near.address);
      await expect(oracle.tokenByIndex(3)).to.be.revertedWith("index out of bounds");

      // no new feeds
      let tx3 = await oracle.connect(updater1).addPriceFeeds([
        { token: dai.address, latestPrice: EIGHT_DECIMALS.mul(1), tokenDecimals: 18, priceFeedDecimals: 8 },
      ]);
      await expect(tx3).to.emit(oracle, "PriceFeedAdded").withArgs(dai.address);
      data1 = await oracle.priceFeedForToken(dai.address);
      expect(data1.token).eq(dai.address);
      expect(data1.latestPrice).eq(EIGHT_DECIMALS.mul(1));
      expect(data1.tokenDecimals).eq(18);
      expect(data1.priceFeedDecimals).eq(8);
      expect(await oracle.tokensLength()).eq(3);
      expect(await oracle.tokenByIndex(0)).eq(dai.address);
      expect(await oracle.tokenByIndex(1)).eq(weth.address);
      expect(await oracle.tokenByIndex(2)).eq(near.address);
      await expect(oracle.tokenByIndex(3)).to.be.revertedWith("index out of bounds");
    });
  });

  describe("valueOfTokens", function () {
    it("zero value if token unknown", async function () {
      expect(await oracle.valueOfTokens(usdc.address, ONE_USDC)).eq(0);
    });
    it("fetches value", async function () {
      await oracle.connect(updater1).addPriceFeeds([
        { token: dai.address, latestPrice: ONE_ETHER.mul(1), tokenDecimals: 18, priceFeedDecimals: 18 },
        { token: near.address, latestPrice: ONE_ETHER.mul(4), tokenDecimals: 24, priceFeedDecimals: 18 },
        { token: usdc.address, latestPrice: EIGHT_DECIMALS.mul(1), tokenDecimals: 6, priceFeedDecimals: 8 },
      ]);
      expect(await oracle.tokensLength()).eq(4);
      expect(await oracle.tokenByIndex(0)).eq(dai.address);
      expect(await oracle.tokenByIndex(1)).eq(weth.address);
      expect(await oracle.tokenByIndex(2)).eq(near.address);
      expect(await oracle.tokenByIndex(3)).eq(usdc.address);
      await expect(oracle.tokenByIndex(4)).to.be.revertedWith("index out of bounds");
      expect(await oracle.valueOfTokens(dai.address, ONE_ETHER)).eq(ONE_ETHER);
      expect(await oracle.valueOfTokens(usdc.address, ONE_USDC.mul(123))).eq(ONE_ETHER.mul(123));
      expect(await oracle.valueOfTokens(weth.address, ONE_ETHER.mul(123))).eq(ONE_ETHER.mul(123).mul(1400));
      expect(await oracle.valueOfTokens(near.address, ONE_NEAR.mul(12345678))).eq(ONE_ETHER.mul(12345678).mul(4));
    });
  });

  describe("transmit", function () {
    it("non updater cannot transmit", async function () {
      await expect(oracle.connect(user).transmit([],[])).to.be.revertedWith("!updater");
    });
    it("reverts length mismatch", async function () {
      await expect(oracle.connect(updater1).transmit([],[1])).to.be.revertedWith("length mismatch");
    });
    it("updater can transmit", async function () {
      let tx = await oracle.connect(updater1).transmit([weth.address, near.address], [EIGHT_DECIMALS.mul(1500), ONE_ETHER.mul(5)]);
      await expect(tx).to.emit(oracle, "PriceTransmitted").withArgs(weth.address, EIGHT_DECIMALS.mul(1500));
      await expect(tx).to.emit(oracle, "PriceTransmitted").withArgs(near.address, ONE_ETHER.mul(5));
      let data3 = await oracle.priceFeedForToken(weth.address);
      expect(data3.token).eq(weth.address);
      expect(data3.latestPrice).eq(EIGHT_DECIMALS.mul(1500));
      expect(data3.tokenDecimals).eq(18);
      expect(data3.priceFeedDecimals).eq(8);
      let data4 = await oracle.priceFeedForToken(near.address);
      expect(data4.token).eq(near.address);
      expect(data4.latestPrice).eq(ONE_ETHER.mul(5));
      expect(data4.tokenDecimals).eq(24);
      expect(data4.priceFeedDecimals).eq(18);
      expect(await oracle.tokensLength()).eq(4);
      expect(await oracle.tokenByIndex(0)).eq(dai.address);
      expect(await oracle.tokenByIndex(1)).eq(weth.address);
      expect(await oracle.tokenByIndex(2)).eq(near.address);
      expect(await oracle.tokenByIndex(3)).eq(usdc.address);
      await expect(oracle.tokenByIndex(4)).to.be.revertedWith("index out of bounds");
    });
    it("updates valueOfTokens", async function () {
      expect(await oracle.valueOfTokens(weth.address, ONE_ETHER.mul(123))).eq(ONE_ETHER.mul(123).mul(1500));
      expect(await oracle.valueOfTokens(near.address, ONE_NEAR.mul(12345678))).eq(ONE_ETHER.mul(12345678).mul(5));
    });
    it("edge case - transmit before addPriceFeed", async function () {
      // zero decimals
      await oracle.connect(updater1).transmit([wbtc.address], [20000]);
      let data4 = await oracle.priceFeedForToken(wbtc.address);
      expect(data4.token).eq(ZERO_ADDRESS);
      expect(data4.latestPrice).eq(20000);
      expect(data4.tokenDecimals).eq(0);
      expect(data4.priceFeedDecimals).eq(0);
      expect(await oracle.tokensLength()).eq(4);
      expect(await oracle.tokenByIndex(0)).eq(dai.address);
      expect(await oracle.tokenByIndex(1)).eq(weth.address);
      expect(await oracle.tokenByIndex(2)).eq(near.address);
      expect(await oracle.tokenByIndex(3)).eq(usdc.address);
      await expect(oracle.tokenByIndex(4)).to.be.revertedWith("index out of bounds");
      expect(await oracle.valueOfTokens(wbtc.address, 100)).eq(ONE_ETHER.mul(20000).mul(100));

      // crazy decimals
      await oracle.connect(updater1).transmit([wbtc.address], [ONE_ETHER.mul(20000)]);
      expect(await oracle.valueOfTokens(wbtc.address, EIGHT_DECIMALS.mul(100))).eq(ONE_ETHER.mul(20000).mul(100).mul(ONE_ETHER).mul(EIGHT_DECIMALS));
    });
  });
});
