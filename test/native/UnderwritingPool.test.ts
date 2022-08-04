import chai from "chai";
import { ethers, waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, Wallet } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { UnderwritingPool, FluxMegaOracle, MockFluxPriceFeed, MockErc20, MockErc20Decimals } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

const name = "Solace Native Underwriting Pool";
const symbol = "UWP";
const decimals = 18;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ONE_USDC = BN.from("1000000");
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_NEAR = BN.from("1000000000000000000000000");
const EIGHT_DECIMALS = BN.from("100000000");

describe("FluxMegaOracle", function () {
  let uwp: UnderwritingPool;
  let oracle: FluxMegaOracle;
  let dai: MockErc20;
  let usdc: MockErc20;
  let weth: MockErc20;
  let near: MockErc20;
  let uni: MockErc20;
  let comp: MockErc20;
  let daiPriceFeed: MockFluxPriceFeed;
  let ethPriceFeed: MockFluxPriceFeed;
  let nearPriceFeed: MockFluxPriceFeed;
  let usdcPriceFeed: MockFluxPriceFeed;

  const [deployer, governor, user1, user2, user3] = provider.getWallets();
  let artifacts: ArtifactImports;
  let snapshot: BN;

  before(async function () {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy tokens
    dai = (await deployContract(deployer, artifacts.MockERC20, ["Dai Stablecoin", "DAI", ONE_ETHER.mul(1000000)])) as MockErc20;
    weth = (await deployContract(deployer, artifacts.MockERC20, ["Wrapped Ether", "WETH", ONE_ETHER.mul(1000000)])) as MockErc20;
    near = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Near", "NEAR", ONE_NEAR.mul(1000000), 24])) as MockErc20Decimals;
    usdc = (await deployContract(deployer, artifacts.MockERC20Decimals, ["USD Coin", "USDC", ONE_USDC.mul(1000000), 24])) as MockErc20Decimals;
    uni = (await deployContract(deployer, artifacts.MockERC20, ["Uniswap", "UNI", ONE_ETHER.mul(1000000)])) as MockErc20;
    comp = (await deployContract(deployer, artifacts.MockERC20, ["Compound", "COMP", ONE_ETHER.mul(1000000)])) as MockErc20;

    // deploy price feeds
    daiPriceFeed = (await deployContract(deployer, artifacts.MockFluxPriceFeed, [governor.address])) as MockFluxPriceFeed;
    await daiPriceFeed.connect(governor).setAnswer(EIGHT_DECIMALS.mul(1));
    usdcPriceFeed = (await deployContract(deployer, artifacts.MockFluxPriceFeed, [governor.address])) as MockFluxPriceFeed;
    await usdcPriceFeed.connect(governor).setAnswer(EIGHT_DECIMALS.mul(1));
    ethPriceFeed = (await deployContract(deployer, artifacts.MockFluxPriceFeed, [governor.address])) as MockFluxPriceFeed;
    await ethPriceFeed.connect(governor).setAnswer(EIGHT_DECIMALS.mul(1300));
    nearPriceFeed = (await deployContract(deployer, artifacts.MockFluxPriceFeed, [governor.address])) as MockFluxPriceFeed;
    await nearPriceFeed.connect(governor).setAnswer(EIGHT_DECIMALS.mul(4));

    // deploy oracle
    oracle = (await deployContract(deployer, artifacts.FluxMegaOracle, [governor.address])) as FluxMegaOracle;
    await oracle.connect(governor).addPriceFeeds([
      { token: dai.address, oracle: daiPriceFeed.address, tokenDecimals: 18, oracleDecimals: 8 },
      { token: weth.address, oracle: ethPriceFeed.address, tokenDecimals: 18, oracleDecimals: 8 },
      { token: near.address, oracle: nearPriceFeed.address, tokenDecimals: 24, oracleDecimals: 8 },
      { token: usdc.address, oracle: usdcPriceFeed.address, tokenDecimals: 6, oracleDecimals: 8 },
    ]);
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("reverts if zero governance", async function () {
      await expect(deployContract(deployer, artifacts.UnderwritingPool, [ZERO_ADDRESS])).to.be.revertedWith("zero address governance");
    });
    it("deploys", async function () {
      uwp = (await deployContract(deployer, artifacts.UnderwritingPool, [governor.address])) as UnderwritingPool;
      await expectDeployed(uwp.address);
    });
    it("initializes correctly", async function () {
      expect(await uwp.name()).eq(name);
      expect(await uwp.symbol()).eq(symbol);
      expect(await uwp.decimals()).eq(decimals);
      expect(await uwp.issueFee()).eq(0);
      expect(await uwp.issueFeeTo()).eq(ZERO_ADDRESS);
      expect(await uwp.valueOfPool()).eq(0);
      expect(await uwp.valuePerShare()).eq(0);
    });
  });

  describe("setting tokens", function () {
    it("starts with no tokens", async function () {
      expect(await uwp.tokensLength()).eq(0);
      await expect(uwp.tokenList(0)).to.be.revertedWith("index out of bounds");
      let data1 = await uwp.tokenData(dai.address);
      expect(data1.token).eq(ZERO_ADDRESS);
      expect(data1.oracle).eq(ZERO_ADDRESS);
      expect(data1.min).eq(0);
      expect(data1.max).eq(0);
    });
    it("non governance cannot add tokens", async function () {
      await expect(uwp.connect(user1).addTokensToPool([])).to.be.revertedWith("!governance");
    });
    it("governance can add tokens", async function () {
      let tx1 = await uwp.connect(governor).addTokensToPool([
        { token: dai.address, oracle: oracle.address, min: 0, max: 1 },
        { token: weth.address, oracle: oracle.address, min: 2, max: 3 },
      ]);
      await expect(tx1).to.emit(uwp, "TokenAdded").withArgs(dai.address);
      await expect(tx1).to.emit(uwp, "TokenAdded").withArgs(weth.address);
      let data11 = await uwp.tokenData(dai.address);
      expect(data11.token).eq(dai.address);
      expect(data11.oracle).eq(oracle.address);
      expect(data11.min).eq(0);
      expect(data11.max).eq(1);
      let data12 = await uwp.tokenData(weth.address);
      expect(data12.token).eq(weth.address);
      expect(data12.oracle).eq(oracle.address);
      expect(data12.min).eq(2);
      expect(data12.max).eq(3);
      let data21 = await uwp.tokenList(0);
      expect(data21.token).eq(dai.address);
      expect(data21.oracle).eq(oracle.address);
      expect(data21.min).eq(0);
      expect(data21.max).eq(1);
      let data22 = await uwp.tokenList(1);
      expect(data22.token).eq(weth.address);
      expect(data22.oracle).eq(oracle.address);
      expect(data22.min).eq(2);
      expect(data22.max).eq(3);
      expect(await uwp.tokensLength()).eq(2);
      await expect(uwp.tokenList(2)).to.be.revertedWith("index out of bounds");

      let tx2 = await uwp.connect(governor).addTokensToPool([
        { token: weth.address, oracle: oracle.address, min: 4, max: 5 },
        { token: near.address, oracle: oracle.address, min: 6, max: 7 },
      ]);
      await expect(tx2).to.emit(uwp, "TokenAdded").withArgs(weth.address);
      await expect(tx2).to.emit(uwp, "TokenAdded").withArgs(near.address);
      let data13 = await uwp.tokenData(weth.address);
      expect(data13.token).eq(weth.address);
      expect(data13.oracle).eq(oracle.address);
      expect(data13.min).eq(4);
      expect(data13.max).eq(5);
      let data14 = await uwp.tokenData(near.address);
      expect(data14.token).eq(near.address);
      expect(data14.oracle).eq(oracle.address);
      expect(data14.min).eq(6);
      expect(data14.max).eq(7);
      let data23 = await uwp.tokenList(1);
      expect(data23.token).eq(weth.address);
      expect(data23.oracle).eq(oracle.address);
      expect(data23.min).eq(4);
      expect(data23.max).eq(5);
      let data24 = await uwp.tokenList(2);
      expect(data24.token).eq(near.address);
      expect(data24.oracle).eq(oracle.address);
      expect(data24.min).eq(6);
      expect(data24.max).eq(7);
      expect(await uwp.tokensLength()).eq(3);
      await expect(uwp.tokenList(3)).to.be.revertedWith("index out of bounds");

      expect(await uwp.valueOfPool()).eq(0);
      expect(await uwp.valuePerShare()).eq(0);
    });
    it("non governance cannot remove tokens", async function () {
      await expect(uwp.connect(user1).removeTokensFromPool([])).to.be.revertedWith("!governance");
    });
    it("governance can remove tokens", async function () {
      let tx = await uwp.connect(governor).removeTokensFromPool([near.address, dai.address, usdc.address]);
      await expect(tx).to.emit(uwp, "TokenRemoved").withArgs(dai.address);
      await expect(tx).to.emit(uwp, "TokenRemoved").withArgs(near.address);
      let data1 = await uwp.tokenData(dai.address);
      expect(data1.token).eq(ZERO_ADDRESS);
      expect(data1.oracle).eq(ZERO_ADDRESS);
      expect(data1.min).eq(0);
      expect(data1.max).eq(0);
      let data2 = await uwp.tokenData(near.address);
      expect(data2.token).eq(ZERO_ADDRESS);
      expect(data2.oracle).eq(ZERO_ADDRESS);
      expect(data2.min).eq(0);
      expect(data2.max).eq(0);
      let data3 = await uwp.tokenData(weth.address);
      expect(data3.token).eq(weth.address);
      expect(data3.oracle).eq(oracle.address);
      expect(data3.min).eq(4);
      expect(data3.max).eq(5);
      let data4 = await uwp.tokenList(0);
      expect(data4.token).eq(weth.address);
      expect(data4.oracle).eq(oracle.address);
      expect(data4.min).eq(4);
      expect(data4.max).eq(5);
      expect(await uwp.tokensLength()).eq(1);
      await expect(uwp.tokenList(1)).to.be.revertedWith("index out of bounds");

      expect(await uwp.valueOfPool()).eq(0);
      expect(await uwp.valuePerShare()).eq(0);
    });
  });

  describe("issueFee", function () {
    it("starts zero", async function () {
      expect(await uwp.issueFee()).eq(0);
      expect(await uwp.issueFeeTo()).eq(ZERO_ADDRESS);
    });
    it("cannot be set by non governance", async function () {
      await expect(uwp.connect(user1).setIssueFee(0, ZERO_ADDRESS)).to.be.revertedWith("!governance");
    });
    it("set has safety checks", async function () {
      await expect(uwp.connect(governor).setIssueFee(ONE_ETHER.add(1), ZERO_ADDRESS)).to.be.revertedWith("invalid issue fee");
      await expect(uwp.connect(governor).setIssueFee(ONE_ETHER, ZERO_ADDRESS)).to.be.revertedWith("invalid issue fee to");
    });
    it("can be set by governance", async function () {
      let tx = await uwp.connect(governor).setIssueFee(1, governor.address);
      await expect(tx).to.emit(uwp, "IssueFeeSet").withArgs(1, governor.address);
      expect(await uwp.issueFee()).eq(1);
      expect(await uwp.issueFeeTo()).eq(governor.address);
      await uwp.connect(governor).setIssueFee(0, ZERO_ADDRESS);
    });
  });

  describe("issue", function () {
    it("cannot deposit mismatched args", async function () {
      await expect(uwp.connect(user1).issue([dai.address], [1,2], user1.address)).to.be.revertedWith("length mismatch");
    });
    it("cannot deposit token not in pool", async function () {
      await expect(uwp.connect(user1).issue([dai.address], [1], user1.address)).to.be.revertedWith("token not in pool");
    });
    it("cannot deposit with insufficient balance", async function () {
      await expect(uwp.connect(user1).issue([weth.address], [1], user1.address)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await weth.transfer(user1.address, ONE_ETHER.mul(1000));
      await dai.transfer(user1.address, ONE_ETHER.mul(100000));
      await near.transfer(user1.address, ONE_NEAR.mul(10000));
    });
    it("cannot deposit with insufficient approval", async function () {
      await expect(uwp.connect(user1).issue([weth.address], [1], user1.address)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      await weth.connect(user1).approve(uwp.address, ethers.constants.MaxUint256);
      await dai.connect(user1).approve(uwp.address, ethers.constants.MaxUint256);
      await near.connect(user1).approve(uwp.address, ethers.constants.MaxUint256);
    });
    it("cannot deposit below min", async function () {
      await uwp.connect(governor).addTokensToPool([
        { token: weth.address, oracle: oracle.address, min: ONE_ETHER.mul(1300), max: ONE_ETHER.mul(13000) }, // measured in USD, so 1-10 ETH
        { token: dai.address, oracle: oracle.address, min: ONE_ETHER.mul(1000), max: ONE_ETHER.mul(10000) },
        { token: usdc.address, oracle: oracle.address, min: 0, max: ONE_ETHER.mul(10000) },
        { token: near.address, oracle: oracle.address, min: 0, max: ONE_ETHER.mul(10000) }, // measured in USD, so 0-2500 NEAR
      ]);
      await expect(uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(999)], user1.address)).to.be.revertedWith("deposit too small");
      await expect(uwp.connect(user1).issue([weth.address], [ONE_ETHER.mul(999).div(1000)], user1.address)).to.be.revertedWith("deposit too small");
    });
    it("cannot deposit above max", async function () {
      await expect(uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(10001)], user1.address)).to.be.revertedWith("deposit too large");
      await expect(uwp.connect(user1).issue([weth.address], [ONE_ETHER.mul(10001).div(1000)], user1.address)).to.be.revertedWith("deposit too large");
    });
    it("can deposit empty", async function () {
      let tx = await uwp.connect(user1).issue([], [], user2.address);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, user2.address, 0);
      expect(await uwp.balanceOf(user1.address)).eq(0);
      expect(await uwp.balanceOf(user2.address)).eq(0);
      expect(await uwp.totalSupply()).eq(0);
      expect(await uwp.valueOfPool()).eq(0);
      expect(await uwp.valuePerShare()).eq(0);
    });
    it("can deposit zero", async function () {
      let tx = await uwp.connect(user1).issue([usdc.address], [0], user2.address);
      await expect(tx).to.emit(usdc, "Transfer").withArgs(user1.address, uwp.address, 0);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, user2.address, 0);
      expect(await uwp.balanceOf(user1.address)).eq(0);
      expect(await uwp.balanceOf(user2.address)).eq(0);
      expect(await uwp.totalSupply()).eq(0);
      expect(await uwp.valueOfPool()).eq(0);
      expect(await uwp.valuePerShare()).eq(0);
    });
    it("can deposit 1", async function () {
      // first deposit
      let amount = await uwp.connect(user1).callStatic.issue([dai.address], [ONE_ETHER.mul(1000)], user2.address);
      expect(amount).eq(ONE_ETHER.mul(1000));
      let tx = await uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(1000)], user2.address);
      await expect(tx).to.emit(dai, "Transfer").withArgs(user1.address, uwp.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, user2.address, ONE_ETHER.mul(1000));
      expect(await uwp.balanceOf(user1.address)).eq(0);
      expect(await uwp.balanceOf(user2.address)).eq(ONE_ETHER.mul(1000));
      expect(await uwp.totalSupply()).eq(ONE_ETHER.mul(1000));
      expect(await uwp.valueOfPool()).eq(ONE_ETHER.mul(1000));
      expect(await uwp.valuePerShare()).eq(ONE_ETHER);
    });
    it("can deposit 2", async function () {
      // another deposit
      let amount = await uwp.connect(user1).callStatic.issue([dai.address], [ONE_ETHER.mul(1000)], user2.address);
      expect(amount).eq(ONE_ETHER.mul(1000));
      let tx = await uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(1000)], user2.address);
      await expect(tx).to.emit(dai, "Transfer").withArgs(user1.address, uwp.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, user2.address, ONE_ETHER.mul(1000));
      expect(await uwp.balanceOf(user1.address)).eq(0);
      expect(await uwp.balanceOf(user2.address)).eq(ONE_ETHER.mul(2000));
      expect(await uwp.totalSupply()).eq(ONE_ETHER.mul(2000));
      expect(await uwp.valueOfPool()).eq(ONE_ETHER.mul(2000));
      expect(await uwp.valuePerShare()).eq(ONE_ETHER);
    });
    it("can deposit 3", async function () {
      // multi deposit
      let amount = await uwp.connect(user1).callStatic.issue([dai.address, weth.address], [ONE_ETHER.mul(1000), ONE_ETHER], user2.address);
      expect(amount).eq(ONE_ETHER.mul(2300));
      let tx = await uwp.connect(user1).issue([dai.address, weth.address], [ONE_ETHER.mul(1000), ONE_ETHER], user2.address);
      await expect(tx).to.emit(dai, "Transfer").withArgs(user1.address, uwp.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(weth, "Transfer").withArgs(user1.address, uwp.address, ONE_ETHER);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, user2.address, ONE_ETHER.mul(2300));
      expect(await uwp.balanceOf(user1.address)).eq(0);
      expect(await uwp.balanceOf(user2.address)).eq(ONE_ETHER.mul(4300));
      expect(await uwp.totalSupply()).eq(ONE_ETHER.mul(4300));
    });
    it("can deposit 4", async function () {
      // with issue fee
      await uwp.connect(governor).setIssueFee(ONE_ETHER.div(100), user3.address);
      let amount = await uwp.connect(user1).callStatic.issue([dai.address], [ONE_ETHER.mul(1000)], user2.address);
      expect(amount).eq(ONE_ETHER.mul(990));
      let tx = await uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(1000)], user2.address);
      await expect(tx).to.emit(dai, "Transfer").withArgs(user1.address, uwp.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, user2.address, ONE_ETHER.mul(990));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, user3.address, ONE_ETHER.mul(10));
      expect(await uwp.balanceOf(user1.address)).eq(0);
      expect(await uwp.balanceOf(user2.address)).eq(ONE_ETHER.mul(5290));
      expect(await uwp.balanceOf(user3.address)).eq(ONE_ETHER.mul(10));
      expect(await uwp.totalSupply()).eq(ONE_ETHER.mul(5300));
      expect(await uwp.valueOfPool()).eq(ONE_ETHER.mul(5300));
      expect(await uwp.valuePerShare()).eq(ONE_ETHER);
    });
    it("cannot deposit above max pt 2", async function () {
      await expect(uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(6001)], user1.address)).to.be.revertedWith("deposit too large");
      await expect(uwp.connect(user1).issue([weth.address], [ONE_ETHER.mul(9001).div(1000)], user1.address)).to.be.revertedWith("deposit too large");
    });
    it("value of pool changes with oracle answers", async function () {
      expect(await uwp.valueOfPool()).eq(ONE_ETHER.mul(5300));
      expect(await uwp.valuePerShare()).eq(ONE_ETHER);
      await ethPriceFeed.connect(governor).setAnswer(EIGHT_DECIMALS.mul(1400));
      expect(await uwp.valueOfPool()).eq(ONE_ETHER.mul(5400));
      expect(await uwp.valuePerShare()).eq(ONE_ETHER.mul(5400).div(5300));
    });
    it("can deposit 5", async function () {
      // at value per share != 1
      await uwp.connect(governor).setIssueFee(0, ZERO_ADDRESS);
      let amount = await uwp.connect(user1).callStatic.issue([near.address], [ONE_NEAR.mul(1000)], user2.address);
      expect(amount).eq(ONE_ETHER.mul(1000).mul(4).mul(5300).div(5400));
      let tx = await uwp.connect(user1).issue([near.address], [ONE_NEAR.mul(1000)], user2.address);
      await expect(tx).to.emit(near, "Transfer").withArgs(user1.address, uwp.address, ONE_NEAR.mul(1000));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, user2.address, ONE_ETHER.mul(1000).mul(4).mul(5300).div(5400));
      expect(await uwp.balanceOf(user1.address)).eq(0);
      expect(await uwp.balanceOf(user2.address)).eq(ONE_ETHER.mul(5290).add(ONE_ETHER.mul(1000).mul(4).mul(5300).div(5400)));
      expect(await uwp.totalSupply()).eq(ONE_ETHER.mul(5300).add(ONE_ETHER.mul(1000).mul(4).mul(5300).div(5400)));
      expect(await uwp.valueOfPool()).eq(ONE_ETHER.mul(9400));
      expect(await uwp.valuePerShare()).eq(ONE_ETHER.mul(5400).div(5300));
    });
  });

  describe("redeem", function () {
    it("cannot redeem more than balance", async function () {
      let bal = await uwp.balanceOf(user2.address);
      await expect(uwp.connect(user2).redeem(bal.add(1), user3.address)).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
    it("can redeem", async function () {
      let tokens = [weth, dai, usdc, near];
      let bals = await Promise.all(tokens.map(token => token.balanceOf(uwp.address)));
      let bal = await uwp.balanceOf(user2.address);
      let ts = await uwp.totalSupply();
      let redeemAmount = ONE_ETHER.mul(1000);
      // static
      let amounts = await uwp.connect(user2).callStatic.redeem(redeemAmount, user3.address);
      for(var i = 0; i < tokens.length; ++i) {
        let expectedAmount = bals[i].mul(redeemAmount).div(ts);
        expect(amounts[i]).eq(expectedAmount);
      }
      // real
      let tx = await uwp.connect(user2).redeem(redeemAmount, user3.address);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(user2.address, ZERO_ADDRESS, redeemAmount);
      for(var i = 0; i < tokens.length; ++i) {
        let expectedAmount = bals[i].mul(redeemAmount).div(ts);
        await expect(tx).to.emit(tokens[i], "Transfer").withArgs(uwp.address, user3.address, expectedAmount);
        expect(await tokens[i].balanceOf(user3.address)).eq(expectedAmount);
      }
      expect(await uwp.balanceOf(user2.address)).eq(bal.sub(redeemAmount));
      expect(await uwp.totalSupply()).eq(ts.sub(redeemAmount));
    });
  });

  describe("rescueTokens", function () {
    it("cannot be called by non governance", async function () {
      await expect(uwp.connect(user1).rescueTokens([], user1.address)).to.be.revertedWith("!governance");
    });
    it("cannot rescue tokens in pool", async function () {
      await expect(uwp.connect(governor).rescueTokens([dai.address], user1.address)).to.be.revertedWith("cannot rescue that token");
    });
    it("can rescue tokens", async function () {
      await uni.transfer(uwp.address, ONE_ETHER);
      await comp.transfer(uwp.address, ONE_ETHER.mul(10));
      let tx = await uwp.connect(governor).rescueTokens([uni.address, comp.address], user1.address);
      await expect(tx).to.emit(uni, "Transfer").withArgs(uwp.address, user1.address, ONE_ETHER);
      await expect(tx).to.emit(comp, "Transfer").withArgs(uwp.address, user1.address, ONE_ETHER.mul(10));
      expect(await uni.balanceOf(uwp.address)).eq(0);
      expect(await uni.balanceOf(user1.address)).eq(ONE_ETHER);
      expect(await comp.balanceOf(uwp.address)).eq(0);
      expect(await comp.balanceOf(user1.address)).eq(ONE_ETHER.mul(10));
    });
  });
});
