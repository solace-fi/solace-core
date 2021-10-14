import hardhat from "hardhat";
import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet } from "ethers";
import { Contract } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";
import { encodePath } from "./utilities/path";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Treasury, MockErc20, Weth9, Registry, PolicyManager, Vault, GasGriefer } from "../typechain";

describe("Treasury", function() {
  let artifacts: ArtifactImports;
  // users
  let deployer: SignerWithAddress;
  let governor: SignerWithAddress;
  let liquidityProvider: SignerWithAddress;
  let mockPolicy: SignerWithAddress;
  let user: SignerWithAddress;
  let randAddress: SignerWithAddress;
  let mockProduct: SignerWithAddress;

  // solace contracts
  let solace: Solace;
  let treasury: Treasury;
  let weth: Weth9;
  let registry: Registry;
  let policyManager: PolicyManager;
  let mockToken1: MockErc20; // no path
  let mockToken2: MockErc20; // single pool path
  let mockToken3: MockErc20; // multi pool path
  let mockToken4: MockErc20; // invalid path

  let wethPath: string;
  let mockToken2Path: string;
  let mockToken3Path: string;
  let mockToken4Path: string;
  let defaultPath: string = "0x";

  // uniswap contracts
  let uniswapFactory: Contract;
  let uniswapRouter: Contract;
  let uniswapPositionManager: Contract;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const ONE_HUNDRED = BN.from("100");
  const ONE_ETHER = BN.from("1000000000000000000");
  const TEN_ETHER = BN.from("10000000000000000000");
  const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");

  before(async function() {
    //[deployer, governor, liquidityProvider, mockPolicy, user, randAddress, mockProduct] = provider.getWallets();
    [deployer, governor, liquidityProvider, mockPolicy, user, randAddress, mockProduct] = await hardhat.ethers.getSigners();
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    await registry.connect(governor).setWeth(weth.address);

    // deploy solace
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;


    // deploy mock token 1
    mockToken1 = (await deployContract(deployer, artifacts.MockERC20, ["Mock Token 1", "MKT1", ONE_MILLION_ETHER])) as MockErc20;

    // deploy mock token 2
    mockToken2 = (await deployContract(deployer, artifacts.MockERC20, ["Mock Token 2", "MKT2", ONE_MILLION_ETHER])) as MockErc20;

    // deploy mock token 3
    mockToken3 = (await deployContract(deployer, artifacts.MockERC20, ["Mock Token 3", "MKT3", ONE_MILLION_ETHER])) as MockErc20;

    // deploy mock token 4
    mockToken4 = (await deployContract(deployer, artifacts.MockERC20, ["Mock Token 4", "MKT4", ONE_MILLION_ETHER])) as MockErc20;

    // deploy uniswap factory
    uniswapFactory = (await deployContract(deployer, artifacts.UniswapV3Factory)) as Contract;

    // deploy uniswap router
    uniswapRouter = (await deployContract(deployer, artifacts.SwapRouter, [uniswapFactory.address, weth.address])) as Contract;

    // deploy uniswap position manager
    uniswapPositionManager = (await deployContract(deployer, artifacts.NonfungiblePositionManager, [uniswapFactory.address, weth.address, ZERO_ADDRESS])) as Contract;

    // deploy treasury contract
    treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
    await registry.connect(governor).setTreasury(treasury.address);

    // deploy policy manager
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
    await registry.connect(governor).setPolicyManager(policyManager.address);

    // transfer tokens
    await solace.connect(governor).addMinter(governor.address);
    await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    await weth.connect(liquidityProvider).deposit({ value: TEN_ETHER });
    await solace.connect(governor).transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken1.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken2.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken3.transfer(liquidityProvider.address, TEN_ETHER);
    await mockToken4.transfer(liquidityProvider.address, TEN_ETHER);
    await weth.connect(mockPolicy).deposit({ value: ONE_ETHER });
    await solace.connect(governor).transfer(mockPolicy.address, ONE_ETHER);
    await mockToken1.transfer(mockPolicy.address, ONE_ETHER);
    await mockToken2.transfer(mockPolicy.address, ONE_ETHER);
    await mockToken3.transfer(mockPolicy.address, ONE_ETHER);
    await mockToken4.transfer(mockPolicy.address, ONE_ETHER);

    // create pools
    await createPool(weth, solace, FeeAmount.MEDIUM);
    await createPool(mockToken2, solace, FeeAmount.LOW);
    await createPool(mockToken3, weth, FeeAmount.HIGH);

    // add liquidity
    await addLiquidity(liquidityProvider, weth, solace, FeeAmount.MEDIUM, ONE_ETHER);
    await addLiquidity(liquidityProvider, mockToken2, solace, FeeAmount.LOW, ONE_ETHER);
    await addLiquidity(liquidityProvider, mockToken3, weth, FeeAmount.HIGH, ONE_ETHER);

    // encode paths
    wethPath = encodePath([weth.address, solace.address], [FeeAmount.MEDIUM]);
    mockToken2Path = encodePath([mockToken2.address, solace.address], [FeeAmount.LOW]);
    mockToken3Path = encodePath([mockToken3.address, weth.address, solace.address], [FeeAmount.HIGH, FeeAmount.MEDIUM]);
    mockToken4Path = encodePath([randAddress.address, randAddress.address], [FeeAmount.MEDIUM]);
  });

  describe("deployment", function () {
    it("reverts if zero registry", async function () {
      await expect(deployContract(deployer, artifacts.Treasury, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address registry");
    });
    it("reverts if zero weth", async function () {
      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await expect(deployContract(deployer, artifacts.Treasury, [governor.address, registry2.address])).to.be.revertedWith("zero address weth");
    });
    it("routes to vault if set", async function () {
      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await registry2.connect(governor).setWeth(weth.address);
      let vault2 = (await deployContract(deployer,artifacts.Vault,[governor.address,registry.address])) as Vault;
      await registry2.connect(governor).setVault(vault2.address);
      let treasury2 = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry2.address])) as Treasury;
      expect(await treasury2.premiumRecipient(0)).to.equal(vault2.address);
      expect(await treasury2.numPremiumRecipients()).to.equal(1);
      expect(await treasury2.recipientWeight(0)).to.equal(1);
      expect(await treasury2.recipientWeight(1)).to.equal(0);
      expect(await treasury2.weightSum()).to.equal(1);
    });
    it("routes to treasury if vault not set", async function () {
      let registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      await registry2.connect(governor).setWeth(weth.address);
      let treasury2 = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry2.address])) as Treasury;
      expect(await treasury2.numPremiumRecipients()).to.equal(0);
      expect(await treasury2.weightSum()).to.equal(0);
    });
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await treasury.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function() {
      await expect(treasury.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function() {
      let tx = await treasury.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(treasury, "GovernancePending").withArgs(deployer.address);
      expect(await treasury.governance()).to.equal(governor.address);
      expect(await treasury.pendingGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async function() {
      await expect(treasury.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async function() {
      let tx = await treasury.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(treasury, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await treasury.governance()).to.equal(deployer.address);
      expect(await treasury.pendingGovernance()).to.equal(ZERO_ADDRESS);

      await treasury.connect(deployer).setPendingGovernance(governor.address);
      await treasury.connect(governor).acceptGovernance();
    });
  });

  describe("deposit", function() {
    it("can deposit solace", async function() {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await solace.connect(mockPolicy).transfer(treasury.address, depositAmount);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(depositAmount); // solace should increase
    });

    it("can deposit eth via receive", async function() {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockPolicy.sendTransaction({
        to: treasury.address,
        value: depositAmount,
        data: "0x",
      });
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(0); // shouldnt swap
      expect(balancesDiff.treasuryEth).to.equal(depositAmount); // should hold eth
    });

    it("can deposit eth via fallback", async function() {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockPolicy.sendTransaction({
        to: treasury.address,
        value: depositAmount,
        data: "0xabcd",
      });
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(0); // shouldnt swap
      expect(balancesDiff.treasuryEth).to.equal(depositAmount); // should hold eth
    });

    it("can deposit weth", async function() {
      let depositAmount = ONE_HUNDRED;
      await weth.connect(mockPolicy).deposit({ value: depositAmount });
      let balancesBefore = await getBalances(mockPolicy);
      await weth.connect(mockPolicy).transfer(treasury.address, depositAmount);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(0); // shouldnt swap
      expect(balancesDiff.treasuryWeth).to.equal(depositAmount); // should hold weth
    });

    it("can deposit other token", async function() {
      let depositAmount = ONE_HUNDRED;
      let balancesBefore = await getBalances(mockPolicy);
      await mockToken1.connect(mockPolicy).transfer(treasury.address, depositAmount);
      let balancesAfter = await getBalances(mockPolicy);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(0); // solace should not increase
      expect(balancesDiff.treasuryMock1).to.equal(depositAmount); // should hold other token
    });
  });

  describe("wrap", function () {
    it("non governor cannot wrap eth", async function() {
      await expect(treasury.connect(user).wrap(1)).to.be.revertedWith("!governance");
    });
    it("can wrap eth", async function() {
      let depositAmount = BN.from(100);
      await user.sendTransaction({to: treasury.address, value: depositAmount});
      let wrapAmount = BN.from(50);
      let balancesBefore = await getBalances(user);
      await treasury.connect(governor).wrap(wrapAmount);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(wrapAmount.mul(-1));
      expect(balancesDiff.treasuryWeth).to.equal(wrapAmount);
    });
    it("non governor cannot unwrap eth", async function() {
      await expect(treasury.connect(user).unwrap(1)).to.be.revertedWith("!governance");
    });
    it("can unwrap eth", async function() {
      let unwrapAmount = BN.from(50);
      let balancesBefore = await getBalances(user);
      await treasury.connect(governor).unwrap(unwrapAmount, { gasLimit: 60000 });
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(unwrapAmount);
      expect(balancesDiff.treasuryWeth).to.equal(unwrapAmount.mul(-1));
    });
  });

  describe("spend", function() {
    it("non governor cannot spend", async function() {
      await expect(treasury.connect(user).spend(solace.address, 100, governor.address)).to.be.revertedWith("!governance");
    });
    it("cannot spend zero address token", async function () {
      await expect(treasury.connect(governor).spend(ZERO_ADDRESS, 100, governor.address)).to.be.revertedWith("zero address token");
    });
    it("cannot spend to zero address recipient", async function () {
      await expect(treasury.connect(governor).spend(solace.address, 100, ZERO_ADDRESS)).to.be.revertedWith("zero address recipient");
    });
    it("can spend solace", async function() {
      let spendAmount = BN.from("5");
      let balancesBefore = await getBalances(user);
      let tx = await treasury.connect(governor).spend(solace.address, spendAmount, user.address);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasurySolace).to.equal(spendAmount.mul(-1));
      expect(balancesDiff.userSolace).to.equal(spendAmount);
      await expect(tx)
        .to.emit(treasury, "FundsSpent")
        .withArgs(solace.address, spendAmount, user.address);
    });
    it("can spend unswapped token", async function() {
      let spendAmount = BN.from("5");
      let balancesBefore = await getBalances(user);
      let tx = await treasury.connect(governor).spend(mockToken1.address, spendAmount, user.address);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryMock1).to.equal(spendAmount.mul(-1));
      expect(balancesDiff.userMock1).to.equal(spendAmount);
      await expect(tx)
        .to.emit(treasury, "FundsSpent")
        .withArgs(mockToken1.address, spendAmount, user.address);
    });
    it("can spend eth", async function() {
      let spendAmount = BN.from("5");
      let balancesBefore = await getBalances(user);
      let tx = await treasury.connect(governor).spend(ETH_ADDRESS, spendAmount, user.address);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(spendAmount.mul(-1));
      expect(balancesDiff.userEth).to.equal(spendAmount);
      await expect(tx)
        .to.emit(treasury, "FundsSpent")
        .withArgs(ETH_ADDRESS, spendAmount, user.address);
    });
  });

  describe("route premiums", function() {
    it("with no recipients", async function () {
      expect(await treasury.numPremiumRecipients()).to.equal(0);
      expect(await treasury.weightSum()).to.equal(0);
    });
    it("can route premiums with no recipients", async function() {
      let balancesBefore = await getBalances(user);
      let depositAmount = 100;
      let tx = await treasury.connect(user).routePremiums({ value: depositAmount });
      expect(tx).to.emit(treasury, "PremiumsRouted").withArgs(depositAmount);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(depositAmount);
    });
    it("non governor cannot set recipients", async function() {
      await expect(treasury.connect(user).setPremiumRecipients([], [1])).to.be.revertedWith("!governance");
    });
    it("validates recipients and weights", async function() {
      await expect(treasury.connect(governor).setPremiumRecipients([], [1, 2])).to.be.revertedWith("length mismatch");
      await expect(treasury.connect(governor).setPremiumRecipients([deployer.address], [0, 0])).to.be.revertedWith("1/0");
      expect(treasury.connect(governor).setPremiumRecipients(fill(16, deployer.address), fill(17, 1))).to.be.revertedWith("too many recipients");
    });
    it("can set recipients", async function() {
      let tx1 = await treasury.connect(governor).setPremiumRecipients([], [0]);
      expect(tx1).to.emit(treasury, "RecipientsSet");
      await treasury.connect(governor).setPremiumRecipients(fill(15, deployer.address), fill(16, 1));
      let tx2 = await treasury.connect(governor).setPremiumRecipients([deployer.address], [2, 3]);
      expect(tx2).to.emit(treasury, "RecipientsSet");
    });
    it("can route premiums", async function() {
      let balancesBefore = await getBalances(deployer);
      let depositAmount = 100;
      let tx1 = await treasury.connect(user).routePremiums({ value: depositAmount });
      expect(tx1).to.emit(treasury, "PremiumsRouted").withArgs(depositAmount);
      let balancesAfter = await getBalances(deployer);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(60);
      expect(balancesDiff.userEth).to.equal(40);
      let tx2 = await treasury.connect(governor).routePremiums(); // empty routing
      expect(tx2).to.emit(treasury, "PremiumsRouted").withArgs(0);
    });
    it("is safe from gas griefing", async function () {
      let gasGriefer = (await deployContract(deployer, artifacts.GasGriefer)) as GasGriefer;
      await treasury.connect(governor).setPremiumRecipients([deployer.address, gasGriefer.address], [2, 3, 7]);
      let balancesBefore = await getBalances(deployer);
      let depositAmount = 120;
      let tx = await treasury.connect(user).routePremiums({ value: depositAmount });
      let balancesAfter = await getBalances(deployer);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.userEth).to.equal(20);
      expect(await provider.getBalance(gasGriefer.address)).to.eq(0);
      expect(balancesDiff.treasuryEth).to.equal(100); // 30 + 70
      let receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.lt(300000);
      expect(await gasGriefer.acc()).to.eq(0);
      await treasury.connect(governor).routePremiums(); // empty routing
    });
  });

  describe("refund", function() {
    before(async function() {
      await registry.connect(governor).setPolicyManager(policyManager.address);
    });
    it("non product cannot refund", async function() {
      await expect(treasury.connect(mockProduct).refund(user.address, 1)).to.be.revertedWith("!product");
    });
    it("cannot refund to zero address", async function () {
      await policyManager.connect(governor).addProduct(mockProduct.address);
      await expect(treasury.connect(mockProduct).refund(ZERO_ADDRESS, 1)).to.be.revertedWith("zero address recipient");
    });
    it("product can refund in full", async function() {
      await policyManager.connect(governor).addProduct(mockProduct.address);
      let balancesBefore = await getBalances(user);
      let refundAmount = balancesBefore.treasuryEth.sub(10);
      await treasury.connect(mockProduct).refund(user.address, refundAmount);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesDiff.treasuryEth).to.equal(refundAmount.mul(-1));
      expect(balancesDiff.userEth).to.equal(refundAmount);
    });
    it("product can partially refund", async function() {
      // part 1: partial refund
      let balancesBefore = await getBalances(user);
      let totalEth = balancesBefore.treasuryEth.add(balancesBefore.treasuryWeth);
      let refundAmount = totalEth.add(10);
      await treasury.connect(mockProduct).refund(user.address, refundAmount);
      let balancesAfter = await getBalances(user);
      let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
      expect(balancesAfter.treasuryEth).to.equal(0);
      expect(balancesAfter.treasuryWeth).to.equal(0);
      expect(balancesDiff.userEth).to.equal(totalEth);
      expect(await treasury.unpaidRefunds(user.address)).to.equal(10);
      // part 2: remainder
      await deployer.sendTransaction({to: treasury.address, value: 20});
      let tx = await treasury.connect(user).withdraw();
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let balancesAfter2 = await getBalances(user);
      let balancesDiff2 = getBalancesDiff(balancesAfter2, balancesBefore);
      expect(balancesDiff2.userEth.add(gasCost)).to.equal(refundAmount);
      expect(await treasury.unpaidRefunds(user.address)).to.equal(0);
      // part 3: empty withdraw
      await treasury.connect(user).withdraw();
    });
  });

  describe("treasury with vault as a premium recipient", function () {
      let vault: Vault;

      before(async function() {
        vault = (await deployContract(deployer,artifacts.Vault,[governor.address,registry.address])) as Vault;
        await registry.connect(governor).setVault(vault.address);
        treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
        await registry.connect(governor).setTreasury(treasury.address);
        await vault.connect(governor).setRequestor(treasury.address, true);
      });

      it("vault is a premium recipient", async function() {
        expect(await treasury.premiumRecipient(0)).to.equal(vault.address);
        expect(await treasury.numPremiumRecipients()).to.equal(1);
        expect(await treasury.recipientWeight(0)).to.equal(1);
        expect(await treasury.recipientWeight(1)).to.equal(0);
        expect(await treasury.weightSum()).to.equal(1);
      });

      it("can route premiums to vault", async function() {
        let vaultAmountBefore = await provider.getBalance(vault.address);
        let depositAmount = 100;
        let tx = await treasury.connect(user).routePremiums({ value: depositAmount });
        expect(tx).to.emit(treasury, "PremiumsRouted").withArgs(depositAmount);
        let vaultAmountAfter = await provider.getBalance(vault.address);
        expect(vaultAmountAfter.sub(depositAmount)).to.equal(vaultAmountBefore);
      });

      it("can refund from vault", async function() {
        await policyManager.connect(governor).addProduct(mockProduct.address);
        let vaultAmountBefore = await provider.getBalance(vault.address);
        let userBalanceBefore = await provider.getBalance(user.address);

        let refundAmount = 100;
        await treasury.connect(mockProduct).refund(user.address, refundAmount);
        let vaultAmountAfter = await provider.getBalance(vault.address);
        expect(vaultAmountBefore.sub(refundAmount)).to.equal(vaultAmountAfter);

        let userBalanceAfter = await provider.getBalance(user.address);
        expect(userBalanceAfter.sub(refundAmount)).to.equal(userBalanceBefore);
      });
  });

  describe("weth", function () {
    it("can mint via receive", async function () {
      let bal1 = await weth.balanceOf(user.address);
      await user.sendTransaction({to: weth.address, value: 10});
      let bal2 = await weth.balanceOf(user.address);
      expect(bal2.sub(bal1)).to.equal(10);
    });
    it("can mint via fallback", async function () {
      let bal1 = await weth.balanceOf(user.address);
      await user.sendTransaction({to: weth.address, value: 10, data: "0xabcd"});
      let bal2 = await weth.balanceOf(user.address);
      expect(bal2.sub(bal1)).to.equal(10);
    });
    it("can mint via deposit", async function () {
      let bal1 = await weth.balanceOf(user.address);
      await weth.connect(user).deposit({value: 10});
      let bal2 = await weth.balanceOf(user.address);
      expect(bal2.sub(bal1)).to.equal(10);
    });
    it("can withdraw", async function () {
      let bal1 = await weth.balanceOf(user.address);
      await weth.connect(user).withdraw(10);
      let bal2 = await weth.balanceOf(user.address);
      expect(bal1.sub(bal2)).to.equal(10);
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
    let pool;
    let tx = await uniswapFactory.createPool(token0, token1, fee);
    let events = (await tx.wait()).events;
    expect(events && events.length > 0 && events[0].args && events[0].args.pool);
    if (events && events.length > 0 && events[0].args && events[0].args.pool) {
      let poolAddress = events[0].args.pool;
      pool = new Contract(poolAddress, artifacts.UniswapV3Pool.abi) as Contract;
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

  // adds liquidity to a pool
  async function addLiquidity(liquidityProvider: SignerWithAddress, tokenA: Contract, tokenB: Contract, fee: FeeAmount, amount: BigNumberish) {
    await tokenA.connect(liquidityProvider).approve(uniswapPositionManager.address, amount);
    await tokenB.connect(liquidityProvider).approve(uniswapPositionManager.address, amount);
    let [token0, token1] = sortTokens(tokenA.address, tokenB.address);
    await uniswapPositionManager.connect(liquidityProvider).mint({
      token0: token0,
      token1: token1,
      tickLower: getMinTick(TICK_SPACINGS[fee]),
      tickUpper: getMaxTick(TICK_SPACINGS[fee]),
      fee: fee,
      recipient: liquidityProvider.address,
      amount0Desired: amount,
      amount1Desired: amount,
      amount0Min: 0,
      amount1Min: 0,
      deadline: constants.MaxUint256,
    });
  }

  interface Balances {
    userSolace: BN;
    userEth: BN;
    userWeth: BN;
    userMock1: BN;
    userMock2: BN;
    userMock3: BN;
    userMock4: BN;
    treasurySolace: BN;
    treasuryEth: BN;
    treasuryWeth: BN;
    treasuryMock1: BN;
    treasuryMock2: BN;
    treasuryMock3: BN;
    treasuryMock4: BN;
  }

  async function getBalances(user: SignerWithAddress): Promise<Balances> {
    return {
      userSolace: await solace.balanceOf(user.address),
      userEth: await user.getBalance(),
      userWeth: await weth.balanceOf(user.address),
      userMock1: await mockToken1.balanceOf(user.address),
      userMock2: await mockToken2.balanceOf(user.address),
      userMock3: await mockToken3.balanceOf(user.address),
      userMock4: await mockToken4.balanceOf(user.address),
      treasurySolace: await solace.balanceOf(treasury.address),
      treasuryEth: await provider.getBalance(treasury.address),
      treasuryWeth: await weth.balanceOf(treasury.address),
      treasuryMock1: await mockToken1.balanceOf(treasury.address),
      treasuryMock2: await mockToken2.balanceOf(treasury.address),
      treasuryMock3: await mockToken3.balanceOf(treasury.address),
      treasuryMock4: await mockToken4.balanceOf(treasury.address),
    };
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances): Balances {
    return {
      userSolace: balances1.userSolace.sub(balances2.userSolace),
      userEth: balances1.userEth.sub(balances2.userEth),
      userWeth: balances1.userWeth.sub(balances2.userWeth),
      userMock1: balances1.userMock1.sub(balances2.userMock1),
      userMock2: balances1.userMock2.sub(balances2.userMock2),
      userMock3: balances1.userMock3.sub(balances2.userMock3),
      userMock4: balances1.userMock4.sub(balances2.userMock4),
      treasurySolace: balances1.treasurySolace.sub(balances2.treasurySolace),
      treasuryEth: balances1.treasuryEth.sub(balances2.treasuryEth),
      treasuryWeth: balances1.treasuryWeth.sub(balances2.treasuryWeth),
      treasuryMock1: balances1.treasuryMock1.sub(balances2.treasuryMock1),
      treasuryMock2: balances1.treasuryMock2.sub(balances2.treasuryMock2),
      treasuryMock3: balances1.treasuryMock3.sub(balances2.treasuryMock3),
      treasuryMock4: balances1.treasuryMock4.sub(balances2.treasuryMock4),
    };
  }
});

function fill(length: number, filler: any) {
  let a = [];
  for(var i = 0; i < length; ++i) a.push(filler);
  return a;
}
