import chai from "chai";
import { ethers, waffle, upgrades } from "hardhat";
import { BigNumber as BN, constants } from "ethers";
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Vault, Weth9, Registry, Solace, ClaimsEscrow, PolicyManager, RiskManager, MockProduct } from "../typechain";

describe("Vault", function () {
    let artifacts: ArtifactImports;
    let vault: Vault;
    let weth: Weth9;
    let registry: Registry;
    let solace: Solace;
    let claimsEscrow: ClaimsEscrow;
    let policyManager: PolicyManager;
    let mockProduct: MockProduct;
    let riskManager: RiskManager;

    const [owner, newOwner, depositor1, depositor2, claimant, mockEscrow] = provider.getWallets();
    const tokenName = "Solace CP Token";
    const tokenSymbol = "SCP";
    const testDepositAmount = BN.from("10");
    const testClaimAmount = BN.from("2");
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const chainId = 31337;

    const newMinCapitalRequirement = BN.from("10");
    const deadline = constants.MaxUint256;

    const cooldownMin = BN.from(604800);  // 7 days
    const cooldownMax = BN.from(3024000); // 35 days

    before(async function () {
      artifacts = await import_artifacts();
    })

    beforeEach(async function () {
      weth = (await deployContract(owner,artifacts.WETH)) as Weth9;
      solace = (await deployContract(owner,artifacts.SOLACE,[newOwner.address])) as Solace;
      let registryContract = await ethers.getContractFactory("Registry");
      registry = (await upgrades.deployProxy(registryContract, [owner.address], { kind: "uups" })) as Registry;
      vault = (await deployContract(owner,artifacts.Vault,[owner.address,registry.address,weth.address])) as Vault;
      claimsEscrow = (await deployContract(owner,artifacts.ClaimsEscrow,[owner.address,registry.address])) as ClaimsEscrow;
      policyManager = (await deployContract(owner,artifacts.PolicyManager,[owner.address])) as PolicyManager;
      riskManager = (await deployContract(owner, artifacts.RiskManager, [owner.address, registry.address])) as RiskManager;
      mockProduct = (await deployContract(owner,artifacts.MockProduct,[owner.address,policyManager.address,registry.address,ZERO_ADDRESS,0,100000000000,1,16777215])) as MockProduct;

      await registry.setVault(vault.address);
      await registry.setClaimsEscrow(claimsEscrow.address);
      await registry.setPolicyManager(policyManager.address);
      await registry.setRiskManager(riskManager.address);
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
      it("should initialize DOMAIN_SEPARATOR correctly", async () => {
        expect(await vault.DOMAIN_SEPARATOR()).to.equal(getDomainSeparator(tokenName, vault.address, chainId));
      });
    });

    describe("setGovernance", function () {
      it("should allow governance to set new governance address", async function () {
        expect(await vault.governance()).to.equal(owner.address);
        await vault.connect(owner).setGovernance(newOwner.address);
        expect(await vault.governance()).to.equal(owner.address);
        expect(await vault.newGovernance()).to.equal(newOwner.address);
        let tx = await vault.connect(newOwner).acceptGovernance();
        await expect(tx).to.emit(vault, "GovernanceTransferred").withArgs(newOwner.address);
        expect(await vault.governance()).to.equal(newOwner.address);
        expect(await vault.newGovernance()).to.equal(ZERO_ADDRESS);
      });
      it("should revert if not called by governance", async function () {
        await expect(vault.connect(depositor1).setGovernance(depositor1.address)).to.be.revertedWith("!governance");
        await vault.connect(owner).setGovernance(newOwner.address);
        await expect(vault.connect(depositor1).acceptGovernance()).to.be.revertedWith("!governance");
      });
    });

    describe("setEmergencyShutdown", function () {
      it("should revert if not called by governance", async function () {
        await expect(vault.connect(depositor1).setEmergencyShutdown(true)).to.be.revertedWith("!governance");
      });
      it("should successfully toggle emergency shutdown state in Vault", async function () {
        let callShutdownState = await vault.emergencyShutdown();
        expect(callShutdownState).to.be.false;
        await vault.connect(owner).setEmergencyShutdown(true);
        callShutdownState = await vault.emergencyShutdown();
        expect(callShutdownState).to.be.true;
        await vault.connect(owner).setEmergencyShutdown(false);
        callShutdownState = await vault.emergencyShutdown();
        expect(callShutdownState).to.be.false;
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
    })

    describe("maxRedeemableShares", function () {
      it("should return the correct maxRedeemableShares - user can withdraw entire CP token balance", async function () {
        // set the MCR to be 10
        let newMCR = BN.from("10");
        await mockProduct.setPositionValue(newMCR);
        await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, ZERO_ADDRESS, 10000, 100);
        expect(await riskManager.minCapitalRequirement()).to.equal(newMCR);
        // bring Vault assets to 20
        await vault.connect(depositor1).deposit({ value: testDepositAmount});
        await vault.connect(depositor2).deposit({ value: testDepositAmount.mul(10)});
        // CP should be able to withdraw their full 10 shares
        const callBalance = await vault.balanceOf(depositor1.address);
        expect(await vault.maxRedeemableShares(depositor1.address)).to.equal(callBalance);
      });
      it("should return the correct maxRedeemableShares - user can withdraw up to a portion of their CP token balance", async function () {
        let newMCR = BN.from("2");
        await mockProduct.setPositionValue(newMCR);
        await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, ZERO_ADDRESS, 10000, 100);
        expect(await riskManager.minCapitalRequirement()).to.equal(newMCR);
        await vault.connect(depositor1).deposit({ value: testDepositAmount});
        const callBalance = await vault.balanceOf(depositor1.address);
        expect(await vault.maxRedeemableShares(depositor1.address)).to.equal(callBalance.sub(newMCR));
      });
      it("should initially return zero", async function () {
        expect(await vault.maxRedeemableShares(depositor1.address)).to.equal(0);
      });
    });

    describe("deposit", function () {
      it("revert if vault is in emergency shutdown", async function () {
        await vault.connect(owner).setEmergencyShutdown(true);
        await expect(vault.connect(depositor1).deposit({ value: testDepositAmount })).to.be.revertedWith("cannot deposit when vault is in emergency shutdown");
      });
      it("should mint the first depositor CP tokens with ratio 1:1", async function () {
        await vault.connect(depositor1).deposit({ value: testDepositAmount});
        expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount);
      });
      it("should mint WETH to the Vault", async function () {
        await vault.connect(depositor1).deposit({ value: testDepositAmount});
        expect(await weth.balanceOf(vault.address)).to.equal(testDepositAmount);
      });
      it("should mint the second depositor CP tokens according to existing pool amount", async function () {
        await vault.connect(depositor1).deposit({ value: testDepositAmount});
        expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount);

        const callTotalAssets = await vault.totalAssets();
        const callTotalSupply = await vault.totalSupply();

        await vault.connect(depositor2).deposit({ value: testDepositAmount});
        expect(await vault.balanceOf(depositor2.address)).to.equal(testDepositAmount.mul(callTotalSupply).div(callTotalAssets));

        expect(await weth.balanceOf(vault.address)).to.equal(testDepositAmount.mul(2));
      });
      it("should emit Transfer event as CP tokens are minted", async function () {
        await expect(await vault.connect(depositor1).deposit({ value: testDepositAmount})).to.emit(vault, "Transfer").withArgs(ZERO_ADDRESS, depositor1.address, testDepositAmount);
      });
      it("should emit DepositMade event after function logic is successful", async function () {
        await expect(await vault.connect(depositor1).deposit({ value: testDepositAmount})).to.emit(vault, "DepositMade").withArgs(depositor1.address, testDepositAmount, testDepositAmount);
      });
      it("should deposit via receive()", async function () {
        await depositor1.sendTransaction({
          to: vault.address,
          value: testDepositAmount,
          data: "0x"
        });
        expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount);
      });
      it("should deposit via fallback()", async function () {
        await depositor1.sendTransaction({
          to: vault.address,
          value: testDepositAmount,
          data: "0xabcd"
        });
        expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount);
      });
      it("should hold if receive() sent by weth", async function () {
        let mockVault = (await deployContract(
          owner,
          artifacts.Vault,
          [owner.address, registry.address, depositor1.address]
        )) as Vault;
        await depositor1.sendTransaction({
          to: mockVault.address,
          value: testDepositAmount,
          data: "0x"
        });
        expect(await mockVault.balanceOf(depositor1.address)).to.equal(0);
      });
      it("should hold if fallback() sent by weth", async function () {
        let mockVault = (await deployContract(
          owner,
          artifacts.Vault,
          [owner.address, registry.address, depositor1.address]
        )) as Vault;
        await depositor1.sendTransaction({
          to: mockVault.address,
          value: testDepositAmount,
          data: "0xabcd"
        });
        expect(await mockVault.balanceOf(depositor1.address)).to.equal(0);
      });
    });

    describe("deposit weth", function () {
      beforeEach(async function () {
        await weth.connect(depositor1).deposit({value:testDepositAmount});
        await weth.connect(depositor1).approve(vault.address, testDepositAmount);
        await weth.connect(depositor2).deposit({value:testDepositAmount});
        await weth.connect(depositor2).approve(vault.address, testDepositAmount);
      })
      it("revert if vault is in emergency shutdown", async function () {
        await vault.connect(owner).setEmergencyShutdown(true);
        await expect(vault.connect(depositor1).depositWeth(testDepositAmount)).to.be.revertedWith("cannot deposit when vault is in emergency shutdown");
      });
      it("should mint the first depositor CP tokens with ratio 1:1", async function () {
        await vault.connect(depositor1).depositWeth(testDepositAmount);
        expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount);
      });
      it("should mint WETH to the Vault", async function () {
        await vault.connect(depositor1).depositWeth(testDepositAmount);
        expect(await weth.balanceOf(vault.address)).to.equal(testDepositAmount);
      });
      it("should mint the second depositor CP tokens according to existing pool amount", async function () {
        await vault.connect(depositor1).depositWeth(testDepositAmount);
        expect(await vault.balanceOf(depositor1.address)).to.equal(testDepositAmount);

        const callTotalAssets = await vault.totalAssets();
        const callTotalSupply = await vault.totalSupply();

        await vault.connect(depositor2).depositWeth(testDepositAmount);
        expect(await vault.balanceOf(depositor2.address)).to.equal(testDepositAmount.mul(callTotalSupply).div(callTotalAssets));

        expect(await weth.balanceOf(vault.address)).to.equal(testDepositAmount.mul(2));
      });
      it("should emit Transfer event as CP tokens are minted", async function () {
        await expect(await vault.connect(depositor1).depositWeth(testDepositAmount)).to.emit(vault, "Transfer").withArgs(ZERO_ADDRESS, depositor1.address, testDepositAmount);
      });
      it("should emit DepositMade event after function logic is successful", async function () {
        await expect(await vault.connect(depositor1).depositWeth(testDepositAmount)).to.emit(vault, "DepositMade").withArgs(depositor1.address, testDepositAmount, testDepositAmount);
      });
    });

    describe("withdraw", function () {
      beforeEach("deposit", async function () {
        await vault.connect(depositor1).deposit({ value: testDepositAmount });
      });
      it("should revert if withdrawer tries to redeem more shares than they own", async function () {
        let cpBalance = await vault.balanceOf(depositor1.address);
        await expect(vault.connect(depositor1).withdraw(cpBalance.add(1))).to.be.revertedWith("cannot redeem more shares than you own");
      });
      it("should revert if withdrawal brings Vault's totalAssets below the minimum capital requirement", async function () {
        let cpBalance = await vault.balanceOf(depositor1.address);
        let newMCR = cpBalance.toString();
        await mockProduct.setPositionValue(newMCR);
        await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, ZERO_ADDRESS, 10000, 100);
        expect(await riskManager.minCapitalRequirement()).to.equal(newMCR);
        await expect(vault.connect(depositor1).withdraw(cpBalance)).to.be.revertedWith("withdrawal brings Vault assets below MCR");
      });
      it("should revert if cooldown not started", async function () {
        await expect(vault.connect(depositor1).withdraw(0)).to.be.revertedWith("not in cooldown window");
      });
      it("should revert if not enough time passed", async function () {
        await vault.connect(depositor1).startCooldown();
        await provider.send("evm_increaseTime", [60*60*24*6]);
        await expect(vault.connect(depositor1).withdraw(0)).to.be.revertedWith("not in cooldown window");
      });
      it("should revert if too much time passed", async function () {
        await vault.connect(depositor1).startCooldown();
        await provider.send("evm_increaseTime", [60*60*24*36]);
        await expect(vault.connect(depositor1).withdraw(0)).to.be.revertedWith("not in cooldown window");
      });
      it("should withdraw if correct time passed", async function () {
        await vault.connect(depositor1).startCooldown();
        await provider.send("evm_increaseTime", [60*60*24*8]);
        await expect(await vault.connect(depositor1).withdraw(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
      });
      context("when there is enough WETH in the Vault", function () {
        beforeEach(async function () {
          await vault.connect(depositor1).startCooldown();
          await provider.send("evm_increaseTime", [60*60*24*8]);
        });
        it("should alter WETH balance of Vault contract by amountNeeded", async function () {
          let cpBalance = await vault.balanceOf(depositor1.address);
          await expect(() => vault.connect(depositor1).withdraw(cpBalance)).to.changeTokenBalance(weth, vault, testDepositAmount.mul(-1));
        });
        it("should only use WETH from Vault if Vault balance is sufficient", async function () {
          let cpBalance = await vault.balanceOf(depositor1.address);
          await expect(() => vault.connect(depositor1).withdraw(cpBalance)).to.changeEtherBalance(depositor1, testDepositAmount);
          expect(await vault.balanceOf(depositor1.address)).to.equal(0);
          expect(await weth.balanceOf(vault.address)).to.equal(0);
        });
        it("should emit WithdrawalMade event after function logic is successful", async function () {
          let cpBalance = await vault.balanceOf(depositor1.address);
          let vaultDepositorSigner = vault.connect(depositor1);
          await expect(await vaultDepositorSigner.withdraw(cpBalance)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount);
        });
      });
      context("when there is not enough WETH in the Vault", function () {
        beforeEach(async function () {
          await vault.connect(depositor1).startCooldown();
          await provider.send("evm_increaseTime", [60*60*24*8]);
        });
        it("should withdraw difference from Investment contract, burn user's vault shares and transfer ETH back to user", async function () {
          let cpBalance = await vault.balanceOf(depositor1.address);
          let vaultDepositorSigner = vault.connect(depositor1);
          await expect(() => vaultDepositorSigner.withdraw(cpBalance)).to.changeEtherBalance(depositor1, testDepositAmount);
          expect(await vault.balanceOf(depositor1.address)).to.equal(0);
        });
        it("should emit WithdrawalMade event after function logic is successful", async function () {
          let cpBalance = await vault.balanceOf(depositor1.address);
          let vaultDepositorSigner = vault.connect(depositor1);
          await expect(await vaultDepositorSigner.withdraw(cpBalance)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount);
        });
      });
      context("while vault is in emergency shutdown", function () {
        beforeEach(async function () {
          await vault.connect(owner).setEmergencyShutdown(true);
        });
        it("does not care about mcr", async function () {
          let cpBalance = await vault.balanceOf(depositor1.address);
          let newMCR = cpBalance.toString();
          await mockProduct.setPositionValue(newMCR);
          await mockProduct.connect(depositor1)._buyPolicy(depositor1.address, ZERO_ADDRESS, 10000, 100);
          expect(await riskManager.minCapitalRequirement()).to.equal(newMCR);
          await expect(vault.connect(depositor1).withdraw(cpBalance)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, cpBalance);
        });
        it("does not care about cooldown period", async function () {
          await expect(await vault.connect(depositor1).withdraw(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
          await vault.connect(depositor1).startCooldown();
          await expect(await vault.connect(depositor1).withdraw(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
          await provider.send("evm_increaseTime", [60*60*24*3]);
          await expect(await vault.connect(depositor1).withdraw(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
          await provider.send("evm_increaseTime", [60*60*24*5]);
          await expect(await vault.connect(depositor1).withdraw(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
          await provider.send("evm_increaseTime", [60*60*24*50]);
          await expect(await vault.connect(depositor1).withdraw(0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        });
      });
    });

    describe("requestors", async function () {
      it("should start with no authorized requestors", async function () {
        expect(await vault.isRequestor(claimsEscrow.address)).to.equal(false);
      });
      it("should revert add and remove requestors by non governance", async function () {
        await expect(vault.connect(depositor1).setRequestor(depositor1.address, true)).to.be.revertedWith("!governance");
        await expect(vault.connect(depositor1).setRequestor(depositor1.address, false)).to.be.revertedWith("!governance");
      });
      it("should add and remove requestors", async function () {
        await vault.connect(owner).setRequestor(claimsEscrow.address, true);
        expect(await vault.isRequestor(claimsEscrow.address)).to.equal(true);
        await vault.connect(owner).setRequestor(claimsEscrow.address, false);
        expect(await vault.isRequestor(claimsEscrow.address)).to.equal(false);
      });
    })

    describe("requestEth", function () {
      beforeEach(async function () {
        await vault.connect(owner).setRequestor(mockEscrow.address, true);
      })
      it("should revert if not called by a requestor", async function () {
        await expect(vault.requestEth(0)).to.be.revertedWith("!requestor");
      });
      it("should send eth", async function () {
        await registry.setClaimsEscrow(mockEscrow.address);
        await vault.deposit({value: 20});
        var balance1 = await mockEscrow.getBalance();
        let tx = await vault.connect(mockEscrow).requestEth(7);
        expect(tx).to.emit(vault, "FundsSent").withArgs(7);
        let receipt = await tx.wait();
        let gasCost = receipt.gasUsed.mul(tx.gasPrice || 0);
        var balance2 = await mockEscrow.getBalance();
        expect(balance2.sub(balance1).add(gasCost)).to.equal(7);
      });
      it("should get available eth", async function () {
        await registry.setClaimsEscrow(mockEscrow.address);
        let vaultBalance = await weth.balanceOf(vault.address);
        let withdrawAmount = vaultBalance.add(100);
        var balance1 = await mockEscrow.getBalance();
        let tx = await vault.connect(mockEscrow).requestEth(withdrawAmount);
        expect(tx).to.emit(vault, "FundsSent").withArgs(vaultBalance);
        let receipt = await tx.wait();
        let gasCost = receipt.gasUsed.mul(tx.gasPrice || 0);
        var balance2 = await mockEscrow.getBalance();
        expect(balance2.sub(balance1).add(gasCost)).to.equal(vaultBalance);
      });
      it("can get zero eth", async function () {
        await registry.setClaimsEscrow(mockEscrow.address);
        var balance1 = await mockEscrow.getBalance();
        let tx = await vault.connect(mockEscrow).requestEth(0);
        expect(tx).to.emit(vault, "FundsSent").withArgs(0);
        let receipt = await tx.wait();
        let gasCost = receipt.gasUsed.mul(tx.gasPrice || 0);
        var balance2 = await mockEscrow.getBalance();
        expect(balance2.sub(balance1).add(gasCost)).to.equal(0);
      });
    })
});
