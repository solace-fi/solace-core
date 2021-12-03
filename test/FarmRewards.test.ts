import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, XSolace, Vault, OptionsFarming, FarmRewards, CpFarm, Weth9, PolicyManager, RiskManager, Registry, MockErc20Decimals, MockErc20Permit } from "../typechain";
import { bnAddSub, bnMulDiv, expectClose } from "./utilities/math";
import { getERC20PermitSignature } from "./utilities/getERC20PermitSignature";

chai.use(solidity);

// contracts
let solace: Solace;
let xsolace: XSolace;
let farmRewards: FarmRewards;

// tokens
let usdc: MockErc20Permit;
let usdt: MockErc20Decimals;
let dai: MockErc20Permit;
let uni: MockErc20Permit;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_THOUSAND_ETHER = BN.from("1000000000000000000000");
const FIFTY_THOUSAND_ETHER = BN.from("50000000000000000000000");
const REWARD_AMOUNT = ONE_THOUSAND_ETHER;
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
const FOUR_THOUSAND_USDC = BN.from("4000000000");

const VESTING_START = 1638316800; // midnight UTC before December 1, 2021
const VESTING_END = 1651363200; // midnight UTC before May 1, 2022
const SOLACE_PER_XSOLACE = 21;
const SOLACE_PER_XSOLACE_FULL = ONE_ETHER.mul(SOLACE_PER_XSOLACE);
const PRICE_USDC = BN.from("30000").mul(SOLACE_PER_XSOLACE); // 3 cents USDC per solace
const PRICE_DAI = BN.from("30000000000000000").mul(SOLACE_PER_XSOLACE); // 3 cents DAI per solace
const deadline = constants.MaxUint256;

describe("FarmRewards", function () {
  const [deployer, governor, farmer1, farmer2, trader, receiver] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy tokens
    usdc = (await deployContract(deployer, artifacts.MockERC20Permit, ["USD Coin", "USDC", constants.MaxUint256, 6])) as MockErc20Permit;
    usdt = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Tether USD", "USDT", constants.MaxUint256, 6])) as MockErc20Decimals;
    dai = (await deployContract(deployer, artifacts.MockERC20Permit, ["DAI Stablecoin", "DAI", constants.MaxUint256, 18])) as MockErc20Permit;
    uni = (await deployContract(deployer, artifacts.MockERC20Permit, ["UNI", "UNI", constants.MaxUint256, 18])) as MockErc20Permit;

    // deploy solace contracts
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsolace = (await deployContract(deployer, artifacts.xSOLACE, [governor.address, solace.address])) as XSolace;

    // transfer tokens
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await solace.connect(governor).approve(xsolace.address, constants.MaxUint256);
    await xsolace.connect(governor).stake(ONE_MILLION_ETHER);
    await dai.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await usdc.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await usdt.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await uni.connect(deployer).transfer(farmer1.address, ONE_MILLION_ETHER);
    await dai.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await usdc.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await usdt.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
    await uni.connect(deployer).transfer(farmer2.address, ONE_MILLION_ETHER);
  });

  describe("deployment", function () {
    it("verifies inputs", async function () {
      await expect(deployContract(deployer, artifacts.FarmRewards, [ZERO_ADDRESS, xsolace.address, receiver.address, 1])).to.be.revertedWith("zero address governance");
      await expect(deployContract(deployer, artifacts.FarmRewards, [governor.address, ZERO_ADDRESS, receiver.address, 1])).to.be.revertedWith("zero address xsolace");
      await expect(deployContract(deployer, artifacts.FarmRewards, [governor.address, xsolace.address, ZERO_ADDRESS, 1])).to.be.revertedWith("zero address receiver");
    });
    it("deploys successfully", async function () {
      farmRewards = (await deployContract(deployer, artifacts.FarmRewards, [governor.address, xsolace.address, receiver.address, SOLACE_PER_XSOLACE_FULL])) as FarmRewards;
      await solace.connect(governor).mint(farmRewards.address, ONE_MILLION_ETHER);
    });
    it("returns correct values", async function () {
      expect(await farmRewards.xsolace()).eq(xsolace.address);
      expect(await farmRewards.receiver()).eq(receiver.address);
      expect(await farmRewards.vestingStart()).eq(VESTING_START);
      expect(await farmRewards.vestingEnd()).eq(VESTING_END);
      expect(await farmRewards.solacePerXSolace()).eq(SOLACE_PER_XSOLACE_FULL);
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await farmRewards.governance()).to.equal(governor.address);
    });
    it("rejects setting pending governance by non governor", async function () {
      await expect(farmRewards.connect(farmer1).setPendingGovernance(farmer1.address)).to.be.revertedWith("!governance");
    });
    it("can set pending governance", async function () {
      let tx = await farmRewards.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(farmRewards, "GovernancePending").withArgs(deployer.address);
      expect(await farmRewards.governance()).to.equal(governor.address);
      expect(await farmRewards.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(farmRewards.connect(farmer1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function () {
      let tx = await farmRewards.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(farmRewards, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await farmRewards.governance()).to.equal(deployer.address);
      expect(await farmRewards.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await farmRewards.connect(deployer).setPendingGovernance(governor.address);
      await farmRewards.connect(governor).acceptGovernance();
    });
  });

  describe("supported tokens", function () {
    it("starts with no supported tokens", async function () {
      expect(await farmRewards.tokenInSupported(dai.address)).eq(false);
    });
    it("non governance cannot add supported tokens", async function () {
      await expect(farmRewards.connect(trader).supportTokens([])).to.be.revertedWith("!governance");
    });
    it("cannot add zero address", async function () {
      await expect(farmRewards.connect(governor).supportTokens([dai.address, ZERO_ADDRESS])).to.be.revertedWith("zero address token");
    });
    it("can add support for tokens", async function () {
      await farmRewards.connect(governor).supportTokens([dai.address, usdc.address, usdt.address]);
      expect(await farmRewards.tokenInSupported(dai.address)).eq(true);
      expect(await farmRewards.tokenInSupported(usdc.address)).eq(true);
      expect(await farmRewards.tokenInSupported(usdt.address)).eq(true);
      expect(await farmRewards.tokenInSupported(uni.address)).eq(false);
    });
  });

  describe("receiver", function () {
    it("starts set", async function () {
      expect(await farmRewards.receiver()).to.equal(receiver.address);
    });
    it("cannot be set by non governance", async function () {
      await expect(farmRewards.connect(farmer1).setReceiver(trader.address)).to.be.revertedWith("!governance");
    });
    it("cannot set to zero", async function () {
      await expect(farmRewards.connect(governor).setReceiver(ZERO_ADDRESS)).to.be.revertedWith("zero address receiver");
    });
    it("can be set", async function () {
      let tx = await farmRewards.connect(governor).setReceiver(trader.address);
      expect(tx).to.emit(farmRewards, "ReceiverSet").withArgs(trader.address);
      expect(await farmRewards.receiver()).to.equal(trader.address);
      await farmRewards.connect(governor).setReceiver(receiver.address);
    });
  });

  describe("set farmed rewards", function () {
    it("cannot be set by non governance", async function () {
      await expect(farmRewards.connect(trader).setFarmedRewards([],[])).to.be.revertedWith("!governance");
    });
    it("checks length mismatch", async function () {
      await expect(farmRewards.connect(governor).setFarmedRewards([],[1])).to.be.revertedWith("length mismatch");
    })
    it("can be set", async function () {
      let farmer1s = ["0x97de953cde13fd813ac6bf8e3ad8735cc18a74b7", "0x71ad3b3bac0ab729fe8961512c6d430f34a36a34", "0xe5d8eb1d907e1554dd69d05536e056b90ae43d7b", "0x4f6798d42feb2a9169f4fbe0f986d005e1b76180", "0x68b53aa18d1b8437b7cd9524040c776e2261e06d", "0x501ace0e8d16b92236763e2ded7ae3bc2dffa276", "0xf8fe281a44def550c620882364e4a00f2ea80218", "0x091b922f4ec3c7bf73b4c484428a9d9679f8c53f", "0xc3422497f17a60d06a10f049c65a1dfd2b3b31be", "0xfb5caae76af8d3ce730f3d62c6442744853d43ef", "0xb6c9a522a303bf3f3988fd8e3efc2383060f4cc6", "0xdaca78193e7e5bb52221aef14d61ead2cae27fb6", "0x0f763341b448bb0f02370f4037fe4a2c84c9283f", "0x215a3749879e0ab83343d81aa670c45107a02620", "0x216d5609afb295931b47b7ececc36e3fc1908262", "0xf04de0999c16d51f8c79bdc9dd6a25eb90a94a8f", "0xde0639aa8a85cc9ea40f53f2dc2ad3f0d791b69c", "0xfa088e1f6691a4de186b6486a3266687019cf916", "0x7d77fbd7b12887f9ba83110b721905efa3707223", "0x02f98c63e6352c06fa8d5f14c004926f165cee74", "0x3fcab7343a2ccbc463200d7b19ea8c5e5766a676", "0x3da9d70305b83db1f545a5d50b19208b93cd0c21", "0xa9f078b3b6dd6c04308f19def394b6d5a1b8b732", "0x4bdf6d1dfc9993183dee1c95822a5511a234241d", "0x31b9084568783fd9d47c733f3799567379015e6d", "0xa752eea12f7ecaa7674363255e5e7f0b083a515c", "0x283e8531d354d1296de7591018d7fb8aaefb1dd2", "0x17466b61cffebe6670853c68e694e0897779e19d", "0xb0d6ae7784a9f20c1e34218998f0fc5c24972441", "0xcffe08bdf20918007f8ab268c32f8756494fc8d8", "0xba6a5d1d74e056fb7ec1263a110f5bd9462df58a", "0x874cc5222207858c4ee336386ed32d5b04293d22", "0xeaa4f3773f57af1d4c7130e07cde48050245511b", "0xfb6676656a4b6eade2c9a9f18c8cb71411e37289", "0xebc146cc23b0742b603595f8bea7dabcbf05840a", "0xd5236cca5bae6e09d044ade099397ebc30f52131", "0xe73deef8189dd8f8f9d82229ab31f0aae8f4c875", "0x2759b5efe48015bfbb9b0ed8bedcf62bb991ff4b", "0x55a6514978e8f72691454617ad187065f729d07e", "0xbbde1e05d96c5c4f7e377d5eaed21cac08a92945", "0x646e115e018766ec6a272ae5fe738c38b7f43521", "0xf0bdfd6899389449aa77cefbed28891b12d19880", "0x95f6b040a013d89883e36545df53844dbda4d8d1", "0x5eb67a3b141f3036899ee77822a41277166c540e", "0x36463b59b1b8f0cc1a94054425a2b2b3a17c6901", "0x53646c6c68e5b99168cbbf7470e47e89897a8273", "0xdfab977372a039e78839687b8c359465f0f17532", "0x8adace41ec579423f149d7402f282301fcfaff36", "0xfb306239c89d9b6e6a9ab080070a68bb08cbaaa2", "0xafe13742864bfa0a1950bfd1200dd27da4485d94", "0x0d7b281fbfd3281f7859e55ff579f5ebb41e2fcb", "0xa2490947b30258b522b7d6fd8fabec2d21c42d57", "0xedd88ca63d7c0b9cf182afdee3852258f31961f9", "0x653a480ce4887a9081397abe77caf6221b3d4f4c", "0xef9f32bf7c6381d42bb942832fd0e56ab99008fb", "0x11bb97923209df97e8c9839e1e394798cb0c0336", "0xd8faec528b9fbf4fe3226d6beb8b14a4f9bad655", "0x3194770e03ec3b0ebeaa7eb93b01290a85acc905", "0xe62c522b0eea657414fad0a1893223f54ccd5190", "0xcf3a24407aae7c87bd800c47928c5f20cd4764d2", "0xce66c6a88bd7bec215aa04fda4cf7c81055521d0", "0xdd6fd6622d4af631d8c5c1f637526e89ccff9646", "0x70e439584ef1ba300106b9c16543eaa1de676dc2", "0x8501518fe7d26c416d63072847c59d454103db4b", "0x8829f99344bca59d5c7ccb36848fe7efd2efb4eb", "0xe859f96c7a5a25c74dc7bb1f8ac2af2ea3a6160f", "0x4a86e7efce5f37583e6b7c4db88d37eff5812685", "0x0025befed0d57a11db1dc26a80e651bb38c97027", "0xdd13eb27af410ea094c2ac357f1b79b62f738062", "0x7c224beeb6064d7ca376dc66a8d1245ad5926aa6", "0x5bcf75ff702e90c889ae5c41ee25af364abc77cb", "0x195f61d13576f2ec92c812dc01faafd6433b6af7", "0x773cfc636f996f8bb0334c60fbb67ceb4154a6c2", "0x5edd81949604c74e984ee3424a72c6733df463d3", "0x404d846c95b2a70104fbae9797305beaa27a4062", "0x167d6fb10d4e6f037e97d4d9879f96b0b36023d1", "0x75352403b0355bf8c7b92bbd27fbe09d25f099c4", "0xf71e9c766cdf169edfbe2749490943c1dc6b8a55", "0xa72dd12b9329e6efe095c030f361131604a79586", "0xeda6b8db5517b1b55d3c99dfed9b671a143f8d05", "0x1750e7dfdd32fe6205e900b9cfb6c2247af8095f", "0x63c87453ad6ac61754092780713d96bc57d16288", "0x56ddd887fd2ed44c73d51f4127ab00ba3efc6527", "0x2808edd543813fcf418de85bb42eedf3b39ba72c", "0x10b0a72ea6110a4b985e21f62c4e30d09ccec89c", "0xe3bf79e595a4be7b0dc9d60b32dea80ab7ee5d17", "0x942b04e62bd86b1e273f3df3e52b7a980b5f07ba", "0x7894684edfdaa6113cf416e84cdb826a41ef45b8", "0x9893360c45ef5a51c3b38dcbdfe0039c80fd6f60", "0x8707cde20dd43e3db1f74c28fcd509ef38b0ba51", "0x529813a65f05a6c479db8d7443739448463a9d1c", "0x34bb9e91dc8ac1e13fb42a0e23f7236999e063d4", "0x45c791d8fe882f36c38edae92ef048f8a736c805", "0x70f8d86ac14548ce33da8a3fcd19076c56e0ea9d", "0x6d5fa92e25721aa23071ea6a8df9cee67c5820b3", "0x9d156bc7c8768294510a4a41883d5a4eb15b15e3", "0x8ac9db9c51e0d077a2fa432868eafd02d9142d53", "0x049aa75e6ab5e2ab2ae21ddab95252ab76ec800a", "0x31bfb5c4ee08ba9f65582f3e5ff215cccfa3f860", "0xa841b95d61171a55ca5bfaf99da5b19e2d5b710f", "0xc724f1558eb9216bb9e04be169317f70dcbef857"];
      let rewards = [];
      while(rewards.length < farmer1s.length) {
        rewards.push(ONE_ETHER.mul(rewards.length+1));
      }
      await farmRewards.connect(governor).setFarmedRewards(farmer1s, rewards);
      for(var i = 0; i < farmer1s.length; ++i) {
        expect(await farmRewards.farmedRewards(farmer1s[i])).eq(rewards[i]);
      }
    });
  });

  describe("calculate amounts", function () {
    it("cannot use unsupported tokens", async function () {
      await expect(farmRewards.calculateAmountIn(uni.address, 1)).to.be.revertedWith("token in not supported");
      await expect(farmRewards.calculateAmountOut(uni.address, 1)).to.be.revertedWith("token in not supported");
    });
    it("can calculate amount in", async function () {
      const ONE_HUNDRED_SOLACE = ONE_ETHER.mul(100);
      expect(await farmRewards.calculateAmountIn(dai.address, ONE_HUNDRED_SOLACE)).eq(PRICE_DAI.mul(100));
      expect(await farmRewards.calculateAmountIn(usdc.address, ONE_HUNDRED_SOLACE)).eq(PRICE_USDC.mul(100));
    });
    it("can calculate amount out", async function () {
      const ONE_HUNDRED_DAI = ONE_ETHER.mul(100);
      const ONE_HUNDRED_USDC = BN.from("100000000");
      expect(await farmRewards.calculateAmountOut(dai.address, ONE_HUNDRED_DAI)).eq(ONE_ETHER.mul(100).mul(100).div(3).div(SOLACE_PER_XSOLACE));
      expect(await farmRewards.calculateAmountOut(usdc.address, ONE_HUNDRED_USDC)).eq(ONE_ETHER.mul(100).mul(100).div(3).div(SOLACE_PER_XSOLACE));
    });
  });

  describe("redeem", function () {
    let tolerance = BN.from("10000000000000000"); // 1e15
    before(async function () {
      await farmRewards.connect(governor).setFarmedRewards([farmer1.address], [ONE_ETHER.mul(10000)]);
      await farmRewards.connect(governor).setFarmedRewards([farmer2.address], [ONE_ETHER.mul(10000)]);
      await xsolace.connect(governor).transfer(farmRewards.address, ONE_MILLION_ETHER);
    });
    it("non farmer should not be eligible for rewards", async function () {
      expect(await farmRewards.purchaseableVestedXSolace(trader.address)).eq(0);
    });
    it("farmer should be eligible for rewards", async function () {
      expect(await farmRewards.purchaseableVestedXSolace(farmer1.address)).gt(0);
    })
    it("cannot redeem with unsupported token", async function () {
      await expect(farmRewards.connect(trader).redeem(uni.address, 1)).to.be.revertedWith("token in not supported");
    });
    it("can redeem using too much input", async function () {
      let amountIn1 = ONE_ETHER.mul(100);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(dai.address, amountIn1);
      let bal1 = await getBalances(farmer1.address);
      await dai.connect(farmer1).approve(farmRewards.address, amountIn1);
      await farmRewards.connect(farmer1).redeem(dai.address, amountIn1);
      let bal2 = await getBalances(farmer1.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      let actualAmountOut1 = bal12.userXSolace;
      expect(actualAmountOut1).to.be.lt(expectedAmountOut1);
      expectClose(actualAmountOut1, bal1.purchaseableVestedXSolace, tolerance);
      expect(bal12.farmRewardsXSolace.mul(-1)).eq(actualAmountOut1);
      expect(bal2.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn1 = await farmRewards.calculateAmountIn(dai.address, actualAmountOut1);
      expect(expectedAmountIn1).to.be.lt(amountIn1);
      expectClose(expectedAmountIn1, bal12.userDAI.mul(-1), tolerance);

      let amountIn2 = BN.from(1000000).mul(100);
      let expectedAmountOut2 = await farmRewards.calculateAmountOut(usdc.address, amountIn2);
      await usdc.connect(farmer1).approve(farmRewards.address, amountIn2);
      await farmRewards.connect(farmer1).redeem(usdc.address, amountIn2);
      let bal3 = await getBalances(farmer1.address);
      let bal23 = getBalancesDiff(bal3, bal2);
      let actualAmountOut2 = bal23.userXSolace;
      expect(actualAmountOut2).to.be.lt(expectedAmountOut2);
      expectClose(actualAmountOut2, bal2.purchaseableVestedXSolace, tolerance);
      expect(bal23.farmRewardsXSolace.mul(-1)).eq(actualAmountOut2);
      expect(bal3.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn2 = await farmRewards.calculateAmountIn(usdc.address, actualAmountOut2);
      expect(expectedAmountIn2).to.be.lt(amountIn2);
      expectClose(expectedAmountIn2, bal23.userUSDC.mul(-1), 10000);
    });
    it("can redeem signed using too much input", async function () {
      let amountIn1 = ONE_ETHER.mul(100);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(dai.address, amountIn1);
      let bal1 = await getBalances(farmer2.address);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewards.address, dai, amountIn1);
      await farmRewards.connect(trader).redeemSigned(dai.address, amountIn1, farmer2.address, deadline, v, r, s);
      let bal2 = await getBalances(farmer2.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      let actualAmountOut1 = bal12.userXSolace;
      expect(actualAmountOut1).to.be.lt(expectedAmountOut1);
      expectClose(actualAmountOut1, bal1.purchaseableVestedXSolace, tolerance);
      expect(bal12.farmRewardsXSolace.mul(-1)).eq(actualAmountOut1);
      expect(bal2.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn1 = await farmRewards.calculateAmountIn(dai.address, actualAmountOut1);
      expect(expectedAmountIn1).to.be.lt(amountIn1);
      expectClose(expectedAmountIn1, bal12.userDAI.mul(-1), tolerance);

      let amountIn2 = BN.from(1000000).mul(100);
      let expectedAmountOut2 = await farmRewards.calculateAmountOut(usdc.address, amountIn2);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewards.address, usdc, amountIn2);
      await farmRewards.connect(trader).redeemSigned(usdc.address, amountIn2, farmer2.address, deadline, v, r, s);
      let bal3 = await getBalances(farmer2.address);
      let bal23 = getBalancesDiff(bal3, bal2);
      let actualAmountOut2 = bal23.userXSolace;
      expect(actualAmountOut2).to.be.lt(expectedAmountOut2);
      expectClose(actualAmountOut2, bal2.purchaseableVestedXSolace, tolerance);
      expect(bal23.farmRewardsXSolace.mul(-1)).eq(actualAmountOut2);
      expect(bal3.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn2 = await farmRewards.calculateAmountIn(usdc.address, actualAmountOut2);
      expect(expectedAmountIn2).to.be.lt(amountIn2);
      expectClose(expectedAmountIn2, bal23.userUSDC.mul(-1), 10000);
    });
    it("can redeem using reasonable input", async function () {
      let timestamp = (VESTING_START+VESTING_END)/2; // halfway vested
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);

      let amountIn1 = ONE_ETHER.mul(100);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(dai.address, amountIn1);
      let bal1 = await getBalances(farmer1.address);
      await dai.connect(farmer1).approve(farmRewards.address, amountIn1);
      await farmRewards.connect(farmer1).redeem(dai.address, amountIn1);
      let bal2 = await getBalances(farmer1.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userXSolace).to.be.eq(expectedAmountOut1);
      expect(bal12.farmRewardsXSolace.mul(-1)).to.be.eq(expectedAmountOut1);
      expect(bal12.userDAI.mul(-1)).eq(amountIn1);

      let amountIn2 = BN.from(1000000).mul(100);
      let expectedAmountOut2 = await farmRewards.calculateAmountOut(usdc.address, amountIn2);
      await usdc.connect(farmer1).approve(farmRewards.address, amountIn2);
      await farmRewards.connect(farmer1).redeem(usdc.address, amountIn2);
      let bal3 = await getBalances(farmer1.address);
      let bal23 = getBalancesDiff(bal3, bal2);
      expect(bal23.userXSolace).to.be.eq(expectedAmountOut2);
      expect(bal23.farmRewardsXSolace.mul(-1)).to.be.eq(expectedAmountOut2);
      expect(bal23.userUSDC.mul(-1)).eq(amountIn2);
    });
    it("can redeem signed using reasonable input", async function () {
      let amountIn1 = ONE_ETHER.mul(100);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(dai.address, amountIn1);
      let bal1 = await getBalances(farmer2.address);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewards.address, dai, amountIn1);
      await farmRewards.connect(trader).redeemSigned(dai.address, amountIn1, farmer2.address, deadline, v, r, s);
      let bal2 = await getBalances(farmer2.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userXSolace).to.be.eq(expectedAmountOut1);
      expect(bal12.farmRewardsXSolace.mul(-1)).to.be.eq(expectedAmountOut1);
      expect(bal12.userDAI.mul(-1)).eq(amountIn1);

      let amountIn2 = BN.from(1000000).mul(100);
      let expectedAmountOut2 = await farmRewards.calculateAmountOut(usdc.address, amountIn2);
      var { v, r, s } = await getERC20PermitSignature(farmer2, farmRewards.address, usdc, amountIn2);
      await farmRewards.connect(trader).redeemSigned(usdc.address, amountIn2, farmer2.address, deadline, v, r, s);
      let bal3 = await getBalances(farmer2.address);
      let bal23 = getBalancesDiff(bal3, bal2);
      expect(bal23.userXSolace).to.be.eq(expectedAmountOut2);
      expect(bal23.farmRewardsXSolace.mul(-1)).to.be.eq(expectedAmountOut2);
      expect(bal23.userUSDC.mul(-1)).eq(amountIn2);
    });
    it("can redeem in full", async function () {
      let timestamp = VESTING_END+1; // fully vested
      await provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await provider.send("evm_mine", []);

      let amountIn1 = BN.from(1000000).mul(10000);
      let expectedAmountOut1 = await farmRewards.calculateAmountOut(usdt.address, amountIn1);
      let bal1 = await getBalances(farmer1.address);
      await usdt.connect(farmer1).approve(farmRewards.address, amountIn1);
      await farmRewards.connect(farmer1).redeem(usdt.address, amountIn1);
      let bal2 = await getBalances(farmer1.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      let actualAmountOut1 = bal12.userXSolace;
      expect(actualAmountOut1).to.be.lt(expectedAmountOut1);
      expectClose(actualAmountOut1, bal1.purchaseableVestedXSolace, tolerance);
      expect(bal12.farmRewardsXSolace.mul(-1)).eq(actualAmountOut1);
      expect(bal2.purchaseableVestedXSolace).eq(0);
      let expectedAmountIn1 = await farmRewards.calculateAmountIn(usdt.address, actualAmountOut1);
      expect(expectedAmountIn1).to.be.lt(amountIn1);
      expectClose(expectedAmountIn1, bal12.userUSDT.mul(-1), tolerance);
    });
  });

  describe("return xSOLACE", function () {
    it("cannot be called by non governance", async function () {
      await expect(farmRewards.connect(trader).returnXSolace(1)).to.be.revertedWith("!governance");
    });
    it("can return xSOLACE", async function () {
      let bal1 = await getBalances(receiver.address);
      await farmRewards.connect(governor).returnXSolace(ONE_ETHER);
      let bal2 = await getBalances(receiver.address);
      let bal12 = getBalancesDiff(bal2, bal1);
      expect(bal12.userXSolace).eq(ONE_ETHER);
      expect(bal12.farmRewardsXSolace).eq(ONE_ETHER.mul(-1));
    });
  });

  interface Balances {
    userXSolace: BN;
    farmRewardsXSolace: BN;
    redeemedRewards: BN;
    purchaseableVestedXSolace: BN;
    userDAI: BN;
    userUSDC: BN;
    userUSDT: BN;
    receiverDAI: BN;
    receiverUSDC: BN;
    receiverUSDT: BN;
  }

  async function getBalances(user: string): Promise<Balances> {
    return {
      userXSolace: await xsolace.balanceOf(user),
      farmRewardsXSolace: await xsolace.balanceOf(farmRewards.address),
      redeemedRewards: await farmRewards.redeemedRewards(user),
      purchaseableVestedXSolace: await farmRewards.purchaseableVestedXSolace(user),
      userDAI: await dai.balanceOf(user),
      userUSDC: await usdc.balanceOf(user),
      userUSDT: await usdt.balanceOf(user),
      receiverDAI: await dai.balanceOf(receiver.address),
      receiverUSDC: await usdc.balanceOf(receiver.address),
      receiverUSDT: await usdt.balanceOf(receiver.address)
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userXSolace: balances1.userXSolace.sub(balances2.userXSolace),
      farmRewardsXSolace: balances1.farmRewardsXSolace.sub(balances2.farmRewardsXSolace),
      redeemedRewards: balances1.redeemedRewards.sub(balances2.redeemedRewards),
      purchaseableVestedXSolace: balances1.purchaseableVestedXSolace.sub(balances2.purchaseableVestedXSolace),
      userDAI: balances1.userDAI.sub(balances2.userDAI),
      userUSDC: balances1.userUSDC.sub(balances2.userUSDC),
      userUSDT: balances1.userUSDT.sub(balances2.userUSDT),
      receiverDAI: balances1.receiverDAI.sub(balances2.receiverDAI),
      receiverUSDC: balances1.receiverUSDC.sub(balances2.receiverUSDC),
      receiverUSDT: balances1.receiverUSDT.sub(balances2.receiverUSDT)
    };
  }
});
