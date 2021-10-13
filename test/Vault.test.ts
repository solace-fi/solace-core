import chai from "chai";
import { ethers, waffle, upgrades } from "hardhat";
import { BigNumber as BN, BigNumberish, constants } from "ethers";
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Vault, Weth9, Registry, ClaimsEscrow, PolicyManager, RiskManager, MockProduct } from "../typechain";

describe("Vault", function () {
  let artifacts: ArtifactImports;
  let vault: Vault;
  let weth: Weth9;
  let registry: Registry;
  let claimsEscrow: ClaimsEscrow;
  let policyManager: PolicyManager;
  let mockProduct: MockProduct;
  let riskManager: RiskManager;

  const [owner, newOwner, depositor1, depositor2, claimant, mockEscrow, mockTreasury, coveredPlatform] = provider.getWallets();
  const tokenName = "Solace CP Token";
  const tokenSymbol = "SCP";
  const testDepositAmount1 = BN.from("1000000000000000000"); // one eth
  const testDepositAmount2 = BN.from("3000000000000000000"); // three eth
  const testDepositAmount3 = BN.from("5000000000000000000"); // five eth
  const testClaimAmount = BN.from("200000000000000000"); // 0.2 eth
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const chainId = 31337;

  const cooldownMin = BN.from(604800);  // 7 days
  const cooldownMax = BN.from(3024000); // 35 days

  before(async function () {
    artifacts = await import_artifacts();
    await owner.sendTransaction({to:owner.address}); // for some reason this helps solidity-coverage
  })

  beforeEach(async function () {
    registry = (await deployContract(owner, artifacts.Registry, [owner.address])) as Registry;
    weth = (await deployContract(owner,artifacts.WETH)) as Weth9;
    await registry.setWeth(weth.address);
    vault = (await deployContract(owner,artifacts.Vault,[owner.address,registry.address])) as Vault;
    await registry.setVault(vault.address);
    claimsEscrow = (await deployContract(owner,artifacts.ClaimsEscrow,[owner.address,registry.address])) as ClaimsEscrow;
    await registry.setClaimsEscrow(claimsEscrow.address);
    policyManager = (await deployContract(owner,artifacts.PolicyManager,[owner.address])) as PolicyManager;
    await registry.setPolicyManager(policyManager.address);
    riskManager = (await deployContract(owner, artifacts.RiskManager, [owner.address, registry.address])) as RiskManager;
    await registry.setRiskManager(riskManager.address);
    mockProduct = (await deployContract(owner,artifacts.MockProduct,[owner.address,policyManager.address,registry.address,coveredPlatform.address,0,100000000000,1])) as MockProduct;
    await policyManager.addProduct(mockProduct.address);
  });

  describe("deployment", function () {
    it("should set the right token name and symbol", async function () {
      expect(await vault.name()).to.equal(tokenName);
      expect(await vault.symbol()).to.equal(tokenSymbol);
    });
    it("should set the governance address", async function () {
      expect(await vault.governance()).to.equal(owner.address);
    });
    it("should initialize DOMAIN_SEPARATOR correctly", async function () {
      expect(await vault.DOMAIN_SEPARATOR()).to.equal(getDomainSeparator(tokenName, vault.address, chainId));
    });
    it("reverts if zero registry", async function () {
      await expect(deployContract(owner, artifacts.Vault, [owner.address, ZERO_ADDRESS])).to.be.revertedWith("zero address registry");
    });
    it("reverts if zero weth", async function () {
      let registry2 = (await deployContract(owner, artifacts.Registry, [owner.address])) as Registry;
      await expect(deployContract(owner, artifacts.Vault, [owner.address, registry2.address])).to.be.revertedWith("zero address weth");
    });
  });

  describe("setGovernance", function () {
    it("should allow governance to set new governance address", async function () {
      expect(await vault.governance()).to.equal(owner.address);
      let tx1 = await vault.connect(owner).setGovernance(newOwner.address);
      expect(tx1).to.emit(vault, "GovernancePending").withArgs(newOwner.address);
      expect(await vault.governance()).to.equal(owner.address);
      expect(await vault.pendingGovernance()).to.equal(newOwner.address);
      let tx2 = await vault.connect(newOwner).acceptGovernance();
      await expect(tx2).to.emit(vault, "GovernanceTransferred").withArgs(owner.address, newOwner.address);
      expect(await vault.governance()).to.equal(newOwner.address);
      expect(await vault.pendingGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("should revert if not called by governance", async function () {
      await expect(vault.connect(depositor1).setGovernance(depositor1.address)).to.be.revertedWith("!governance");
      await vault.connect(owner).setGovernance(newOwner.address);
      await expect(vault.connect(depositor1).acceptGovernance()).to.be.revertedWith("!governance");
    });
  });

  describe("pause/unpause", function () {
    it("should revert if not called by governance", async function () {
      await expect(vault.connect(depositor1).pause()).to.be.revertedWith("!governance");
      await expect(vault.connect(depositor1).unpause()).to.be.revertedWith("!governance");
    });
    it("should successfully toggle paused state in Vault", async function () {
      let callPausedState = await vault.paused();
      expect(callPausedState).to.be.false;
      let tx1 = await vault.connect(owner).pause();
      expect(tx1).to.emit(vault, "Paused");
      callPausedState = await vault.paused();
      expect(callPausedState).to.be.true;
      let tx2 = await vault.connect(owner).unpause();
      expect(tx2).to.emit(vault, "Unpaused");
      callPausedState = await vault.paused();
      expect(callPausedState).to.be.false;
    });
  });

  describe("setCooldownWindow", function () {
    it("should return correct initial values", async function () {
      expect(await vault.cooldownMin()).to.equal(cooldownMin);
      expect(await vault.cooldownMax()).to.equal(cooldownMax);
    });
    it("should revert if not set by governance", async function () {
      await expect(vault.connect(depositor1).setCooldownWindow(3,4)).to.be.revertedWith("!governance");
    });
    it("should revert if invalid window", async function () {
      await expect(vault.connect(owner).setCooldownWindow(4,3)).to.be.revertedWith("invalid window");
    });
    it("should successfully set cooldown window", async function () {
      await vault.connect(owner).setCooldownWindow(3,4);
      expect(await vault.cooldownMin()).to.equal(3);
      expect(await vault.cooldownMax()).to.equal(4);
    });
  });

  describe("pricePerShare", function () {
    it("should initially return 1:1 ETH-SCP", async function () {
      expect(await vault.pricePerShare()).to.equal(BN.from("1000000000000000000"));
    });
    it("should stay at 1:1 on first deposit", async function () {
      await vault.connect(depositor1).depositEth({value: "500000000000000000"});
      expect(await vault.pricePerShare()).to.equal(BN.from("1000000000000000000"));
    });
    it("should appreciate on sale of coverage", async function () {
      await vault.connect(depositor1).depositEth({value: "500000000000000000"});
      await depositor1.sendTransaction({to: vault.address, value: "250000000000000000"});
      expect(await vault.pricePerShare()).to.equal(BN.from("1500000000000000000"));
    });
    it("should stay the same on deposit", async function () {
      await vault.connect(depositor1).depositEth({value: "500000000000000000"});
      await depositor1.sendTransaction({to: vault.address, value: "250000000000000000"});
      expect(await vault.pricePerShare()).to.equal(BN.from("1500000000000000000"));
      await vault.connect(depositor2).depositEth({value: "250000000000000000"});
      expect(await vault.pricePerShare()).to.be.closeTo("1500000000000000000", 10);
    });
    it("should stay the same on withdraw", async function () {
      await vault.connect(depositor1).depositEth({value: "500000000000000000"});
      await depositor1.sendTransaction({to: vault.address, value: "250000000000000000"});
      expect(await vault.pricePerShare()).to.equal(BN.from("1500000000000000000"));
      await vault.connect(owner).setCooldownWindow(0, "1099511627775"); // min, max uint40
      await vault.connect(depositor1).withdrawEth("250000000000000000");
      expect(await vault.pricePerShare()).to.equal(BN.from("1500000000000000000"));
    });
    it("should depreciate on payout of claims", async function () {
      await vault.connect(depositor1).depositEth({value: "500000000000000000"});
      await vault.connect(owner).addRequestor(depositor1.address);
      await vault.connect(depositor1).requestEth("250000000000000000");
      expect(await vault.pricePerShare()).to.equal(BN.from("500000000000000000"));
    });
    it("should stay the same on deposit", async function () {
      await vault.connect(depositor1).depositEth({value: "500000000000000000"});
      await vault.connect(owner).addRequestor(depositor1.address);
      await vault.connect(depositor1).requestEth("250000000000000000");
      expect(await vault.pricePerShare()).to.equal(BN.from("500000000000000000"));
      await vault.connect(depositor2).depositEth({value: "250000000000000000"});
      expect(await vault.pricePerShare()).to.equal(BN.from("500000000000000000"));
    });
    it("should stay the same on withdraw", async function () {
      await vault.connect(depositor1).depositEth({value: "500000000000000000"});
      await vault.connect(owner).addRequestor(depositor1.address);
      await vault.connect(depositor1).requestEth("250000000000000000");
      expect(await vault.pricePerShare()).to.equal(BN.from("500000000000000000"));
      await vault.connect(owner).setCooldownWindow(0, "1099511627775"); // min, max uint40
      await vault.connect(depositor1).withdrawEth("250000000000000000");
      expect(await vault.pricePerShare()).to.equal(BN.from("500000000000000000"));
    });
  })

  describe("maxRedeemableShares", function () {
    it("should initially return zero", async function () {
      expect(await vault.maxRedeemableShares(depositor1.address)).to.equal(0);
      expect(await vault.totalAssets()).to.equal(0);
      expect(await vault.totalSupply()).to.equal(0);
    });
    it("should return the correct maxRedeemableShares - user can withdraw entire CP token balance", async function () {
      // cover 0.5 eth
      let coverAmount = BN.from("500000000000000000");
      await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, coverAmount, 123, ZERO_ADDRESS);
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount);
      // deposit 1 + 3 = 4 eth
      await vault.connect(depositor1).depositEth({ value: testDepositAmount1 });
      await vault.connect(depositor2).depositEth({ value: testDepositAmount2 });
      // depositors should be able to withdraw in full
      const bal1 = await vault.balanceOf(depositor1.address);
      expect(bal1).to.equal(testDepositAmount1);
      expect(await vault.maxRedeemableShares(depositor1.address)).to.equal(bal1);
      const bal2 = await vault.balanceOf(depositor2.address);
      expect(bal2).to.equal(testDepositAmount2);
      expect(await vault.maxRedeemableShares(depositor2.address)).to.equal(bal2);
    });
    it("should return the correct maxRedeemableShares - user can withdraw up to a portion of their CP token balance", async function () {
      // cover 3.5 eth
      let coverAmount = BN.from("3500000000000000000");
      await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, coverAmount, 123, ZERO_ADDRESS);
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount);
      // deposit 1 + 3 = 4 eth
      await vault.connect(depositor1).depositEth({ value: testDepositAmount1 });
      await vault.connect(depositor2).depositEth({ value: testDepositAmount2 });
      // depositors should be able to withdraw in part
      const bal1 = await vault.balanceOf(depositor1.address);
      expect(bal1).to.equal(testDepositAmount1);
      expect(await vault.maxRedeemableShares(depositor1.address)).to.equal("500000000000000000"); // 4 - 3.5 = 0.5 eth
      const bal2 = await vault.balanceOf(depositor2.address);
      expect(bal2).to.equal(testDepositAmount2);
      expect(await vault.maxRedeemableShares(depositor2.address)).to.equal("500000000000000000");
    });
  });

  describe("deposit eth", function () {
    it("revert if vault is paused", async function () {
      await vault.connect(owner).pause();
      await expect(vault.connect(depositor1).depositEth({ value: testDepositAmount1 })).to.be.revertedWith("cannot deposit while paused");
    });
    it("should mint the first depositor CP tokens with ratio 1:1", async function () {
      await vault.connect(depositor1).depositEth({ value: testDepositAmount1 });
      expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount1);
    });
    it("should mint WETH to the Vault", async function () {
      await vault.connect(depositor1).depositEth({ value: testDepositAmount1 });
      expect(await vault.totalAssets()).to.equal(testDepositAmount1);
    });
    it("should mint the second depositor CP tokens according to existing pool amount", async function () {
      await vault.connect(depositor1).depositEth({ value: testDepositAmount1 });
      expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount1);
      await depositor1.sendTransaction({to: vault.address, value: testDepositAmount2});

      const totalAssets = await vault.totalAssets();
      expect(totalAssets).to.equal(testDepositAmount1.add(testDepositAmount2));
      const totalSupply = await vault.totalSupply();
      expect(totalSupply).to.equal(testDepositAmount1);

      await vault.connect(depositor2).depositEth({ value: testDepositAmount3 });
      const bal2 = await vault.balanceOf(depositor2.address);
      expect(bal2).to.equal(testDepositAmount3.mul(totalSupply).div(totalAssets));

      expect(await vault.totalAssets()).to.equal(testDepositAmount1.add(testDepositAmount2).add(testDepositAmount3));
      expect(await vault.totalSupply()).to.equal(testDepositAmount1.add(bal2));
    });
    it("should emit Transfer event as CP tokens are minted", async function () {
      await expect(await vault.connect(depositor1).depositEth({ value: testDepositAmount1 })).to.emit(vault, "Transfer").withArgs(ZERO_ADDRESS, depositor1.address, testDepositAmount1);
    });
    it("should emit DepositMade event after function logic is successful", async function () {
      await expect(await vault.connect(depositor1).depositEth({ value: testDepositAmount1 })).to.emit(vault, "DepositMade").withArgs(depositor1.address, testDepositAmount1, testDepositAmount1);
    });
    it("should restart cooldown", async function () {
      await vault.connect(depositor1).startCooldown();
      expect(await vault.cooldownStart(depositor1.address)).to.be.gt(0);
      await vault.connect(depositor1).depositEth({value: 1});
      expect(await vault.cooldownStart(depositor1.address)).to.equal(0);
    });
    it("should not mint on receive()", async function () {
      await depositor1.sendTransaction({
        to: vault.address,
        value: testDepositAmount1,
        data: "0x"
      });
      expect(await vault.balanceOf(depositor1.address)).to.equal(0);
    });
    it("should not mint on fallback()", async function () {
      await depositor1.sendTransaction({
        to: vault.address,
        value: testDepositAmount1,
        data: "0xabcd"
      });
      expect(await vault.balanceOf(depositor1.address)).to.equal(0);
    });
  });

  describe("deposit weth", function () {
    beforeEach(async function () {
      await weth.connect(depositor1).deposit({value:testDepositAmount1});
      await weth.connect(depositor1).approve(vault.address, testDepositAmount1);
      await weth.connect(depositor2).deposit({value:testDepositAmount1});
      await weth.connect(depositor2).approve(vault.address, testDepositAmount1);
    })
    it("revert if vault is paused", async function () {
      await vault.connect(owner).pause();
      await expect(vault.connect(depositor1).depositWeth(testDepositAmount1)).to.be.revertedWith("cannot deposit while paused");
    });
    it("should mint the first depositor CP tokens with ratio 1:1", async function () {
      await vault.connect(depositor1).depositWeth(testDepositAmount1);
      expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount1);
    });
    it("should mint WETH to the Vault", async function () {
      await vault.connect(depositor1).depositWeth(testDepositAmount1);
      expect(await vault.totalAssets()).to.equal(testDepositAmount1);
    });
    it("should mint the second depositor CP tokens according to existing pool amount", async function () {
      await vault.connect(depositor1).depositWeth(testDepositAmount1);
      expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount1);

      const callTotalAssets = await vault.totalAssets();
      const callTotalSupply = await vault.totalSupply();

      await vault.connect(depositor2).depositWeth(testDepositAmount1);
      expect(await vault.balanceOf(depositor2.address)).to.equal(testDepositAmount1.mul(callTotalSupply).div(callTotalAssets));

      expect(await vault.totalAssets()).to.equal(testDepositAmount1.mul(2));
    });
    it("should emit Transfer event as CP tokens are minted", async function () {
      await expect(await vault.connect(depositor1).depositWeth(testDepositAmount1)).to.emit(vault, "Transfer").withArgs(ZERO_ADDRESS, depositor1.address, testDepositAmount1);
    });
    it("should emit DepositMade event after function logic is successful", async function () {
      await expect(await vault.connect(depositor1).depositWeth(testDepositAmount1)).to.emit(vault, "DepositMade").withArgs(depositor1.address, testDepositAmount1, testDepositAmount1);
    });
    it("should restart cooldown", async function () {
      await vault.connect(depositor1).startCooldown();
      expect(await vault.cooldownStart(depositor1.address)).to.be.gt(0);
      await vault.connect(depositor1).depositWeth(1);
      expect(await vault.cooldownStart(depositor1.address)).to.equal(0);
    });
  });

  describe("transfer", function () {
    it("can transfer between non cooldown accounts", async function () {
      expect(await vault.canTransfer(depositor1.address)).to.equal(true);
      expect(await vault.balanceOf(depositor1.address)).to.equal(0);
      expect(await vault.balanceOf(depositor2.address)).to.equal(0);
      await vault.connect(depositor1).depositEth({value: 1});
      expect(await vault.balanceOf(depositor1.address)).to.equal(1);
      expect(await vault.balanceOf(depositor2.address)).to.equal(0);
      await vault.connect(depositor1).transfer(depositor2.address, 1);
      expect(await vault.balanceOf(depositor1.address)).to.equal(0);
      expect(await vault.balanceOf(depositor2.address)).to.equal(1);
      await vault.connect(depositor2).approve(depositor1.address, 1);
      await vault.connect(depositor1).transferFrom(depositor2.address, depositor1.address, 1);
      expect(await vault.balanceOf(depositor1.address)).to.equal(1);
      expect(await vault.balanceOf(depositor2.address)).to.equal(0);
    });
    it("should revert if accounts are in cooldown", async function () {
      expect(await vault.balanceOf(depositor1.address)).to.equal(0);
      expect(await vault.balanceOf(depositor2.address)).to.equal(0);
      await vault.connect(depositor1).depositEth({value: 1});
      expect(await vault.balanceOf(depositor1.address)).to.equal(1);
      expect(await vault.balanceOf(depositor2.address)).to.equal(0);
      await vault.connect(depositor1).startCooldown();
      expect(await vault.canTransfer(depositor1.address)).to.equal(false);
      await expect(vault.connect(depositor1).transfer(depositor2.address, 1)).to.be.revertedWith("cannot transfer during cooldown");
      await vault.connect(depositor1).stopCooldown();
      expect(await vault.canTransfer(depositor1.address)).to.equal(true);
      await vault.connect(depositor1).transfer(depositor2.address, 1);
      expect(await vault.balanceOf(depositor1.address)).to.equal(0);
      expect(await vault.balanceOf(depositor2.address)).to.equal(1);
      await vault.connect(depositor2).approve(depositor1.address, 1);
      await vault.connect(depositor2).startCooldown();
      await provider.send("evm_increaseTime", [60*60*24*1]);
      await provider.send("evm_mine", []);
      expect(await vault.canTransfer(depositor2.address)).to.equal(false);
      await expect(vault.connect(depositor1).transferFrom(depositor2.address, depositor1.address, 1)).to.be.revertedWith("cannot transfer during cooldown");
      await vault.connect(depositor1).startCooldown();
      await expect(vault.connect(depositor1).transferFrom(depositor2.address, depositor1.address, 1)).to.be.revertedWith("cannot transfer during cooldown");
      await provider.send("evm_increaseTime", [60*60*24*35]);
      await provider.send("evm_mine", []);
      expect(await vault.canTransfer(depositor1.address)).to.equal(true);
      expect(await vault.canTransfer(depositor2.address)).to.equal(true);
      await vault.connect(depositor1).transferFrom(depositor2.address, depositor1.address, 1);
      expect(await vault.balanceOf(depositor1.address)).to.equal(1);
      expect(await vault.balanceOf(depositor2.address)).to.equal(0);
    });
    it("does not care about cooldown while paused", async function () {
      expect(await vault.balanceOf(depositor1.address)).to.equal(0);
      expect(await vault.balanceOf(depositor2.address)).to.equal(0);
      await vault.connect(depositor1).depositEth({value: 1});
      await vault.connect(owner).pause();
      expect(await vault.balanceOf(depositor1.address)).to.equal(1);
      expect(await vault.balanceOf(depositor2.address)).to.equal(0);
      await vault.connect(depositor1).startCooldown();
      await vault.connect(depositor2).startCooldown();
      await vault.connect(depositor1).transfer(depositor2.address, 1);
      expect(await vault.balanceOf(depositor1.address)).to.equal(0);
      expect(await vault.balanceOf(depositor2.address)).to.equal(1);
      await vault.connect(depositor2).approve(depositor1.address, 1);
      await vault.connect(depositor1).transferFrom(depositor2.address, depositor1.address, 1);
      expect(await vault.balanceOf(depositor1.address)).to.equal(1);
      expect(await vault.balanceOf(depositor2.address)).to.equal(0);
    });
  });

  describe("withdraw eth", function () {
    beforeEach("deposit", async function () {
      await vault.connect(depositor1).depositEth({ value: testDepositAmount1 });
    });
    it("should revert if withdrawer tries to redeem more shares than they own", async function () {
      let cpBalance = await vault.balanceOf(depositor1.address);
      await expect(vault.connect(depositor1).withdrawEth(cpBalance.add(1))).to.be.revertedWith("insufficient scp balance");
    });
    it("should revert if withdrawal brings Vault's totalAssets below the minimum capital requirement", async function () {
      let balance = await vault.totalAssets();
      await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, balance, 123, ZERO_ADDRESS);
      expect(await riskManager.minCapitalRequirement()).to.equal(balance);
      await expect(vault.connect(depositor1).withdrawEth(1)).to.be.revertedWith("insufficient assets");
    });
    it("should revert if cooldown not started", async function () {
      expect(await vault.canWithdraw(depositor1.address)).to.equal(false);
      await expect(vault.connect(depositor1).withdrawEth(0)).to.be.revertedWith("not in cooldown window");
    });
    it("should revert if not enough time passed", async function () {
      await vault.connect(depositor1).startCooldown();
      await provider.send("evm_increaseTime", [60*60*24*6]);
      await provider.send("evm_mine", []);
      expect(await vault.canWithdraw(depositor1.address)).to.equal(false);
      await expect(vault.connect(depositor1).withdrawEth(0)).to.be.revertedWith("not in cooldown window");
    });
    it("should revert if too much time passed", async function () {
      await vault.connect(depositor1).startCooldown();
      await provider.send("evm_increaseTime", [60*60*24*36]);
      await provider.send("evm_mine", []);
      expect(await vault.canWithdraw(depositor1.address)).to.equal(false);
      await expect(vault.connect(depositor1).withdrawEth(0)).to.be.revertedWith("not in cooldown window");
    });
    it("should withdraw if correct time passed", async function () {
      await vault.connect(depositor1).startCooldown();
      await provider.send("evm_increaseTime", [60*60*24*8]);
      await provider.send("evm_mine", []);
      expect(await vault.canWithdraw(depositor1.address)).to.equal(true);
      const ub1 = await depositor1.getBalance();
      const vb1 = await vault.totalAssets();
      const shares = await vault.balanceOf(depositor1.address);
      let tx = await vault.connect(depositor1).withdrawEth(shares);
      await expect(tx).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount1);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      const ub2 = await depositor1.getBalance();
      const vb2 = await vault.totalAssets();
      expect(ub2.sub(ub1).add(gasCost)).to.equal(testDepositAmount1);
      expect(vb1.sub(vb2)).to.equal(testDepositAmount1);
    });
    it("should unwrap weth if necessary", async function () {
      await weth.connect(depositor1).deposit({value:testDepositAmount1});
      await weth.connect(depositor1).approve(vault.address, testDepositAmount1);
      await vault.connect(depositor1).depositWeth(testDepositAmount1);
      await vault.connect(depositor1).startCooldown();
      await provider.send("evm_increaseTime", [60*60*24*8]);
      const ub1 = await depositor1.getBalance();
      const vb1 = await vault.totalAssets();
      const shares = await vault.balanceOf(depositor1.address);
      let tx = await vault.connect(depositor1).withdrawEth(shares);
      await expect(tx).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount1.mul(2));
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      const ub2 = await depositor1.getBalance();
      const vb2 = await vault.totalAssets();
      expect(ub2.sub(ub1).add(gasCost)).to.equal(testDepositAmount1.mul(2));
      expect(vb1.sub(vb2)).to.equal(testDepositAmount1.mul(2));
    });
    context("while vault is in paused", function () {
      beforeEach(async function () {
        await vault.connect(owner).pause();
      });
      it("does not care about mcr", async function () {
        let balance = await vault.balanceOf(depositor1.address);
        await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, balance, 123, ZERO_ADDRESS);
        expect(await riskManager.minCapitalRequirement()).to.equal(balance);
        await expect(vault.connect(depositor1).withdrawEth(balance)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, balance);
      });
      it("does not care about cooldown period", async function () {
        await expect(await vault.connect(depositor1).withdrawEth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        await vault.connect(depositor1).startCooldown();
        await expect(await vault.connect(depositor1).withdrawEth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        await provider.send("evm_increaseTime", [60*60*24*3]);
        await expect(await vault.connect(depositor1).withdrawEth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        await provider.send("evm_increaseTime", [60*60*24*5]);
        await expect(await vault.connect(depositor1).withdrawEth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        await provider.send("evm_increaseTime", [60*60*24*50]);
        await expect(await vault.connect(depositor1).withdrawEth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
      });
    });
  });

  describe("withdraw weth", function () {
    beforeEach("deposit", async function () {
      await weth.connect(depositor1).deposit({value:testDepositAmount1});
      await weth.connect(depositor1).approve(vault.address, testDepositAmount1);
      await vault.connect(depositor1).depositWeth(testDepositAmount1);
    });
    it("should revert if withdrawer tries to redeem more shares than they own", async function () {
      let cpBalance = await vault.balanceOf(depositor1.address);
      await expect(vault.connect(depositor1).withdrawWeth(cpBalance.add(1))).to.be.revertedWith("insufficient scp balance");
    });
    it("should revert if withdrawal brings Vault's totalAssets below the minimum capital requirement", async function () {
      let balance = await vault.totalAssets();
      await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, balance, 123, ZERO_ADDRESS);
      expect(await riskManager.minCapitalRequirement()).to.equal(balance);
      await expect(vault.connect(depositor1).withdrawWeth(1)).to.be.revertedWith("insufficient assets");
    });
    it("should revert if cooldown not started", async function () {
      await expect(vault.connect(depositor1).withdrawWeth(0)).to.be.revertedWith("not in cooldown window");
    });
    it("should revert if not enough time passed", async function () {
      await vault.connect(depositor1).startCooldown();
      await provider.send("evm_increaseTime", [60*60*24*6]);
      await expect(vault.connect(depositor1).withdrawWeth(0)).to.be.revertedWith("not in cooldown window");
    });
    it("should revert if too much time passed", async function () {
      await vault.connect(depositor1).startCooldown();
      await provider.send("evm_increaseTime", [60*60*24*36]);
      await expect(vault.connect(depositor1).withdrawWeth(0)).to.be.revertedWith("not in cooldown window");
    });
    it("should withdraw if correct time passed", async function () {
      await vault.connect(depositor1).startCooldown();
      await provider.send("evm_increaseTime", [60*60*24*8]);
      const ub1 = await weth.balanceOf(depositor1.address);
      const vb1 = await vault.totalAssets();
      const shares = await vault.balanceOf(depositor1.address);
      let tx = await vault.connect(depositor1).withdrawWeth(shares);
      await expect(tx).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount1);
      const ub2 = await weth.balanceOf(depositor1.address);
      const vb2 = await vault.totalAssets();
      expect(ub2.sub(ub1)).to.equal(testDepositAmount1);
      expect(vb1.sub(vb2)).to.equal(testDepositAmount1);
    });
    it("should wrap eth if necessary", async function () {
      await vault.connect(depositor1).depositEth({ value: testDepositAmount1 });
      await vault.connect(depositor1).startCooldown();
      await provider.send("evm_increaseTime", [60*60*24*8]);
      const ub1 = await weth.balanceOf(depositor1.address);
      const vb1 = await vault.totalAssets();
      const shares = await vault.balanceOf(depositor1.address);
      let tx = await vault.connect(depositor1).withdrawWeth(shares);
      await expect(tx).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount1.mul(2));
      const ub2 = await weth.balanceOf(depositor1.address);
      const vb2 = await vault.totalAssets();
      expect(ub2.sub(ub1)).to.equal(testDepositAmount1.mul(2));
      expect(vb1.sub(vb2)).to.equal(testDepositAmount1.mul(2));
    });
    context("while vault is paused", function () {
      beforeEach(async function () {
        await vault.connect(owner).pause();
      });
      it("does not care about mcr", async function () {
        let balance = await vault.balanceOf(depositor1.address);
        await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, balance, 123, ZERO_ADDRESS);
        expect(await riskManager.minCapitalRequirement()).to.equal(balance);
        await expect(vault.connect(depositor1).withdrawWeth(balance)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, balance);
      });
      it("does not care about cooldown period", async function () {
        await expect(await vault.connect(depositor1).withdrawWeth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        await vault.connect(depositor1).startCooldown();
        await expect(await vault.connect(depositor1).withdrawWeth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        await provider.send("evm_increaseTime", [60*60*24*3]);
        await expect(await vault.connect(depositor1).withdrawWeth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        await provider.send("evm_increaseTime", [60*60*24*5]);
        await expect(await vault.connect(depositor1).withdrawWeth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        await provider.send("evm_increaseTime", [60*60*24*50]);
        await expect(await vault.connect(depositor1).withdrawWeth(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
      });
    });
  });

  describe("requestors", async function () {
    it("should start with no authorized requestors", async function () {
      expect(await vault.isRequestor(claimsEscrow.address)).to.equal(false);
    });
    it("should revert add and remove requestors by non governance", async function () {
      await expect(vault.connect(depositor1).addRequestor(depositor1.address)).to.be.revertedWith("!governance");
      await expect(vault.connect(depositor1).removeRequestor(depositor1.address)).to.be.revertedWith("!governance");
    });
    it("should add and remove requestors", async function () {
      let tx1 = await vault.connect(owner).addRequestor(claimsEscrow.address);
      expect(tx1).to.emit(vault, "RequestorAdded").withArgs(claimsEscrow.address);
      expect(await vault.isRequestor(claimsEscrow.address)).to.equal(true);
      let tx2 = await vault.connect(owner).removeRequestor(claimsEscrow.address);
      expect(tx2).to.emit(vault, "RequestorRemoved").withArgs(claimsEscrow.address);
      expect(await vault.isRequestor(claimsEscrow.address)).to.equal(false);
    });
    it("cannot add zero address requestor", async function () {
      await expect(vault.connect(owner).addRequestor(ZERO_ADDRESS)).to.be.revertedWith("zero address requestor");
      await expect(vault.connect(owner).removeRequestor(ZERO_ADDRESS)).to.be.revertedWith("zero address requestor");
    });
  });

  describe("requestEth", function () {
    beforeEach(async function () {
      await vault.connect(owner).addRequestor(mockEscrow.address);
    })
    it("should revert if not called by a requestor", async function () {
      await expect(vault.requestEth(0)).to.be.revertedWith("!requestor");
    });
    it("should send eth", async function () {
      await registry.setClaimsEscrow(mockEscrow.address);
      await vault.depositEth({value: "10000000000000000000"}); // 10 eth
      const requestAmount = "7000000000000000000"; // 7 eth
      var balance1 = await mockEscrow.getBalance();
      let tx = await vault.connect(mockEscrow).requestEth(requestAmount);
      expect(tx).to.emit(vault, "FundsSent").withArgs(requestAmount);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      var balance2 = await mockEscrow.getBalance();
      expect(balance2.sub(balance1).add(gasCost)).to.equal(requestAmount);
    });
    it("should get available eth", async function () {
      await registry.setClaimsEscrow(mockEscrow.address);
      await vault.depositEth({value: "10000000000000000000"}); // 10 eth
      let vaultBalance = await vault.totalAssets();
      let withdrawAmount = vaultBalance.add("2000000000000000000"); // 2 more eth than available
      var balance1 = await mockEscrow.getBalance();
      let tx = await vault.connect(mockEscrow).requestEth(withdrawAmount);
      expect(tx).to.emit(vault, "FundsSent").withArgs(vaultBalance);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      var balance2 = await mockEscrow.getBalance();
      expect(balance2.sub(balance1).add(gasCost)).to.equal(vaultBalance);
    });
    it("can get zero eth", async function () {
      await registry.setClaimsEscrow(mockEscrow.address);
      var balance1 = await mockEscrow.getBalance();
      let tx = await vault.connect(mockEscrow).requestEth(0);
      expect(tx).to.emit(vault, "FundsSent").withArgs(0);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      var balance2 = await mockEscrow.getBalance();
      expect(balance2.sub(balance1).add(gasCost)).to.equal(0);
    });
  });

  describe("share value", function () {
    beforeEach("set no cooldown", async function () {
      await vault.connect(owner).setCooldownWindow(0, "1099511627775"); // min, max uint40
    });
    it("deposits and withdraws at same value from start", async function () {
      // all zero initial state
      // deposit then withdraw
      let depositAmount = "10000000000000000000"; // 10 eth
      await vault.connect(depositor1).depositEth({value: depositAmount});
      let shares = await vault.balanceOf(depositor1.address);
      let bal1 = await depositor1.getBalance();
      let tx = await vault.connect(depositor1).withdrawEth(shares);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await depositor1.getBalance();
      let withdrawAmount = bal2.sub(bal1).add(gasCost);
      expect(withdrawAmount).to.equal(depositAmount);
    });
    it("deposits and withdraws at same value from state n with gains", async function () {
      // create initial state
      await vault.connect(depositor2).depositEth({value: "5000000000000000000"}); // 5 eth
      await depositor2.sendTransaction({to: vault.address, value: "3000000000000000000"}); // 3 eth
      // deposit then withdraw
      let depositAmount = "10000000000000000000"; // 10 eth
      await vault.connect(depositor1).depositEth({value: depositAmount});
      let shares = await vault.balanceOf(depositor1.address);
      let bal1 = await depositor1.getBalance();
      let tx = await vault.connect(depositor1).withdrawEth(shares);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await depositor1.getBalance();
      let withdrawAmount = bal2.sub(bal1).add(gasCost);
      expect(withdrawAmount).to.equal(depositAmount);
    });
    it("deposits and withdraws at same value from state n with losses", async function () {
      // create initial state
      await vault.connect(depositor2).depositEth({value: "5000000000000000000"}); // 5 eth
      await vault.connect(owner).addRequestor(depositor2.address);
      await vault.connect(depositor2).requestEth("3000000000000000000"); // 3 eth
      // deposit then withdraw
      let depositAmount = "10000000000000000000"; // 10 eth
      await vault.connect(depositor1).depositEth({value: depositAmount});
      let shares = await vault.balanceOf(depositor1.address);
      let bal1 = await depositor1.getBalance();
      let tx = await vault.connect(depositor1).withdrawEth(shares);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await depositor1.getBalance();
      let withdrawAmount = bal2.sub(bal1).add(gasCost);
      expect(withdrawAmount).to.equal(depositAmount);
    });
    it("cannot get flashloan attacked", async function () {
      // run through a bunch of random simulations
      var numSims = 25;
      for(var i = 0; i < numSims; ++i) {
        // create random initial state
        await vault.connect(depositor2).depositEth({value: randomBN("1000000000000000000")}); // deposit 0-1 eth
        if(Math.random() > 0.5) {
          await vault.connect(owner).addRequestor(depositor2.address);
          await vault.connect(depositor2).requestEth(randomBN(await vault.totalAssets())); // remove some
        } else {
          await depositor2.sendTransaction({to: vault.address, value: randomBN(await vault.totalAssets())}); // add some more
        }
        let ts = await vault.totalSupply();
        let ta = await vault.totalAssets();
        // deposit then withdraw
        let depositAmount = randomBN("10000000000000000000"); // 0-10 eth
        let transferAmount = Math.random() > 0.5
          ? randomBN("10000000000000000000") // 0-10 eth
          : BN.from(1); // 1 wei
        let flashloanAmount = depositAmount.add(transferAmount);
        await vault.connect(depositor1).depositEth({value: depositAmount});
        await depositor1.sendTransaction({to: vault.address, value: transferAmount});
        let shares = await vault.balanceOf(depositor1.address);
        let bal1 = await depositor1.getBalance();
        let tx = await vault.connect(depositor1).withdrawEth(shares);
        let receipt = await tx.wait();
        let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        let bal2 = await depositor1.getBalance();
        let withdrawAmount = bal2.sub(bal1).add(gasCost);
        if(withdrawAmount.gt(flashloanAmount)) {
          console.log("flashloan attack detected");
          console.log("initial supply  :", ts.toString());
          console.log("initial assets  :", ta.toString());
          console.log("deposit amount  :", depositAmount.toString());
          console.log("transfer amount :", transferAmount.toString());
        }
        expect(withdrawAmount).to.be.lte(flashloanAmount);
        // reset state
        await vault.connect(depositor2).withdrawEth(await vault.balanceOf(depositor2.address));
        expect(await vault.totalSupply()).to.equal(0);
        expect(await vault.totalAssets()).to.equal(0);
      }
    });
  })
});

function randomBN(max: BigNumberish): BN {
  return BN.from(ethers.utils.randomBytes(32)).mod(max);
}
