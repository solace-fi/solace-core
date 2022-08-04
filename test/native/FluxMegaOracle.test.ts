import chai from "chai";
import { ethers, waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, Wallet } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { FluxMegaOracle, MockFluxPriceFeed, MockErc20, MockErc20Decimals } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ONE_USDC = BN.from("1000000");
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_NEAR = BN.from("1000000000000000000000000");
const EIGHT_DECIMALS = BN.from("100000000");

describe("FluxMegaOracle", function () {
  let oracle: FluxMegaOracle;
  let dai: MockErc20;
  let usdc: MockErc20;
  let weth: MockErc20;
  let near: MockErc20;
  let daiPriceFeed: MockFluxPriceFeed;
  let ethPriceFeed1: MockFluxPriceFeed;
  let ethPriceFeed2: MockFluxPriceFeed;
  let nearPriceFeed: MockFluxPriceFeed;
  let usdcPriceFeed: MockFluxPriceFeed;

  const [deployer, governor, user] = provider.getWallets();
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

    // deploy price feeds
    daiPriceFeed = (await deployContract(deployer, artifacts.MockFluxPriceFeed, [governor.address])) as MockFluxPriceFeed;
    await daiPriceFeed.connect(governor).setAnswer(EIGHT_DECIMALS.mul(1));
    usdcPriceFeed = (await deployContract(deployer, artifacts.MockFluxPriceFeed, [governor.address])) as MockFluxPriceFeed;
    await usdcPriceFeed.connect(governor).setAnswer(EIGHT_DECIMALS.mul(1));
    ethPriceFeed1 = (await deployContract(deployer, artifacts.MockFluxPriceFeed, [governor.address])) as MockFluxPriceFeed;
    await ethPriceFeed1.connect(governor).setAnswer(EIGHT_DECIMALS.mul(1300));
    ethPriceFeed2 = (await deployContract(deployer, artifacts.MockFluxPriceFeed, [governor.address])) as MockFluxPriceFeed;
    await ethPriceFeed2.connect(governor).setAnswer(EIGHT_DECIMALS.mul(1400));
    nearPriceFeed = (await deployContract(deployer, artifacts.MockFluxPriceFeed, [governor.address])) as MockFluxPriceFeed;
    await nearPriceFeed.connect(governor).setAnswer(EIGHT_DECIMALS.mul(4));
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("reverts if zero governance", async function () {
      await expect(deployContract(deployer, artifacts.FluxMegaOracle, [ZERO_ADDRESS])).to.be.revertedWith("zero address governance");
    });
    it("deploys", async function () {
      oracle = (await deployContract(deployer, artifacts.FluxMegaOracle, [governor.address])) as FluxMegaOracle;
      await expectDeployed(oracle.address);
    });
  });

  describe("setting feeds", function () {
    it("non governance cannot add feeds", async function () {
      await expect(oracle.connect(user).addPriceFeeds([])).to.be.revertedWith("!governance");
    });
    it("governance can add feeds", async function () {
      let tx1 = await oracle.connect(governor).addPriceFeeds([
        { token: dai.address, oracle: daiPriceFeed.address, tokenDecimals: 18, oracleDecimals: 8 },
        { token: weth.address, oracle: ethPriceFeed1.address, tokenDecimals: 18, oracleDecimals: 8 },
      ]);
      await expect(tx1).to.emit(oracle, "PriceFeedAdded").withArgs(dai.address);
      await expect(tx1).to.emit(oracle, "PriceFeedAdded").withArgs(weth.address);
      let data1 = await oracle.priceFeedForToken(dai.address);
      expect(data1.token).eq(dai.address);
      expect(data1.oracle).eq(daiPriceFeed.address);
      expect(data1.tokenDecimals).eq(18);
      expect(data1.oracleDecimals).eq(8);
      let data2 = await oracle.priceFeedForToken(weth.address);
      expect(data2.token).eq(weth.address);
      expect(data2.oracle).eq(ethPriceFeed1.address);
      expect(data2.tokenDecimals).eq(18);
      expect(data2.oracleDecimals).eq(8);

      let tx2 = await oracle.connect(governor).addPriceFeeds([
        { token: weth.address, oracle: ethPriceFeed2.address, tokenDecimals: 18, oracleDecimals: 8 },
        { token: near.address, oracle: nearPriceFeed.address, tokenDecimals: 24, oracleDecimals: 8 },
      ]);
      await expect(tx2).to.emit(oracle, "PriceFeedAdded").withArgs(weth.address);
      await expect(tx2).to.emit(oracle, "PriceFeedAdded").withArgs(near.address);
      let data3 = await oracle.priceFeedForToken(weth.address);
      expect(data3.token).eq(weth.address);
      expect(data3.oracle).eq(ethPriceFeed2.address);
      expect(data3.tokenDecimals).eq(18);
      expect(data3.oracleDecimals).eq(8);
      let data4 = await oracle.priceFeedForToken(near.address);
      expect(data4.token).eq(near.address);
      expect(data4.oracle).eq(nearPriceFeed.address);
      expect(data4.tokenDecimals).eq(24);
      expect(data4.oracleDecimals).eq(8);
    });
    it("non governance cannot remove feeds", async function () {
      await expect(oracle.connect(user).removePriceFeeds([])).to.be.revertedWith("!governance");
    });
    it("governance can remove feeds", async function () {
      let tx = await oracle.connect(governor).removePriceFeeds([dai.address, near.address]);
      await expect(tx).to.emit(oracle, "PriceFeedRemoved").withArgs(dai.address);
      await expect(tx).to.emit(oracle, "PriceFeedRemoved").withArgs(near.address);
      let data1 = await oracle.priceFeedForToken(dai.address);
      expect(data1.token).eq(ZERO_ADDRESS);
      expect(data1.oracle).eq(ZERO_ADDRESS);
      expect(data1.tokenDecimals).eq(0);
      expect(data1.oracleDecimals).eq(0);
      let data2 = await oracle.priceFeedForToken(near.address);
      expect(data2.token).eq(ZERO_ADDRESS);
      expect(data2.oracle).eq(ZERO_ADDRESS);
      expect(data2.tokenDecimals).eq(0);
      expect(data2.oracleDecimals).eq(0);
    });
  });

  describe("valueOfTokens", function () {
    it("zero value if token unknown", async function () {
      expect(await oracle.valueOfTokens(dai.address, ONE_ETHER)).eq(0);
    });
    it("fetches value", async function () {
      await oracle.connect(governor).addPriceFeeds([
        { token: dai.address, oracle: daiPriceFeed.address, tokenDecimals: 18, oracleDecimals: 8 },
        { token: near.address, oracle: nearPriceFeed.address, tokenDecimals: 24, oracleDecimals: 8 },
        { token: usdc.address, oracle: usdcPriceFeed.address, tokenDecimals: 6, oracleDecimals: 8 },
      ]);
      expect(await oracle.valueOfTokens(dai.address, ONE_ETHER)).eq(ONE_ETHER);
      expect(await oracle.valueOfTokens(usdc.address, ONE_USDC.mul(123))).eq(ONE_ETHER.mul(123));
      expect(await oracle.valueOfTokens(weth.address, ONE_ETHER.mul(123))).eq(ONE_ETHER.mul(123).mul(1400));
      expect(await oracle.valueOfTokens(near.address, ONE_NEAR.mul(12345678))).eq(ONE_ETHER.mul(12345678).mul(4));
      await oracle.connect(governor).addPriceFeeds([
        { token: weth.address, oracle: ethPriceFeed1.address, tokenDecimals: 18, oracleDecimals: 8 },
      ]);
      expect(await oracle.valueOfTokens(weth.address, ONE_ETHER.mul(123))).eq(ONE_ETHER.mul(123).mul(1300));
    });
    it("reverts if price feed is wrong address", async function () {
      await oracle.connect(governor).addPriceFeeds([
        { token: dai.address, oracle: dai.address, tokenDecimals: 18, oracleDecimals: 8 },
      ]);
      await expect(oracle.valueOfTokens(dai.address, ONE_ETHER)).to.be.reverted;
    });
    it("reverts if price feed is negative", async function () {
      await ethPriceFeed1.connect(governor).setAnswer(ONE_ETHER.mul(-1300));
      await expect(oracle.valueOfTokens(weth.address, ONE_ETHER)).to.be.revertedWith("negative price");
    });
    // TODO: integration testing
    // using FORK_NETWORK=aurora seems to make tests stall out
    /*
    it("integrates with existing feeds", async function () {
      let forkNetwork = process.env.FORK_NETWORK || "";
      if(forkNetwork != "aurora") {
        console.log("set `FORK_NETWORK=aurora` in .env to continue this test");
        expect("FORK_NETWORK").eq("aurora");
      }
      daiPriceFeed = (await ethers.getContractAt(artifacts.MockFluxPriceFeed.abi, "0x18aFC38b25229B797E2af47b5056A5f98249Ef12")) as MockFluxPriceFeed;
      ethPriceFeed2 = (await ethers.getContractAt(artifacts.MockFluxPriceFeed.abi, "0xA8Ac2Fa1D239c7d96046967ED21503D1F1fB2354")) as MockFluxPriceFeed;
      nearPriceFeed = (await ethers.getContractAt(artifacts.MockFluxPriceFeed.abi, "0x0a9A9cF9bDe10c861Fc1e45aCe4ea097eaa268eD")) as MockFluxPriceFeed;
      await oracle.connect(governor).addPriceFeeds([
        { token: dai.address, oracle: daiPriceFeed.address, tokenDecimals: 18, oracleDecimals: 8 },
        { token: weth.address, oracle: ethPriceFeed2.address, tokenDecimals: 18, oracleDecimals: 8 },
        { token: near.address, oracle: nearPriceFeed.address, tokenDecimals: 24, oracleDecimals: 8 },
      ]);
      let answer1 = await daiPriceFeed.latestAnswer();
      let amt1 = ONE_ETHER.mul(123);
      let expectedAnswer1 = answer1.mul(123).mul(10**10);
      expect(await oracle.valueOfTokens(dai.address, amt1)).eq(expectedAnswer1);
      let answer2 = await ethPriceFeed2.latestAnswer();
      let amt2 = ONE_ETHER.mul(123);
      let expectedAnswer2 = answer2.mul(123).mul(10**10);
      expect(await oracle.valueOfTokens(weth.address, amt2)).eq(expectedAnswer2);
    });
    */
  });
});
