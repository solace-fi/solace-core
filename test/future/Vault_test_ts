import chai from "chai";
import { ethers, waffle } from "hardhat";
import { BigNumber as BN, constants } from "ethers";
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Vault, MockStrategy, Weth9, Registry, Master, Solace, ClaimsEscrow, PolicyManager } from "../typechain";

describe("Vault", function () {
    let artifacts: ArtifactImports;
    let vault: Vault;
    let weth: Weth9;
    let strategy: MockStrategy;
    let unaddedStrategy: MockStrategy;
    let thirdStrategy: MockStrategy;
    let registry: Registry;
    let master: Master;
    let solace: Solace;
    let claimsEscrow: ClaimsEscrow;
    let policyManager: PolicyManager;

    const [owner, newOwner, depositor1, depositor2, claimant, mockProduct, mockEscrow] = provider.getWallets();
    const tokenName = "Solace CP Token";
    const tokenSymbol = "SCP";
    const testDepositAmount = BN.from("10");
    const testClaimAmount = BN.from("2");
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
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

    before(async function () {
      artifacts = await import_artifacts();
    })

    beforeEach(async () => {
        weth = (await deployContract(
            owner,
            artifacts.WETH
        )) as Weth9;

        solace = (await deployContract(
            owner,
            artifacts.SOLACE,
            [
              newOwner.address,
            ]
        )) as Solace;

        master = (await deployContract(
            owner,
            artifacts.Master,
            [
                newOwner.address,
                solace.address,
                solacePerBlock
            ]
        )) as Master;

        registry = (await deployContract(
            owner,
            artifacts.Registry,
            [
              owner.address
            ]
        )) as Registry;

        vault = (await deployContract(
            owner,
            artifacts.Vault,
            [owner.address, registry.address, weth.address]
        )) as Vault;

        strategy = (await deployContract(
            owner,
            artifacts.MockStrategy,
            [vault.address]
        )) as MockStrategy;

        unaddedStrategy = (await deployContract(
            owner,
            artifacts.MockStrategy,
            [vault.address]
        )) as MockStrategy;

        thirdStrategy = (await deployContract(
            owner,
            artifacts.MockStrategy,
            [vault.address]
        )) as MockStrategy;

        claimsEscrow = (await deployContract(
            owner,
            artifacts.ClaimsEscrow,
            [owner.address, registry.address]
        )) as ClaimsEscrow;

        // deploy policy manager
        policyManager = (await deployContract(
          owner,
          artifacts.PolicyManager,
          [
            owner.address
          ]
        )) as PolicyManager;

        await registry.setVault(vault.address);
        await registry.setMaster(master.address);
        await registry.setClaimsEscrow(claimsEscrow.address);
        await registry.setPolicyManager(policyManager.address);
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
        })
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
        beforeEach("set investment address and make initial deposit", async function () {
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
            expect(await vault.connect(owner).updateStrategyDebtRatio(strategy.address, newDebtRatio)).to.emit(vault, "StrategyUpdateDebtRatio").withArgs(strategy.address, newDebtRatio);
        });
        it("should revert if debt ratio is too high", async function () {
            await expect(vault.connect(owner).updateStrategyDebtRatio(strategy.address, 10001)).to.be.revertedWith("Vault debt ratio cannot exceed MAX_BPS");
        })
    });

    describe("updateStrategyMinDebtPerHarvest", function () {
        beforeEach("set investment address and make initial deposit", async function () {
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
            expect(await vault.connect(owner).updateStrategyMinDebtPerHarvest(strategy.address, newMinDebtPerHarvest)).to.emit(vault, "StrategyUpdateMinDebtPerHarvest").withArgs(strategy.address, newMinDebtPerHarvest);
        });
    });

    describe("updateStrategyMaxDebtPerHarvest", function () {
        beforeEach("set investment address and make initial deposit", async function () {
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
            expect(await vault.connect(owner).updateStrategyMaxDebtPerHarvest(strategy.address, newMaxDebtPerHarvest)).to.emit(vault, "StrategyUpdateMaxDebtPerHarvest").withArgs(strategy.address, newMaxDebtPerHarvest);
        });
    });

    describe("updateStrategyPerformanceFee", function () {
        beforeEach("set investment address and make initial deposit", async function () {
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
            expect(await vault.connect(owner).updateStrategyPerformanceFee(strategy.address, newPerformanceFee)).to.emit(vault, "StrategyUpdatePerformanceFee").withArgs(strategy.address, newPerformanceFee);
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
        it("should revert if not a strategy", async function () {
          await expect(vault.connect(owner).addStrategy(ZERO_ADDRESS, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee)).to.be.revertedWith("strategy cannot be set to zero address");
        });
        it("should revert if debt ratio over max bps", async function () {
          await expect(vault.connect(owner).addStrategy(strategy.address, 10001, minDebtPerHarvest, maxDebtPerHarvest, performanceFee)).to.be.revertedWith("debtRatio exceeds MAX BPS");
        });
        it("should revert if invalid performance fee", async function () {
          await expect(vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, 10001)).to.be.revertedWith("invalid performance fee");
        });
        it("should revert if invalid mix/max debt per harvest", async function () {
          await expect(vault.connect(owner).addStrategy(strategy.address, debtRatio, maxDebtPerHarvest, minDebtPerHarvest, performanceFee)).to.be.revertedWith("minDebtPerHarvest exceeds maxDebtPerHarvest");
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
        it("should initially return zero", async function () {
            expect(await vault.maxRedeemableShares(depositor1.address)).to.equal(0);
        })
    });

    describe("revokeStrategy", function () {
        it("should revert if not called by governance or the strategy", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await expect(vault.connect(depositor1).revokeStrategy(strategy.address)).to.be.revertedWith("must be called by governance or strategy to be revoked");
        });
        it("should revert if a strategy is revoking another strategy", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(owner).addStrategy(unaddedStrategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await expect(strategy._revokeStrategy(unaddedStrategy.address)).to.be.revertedWith("must be called by governance or strategy to be revoked");
        });
        it("should revert if revoking an inactive strategy", async function () {
            await expect(vault.connect(owner).revokeStrategy(strategy.address)).to.be.revertedWith("must be a current strategy");
            await expect(strategy._revokeStrategy(strategy.address)).to.be.revertedWith("must be a current strategy");
        });
        it("should allow governance to revoke a strategy", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            let tx = await vault.connect(owner).revokeStrategy(strategy.address);
            await expect(tx).to.emit(vault, "StrategyRevoked").withArgs(strategy.address);
        });
        it("should allow a strategy to revoke itself", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            let tx = await strategy._revokeStrategy(strategy.address);
            await expect(tx).to.emit(vault, "StrategyRevoked").withArgs(strategy.address);
        });
    });

    describe("withdrawal queue management", function () {
        beforeEach("set investment address and make initial deposit", async function () {
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
                await vault.connect(owner).setWithdrawalQueue([unaddedStrategy.address, strategy.address]);
                expect(await vault.withdrawalQueue(0)).to.equal(unaddedStrategy.address);
                expect(await vault.withdrawalQueue(1)).to.equal(strategy.address);
            });
            it("should revert if set to invalid queue", async function () {
                await vault.connect(owner).addStrategy(unaddedStrategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
                expect(await vault.withdrawalQueue(0)).to.equal(strategy.address);
                expect(await vault.withdrawalQueue(1)).to.equal(unaddedStrategy.address);
                await expect(vault.connect(owner).setWithdrawalQueue([unaddedStrategy.address, ZERO_ADDRESS, strategy.address])).to.be.revertedWith("must be a current strategy");
            })
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
            it("should emit StrategyAddedToQueue event after function logic is successful", async function () {
                await vault.connect(owner).addStrategy(unaddedStrategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
                await vault.connect(owner).removeStrategyFromQueue(unaddedStrategy.address);
                await expect(await vault.connect(owner).addStrategyToQueue(unaddedStrategy.address)).to.emit(vault, "StrategyAddedToQueue").withArgs(unaddedStrategy.address);
            });
        });
        describe("removeStrategyFromQueue", function () {
            it("should revert if not called by governance", async function () {
                await expect(vault.connect(depositor1).removeStrategyFromQueue(strategy.address)).to.be.revertedWith("!governance");
            });
            it("should revert if not an active strategy address", async function () {
                await expect(vault.connect(owner).removeStrategyFromQueue(unaddedStrategy.address)).to.be.revertedWith("must be a current strategy");
            });
            it("should emit StrategyRemovedFromQueue event after function logic is successful", async function () {
                await expect(await vault.connect(owner).removeStrategyFromQueue(strategy.address)).to.emit(vault, "StrategyRemovedFromQueue").withArgs(strategy.address);
            });
            it("should revert if not in queue", async function () {
                await vault.connect(owner).removeStrategyFromQueue(strategy.address);
                await expect(vault.connect(owner).removeStrategyFromQueue(strategy.address)).to.be.revertedWith("strategy not in queue");
            });
        });
    });

    describe("report", function () {
        let depositAmount : number;
        let mockProfit : number;
        let mockLoss : number;
        beforeEach("set investment address and make initial deposit", async function () {
            depositAmount = 500;
            mockProfit = 20;
            mockLoss = 10;
        });
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
            expect(await strategy.connect(owner).harvest()).to.emit(vault, "StrategyReported").withArgs(
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
        it("should correctly account for losses reported by strategy", async function () {
            let maxDebt = BN.from("100");
            // Set strategy address and make initial deposit
            await vault.connect(owner).addStrategy(
                strategy.address,
                debtRatio,
                0, // minDebtPerHarvest
                maxDebt, // maxDebtPerHarvest
                performanceFee
            );
            await strategy.connect(owner).setVault(vault.address);

            await vault.connect(depositor1).deposit({ value: depositAmount });

            // seed debt in the strategy
            await strategy.connect(owner).harvest();

            // some funds should have been reallocated to the strategy (up to the `creditAvailable` determined by the strategy's debtRatio)
            expect(
                await weth.balanceOf(strategy.address))
                .to
                .equal(
                    maxDebt.gt(depositAmount / (MAX_BPS / debtRatio)) ? depositAmount / (MAX_BPS / debtRatio) : maxDebt
                );

            // take some funds from Strategy to simulate losses
            await strategy._takeFunds(mockLoss);

            // report losses through the vault through `strategy.harvest()`
            await strategy.connect(owner).harvest();

            expect((await vault.strategies(strategy.address)).totalLoss).to.equal(mockLoss);
        });
        it("should correctly account for gains reported by strategy", async function () {
            // Set strategy address and make initial deposit
            await vault.connect(owner).addStrategy(
                strategy.address,
                debtRatio,
                0, // minDebtPerHarvest
                100, // maxDebtPerHarvest
                performanceFee
            );
            await strategy.connect(owner).setVault(vault.address);

            await vault.connect(depositor1).deposit({ value: depositAmount });

            // seed debt in the strategy
            await strategy.connect(owner).harvest();
            expect((await vault.strategies(strategy.address)).totalDebt).to.equal(depositAmount / (MAX_BPS / debtRatio));

            // simulate profits
            await weth.connect(owner).deposit({ value: mockProfit });
            await weth.connect(owner).transfer(strategy.address, mockProfit);

            // report profits through the vault through `strategy.harvest()`
            await strategy.connect(owner).harvest();

            // should update the strategy's totalGain
            expect((await vault.strategies(strategy.address)).totalGain).to.equal(mockProfit);

            // simulate profits again
            await weth.connect(owner).deposit({ value: mockProfit });
            await weth.connect(owner).transfer(strategy.address, mockProfit);

            await expect(await strategy.connect(owner).harvest()).to.emit(vault, "StrategyReported").withArgs(
                strategy.address,
                20, // gain
                0, // loss
                0, // debtPaid
                mockProfit * 2, // totalGain - because we logged profit twice
                0, // totalLoss
                52, // totalDebt - because the Vault has gained profits (increase totalAssets), strategy can take on more debt
                2, // debtAdded
                debtRatio // debtRatio
            );
        });
        it("should rebalance as appropriate after strategy gains profits", async function () {
            // Set strategy address and make initial deposit
            await vault.connect(owner).addStrategy(
                strategy.address,
                debtRatio,
                0, // minDebtPerHarvest
                100, // maxDebtPerHarvest
                performanceFee
            );
            await strategy.connect(owner).setVault(vault.address);

            await vault.connect(depositor1).deposit({ value: depositAmount });

            // there should be creditAvailable after deposit
            expect(await vault.creditAvailable(strategy.address)).to.equal(depositAmount / (MAX_BPS / debtRatio));

            // seed debt in the strategy
            await strategy.connect(owner).harvest();

            // should exhaust credit line on first harvest
            expect(await vault.creditAvailable(strategy.address)).to.equal(0);

            // simulate profits
            await weth.connect(owner).deposit({ value: mockProfit });
            await weth.connect(owner).transfer(strategy.address, mockProfit);

            // report profits through the vault through `strategy.harvest()`
            // Vault should take the profit
            await expect(() => strategy.connect(owner).harvest()).to.changeTokenBalance(weth, strategy, mockProfit * - 1);

            // creditAvailable = strategyDebtLimit (52) - strategyTotalDebt (50)
            expect(await vault.creditAvailable(strategy.address)).to.equal(2);
        });
        it("should rebalance as appropriate after strategy experiences a loss", async function () {
            // Set strategy address and make initial deposit
            await vault.connect(owner).addStrategy(
                strategy.address,
                debtRatio,
                0, // minDebtPerHarvest
                100, // maxDebtPerHarvest
                performanceFee
            );
            await strategy.connect(owner).setVault(vault.address);
            await vault.connect(depositor1).deposit({ value: depositAmount });

            // seed debt in the strategy
            await strategy.connect(owner).harvest();

            // take some funds from Strategy to simulate losses
            await strategy._takeFunds(mockLoss);

            const ratioChange = (((mockLoss * MAX_BPS) / 490)).toFixed() // 490 is Vault totalAssets (500) - loss incurred (10)

            // report profits through the vault through `strategy.harvest()`
            await expect(await strategy.connect(owner).harvest()).to.emit(vault, "StrategyReported").withArgs(
                strategy.address,
                0, // gain
                mockLoss, // loss
                0, // debtPaid
                0, // totalGain
                mockLoss, // totalLoss
                40, // totalDebt decreased because Strategy has incurred a loss
                0, // debtAdded
                debtRatio - Number(ratioChange) // debt Strategy is allowed to take on reduces because of a loss, so the Vault has "less trust" to the strategy
            );
        });
        it("should revert improper reports", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await expect(strategy._report(1, 0, 0)).to.be.revertedWith("need to have available tokens to withdraw");
        });
        it("should account for debt payment", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await weth.connect(depositor1).deposit({value: 1});
            await weth.connect(depositor1).transfer(strategy.address, 1);
            await expect(await strategy._report(0, 0, 1)).to.emit(vault, "StrategyReported"); // TODO: withargs
        });
        it("should account for delegated assets", async function () {
            expect(await strategy.delegatedAssets()).to.equal(0);
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await strategy.setDelegatedAssets(1);
            expect(await strategy.delegatedAssets()).to.equal(1);
            await expect(await strategy._report(0, 0, 0)).to.emit(vault, "StrategyReported"); // TODO: withargs
        });
        it("should revert reporting invalid loss", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await expect(strategy._report(0, 1, 0)).to.be.revertedWith("loss can only be up the amount of debt issued to strategy");
        });
        it("should report gains with strategist fees", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, 10000);
            await weth.connect(depositor1).deposit({value: 100});
            await weth.connect(depositor1).transfer(strategy.address, 100);
            await expect(await strategy._report(100, 0, 0)).to.emit(vault, "StrategyReported"); // TODO: withargs
        });
        it("should report gains with governance fees", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(owner).setPerformanceFee(10000);
            await weth.connect(depositor1).deposit({value: 100});
            await weth.connect(depositor1).transfer(strategy.address, 100);
            await expect(await strategy._report(100, 0, 0)).to.emit(vault, "StrategyReported"); // TODO: withargs
        });
        it("should report loss then pay debt", async function () {
          await vault.connect(owner).addStrategy(strategy.address, 5000, 0, 10000, performanceFee);
          await vault.connect(depositor1).deposit({ value: 1000000 });
          await strategy.connect(owner).harvest();
          await strategy._report(0, 10000, 0);
          await vault.connect(owner).updateStrategyDebtRatio(strategy.address, 0);
          await weth.connect(depositor1).deposit({value: 1000000});
          await weth.connect(depositor1).transfer(strategy.address, 1000000);
          await expect(await strategy._report(0, 0, 10000)).to.emit(vault, "StrategyReported"); // TODO: withargs
        })
;    });

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

    describe("withdraw", function () {
        beforeEach("deposit", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(depositor1).deposit({ value: testDepositAmount });
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
        it("should withdraw 0/0", async function () {
            await expect(await vault.connect(depositor1).withdraw(0, 0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, 0);
        });
        it("should withdraw with high degredation", async function () {
            await vault.connect(owner).setLockedProfitDegration(BN.from("46000000000000000000"));
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(depositor1).deposit({value: testDepositAmount});
            await strategy.harvest();
            await provider.send("evm_increaseTime", [10]);
            await expect(await vault.connect(depositor1).withdraw(testDepositAmount, 0)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount);
        })
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
            it("should emit WithdrawalMade event after function logic is successful", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                let vaultDepositorSigner = vault.connect(depositor1);
                await expect(await vaultDepositorSigner.withdraw(cpBalance, maxLoss)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount);
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
            it("should emit WithdrawalMade event after function logic is successful", async function () {
                let cpBalance = await vault.balanceOf(depositor1.address);
                let vaultDepositorSigner = vault.connect(depositor1);
                await expect(await vaultDepositorSigner.withdraw(cpBalance, maxLoss)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount);
            });
            it("should withdraw from multiple strategies", async function () {
                await vault.connect(owner).addStrategy(unaddedStrategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
                await vault.connect(owner).addStrategy(thirdStrategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
                await vault.connect(owner).setWithdrawalQueue([unaddedStrategy.address, strategy.address, thirdStrategy.address]);
                await expect(await vault.connect(depositor1).withdraw(testDepositAmount, maxLoss)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount);
            });
            it("should revert if too much loss", async function () {
                await strategy._takeFunds(1);
                await expect(vault.connect(depositor1).withdraw(testDepositAmount, 0)).to.be.revertedWith("too much loss");
            });
            it("should withdraw with acceptable loss", async function () {
                await strategy._takeFunds(1);
                await expect(await vault.connect(depositor1).withdraw(testDepositAmount, 10000)).to.emit(vault, "WithdrawalMade").withArgs(depositor1.address, testDepositAmount.sub(1));
            });
        });
    });

    describe("debtOutstanding", function () {
        it("should return total debt if in emergency shutdown", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(depositor1).deposit({ value: testDepositAmount });
            await strategy.connect(owner).harvest();
            await strategy.connect(owner)._takeFunds(1);
            let totalDebt = (await vault.strategies(strategy.address)).totalDebt;
            await vault.connect(owner).setEmergencyShutdown(true);
            expect(await vault.debtOutstanding(strategy.address)).to.equal(totalDebt);
        })
    });

    describe("creditAvailable", function () {
        it("should return zero in emergency shutdown", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await vault.connect(owner).setEmergencyShutdown(true);
            expect(await vault.creditAvailable(strategy.address)).to.equal(0);
        });
        it("should return zero if less than the minimum", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, 10000, 10000, performanceFee);
            await weth.connect(depositor1).deposit({value: 10000});
            await weth.connect(depositor1).transfer(strategy.address, 10000);
            expect(await vault.creditAvailable(strategy.address)).to.equal(0);
        });
    })

    describe("expectedReturn", function () {
        it("should return zero for unadded strategies", async function () {
            expect(await vault.expectedReturn(strategy.address)).to.equal(0);
        });
        it("should return zero for inactive strategies", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            expect(await vault.expectedReturn(strategy.address)).to.equal(0);
        });
        it("should return nonzero for active strategies", async function () {
            await vault.connect(owner).addStrategy(strategy.address, debtRatio, minDebtPerHarvest, maxDebtPerHarvest, performanceFee);
            await strategy.connect(owner).harvest();
            await provider.send("evm_increaseTime", [120]);
            await weth.connect(depositor1).deposit({value: 100});
            await weth.connect(depositor1).transfer(strategy.address, 100);
            await strategy._report(100, 0, 0);
            await provider.send("evm_increaseTime", [60]);
            await weth.deposit({value: 0});
            expect((await vault.expectedReturn(strategy.address)).toNumber()).to.be.closeTo(50, 5);
        });
    })

    describe("requestEth", function () {
      it("should revert if not called by claims escrow", async function () {
        await expect(vault.requestEth(0)).to.be.revertedWith("!escrow");
      })

      it("should send eth", async function () {
        await registry.setClaimsEscrow(mockEscrow.address);
        await vault.deposit({value: 20});
        var balance1 = await mockEscrow.getBalance();
        let tx = await vault.connect(mockEscrow).requestEth(7);
        let receipt = await tx.wait();
        let gasCost = receipt.gasUsed.mul(tx.gasPrice || 0);
        var balance2 = await mockEscrow.getBalance();
        expect(balance2.sub(balance1).add(gasCost)).to.equal(7);
      })

      it("should get available eth", async function () {
        await registry.setClaimsEscrow(mockEscrow.address);
        let vaultBalance = await weth.balanceOf(vault.address);
        let withdrawAmount = vaultBalance.add(100);
        var balance1 = await mockEscrow.getBalance();
        let tx = await vault.connect(mockEscrow).requestEth(withdrawAmount);
        let receipt = await tx.wait();
        let gasCost = receipt.gasUsed.mul(tx.gasPrice || 0);
        var balance2 = await mockEscrow.getBalance();
        expect(balance2.sub(balance1).add(gasCost)).to.equal(vaultBalance);
      })

      it("can get zero eth", async function () {
        await registry.setClaimsEscrow(mockEscrow.address);
        await vault.connect(mockEscrow).requestEth(0);
      })

    })
});
