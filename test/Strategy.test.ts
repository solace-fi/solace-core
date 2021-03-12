import chai from "chai";
import { waffle } from "hardhat";
import VaultArtifact from '../artifacts/contracts/Vault.sol/Vault.json'
import StrategyArtifact from '../artifacts/contracts/mocks/MockStrategy.sol/MockStrategy.json'
import WETHArtifact from '../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json'
import { Vault, MockStrategy, MockToken, MockWeth } from "../typechain";

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);

describe("Strategy", function () {
    let vault: Vault;
    let newVault: Vault;
    let weth: MockWeth;
    let strategy: MockStrategy;

    const [owner, newOwner, depositor1] = provider.getWallets();
    const testDepositAmount = 5;
    const testInvestmentAmount = 3;

    const debtRatio = 10;
    const minDebtPerHarvest = 0;
    const maxDebtPerHarvest = 50;
    const performanceFee = 10;

    beforeEach(async () => {
        weth = (await deployContract(
            owner,
            WETHArtifact
        )) as MockWeth;

        vault = (await deployContract(
            owner,
            VaultArtifact,
            [weth.address]
        )) as Vault;

        newVault = (await deployContract(
            owner,
            VaultArtifact,
            [weth.address]
        )) as Vault;

        strategy = (await deployContract(
            owner,
            StrategyArtifact,
            [vault.address]
        )) as MockStrategy;
    });

    describe("deployment", function () {

        it("should set the governance address", async function () {
            expect(await strategy.governance()).to.equal(owner.address);
        });

        it("should set the vault address", async function () {
            expect(await strategy.vault()).to.equal(vault.address);
        });

    });

    describe("setGovernance", function () {

        it("should allow governance to set new governance address", async function () {
            await strategy.connect(owner).setGovernance(newOwner.address);
            expect(await strategy.governance()).to.equal(newOwner.address);
        });

        it("should revert if not called by governance", async function () {
            await expect(strategy.connect(depositor1).setGovernance(depositor1.address)).to.be.revertedWith("!governance");
        });

    });

    describe("setVault", function () {

        it("should allow governance to set new Vault address", async function () {
            await strategy.connect(owner).setVault(newVault.address);
            expect(await strategy.vault()).to.equal(newVault.address);
        });

        it("should revert if not called by governance", async function () {
            await expect(strategy.connect(depositor1).setVault(newVault.address)).to.be.revertedWith("!governance");
        });

    });

    describe("deposit", function () {
        beforeEach('set strategy address and make initial deposit', async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await strategy.connect(owner).setVault(vault.address);
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
        })

        it("should allow vault to deposit WETH into the contract", async function () {
            await vault.connect(owner).invest(strategy.address, testInvestmentAmount);
            expect(await strategy.estimatedTotalAssets()).to.equal(testInvestmentAmount);
        });

        it("should revert if not called by vault", async function () {
            await expect(strategy.connect(depositor1).deposit()).to.be.revertedWith("!vault");
        });

    });

    describe("withdraw", function () {
        beforeEach('set strategy address and make initial deposit', async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
            await vault.connect(owner).invest(strategy.address, testInvestmentAmount);
        })

        it("should revert if not called by vault", async function () {
            await expect(strategy.connect(depositor1).withdraw(testDepositAmount)).to.be.revertedWith("!vault");
        });

    });
});

