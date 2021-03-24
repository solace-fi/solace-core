import chai from "chai";
import { waffle } from "hardhat";
import VaultArtifact from '../artifacts/contracts/Vault.sol/Vault.json'
import StrategyArtifact from '../artifacts/contracts/mocks/MockStrategy.sol/MockStrategy.json'
import WETHArtifact from '../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json'
import { BigNumber as BN } from 'ethers';
import { Vault, MockStrategy, MockWeth } from "../typechain";

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);

describe("Vault", function () {
    let vault: Vault;
    let weth: MockWeth;
    let strategy: MockStrategy;
    let unaddedStrategy: MockStrategy;

    const [owner, newOwner, depositor1, depositor2] = provider.getWallets();
    const tokenName = "Solace CP Token";
    const tokenSymbol = "SCP";
    const testDepositAmount = BN.from("5");
    const testInvestmentAmount = BN.from("3");
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

    const debtRatio = 1000;
    const minDebtPerHarvest = 0;
    const maxDebtPerHarvest = 100000;
    const performanceFee = 0;
    const maxLoss = 1; // 0.01% BPS
    const newDegration = 10 ** 15;

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

        unaddedStrategy = (await deployContract(
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

    describe("setLockedProfitDegration", function () {

        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).setLockedProfitDegration(newDegration)).to.be.revertedWith("!governance");
        });
        
        it("should successfully set the new lockedProfitDegation", async function () {
            await vault.connect(owner).setLockedProfitDegration(newDegration);
            const callLockedProfitDegration = await vault.lockedProfitDegration();
            expect(callLockedProfitDegration).to.equal(newDegration);
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

            const callTotalAssets = await vault.totalAssets();
            const callTotalSupply = await vault.totalSupply();

            await vault.connect(depositor2).deposit({ value: testDepositAmount});
            expect(await vault.balanceOf(depositor2.address)).to.equal(testDepositAmount.mul(callTotalSupply).div(callTotalAssets));

            expect(await weth.balanceOf(vault.address)).to.equal(testDepositAmount.mul(2));
        });

        it('should emit Transfer event as CP tokens are minted', async function () {
            expect(await vault.connect(depositor1).deposit({ value: testDepositAmount})).to.emit(vault, 'Transfer').withArgs(ZERO_ADDRESS, depositor1.address, testDepositAmount);
        });

        it('should emit DepositMade event after function logic is successful', async function () {
            expect(await vault.connect(depositor1).deposit({ value: testDepositAmount})).to.emit(vault, 'DepositMade').withArgs(depositor1.address, testDepositAmount, testDepositAmount);
        });

    });

    describe("withdrawal queue management", function () {
        
        beforeEach('set investment address and make initial deposit', async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
        })

        describe("setWithdrawalQueue", function () {
            it("should revert if not called by governance", async function () {
                await expect(vault.connect(depositor1).setWithdrawalQueue([strategy.address, unaddedStrategy.address])).to.be.revertedWith("!governance");
            });
            it("should allow governance to set a new withdrawal queue", async function () {
                await vault.connect(owner).addStrategy(unaddedStrategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
                expect(await vault.connect(owner).setWithdrawalQueue([strategy.address, unaddedStrategy.address])).to.emit(vault, 'UpdateWithdrawalQueue').withArgs([strategy.address, unaddedStrategy.address]);
            });
        });

        describe("addStrategyToQueue", function () {
            it("should revert if not called by governance", async function () {
                await expect(vault.connect(depositor1).addStrategyToQueue(strategy.address)).to.be.revertedWith("!governance");
            });
            it("should revert if not an active strategy address", async function () {
                await expect(vault.connect(owner).addStrategyToQueue(unaddedStrategy.address)).to.be.revertedWith("must be a current strategy");
            });
            it("should revert if strategy is already in the queue", async function () {
                await expect(vault.connect(owner).addStrategyToQueue(strategy.address)).to.be.revertedWith("strategy already in queue");
            });
            it('should emit StrategyAddedToQueue event after function logic is successful', async function () {
                await vault.connect(owner).addStrategy(unaddedStrategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
                await vault.connect(owner).removeStrategyFromQueue(unaddedStrategy.address);
                // expect(await vault.connect(owner).addStrategyToQueue(unaddedStrategy.address)).to.emit(vault, 'StrategyAddedToQueue').withArgs(unaddedStrategy.address);
            });
        });

        describe("removeStrategyFromQueue", function () {
            it("should revert if not called by governance", async function () {
                await expect(vault.connect(depositor1).removeStrategyFromQueue(strategy.address)).to.be.revertedWith("!governance");
            });
            it("should revert if not an active strategy address", async function () {
                await expect(vault.connect(owner).removeStrategyFromQueue(unaddedStrategy.address)).to.be.revertedWith("must be a current strategy");
            });
            it('should emit StrategyRemovedFromQueue event after function logic is successful', async function () {
                expect(await vault.connect(owner).removeStrategyFromQueue(strategy.address)).to.emit(vault, 'StrategyRemovedFromQueue').withArgs(strategy.address);
            });
        });

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
            await expect(vault.connect(owner).invest(weth.address, testInvestmentAmount)).to.be.revertedWith("must be a current strategy");
        });

        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).invest(strategy.address, testInvestmentAmount)).to.be.revertedWith("!governance");
        });

        it('should emit InvestmentMade event after function logic is successful', async function () {
            expect(await vault.connect(owner).invest(strategy.address, testInvestmentAmount)).to.emit(vault, 'InvestmentMade').withArgs(strategy.address, testInvestmentAmount);
        });
    });

    describe("withdraw", function () {
        beforeEach("deposit", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
        });

        it("should revert if withdrawer tries to redeem more shares than they own", async function () {
            let cpBalance = await vault.balanceOf(depositor1.address);
            await expect(vault.connect(depositor1).withdraw(cpBalance.add(1), maxLoss)).to.be.revertedWith("cannot redeem more shares than you own");
        });

        context("when there is enough WETH in the Vault", function () {
            it("should alter WETH balance of Vault contract by amountNeeded", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                await expect(() => vault.connect(depositor1).withdraw(cpBalance, maxLoss)).to.changeTokenBalance(weth, vault, testDepositAmount.mul(-1));
            });
            
            it("should only use WETH from Vault if Vault balance is sufficient", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
    
                await expect(() => vault.connect(depositor1).withdraw(cpBalance, maxLoss)).to.changeEtherBalance(depositor1, testDepositAmount);
    
                expect(await vault.balanceOf(depositor1.address)).to.equal(0);
                expect(await weth.balanceOf(vault.address)).to.equal(0);
                expect(await weth.balanceOf(strategy.address)).to.equal(0);
            });

            it('should emit WithdrawalMade event after function logic is successful', async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                let vaultDepositorSigner = vault.connect(depositor1);
                expect(await vaultDepositorSigner.withdraw(cpBalance, maxLoss)).to.emit(vault, 'WithdrawalMade').withArgs(depositor1.address, testDepositAmount);
            });
        });

        context("when there is not enough WETH in the Vault", function () {
            beforeEach("invest", async function () {
                await vault.connect(owner).invest(strategy.address, testInvestmentAmount);
            })
            it("should alter WETH balance of Strategy contract by amountNeeded", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                await expect(() => vault.connect(depositor1).withdraw(cpBalance, maxLoss)).to.changeTokenBalance(weth, strategy, testInvestmentAmount.mul(-1));
            });

            it("should withdraw difference from Investment contract, burn user's vault shares and transfer ETH back to user", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                let vaultDepositorSigner = vault.connect(depositor1);
                await expect(() => vaultDepositorSigner.withdraw(cpBalance, maxLoss)).to.changeEtherBalance(depositor1, testDepositAmount);
                expect(await vault.balanceOf(depositor1.address)).to.equal(0);
            });

            it('should emit WithdrawalMade event after function logic is successful', async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                let vaultDepositorSigner = vault.connect(depositor1);
                expect(await vaultDepositorSigner.withdraw(cpBalance, maxLoss)).to.emit(vault, 'WithdrawalMade').withArgs(depositor1.address, testDepositAmount);
            });
        });
    });
});

