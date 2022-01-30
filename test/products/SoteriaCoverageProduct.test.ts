import { waffle, ethers } from "hardhat";
import { MockProvider } from "ethereum-waffle";
import { BigNumber as BN, utils, Contract, Wallet, constants } from "ethers";
import chai from "chai";
import { config as dotenv_config } from "dotenv";
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { getSoteriaReferralCode } from "../utilities/getSoteriaReferralCode"
import { Registry, RiskManager, SoteriaCoverageProduct, Weth9, CoverageDataProvider, Solace, MockPriceOracle, MockSlp, MockErc20Permit } from "../../typechain";
import { Console } from "console";

const { expect } = chai;
const { deployContract, solidity} = waffle;
const provider: MockProvider = waffle.provider;

dotenv_config();
chai.use(solidity)

const DOMAIN_NAME = "Solace.fi-SoteriaCoverageProduct";
const VERSION = "1";
 
describe("SoteriaCoverageProduct", function() {
    let artifacts: ArtifactImports;
    let registry: Registry;
    let riskManager: RiskManager;
    let solace: Solace;
    let soteriaCoverageProduct: SoteriaCoverageProduct;
    let weth: Weth9;
    let dai: MockErc20Permit;
    let priceOracle: MockPriceOracle;
    let solaceUsdcPool: MockSlp;
    let coverageDataProvider: CoverageDataProvider;

    const [deployer, governor, newGovernor, policyholder1, policyholder2, policyholder3, policyholder4, policyholder5, underwritingPool, premiumPool, premiumCollector, coverPromotionAdmin] = provider.getWallets();
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const ONE_ETH = BN.from("1000000000000000000"); // 1 eth
    const INITIAL_DEPOSIT = ONE_ETH.mul(1000); // 1000 DAI
    const INITIAL_COVER_LIMIT = ONE_ETH.mul(10000); // 10000 DAI
    const NEW_COVER_LIMIT = INITIAL_COVER_LIMIT.mul(2); // 20000 DAI
    const ONE_TENTH_ETH = BN.from("100000000000000000"); // 0.1 eth
    const TWO_ETH = BN.from("2000000000000000000"); // 1 eth
    const ZERO_AMOUNT = BN.from("0");
    const ANNUAL_MAX_PREMIUM = INITIAL_COVER_LIMIT.div(10); // 0.1 eth, for testing we assume max annual rate of 10% of cover limit
    const WEEKLY_MAX_PREMIUM = ANNUAL_MAX_PREMIUM.mul(604800).div(31536000);
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
    const POLICY_ID_5 = BN.from("5");
    const ONE_WEEK = BN.from("604800");
    const maxRateNum = BN.from("1");
    const maxRateDenom = BN.from("315360000"); // We are testing with maxRateNum and maxRateDenom that gives us an annual max rate of 10% coverLimit
    const REFERRAL_REWARD = ONE_ETH.mul(50) // 50 DAI

    const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

    before( async () => {
        artifacts = await import_artifacts();
        await deployer.sendTransaction({to: deployer.address});

        registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;

        solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
        await registry.connect(governor).set(["solace"], [solace.address])

        const Weth = await ethers.getContractFactory("WETH9")
        weth = await Weth.attach(DAI_ADDRESS) as Weth9
        // weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
        // await registry.connect(governor).set(["weth"], [weth.address])

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

        it("default values for maxRateNum, maxRateDenom and chargeCycle should be set by constructor", async () => {
            expect(await soteriaCoverageProduct.maxRateNum()).eq(maxRateNum)
            expect(await soteriaCoverageProduct.maxRateDenom()).eq(maxRateDenom)
            expect(await soteriaCoverageProduct.chargeCycle()).eq(ONE_WEEK)
        })

        it("completes DAI setup", async() => {
            const Dai = await ethers.getContractFactory("MockERC20Permit");
            dai = await Dai.attach(DAI_ADDRESS) as MockErc20Permit
            
            // Give 10,000 DAI to all active test wallets
            await manipulateDAIbalance(policyholder1, ONE_ETH.mul(10000))
            await manipulateDAIbalance(governor, ONE_ETH.mul(10000))

            // Grant infinite ERC20 allowance from active test wallets to Soteria
            await dai.connect(policyholder1).approve(soteriaCoverageProduct.address, constants.MaxUint256)
            await dai.connect(governor).approve(soteriaCoverageProduct.address, constants.MaxUint256)
        })
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

    describe("setReferralReward", () => {
        it("cannot be set by non governance", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).setReferralReward(REFERRAL_REWARD)).to.revertedWith("!governance");
        });
        it("can be set", async () => {
            let tx = await soteriaCoverageProduct.connect(governor).setReferralReward(REFERRAL_REWARD)
            expect(tx).emit(soteriaCoverageProduct, "ReferralRewardSet").withArgs(REFERRAL_REWARD);
        })
        it("getter functions working", async () => {
            expect(await soteriaCoverageProduct.referralReward()).eq(REFERRAL_REWARD)
        })
    })

    describe("setIsReferralOn", () => {
        it("should default as true", async () => {
            expect(await soteriaCoverageProduct.isReferralOn()).eq(true)
        });
        it("cannot be set by non governance", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).setIsReferralOn(false)).to.revertedWith("!governance");
        });
        it("can be set", async () => {
            let tx = await soteriaCoverageProduct.connect(governor).setIsReferralOn(false)
            expect(tx).emit(soteriaCoverageProduct, "IsReferralOnSet").withArgs(false);
        })
        it("getter functions working", async () => {
            expect(await soteriaCoverageProduct.isReferralOn()).eq(false)
        })
        after(async () => {
            await soteriaCoverageProduct.connect(governor).setIsReferralOn(true)
            expect(await soteriaCoverageProduct.isReferralOn()).eq(true)
        })
    })

    describe("getIndexOfStablecoin", () => {
        it("should default with DAI in accepted stablecoin list", async () => {
            expect(await soteriaCoverageProduct.getIndexOfStablecoin(DAI_ADDRESS)).eq(0)
            expect(await soteriaCoverageProduct.acceptedStablecoinList(0)).eq(DAI_ADDRESS)
        })

        it("should revert on attempting to search for unaccepted stablecoin", async () => {
            await expect(soteriaCoverageProduct.getIndexOfStablecoin(ZERO_ADDRESS)).to.revertedWith("stablecoin not in list");
            await expect(soteriaCoverageProduct.acceptedStablecoinList(1)).to.reverted;
        })
    })

    describe("addToAcceptedStablecoinList", () => {
        it("cannot be added by non governance", async () => {
            const MOCK_STABLE_ADDRESS = (await provider.createEmptyWallet()).address
            await expect(soteriaCoverageProduct.connect(policyholder1).addToAcceptedStablecoinList(MOCK_STABLE_ADDRESS)).to.revertedWith("!governance");
        });
        it("can be added", async () => {
            const MOCK_STABLE_ADDRESS_1 = (await provider.createEmptyWallet()).address
            const MOCK_STABLE_ADDRESS_2 = (await provider.createEmptyWallet()).address

            let tx = await soteriaCoverageProduct.connect(governor).addToAcceptedStablecoinList(MOCK_STABLE_ADDRESS_1)
            expect(tx).emit(soteriaCoverageProduct, "StablecoinAdded").withArgs(MOCK_STABLE_ADDRESS_1);
            tx = await soteriaCoverageProduct.connect(governor).addToAcceptedStablecoinList(MOCK_STABLE_ADDRESS_2)
            expect(tx).emit(soteriaCoverageProduct, "StablecoinAdded").withArgs(MOCK_STABLE_ADDRESS_2);

            expect(await soteriaCoverageProduct.getIndexOfStablecoin(MOCK_STABLE_ADDRESS_1)).eq(1)
            expect(await soteriaCoverageProduct.acceptedStablecoinList(1)).eq(MOCK_STABLE_ADDRESS_1)
            expect(await soteriaCoverageProduct.getIndexOfStablecoin(MOCK_STABLE_ADDRESS_2)).eq(2)
            expect(await soteriaCoverageProduct.acceptedStablecoinList(2)).eq(MOCK_STABLE_ADDRESS_2)
        })
    })

    describe("removeFromAcceptedStablecoinList", () => {
        it("cannot be removed by non governance", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).removeFromAcceptedStablecoinList(0)).to.revertedWith("!governance");
        });
        it("can be removed", async () => {
            const MOCK_STABLE_ADDRESS_1 = await soteriaCoverageProduct.acceptedStablecoinList(1)
            const MOCK_STABLE_ADDRESS_2 = await soteriaCoverageProduct.acceptedStablecoinList(2)

            let tx = await soteriaCoverageProduct.connect(governor).removeFromAcceptedStablecoinList(0)
            expect(tx).emit(soteriaCoverageProduct, "StablecoinRemoved").withArgs(DAI_ADDRESS);

            // Check state variables
            expect(await soteriaCoverageProduct.getIndexOfStablecoin(MOCK_STABLE_ADDRESS_2)).eq(0)
            expect(await soteriaCoverageProduct.acceptedStablecoinList(0)).eq(MOCK_STABLE_ADDRESS_2)
            expect(await soteriaCoverageProduct.getIndexOfStablecoin(MOCK_STABLE_ADDRESS_1)).eq(1)
            expect(await soteriaCoverageProduct.acceptedStablecoinList(1)).eq(MOCK_STABLE_ADDRESS_1)
            await expect(soteriaCoverageProduct.getIndexOfStablecoin(DAI_ADDRESS)).to.revertedWith("stablecoin not in list");
        })
        after(async () => {
            // Remove mock stablecoins
            await soteriaCoverageProduct.connect(governor).removeFromAcceptedStablecoinList(1)
            await soteriaCoverageProduct.connect(governor).removeFromAcceptedStablecoinList(0)
            await expect(soteriaCoverageProduct.acceptedStablecoinList(0)).to.reverted;

            // Add DAI back as sole element of accepted stablecoin list
            let tx = await soteriaCoverageProduct.connect(governor).addToAcceptedStablecoinList(DAI_ADDRESS)
            expect(tx).emit(soteriaCoverageProduct, "StablecoinAdded").withArgs(DAI_ADDRESS);
            expect(await soteriaCoverageProduct.getIndexOfStablecoin(DAI_ADDRESS)).eq(0)
            expect(await soteriaCoverageProduct.acceptedStablecoinList(0)).eq(DAI_ADDRESS)
            await expect(soteriaCoverageProduct.acceptedStablecoinList(1)).to.reverted;
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
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(ZERO_ADDRESS, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, [])).to.revertedWith("zero address policyholder");
        });

        it("cannot buy policy when zero cover amount value is provided", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, ZERO_AMOUNT, 0, INITIAL_DEPOSIT, [])).to.revertedWith("zero cover value");
        });

        it("cannot buy policy when contract is paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, [])).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });

        it("cannot purchase a policy before Coverage Data Provider and Risk Manager are set up (maxCover = 0)", async () => {
            expect (await soteriaCoverageProduct.maxCover()).eq(0)
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, [])).to.revertedWith("insufficient capacity for new cover");
        })

        it("NEED USD SETUP FOR COVERAGE DATA PROVIDER - can setup Coverage Data Provider and Risk Manager", async () => {
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

        it("NEED USD SETUP FOR COVERAGE DATA PROVIDER - cannot buy policy when max cover exceeded", async () => {
            let maxCover = await soteriaCoverageProduct.maxCover();
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, maxCover.add(1), 0, INITIAL_DEPOSIT, [])).to.revertedWith("insufficient capacity for new cover");
        });

        it("cannot buy policy when insufficient deposit provided", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, ONE_ETH, 0, 0, [])).to.revertedWith("insufficient deposit for minimum required account balance");
        });

        it("can activate policy - 10000 DAI cover with 1000 DAI deposit", async () => {
            let tx = await soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, []);

            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_1);
            await expect(tx).emit(soteriaCoverageProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder1.address, POLICY_ID_1);
            await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(soteriaCoverageProduct.address, rmActiveCoverLimit, INITIAL_COVER_LIMIT);

            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(0)
            expect (await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT)
            expect (await soteriaCoverageProduct.policyStatus(POLICY_ID_1)).eq(true)
            expect (await soteriaCoverageProduct.policyOf(policyholder1.address)).eq(POLICY_ID_1)
            expect (await soteriaCoverageProduct.ownerOf(POLICY_ID_1)).eq(policyholder1.address)
            expect (await soteriaCoverageProduct.activeCoverLimit()).eq(INITIAL_COVER_LIMIT)
            expect (await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).eq(INITIAL_COVER_LIMIT)
            expect (await soteriaCoverageProduct.policyCount()).eq(1)
            expect (await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1)).eq(INITIAL_COVER_LIMIT)
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).to.equal(INITIAL_DEPOSIT);
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
        });

        it("cannot purchase more than one policy for a single address", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, [])).to.be.revertedWith("policy already activated")
            await expect(soteriaCoverageProduct.connect(policyholder2).activatePolicy(policyholder1.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, [])).to.be.revertedWith("policy already activated")
        })
        
        it("cannot transfer policy", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, 1)).to.be.revertedWith("only minting permitted");
            await expect(soteriaCoverageProduct.connect(policyholder1).transferFrom(policyholder1.address, ZERO_ADDRESS, 1)).to.be.revertedWith("ERC721: transfer to the zero address");
            // TO-DO, test ERC721.safeTransferFrom() => TypeError: soteriaCoverageProduct.connect(...).safeTransferFrom is not a function
        })

        it("can activate policy for another address - 10000 DAI cover with 1000 DAI deposit", async () => {
            let tx = await soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder2.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, []);

            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_2);
            await expect(tx).emit(soteriaCoverageProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder2.address, POLICY_ID_2);
            await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(soteriaCoverageProduct.address, INITIAL_COVER_LIMIT, INITIAL_COVER_LIMIT.add(INITIAL_COVER_LIMIT));

            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)).eq(0)
            expect (await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT)
            expect (await soteriaCoverageProduct.accountBalanceOf(policyholder2.address)).eq(INITIAL_DEPOSIT)
            expect (await soteriaCoverageProduct.policyStatus(POLICY_ID_2)).eq(true)
            expect (await soteriaCoverageProduct.policyOf(policyholder2.address)).eq(POLICY_ID_2)
            expect (await soteriaCoverageProduct.ownerOf(POLICY_ID_2)).eq(policyholder2.address)
            expect (await soteriaCoverageProduct.activeCoverLimit()).eq(INITIAL_COVER_LIMIT.mul(2))
            expect (await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address)).eq(INITIAL_COVER_LIMIT.mul(2))
            expect (await soteriaCoverageProduct.policyCount()).eq(2)
            expect (await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2)).eq(INITIAL_COVER_LIMIT)
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).to.equal(INITIAL_DEPOSIT.mul(2));
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
            await soteriaCoverageProduct.connect(policyholder1).activatePolicy(policyholder1.address, initialCoverLimit, 0, 0, []);
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
        })
        it("cannot use own referral code", async () => {
            // Create new wallet just for this unit test scope, to avoid creating side effects that impact other unit tests. It's a headfuck to work that out.
            const ownReferralCode = await getSoteriaReferralCode(policyholder3, soteriaCoverageProduct)
            await expect(soteriaCoverageProduct.connect(governor).activatePolicy(policyholder3.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, ownReferralCode)).to.revertedWith("cannot refer to self");
        })
        it("will not give reward points if isReferralOn == false", async () => {
            // Set isReferralOn to false
            await soteriaCoverageProduct.connect(governor).setIsReferralOn(false);
            expect(await soteriaCoverageProduct.isReferralOn()).eq(false)

            // Get valid referral code (we know it is valid, because it works in the next unit test)
            
            let referralCode = await getSoteriaReferralCode(policyholder1, soteriaCoverageProduct)
            let coverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2);

            // Attempt to use referral code
            let tx = await soteriaCoverageProduct.connect(governor).activatePolicy(policyholder3.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, referralCode);
            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_3);

            // Prove that no reward points were rewarded
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(0)
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)).eq(0)

            // Set isReferralOn back to true (default)
            await soteriaCoverageProduct.connect(governor).setIsReferralOn(true);
            expect(await soteriaCoverageProduct.isReferralOn()).eq(true)
        })

        it("can use referral code only once", async () => {
            let referralCode = await getSoteriaReferralCode(policyholder1, soteriaCoverageProduct)

            await soteriaCoverageProduct.connect(policyholder3).deactivatePolicy();
            let tx = await soteriaCoverageProduct.connect(governor).activatePolicy(policyholder3.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, referralCode);
            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_3);
            await expect(tx).emit(soteriaCoverageProduct, "ReferralRewardsEarned").withArgs(policyholder1.address, REFERRAL_REWARD);
            await expect(tx).emit(soteriaCoverageProduct, "ReferralRewardsEarned").withArgs(policyholder3.address, REFERRAL_REWARD);
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(REFERRAL_REWARD)
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder3.address)).eq(REFERRAL_REWARD)

            // Attempt to use another referral code, via activePolicy()
            await soteriaCoverageProduct.connect(policyholder3).deactivatePolicy();
            referralCode = await getSoteriaReferralCode(policyholder2, soteriaCoverageProduct)
            await expect(soteriaCoverageProduct.connect(governor).activatePolicy(policyholder3.address, INITIAL_COVER_LIMIT, 0, 0, referralCode)).to.revertedWith("cannot use referral code again");

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
            let soteriaContractDAIbalance = await dai.balanceOf(soteriaCoverageProduct.address)
            let tx = await soteriaCoverageProduct.connect(policyholder1).deposit(policyholder1.address, 0, INITIAL_DEPOSIT);
            await expect(tx).emit(soteriaCoverageProduct, "DepositMade").withArgs(policyholder1.address, INITIAL_DEPOSIT);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).to.equal(accountBalance.add(INITIAL_DEPOSIT));
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).to.equal(soteriaContractDAIbalance.add(INITIAL_DEPOSIT));
        });

        it("can deposit on behalf of policy holder", async () => {
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder2.address);
            let soteriaContractDAIbalance = await dai.balanceOf(soteriaCoverageProduct.address)
            let tx = await soteriaCoverageProduct.connect(policyholder1).deposit(policyholder2.address, 0, INITIAL_DEPOSIT);
            await expect(tx).emit(soteriaCoverageProduct, "DepositMade").withArgs(policyholder2.address, INITIAL_DEPOSIT);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder2.address)).to.equal(accountBalance.add(INITIAL_DEPOSIT));
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).to.equal(soteriaContractDAIbalance.add(INITIAL_DEPOSIT));
        });

        it("fallback will send ETH back", async () => {
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder1.address);
            let soteriaContractETHbalance = await provider.getBalance(soteriaCoverageProduct.address);
            let initialDepositorETHbalance = await provider.getBalance(policyholder1.address)

            let tx = await policyholder1.sendTransaction({ to: soteriaCoverageProduct.address, value: ONE_ETH });
            let receipt = await tx.wait();
            let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).eq(accountBalance)
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(soteriaContractETHbalance);
            expect(await provider.getBalance(policyholder1.address)).to.equal(initialDepositorETHbalance.sub(gasCost));
        });

        it("receive will send ETH back", async () => {
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder1.address);
            let soteriaContractETHbalance = await provider.getBalance(soteriaCoverageProduct.address);
            let initialDepositorETHbalance = await provider.getBalance(policyholder1.address)

            let tx = await policyholder1.sendTransaction({ to: soteriaCoverageProduct.address, value: ONE_ETH, data:"0x00" });
            let receipt = await tx.wait();
            let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);

            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).eq(accountBalance)
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(soteriaContractETHbalance);
            expect(await provider.getBalance(policyholder1.address)).to.equal(initialDepositorETHbalance.sub(gasCost));
        });

        it("cannot deposit while paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).deposit(policyholder1.address, 0, INITIAL_DEPOSIT)).to.revertedWith("contract paused");
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
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(ZERO_AMOUNT, [])).to.revertedWith("zero cover value");
        });

        it("cannot update for invalid policy", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder4).updateCoverLimit(NEW_COVER_LIMIT, [])).to.revertedWith("invalid policy");
        });

        it("cannot update while paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(NEW_COVER_LIMIT, [])).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });

        it("cannot update if max cover is exceeded", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(maxCover.add(1), [])).to.revertedWith("insufficient capacity for new cover");
        });

        it("cannot update if max cover for the strategy is exceeded", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(maxCoverPerStrategy.add(1), [])).to.revertedWith("insufficient capacity for new cover");
        });

        it("cannot update if below minimum required account balance for newCoverLimit", async () => {
            let maxRateNum = await soteriaCoverageProduct.maxRateNum();
            let maxRateDenom = await soteriaCoverageProduct.maxRateDenom();
            let chargeCycle = await soteriaCoverageProduct.chargeCycle();
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)
            let maxPermissibleNewCoverLimit = accountBalance.mul(maxRateDenom).div(maxRateNum).div(chargeCycle)
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(maxPermissibleNewCoverLimit.add(ONE_ETH), [])).to.revertedWith("insufficient deposit for minimum required account balance");
        })

        it("policy owner can update policy", async () => {
            let activeCoverLimit = initialSoteriaActiveCoverLimit.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);
            
            let tx = await soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(NEW_COVER_LIMIT, []);

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

        it("will exit cooldown when cover limit updated", async () => {
            let initialCoverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
            // deactivatePolicy() is the only way to start cooldown
            await soteriaCoverageProduct.connect(policyholder1).deactivatePolicy();
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).gt(0)
            await soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(initialCoverLimit, []);
            expect (await soteriaCoverageProduct.cooldownStart(policyholder1.address)).eq(0)
        })
        it("cannot use own referral code", async () => {
            let ownReferralCode = await getSoteriaReferralCode(policyholder1, soteriaCoverageProduct)
            let coverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(coverLimit, ownReferralCode)).to.revertedWith("cannot refer to self");
        })
        it("cannot use referral code of an inactive policy holder", async () => {
            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_3)).eq(false)
            let referralCode = await getSoteriaReferralCode(policyholder3, soteriaCoverageProduct)
            let coverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2);
            await expect(soteriaCoverageProduct.connect(policyholder2).updateCoverLimit(coverLimit, referralCode)).to.revertedWith("referrer must be active policy holder");
        })
        it("will not give reward points if isReferralOn == false", async () => {
            // Set isReferralOn to false
            await soteriaCoverageProduct.connect(governor).setIsReferralOn(false);
            expect(await soteriaCoverageProduct.isReferralOn()).eq(false)

            // Get valid referral code (we know it is valid, because it works in the next unit test)
            let referralCode = await getSoteriaReferralCode(policyholder1, soteriaCoverageProduct)
            let coverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2);

            // Attempt to use referral code
            let tx = await soteriaCoverageProduct.connect(policyholder2).updateCoverLimit(coverLimit, referralCode);

            // Prove that no reward points were rewarded
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(0)
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)).eq(0)

            // Set isReferralOn back to true (default)
            await soteriaCoverageProduct.connect(governor).setIsReferralOn(true);
            expect(await soteriaCoverageProduct.isReferralOn()).eq(true)
        })
        it("can use referral code only once", async () => {
            let referralCode = await getSoteriaReferralCode(policyholder1, soteriaCoverageProduct)
            let coverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2);

            let tx = await soteriaCoverageProduct.connect(policyholder2).updateCoverLimit(coverLimit, referralCode);
            await expect(tx).emit(soteriaCoverageProduct, "ReferralRewardsEarned").withArgs(policyholder1.address, REFERRAL_REWARD);
            await expect(tx).emit(soteriaCoverageProduct, "ReferralRewardsEarned").withArgs(policyholder2.address, REFERRAL_REWARD);
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)).eq(REFERRAL_REWARD)
            expect (await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)).eq(REFERRAL_REWARD)

            // Attempt to use another referral code
            tx = await soteriaCoverageProduct.connect(policyholder3).activatePolicy(policyholder3.address, INITIAL_COVER_LIMIT, 0, 0, []);
            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_3);
            referralCode = await getSoteriaReferralCode(policyholder3, soteriaCoverageProduct)
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
            await expect(soteriaCoverageProduct.connect(policyholder4).deactivatePolicy()).to.revertedWith("invalid policy");
        });

        it("policy owner can deactivate policy", async () => {
            // let tx = await soteriaCoverageProduct.connect(policyholder3).activatePolicy(policyholder3.address, INITIAL_COVER_LIMIT, 0, {value: ONE_ETH});
            // await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_3);

            let initialPolicyholderETHBalance = await policyholder3.getBalance();
            let initialPolicyholderAccountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)
            let initialPolicyCoverLimit = await soteriaCoverageProduct.connect(policyholder3).coverLimitOf(POLICY_ID_3);
            let initialActiveCoverLimit = await soteriaCoverageProduct.connect(policyholder3).activeCoverLimit();
            let initialAvailableCoverCapacity = await soteriaCoverageProduct.availableCoverCapacity();
            let initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
            let initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address);
            expect(await soteriaCoverageProduct.cooldownStart(policyholder3.address)).eq(0)

            // deactivate policy
            let tx = await soteriaCoverageProduct.connect(policyholder3).deactivatePolicy();
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
        let initialPolicyholderDAIBalance: BN;
        let initialSoteriaDAIBalance: BN;
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

            initialPolicyholderDAIBalance = await dai.balanceOf(policyholder3.address)
            initialSoteriaDAIBalance = await dai.balanceOf(soteriaCoverageProduct.address)

            initialActiveCoverLimit = await soteriaCoverageProduct.connect(policyholder3).activeCoverLimit();
            initialAvailableCoverCapacity = await soteriaCoverageProduct.availableCoverCapacity();
            initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
            initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address);

            maxRateNum = await soteriaCoverageProduct.maxRateNum();
            maxRateDenom = await soteriaCoverageProduct.maxRateDenom();
            chargeCycle = await soteriaCoverageProduct.chargeCycle();
            minRequiredAccountBalance = maxRateNum.mul(chargeCycle).mul(INITIAL_COVER_LIMIT).div(maxRateDenom)
            cooldownStart =  await soteriaCoverageProduct.cooldownStart(policyholder3.address)
            cooldownPeriod = await soteriaCoverageProduct.cooldownPeriod()
        })
        
        it("cannot withdraw while paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder3).withdraw(0)).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });
        it("before cooldown complete, will withdraw such that remaining balance = minRequiredAccountBalance", async () => {
            // Ensure we are before cooldown completion
            const currentTimestamp = (await provider.getBlock('latest')).timestamp
            expect(cooldownStart).gt(0)
            expect(currentTimestamp).lt(cooldownStart.add(cooldownPeriod))
            
            withdrawAmount = initialAccountBalance.sub(minRequiredAccountBalance)

            let tx = await soteriaCoverageProduct.connect(policyholder3).withdraw(0);          
            await expect(tx).emit(soteriaCoverageProduct, "WithdrawMade").withArgs(policyholder3.address, withdrawAmount);

            expect(initialAccountBalance).gt(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address))
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)).eq(minRequiredAccountBalance)
            expect(await dai.balanceOf(policyholder3.address)).eq(initialPolicyholderDAIBalance.add(withdrawAmount))
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).eq(initialSoteriaDAIBalance.sub(withdrawAmount))
        })
        it("after cooldown complete, can withdraw entire account balance", async () => {
            const initialTimestamp = (await provider.getBlock('latest')).timestamp
            const postCooldownTimestamp = initialTimestamp + cooldownPeriod.toNumber()
            expect(BN.from(postCooldownTimestamp)).gt(cooldownStart.add(cooldownPeriod))
            await provider.send("evm_mine", [postCooldownTimestamp])
            
            let policyholderDAIBalance = await dai.balanceOf(policyholder3.address)
            let soteriaDAIBalance = await dai.balanceOf(soteriaCoverageProduct.address)
            let accountBalance = await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)
            let tx = await soteriaCoverageProduct.connect(policyholder3).withdraw(0);
            await expect(tx).emit(soteriaCoverageProduct, "WithdrawMade").withArgs(policyholder3.address, accountBalance);

            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)).eq(0);
            expect(await dai.balanceOf(policyholder3.address)).eq(policyholderDAIBalance.add(accountBalance))
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).eq(soteriaDAIBalance.sub(accountBalance))
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
            await expect(soteriaCoverageProduct.connect(policyholder1).chargePremiums([policyholder1.address, policyholder2.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM], 0)).to.revertedWith("not premium collector");
        });

        it("cannot charge premiums if argument lengths are mismatched", async () => {
            await expect(soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address, policyholder3.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM], 0)).to.revertedWith("length mismatch");
        });

        it("cannot charge premiums if policy count is exceeded", async () => {
            await expect(soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address, policyholder3.address, policyholder4.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM], 0)).to.revertedWith("policy count exceeded");
        });

        it("cannot charge more than max rate", async () => {
            await expect(soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address], [WEEKLY_MAX_PREMIUM.mul(11).div(10), WEEKLY_MAX_PREMIUM.mul(11).div(10)], 0)).to.revertedWith("charging more than promised maximum rate");
        })

        it("can charge premiums", async () => {
            // CASE 1 - Charge weekly premium for two policyholders, no reward points involved
            
            // premiums are routed to the premium pool!
            let soteriaBalance = await dai.balanceOf(soteriaCoverageProduct.address);
            let premiumPoolBalance = await dai.balanceOf(premiumPool.address);
            let policyholder1AccountBalance = await soteriaCoverageProduct.connect(policyholder1).accountBalanceOf(policyholder1.address);
            let policyholder2AccountBalance = await soteriaCoverageProduct.connect(policyholder1).accountBalanceOf(policyholder2.address);
            let initialCoverLimit1 = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            let initialCoverLimit2 = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_2);
            let initialActiveCoverLimit = await soteriaCoverageProduct.activeCoverLimit();
            let initialActiveCoverCapacity = await soteriaCoverageProduct.availableCoverCapacity();

            // charge premiums
            let tx = soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM], 0);
            await expect(tx).emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder1.address, WEEKLY_MAX_PREMIUM);
            await expect(tx).emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder2.address, WEEKLY_MAX_PREMIUM);
         
            // Soteria account balance should be decreased
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder1.address)).to.equal(policyholder1AccountBalance.sub(WEEKLY_MAX_PREMIUM));
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder2.address)).to.equal(policyholder2AccountBalance.sub(WEEKLY_MAX_PREMIUM));

            // soteria balance should be decreased
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).to.equal(soteriaBalance.sub(WEEKLY_MAX_PREMIUM.mul(2)));

            // premium should be sent to premium pool
            expect(await dai.balanceOf(premiumPool.address)).to.equal(premiumPoolBalance.add(WEEKLY_MAX_PREMIUM.mul(2)));
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

            let tx = await soteriaCoverageProduct.connect(governor).activatePolicy(policyholder4.address, INITIAL_COVER_LIMIT, 0, depositAmount, []);
            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_4);

            let initialSoteriaBalance = await dai.balanceOf(soteriaCoverageProduct.address);
            let initialPremiumPoolBalance = await dai.balanceOf(premiumPool.address);
            let initialHolderAccountBalance = await soteriaCoverageProduct.connect(policyholder4).accountBalanceOf(policyholder4.address);
            let initialActiveCoverLimit = await soteriaCoverageProduct.connect(policyholder4).activeCoverLimit();
            let initialPolicyCoverLimit = await soteriaCoverageProduct.connect(policyholder4).coverLimitOf(POLICY_ID_4);
            let initialAvailableCoverCapacity = await soteriaCoverageProduct.connect(policyholder4).availableCoverCapacity();
            let initialRMCoverAmount = await riskManager.activeCoverLimit();
            let initialRMSoteriaCoverAmount = await riskManager.activeCoverLimitPerStrategy(soteriaCoverageProduct.address);

            // we cannot reach the PremiumPartiallyCharged branch within a single chargePremiums() call
            await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder4.address], [WEEKLY_MAX_PREMIUM], 0);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder4.address)).eq(WEEKLY_MAX_PREMIUM.div(10))
            tx = await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder4.address], [WEEKLY_MAX_PREMIUM], 0);
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
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).to.equal(initialSoteriaBalance.sub(depositAmount));
            
            // premium should be sent to premium pool
            expect(await dai.balanceOf(premiumPool.address)).to.equal(initialPremiumPoolBalance.add(depositAmount));
        });

        it("will be able to charge premiums for accounts that have been deactivated in the last epoch", async () => {
            // CASE 3 - Create a new account, deactivate it, then charge premium on this newly deactivated account
            
            // Create a new account, then deactivate it
            await soteriaCoverageProduct.connect(governor).activatePolicy(policyholder5.address, INITIAL_COVER_LIMIT, 0, INITIAL_DEPOSIT, [])
            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_5)).to.equal(true);
            await soteriaCoverageProduct.connect(policyholder5).deactivatePolicy()
            expect(await soteriaCoverageProduct.policyStatus(POLICY_ID_5)).to.equal(false);

            // Get initial balances
            let initialSoteriaBalance = await dai.balanceOf(soteriaCoverageProduct.address);
            let initialPremiumPoolBalance = await dai.balanceOf(premiumPool.address);
            let initialHolderFunds = await soteriaCoverageProduct.accountBalanceOf(policyholder5.address);

            // Charge premiums
            let tx = await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder5.address], [WEEKLY_MAX_PREMIUM], 0);
            await expect(tx).emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder5.address, WEEKLY_MAX_PREMIUM);
         
            // Check balances
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder5.address)).to.equal(initialHolderFunds.sub(WEEKLY_MAX_PREMIUM));
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).to.equal(initialSoteriaBalance.sub(WEEKLY_MAX_PREMIUM));
            expect(await dai.balanceOf(premiumPool.address)).to.equal(initialPremiumPoolBalance.add(WEEKLY_MAX_PREMIUM));
        })

        // it("REDUNDANT FOR NOW - will skip charging premium for inactive accounts", async () => {
            // CASE 4 (REUNDANT FOR NOW) - Policy holder 5 withdraws, then premium is charged twice
            // Redundant because we allow the edge case of premium collector charging a deactivated account more than once

            // let initialSoteriaBalance = await dai.balanceOf(soteriaCoverageProduct.address);
            // let initialPremiumPoolBalance = await dai.balanceOf(premiumPool.address);
            // let initialHolderFunds = await soteriaCoverageProduct.accountBalanceOf(policyholder5.address);

            // // Policy holder 5 withdraw
            // await soteriaCoverageProduct.connect(policyholder5).withdraw();
            
            // let minRequiredAccountBalance = maxRateNum.mul(ONE_WEEK).mul(INITIAL_COVER_LIMIT).div(maxRateDenom)
            // console.log(Number(minRequiredAccountBalance))
            // console.log(Number(await soteriaCoverageProduct.accountBalanceOf(policyholder5.address)))
            // console.log(Number(WEEKLY_MAX_PREMIUM))

            // // charge premiums
            // let tx = await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder5.address], [WEEKLY_MAX_PREMIUM]);
            // await expect(tx).emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder5.address, WEEKLY_MAX_PREMIUM);
            // console.log(Number(await soteriaCoverageProduct.accountBalanceOf(policyholder5.address)))

            // let tx = soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder2.address, policyholder4.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM]);
            // await expect(tx).emit(soteriaCoverageProduct, "PremiumCharged").withArgs(policyholder2.address, WEEKLY_MAX_PREMIUM);
         
            // expect(await soteriaCoverageProduct.connect(policyholder2).accountBalanceOf(policyholder2.address)).to.equal(initialHolderFunds.sub(WEEKLY_MAX_PREMIUM));
         
            // // soteria balance should be decreased by single weekly premium
            // expect(await dai.balanceOf(soteriaCoverageProduct.address)).to.equal(initialSoteriaBalance.sub(WEEKLY_MAX_PREMIUM));
          
            // // single weekly premium should be sent to premium pool
            // expect(await dai.balanceOf(premiumPool.address)).to.equal(initialPremiumPoolBalance.add(WEEKLY_MAX_PREMIUM));
        // });

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

            let referralCode = await getSoteriaReferralCode(policyholder2, soteriaCoverageProduct)
            let coverLimit = await soteriaCoverageProduct.coverLimitOf(POLICY_ID_1);
            let tx = await soteriaCoverageProduct.connect(policyholder1).updateCoverLimit(coverLimit, referralCode);
            let initialRewardPoints1 = await soteriaCoverageProduct.rewardPointsOf(policyholder1.address)
            expect(initialRewardPoints1).gt(EXCESS_REWARD_POINTS)

            tx = await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder2.address, INSUFFICIENT_REWARD_POINTS)
            expect(tx).to.emit(soteriaCoverageProduct, "RewardPointsSet").withArgs(policyholder2.address, INSUFFICIENT_REWARD_POINTS);
            let initialRewardPoints2 = await soteriaCoverageProduct.rewardPointsOf(policyholder2.address)
            expect(initialRewardPoints2).eq(INSUFFICIENT_REWARD_POINTS)

            // Set up policy 3 (remember we need minimum 2 chargePremium calls to reach PremiumsPartiallySet branch, so we will do the first call to setup)
            // Also remember that we deactivated and did a complete withdrawal of amount in policyholder3's account in withdraw() unit test
            let depositAmount = WEEKLY_MAX_PREMIUM.mul(11).div(10)
            await soteriaCoverageProduct.connect(governor).activatePolicy(policyholder3.address, INITIAL_COVER_LIMIT, 0, depositAmount, []);
            await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder3.address], [WEEKLY_MAX_PREMIUM], 0);
            expect(await soteriaCoverageProduct.accountBalanceOf(policyholder3.address)).eq(WEEKLY_MAX_PREMIUM.div(10))
            tx = await soteriaCoverageProduct.connect(coverPromotionAdmin).setRewardPoints(policyholder3.address, INSUFFICIENT_REWARD_POINTS)
            expect(tx).to.emit(soteriaCoverageProduct, "RewardPointsSet").withArgs(policyholder3.address, INSUFFICIENT_REWARD_POINTS);
            let initialRewardPoints3 = await soteriaCoverageProduct.rewardPointsOf(policyholder3.address)
            expect(initialRewardPoints3).eq(INSUFFICIENT_REWARD_POINTS)

            // Get initial state variable values
            let initialSoteriaBalance = await dai.balanceOf(soteriaCoverageProduct.address);
            let initialPremiumPoolBalance = await dai.balanceOf(premiumPool.address);
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

            tx = await soteriaCoverageProduct.connect(premiumCollector).chargePremiums([policyholder1.address, policyholder2.address, policyholder3.address], [WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM, WEEKLY_MAX_PREMIUM], 0)
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
            expect(await dai.balanceOf(soteriaCoverageProduct.address)).eq(initialSoteriaBalance.sub(expectedSoteriaBalanceChange))

            // Premium pool balance check
            expect(await dai.balanceOf(premiumPool.address)).eq(initialPremiumPoolBalance.add(expectedSoteriaBalanceChange))

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

            let coverLimit = BN.from(100);
            let depositAmount = BN.from(10);
            let WEEKLY_MAX_PREMIUM = coverLimit.div(10).mul(604800).div(31536000) // Override global WEEKLY_MAX_PREMIUM variable

            // Activate policies for each user, 100 DAI cover limit with 10 DAI deposit
            for (let user of users) {
                await soteriaCoverageProduct.connect(governor).activatePolicy(user.address, coverLimit, 0, depositAmount, [])
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
            await soteriaCoverageProduct.connect(premiumCollector).chargePremiums(ADDRESS_ARRAY, PREMIUM_ARRAY, 0);
        })

    });

    async function manipulateDAIbalance(wallet: Wallet, desiredBalance: BN) {
        const DAI_BALANCEOF_SLOT = 2;
        // Get storage slot index
        const index = utils.solidityKeccak256(
            ["uint256", "uint256"],
            [wallet.address, DAI_BALANCEOF_SLOT] // key, slot
          );

        // Manipulate local balance (needs to be bytes32 string)
        await provider.send("hardhat_setStorageAt", [DAI_ADDRESS, index.toString(), toBytes32(desiredBalance).toString()])
        await provider.send("evm_mine", []) // Mine the next block
    }

    function toBytes32 (bn: BN) {
        return utils.hexlify(utils.zeroPad(bn.toHexString(), 32));
    };

});

