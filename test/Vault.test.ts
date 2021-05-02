import chai from "chai";
import { ethers, waffle } from "hardhat";
import VaultArtifact from '../artifacts/contracts/Vault.sol/Vault.json'
import MasterArtifact from '../artifacts/contracts/Master.sol/Master.json';
import SolaceArtifact from '../artifacts/contracts/SOLACE.sol/SOLACE.json';
import StrategyArtifact from '../artifacts/contracts/mocks/MockStrategy.sol/MockStrategy.json'
import WETHArtifact from '../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json'
import RegistryArtifact from "../artifacts/contracts/Registry.sol/Registry.json";
import ClaimsAdjustorArtifact from '../artifacts/contracts/ClaimsAdjustor.sol/ClaimsAdjustor.json';
import ClaimsEscrowArtifact from '../artifacts/contracts/ClaimsEscrow.sol/ClaimsEscrow.json';
import { BigNumber as BN, constants } from 'ethers';
import { getPermitDigest, sign, getDomainSeparator } from './utilities/signature';
import { Vault, MockStrategy, MockWeth, Registry, Master, Solace, ClaimsAdjustor, ClaimsEscrow } from "../typechain";

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);

describe("Vault", function () {
    let vault: Vault;
    let weth: MockWeth;
    let strategy: MockStrategy;
    let unaddedStrategy: MockStrategy;
    let registry: Registry;
    let master: Master;
    let solace: Solace;
    let claimsAdjustor: ClaimsAdjustor;
    let claimsEscrow: ClaimsEscrow;

    const [owner, newOwner, depositor1, depositor2, claimant] = provider.getWallets();
    const tokenName = "Solace CP Token";
    const tokenSymbol = "SCP";
    const testDepositAmount = BN.from("10");
    const testClaimAmount = BN.from("2");
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const chainId = 31337;

    const debtRatio = 1000; // debt ratio is % of MAX_BPS
    const minDebtPerHarvest = 0;
    const maxDebtPerHarvest = BN.from("2");
    const performanceFee = 0;
    const maxLoss = 1; // 0.01% BPS

    const newDegration = 10 ** 15;
    const newMinCapitalRequirement = BN.from("10");
    const deadline = constants.MaxUint256;

    const solacePerBlock: BN = BN.from("100000000000000000000"); // 100 e18

    const newDebtRatio = 2000;
    const newMinDebtPerHarvest = BN.from("2");
    const newMaxDebtPerHarvest = BN.from("5");
    const newPerformanceFee = BN.from("10");

    const MAX_BPS = 10000;

    beforeEach(async () => {
        weth = (await deployContract(
            owner,
            WETHArtifact
        )) as MockWeth;

        solace = (await deployContract(
            owner,
            SolaceArtifact,
            [
              newOwner.address,
            ]
        )) as Solace;

        master = (await deployContract(
            owner,
            MasterArtifact,
            [
                newOwner.address,
                solace.address,
                solacePerBlock
            ]
        )) as Master;

        registry = (await deployContract(
            owner,
            RegistryArtifact,
            [
              owner.address
            ]
        )) as Registry;

        vault = (await deployContract(
            owner,
            VaultArtifact,
            [owner.address, registry.address, weth.address]
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

        claimsEscrow = (await deployContract(
            owner,
            ClaimsEscrowArtifact,
            [registry.address]
        )) as ClaimsEscrow;

        claimsAdjustor = (await deployContract(
            owner,
            ClaimsAdjustorArtifact,
            [registry.address]
        )) as ClaimsAdjustor;

        await registry.setVault(vault.address);
        await registry.setMaster(master.address);
        await registry.setClaimsAdjustor(claimsAdjustor.address);
        await registry.setClaimsEscrow(claimsEscrow.address);
    });

    describe("deployment", function () {
        it("should set the right token name and symbol", async function () {
            expect(await vault.name()).to.equal(tokenName);
            expect(await vault.symbol()).to.equal(tokenSymbol);
        });
        it("should set the governance address", async function () {
            expect(await vault.governance()).to.equal(owner.address);
        });
        it('should initialize DOMAIN_SEPARATOR correctly', async () => {
            expect(await vault.DOMAIN_SEPARATOR()).to.equal(getDomainSeparator(tokenName, vault.address, chainId));
        })
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

    describe("setMinCapitalRequirement", function () {
        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).setMinCapitalRequirement(newMinCapitalRequirement)).to.be.revertedWith("!governance");
        });
        it("should successfully set the new lockedProfitDegation", async function () {
            await vault.connect(owner).setMinCapitalRequirement(newMinCapitalRequirement);
            const callMCR = await vault.minCapitalRequirement();
            expect(callMCR).to.equal(newMinCapitalRequirement);
        });
    });

    describe("setPerformanceFee", function () {
        it("should revert if not called by governance", async function () {
            const fee = 1000;
            await expect(vault.connect(depositor1).setPerformanceFee(fee)).to.be.revertedWith("!governance");
        });
        it("should revert if new fee exceeds MAX_BPS", async function () {
            const invalidFee = 11000;
            await expect(vault.connect(owner).setPerformanceFee(invalidFee)).to.be.revertedWith("cannot exceed MAX_BPS");
        });
        it("should successfully set the new performanceFee", async function () {
            const fee = 1000;
            await vault.connect(owner).setPerformanceFee(fee);
            expect(await vault.performanceFee()).to.equal(fee);
        });
    });

    describe("setEmergencyShutdown", function () {
        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).setEmergencyShutdown(true)).to.be.revertedWith("!governance");
        });
        it("should successfully toggle emergency shutdown state in Vault", async function () {
            await vault.connect(owner).setEmergencyShutdown(true);
            let callShutdownState = await vault.emergencyShutdown();
            expect(callShutdownState).to.be.true;
            await vault.connect(owner).setEmergencyShutdown(false);
            callShutdownState = await vault.emergencyShutdown();
            expect(callShutdownState).to.be.false;
        });
    });

    describe("updateStrategyDebtRatio", function () {
        beforeEach('set investment address and make initial deposit', async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
        });
        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).updateStrategyDebtRatio(strategy.address, newDebtRatio)).to.be.revertedWith("!governance");
        });
        it("should revert if not an active strategy address", async function () {
            await expect(vault.connect(owner).updateStrategyDebtRatio(unaddedStrategy.address, newDebtRatio)).to.be.revertedWith("must be a current strategy");
        });
        it("should update debtRatio for specified strategy", async function () {
            await vault.connect(owner).updateStrategyDebtRatio(strategy.address, newDebtRatio);
            expect((await vault.strategies(strategy.address)).debtRatio).to.equal(newDebtRatio);
        });
        it("should emit StrategyUpdateDebtRatio event with correct params", async function () {
            expect(await vault.connect(owner).updateStrategyDebtRatio(strategy.address, newDebtRatio)).to.emit(vault, 'StrategyUpdateDebtRatio').withArgs(strategy.address, newDebtRatio);
        });
    });

    describe("updateStrategyMinDebtPerHarvest", function () {
        beforeEach('set investment address and make initial deposit', async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
        });
        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).updateStrategyMinDebtPerHarvest(strategy.address, newMinDebtPerHarvest)).to.be.revertedWith("!governance");
        });
        it("should revert if not an active strategy address", async function () {
            await expect(vault.connect(owner).updateStrategyMinDebtPerHarvest(unaddedStrategy.address, newMinDebtPerHarvest)).to.be.revertedWith("must be a current strategy");
        });
        it("should revert if input newMinDebtPerHarvest exceeds current maxDebtPerHarvest", async function () {
            const invalidMinDebtPerHarvest = BN.from("6");
            await expect(vault.connect(owner).updateStrategyMinDebtPerHarvest(strategy.address, invalidMinDebtPerHarvest)).to.be.revertedWith("cannot exceed Strategy maxDebtPerHarvest");
        });
        it("should update minDebtPerHarvest for specified strategy", async function () {
            await vault.connect(owner).updateStrategyMinDebtPerHarvest(strategy.address, newMinDebtPerHarvest);
            expect((await vault.strategies(strategy.address)).minDebtPerHarvest).to.equal(newMinDebtPerHarvest);
        });
        it("should emit StrategyUpdateDebtRatio event with correct params", async function () {
            expect(await vault.connect(owner).updateStrategyMinDebtPerHarvest(strategy.address, newMinDebtPerHarvest)).to.emit(vault, 'StrategyUpdateMinDebtPerHarvest').withArgs(strategy.address, newMinDebtPerHarvest);
        });
    });

    describe("updateStrategyMaxDebtPerHarvest", function () {
        beforeEach('set investment address and make initial deposit', async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
        });
        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).updateStrategyMaxDebtPerHarvest(strategy.address, newMaxDebtPerHarvest)).to.be.revertedWith("!governance");
        });
        it("should revert if not an active strategy address", async function () {
            await expect(vault.connect(owner).updateStrategyMaxDebtPerHarvest(unaddedStrategy.address, newMaxDebtPerHarvest)).to.be.revertedWith("must be a current strategy");
        });
        it("should revert if input newMaxDebtPerHarvest is below current minDebtPerHarvest", async function () {
            await vault.connect(owner).updateStrategyMinDebtPerHarvest(strategy.address, newMinDebtPerHarvest);
            const invalidMaxDebtPerHarvest = BN.from("1");
            await expect(vault.connect(owner).updateStrategyMaxDebtPerHarvest(strategy.address, invalidMaxDebtPerHarvest)).to.be.revertedWith("cannot be lower than Strategy minDebtPerHarvest");
        });
        it("should update maxDebtPerHarvest for specified strategy", async function () {
            await vault.connect(owner).updateStrategyMaxDebtPerHarvest(strategy.address, newMaxDebtPerHarvest);
            expect((await vault.strategies(strategy.address)).maxDebtPerHarvest).to.equal(newMaxDebtPerHarvest);
        });
        it("should emit StrategyUpdateDebtRatio event with correct params", async function () {
            expect(await vault.connect(owner).updateStrategyMaxDebtPerHarvest(strategy.address, newMaxDebtPerHarvest)).to.emit(vault, 'StrategyUpdateMaxDebtPerHarvest').withArgs(strategy.address, newMaxDebtPerHarvest);
        });
    });

    describe("updateStrategyPerformanceFee", function () {
        beforeEach('set investment address and make initial deposit', async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
        });
        it("should revert if not called by governance", async function () {
            await expect(vault.connect(depositor1).updateStrategyPerformanceFee(strategy.address, newPerformanceFee)).to.be.revertedWith("!governance");
        });
        it("should revert if not an active strategy address", async function () {
            await expect(vault.connect(owner).updateStrategyPerformanceFee(unaddedStrategy.address, newPerformanceFee)).to.be.revertedWith("must be a current strategy");
        });
        it("should revert newPerformanceFee exceeds MAX_BPS - vault performanceFee", async function () {
            // set to 90% of MAX_BPS
            const vaultPerformanceFee = 9000;
            await vault.connect(owner).setPerformanceFee(vaultPerformanceFee);
            // ... then exceed that for invalid performance fee
            const invalidPerformanceFee = 2000;
            await expect(vault.connect(owner).updateStrategyPerformanceFee(strategy.address, invalidPerformanceFee)).to.be.revertedWith("cannot exceed MAX_BPS after Vault performanceFee is deducted");
        });
        it("should update performanceFee for specified strategy", async function () {
            await vault.connect(owner).updateStrategyPerformanceFee(strategy.address, newPerformanceFee);
            expect((await vault.strategies(strategy.address)).performanceFee).to.equal(newPerformanceFee);
        });
        it("should emit StrategyUpdateDebtRatio event with correct params", async function () {
            expect(await vault.connect(owner).updateStrategyPerformanceFee(strategy.address, newPerformanceFee)).to.emit(vault, 'StrategyUpdatePerformanceFee').withArgs(strategy.address, newPerformanceFee);
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
        it("should revert if vault is in emergency shutdown", async function () {
            await vault.connect(owner).setEmergencyShutdown(true);
            await expect(vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee)).to.be.revertedWith("vault is in emergency shutdown");
        });
        it("should update the Vault's debtRatio by the new strategy's debtRatio", async function () {
            let vaultDebtRatioBefore = await vault.debtRatio();
            expect(vaultDebtRatioBefore).to.equal(0);
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            let vaultDebtRatioAfter = await vault.debtRatio();
            expect(vaultDebtRatioAfter.sub(vaultDebtRatioBefore)).to.equal(debtRatio);

            await vault.connect(owner).addStrategy(unaddedStrategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            vaultDebtRatioAfter = await vault.debtRatio();
            expect(vaultDebtRatioAfter).to.equal(debtRatio * 2);
        });
    });

    describe("maxRedeemableShares", function () {
        it("should return the correct maxRedeemableShares - user can withdraw entire CP token balance", async function () {
            // set the MCR to be 10
            let newMCR = BN.from("10");
            await vault.connect(owner).setMinCapitalRequirement(newMCR);

            // bring Vault assets to 20
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
            await vault.connect(depositor2).deposit({ value: testDepositAmount.mul(10)});

            // CP should be able to withdraw their full 10 shares
            const callBalance = await vault.balanceOf(depositor1.address);
            expect(await vault.maxRedeemableShares(depositor1.address)).to.equal(callBalance);
        });
        it("should return the correct maxRedeemableShares - user can withdraw up to a portion of their CP token balance", async function () {
            let newMCR = BN.from("2");
            await vault.connect(owner).setMinCapitalRequirement(newMCR);
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
            const callBalance = await vault.balanceOf(depositor1.address);
            expect(await vault.maxRedeemableShares(depositor1.address)).to.equal(callBalance.sub(newMCR));

        });
    });

    describe("revokeStrategy", function () {
        it("should revert if not called by governance or active strategy", async function () {
            await expect(vault.connect(depositor1).revokeStrategy(strategy.address)).to.be.revertedWith("must be called by governance or strategy to be revoked");
        });
        it("should allow governance to revoke a strategy", async function () {
            await vault.connect(owner).revokeStrategy(strategy.address);
        });
    });

    describe("withdrawal queue management", function () {
        beforeEach('set investment address and make initial deposit', async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
        });
        describe("setWithdrawalQueue", function () {
            it("should revert if not called by governance", async function () {
                await expect(vault.connect(depositor1).setWithdrawalQueue([strategy.address, unaddedStrategy.address])).to.be.revertedWith("!governance");
            });
            it("should allow governance to set a new withdrawal queue", async function () {
                await vault.connect(owner).addStrategy(unaddedStrategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
                expect(await vault.withdrawalQueue(0)).to.equal(strategy.address);
                expect(await vault.withdrawalQueue(1)).to.equal(unaddedStrategy.address);
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
                expect(await vault.connect(owner).addStrategyToQueue(unaddedStrategy.address)).to.emit(vault, 'StrategyAddedToQueue').withArgs(unaddedStrategy.address);
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

    describe("report", function () {
        it("should revert if not called by strategy", async function () {
            await expect(vault.connect(depositor1).report(100, 10, 20 )).to.be.revertedWith("must be called by an active strategy");
            await expect(vault.connect(owner).report(100, 10, 20)).to.be.revertedWith("must be called by an active strategy");
        });
        it("should emit StrategyReported event", async function () {
            // Set strategy address and make initial deposit
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await strategy.connect(owner).setVault(vault.address);
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
            // report() is called indirectly by governance through startegy.harvest()
            expect(await strategy.connect(owner).harvest()).to.emit(vault, 'StrategyReported').withArgs(
                strategy.address,
                0, // gain
                0, // loss
                0, // debtPaid
                0, // totalGain
                0, // totalLoss
                testDepositAmount.div(MAX_BPS / debtRatio), // totalDebt
                testDepositAmount.div(MAX_BPS / debtRatio), // debtAdded
                debtRatio // debtRatio
            );
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

            expect(await vault.totalDebt()).to.equal(0);
        });
        it('should emit Transfer event as CP tokens are minted', async function () {
            expect(await vault.connect(depositor1).deposit({ value: testDepositAmount})).to.emit(vault, 'Transfer').withArgs(ZERO_ADDRESS, depositor1.address, testDepositAmount);
        });
        it('should emit DepositMade event after function logic is successful', async function () {
            expect(await vault.connect(depositor1).deposit({ value: testDepositAmount})).to.emit(vault, 'DepositMade').withArgs(depositor1.address, testDepositAmount, testDepositAmount);
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
        it("should revert if withdrawal brings Vault's totalAssets below the minimum capital requirement", async function () {
            let cpBalance = await vault.balanceOf(depositor1.address);
            let newMCR = cpBalance.toString();
            await vault.connect(owner).setMinCapitalRequirement(newMCR);
            await expect(vault.connect(depositor1).withdraw(cpBalance, maxLoss)).to.be.revertedWith("withdrawal brings Vault assets below MCR");
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
                await strategy.connect(owner).harvest();
            })
            it("should alter WETH balance of Strategy contract by amountNeeded", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                await expect(() => vault.connect(depositor1).withdraw(cpBalance, maxLoss)).to.changeTokenBalance(weth, strategy,  testDepositAmount.div(MAX_BPS / debtRatio).mul( -1));
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
                await expect(await vaultDepositorSigner.withdraw(cpBalance, maxLoss)).to.emit(vault, 'WithdrawalMade').withArgs(depositor1.address, testDepositAmount);
            });
        });
    });

    describe("processClaim", function () {
        beforeEach("deposit", async function () {
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
        });
        it("should revert if not called by the claimsAdjustor", async function () {
            await expect(vault.connect(owner).processClaim(claimant.address, testClaimAmount)).to.be.revertedWith("!claimsAdjustor");
        });
        it('should transfer ETH to the ClaimsEscrow contract', async function () {
            await expect(() => claimsAdjustor.connect(owner).approveClaim(claimant.address, testClaimAmount)).to.changeEtherBalance(claimsEscrow, testClaimAmount);
        });
        it('should emit ClaimProcessed event after function logic is successful', async function () {
            expect(await claimsAdjustor.connect(owner).approveClaim(claimant.address, testClaimAmount)).to.emit(vault, 'ClaimProcessed').withArgs(claimant.address, testClaimAmount);
        });
    });

});
