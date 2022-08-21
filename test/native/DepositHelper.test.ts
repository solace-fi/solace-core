import chai from "chai";
import { ethers, waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, Wallet } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { UnderwritingPool, FluxMegaOracle, MockFluxPriceFeed, MockErc20, MockErc20Decimals, UnderwritingEquity, UnderwritingLocker, Registry, DepositHelper, BlockGetter } from "../../typechain";
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
const ONE_YEAR = 31536000; // in seconds

describe("DepositHelper", function () {
  let uwp: UnderwritingPool;
  let uwe: UnderwritingEquity;
  let registry: Registry;
  let underwritingLocker: UnderwritingLocker;
  let depositHelper: DepositHelper;

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

  let blockGetter: BlockGetter;

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
      { token: dai.address, priceFeed: daiPriceFeed.address, tokenDecimals: 18, priceFeedDecimals: 8 },
      { token: weth.address, priceFeed: ethPriceFeed.address, tokenDecimals: 18, priceFeedDecimals: 8 },
      { token: near.address, priceFeed: nearPriceFeed.address, tokenDecimals: 24, priceFeedDecimals: 8 },
      { token: usdc.address, priceFeed: usdcPriceFeed.address, tokenDecimals: 6, priceFeedDecimals: 8 },
    ]);

    // deploy uwp
    uwp = (await deployContract(deployer, artifacts.UnderwritingPool, [governor.address])) as UnderwritingPool;
    await uwp.connect(governor).addTokensToPool([
      { token: dai.address, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
      { token: weth.address, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
    ]);
    // deploy uwe
    uwe = (await deployContract(deployer, artifacts.UnderwritingEquity, [governor.address, uwp.address])) as UnderwritingEquity;
    // deploy registry
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    await registry.connect(governor).set(["uwe"], [uwe.address]);
    // deploy locker
    underwritingLocker = (await deployContract(deployer, artifacts.UnderwritingLocker, [governor.address, registry.address])) as UnderwritingLocker;

    blockGetter = (await deployContract(deployer, artifacts.BlockGetter)) as BlockGetter;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("reverts if zero uwp", async function () {
      await expect(deployContract(deployer, artifacts.DepositHelper, [ZERO_ADDRESS, uwe.address, underwritingLocker.address])).to.be.revertedWith("zero address uwp");
    });
    it("reverts if zero uwe", async function () {
      await expect(deployContract(deployer, artifacts.DepositHelper, [uwp.address, ZERO_ADDRESS, underwritingLocker.address])).to.be.revertedWith("zero address uwe");
    });
    it("reverts if zero locker", async function () {
      await expect(deployContract(deployer, artifacts.DepositHelper, [uwp.address, uwe.address, ZERO_ADDRESS])).to.be.revertedWith("zero address locker");
    });
    it("deploys", async function () {
      depositHelper = (await deployContract(deployer, artifacts.DepositHelper, [uwp.address, uwe.address, underwritingLocker.address])) as DepositHelper;
      await expectDeployed(depositHelper.address);
    });
    it("initializes correctly", async function () {
      expect(await depositHelper.underwritingPool()).eq(uwp.address);
      expect(await depositHelper.underwritingEquity()).eq(uwe.address);
      expect(await depositHelper.underwritingLocker()).eq(underwritingLocker.address);
    });
  });

  describe("deposit", function () {
    let end: BN;
    before(async function () {
      let timestamp = await blockGetter.getBlockTimestamp();
      end = timestamp.add(ONE_YEAR);
      //let timestamp = (await provider.getBlock('latest')).timestamp;
      //console.log('ts  : ', timestamp);
      //console.log('one : ', ONE_YEAR);
      //let end = timestamp + ONE_YEAR;
      //console.log('end : ', end);
    });
    it("cannot deposit token not in pool", async function () {
      await expect(depositHelper.connect(user1).calculateDeposit(near.address, 0)).to.be.revertedWith("token not in pool");
      await expect(depositHelper.connect(user1).depositAndLock(near.address, 0, 0)).to.be.revertedWith("token not in pool");
      await expect(depositHelper.connect(user1).depositIntoLock(near.address, 0, 0)).to.be.revertedWith("token not in pool");
    });
    /*
    it("cannot deposit with insufficient balance", async function () {
      await expect(depositHelper.connect(user1).depositAndLock(dai.address, 1, 0)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await expect(depositHelper.connect(user1).depositAndLock(uwp.address, 1, 0)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await expect(depositHelper.connect(user1).depositAndLock(uwe.address, 1, 0)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await expect(depositHelper.connect(user1).depositIntoLock(dai.address, 1, 0)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await expect(depositHelper.connect(user1).depositIntoLock(uwp.address, 1, 0)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await expect(depositHelper.connect(user1).depositIntoLock(uwe.address, 1, 0)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit with insufficient allowance", async function () {
      await dai.connect(deployer).transfer(user1.address, ONE_ETHER.mul(100000));
      await expect(depositHelper.connect(user1).depositAndLock(dai.address, 1, 0)).to.be.revertedWith("ERC20: insufficient allowance");
      await expect(depositHelper.connect(user1).depositIntoLock(dai.address, 1, 0)).to.be.revertedWith("ERC20: insufficient allowance");
    });
    */
    it("cannot deposit into nonexistent lock", async function () {
      await dai.connect(deployer).transfer(user1.address, ONE_ETHER.mul(100000));
      await dai.connect(user1).approve(depositHelper.address, ONE_ETHER.mul(100000));
      await expect(depositHelper.connect(user1).depositIntoLock(dai.address, 1, 999)).to.be.revertedWith("ERC721: owner query for nonexistent token");
    });
    it("can deposit 1", async function () {
      // dai to new lock at 1:1
      let amt = await depositHelper.calculateDeposit(dai.address, ONE_ETHER.mul(1000));
      expect(amt).eq(ONE_ETHER.mul(1000));
      let lockID = await depositHelper.connect(user1).callStatic.depositAndLock(dai.address, ONE_ETHER.mul(1000), end);
      expect(lockID).eq(1);

      let tx = await depositHelper.connect(user1).depositAndLock(dai.address, ONE_ETHER.mul(1000), end);
      await expect(tx).to.emit(dai, "Transfer").withArgs(user1.address, depositHelper.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(dai, "Transfer").withArgs(depositHelper.address, uwp.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, depositHelper.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(depositHelper.address, uwe.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, depositHelper.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(depositHelper.address, underwritingLocker.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(underwritingLocker, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 1);
      expect(await underwritingLocker.balanceOf(user1.address)).eq(1);
      expect(await underwritingLocker.ownerOf(1)).eq(user1.address);
      let lock = await underwritingLocker.locks(1);
      expect(lock.amount).eq(ONE_ETHER.mul(1000));
      expect(lock.end).eq(end);
    });
    it("can deposit 2", async function () {
      // weth to existing lock at 1:1
      let amt = await depositHelper.calculateDeposit(weth.address, ONE_ETHER);
      expect(amt).eq(ONE_ETHER.mul(1300));

      await weth.connect(deployer).transfer(user1.address, ONE_ETHER.mul(1000));
      await weth.connect(user1).approve(depositHelper.address, ethers.constants.MaxUint256);
      let tx = await depositHelper.connect(user1).depositIntoLock(weth.address, ONE_ETHER, 1);
      await expect(tx).to.emit(weth, "Transfer").withArgs(user1.address, depositHelper.address, ONE_ETHER);
      await expect(tx).to.emit(weth, "Transfer").withArgs(depositHelper.address, uwp.address, ONE_ETHER);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, depositHelper.address, ONE_ETHER.mul(1300));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(depositHelper.address, uwe.address, ONE_ETHER.mul(1300));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, depositHelper.address, ONE_ETHER.mul(1300));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(depositHelper.address, underwritingLocker.address, ONE_ETHER.mul(1300));
      expect(await underwritingLocker.balanceOf(user1.address)).eq(1);
      expect(await underwritingLocker.ownerOf(1)).eq(user1.address);
      let lock = await underwritingLocker.locks(1);
      expect(lock.amount).eq(ONE_ETHER.mul(2300));
      expect(lock.end).eq(end);
    });
    it("can deposit 3", async function () {
      // uwp to new lock at 1:1
      await dai.connect(user1).approve(uwp.address, ethers.constants.MaxUint256);
      await uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(1000)], user1.address);
      await uwp.connect(user1).approve(depositHelper.address, ethers.constants.MaxUint256);

      let amt = await depositHelper.calculateDeposit(uwp.address, ONE_ETHER.mul(1000));
      expect(amt).eq(ONE_ETHER.mul(1000));
      let tx = await depositHelper.connect(user1).depositAndLock(uwp.address, ONE_ETHER.mul(1000), end);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(user1.address, depositHelper.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(depositHelper.address, uwe.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, depositHelper.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(depositHelper.address, underwritingLocker.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(underwritingLocker, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 2);
      expect(await underwritingLocker.balanceOf(user1.address)).eq(2);
      expect(await underwritingLocker.ownerOf(2)).eq(user1.address);
      let lock = await underwritingLocker.locks(2);
      expect(lock.amount).eq(ONE_ETHER.mul(1000));
    });
    it("can deposit 4", async function () {
      // uwe to new lock at 1:1
      await dai.connect(user1).approve(uwp.address, ethers.constants.MaxUint256);
      await uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(1000)], user1.address);
      await uwp.connect(user1).approve(uwe.address, ethers.constants.MaxUint256);
      await uwe.connect(user1).deposit(ONE_ETHER.mul(1000), user1.address);
      await uwe.connect(user1).approve(depositHelper.address, ethers.constants.MaxUint256);

      let amt = await depositHelper.calculateDeposit(uwe.address, ONE_ETHER.mul(1000));
      expect(amt).eq(ONE_ETHER.mul(1000));
      let tx = await depositHelper.connect(user1).depositAndLock(uwe.address, ONE_ETHER.mul(1000), end);
      await expect(tx).to.emit(uwe, "Transfer").withArgs(user1.address, depositHelper.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(depositHelper.address, underwritingLocker.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(underwritingLocker, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 3);
      expect(await underwritingLocker.balanceOf(user1.address)).eq(3);
      expect(await underwritingLocker.ownerOf(3)).eq(user1.address);
      let lock = await underwritingLocker.locks(3);
      expect(lock.amount).eq(ONE_ETHER.mul(1000));
    });
    it("can deposit 5", async function () {
      // dai to new lock not at 1:1
      await dai.connect(user1).transfer(uwp.address, ONE_ETHER.mul(8600)); // uwp 3:1
      await dai.connect(user1).approve(uwp.address, ethers.constants.MaxUint256);
      await uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(5700).mul(3)], user1.address);
      await uwp.connect(user1).approve(uwe.address, ethers.constants.MaxUint256);
      await uwe.connect(user1).deposit(ONE_ETHER.mul(5700), user1.address); // ts 10k
      await uwe.connect(user1).burn(ONE_ETHER.mul(2000)); // uwe 4:5

      let amt1 = await uwp.calculateIssue([dai.address], [ONE_ETHER.mul(1000)]);
      expect(amt1).eq(ONE_ETHER.mul(1000).div(3));
      let amt2 = await uwe.calculateDeposit(ONE_ETHER.mul(1000));
      expect(amt2).eq(ONE_ETHER.mul(1000).mul(4).div(5));
      let amt = await depositHelper.calculateDeposit(dai.address, ONE_ETHER.mul(1000));
      expect(amt).eq(ONE_ETHER.mul(1000).div(3).mul(4).div(5));

      let tx = await depositHelper.connect(user1).depositAndLock(dai.address, ONE_ETHER.mul(1000), end);
      await expect(tx).to.emit(dai, "Transfer").withArgs(user1.address, depositHelper.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(dai, "Transfer").withArgs(depositHelper.address, uwp.address, ONE_ETHER.mul(1000));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(ZERO_ADDRESS, depositHelper.address, ONE_ETHER.mul(1000).div(3));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(depositHelper.address, uwe.address, ONE_ETHER.mul(1000).div(3));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, depositHelper.address, ONE_ETHER.mul(1000).div(3).mul(4).div(5));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(depositHelper.address, underwritingLocker.address, ONE_ETHER.mul(1000).div(3).mul(4).div(5));
      await expect(tx).to.emit(underwritingLocker, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 4);
      expect(await underwritingLocker.balanceOf(user1.address)).eq(4);
      expect(await underwritingLocker.ownerOf(4)).eq(user1.address);
      let lock = await underwritingLocker.locks(4);
      expect(lock.amount).eq(ONE_ETHER.mul(1000).div(3).mul(4).div(5));
    });
    it("can deposit 6", async function () {
      // uwp to new lock not at 1:1
      await uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(1000)], user1.address);
      let bal = await uwp.balanceOf(user1.address);
      expect(bal).eq(ONE_ETHER.mul(1000).div(3));

      let amt = await depositHelper.calculateDeposit(uwp.address, bal);
      expect(amt).eq(ONE_ETHER.mul(1000).div(3).mul(4).div(5));

      let tx = await depositHelper.connect(user1).depositAndLock(uwp.address, bal, end);
      await expect(tx).to.emit(uwp, "Transfer").withArgs(user1.address, depositHelper.address, ONE_ETHER.mul(1000).div(3));
      await expect(tx).to.emit(uwp, "Transfer").withArgs(depositHelper.address, uwe.address, ONE_ETHER.mul(1000).div(3));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(ZERO_ADDRESS, depositHelper.address, ONE_ETHER.mul(1000).div(3).mul(4).div(5));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(depositHelper.address, underwritingLocker.address, ONE_ETHER.mul(1000).div(3).mul(4).div(5));
      await expect(tx).to.emit(underwritingLocker, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 5);
      expect(await underwritingLocker.balanceOf(user1.address)).eq(5);
      expect(await underwritingLocker.ownerOf(5)).eq(user1.address);
      let lock = await underwritingLocker.locks(5);
      expect(lock.amount).eq(ONE_ETHER.mul(1000).div(3).mul(4).div(5));
    });
    it("can deposit 7", async function () {
      // uwe to new lock not at 1:1
      let bal1 = await uwe.balanceOf(user1.address);
      await uwe.connect(user1).transfer(user2.address, bal1);
      await uwp.connect(user1).issue([dai.address], [ONE_ETHER.mul(1000)], user1.address);
      await uwe.connect(user1).deposit(ONE_ETHER.mul(1000).div(3), user1.address);
      let bal = await uwe.balanceOf(user1.address);
      expect(bal).eq(ONE_ETHER.mul(1000).div(3).mul(4).div(5));

      let amt = await depositHelper.calculateDeposit(uwe.address, bal);
      expect(amt).eq(ONE_ETHER.mul(1000).div(3).mul(4).div(5));

      let tx = await depositHelper.connect(user1).depositAndLock(uwe.address, bal, end);
      await expect(tx).to.emit(uwe, "Transfer").withArgs(user1.address, depositHelper.address, ONE_ETHER.mul(1000).div(3).mul(4).div(5));
      await expect(tx).to.emit(uwe, "Transfer").withArgs(depositHelper.address, underwritingLocker.address, ONE_ETHER.mul(1000).div(3).mul(4).div(5));
      await expect(tx).to.emit(underwritingLocker, "Transfer").withArgs(ZERO_ADDRESS, user1.address, 6);
      expect(await underwritingLocker.balanceOf(user1.address)).eq(6);
      expect(await underwritingLocker.ownerOf(6)).eq(user1.address);
      let lock = await underwritingLocker.locks(6);
      expect(lock.amount).eq(ONE_ETHER.mul(1000).div(3).mul(4).div(5));
    });
  });
});
