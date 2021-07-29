import chai from "chai";
import { waffle, ethers, upgrades } from "hardhat";
import { BigNumber as BN } from "ethers";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Vault, MockStrategy, Weth9, Registry } from "../typechain";

describe("Strategy", function() {
  let artifacts: ArtifactImports;
  let vault: Vault;
  let newVault: Vault;
  let weth: Weth9;
  let strategy: MockStrategy;
  let registry: Registry;

  const [owner, newOwner, depositor1] = provider.getWallets();
  const testDepositAmount = BN.from("10");

  const debtRatio = 1000;
  const minDebtPerHarvest = 0;
  const maxDebtPerHarvest = 1000;
  const performanceFee = 0;

  const MAX_BPS = 10000;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  before(async function() {
    artifacts = await import_artifacts();
  });

  beforeEach(async () => {
    let registryContract = await ethers.getContractFactory("Registry");
    registry = (await upgrades.deployProxy(registryContract, [owner.address], { kind: "uups" })) as Registry;

    weth = (await deployContract(owner, artifacts.WETH)) as Weth9;

    vault = (await deployContract(owner, artifacts.Vault, [owner.address, registry.address, weth.address])) as Vault;

    newVault = (await deployContract(owner, artifacts.Vault, [owner.address, registry.address, weth.address])) as Vault;

    strategy = (await deployContract(owner, artifacts.MockStrategy, [vault.address])) as MockStrategy;
  });

  describe("deployment", function() {
    it("should set the governance address", async function() {
      expect(await strategy.governance()).to.equal(owner.address);
    });
    it("should set the vault address", async function() {
      expect(await strategy.vault()).to.equal(vault.address);
    });
    it("should start inactive", async function() {
      expect(await strategy.isActive()).to.equal(false);
    });
  });

  describe("setGovernance", function() {
    it("should allow governance to set new governance address", async function() {
      expect(await strategy.governance()).to.equal(owner.address);
      await strategy.connect(owner).setGovernance(newOwner.address);
      expect(await strategy.governance()).to.equal(owner.address);
      expect(await strategy.newGovernance()).to.equal(newOwner.address);
      let tx = await strategy.connect(newOwner).acceptGovernance();
      await expect(tx)
        .to.emit(strategy, "GovernanceTransferred")
        .withArgs(newOwner.address);
      expect(await strategy.governance()).to.equal(newOwner.address);
      expect(await strategy.newGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("should revert if not called by governance", async function() {
      await expect(strategy.connect(depositor1).setGovernance(depositor1.address)).to.be.revertedWith("!governance");
      await strategy.connect(owner).setGovernance(newOwner.address);
      await expect(strategy.connect(depositor1).acceptGovernance()).to.be.revertedWith("!governance");
    });
  });

  describe("setVault", function() {
    it("should allow governance to set new Vault address", async function() {
      await strategy.connect(owner).setVault(newVault.address);
      expect(await strategy.vault()).to.equal(newVault.address);
    });
    it("should revert if not called by governance", async function() {
      await expect(strategy.connect(depositor1).setVault(newVault.address)).to.be.revertedWith("!governance");
    });
  });

  describe("setEmergencyExit", function() {
    beforeEach("set strategy address and make initial deposit", async function() {
      await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
      await strategy.connect(owner).setVault(vault.address);
      await vault.connect(depositor1).deposit({ value: testDepositAmount });
      await strategy.connect(owner).harvest();
    });
    it("should revert if not called by governance", async function() {
      await expect(strategy.connect(depositor1).setEmergencyExit()).to.be.revertedWith("!governance");
    });
    it("should allow governance to call emergency exit", async function() {
      await strategy.connect(owner).setEmergencyExit();
      expect(await strategy.emergencyExit()).to.be.true;
    });
    it("should emit StrategyRevoked event from Vault", async function() {
      expect(await strategy.connect(owner).setEmergencyExit())
        .to.emit(vault, "StrategyRevoked")
        .withArgs(strategy.address);
    });
    it("should set the debtRatio of strategy to 0", async function() {
      let strategyObject = await vault.strategies(strategy.address);
      expect(strategyObject.debtRatio).to.equal(debtRatio);
      await strategy.connect(owner).setEmergencyExit();
      strategyObject = await vault.strategies(strategy.address);
      expect(strategyObject.debtRatio).to.equal(0);
    });
    it("should reduce the Vault's debtRatio by revoked Strategy's debtRatio", async function() {
      let vaultDebtRatio = await vault.debtRatio();
      expect(vaultDebtRatio).to.equal(debtRatio);
      let strategyObject = await vault.strategies(strategy.address);
      expect(strategyObject.debtRatio).to.equal(debtRatio);
      await strategy.connect(owner).setEmergencyExit();
      strategyObject = await vault.strategies(strategy.address);
      vaultDebtRatio = await vault.debtRatio();
      expect(strategyObject.debtRatio).to.equal(0);
      expect(vaultDebtRatio).to.equal(0);
    });
    it("should remain active until full withdraw", async function() {
      expect(await strategy.isActive()).to.equal(true);
      await strategy.connect(owner).setEmergencyExit();
      expect(await strategy.isActive()).to.equal(true);
      await vault.connect(depositor1).withdraw(testDepositAmount, 0);
      expect(await strategy.isActive()).to.equal(false);
    });
  });

  describe("deposit", function() {
    beforeEach("set strategy address and make initial deposit", async function() {
      await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
      await strategy.connect(owner).setVault(vault.address);
      await vault.connect(depositor1).deposit({ value: testDepositAmount });
    });

    it("should allow vault to deposit WETH into the contract", async function() {
      await strategy.connect(owner).harvest();
      expect(await strategy.estimatedTotalAssets()).to.equal(testDepositAmount.div(MAX_BPS / debtRatio));
    });
  });

  describe("harvest", function() {
    beforeEach("set strategy address and make initial deposit", async function() {
      await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
      await strategy.connect(owner).setVault(vault.address);
      await vault.connect(depositor1).deposit({ value: testDepositAmount });
    });

    it("should revert if not called by governance", async function() {
      await expect(strategy.connect(depositor1).harvest()).to.be.revertedWith("!governance");
    });

    it("should increase the Vault's debtRatio that can be taken on by Strategy", async function() {
      let vaultDebtRatio = await vault.debtRatio();
      expect(vaultDebtRatio).to.equal(debtRatio);
      await strategy.connect(owner).harvest();
      vaultDebtRatio = await vault.debtRatio();
      expect(vaultDebtRatio).to.equal(debtRatio);
    });

    it("should emit Harvested event", async function() {
      expect(await strategy.connect(owner).harvest())
        .to.emit(strategy, "Harvested")
        .withArgs(0, 0, 0, 0);
    });

    it("should allow governance to call harvest", async function() {
      let vaultBalance = await weth.balanceOf(vault.address);
      let strategyBalance = await strategy.estimatedTotalAssets();
      expect(vaultBalance).to.equal(testDepositAmount);
      expect(strategyBalance).to.equal(0);

      await strategy.connect(owner).harvest();

      strategyBalance = await strategy.estimatedTotalAssets();
      vaultBalance = await weth.balanceOf(vault.address);
      expect(strategyBalance).to.equal(testDepositAmount.div(MAX_BPS / debtRatio));
      expect(vaultBalance).to.equal(testDepositAmount.sub(testDepositAmount.div(MAX_BPS / debtRatio)));
    });

    it("should allow harvest while in emergency exit", async function() {
      await strategy.connect(owner).setEmergencyExit();
      await expect(await strategy.connect(owner).harvest())
        .to.emit(strategy, "Harvested")
        .withArgs(0, 0, 0, 0);
    });

    it("should allow harvest with profit while in emergency exit", async function() {
      let profitAmount = 100;
      //await weth.connect(depositor1).depositTo(strategy.address, {value: profitAmount});
      await weth.connect(depositor1).deposit({ value: profitAmount });
      await weth.connect(depositor1).transfer(strategy.address, profitAmount);
      await strategy.connect(owner).setEmergencyExit();
      await expect(await strategy.connect(owner).harvest())
        .to.emit(strategy, "Harvested")
        .withArgs(profitAmount, 0, 0, 0);
    });

    it("should liquidate position", async function() {
      let lossAmount = BN.from(1);
      await strategy.connect(owner).harvest();
      await strategy._takeFunds(lossAmount);
      await strategy.connect(owner).setEmergencyExit();
      await expect(await strategy.connect(owner).harvest())
        .to.emit(strategy, "Harvested")
        .withArgs(0, lossAmount, 0, 0);
    });
  });

  describe("withdraw", function() {
    beforeEach("set strategy address and make initial deposit", async function() {
      await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
      await vault.connect(depositor1).deposit({ value: testDepositAmount });
      await strategy.connect(owner).harvest();
    });

    it("should revert if not called by vault", async function() {
      await expect(strategy.connect(depositor1).withdraw(testDepositAmount)).to.be.revertedWith("!vault");
    });
  });
});
