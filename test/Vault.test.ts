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

describe("Vault", function () {
    let vault: Vault;
    let weth: MockWeth;
    let strategy: MockStrategy;

    const [owner, newOwner, depositor1, depositor2] = provider.getWallets();
    const tokenName = "Solace CP Token";
    const tokenSymbol = "SCP";
    const testDepositAmount = 5;
    const testInvestmentAmount = 3;
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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

        strategy = (await deployContract(
            owner,
            StrategyArtifact,
            [vault.address]
        )) as MockStrategy;
    });

    describe("deployment", function () {

        it("should set the right token name and symbol", async function () {
            expect(await vault.name()).to.equal(tokenName);
            expect(await vault.symbol()).to.equal(tokenSymbol);
        });

        it("should set the governance address", async function () {
            expect(await vault.governance()).to.equal(owner.address);
        });

    });

    describe("setGovernance", function () {

        it("should allow governance to set new governance address", async function () {
            await vault.connect(owner).setGovernance(newOwner.address);
            expect(await vault.governance()).to.equal(newOwner.address);
        });

        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).setGovernance(depositor1.address)).to.be.revertedWith("!governance");
        });

    });

    describe("addStrategy", function () {

        it("should allow governance to approve a new strategy", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            expect((await vault.strategies(strategy.address)).debtRatio).to.equal(debtRatio);
            expect((await vault.strategies(strategy.address)).minDebtPerHarvest).to.equal(minDebtPerHarvest);
            expect((await vault.strategies(strategy.address)).maxDebtPerHarvest).to.equal(maxDebtPerHarvest);
            expect((await vault.strategies(strategy.address)).performanceFee).to.equal(performanceFee);
        });

        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee)).to.be.revertedWith("!governance");
        });

    });

    describe("deposit", function () {

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

            await vault.connect(depositor2).deposit({ value: testDepositAmount});
            expect(await vault.balanceOf(depositor2.address)).to.equal(testDepositAmount);

            expect(await weth.balanceOf(vault.address)).to.equal(testDepositAmount * 2);
        });

        it('should emit Transfer event as CP tokens are minted', async function () {
            expect(await vault.connect(depositor1).deposit({ value: testDepositAmount})).to.emit(vault, 'Transfer').withArgs(ZERO_ADDRESS, depositor1.address, testDepositAmount);
        })

    });

    describe("invest", function () {
        
        beforeEach('set investment address and make initial deposit', async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
        })

        it("should allow governance to send ETH from Vault to Investment contract", async function () {
            await expect(() => vault.connect(owner).invest(strategy.address, testInvestmentAmount)).to.changeTokenBalance(weth, strategy, testInvestmentAmount);
        });

        it("should revert if not an approved strategy", async function () {
            await expect(vault.connect(owner).invest(weth.address, testInvestmentAmount)).to.be.revertedWith("must be an approved strategy");
        });

        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).invest(strategy.address, testInvestmentAmount)).to.be.revertedWith("!governance");
        });
    });

    describe("withdraw", function () {
        beforeEach("deposit", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
        })

        context("when there is enough WETH in the Vault", function () {
            it("should alter WETH balance of Vault contract by amountNeeded", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                await expect(() => vault.connect(depositor1).withdraw(cpBalance)).to.changeTokenBalance(weth, vault, testDepositAmount * -1);
            });
            
            it("should only use WETH from Vault if Vault balance is sufficient", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
    
                expect(await vault.connect(depositor1).withdraw(cpBalance)).to.changeEtherBalance(depositor1, testDepositAmount);
    
                expect(await vault.balanceOf(depositor1.address)).to.equal(0);
                expect(await weth.balanceOf(vault.address)).to.equal(0);
                expect(await weth.balanceOf(strategy.address)).to.equal(0);
            });
        });

        context("when there is not enough WETH in the Vault", function () {
            beforeEach("invest", async function () {
                await vault.connect(owner).invest(strategy.address, testInvestmentAmount);
            })
            it("should alter WETH balance of Strategy contract by amountNeeded", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                await expect(() => vault.connect(depositor1).withdraw(cpBalance)).to.changeTokenBalance(weth, strategy, testInvestmentAmount * -1);
            });
            it("should withdraw difference from Investment contract", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                expect(await vault.connect(depositor1).withdraw(cpBalance)).to.changeEtherBalance(depositor1, testDepositAmount);
                expect(await vault.balanceOf(depositor1.address)).to.equal(0);
            });
        });
    });
});

