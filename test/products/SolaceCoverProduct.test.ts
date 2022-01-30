import { waffle, ethers } from "hardhat";
import { MockProvider } from "ethereum-waffle";
import { BigNumber as BN, utils, Contract, Wallet } from "ethers";
import chai from "chai";
import { config as dotenv_config } from "dotenv";
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { PolicyManager, Registry, Vault, RiskManager, SolaceCoverProduct, Weth9, CoverageDataProvider, Solace, MockPriceOracle, MockSlp } from "../../typechain";

const { expect } = chai;
const { deployContract, solidity} = waffle;
const provider: MockProvider = waffle.provider;

dotenv_config();
chai.use(solidity)

const DOMAIN_NAME = "Solace.fi-SolaceCoverProduct";
const VERSION = "1";

describe("SolaceCoverProduct", function() {
    let artifacts: ArtifactImports;
    let registry: Registry;
    let policyManager: PolicyManager;
    let riskManager: RiskManager;
    let solace: Solace;
    let soteriaCoverageProduct: SolaceCoverProduct;
    let weth: Weth9;
    let vault: Vault;
    let priceOracle: MockPriceOracle;
    let solaceUsdcPool: MockSlp;
    let coverageDataProvider: CoverageDataProvider;

    const [deployer, governor, newGovernor, policyholder1, policyholder2, policyholder3, policyholder4, underwritingPool, premiumPool, premiumCollector, coverPromotionAdmin] = provider.getWallets();
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const INITIAL_COVER_LIMIT = BN.from("1000000000000000000"); // 1 eth
    const NEW_COVER_LIMIT = BN.from("2000000000000000000"); // 2 eth
    const ONE_TENTH_ETH = BN.from("100000000000000000"); // 0.1 eth
    const ONE_ETH = BN.from("1000000000000000000"); // 1 eth
    const TWO_ETH = BN.from("2000000000000000000"); // 1 eth
    const ZERO_AMOUNT = BN.from("0");
    const ANNUAL_MAX_PREMIUM = INITIAL_COVER_LIMIT.div(10); // 0.1 eth, for testing we assume max annual rate of 10% of cover limit
    const WEEKLY_MAX_PREMIUM = ANNUAL_MAX_PREMIUM.div(366).mul(7);
    const TOKEN0 = "0x501ace9c35e60f03a2af4d484f49f9b1efde9f40"; // SOLACE.sol
    const TOKEN1 = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // USDC.sol
    const RESERVE0 = BN.from("13250148273341498385651903");
    const RESERVE1 = BN.from("1277929641956");
    const STRATEGY_STATUS = {
        INACTIVE: 0,
        ACTIVE: 1
    };
    const INVALID_POLICY_ID = BN.from("10000000");
    const POLICY_ID_1 = BN.from("1");
    const POLICY_ID_2 = BN.from("2");
    const POLICY_ID_3 = BN.from("3");
    const POLICY_ID_4 = BN.from("4");
    const ONE_WEEK = BN.from("604800");
    const maxRateNum = BN.from("1");
    const maxRateDenom = BN.from("315360000"); // We are testing with maxRateNum and maxRateDenom that gives us an annual max rate of 10% coverLimit
    const REFERRAL_REWARD_PERCENTAGE = BN.from("500") // 5% referral reward

    before( async () => {
        artifacts = await import_artifacts();
        await deployer.sendTransaction({to: deployer.address});

        registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;

        solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
        await registry.connect(governor).set(["solace"], [solace.address])

        weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
        await registry.connect(governor).set(["weth"], [weth.address])

        vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
        await registry.connect(governor).set(["vault"], [vault.address])
        
        policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address, registry.address])) as PolicyManager;
        await registry.connect(governor).set(["policyManager"], [policyManager.address])

        riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
        await registry.connect(governor).set(["riskManager"], [riskManager.address])

        priceOracle = (await deployContract(deployer, artifacts.MockPriceOracle)) as MockPriceOracle;
        solaceUsdcPool = (await deployContract(deployer, artifacts.MockSLP, ["SushiSwap LP Token", "SLP", ONE_ETH.mul(1000000), TOKEN0, TOKEN1, RESERVE0, RESERVE1])) as MockSlp;
        
        coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry.address, priceOracle.address, solaceUsdcPool.address])) as CoverageDataProvider;
        await registry.connect(governor).set(["coverageDataProvider"], [coverageDataProvider.address])
    });

    describe("deployment", () => {
        let mockRegistry: Registry;
        
        before(async () => {
            mockRegistry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
        });

        it("reverts for zero address registry", async () => {
            await expect(deployContract(deployer, artifacts.SoteriaCoverageProduct, [governor.address, ZERO_ADDRESS, DOMAIN_NAME, VERSION])).to.be.revertedWith("zero address registry");
        });

        it("reverts for zero address riskmanager", async () => {
            await expect(deployContract(deployer, artifacts.SoteriaCoverageProduct, [governor.address, mockRegistry.address, DOMAIN_NAME, VERSION])).to.be.revertedWith("key not in mapping");
        });

        it("reverts for zero address governance", async () => {
            await expect(deployContract(deployer, artifacts.SoteriaCoverageProduct, [ZERO_ADDRESS, registry.address , DOMAIN_NAME, VERSION])).to.be.revertedWith("zero address governance");
        });

        it("can deploy", async () => {
            soteriaCoverageProduct = await deployContract(deployer, artifacts.SoteriaCoverageProduct, [governor.address, registry.address , DOMAIN_NAME, VERSION]) as SoteriaCoverageProduct;
            expect(soteriaCoverageProduct.address).to.not.undefined;
        });
    });

    describe("governance", () => {
        it("starts with the correct governor", async () => {
            expect(await soteriaCoverageProduct.governance()).to.equal(governor.address);
        });

        it("rejects setting new governance by non governor", async  () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).setPendingGovernance(policyholder1.address)).to.be.revertedWith("!governance");
        });

        it("can set new governance", async () => {
            let tx = await soteriaCoverageProduct.connect(governor).setPendingGovernance(newGovernor.address);
            expect(tx).to.emit(soteriaCoverageProduct, "GovernancePending").withArgs(newGovernor.address);
            expect(await soteriaCoverageProduct.governance()).to.equal(governor.address);
            expect(await soteriaCoverageProduct.pendingGovernance()).to.equal(newGovernor.address);
        });

        it("rejects governance transfer by non governor", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).acceptGovernance()).to.be.revertedWith("!pending governance");
        });

        it("can transfer governance", async () => {
            let tx = await soteriaCoverageProduct.connect(newGovernor).acceptGovernance();
            await expect(tx)
                .to.emit(soteriaCoverageProduct, "GovernanceTransferred")
                .withArgs(governor.address, newGovernor.address);
            expect(await soteriaCoverageProduct.governance()).to.equal(newGovernor.address);
            await soteriaCoverageProduct.connect(newGovernor).setPendingGovernance(governor.address);
            await soteriaCoverageProduct.connect(governor).acceptGovernance();
        });
    });

    describe("pause", () => {
        it("starts unpaused", async () => {
          expect(await soteriaCoverageProduct.paused()).to.equal(false);
        });
    
        it("cannot be paused by non governance", async () => {
          await expect(soteriaCoverageProduct.connect(policyholder1).setPaused(true)).to.be.revertedWith("!governance");
          expect(await soteriaCoverageProduct.paused()).to.equal(false);
        });
    
        it("can be paused", async () => {
          let tx = await soteriaCoverageProduct.connect(governor).setPaused(true);
          expect(tx).to.emit(soteriaCoverageProduct, "PauseSet").withArgs(true);
          expect(await soteriaCoverageProduct.paused()).to.equal(true);
        });
    
        it("cannot be unpaused by non governance", async () => {
          await expect(soteriaCoverageProduct.connect(policyholder1).setPaused(false)).to.be.revertedWith("!governance");
          expect(await soteriaCoverageProduct.paused()).to.equal(true);
        });
    
        it("can be unpaused", async () => {
          let tx = await soteriaCoverageProduct.connect(governor).setPaused(false);
          expect(tx).to.emit(soteriaCoverageProduct, "PauseSet").withArgs(false);
          expect(await soteriaCoverageProduct.paused()).to.equal(false);
        });
    });

    describe("registry", () => {
        let registry2: Registry;
        let riskManager2: RiskManager;

        before(async () => {
            registry2 =  (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
            riskManager2 = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
        });

        after(async () => {
            await soteriaCoverageProduct.connect(governor).setRegistry(registry.address);
            expect(await soteriaCoverageProduct.connect(policyholder1).registry()).to.equal(registry.address);
        });

        it("starts with correct registry", async () => {
            expect(await soteriaCoverageProduct.connect(policyholder1).registry()).to.equal(registry.address);
        });

        it("starts with correct riskmanager", async () => {
            expect(await soteriaCoverageProduct.connect(policyholder1).riskManager()).to.equal(riskManager.address);
        });

        it("cannot be set by non governance", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).setRegistry(registry2.address)).to.revertedWith("!governance");
        });

        it("reverts for zero address registry", async () => {
            await expect(soteriaCoverageProduct.connect(governor).setRegistry(ZERO_ADDRESS)).to.revertedWith("zero address registry");
        });

        it("reverts for zero address riskmanager", async () => {
            await expect(soteriaCoverageProduct.connect(governor).setRegistry(registry2.address)).to.revertedWith("key not in mapping");
        });

        it("governance can set registry", async () => {
            await registry2.connect(governor).set(["riskManager"], [riskManager2.address]);
            let tx = await soteriaCoverageProduct.connect(governor).setRegistry(registry2.address);
            expect(tx).emit(soteriaCoverageProduct, "RegistrySet").withArgs(registry2.address);
            expect(await soteriaCoverageProduct.connect(policyholder1).riskManager()).to.equal(riskManager2.address);
            expect(await soteriaCoverageProduct.connect(policyholder1).registry()).to.equal(registry2.address);
        });
    });

    describe("setMaxRateNum & setMaxRateDenom", () => {
        it("cannot be set by non governance", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).setMaxRateNum(1)).to.revertedWith("!governance");
            await expect(soteriaCoverageProduct.connect(policyholder1).setMaxRateDenom(1)).to.revertedWith("!governance");
        });
        it("can be set", async () => {
            let tx1 = await soteriaCoverageProduct.connect(governor).setMaxRateNum(maxRateNum)
            let tx2 = await soteriaCoverageProduct.connect(governor).setMaxRateDenom(maxRateDenom)
            expect(tx1).emit(soteriaCoverageProduct, "MaxRateNumSet").withArgs(maxRateNum);
            expect(tx2).emit(soteriaCoverageProduct, "MaxRateDenomSet").withArgs(maxRateDenom);
        })
        it("getter functions working", async () => {
            expect(await soteriaCoverageProduct.maxRateNum()).eq(maxRateNum)
            expect(await soteriaCoverageProduct.maxRateDenom()).eq(maxRateDenom)
        })
    })

    describe("setChargeCycle", () => {
        it("cannot be set by non governance", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).setChargeCycle(1)).to.revertedWith("!governance");
        });
        it("can be set", async () => {
            let tx = await soteriaCoverageProduct.connect(governor).setChargeCycle(ONE_WEEK)
            expect(tx).emit(soteriaCoverageProduct, "ChargeCycleSet").withArgs(ONE_WEEK);
        })
        it("getter functions working", async () => {
            expect(await soteriaCoverageProduct.chargeCycle()).eq(ONE_WEEK)
        })
    })

    describe("setCoverPromotionAdmin", () => {
        it("cannot be set by non governance", async () => {
            await expect(registry.connect(policyholder1).set(["coverPromotionAdmin"], [coverPromotionAdmin.address])).to.be.revertedWith("!governance");
        });
        it("reverts on zero address", async () => {
            await expect(registry.connect(governor).set(["coverPromotionAdmin"], [ZERO_ADDRESS])).to.be.revertedWith("cannot set zero address");
        })
        it("can be set", async () => {
            let tx = await registry.connect(governor).set(["coverPromotionAdmin"], [coverPromotionAdmin.address])
            expect(tx).emit(registry, "RecordSet").withArgs("coverPromotionAdmin", coverPromotionAdmin.address);
        })
        it("getter functions working", async () => {
            expect(await registry.get("coverPromotionAdmin")).eq(coverPromotionAdmin.address)
        })
    })

    describe("setRewardPoints", () => {
        it("cannot be set by non cover promotion admin", async () => {
            await expect(soteriaCoverageProduct.connect(governor).setRewardPoints(policyholder1.address, 1)).to.revertedWith("not cover promotion admin");
        });
        it("can be set", async () => {
            let tx = await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder1.address, 1)
            expect(tx).emit(soteriaCoverageProduct, "RewardPointsSet").withArgs(policyholder1.address, BN.from("1"));
        })
        it("getter functions working", async () => {
            expect(await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(BN.from("1"))
        })
        after(async () => {
            await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder1.address, 0)
        })
    })

    describe("setCooldownPeriod", () => {
        it("cannot be set by non governance", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).setCooldownPeriod(1)).to.revertedWith("!governance");
        });
        it("can be set", async () => {
            let tx = await soteriaCoverageProduct.connect(governor).setCooldownPeriod(ONE_WEEK)
            expect(tx).emit(soteriaCoverageProduct, "CooldownPeriodSet").withArgs(ONE_WEEK);
        })
        it("getter functions working", async () => {
            expect(await soteriaCoverageProduct.cooldownPeriod()).eq(ONE_WEEK)
        })
    })

    describe("setPremiumPool", () => {
        it("cannot be set by non governance", async () => {
            await expect(registry.connect(policyholder1).set(["premiumPool"], [premiumPool.address])).to.be.revertedWith("!governance");
        });
        it("reverts on zero address", async () => {
            await expect(registry.connect(governor).set(["premiumPool"], [ZERO_ADDRESS])).to.be.revertedWith("cannot set zero address");
        })
        it("can be set", async () => {
            let tx = await registry.connect(governor).set(["premiumPool"], [premiumPool.address])
            expect(tx).emit(registry, "RecordSet").withArgs("premiumPool", premiumPool.address);
        })
        it("getter functions working", async () => {
            expect(await registry.get("premiumPool")).eq(premiumPool.address)
        })
    })

    describe("setPremiumCollector", () => {
        it("cannot be set by non governance", async () => {
            await expect(registry.connect(policyholder1).set(["premiumCollector"], [premiumCollector.address])).to.be.revertedWith("!governance");
        });
        it("reverts on zero address", async () => {
            await expect(registry.connect(governor).set(["premiumCollector"], [ZERO_ADDRESS])).to.be.revertedWith("cannot set zero address");
        })
        it("can be set", async () => {
            let tx = await registry.connect(governor).set(["premiumCollector"], [premiumCollector.address])
            expect(tx).emit(registry, "RecordSet").withArgs("premiumCollector", premiumCollector.address);
        })
        it("getter functions working", async () => {
            expect(await registry.get("premiumCollector")).eq(premiumCollector.address)
        })
    })

    describe("setReferralRewardPercentage", () => {
        it("cannot be set by non governance", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).setReferralRewardPercentage(REFERRAL_REWARD_PERCENTAGE)).to.revertedWith("!governance");
        });
        it("cannot be over 10000", async () => {
            await expect(soteriaCoverageProduct.connect(governor).setReferralRewardPercentage(BN.from("10001"))).to.revertedWith("cannot set over 100%");
        });
        it("can be set", async () => {
            let tx = await soteriaCoverageProduct.connect(governor).setReferralRewardPercentage(REFERRAL_REWARD_PERCENTAGE)
            expect(tx).emit(soteriaCoverageProduct, "ReferralRewardPercentageSet").withArgs(REFERRAL_REWARD_PERCENTAGE);
        })
        it("getter functions working", async () => {
            expect(await soteriaCoverageProduct.referralRewardPercentage()).eq(REFERRAL_REWARD_PERCENTAGE)
        })
    })

    describe("activatePolicy", () => {
        let rmActiveCoverLimit:BN;
        let rmSoteriaactiveCoverLimit: BN;
        let mcr: BN;
        let mcrps: BN;

        before(async () => {
            await riskManager.connect(governor).addCoverLimitUpdater(soteriaCoverageProduct.address);
            
            // risk manager active cover amount and active cover amount for soteria.
            rmActiveCoverLimit = await riskManager.activeCoverLimit();
            rmSoteriaactiveCoverLimit = await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address);

            // risk manager min. capital requirement and min. capital requirement for soteria
            mcr = await riskManager.minCapitalRequirement();
            mcrps = await riskManager.minCapitalRequirementPerStrategy(soteriaCoverageProduct.address);
        });

        it("cannot activate policy when zero address policy holder is provided", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(ZERO_ADDRESS, INITIAL_COVER_LIMIT, 0)).to.revertedWith("zero address policyholder");
        });

        it("cannot buy policy when zero cover amount value is provided", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, ZERO_AMOUNT, 0)).to.revertedWith("zero cover value");
        });

        it("cannot buy policy when contract is paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, INITIAL_COVER_LIMIT, 0, {value: ONE_ETH})).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });

        it("cannot purchase a policy before Coverage Data Provider and Risk Manager are set up (maxCover = 0)", async () => {
            expect (await soteriaCoverageProduct.maxCover()).eq(0)
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, INITIAL_COVER_LIMIT, 0, {value: ZERO_AMOUNT})).to.revertedWith("insufficient capacity for new cover");
        })

        it("can setup Coverage Data Provider and Risk Manager", async () => {
            // add underwriting pool to the coverage data provider
            let maxCover1 = await riskManager.maxCover();
            expect(maxCover1).to.equal(0)
            expect(await coverageDataProvider.numOfPools()).to.equal(0);

            await coverageDataProvider.connect(governor).addPools([underwritingPool.address]);
            expect(await coverageDataProvider.connect(governor).numOfPools()).to.equal(1);
            let uwpETHBalance = await underwritingPool.getBalance();
            let maxCover2 = await riskManager.maxCover();
            expect(maxCover2).to.equal(maxCover1.add(uwpETHBalance));
            
            // add Soteria to the risk manager and assign coverage allocation
            await riskManager.connect(governor).addRiskStrategy(soteriaCoverageProduct.address);
            await riskManager.connect(governor).setStrategyStatus(soteriaCoverageProduct.address, STRATEGY_STATUS.ACTIVE);
            await riskManager.connect(governor).setWeightAllocation(soteriaCoverageProduct.address, 1000);
            expect(await riskManager.maxCoverPerStrategy(soteriaCoverageProduct.address)).to.equal(maxCover2);
            expect(await riskManager.maxCoverPerStrategy(soteriaCoverageProduct.address)).to.equal(await soteriaCoverageProduct.maxCover());
        })

        it("cannot buy policy when max cover exceeded", async () => {
            let maxCover = await soteriaCoverageProduct.maxCover();
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, maxCover.add(1), 0, {value: ONE_ETH})).to.revertedWith("insufficient capacity for new cover");
        });

        it("cannot buy policy when insufficient deposit provided", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, ONE_ETH, 0, {value: ZERO_AMOUNT})).to.revertedWith("insufficient deposit for minimum required account balance");
        });

        it("can activate policy - 1 ETH cover with 1 ETH deposit", async () => {
            let tx = await soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, ONE_ETH, 0, {value: ONE_ETH});

            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_1);
            await expect(tx).emit(soteriaCoverageProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder1.address, POLICY_ID_1);
            await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(soteriaCoverageProduct.address, rmActiveCoverLimit, ONE_ETH);

            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(0)
            expect (await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).eq(ONE_ETH)
            expect (await soteriaCoverageProduct.policyStatus(POLICY_ID_1)).eq(true)
            expect (await soteriaCoverageProduct.policyOf(policyholder1.address)).eq(POLICY_ID_1)
            expect (await soteriaCoverageProduct.ownerOf(POLICY_ID_1)).eq(policyholder1.address)
            expect (await soteriaCoverageProduct.activeCoverLimit()).eq(ONE_ETH)
            expect (await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).eq(ONE_ETH)
            expect (await soteriaCoverageProduct.policyCount()).eq(1)
            expect (await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1)).eq(ONE_ETH)
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(ONE_ETH);
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
        });

        it("cannot purchase more than one policy for a single address", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, ONE_ETH, 0, {value: ONE_ETH})).to.be.revertedWith("policy already activated")
            await expect(soteriaCoverageProduct.connect(policyholder2).activatePolicy(policyholder1.address, ONE_ETH, 0, {value: ONE_ETH})).to.be.revertedWith("policy already activated")
        })
        
        it("cannot transfer policy", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, 1)).to.be.revertedWith("only minting permitted");
            await expect(soteriaCoverageProduct.connect(policyholder1).transferFrom(policyholder1.address, ZERO_ADDRESS, 1)).to.be.revertedWith("ERC721: transfer to the zero address");
            // TO-DO, test ERC721.safeTransferFrom() => TypeError: soteriaCoverageProduct.connect(...).safeTransferFrom is not a function
        })

        it("can activate policy for another address - 1 ETH cover with 1 ETH deposit", async () => {
            let tx = await soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder2.address, ONE_ETH, 0, {value: ONE_ETH});

            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_2);
            await expect(tx).emit(soteriaCoverageProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder2.address, POLICY_ID_2);
            await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(soteriaCoverageProduct.address, ONE_ETH, ONE_ETH.add(ONE_ETH));

            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)).eq(0)
            expect (await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).eq(ONE_ETH)
            expect (await soteriaCoverageProduct.accountBalanceOf(policyholder2.address)).eq(ONE_ETH)
            expect (await soteriaCoverageProduct.policyStatus(POLICY_ID_2)).eq(true)
            expect (await soteriaCoverageProduct.policyOf(policyholder2.address)).eq(POLICY_ID_2)
            expect (await soteriaCoverageProduct.ownerOf(POLICY_ID_2)).eq(policyholder2.address)
            expect (await soteriaCoverageProduct.activeCoverLimit()).eq(ONE_ETH.mul(2))
            expect (await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).eq(ONE_ETH.mul(2))
            expect (await soteriaCoverageProduct.policyCount()).eq(2)
            expect (await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2)).eq(ONE_ETH)
            expect (await provider.getBalance(soteriaCoverageProduct.address)).to.equal(ONE_ETH.mul(2));
            expect (await soteriaCoverageProduct.cooldownStart(policyholder2.address)).eq(0)
        });
        it("policy holder should have policy nft after buying coverage", async () => {
            expect(await soteriaCoverageProduct.connect(policyholder1).balanceOf(policyholder1.address)).to.equal(1);
            expect(await soteriaCoverageProduct.connect(policyholder2).balanceOf(policyholder2.address)).to.equal(1);
        });
        it("should update risk manager active cover amount", async () => {
            let activeCoverLimit = await soteriaCoverageProduct.activeCoverLimit();
            expect(await riskManager.activeCoverLimit()).to.equal(rmActiveCoverLimit.add(activeCoverLimit));
            expect(await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).to.equal(rmSoteriaactiveCoverLimit.add(activeCoverLimit));
        });
        it("should update risk manager mcr", async () => {
            let activeCoverLimit = await soteriaCoverageProduct.connect(governor).activeCoverLimit();
            expect(await riskManager.minCapitalRequirement()).to.equal(mcr.add(activeCoverLimit));
            expect(await riskManager.minCapitalRequirementPerStrategy(soteriaCoverageProduct.address)).to.equal(mcrps.add(activeCoverLimit));
        });
        it("will exit cooldown when activate policy called", async () => {
            let initialCoverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
            // deactivatePolicy() is the only way to start cooldown
            await soteriaCoverageProduct.connect(policyholder1).deactivatePolicy();
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).gt(0)
            await soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, initialCoverLimit, 0);
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
        })
        it("cannot use own referral code", async () => {
            // Create new wallet just for this unit test scope, to avoid creating side effects that impact other unit tests. It's a headfuck to work that out.
            let ownReferralCode = await soteriaCoverageProduct.getReferralCode(policyholder3.address);
            await expect(soteriaCoverageProduct.connect(governor).activatePolicy(policyholder3.address, ONE_ETH, ownReferralCode, {value: ONE_ETH})).to.revertedWith("cannot refer to self");
        })
        it("can use referral code only once", async () => {
            let referralCode = await soteriaCoverageProduct.getReferralCode(policyholder1.address);
            let referralRewardPercentage = await soteriaCoverageProduct.referralRewardPercentage();
            let expectedReferralReward = ONE_ETH.mul(referralRewardPercentage).div(10000)

            let tx = await soteriaCoverageProduct.connect(governor).activatePolicy(policyholder3.address, ONE_ETH, referralCode, {value: ONE_ETH});
            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_3);
            await expect(tx).emit(soteriaCoverageProduct, "ReferralRewardsEarned").withArgs(policyholder1.address, expectedReferralReward);
            await expect(tx).emit(soteriaCoverageProduct, "ReferralRewardsEarned").withArgs(policyholder3.address, expectedReferralReward);
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(expectedReferralReward)
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder3.address)).eq(expectedReferralReward)

            // Attempt to use another referral code, via activePolicy()
            await soteriaCoverageProduct.connect(policyholder3).deactivatePolicy();
            referralCode = await soteriaCoverageProduct.getReferralCode(policyholder2.address);
            await expect(soteriaCoverageProduct.connect(governor).activatePolicy(policyholder3.address, ONE_ETH, referralCode)).to.revertedWith("cannot use referral code again");

            // Reset state to avoid side effects impacting consequent unit tests
            await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder1.address, 0);
            await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder3.address, 0);
            expect(await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(0)
            expect(await soteriaCoverageProduct.rewardPointsOf(policyholder3.address)).eq(0)
        })
    });

    describe("deposit", () => {
        it("can deposit", async () => {
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder1.address);
            let soteriaContractETHbalance = await provider.getBalance(soteriaCoverageProduct.address);
            let tx = await soteriaCoverageProduct.connect(policyholder1).deposit(policyholder1.address, { value: ONE_ETH });
            await expect(tx).emit(soteriaCoverageProduct, "DepositMade").withArgs(policyholder1.address, ONE_ETH);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).to.equal(accountBalance.add(ONE_ETH));
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(soteriaContractETHbalance.add(ONE_ETH));
        });

        it("can deposit on behalf of policy holder", async () => {
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder2.address);
            let soteriaContractETHbalance = await provider.getBalance(soteriaCoverageProduct.address);
            let tx = await soteriaCoverageProduct.connect(policyholder1).deposit(policyholder2.address, { value: ONE_ETH });
            await expect(tx).emit(soteriaCoverageProduct, "DepositMade").withArgs(policyholder2.address, ONE_ETH);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder2.address)).to.equal(accountBalance.add(ONE_ETH));
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(soteriaContractETHbalance.add(ONE_ETH));
        });

        it("can deposit via fallback", async () => {
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder2.address);
            let soteriaContractETHbalance = await provider.getBalance(soteriaCoverageProduct.address);
            let tx = await policyholder1.sendTransaction({ to: soteriaCoverageProduct.address, value: ONE_ETH });
            await expect(tx).emit(soteriaCoverageProduct, "DepositMade").withArgs(policyholder1.address, ONE_ETH);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).to.equal(accountBalance.add(ONE_ETH));
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(soteriaContractETHbalance.add(ONE_ETH));
        });

        it("can deposit via receive", async () => {
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder1.address);
            let soteriaContractETHbalance = await provider.getBalance(soteriaCoverageProduct.address);
            let tx = await policyholder1.sendTransaction({ to: soteriaCoverageProduct.address, value: ONE_ETH, data:"0x00"});
            await expect(tx).emit(soteriaCoverageProduct, "DepositMade").withArgs(policyholder1.address, ONE_ETH);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).to.equal(accountBalance.add(ONE_ETH));
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(soteriaContractETHbalance.add(ONE_ETH));
        });

        it("cannot deposit while paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).deposit(policyholder1.address, { value: ONE_ETH })).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });
    });

    describe("updateCoverLimit", () => {
        let maxCover: BN;
        let maxCoverPerStrategy: BN;
        let initialMCRForSoteria: BN;
        let initialMCR: BN; // min. capital requirement
        let initialSoteriaActiveCoverLimit: BN;
        let initialPolicyCoverLimit: BN;
        let initialRMActiveCoverLimit: BN; // risk manager active cover amount
        let initialRMActiveCoverLimitForSoteria: BN; // risk manager active cover amount for soteria

        before(async () => {
            maxCover = await riskManager.maxCover();
            maxCoverPerStrategy = await riskManager.maxCoverPerStrategy(soteriaCoverageProduct.address);

            // risk manager current values
            initialMCR = await riskManager.minCapitalRequirement();
            initialMCRForSoteria = await riskManager.minCapitalRequirementPerStrategy(soteriaCoverageProduct.address);
            
            // risk manager current values
            initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
            initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address);

            initialSoteriaActiveCoverLimit = await soteriaCoverageProduct.connect(policyholder1).activeCoverLimit();
            initialPolicyCoverLimit = await soteriaCoverageProduct.connect(policyholder1).coverLimitOf(POLICY_ID_1);

            expect(await soteriaCoverageProduct.connect(policyholder1).ownerOf(POLICY_ID_1)).to.equal(policyholder1.address);
        });

        it("cannot update for zero cover amount", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(ZERO_AMOUNT, 0)).to.revertedWith("zero cover value");
        });

        it("cannot update for invalid policy", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder4).updateCoverLimit(NEW_COVER_LIMIT, 0)).to.revertedWith("invalid policy");
        });

        it("cannot update while paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(NEW_COVER_LIMIT, 0)).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });

        it("cannot update if max cover is exceeded", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(maxCover.add(1), 0)).to.revertedWith("insufficient capacity for new cover");
        });

        it("cannot update if max cover for the strategy is exceeded", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(maxCoverPerStrategy.add(1), 0)).to.revertedWith("insufficient capacity for new cover");
        });

        it("cannot update if below minimum required account balance for newCoverLimit", async () => {
            let maxRateNum = await soteriaCoverageProduct.maxRateNum();
            let maxRateDenom = await soteriaCoverageProduct.maxRateDenom();
            let chargeCycle = await soteriaCoverageProduct.chargeCycle();
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)
            let maxPermissibleNewCoverLimit = accountBalance.mul(maxRateDenom).div(maxRateNum).div(chargeCycle)
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(maxPermissibleNewCoverLimit.add(ONE_ETH), 0)).to.revertedWith("insufficient deposit for minimum required account balance");
        })

        it("policy owner can update policy", async () => {
            let activeCoverLimit = initialSoteriaActiveCoverLimit.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);
            
            let tx = await soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(NEW_COVER_LIMIT, 0);

            await expect(tx).emit(soteriaCoverageProduct, "PolicyUpdated").withArgs(POLICY_ID_1);
            await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(soteriaCoverageProduct.address, initialRMActiveCoverLimit, initialRMActiveCoverLimit.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit));
            expect(await soteriaCoverageProduct.connect(policyholder1).activeCoverLimit()).to.equal(activeCoverLimit);
            expect(await soteriaCoverageProduct.connect(policyholder1).coverLimitOf(POLICY_ID_1)).to.equal(NEW_COVER_LIMIT);
        });

        it("should update risk manager active cover limit", async () => {
            let amount1 = initialRMActiveCoverLimit.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);
            let amount2 = initialRMActiveCoverLimitForSoteria.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);

            expect(await riskManager.activeCoverLimit()).to.equal(amount1);
            expect(await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).to.equal(amount2);
        });

        it("should update risk manager mcr", async () => {         
            let amount1 = initialMCR.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);
            let amount2 = initialMCRForSoteria.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);
            expect(await riskManager.minCapitalRequirement()).to.equal(amount1);
            expect(await riskManager.minCapitalRequirementPerStrategy(soteriaCoverageProduct.address)).to.equal(amount2);
        });

        it("will exit cooldown when cover limited updated", async () => {
            let initialCoverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
            // deactivatePolicy() is the only way to start cooldown
            await soteriaCoverageProduct.connect(policyholder1).deactivatePolicy();
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).gt(0)
            await soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(initialCoverLimit, 0);
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
        })
        it("cannot use own referral code", async () => {
            let ownReferralCode = await soteriaCoverageProduct.getReferralCode(policyholder1.address);
            let coverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(coverLimit, ownReferralCode)).to.revertedWith("cannot refer to self");
        })
        it("can use referral code only once", async () => {
            let referralCode = await soteriaCoverageProduct.getReferralCode(policyholder1.address);
            let referralRewardPercentage = await soteriaCoverageProduct.referralRewardPercentage();
            let coverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2);
            let expectedReferralReward = coverLimit.mul(referralRewardPercentage).div(10000)

            let tx = await soteriaCoverageProduct.connect(policyholder2).updateCoverLimit(coverLimit, referralCode);
            await expect(tx).emit(soteriaCoverageProduct, "ReferralRewardsEarned").withArgs(policyholder1.address, expectedReferralReward);
            await expect(tx).emit(soteriaCoverageProduct, "ReferralRewardsEarned").withArgs(policyholder2.address, expectedReferralReward);
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(expectedReferralReward)
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)).eq(expectedReferralReward)

            // Attempt to use another referral code
            referralCode = await soteriaCoverageProduct.getReferralCode(policyholder3.address);
            await expect(soteriaCoverageProduct.connect(policyholder2).updateCoverLimit(coverLimit, referralCode)).to.revertedWith("cannot use referral code again");

            // Reset state to avoid side effects impacting consequent unit tests
            await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder1.address, 0);
            await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder2.address, 0);
            expect(await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(0)
            expect(await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)).eq(0)
        })
    });

    describe("deactivatePolicy", () => {
        it("cannot deactivate an invalid policy", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder3).deactivatePolicy()).to.revertedWith("invalid policy");
        });

        it("policy owner can deactivate policy", async () => {
            let tx = await soteriaCoverageProduct.connect(policyholder3).activatePolicy(policyholder3.address, INITIAL_COVER_LIMIT, 0, {value: ONE_ETH});
            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_3);

            let initialPolicyholderETHBalance = await policyholder3.getBalance();
            let initialPolicyholderAccountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)
            let initialPolicyCoverLimit = await soteriaCoverageProduct.connect(policyholder3).coverLimitOf(POLICY_ID_3);
            let initialActiveCoverLimit = await soteriaCoverageProduct.connect(policyholder3).activeCoverLimit();
            let initialAvailableCoverCapacity = await soteriaCoverageProduct.availableCoverCapacity();
            let initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
            let initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address);
            expect(await soteriaCoverageProduct.cooldownStart(policyholder3.address)).eq(0)

            // deactivate policy
            tx = await soteriaCoverageProduct.connect(policyholder3).deactivatePolicy();
            await expect(tx).emit(soteriaCoverageProduct, "PolicyDeactivated").withArgs(POLICY_ID_3);
            await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(soteriaCoverageProduct.address, initialRMActiveCoverLimit, initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));
            
            // user balance should not change
            let receipt = await tx.wait();
            let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            expect(await policyholder3.getBalance()).eq(initialPolicyholderETHBalance.sub(gasCost))
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)).to.equal(initialPolicyholderAccountBalance);

            // soteria active cover amount should be decreased
            expect(await soteriaCoverageProduct.activeCoverLimit()).to.equal(initialActiveCoverLimit.sub(initialPolicyCoverLimit));

            // cover limit should be zero
            expect(await soteriaCoverageProduct.coverLimitOf(POLICY_ID_3)).to.equal(ZERO_AMOUNT);
            expect(await soteriaCoverageProduct.availableCoverCapacity()).eq(initialAvailableCoverCapacity.add(initialPolicyCoverLimit))

            // policy status should be inactive
            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_3)).to.be.false;
            expect(await soteriaCoverageProduct.policyCount()).eq(3)

            // risk manager active cover amount and active cover amount for soteria should be decreased
            expect(await riskManager.activeCoverLimit()).to.equal(initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));
            expect(await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).to.equal(initialRMActiveCoverLimitForSoteria.sub(initialPolicyCoverLimit));

            // cooldown should be set
            expect(await soteriaCoverageProduct.cooldownStart(policyholder3.address)).gt(0)
        });
    });

    describe("withdraw", () => {
        let initialAccountBalance: BN;
        let initialPolicyCover:BN;
        let initialPolicyholderETHBalance: BN;
        let initialSoteriaETHBalance: BN;
        let initialActiveCoverLimit: BN;
        let initialAvailableCoverCapacity: BN;
        let initialRMActiveCoverLimit: BN;
        let initialRMActiveCoverLimitForSoteria: BN;

        let maxRateNum: BN;
        let maxRateDenom: BN;
        let chargeCycle: BN;
        let minRequiredAccountBalance: BN;
        let withdrawAmount: BN;
        let cooldownStart: BN;
        let cooldownPeriod: BN;

        before(async () => {
            initialAccountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder3.address);
            initialPolicyCover = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_3);
            initialPolicyholderETHBalance = await provider.getBalance(policyholder3.address)
            initialSoteriaETHBalance = await provider.getBalance(soteriaCoverageProduct.address)
            initialActiveCoverLimit = await soteriaCoverageProduct.connect(policyholder3).activeCoverLimit();
            initialAvailableCoverCapacity = await soteriaCoverageProduct.availableCoverCapacity();
            initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
            initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address);

            maxRateNum = await soteriaCoverageProduct.maxRateNum();
            maxRateDenom = await soteriaCoverageProduct.maxRateDenom();
            chargeCycle = await soteriaCoverageProduct.chargeCycle();
            minRequiredAccountBalance = maxRateNum.mul(chargeCycle).mul(initialPolicyCover).div(maxRateDenom)
            withdrawAmount = ONE_ETH.div(2)
            cooldownStart =  await soteriaCoverageProduct.cooldownStart(policyholder3.address)
            cooldownPeriod = await soteriaCoverageProduct.cooldownPeriod()
        })
        
        it("cannot withdraw while paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).withdraw(ONE_ETH)).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });
        it("cannot withdraw more than account balance", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder3).withdraw(initialAccountBalance.add(1))).to.revertedWith("cannot withdraw > account balance");
        })
        it("before cooldown set, cannot withdraw such that remaining balance < minRequiredAccountBalance", async () => {
            let initialAccountBalance1 = await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)
            expect(await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
            await expect(soteriaCoverageProduct.connect(policyholder1).withdraw(initialAccountBalance1)).to.revertedWith("must have > minRequiredAccountbalance");
        })
        it("before cooldown complete, cannot withdraw such that remaining balance < minRequiredAccountBalance", async () => {
            const currentTimestamp = (await provider.getBlock('latest')).timestamp
            expect(cooldownStart).gt(0)
            expect(currentTimestamp).lt(cooldownStart.add(cooldownPeriod))
            await expect(soteriaCoverageProduct.connect(policyholder3).withdraw(initialAccountBalance.sub(1))).to.revertedWith("must have > minRequiredAccountbalance");
        })
        it("before cooldown complete, can withdraw such that remaining balance > minRequiredAccountBalance", async () => {
            let tx = await soteriaCoverageProduct.connect(policyholder3).withdraw(withdrawAmount);
            let receipt = await tx.wait();
            let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            await expect(tx).emit(soteriaCoverageProduct, "WithdrawMade").withArgs(policyholder3.address, withdrawAmount);

            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)).to.equal(initialAccountBalance.sub(withdrawAmount));
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)).gte(minRequiredAccountBalance);
            expect(await provider.getBalance(policyholder3.address)).eq(initialPolicyholderETHBalance.add(withdrawAmount).sub(gasCost))
            expect(await provider.getBalance(soteriaCoverageProduct.address)).eq(initialSoteriaETHBalance.sub(withdrawAmount))
        })
        it("after cooldown complete, can withdraw entire account balance", async () => {
            const initialTimestamp = (await provider.getBlock('latest')).timestamp
            const postCooldownTimestamp = initialTimestamp + cooldownPeriod.toNumber()
            expect(BN.from(postCooldownTimestamp)).gt(cooldownStart.add(cooldownPeriod))
            await provider.send("evm_mine", [postCooldownTimestamp])
            
            let policyholderETHBalance = await provider.getBalance(policyholder3.address)
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)
            let tx = await soteriaCoverageProduct.connect(policyholder3).withdraw(accountBalance);
            let receipt = await tx.wait();
            let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            await expect(tx).emit(soteriaCoverageProduct, "WithdrawMade").withArgs(policyholder3.address, accountBalance);

            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)).eq(0);
            expect(await provider.getBalance(policyholder3.address)).eq(policyholderETHBalance.add(accountBalance).sub(gasCost))
            expect(await provider.getBalance(soteriaCoverageProduct.address)).eq(initialSoteriaETHBalance.sub(initialAccountBalance))
        })
        after(async () => {
            expect(await soteriaCoverageProduct.connect(policyholder3).activeCoverLimit()).eq(initialActiveCoverLimit)
            expect(await soteriaCoverageProduct.availableCoverCapacity()).eq(initialAvailableCoverCapacity)
            expect(await riskManager.activeCoverLimit()).eq(initialRMActiveCoverLimit)
            expect(await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).eq(initialRMActiveCoverLimitForSoteria)
        })
    });

    describe("chargePremiums", () => {
        it("cannot charge premiums by non premium collector", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).chargePremiums([policyholder1.address, policyholder2.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM])).to.revertedWith("not premium collector");
        });

        it("cannot charge premiums if argument lengths are mismatched", async () => {
            await expect(soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address, policyholder3.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM])).to.revertedWith("length mismatch");
        });

        it("cannot charge premiums if policy count is exceeded", async () => {
            await expect(soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address, policyholder3.address, policyholder4.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM])).to.revertedWith("policy count exceeded");
        });

        it("cannot charge more than max rate", async () => {
            await expect(soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address], [WEEKLY_MAX_PREMIUM.mul(11).div(10), WEEKLY_MAX_PREMIUM.mul(11).div(10)])).to.revertedWith("charging more than promised maximum rate");
        })

        it("can charge premiums", async () => {
            // CASE 1 - Charge weekly premium for two policyholders, no reward points involved
            
            // premiums are routed to the premium pool!
            let soteriaBalance = await provider.getBalance(soteriaCoverageProduct.address);
            let premiumPoolBalance = await provider.getBalance(premiumPool.address);
            let policyholder1AccountBalance = await soteriaCoverageProduct.connect(policyholder1).accountBalanceOf(policyholder1.address);
            let policyholder2AccountBalance = await soteriaCoverageProduct.connect(policyholder1).accountBalanceOf(policyholder2.address);
            let initialCoverLimit1 = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            let initialCoverLimit2 = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2);
            let initialActiveCoverLimit = await soteriaCoverageProduct.activeCoverLimit();
            let initialActiveCoverCapacity = await soteriaCoverageProduct.availableCoverCapacity();

            // charge premiums
            let tx = soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM]);
            await expect(tx).emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder1.address, WEEKLY_MAX_PREMIUM);
            await expect(tx).emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder2.address, WEEKLY_MAX_PREMIUM);
         
            // Soteria account balance should be decreased
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).to.equal(policyholder1AccountBalance.sub(WEEKLY_MAX_PREMIUM));
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder2.address)).to.equal(policyholder2AccountBalance.sub(WEEKLY_MAX_PREMIUM));

            // soteria balance should be decreased
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(soteriaBalance.sub(WEEKLY_MAX_PREMIUM.mul(2)));

            // premium should be sent to premium pool
            expect(await provider.getBalance(premiumPool.address)).to.equal(premiumPoolBalance.add(WEEKLY_MAX_PREMIUM.mul(2)));
            expect(await soteriaCoverageProduct.availableCoverCapacity()).eq(initialActiveCoverCapacity)

            // following mappings should be unchanged
            expect(await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1)).eq(initialCoverLimit1)
            expect(await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2)).eq(initialCoverLimit2)
            expect(await soteriaCoverageProduct.activeCoverLimit()).eq(initialActiveCoverLimit)
        });

        it("can partially charge premiums if the fund is insufficient", async () => {
            // CASE 2 - Activate new policy for new policyholder. Deposit 1.1x WEEKLY_MAX_PREMIUM.
            // We cannot reach PremiumPartiallyCharged branch within a single chargePremium() call, due to require(minAccountBalance) checks in activatePolicy, updateCoverLimit and chargePremium
            // So aim to activate it on second chargePremium() call

            let depositAmount = WEEKLY_MAX_PREMIUM.mul(11).div(10)

            let tx = await soteriaCoverageProduct.connect(policyholder4).activatePolicy(policyholder4.address, INITIAL_COVER_LIMIT, 0, {value: depositAmount});
            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_4);

            let initialSoteriaBalance = await provider.getBalance(soteriaCoverageProduct.address);
            let initialPremiumPoolBalance = await provider.getBalance(premiumPool.address);
            let initialHolderAccountBalance = await soteriaCoverageProduct.connect(policyholder4).accountBalanceOf(policyholder4.address);
            let initialActiveCoverLimit = await soteriaCoverageProduct.connect(policyholder4).activeCoverLimit();
            let initialPolicyCoverLimit = await soteriaCoverageProduct.connect(policyholder4).coverLimitOf(POLICY_ID_4);
            let initialAvailableCoverCapacity = await soteriaCoverageProduct.connect(policyholder4).availableCoverCapacity();
            let initialRMCoverAmount = await riskManager.activeCoverLimit();
            let initialRMSoteriaCoverAmount = await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address);

            // we cannot reach the PremiumPartiallyCharged branch within a single chargePremiums() call
            await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder4.address], [WEEKLY_MAX_PREMIUM]);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder4.address)).eq(WEEKLY_MAX_PREMIUM.div(10))
            tx = await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder4.address], [WEEKLY_MAX_PREMIUM]);
            await expect(tx).emit(soteriaCoverageProduct, "PremiumPartiallyCharged").withArgs(policyholder4.address, WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM.div(10));
           
            // policy should be deactivated
            await expect(tx).emit(soteriaCoverageProduct, "PolicyDeactivated").withArgs(POLICY_ID_4);
            await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(soteriaCoverageProduct.address, initialActiveCoverLimit, initialActiveCoverLimit.sub(initialPolicyCoverLimit));
            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_4)).to.equal(false);

            // active cover amount should be updated
            expect(await soteriaCoverageProduct.activeCoverLimit()).to.equal(initialActiveCoverLimit.sub(initialPolicyCoverLimit));
            expect(await soteriaCoverageProduct.connect(policyholder4).availableCoverCapacity()).eq(initialAvailableCoverCapacity.add(initialPolicyCoverLimit))

            // policy's cover amount should be zero
            expect(await soteriaCoverageProduct.coverLimitOf(POLICY_ID_4)).to.equal(ZERO_AMOUNT);

            // risk manager should be updated
            expect(await riskManager.activeCoverLimit()).to.equal(initialRMCoverAmount.sub(initialPolicyCoverLimit));
            expect(await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).to.equal(initialRMSoteriaCoverAmount.sub(initialPolicyCoverLimit));
            expect(await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).to.equal(initialActiveCoverLimit.sub(initialPolicyCoverLimit));

            // policyholder account balance should be depleted
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder4.address)).to.equal(0);

            // soteria balance should be decreased
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(initialSoteriaBalance.sub(depositAmount));
            
            // premium should be sent to premium pool
            expect(await provider.getBalance(premiumPool.address)).to.equal(initialPremiumPoolBalance.add(depositAmount));
        });

        it("will skip charging premium for inactive accounts", async () => {
            // CASE 3 - Charge weekly premium for one active, and one inactive account (made inactive in CASE 2)

            let initialSoteriaBalance = await provider.getBalance(soteriaCoverageProduct.address);
            let initialVaultBalance = await provider.getBalance(premiumPool.address);
            let initialHolderFunds = await soteriaCoverageProduct.connect(policyholder2).accountBalanceOf(policyholder2.address);

            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_4)).to.equal(false);
            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_2)).to.equal(true);

            // charge premiums
            let tx = soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder2.address, policyholder4.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM]);
            await expect(tx).emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder2.address, WEEKLY_MAX_PREMIUM);
         
            expect(await soteriaCoverageProduct.connect(policyholder2).accountBalanceOf(policyholder2.address)).to.equal(initialHolderFunds.sub(WEEKLY_MAX_PREMIUM));
         
            // soteria balance should be decreased by single weekly premium
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(initialSoteriaBalance.sub(WEEKLY_MAX_PREMIUM));
          
            // single weekly premium should be sent to premium pool
            expect(await provider.getBalance(premiumPool.address)).to.equal(initialVaultBalance.add(WEEKLY_MAX_PREMIUM));
        });

        it("will correctly charge premiums with reward points", async () => {
            // CASE 4 - Charge weekly premium for three active policies
            // Policy 1: reward points can pay for premium in full
            // Policy 2: reward points can partially pay for premium, rest will come from account balance
            // Policy 3: reward points + account balance unable to fully pay for premium

            // Set up reward points for policy 1 and 2
            // Use referral code to set up reward points for policy 1
            // Use setRewardPoints() method to set up reward points for policy 2
            let EXCESS_REWARD_POINTS = WEEKLY_MAX_PREMIUM.mul(2)
            let INSUFFICIENT_REWARD_POINTS = WEEKLY_MAX_PREMIUM.div(10)

            let referralCode = await soteriaCoverageProduct.getReferralCode(governor.address)
            let coverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            let tx = await soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(coverLimit, referralCode);
            // let tx = await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder1.address, EXCESS_REWARD_POINTS)
            // expect(tx).to.emit(soteriaCoverageProduct, "RewardPointsSet").withArgs(policyholder1.address, EXCESS_REWARD_POINTS);
            let initialRewardPoints1 = await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)
            expect(initialRewardPoints1).gt(EXCESS_REWARD_POINTS)

            tx = await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder2.address, INSUFFICIENT_REWARD_POINTS)
            expect(tx).to.emit(soteriaCoverageProduct, "RewardPointsSet").withArgs(policyholder2.address, INSUFFICIENT_REWARD_POINTS);
            let initialRewardPoints2 = await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)
            expect(initialRewardPoints2).eq(INSUFFICIENT_REWARD_POINTS)

            // Set up policy 3 (remember we need minimum 2 chargePremium calls to reach PremiumsPartiallySet branch, so we will do the first call to setup)
            // Also remember that we deactivated and did a complete withdrawal of amount in policyholder3's account in withdraw() unit test
            let depositAmount = WEEKLY_MAX_PREMIUM.mul(11).div(10)
            await soteriaCoverageProduct.connect(policyholder3).activatePolicy(policyholder3.address, INITIAL_COVER_LIMIT, 0, {value: depositAmount});
            await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder3.address], [WEEKLY_MAX_PREMIUM]);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)).eq(WEEKLY_MAX_PREMIUM.div(10))
            tx = await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder3.address, INSUFFICIENT_REWARD_POINTS)
            expect(tx).to.emit(soteriaCoverageProduct, "RewardPointsSet").withArgs(policyholder3.address, INSUFFICIENT_REWARD_POINTS);
            let initialRewardPoints3 = await soteriaCoverageProduct.rewardPointsOf(policyholder3.address)
            expect(initialRewardPoints3).eq(INSUFFICIENT_REWARD_POINTS)

            // Get initial state variable values
            let initialSoteriaBalance = await provider.getBalance(soteriaCoverageProduct.address);
            let initialPremiumPoolBalance = await provider.getBalance(premiumPool.address);
            let initialHolder1AccountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder1.address);
            let initialHolder2AccountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder2.address);
            let initialHolder3AccountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder3.address);
            let initialActiveCoverLimit = await soteriaCoverageProduct.activeCoverLimit();
            let initialPolicy1CoverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            let initialPolicy2CoverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2);
            let initialPolicy3CoverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_3);
            let initialAvailableCoverCapacity = await soteriaCoverageProduct.availableCoverCapacity();
            let initialRMCoverAmount = await riskManager.activeCoverLimit();
            let initialRMSoteriaCoverAmount = await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address);

            tx = await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address, policyholder3.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM])
            expect(tx).to.emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder1.address, WEEKLY_MAX_PREMIUM);
            expect(tx).to.emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder2.address, WEEKLY_MAX_PREMIUM);
            expect(tx).to.emit(soteriaCoverageProduct, "PremiumPartiallyCharged").withArgs(policyholder3.address, WEEKLY_MAX_PREMIUM, initialHolder3AccountBalance.add(initialRewardPoints3));
            expect(tx).to.emit(soteriaCoverageProduct, "PolicyDeactivated").withArgs(POLICY_ID_3);
            await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(soteriaCoverageProduct.address, initialActiveCoverLimit, initialActiveCoverLimit.sub(initialPolicy3CoverLimit));
            
            // Confirm state is what we expect after charging premium

            // Check reward points
            expect(await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(initialRewardPoints1.sub(WEEKLY_MAX_PREMIUM))            
            expect(await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)).eq(0)          
            expect(await soteriaCoverageProduct.rewardPointsOf(policyholder3.address)).eq(0)          

            // Check account balances
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).eq(initialHolder1AccountBalance)
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder2.address)).eq(initialHolder2AccountBalance.sub(WEEKLY_MAX_PREMIUM).add(initialRewardPoints2))
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)).eq(0)

            // Check cover limits
            expect(await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1)).eq(initialPolicy1CoverLimit)
            expect(await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2)).eq(initialPolicy2CoverLimit)
            expect(await soteriaCoverageProduct.coverLimitOf(POLICY_ID_3)).eq(0)

            // Check policy status
            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_1)).eq(true)
            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_2)).eq(true)
            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_3)).eq(false)

            // Soteria balance check
            let accountBalanceDeductedForHolder1 = BN.from("0");
            let accountBalanceDeductedForHolder2 = WEEKLY_MAX_PREMIUM.sub(initialRewardPoints2);
            let accountBalanceDeductedForHolder3 = initialHolder3AccountBalance;
            let expectedSoteriaBalanceChange = accountBalanceDeductedForHolder1.add(accountBalanceDeductedForHolder2).add(accountBalanceDeductedForHolder3)
            expect(await provider.getBalance(soteriaCoverageProduct.address)).eq(initialSoteriaBalance.sub(expectedSoteriaBalanceChange))

            // Vault balance check
            expect(await provider.getBalance(premiumPool.address)).eq(initialPremiumPoolBalance.add(expectedSoteriaBalanceChange))

            // Soteria active cover limit check - policy 3 deactivated
            expect(await soteriaCoverageProduct.activeCoverLimit()).eq(initialActiveCoverLimit.sub(initialPolicy3CoverLimit))
            expect(await riskManager.activeCoverLimit()).eq(initialRMCoverAmount.sub(initialPolicy3CoverLimit))
            expect(await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).eq(initialRMSoteriaCoverAmount.sub(initialPolicy3CoverLimit))
            
            // Cover capacity check - should be increased by policy 3 initial cover limit
            expect(await soteriaCoverageProduct.availableCoverCapacity()).eq(initialAvailableCoverCapacity.add(initialPolicy3CoverLimit))
        })

        it("will charge for 100 users in one call", async() => {
            // Create 100 test wallets
            // 100 wallets -> 1.6M gas
            // 1000 wallets -> 16M gas
            let numberWallets = 100 // Change this number to whatever number of wallets you want to test for

            let users:(Wallet)[] = [];
            for (let i = 0; i < numberWallets; i++) {
                users.push(provider.createEmptyWallet())
            }
            // Activate policies for each user, 1 ETH cover limit with 0.1 ETH deposit
            for (let user of users) {
                await soteriaCoverageProduct.connect(governor).activatePolicy(user.address, ONE_ETH, 0, {value:ONE_ETH.div(10)})
            }
            // Gift 0 reward points to one-third of users, half-weekly premium to one-third, and full weekly premium to remaining third
            for (let user of users) {
                if ( Math.floor(Math.random() * 3) == 0 ) {
                    await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(user.address, WEEKLY_MAX_PREMIUM.div(2))
                } else if ( Math.floor(Math.random() * 3) == 1 ) {
                    await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(user.address, WEEKLY_MAX_PREMIUM)
                }
            }
            // Create arrays for chargePremium parameter
            let PREMIUM_ARRAY:BN[] = []
            let ADDRESS_ARRAY:string[] = []
            for (let user of users) {
                ADDRESS_ARRAY.push(user.address)
                PREMIUM_ARRAY.push(WEEKLY_MAX_PREMIUM)
            }

            // Charge premiums
            await soteriaCoverageProduct.connect(premiumCollector).chargePremiums(ADDRESS_ARRAY, PREMIUM_ARRAY);
        })

    });

});