import chai from "chai";
import { waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, constants, utils, Wallet } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { Registry, Scp, MockScpRetainer, CoverPaymentManager, MockErc20Decimals, MockErc20Permit, Weth10 } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";
import { toBytes32, toAbiEncoded } from "../utilities/setStorage";
import { getERC20PermitSignature } from "../utilities/getERC20PermitSignature";
import { assembleSignature, getPriceDataDigest, sign } from "../utilities/signature";


describe("CoverPaymentManager", function () {
  // contracts
  let registry: Registry;
  let scp: Scp;
  let coverPaymentManager: CoverPaymentManager;
  let scpRetainer: MockScpRetainer;

  // tokens
  let dai: MockErc20Decimals;
  let usdc: MockErc20Permit;
  let frax: MockErc20Decimals;
  let fei: MockErc20Permit;
  let weth: Weth10;
  let solace: MockErc20Permit;

  const [deployer, governor, user1, user2, user3, user4, premiumPool, premiumPool2, premiumPool3, premiumPool4] = provider.getWallets();
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ONE_ETHER = BN.from("1000000000000000000");
  const ONE_USDC = BN.from("1000000");
  const DEADLINE = constants.MaxUint256;
  const DEPOSIT_SIGHASH  = "0x4ba58eee";
  const TYPEHASH = utils.keccak256(utils.toUtf8Bytes("PriceData(address token,uint256 price,uint256 deadline)"));
  const DOMAIN_NAME = "Solace.fi-PriceVerifier";
  const CHAIN_ID = 31337;
  
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy registry
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    await expectDeployed(registry.address);

    // deploy scp
    scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
    await expectDeployed(scp.address);

    // deploy stables
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

    // deploy solace
    solace = (await deployContract(deployer, artifacts.MockERC20Permit, ["solace", "SOLACE", 0, 18])) as MockErc20Permit;
    await expectDeployed(solace.address);

  });

  describe.only("deployment", function () {
    it("cannot deploy with zero address governance", async function () {
      await expect(deployContract(deployer, artifacts.CoverPaymentManager, [ZERO_ADDRESS, registry.address])).to.be.revertedWith("zero address governance");
    });

    it("cannot deploy with zero address registry", async function () {
      await expect(deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address registry");
    });

    it("cannot deploy with zero address scp", async function () {
      await expect(deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])).to.be.revertedWith("zero address scp");
      await registry.connect(governor).set(["scp"], [scp.address]);
    });

    it("cannot deploy with zero address solace", async function () {
        await expect(deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])).to.be.revertedWith("zero address solace");
        await registry.connect(governor).set(["solace"], [solace.address]);
    });

    it("cannot deploy with zero address premium pool", async function () {
      await expect(deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])).to.be.revertedWith("zero address premium pool");
      await registry.connect(governor).set(["premiumPool"], [premiumPool.address]);
    });

    it("deploys successfully", async function () {
      await registry.connect(governor).set(["premiumPool"], [premiumPool.address]);
      coverPaymentManager = (await deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])) as CoverPaymentManager;
      await expectDeployed(coverPaymentManager.address);
    });

    it("has a correct governance", async function () {
      expect(await coverPaymentManager.governance()).eq(governor.address);
    });

    it("has a correct scp", async function () {
      expect(await coverPaymentManager.scp()).eq(scp.address);
    });

    it("has a correct solace", async function () {
        expect(await coverPaymentManager.solace()).eq(solace.address);
    });

    it("has a correct premium pool", async function () {
      expect(await coverPaymentManager.premiumPool()).eq(premiumPool.address);
    });
  });

  describe.only("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await coverPaymentManager.governance()).eq(governor.address);
    });

    it("rejects setting new governance by non governor", async function() {
      await expect(coverPaymentManager.connect(user1).setPendingGovernance(user1.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function() {
      let tx = await coverPaymentManager.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(coverPaymentManager, "GovernancePending").withArgs(deployer.address);
      expect(await coverPaymentManager.governance()).eq(governor.address);
      expect(await coverPaymentManager.pendingGovernance()).eq(deployer.address);
    });

    it("rejects governance transfer by non governor", async function() {
      await expect(coverPaymentManager.connect(user1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async function() {
      let tx = await coverPaymentManager.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(coverPaymentManager, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await coverPaymentManager.governance()).eq(deployer.address);
      expect(await coverPaymentManager.pendingGovernance()).eq(ZERO_ADDRESS);

      await coverPaymentManager.connect(deployer).setPendingGovernance(governor.address);
      await coverPaymentManager.connect(governor).acceptGovernance();
    });
  });

  describe.only("pause", () => {
    it("starts unpaused", async () => {
      expect(await coverPaymentManager.paused()).to.equal(false);
    });

    it("cannot be paused by non governance", async () => {
      await expect(coverPaymentManager.connect(deployer).setPaused(true)).to.be.revertedWith("!governance");
      expect(await coverPaymentManager.paused()).to.equal(false);
    });

    it("can be paused", async () => {
      let tx = await coverPaymentManager.connect(governor).setPaused(true);
      await expect(tx).to.emit(coverPaymentManager, "PauseSet").withArgs(true);
      expect(await coverPaymentManager.paused()).to.equal(true);
    });

    it("cannot be unpaused by non governance", async () => {
      await expect(coverPaymentManager.connect(deployer).setPaused(false)).to.be.revertedWith("!governance");
      expect(await coverPaymentManager.paused()).to.equal(true);
    });

    it("can be unpaused", async () => {
      let tx = await coverPaymentManager.connect(governor).setPaused(false);
      await expect(tx).to.emit(coverPaymentManager, "PauseSet").withArgs(false);
      expect(await coverPaymentManager.paused()).to.equal(false);
    });
  });

  describe.only("registry", () => {
    let registry2: Registry;

    before(async () => {
      registry2 =  (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    });

    after(async () => {
      await coverPaymentManager.connect(governor).setRegistry(registry.address);
      expect(await coverPaymentManager.connect(deployer).registry()).to.equal(registry.address);
    });

    it("starts with correct registry", async () => {
      expect(await coverPaymentManager.connect(deployer).registry()).to.equal(registry.address);
    });

    it("starts with correct scp", async () => {
      expect(await coverPaymentManager.connect(deployer).scp()).to.equal(scp.address);
    });

    it("starts with correct solace", async () => {
        expect(await coverPaymentManager.connect(deployer).solace()).to.equal(solace.address);
    });

    it("starts with correct premium pool", async () => {
        expect(await coverPaymentManager.connect(deployer).premiumPool()).to.equal(premiumPool.address);
    });

    it("cannot be set by non governance", async () => {
      await expect(coverPaymentManager.connect(deployer).setRegistry(registry2.address)).to.revertedWith("!governance");
    });

    it("reverts for zero address registry", async () => {
      await expect(coverPaymentManager.connect(governor).setRegistry(ZERO_ADDRESS)).to.revertedWith("zero address registry");
    });

    it("reverts for zero address scp", async () => {
      await expect(coverPaymentManager.connect(governor).setRegistry(registry2.address)).to.revertedWith("zero address scp");
      await registry2.connect(governor).set(["scp"], [scp.address]);
    });

    it("reverts for zero address solace", async () => {
      await expect(coverPaymentManager.connect(governor).setRegistry(registry2.address)).to.revertedWith("zero address solace");
      await registry2.connect(governor).set(["solace"], [solace.address]);
    });

    it("reverts for zero address premium pool", async () => {
        await expect(coverPaymentManager.connect(governor).setRegistry(registry2.address)).to.revertedWith("zero address premium pool");
        await registry2.connect(governor).set(["premiumPool"], [premiumPool.address]);
    });

    it("governance can set registry", async () => {
      await registry2.connect(governor).set(["scp"], [scp.address]);
      let tx = await coverPaymentManager.connect(governor).setRegistry(registry2.address);
      await expect(tx).emit(coverPaymentManager, "RegistrySet").withArgs(registry2.address);
      expect(await coverPaymentManager.connect(deployer).registry()).to.equal(registry2.address);
      expect(await coverPaymentManager.connect(deployer).scp()).to.equal(scp.address);
    });
  });

  describe.only("setTokenInfo", function () {
    let tokens: any[];
    let tokensWithZeroAddress: any[];

    before(async function () {
        tokens = [
            {'token': dai.address, 'accepted': true, 'permittable': false, 'refundable': true, 'stable': true},  // dai
            {'token': usdc.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': true},  // usdc
            {'token': frax.address, 'accepted': true, 'permittable': false, 'refundable': true, 'stable': true}, // frax
            {'token': fei.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': true},   // fei
            {'token': solace.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': false},   // solace
        ];

        tokensWithZeroAddress = [
            {'token': ZERO_ADDRESS, 'accepted': true, 'permittable': false, 'refundable': true, 'stable': true},  // invalid token
            {'token': usdc.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': true},  // usdc
            {'token': frax.address, 'accepted': true, 'permittable': false, 'refundable': true, 'stable': true}, // frax
            {'token': fei.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': true},   // fei
            {'token': solace.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': false},   // solace
        ];
    });

    it("starts with no token info", async function() {
        expect(await coverPaymentManager.connect(governor).tokensLength()).eq(0);
        let tokenInfo = await coverPaymentManager.connect(governor).getTokenInfo(0);
        expect(tokenInfo.token).eq(ZERO_ADDRESS);
        expect(tokenInfo.accepted).eq(false);
        expect(tokenInfo.permittable).eq(false);
        expect(tokenInfo.refundable).eq(false);
        expect(tokenInfo.stable).eq(false);
    });

    it("non governance cannot set token info", async function() {
        await expect(coverPaymentManager.connect(user1).setTokenInfo(tokens)).revertedWith("!governance");
    });

    it("cannot set with zero address token info", async function() {
        await expect(coverPaymentManager.connect(governor).setTokenInfo(tokensWithZeroAddress)).revertedWith("zero address token");
    });

    it("can set token info", async function() {
        let tx = await coverPaymentManager.connect(governor).setTokenInfo(tokens);
        for (let i = 0; i < tokens.length; i++) {
            await expect(tx).to
            .emit(coverPaymentManager, "TokenInfoSet")
            .withArgs(
                 tokens[i].token,
                 tokens[i].accepted, 
                 tokens[i].permittable,
                 tokens[i].refundable,
                 tokens[i].stable);
        }
        expect(await coverPaymentManager.connect(governor).tokensLength()).eq(tokens.length);

        // dai
        const daiToken = await coverPaymentManager.connect(governor).getTokenInfo(0);
        expect(daiToken.token).eq(tokens[0].token);
        expect(daiToken.accepted).eq(tokens[0].accepted);
        expect(daiToken.permittable).eq(tokens[0].permittable);
        expect(daiToken.refundable).eq(tokens[0].refundable);
        expect(daiToken.stable).eq(tokens[0].stable);

        // usdc
        let usdcToken = await coverPaymentManager.connect(governor).getTokenInfo(1);
        expect(usdcToken.token).eq(tokens[1].token);
        expect(usdcToken.accepted).eq(tokens[1].accepted);
        expect(usdcToken.permittable).eq(tokens[1].permittable);
        expect(usdcToken.refundable).eq(tokens[1].refundable);
        expect(usdcToken.stable).eq(tokens[1].stable);

        // frax
        let fraxToken = await coverPaymentManager.connect(governor).getTokenInfo(2);
        expect(fraxToken.token).eq(tokens[2].token);
        expect(fraxToken.accepted).eq(tokens[2].accepted);
        expect(fraxToken.permittable).eq(tokens[2].permittable);
        expect(fraxToken.refundable).eq(tokens[2].refundable);
        expect(fraxToken.stable).eq(tokens[2].stable);

        // fei
        let feiToken = await coverPaymentManager.connect(governor).getTokenInfo(3);
        expect(feiToken.token).eq(tokens[3].token);
        expect(feiToken.accepted).eq(tokens[3].accepted);
        expect(feiToken.permittable).eq(tokens[3].permittable);
        expect(feiToken.refundable).eq(tokens[3].refundable);
        expect(feiToken.stable).eq(tokens[3].stable);

        // solace
        let solaceToken = await coverPaymentManager.connect(governor).getTokenInfo(4);
        expect(solaceToken.token).eq(tokens[4].token);
        expect(solaceToken.accepted).eq(tokens[4].accepted);
        expect(solaceToken.permittable).eq(tokens[4].permittable);
        expect(solaceToken.refundable).eq(tokens[4].refundable);
        expect(solaceToken.stable).eq(tokens[4].stable);
    });

    it("do not increase token info length for duplicates", async function() {
        let tx = await coverPaymentManager.connect(governor).setTokenInfo(tokens);
        for (let i = 0; i < tokens.length; i++) {
            await expect(tx).to
            .emit(coverPaymentManager, "TokenInfoSet")
            .withArgs(
                 tokens[i].token,
                 tokens[i].accepted, 
                 tokens[i].permittable,
                 tokens[i].refundable,
                 tokens[i].stable);
        }
        expect(await coverPaymentManager.connect(governor).tokensLength()).eq(tokens.length);
    });
  });

  describe.only("depositStable", function () {
    it("starts with no deposits", async function () {
      expect(await scp.balanceOf(user1.address)).eq(0);
      expect(await scp.balanceOfNonRefundable(user1.address)).eq(0);
    });

    it("cannot deposit unaccepted token", async function () {
      await expect(coverPaymentManager.connect(user1).depositStable(weth.address, user1.address, 0)).to.be.revertedWith("token not accepted");
    });

    it("cannot deposit non-stable token", async function () {
        await expect(coverPaymentManager.connect(user1).depositStable(solace.address, user1.address, 0)).to.be.revertedWith("token not stable");
    });

    it("cannot deposit with insufficient balance", async function () {
      await expect(coverPaymentManager.connect(user1).depositStable(dai.address, user1.address, 1)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("cannot deposit with insufficient allowance", async function () {
      await dai.mintToken(user1.address, ONE_ETHER.mul(1000));
      await expect(coverPaymentManager.connect(user1).depositStable(dai.address, user1.address, 1)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });

    it("cannot deposit if coverPaymentManager is not an scp mover", async function () {
      await dai.connect(user1).approve(coverPaymentManager.address, constants.MaxUint256);
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address],[false]);
      await expect(coverPaymentManager.connect(user1).depositStable(dai.address, user1.address, 1)).to.be.revertedWith("!scp mover");
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address],[true]);
    });

    it("can deposit", async function () {
      await usdc.connect(user2).mint();
      await usdc.connect(user2).approve(coverPaymentManager.address, constants.MaxUint256);

      let depositAmount1 = ONE_ETHER.mul(10);
      let depositAmount2 = ONE_USDC.mul(20);
      let depositAmount3 = ONE_USDC.mul(30);
      let depositAmount4 = ONE_USDC.mul(40);

      let depositValue12 = ONE_ETHER.mul(30);
      let depositValue123 = ONE_ETHER.mul(60);
      let depositValue1234 = ONE_ETHER.mul(100);
      let depositValue3 = ONE_ETHER.mul(30);
      let depositValue34 = ONE_ETHER.mul(70);

      // tx1: user1 deposits dai for user2
      let daiBal1 = await dai.balanceOf(user1.address);
      let tx1 = await coverPaymentManager.connect(user1).depositStable(dai.address, user2.address, depositAmount1);
      let daiBal2 = await dai.balanceOf(user1.address);
      expect(daiBal1.sub(daiBal2)).eq(depositAmount1);
      await expect(tx1).to.emit(coverPaymentManager, "TokenDeposited").withArgs(dai.address, user1.address, user2.address, depositAmount1);
      expect(await scp.balanceOf(user1.address)).eq(0);
      expect(await scp.balanceOf(user2.address)).eq(depositAmount1);
      expect(await scp.balanceOfNonRefundable(user1.address)).eq(0);
      expect(await scp.balanceOfNonRefundable(user2.address)).eq(0);
      expect(await dai.balanceOf(premiumPool.address)).eq(depositAmount1);

      // tx2: user2 deposits usdc for user2
      let usdcBal1 = await usdc.balanceOf(user2.address);
      let tx2 = await coverPaymentManager.connect(user2).depositStable(usdc.address, user2.address, depositAmount2);
      let usdcBal2 = await usdc.balanceOf(user2.address);
      expect(usdcBal1.sub(usdcBal2)).eq(depositAmount2);
      await expect(tx2).to.emit(coverPaymentManager, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount2);
      expect(await scp.balanceOf(user1.address)).eq(0);
      expect(await scp.balanceOf(user2.address)).eq(depositValue12);
      expect(await scp.balanceOfNonRefundable(user2.address)).eq(0);
      expect(await usdc.balanceOf(premiumPool.address)).eq(depositAmount2);

      // tx3: user2 deposits usdc for users
      await coverPaymentManager
        .connect(governor)
        .setTokenInfo([{'token': usdc.address, 'accepted': true, 'permittable': true, 'refundable': false, 'stable': true}]);

      let tx3 = await coverPaymentManager.connect(user2).depositStable(usdc.address, user2.address, depositAmount3);
      let usdcBal3 = await usdc.balanceOf(user2.address);
      expect(usdcBal2.sub(usdcBal3)).eq(depositAmount3);
      await expect(tx3).to.emit(coverPaymentManager, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount3);
      expect(await scp.balanceOf(user2.address)).eq(depositValue123);
      expect(await scp.balanceOfNonRefundable(user2.address)).eq(depositValue3);
      expect(await usdc.balanceOf(premiumPool.address)).eq(depositAmount2.add(depositAmount3));

      // tx4: user2 deposits usdc for user2
      let tx4 = await coverPaymentManager.connect(user2).depositStable(usdc.address, user2.address, depositAmount4);
      let usdcBal4 = await usdc.balanceOf(user2.address);
      expect(usdcBal3.sub(usdcBal4)).eq(depositAmount4);
      await expect(tx4).to.emit(coverPaymentManager, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount4);
      expect(await scp.balanceOf(user2.address)).eq(depositValue1234);
      expect(await scp.balanceOfNonRefundable(user2.address)).eq(depositValue34);
      expect(await usdc.balanceOf(premiumPool.address)).eq(depositAmount2.add(depositAmount3).add(depositAmount4));

      await coverPaymentManager
      .connect(governor)
      .setTokenInfo([{'token': usdc.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': true}]);
    });

    it("can deposit many via multicall", async function () {
      await dai.connect(user2).mint();
      await dai.connect(user2).approve(coverPaymentManager.address, constants.MaxUint256);
   
      // user1 balances
      let scpBal11 = await scp.balanceOf(user1.address);
      let daiBal11 = await dai.balanceOf(user1.address);
      let usdcBal11 = await usdc.balanceOf(user1.address);
      
      // user2 balances
      let scpBal12 = await scp.balanceOf(user2.address);
      let daiBal12 = await dai.balanceOf(user2.address);
      let usdcBal12 = await usdc.balanceOf(user2.address);
      
      let depositAmount1 = ONE_ETHER.mul(10);
      let depositAmount2 = ONE_USDC.mul(20);
      let depositValue1 = ONE_ETHER.mul(10);
      let depositValue2 = ONE_ETHER.mul(20);
     
      let tx = await coverPaymentManager.connect(user2).multicall([
        `${DEPOSIT_SIGHASH}${toAbiEncoded(dai.address)}${toAbiEncoded(user1.address)}${toAbiEncoded(depositAmount1)}`,
        `${DEPOSIT_SIGHASH}${toAbiEncoded(usdc.address)}${toAbiEncoded(user2.address)}${toAbiEncoded(depositAmount2)}`,
      ]);

      await expect(tx).to.emit(coverPaymentManager, "TokenDeposited").withArgs(dai.address, user2.address, user1.address, depositAmount1);
      await expect(tx).to.emit(coverPaymentManager, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount2);
      let scdBal21 = await scp.balanceOf(user1.address);
      let daiBal21 = await dai.balanceOf(user1.address);
      let usdcBal21 = await usdc.balanceOf(user1.address);
      let scdBal22 = await scp.balanceOf(user2.address);
      let daiBal22 = await dai.balanceOf(user2.address);
      let usdcBal22 = await usdc.balanceOf(user2.address);
      expect(scdBal21.sub(scpBal11)).eq(depositValue1);
      expect(daiBal21.sub(daiBal11)).eq(0);
      expect(usdcBal21.sub(usdcBal11)).eq(0);
      expect(scdBal22.sub(scpBal12)).eq(depositValue2);
      expect(daiBal22.sub(daiBal12)).eq(depositAmount1.mul(-1));
      expect(usdcBal22.sub(usdcBal12)).eq(depositAmount2.mul(-1));
    });
  });

  describe.only("depositSignedStable", function () {
    let tokens: any[];

    before("redeploy scp and coverPaymentManager", async function () {
      tokens = [
            {'token': dai.address, 'accepted': true, 'permittable': false, 'refundable': true, 'stable': true},  // dai
            {'token': usdc.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': true},  // usdc
            {'token': frax.address, 'accepted': true, 'permittable': false, 'refundable': true, 'stable': true}, // frax
            {'token': fei.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': true},   // fei
            {'token': solace.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': false},   // solace
      ];

      // deploy scp
      scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
      await registry.connect(governor).set(["scp"], [scp.address]);

      // deploy cover payment manager
      await registry.connect(governor).set(["premiumPool"], [premiumPool2.address]);
      coverPaymentManager = (await deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])) as CoverPaymentManager;
      expect( await coverPaymentManager.connect(governor).premiumPool()).eq(premiumPool2.address);

      // set tokens
      await coverPaymentManager.connect(governor).setTokenInfo(tokens);
    });

    it("starts with no deposits", async function () {
      expect(await scp.balanceOf(user1.address)).eq(0);
      expect(await scp.balanceOfNonRefundable(user1.address)).eq(0);
    });

    it("cannot depositSigned unaccepted token", async function () {
      let { v, r, s } = await getERC20PermitSignature(user1, coverPaymentManager.address, weth, ONE_ETHER);
      await expect(coverPaymentManager.connect(user1).depositSignedStable(weth.address, user1.address, ONE_ETHER, DEADLINE, v, r, s)).to.be.revertedWith("token not accepted");
    });

    it("cannot depositSigned non-stable token", async function () {
        let { v, r, s } = await getERC20PermitSignature(user1, coverPaymentManager.address, solace, ONE_ETHER);
        await expect(coverPaymentManager.connect(user1).depositSignedStable(solace.address, user1.address, ONE_ETHER, DEADLINE, v, r, s)).to.be.revertedWith("token not stable");
    });

    it("cannot depositSigned unpermittable token", async function () {
      let { v, r, s } = await getERC20PermitSignature(user1, coverPaymentManager.address, weth, ONE_ETHER);
      await expect(coverPaymentManager.connect(user1).depositSignedStable(dai.address, user1.address, ONE_ETHER, DEADLINE, v, r, s)).to.be.revertedWith("token not permittable");
    });

    it("cannot depositSigned with insufficient balance", async function () {
      let { v, r, s } = await getERC20PermitSignature(user1, coverPaymentManager.address, usdc, ONE_USDC);
      await expect(coverPaymentManager.connect(user1).depositSignedStable(usdc.address, user1.address, ONE_USDC, DEADLINE, v, r, s)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("cannot depositSigned with invalid permit", async function () {
      await dai.mintToken(user1.address, ONE_ETHER.mul(1000));
      let { v, r, s } = await getERC20PermitSignature(user1, coverPaymentManager.address, usdc, ONE_USDC);
      await expect(coverPaymentManager.connect(user1).depositSignedStable(usdc.address, user1.address, ONE_USDC, DEADLINE, v+1, r, s)).to.be.reverted;
    });

    it("cannot deposit if coverPaymentManager is not an scp mover", async function () {
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address],[false]);
      let { v, r, s } = await getERC20PermitSignature(user2, coverPaymentManager.address, usdc, ONE_USDC);
      await expect(coverPaymentManager.connect(user2).depositSignedStable(usdc.address, user2.address, ONE_USDC, DEADLINE, v, r, s)).to.be.revertedWith("!scp mover");
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address],[true]);
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

      // tx1: user2 deposits depositAmount1 for user2
      let feiBal1 = await fei.balanceOf(user2.address);
      var { v, r, s } = await getERC20PermitSignature(user2, coverPaymentManager.address, fei, depositAmount1);
      let tx1 = await coverPaymentManager.connect(user2).depositSignedStable(fei.address, user2.address, depositAmount1, DEADLINE, v, r, s);
      let feiBal2 = await fei.balanceOf(user2.address);
      expect(feiBal1.sub(feiBal2)).eq(depositAmount1);
      await expect(tx1).to.emit(coverPaymentManager, "TokenDeposited").withArgs(fei.address, user2.address, user2.address, depositAmount1);
      expect(await scp.balanceOf(user1.address)).eq(0);
      expect(await scp.balanceOf(user2.address)).eq(depositAmount1);
      expect(await scp.balanceOfNonRefundable(user1.address)).eq(0);
      expect(await scp.balanceOfNonRefundable(user2.address)).eq(0);
      expect(await fei.balanceOf(premiumPool2.address)).eq(depositAmount1);

      // tx2: user2 deposits depositAmount2 for user2
      let usdcBal1 = await usdc.balanceOf(user2.address);
      var { v, r, s } = await getERC20PermitSignature(user2, coverPaymentManager.address, usdc, depositAmount2);
      let tx2 = await coverPaymentManager.connect(user2).depositSignedStable(usdc.address, user2.address, depositAmount2, DEADLINE, v, r, s);
      let usdcBal2 = await usdc.balanceOf(user2.address);
      expect(usdcBal1.sub(usdcBal2)).eq(depositAmount2);
      await expect(tx2).to.emit(coverPaymentManager, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount2);
      expect(await scp.balanceOf(user1.address)).eq(0);
      expect(await scp.balanceOf(user2.address)).eq(depositValue12);
      expect(await scp.balanceOfNonRefundable(user2.address)).eq(0);
      expect(await usdc.balanceOf(premiumPool2.address)).eq(depositAmount2);

      // tx3: user2 deposits depositAmount3 for user2
      await coverPaymentManager
      .connect(governor)
      .setTokenInfo([{'token': usdc.address, 'accepted': true, 'permittable': true, 'refundable': false, 'stable': true}]);

      var { v, r, s } = await getERC20PermitSignature(user2, coverPaymentManager.address, usdc, depositAmount3);
      let tx3 = await coverPaymentManager.connect(user2).depositSignedStable(usdc.address, user2.address, depositAmount3, DEADLINE, v, r, s);
      let usdcBal3 = await usdc.balanceOf(user2.address);
      expect(usdcBal2.sub(usdcBal3)).eq(depositAmount3);
      await expect(tx3).to.emit(coverPaymentManager, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount3);
      expect(await scp.balanceOf(user2.address)).eq(depositValue123);
      expect(await scp.balanceOfNonRefundable(user2.address)).eq(depositValue3);
      expect(await usdc.balanceOf(premiumPool2.address)).eq(depositAmount2.add(depositAmount3));

      // tx4: user2 deposits depositAmount4 for user2
      var { v, r, s } = await getERC20PermitSignature(user2, coverPaymentManager.address, usdc, depositAmount4);
      let tx4 = await coverPaymentManager.connect(user2).depositSignedStable(usdc.address, user2.address, depositAmount4, DEADLINE, v, r, s);
      let usdcBal4 = await usdc.balanceOf(user2.address);
      expect(usdcBal3.sub(usdcBal4)).eq(depositAmount4);
      await expect(tx4).to.emit(coverPaymentManager, "TokenDeposited").withArgs(usdc.address, user2.address, user2.address, depositAmount4);
      expect(await scp.balanceOf(user2.address)).eq(depositValue1234);
      expect(await scp.balanceOfNonRefundable(user2.address)).eq(depositValue34);
      expect(await usdc.balanceOf(premiumPool2.address)).eq(depositAmount2.add(depositAmount3).add(depositAmount4))
    });
  });

  describe.only("depositNonStable", function () {
    let priceSignature1: string;
    let priceSignature2: string;
    let priceSignature3: string;
    let invalidPriceSignature: string;
    let SOLACE_PRICE_1 = ONE_ETHER; // 1$
    let SOLACE_PRICE_2 = ONE_ETHER.mul(2); // 2$
    let SOLACE_PRICE_3 = ONE_ETHER.div(100); // 0.01$
    let tokens: any[];

    before("redeploy scp and coverPaymentManager", async function () {
      tokens = [
            {'token': dai.address, 'accepted': true, 'permittable': false, 'refundable': true, 'stable': true},  // dai
            {'token': solace.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': false},   // solace
      ];

      // deploy scp
      scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
      await registry.connect(governor).set(["scp"], [scp.address]);

      // deploy cover payment manager
      await registry.connect(governor).set(["premiumPool"], [premiumPool3.address]);
      coverPaymentManager = (await deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])) as CoverPaymentManager;
      expect( await coverPaymentManager.connect(governor).premiumPool()).eq(premiumPool3.address);

      // set tokens
      await coverPaymentManager.connect(governor).setTokenInfo(tokens);

      // create price signatures
      await coverPaymentManager.connect(governor).addPriceSigner(governor.address);
      expect(await coverPaymentManager.connect(governor).isPriceSigner(governor.address)).eq(true);

      const digest1 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, solace.address, SOLACE_PRICE_1, DEADLINE, TYPEHASH);
      priceSignature1 = assembleSignature(sign(digest1, Buffer.from(governor.privateKey.slice(2), "hex")));

      const digest2 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, solace.address, SOLACE_PRICE_2, DEADLINE, TYPEHASH);
      priceSignature2 = assembleSignature(sign(digest2, Buffer.from(governor.privateKey.slice(2), "hex")));

      const digest3 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, solace.address, SOLACE_PRICE_3, DEADLINE, TYPEHASH);
      priceSignature3 = assembleSignature(sign(digest3, Buffer.from(governor.privateKey.slice(2), "hex")));

      const digest4 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, weth.address, SOLACE_PRICE_3, DEADLINE, TYPEHASH);
      invalidPriceSignature = assembleSignature(sign(digest4, Buffer.from(governor.privateKey.slice(2), "hex")));
    });

    it("starts with no deposits", async function () {
        expect(await scp.balanceOf(user3.address)).eq(0);
        expect(await scp.balanceOfNonRefundable(user3.address)).eq(0);
    });

    it("cannot deposit unaccepted token", async function () {
      await expect(coverPaymentManager.connect(user3).depositNonStable(weth.address, user3.address, 0, SOLACE_PRICE_1, DEADLINE, priceSignature1)).to.be.revertedWith("token not accepted");
    });

    it("cannot deposit stable token", async function () {
        await expect(coverPaymentManager.connect(user3).depositNonStable(dai.address, user3.address, 0, SOLACE_PRICE_1, DEADLINE, priceSignature1)).to.be.revertedWith("token not non-stable");
    });

    it("cannot deposit invalid price", async function () {
        await expect(coverPaymentManager.connect(user3).depositNonStable(solace.address, user3.address, 0, SOLACE_PRICE_1, DEADLINE, invalidPriceSignature)).to.be.revertedWith("invalid token price");
    });

    it("cannot deposit with insufficient balance", async function () {
      await expect(coverPaymentManager.connect(user3).depositNonStable(solace.address, user3.address, 1, SOLACE_PRICE_1, DEADLINE, priceSignature1)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("cannot deposit with insufficient allowance", async function () {
      await solace.mintToken(user3.address, ONE_ETHER.mul(1000));
      await expect(coverPaymentManager.connect(user3).depositNonStable(solace.address, user3.address, 1, SOLACE_PRICE_1, DEADLINE, priceSignature1)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });

    it("cannot deposit if coverPaymentManager is not an scp mover", async function () {
      await solace.connect(user3).approve(coverPaymentManager.address, constants.MaxUint256);
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address],[false]);
      await expect(coverPaymentManager.connect(user3).depositNonStable(solace.address, user3.address, 1, SOLACE_PRICE_1, DEADLINE, priceSignature1)).to.be.revertedWith("!scp mover");
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address],[true]);
    });

    it("can deposit", async function() {
        // check user3 solace balance(1000 SOLACE)
        expect(await solace.connect(user3).balanceOf(user3.address)).eq(ONE_ETHER.mul(1000));

        // tx1: The SOLACE price is $1. 10 SOLACE => 10 SCP
        const solaceBalance1 = ONE_ETHER.mul(1000);
        const depositAmount1 = ONE_ETHER.mul(10); // 10 SOLACE
        const scpAmount1 = ONE_ETHER.mul(10); // 10 SCP
        let tx1 = await coverPaymentManager.connect(user3).depositNonStable(solace.address, user3.address, depositAmount1, SOLACE_PRICE_1, DEADLINE, priceSignature1);
        await expect(tx1).to.emit(coverPaymentManager, "TokenDeposited").withArgs(solace.address, user3.address, user3.address, depositAmount1);
        expect(await scp.balanceOf(user3.address)).eq(scpAmount1);
        expect(await solace.balanceOf(user3.address)).eq(solaceBalance1.sub(depositAmount1));
        expect(await solace.balanceOf(premiumPool3.address)).eq(depositAmount1);

        // tx2: The SOLACE price is $2. 10 SOLACE => 20 SCP
        const solaceBalance2 = await solace.connect(user3).balanceOf(user3.address);
        const depositAmount2 = ONE_ETHER.mul(10); // 10 SOLACE
        const scpAmount2 = ONE_ETHER.mul(20); // 20 SCP
        let tx2 = await coverPaymentManager.connect(user3).depositNonStable(solace.address, user3.address, depositAmount2, SOLACE_PRICE_2, DEADLINE, priceSignature2);
        await expect(tx2).to.emit(coverPaymentManager, "TokenDeposited").withArgs(solace.address, user3.address, user3.address, depositAmount2);
        expect(await scp.balanceOf(user3.address)).eq(scpAmount1.add(scpAmount2));
        expect(await solace.balanceOf(user3.address)).eq(solaceBalance2.sub(depositAmount2));
        expect(await solace.balanceOf(premiumPool3.address)).eq(depositAmount1.add(depositAmount2));

        // tx3: The SOLACE price is $0.01. 100 SOLACE => 1 SCP
        const solaceBalance3 = await solace.connect(user3).balanceOf(user3.address);
        const depositAmount3 = ONE_ETHER.mul(100); // 10 SOLACE
        const scpAmount3 = ONE_ETHER; // 1 SCP
        let tx3 = await coverPaymentManager.connect(user3).depositNonStable(solace.address, user3.address, depositAmount3, SOLACE_PRICE_3, DEADLINE, priceSignature3);
        await expect(tx3).to.emit(coverPaymentManager, "TokenDeposited").withArgs(solace.address, user3.address, user3.address, depositAmount3);
        expect(await scp.balanceOf(user3.address)).eq(scpAmount1.add(scpAmount2).add(scpAmount3));
        expect(await solace.balanceOf(user3.address)).eq(solaceBalance3.sub(depositAmount3));
        expect(await solace.balanceOf(premiumPool3.address)).eq(depositAmount1.add(depositAmount2).add(depositAmount3));
    });
  });

  describe.only("withdraw", function () {
    let priceSignature1: string;
    let priceSignature2: string;
    let priceSignature3: string;
    let invalidPriceSignature: string;
    let SOLACE_PRICE_1 = ONE_ETHER; // 1$
    let SOLACE_PRICE_2 = ONE_ETHER.mul(2); // 2$
    let SOLACE_PRICE_3 = ONE_ETHER.div(100); // 0.01$
    let tokens: any[];

    before("redeploy scp and coverPaymentManager", async function () {
      tokens = [
            {'token': solace.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': false},   // solace
      ];

      // deploy scp
      scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
      await registry.connect(governor).set(["scp"], [scp.address]);

      // deploy cover payment manager
      await registry.connect(governor).set(["premiumPool"], [premiumPool4.address]);
      coverPaymentManager = (await deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])) as CoverPaymentManager;
      expect( await coverPaymentManager.connect(governor).premiumPool()).eq(premiumPool4.address);

      // set tokens
      await coverPaymentManager.connect(governor).setTokenInfo(tokens);

      // create price signatures
      await coverPaymentManager.connect(governor).addPriceSigner(governor.address);
      expect(await coverPaymentManager.connect(governor).isPriceSigner(governor.address)).eq(true);

      const digest1 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, solace.address, SOLACE_PRICE_1, DEADLINE, TYPEHASH);
      priceSignature1 = assembleSignature(sign(digest1, Buffer.from(governor.privateKey.slice(2), "hex")));

      const digest2 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, solace.address, SOLACE_PRICE_2, DEADLINE, TYPEHASH);
      priceSignature2 = assembleSignature(sign(digest2, Buffer.from(governor.privateKey.slice(2), "hex")));

      const digest3 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, solace.address, SOLACE_PRICE_3, DEADLINE, TYPEHASH);
      priceSignature3 = assembleSignature(sign(digest3, Buffer.from(governor.privateKey.slice(2), "hex")));

      const digest4 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, weth.address, SOLACE_PRICE_3, DEADLINE, TYPEHASH);
      invalidPriceSignature = assembleSignature(sign(digest4, Buffer.from(governor.privateKey.slice(2), "hex")));

      // deposit SOLACE
      await solace.connect(governor).mintToken(user3.address, ONE_ETHER.mul(1000));
      await solace.connect(user3).approve(coverPaymentManager.address, constants.MaxUint256);
      await solace.connect(user4).approve(coverPaymentManager.address, constants.MaxUint256);
     
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address],[true]);
      await coverPaymentManager.connect(user3).depositNonStable(solace.address, user4.address, ONE_ETHER.mul(100), SOLACE_PRICE_1, DEADLINE, priceSignature1);
      expect(await scp.balanceOf(user4.address)).eq(ONE_ETHER.mul(100)); // 100 SCP
      expect(await solace.balanceOf(user4.address)).eq(0); // 0 SOLACE

    });

    it("cannot withdraw zero amount", async function () {
      await expect(coverPaymentManager.connect(user4).withdraw(0, user4.address, SOLACE_PRICE_1, DEADLINE, priceSignature1)).to.be.revertedWith("zero amount withdraw");
    });

    it("cannot withdraw with invalid price", async function () {
        await expect(coverPaymentManager.connect(user4).withdraw(1, user4.address, SOLACE_PRICE_1, DEADLINE, invalidPriceSignature)).to.be.revertedWith("invalid solace price");
    });

    it("cannot withdraw if amount exceeds balance", async function () {
        let refundableBalance = await coverPaymentManager.connect(user4).getRefundableSOLACEAmount(user4.address, SOLACE_PRICE_1, DEADLINE, priceSignature1);
        await expect(coverPaymentManager.connect(user4).withdraw(refundableBalance.add(1), user4.address, SOLACE_PRICE_1, DEADLINE, priceSignature1)).to.be.revertedWith("withdraw amount exceeds balance");      
    });

    it("cannot withraw with insufficient premium pool solace balance", async function () {
        // user refundable SOLACE balance(10000 SOLACE). The SOLACE price is 0.01$.
        let refundableBalance = await coverPaymentManager.connect(user4).getRefundableSOLACEAmount(user4.address, SOLACE_PRICE_3, DEADLINE, priceSignature3);
        expect(refundableBalance).eq(ONE_ETHER.mul(10000));

        // premium pool SOLACE balance(100 SOLACE)
        let premiumPooBalance = await solace.balanceOf(premiumPool4.address);
        expect(premiumPooBalance).eq(ONE_ETHER.mul(100));

        await expect(coverPaymentManager.connect(user4).withdraw(refundableBalance, user4.address, SOLACE_PRICE_3, DEADLINE, priceSignature3)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("cannot withdraw if coverPaymentManager is not an scp mover", async function () {
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address],[false]);
      await expect(coverPaymentManager.connect(user4).withdraw(1, user4.address, SOLACE_PRICE_1, DEADLINE, priceSignature1)).to.be.revertedWith("!scp mover");
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address],[true]);
    });

    it("can withdraw", async function() {
        await solace.connect(premiumPool4).approve(coverPaymentManager.address, constants.MaxInt256);

        // check user4 solace balance(0 SOLACE - 100 SCP)
        expect(await scp.balanceOf(user4.address)).eq(ONE_ETHER.mul(100));
        expect(await solace.connect(user4).balanceOf(user4.address)).eq(0);
        expect(await solace.balanceOf(premiumPool4.address)).eq(ONE_ETHER.mul(100));

        const premiumPoolBalance = await solace.balanceOf(premiumPool4.address);
        
        // tx1: The SOLACE price is 1$. 10 SOLACE => 10 SCP
        const solaceBalance1 = await solace.connect(user4).balanceOf(user4.address); // 0 SOLACE
        const scpBalance1 = await scp.connect(user4).balanceOf(user4.address); // 100 SCP

        const scpAmount1 = ONE_ETHER.mul(10); // 10 SCP
        const withdrawAmount1 = ONE_ETHER.mul(10); // 10 SOLACE
        let tx1 = await coverPaymentManager.connect(user4).withdraw(withdrawAmount1, user4.address, SOLACE_PRICE_1, DEADLINE, priceSignature1);
        await expect(tx1).to.emit(coverPaymentManager, "TokenWithdrawn").withArgs(user4.address, user4.address, withdrawAmount1);
        expect(await scp.balanceOf(user4.address)).eq(scpBalance1.sub(scpAmount1));
        expect(await solace.balanceOf(user4.address)).eq(solaceBalance1.add(withdrawAmount1));
        expect(await solace.balanceOf(premiumPool4.address)).eq(premiumPoolBalance.sub(withdrawAmount1));

        // tx2: The SOLACE price is $2. 10 SOLACE => 20 SCP
        const solaceBalance2 = await solace.connect(user4).balanceOf(user4.address);
        const scpBalance2 = await scp.connect(user4).balanceOf(user4.address);

        const withdrawAmount2 = ONE_ETHER.mul(10); // 10 SOLACE
        const scpAmount2 = ONE_ETHER.mul(20); // 20 SCP
        let tx2 = await coverPaymentManager.connect(user4).withdraw(withdrawAmount2, user4.address, SOLACE_PRICE_2, DEADLINE, priceSignature2);
        await expect(tx2).to.emit(coverPaymentManager, "TokenWithdrawn").withArgs(user4.address, user4.address, withdrawAmount2);
        expect(await scp.balanceOf(user4.address)).eq(scpBalance2.sub(scpAmount2));
        expect(await solace.balanceOf(user4.address)).eq(solaceBalance2.add(withdrawAmount2));
        expect(await solace.balanceOf(premiumPool4.address)).eq(premiumPoolBalance.sub(withdrawAmount1).sub(withdrawAmount2));

        // tx3: The SOLACE price is $0.01. 10 SOLACE => 0.1 SCP
        const solaceBalance3 = await solace.connect(user4).balanceOf(user4.address);
        const scpBalance3 = await scp.connect(user4).balanceOf(user4.address);

        const withdrawAmount3 = ONE_ETHER.mul(10); // 10 SOLACE
        const scpAmount3 = ONE_ETHER.div(10); // 0.1 SCP
        let tx3 = await coverPaymentManager.connect(user4).withdraw(withdrawAmount3, user4.address, SOLACE_PRICE_3, DEADLINE, priceSignature3);
        await expect(tx3).to.emit(coverPaymentManager, "TokenWithdrawn").withArgs(user4.address, user4.address, withdrawAmount3);
        expect(await scp.balanceOf(user4.address)).eq(scpBalance3.sub(scpAmount3));
        expect(await solace.balanceOf(user4.address)).eq(solaceBalance3.add(withdrawAmount3));
        expect(await solace.balanceOf(premiumPool4.address)).eq(premiumPoolBalance.sub(withdrawAmount1).sub(withdrawAmount2).sub(withdrawAmount3));
    });
  });
})
