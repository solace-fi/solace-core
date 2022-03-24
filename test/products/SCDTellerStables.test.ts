import chai from "chai";
import { waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, constants, Wallet } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Registry, Scd, MockScdRetainer, ScdTellerStables, MockErc20Decimals, MockErc20Permit, Weth10 } from "./../../typechain";
import { expectDeployed } from "./../utilities/expectDeployed";
import { toBytes32 } from "./../utilities/setStorage";
import { getERC20PermitSignature } from "./../utilities/getERC20PermitSignature";

describe("SCDTellerStables", function () {
  let registry: Registry;
  let scd: Scd;
  let teller: ScdTellerStables;
  let scdRetainer: MockScdRetainer;
  const [deployer, governor, user1, user2, scdMover, premiumPool] = provider.getWallets();

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_ETHER = BN.from("1000000000000000000");
  const ONE_USDC = BN.from("1000000");
  const deadline = constants.MaxUint256;

  let dai: MockErc20Decimals;
  let usdc: MockErc20Permit;
  let frax: MockErc20Decimals;
  let fei: MockErc20Permit;
  let weth: Weth10;

  let ZERO                = BN.from("0x0000000000000000000000000000000000000000000000000000000000000000");
  let IS_KNOWN_MASK       = BN.from("0x0000000000000000000000000000000000000000000000000000000000000001");
  let IS_ACCEPTED_MASK    = BN.from("0x0000000000000000000000000000000000000000000000000000000000000002");
  let IS_PERMITTABLE_MASK = BN.from("0x0000000000000000000000000000000000000000000000000000000000000004");
  let IS_REFUNDABLE_MASK  = BN.from("0x0000000000000000000000000000000000000000000000000000000000000008");

  let DAI_FLAGS_1 = bitwiseOr([IS_ACCEPTED_MASK, IS_REFUNDABLE_MASK]);
  let USDC_FLAGS_1 = bitwiseOr([IS_ACCEPTED_MASK, IS_REFUNDABLE_MASK]);

  let DAI_FLAGS_2 = bitwiseOr([IS_ACCEPTED_MASK, IS_REFUNDABLE_MASK, IS_KNOWN_MASK]);
  let USDC_FLAGS_2 = bitwiseOr([IS_ACCEPTED_MASK, IS_REFUNDABLE_MASK, IS_KNOWN_MASK]);

  let DAI_FLAGS_3 = bitwiseOr([IS_ACCEPTED_MASK, IS_REFUNDABLE_MASK, IS_KNOWN_MASK]);
  let USDC_FLAGS_3 = bitwiseOr([IS_ACCEPTED_MASK, IS_PERMITTABLE_MASK, IS_REFUNDABLE_MASK, IS_KNOWN_MASK]);

  let FRAX_FLAGS_3 = bitwiseOr([IS_ACCEPTED_MASK, IS_KNOWN_MASK]);
  let FEI_FLAGS_3 = bitwiseOr([IS_ACCEPTED_MASK, IS_PERMITTABLE_MASK, IS_REFUNDABLE_MASK, IS_KNOWN_MASK]);

  let USDC_FLAGS_4 = bitwiseOr([IS_ACCEPTED_MASK, IS_PERMITTABLE_MASK, IS_KNOWN_MASK]);

  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    await expectDeployed(registry.address);
    scd = (await deployContract(deployer, artifacts.SCD, [governor.address])) as Scd;
    await expectDeployed(scd.address);
    dai = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Dai Stablecoin", "DAI", 0, 18])) as MockErc20Decimals;
    await expectDeployed(dai.address);
    usdc = (await deployContract(deployer, artifacts.MockERC20Permit, ["USD Coin", "USDC", 0, 6])) as MockErc20Permit;
    await expectDeployed(usdc.address);
    frax = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Frax", "FRAX", 0, 18])) as MockErc20Decimals;
    await expectDeployed(frax.address);
    fei = (await deployContract(deployer, artifacts.MockERC20Permit, ["Fei USD", "FEI", 0, 18])) as MockErc20Permit;
    await expectDeployed(fei.address);
    weth = (await deployContract(deployer, artifacts.WETH10)) as Weth10;
    await expectDeployed(weth.address);
  });

  describe("deployment", function () {
    it("cannot deploy with zero address governance", async function () {
      await expect(deployContract(deployer, artifacts.SCDTellerStables, [ZERO_ADDRESS, registry.address])).to.be.revertedWith("zero address governance");
    });
    it("cannot deploy with zero address registry", async function () {
      await expect(deployContract(deployer, artifacts.SCDTellerStables, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address registry");
    });
    it("cannot deploy with zero address scd", async function () {
      await expect(deployContract(deployer, artifacts.SCDTellerStables, [governor.address, registry.address])).to.be.revertedWith("zero address scd");
    });
    it("cannot deploy with zero address premium pool", async function () {
      await registry.connect(governor).set(["scd"], [scd.address]);
      await expect(deployContract(deployer, artifacts.SCDTellerStables, [governor.address, registry.address])).to.be.revertedWith("zero address premium pool");
    });
    it("deploys successfully", async function () {
      await registry.connect(governor).set(["premiumPool"], [premiumPool.address]);
      teller = (await deployContract(deployer, artifacts.SCDTellerStables, [governor.address, registry.address])) as ScdTellerStables;
      await expectDeployed(teller.address);
    });
    it("has a correct governance", async function () {
      expect(await teller.governance()).eq(governor.address);
    });
    it("has a correct scd", async function () {
      expect(await teller.scd()).eq(scd.address);
    });
    it("has a correct premium pool", async function () {
      expect(await teller.premiumPool()).eq(premiumPool.address);
    });
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await teller.governance()).eq(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(teller.connect(user1).setPendingGovernance(user1.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await teller.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(teller, "GovernancePending").withArgs(deployer.address);
      expect(await teller.governance()).eq(governor.address);
      expect(await teller.pendingGovernance()).eq(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(teller.connect(user1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function() {
      let tx = await teller.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(teller, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await teller.governance()).eq(deployer.address);
      expect(await teller.pendingGovernance()).eq(ZERO_ADDRESS);

      await teller.connect(deployer).setPendingGovernance(governor.address);
      await teller.connect(governor).acceptGovernance();
    });
  });

  describe("tokens and flags", function () {
    it("starts with no tokens", async function () {
      expect(await teller.tokensLength()).eq(0);
      expect(await teller.tokenList(0)).eq(ZERO_ADDRESS);
      expect(await teller.tokenFlags(dai.address)).eq(ZERO);
      let { isKnown, isAccepted, isPermittable, isRefundable } = await teller.getTokenFlags(dai.address);
      expect(isKnown).eq(false);
      expect(isAccepted).eq(false);
      expect(isPermittable).eq(false);
      expect(isRefundable).eq(false);
    });
    it("non governance cannot add tokens", async function () {
      await expect(teller.connect(user1).setTokenFlags([],[])).to.be.revertedWith("!governance");
    });
    it("cannot add tokens with mismatched length", async function () {
      await expect(teller.connect(governor).setTokenFlags([],[toBytes32(0)])).to.be.revertedWith("length mismatch");
    });
    it("governance can add tokens", async function () {
      let tx1 = await teller.connect(governor).setTokenFlags([dai.address, usdc.address], [toBytes32(DAI_FLAGS_1), toBytes32(USDC_FLAGS_1)])
      await expect(tx1).to.emit(teller, "TokenFlagsSet").withArgs(dai.address, toBytes32(DAI_FLAGS_2));
      await expect(tx1).to.emit(teller, "TokenFlagsSet").withArgs(usdc.address, toBytes32(USDC_FLAGS_2));

      expect(await teller.tokensLength()).eq(2);
      expect(await teller.tokenList(0)).eq(dai.address);
      expect(await teller.tokenList(1)).eq(usdc.address);
      expect(await teller.tokenList(2)).eq(ZERO_ADDRESS);
      expect(await teller.tokenFlags(dai.address)).eq(DAI_FLAGS_2);
      var { isKnown, isAccepted, isPermittable, isRefundable } = await teller.getTokenFlags(dai.address);
      expect(isKnown).eq(true);
      expect(isAccepted).eq(true);
      expect(isPermittable).eq(false);
      expect(isRefundable).eq(true);
      expect(await teller.tokenFlags(usdc.address)).eq(USDC_FLAGS_2);
      var { isKnown, isAccepted, isPermittable, isRefundable } = await teller.getTokenFlags(usdc.address);
      expect(isKnown).eq(true);
      expect(isAccepted).eq(true);
      expect(isPermittable).eq(false);
      expect(isRefundable).eq(true);

      let tx2 = await teller.connect(governor).setTokenFlags([usdc.address, frax.address], [toBytes32(USDC_FLAGS_3), toBytes32(FRAX_FLAGS_3)])
      await expect(tx2).to.emit(teller, "TokenFlagsSet").withArgs(usdc.address, toBytes32(USDC_FLAGS_3));
      await expect(tx2).to.emit(teller, "TokenFlagsSet").withArgs(frax.address, toBytes32(FRAX_FLAGS_3));

      expect(await teller.tokensLength()).eq(3);
      expect(await teller.tokenList(0)).eq(dai.address);
      expect(await teller.tokenList(1)).eq(usdc.address);
      expect(await teller.tokenList(2)).eq(frax.address);
      expect(await teller.tokenList(3)).eq(ZERO_ADDRESS);
      expect(await teller.tokenFlags(dai.address)).eq(DAI_FLAGS_2);
      var { isKnown, isAccepted, isPermittable, isRefundable } = await teller.getTokenFlags(dai.address);
      expect(isKnown).eq(true);
      expect(isAccepted).eq(true);
      expect(isPermittable).eq(false);
      expect(isRefundable).eq(true);
      expect(await teller.tokenFlags(usdc.address)).eq(USDC_FLAGS_3);
      var { isKnown, isAccepted, isPermittable, isRefundable } = await teller.getTokenFlags(usdc.address);
      expect(isKnown).eq(true);
      expect(isAccepted).eq(true);
      expect(isPermittable).eq(true);
      expect(isRefundable).eq(true);
      expect(await teller.tokenFlags(frax.address)).eq(FRAX_FLAGS_3);
      var { isKnown, isAccepted, isPermittable, isRefundable } = await teller.getTokenFlags(frax.address);
      expect(isKnown).eq(true);
      expect(isAccepted).eq(true);
      expect(isPermittable).eq(false);
      expect(isRefundable).eq(false);
    });
  });

  describe("premium pool", function () {
    it("cannot be set by non governance", async function () {
      await expect(teller.connect(user1).setPremiumPool(user1.address)).to.be.revertedWith("!governance");
    });
    it("can be set by governance", async function () {
      let tx = await teller.connect(governor).setPremiumPool(deployer.address);
      await expect(tx).to.emit(teller, "PremiumPoolSet").withArgs(deployer.address);
      await teller.connect(governor).setPremiumPool(premiumPool.address);
    });
  });

  describe("deposit", function () {
    it("starts with no deposits", async function () {
      expect(await teller.deposits(user1.address, dai.address)).eq(0);
      expect(await scd.balanceOf(user1.address)).eq(0);
      expect(await scd.balanceOfNonRefundable(user1.address)).eq(0);
    });
    it("cannot deposit unaccepted token", async function () {
      await expect(teller.connect(user1).deposit(weth.address, user1.address, 0)).to.be.revertedWith("token not accepted");
    });
    it("cannot deposit with insufficient balance", async function () {
      await expect(teller.connect(user1).deposit(dai.address, user1.address, 1)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit with insufficient allowance", async function () {
      await dai.mintToken(user1.address, ONE_ETHER.mul(1000));
      await expect(teller.connect(user1).deposit(dai.address, user1.address, 1)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("cannot deposit if teller is not an scd mover", async function () {
      await dai.connect(user1).approve(teller.address, constants.MaxUint256);
      await scd.connect(governor).setScdMoverStatuses([teller.address],[false]);
      await expect(teller.connect(user1).deposit(dai.address, user1.address, 1)).to.be.revertedWith("!scd mover");
      await scd.connect(governor).setScdMoverStatuses([teller.address],[true]);
    });
    it("can deposit", async function () {
      await usdc.connect(user2).mint();
      await usdc.connect(user2).approve(teller.address, constants.MaxUint256);

      let depositAmount1 = ONE_ETHER.mul(10);
      let depositAmount2 = ONE_USDC.mul(20);
      let depositAmount3 = ONE_USDC.mul(30);
      let depositAmount4 = ONE_USDC.mul(40);

      let depositValue12 = ONE_ETHER.mul(30);
      let depositValue123 = ONE_ETHER.mul(60);
      let depositValue1234 = ONE_ETHER.mul(100);
      let depositValue3 = ONE_ETHER.mul(30);
      let depositValue34 = ONE_ETHER.mul(70);

      let daiBal1 = await dai.balanceOf(user1.address);
      let tx1 = await teller.connect(user1).deposit(dai.address, user2.address, depositAmount1);
      let daiBal2 = await dai.balanceOf(user1.address);
      expect(daiBal1.sub(daiBal2)).eq(depositAmount1);
      await expect(tx1).to.emit(teller, "TokenDeposited").withArgs(dai.address, user1.address, user2.address, depositAmount1);
      expect(await teller.deposits(user1.address, dai.address)).eq(0);
      expect(await teller.deposits(user2.address, dai.address)).eq(depositAmount1);
      expect(await scd.balanceOf(user1.address)).eq(0);
      expect(await scd.balanceOf(user2.address)).eq(depositAmount1);
      expect(await scd.balanceOfNonRefundable(user1.address)).eq(0);
      expect(await scd.balanceOfNonRefundable(user2.address)).eq(0);

      let usdcBal1 = await usdc.balanceOf(user2.address);
      let tx2 = await teller.connect(user2).deposit(usdc.address, user2.address, depositAmount2);
      let usdcBal2 = await usdc.balanceOf(user2.address);
      expect(usdcBal1.sub(usdcBal2)).eq(depositAmount2);
      await expect(tx2).to.emit(teller, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount2);
      expect(await teller.deposits(user2.address, usdc.address)).eq(depositAmount2);
      expect(await scd.balanceOf(user1.address)).eq(0);
      expect(await scd.balanceOf(user2.address)).eq(depositValue12);
      expect(await scd.balanceOfNonRefundable(user2.address)).eq(0);

      await teller.connect(governor).setTokenFlags([usdc.address], [toBytes32(FRAX_FLAGS_3)]);

      let tx3 = await teller.connect(user2).deposit(usdc.address, user2.address, depositAmount3);
      let usdcBal3 = await usdc.balanceOf(user2.address);
      expect(usdcBal2.sub(usdcBal3)).eq(depositAmount3);
      await expect(tx3).to.emit(teller, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount3);
      expect(await teller.deposits(user2.address, usdc.address)).eq(depositAmount2.add(depositAmount3));
      expect(await scd.balanceOf(user2.address)).eq(depositValue123);
      expect(await scd.balanceOfNonRefundable(user2.address)).eq(depositValue3);

      let tx4 = await teller.connect(user2).deposit(usdc.address, user2.address, depositAmount4);
      let usdcBal4 = await usdc.balanceOf(user2.address);
      expect(usdcBal3.sub(usdcBal4)).eq(depositAmount4);
      await expect(tx4).to.emit(teller, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount4);
      expect(await teller.deposits(user2.address, usdc.address)).eq(depositAmount2.add(depositAmount3).add(depositAmount4));
      expect(await scd.balanceOf(user2.address)).eq(depositValue1234);
      expect(await scd.balanceOfNonRefundable(user2.address)).eq(depositValue34);

      await teller.connect(governor).setTokenFlags([usdc.address], [toBytes32(USDC_FLAGS_3)])
    });
  });

  describe("depositSigned", function () {
    before("redeploy scd and teller", async function () {
      scd = (await deployContract(deployer, artifacts.SCD, [governor.address])) as Scd;
      await registry.connect(governor).set(["scd"], [scd.address]);
      teller = (await deployContract(deployer, artifacts.SCDTellerStables, [governor.address, registry.address])) as ScdTellerStables;
      await teller.connect(governor).setTokenFlags([dai.address, usdc.address, frax.address, fei.address], [toBytes32(DAI_FLAGS_3), toBytes32(USDC_FLAGS_3), toBytes32(FRAX_FLAGS_3), toBytes32(FEI_FLAGS_3)]);
    });
    it("starts with no deposits", async function () {
      expect(await teller.deposits(user1.address, dai.address)).eq(0);
      expect(await scd.balanceOf(user1.address)).eq(0);
      expect(await scd.balanceOfNonRefundable(user1.address)).eq(0);
    });
    it("cannot depositSigned unaccepted token", async function () {
      let { v, r, s } = await getERC20PermitSignature(user1, teller.address, weth, ONE_ETHER);
      await expect(teller.connect(user1).depositSigned(weth.address, user1.address, ONE_ETHER, deadline, v, r, s)).to.be.revertedWith("token not accepted");
    });
    it("cannot depositSigned unpermittable token", async function () {
      let { v, r, s } = await getERC20PermitSignature(user1, teller.address, weth, ONE_ETHER);
      await expect(teller.connect(user1).depositSigned(dai.address, user1.address, ONE_ETHER, deadline, v, r, s)).to.be.revertedWith("token not permittable");
    });
    it("cannot depositSigned with insufficient balance", async function () {
      let { v, r, s } = await getERC20PermitSignature(user1, teller.address, usdc, ONE_USDC);
      await expect(teller.connect(user1).depositSigned(usdc.address, user1.address, ONE_USDC, deadline, v, r, s)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot depositSigned with invalid permit", async function () {
      await dai.mintToken(user1.address, ONE_ETHER.mul(1000));
      let { v, r, s } = await getERC20PermitSignature(user1, teller.address, usdc, ONE_USDC);
      await expect(teller.connect(user1).depositSigned(usdc.address, user1.address, ONE_USDC, deadline, v+1, r, s)).to.be.reverted;
    });
    it("cannot deposit if teller is not an scd mover", async function () {
      await scd.connect(governor).setScdMoverStatuses([teller.address],[false]);
      let { v, r, s } = await getERC20PermitSignature(user2, teller.address, usdc, ONE_USDC);
      await expect(teller.connect(user2).depositSigned(usdc.address, user2.address, ONE_USDC, deadline, v, r, s)).to.be.revertedWith("!scd mover");
      await scd.connect(governor).setScdMoverStatuses([teller.address],[true]);
    });
    it("can deposit", async function () {
      await usdc.connect(user2).mint();
      await fei.connect(user2).mint();

      let depositAmount1 = ONE_ETHER.mul(10);
      let depositAmount2 = ONE_USDC.mul(20);
      let depositAmount3 = ONE_USDC.mul(30);
      let depositAmount4 = ONE_USDC.mul(40);

      let depositValue12 = ONE_ETHER.mul(30);
      let depositValue123 = ONE_ETHER.mul(60);
      let depositValue1234 = ONE_ETHER.mul(100);
      let depositValue3 = ONE_ETHER.mul(30);
      let depositValue34 = ONE_ETHER.mul(70);

      let feiBal1 = await fei.balanceOf(user2.address);
      var { v, r, s } = await getERC20PermitSignature(user2, teller.address, fei, depositAmount1);
      let tx1 = await teller.connect(user2).depositSigned(fei.address, user2.address, depositAmount1, deadline, v, r, s);
      let feiBal2 = await fei.balanceOf(user2.address);
      expect(feiBal1.sub(feiBal2)).eq(depositAmount1);
      await expect(tx1).to.emit(teller, "TokenDeposited").withArgs(fei.address, user2.address, user2.address, depositAmount1);
      expect(await teller.deposits(user1.address, fei.address)).eq(0);
      expect(await teller.deposits(user2.address, fei.address)).eq(depositAmount1);
      expect(await scd.balanceOf(user1.address)).eq(0);
      expect(await scd.balanceOf(user2.address)).eq(depositAmount1);
      expect(await scd.balanceOfNonRefundable(user1.address)).eq(0);
      expect(await scd.balanceOfNonRefundable(user2.address)).eq(0);

      let usdcBal1 = await usdc.balanceOf(user2.address);
      var { v, r, s } = await getERC20PermitSignature(user2, teller.address, usdc, depositAmount2);
      let tx2 = await teller.connect(user2).depositSigned(usdc.address, user2.address, depositAmount2, deadline, v, r, s);
      let usdcBal2 = await usdc.balanceOf(user2.address);
      expect(usdcBal1.sub(usdcBal2)).eq(depositAmount2);
      await expect(tx2).to.emit(teller, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount2);
      expect(await teller.deposits(user2.address, usdc.address)).eq(depositAmount2);
      expect(await scd.balanceOf(user1.address)).eq(0);
      expect(await scd.balanceOf(user2.address)).eq(depositValue12);
      expect(await scd.balanceOfNonRefundable(user2.address)).eq(0);

      await teller.connect(governor).setTokenFlags([usdc.address], [toBytes32(USDC_FLAGS_4)]);

      var { v, r, s } = await getERC20PermitSignature(user2, teller.address, usdc, depositAmount3);
      let tx3 = await teller.connect(user2).depositSigned(usdc.address, user2.address, depositAmount3, deadline, v, r, s);
      let usdcBal3 = await usdc.balanceOf(user2.address);
      expect(usdcBal2.sub(usdcBal3)).eq(depositAmount3);
      await expect(tx3).to.emit(teller, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount3);
      expect(await teller.deposits(user2.address, usdc.address)).eq(depositAmount2.add(depositAmount3));
      expect(await scd.balanceOf(user2.address)).eq(depositValue123);
      expect(await scd.balanceOfNonRefundable(user2.address)).eq(depositValue3);

      var { v, r, s } = await getERC20PermitSignature(user2, teller.address, usdc, depositAmount4);
      let tx4 = await teller.connect(user2).depositSigned(usdc.address, user2.address, depositAmount4, deadline, v, r, s);
      let usdcBal4 = await usdc.balanceOf(user2.address);
      expect(usdcBal3.sub(usdcBal4)).eq(depositAmount4);
      await expect(tx4).to.emit(teller, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount4);
      expect(await teller.deposits(user2.address, usdc.address)).eq(depositAmount2.add(depositAmount3).add(depositAmount4));
      expect(await scd.balanceOf(user2.address)).eq(depositValue1234);
      expect(await scd.balanceOfNonRefundable(user2.address)).eq(depositValue34);

      await teller.connect(governor).setTokenFlags([usdc.address], [toBytes32(USDC_FLAGS_3)])
    });
  });

  describe("withdraw", function () {
    before("redeploy scd and teller", async function () {
      scd = (await deployContract(deployer, artifacts.SCD, [governor.address])) as Scd;
      await registry.connect(governor).set(["scd"], [scd.address]);
      teller = (await deployContract(deployer, artifacts.SCDTellerStables, [governor.address, registry.address])) as ScdTellerStables;
      await teller.connect(governor).setTokenFlags([dai.address, usdc.address, frax.address, fei.address], [toBytes32(DAI_FLAGS_3), toBytes32(USDC_FLAGS_3), toBytes32(FRAX_FLAGS_3), toBytes32(FEI_FLAGS_3)]);
      await scd.connect(governor).setScdMoverStatuses([scdMover.address,teller.address],[true,true]);

      await dai.connect(user2).mint();
      await usdc.connect(user2).mint();
      await dai.connect(user2).approve(teller.address, constants.MaxUint256);
      await usdc.connect(user2).approve(teller.address, constants.MaxUint256);
    });
    it("cannot refund non refundable token", async function () {
      await teller.connect(governor).setTokenFlags([usdc.address], [toBytes32(USDC_FLAGS_4)]);
      await expect(teller.connect(user2).withdraw(usdc.address, 0, user2.address)).to.be.revertedWith("token not refundable");
      await teller.connect(governor).setTokenFlags([usdc.address], [toBytes32(USDC_FLAGS_3)]);
    });
    it("cannot withdraw more than deposited", async function () {
      await expect(teller.connect(user2).withdraw(dai.address, 1, user2.address)).to.be.revertedWith("insufficient deposit");
      await teller.connect(user2).deposit(dai.address, user2.address, 1);
      await expect(teller.connect(user2).withdraw(dai.address, 2, user2.address)).to.be.revertedWith("insufficient deposit");
      await expect(teller.connect(user2).withdraw(usdc.address, 1, user2.address)).to.be.revertedWith("insufficient deposit");
      await expect(teller.connect(user1).withdraw(dai.address, 1, user2.address)).to.be.revertedWith("insufficient deposit");
    });
    it("cannot withdraw if teller is not an scd mover", async function () {
      await scd.connect(governor).setScdMoverStatuses([teller.address],[false]);
      await expect(teller.connect(user2).withdraw(dai.address, 0, user2.address)).to.be.revertedWith("!scd mover");
      await scd.connect(governor).setScdMoverStatuses([teller.address],[true]);
    });
    it("cannot withdraw with insufficient SCD", async function () {
      await scd.connect(scdMover).transferFrom(user2.address, premiumPool.address, 1);
      await expect(teller.connect(user2).withdraw(dai.address, 1, user2.address)).to.be.revertedWith("SCD: withdraw amount exceeds balance");
    });
    it("cannot withdraw to below min SCD required", async function () {
      await teller.connect(user2).deposit(dai.address, user2.address, 10);
      scdRetainer = (await deployContract(deployer, artifacts.MockSCDRetainer)) as MockScdRetainer;
      await scdRetainer.setMinScdRequired(user2.address, 9);
      await scd.connect(governor).setScdRetainerStatuses([scdRetainer.address], [true]);
      await expect(teller.connect(user2).withdraw(dai.address, 2, user2.address)).to.be.revertedWith("SCD: withdraw to below min");
    });
    it("cannot withdraw with insufficient premium pool balance", async function () {
      let bal = await dai.balanceOf(premiumPool.address);
      await dai.connect(premiumPool).transfer(deployer.address, bal);
      await teller.connect(user2).deposit(dai.address, user2.address, 10);
      await expect(teller.connect(user2).withdraw(dai.address, 11, user2.address)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot withdraw with insufficient premium pool allowance", async function () {
      await expect(teller.connect(user2).withdraw(dai.address, 9, user2.address)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("can withdraw", async function () {
      await dai.connect(premiumPool).approve(teller.address, constants.MaxUint256);
      let withdrawAmount1 = 9;
      let withdrawAmount2 = 7;

      // withdraw refundable amount
      let daiBal11 = await dai.balanceOf(user1.address);
      let daiBal12 = await dai.balanceOf(user2.address);
      let scdBal11 = await scd.balanceOf(user1.address);
      let scdBal12 = await scd.balanceOf(user2.address);
      let tx1 = await teller.connect(user2).withdraw(dai.address, withdrawAmount1, user1.address);
      await expect(tx1).to.emit(teller, "TokenWithdrawn").withArgs(dai.address, user2.address, user1.address, withdrawAmount1);
      let daiBal21 = await dai.balanceOf(user1.address);
      let daiBal22 = await dai.balanceOf(user2.address);
      let scdBal21 = await scd.balanceOf(user1.address);
      let scdBal22 = await scd.balanceOf(user2.address);
      expect(daiBal21.sub(daiBal11)).eq(withdrawAmount1);
      expect(daiBal22.sub(daiBal12)).eq(0);
      expect(scdBal21.sub(scdBal11)).eq(0);
      expect(scdBal22.sub(scdBal12)).eq(-withdrawAmount1);

      // can withdraw refundable amount as long as refundable+nonrefundable >= min scd required
      await teller.connect(governor).setTokenFlags([dai.address],[toBytes32(FRAX_FLAGS_3)]);
      await teller.connect(user2).deposit(dai.address, user2.address, 100);
      await teller.connect(governor).setTokenFlags([dai.address],[toBytes32(DAI_FLAGS_3)]);

      console.log('')
      console.log(await scd.balanceOf(user2.address));
      console.log(await scd.balanceOfNonRefundable(user2.address));
      console.log(await scd.minScdRequired(user2.address));

      let daiBal32 = await dai.balanceOf(user2.address);
      let scdBal32 = await scd.balanceOf(user2.address);
      let scdBnr32 = await scd.balanceOfNonRefundable(user2.address);
      let scdBr32 = scdBal32.sub(scdBnr32);
      let tx2 = await teller.connect(user2).withdraw(dai.address, withdrawAmount2, user2.address);
      await expect(tx2).to.emit(teller, "TokenWithdrawn").withArgs(dai.address, user2.address, user2.address, withdrawAmount2);

      console.log('')
      console.log(await scd.balanceOf(user2.address));
      console.log(await scd.balanceOfNonRefundable(user2.address));
      console.log(await scd.minScdRequired(user2.address));

      let daiBal42 = await dai.balanceOf(user2.address);
      let scdBal42 = await scd.balanceOf(user2.address);
      let scdBnr42 = await scd.balanceOfNonRefundable(user2.address);
      let scdBr42 = scdBal42.sub(scdBnr42);
      expect(daiBal42.sub(daiBal32)).eq(withdrawAmount2);
      expect(scdBal42.sub(scdBal32)).eq(-withdrawAmount2);
      expect(scdBnr42.sub(scdBnr32)).eq(0);
      expect(scdBr42.sub(scdBr32)).eq(-withdrawAmount2);
    });
    it("cannot withdraw nonrefundable scd", async function () {
      let bal = await scd.balanceOf(user2.address);
      let bnr = await scd.balanceOfNonRefundable(user2.address);
      let br = bal.sub(bnr);
      await expect(teller.connect(user2).withdraw(dai.address, br.add(1), user2.address)).to.be.revertedWith("SCD: withdraw amount exceeds balance");
    });
  });

  function bitwiseOr(masks: BN[]) {
    let res = ZERO;
    for(var i = 0; i < masks.length; ++i) {
      res = res.or(masks[i]);
    }
    return res;
  }
})
