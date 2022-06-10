import { waffle, ethers } from "hardhat";
import { MockProvider } from "ethereum-waffle";
import { BigNumber as BN, utils, Contract, Wallet, constants } from "ethers";
import chai from "chai";
import { config as dotenv_config } from "dotenv";
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { Registry, RiskManager, SolaceCoverProductV3, CoverageDataProvider, Solace, MockErc20Permit, Scp, MockErc20Decimals, CoverPaymentManager} from "../../typechain";
import { assembleSignature, getPremiumDataDigest, getPriceDataDigest, sign } from "../utilities/signature";

const { expect } = chai;
const { deployContract, solidity} = waffle;
const provider: MockProvider = waffle.provider;

dotenv_config();
chai.use(solidity)

describe("SolaceCoverProductV3", function() {
    let artifacts: ArtifactImports;
    let registry: Registry;
    let riskManager: RiskManager;
    let solaceCoverProduct: SolaceCoverProductV3;
    let solace: MockErc20Permit;
    let dai: MockErc20Decimals;
    let coverageDataProvider: CoverageDataProvider;
    let scp: Scp;
    let coverPaymentManager: CoverPaymentManager;

    const [deployer, governor, newGovernor, user, policyholder1, policyholder2, policyholder3, policyholder4, policyholder5, policyholder6, policyholder7, policyholder8, policyholder9, signer, premiumPool, premiumCollector] = provider.getWallets();

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const ONE_ETH = BN.from("1000000000000000000"); // 1 eth
    const INITIAL_DEPOSIT = ONE_ETH.mul(1000); // 1000 SCP
    const COVER_LIMIT = ONE_ETH.mul(10000); // 10000 SCP
    const ONE_MILLION_SCP = ONE_ETH.mul(1000000)
    const NEW_COVER_LIMIT = COVER_LIMIT.mul(2); // 20000 SCP
    const ZERO_AMOUNT = BN.from("0");
    const ONE_DAI = ONE_ETH; // 1 USD
    const ONE_SOLACE = ONE_ETH; // 1 SOLACE
    const ANNUAL_MAX_PREMIUM = COVER_LIMIT.div(10); // 0.1 eth, for testing we assume max annual rate of 10% of cover limit
    const WEEKLY_MAX_PREMIUM = ANNUAL_MAX_PREMIUM.mul(604800).div(31536000);
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
    const POLICY_ID_6 = BN.from("6");
    const POLICY_ID_7 = BN.from("7");
    const POLICY_ID_8 = BN.from("8");
    const POLICY_ID_9 = BN.from("9");

    /**
        HOURLY=0,
        DAILY=1,
        WEEKLY=2,
        MONTHLY=3,
        ANNUALLY=4
    */
    const WEEKLY = 2;
    const ONE_WEEK = 604800;
    const maxRateNum = BN.from("1");
    const maxRateDenom = BN.from("315360000"); // We are testing with maxRateNum and maxRateDenom that gives us an annual max rate of 10% coverLimit
    let snapshot: BN;

    // price signature
    const TYPEHASH_PRICE = utils.keccak256(utils.toUtf8Bytes("PriceData(address token,uint256 price,uint256 deadline)"));
    const DOMAIN_NAME = "Solace.fi-SolaceSigner";
    const INVALID_DOMAIN_NAME = "Solace.fi-Invalid";
    const TYPEHASH_PREMIUM = utils.keccak256(utils.toUtf8Bytes("PremiumData(uint256 premium,address policyholder,uint256 deadline)"));
    const INVALID_TYPEHASH_PREMIUM = utils.keccak256(utils.toUtf8Bytes("Invalid(uint256 premium,address policyholder,uint256 deadline)"));
    const CHAIN_ID = 31337;
    const DEADLINE = constants.MaxUint256;
    let SOLACE_PRICE_1 = ONE_ETH; // 1$

    before( async () => {
      artifacts = await import_artifacts();
      snapshot = await provider.send("evm_snapshot", []);
      
      await deployer.sendTransaction({to: deployer.address});

      // deploy registry
      registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;

      // deploy solace
      solace = (await deployContract(deployer, artifacts.MockERC20Permit, ["solace", "SOLACE", 0, 18])) as MockErc20Permit;
      await registry.connect(governor).set(["solace"], [solace.address])

      // deploy riskmanager
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
      await registry.connect(governor).set(["riskManager"], [riskManager.address])

      // deploy scp
      scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
      await registry.connect(governor).set(["scp"], [scp.address])

      // deploy dai
      dai = (await deployContract(deployer, artifacts.MockERC20Decimals, ["Dai Stablecoin", "DAI", 0, 18])) as MockErc20Decimals;

      // deploy coveragedataprovider
      coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address])) as CoverageDataProvider;
      await registry.connect(governor).set(["coverageDataProvider"], [coverageDataProvider.address])

      // set premium collector(calls setChargedTime, setDebts)
      await registry.connect(governor).set(["premiumCollector"], [premiumCollector.address]);
      await registry.connect(governor).set(["premiumPool"], [premiumPool.address]);

      // deploy cover payment manager
      coverPaymentManager = (await deployContract(deployer, artifacts.CoverPaymentManager, [governor.address, registry.address])) as CoverPaymentManager;
      await registry.connect(governor).set(["coverPaymentManager"], [coverPaymentManager.address])
      const tokens = [
        {'token': dai.address, 'accepted': true, 'permittable': false, 'refundable': true, 'stable': true},  // dai
        {'token': solace.address, 'accepted': true, 'permittable': true, 'refundable': true, 'stable': false},   // solace
      ];
      await coverPaymentManager.connect(governor).addSigner(governor.address);
      await coverPaymentManager.connect(governor).setTokenInfo(tokens);


      // give permission to manage scp
      await scp.connect(governor).setScpMoverStatuses([coverPaymentManager.address], [true]);
      expect(await scp.isScpMover(coverPaymentManager.address));

    });

    after(async function () {
      await provider.send("evm_revert", [snapshot]);
    });

    describe("deployment", () => {
      let mockRegistry: Registry;

      before(async () => {
        mockRegistry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      });

      it("reverts for zero address governance", async () => {
        await expect(deployContract(deployer, artifacts.SolaceCoverProductV3, [ZERO_ADDRESS, mockRegistry.address])).to.be.revertedWith("zero address governance");
      });

      it("reverts for zero address registry", async () => {
        await expect(deployContract(deployer, artifacts.SolaceCoverProductV3, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address registry");
      });

      it("reverts for zero address riskmanager", async () => {
        await expect(deployContract(deployer, artifacts.SolaceCoverProductV3, [governor.address, mockRegistry.address])).to.be.revertedWith("zero address riskmanager");
        await mockRegistry.connect(governor).set(["riskManager"], [riskManager.address])
      });

      it("reverts for zero address payment manager", async () => {
        await expect(deployContract(deployer, artifacts.SolaceCoverProductV3, [governor.address, mockRegistry.address])).to.be.revertedWith("zero address payment manager");
      });

      it("can deploy", async () => {
        solaceCoverProduct = await deployContract(deployer, artifacts.SolaceCoverProductV3, [governor.address, registry.address]) as SolaceCoverProductV3;
        expect(solaceCoverProduct.address).to.not.undefined;
      });

      it("should start with defaults", async () => {
        expect(await solaceCoverProduct.maxRateNum()).eq(maxRateNum);
        expect(await solaceCoverProduct.maxRateDenom()).eq(maxRateDenom);
        expect(await solaceCoverProduct.chargeCycle()).eq(ONE_WEEK)
        expect(await solaceCoverProduct.numSigners()).eq(0);
      })
    });

    describe("governance", () => {
      it("starts with the correct governor", async () => {
        expect(await solaceCoverProduct.governance()).to.equal(governor.address);
      });

      it("rejects setting new governance by non governor", async  () => {
        await expect(solaceCoverProduct.connect(policyholder1).setPendingGovernance(policyholder1.address)).to.be.revertedWith("!governance");
      });

      it("can set new governance", async () => {
        let tx = await solaceCoverProduct.connect(governor).setPendingGovernance(newGovernor.address);
        await expect(tx).to.emit(solaceCoverProduct, "GovernancePending").withArgs(newGovernor.address);
        expect(await solaceCoverProduct.governance()).to.equal(governor.address);
        expect(await solaceCoverProduct.pendingGovernance()).to.equal(newGovernor.address);
      });

      it("rejects governance transfer by non governor", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).acceptGovernance()).to.be.revertedWith("!pending governance");
      });

      it("can transfer governance", async () => {
        let tx = await solaceCoverProduct.connect(newGovernor).acceptGovernance();
        await expect(tx)
          .to.emit(solaceCoverProduct, "GovernanceTransferred")
          .withArgs(governor.address, newGovernor.address);
        expect(await solaceCoverProduct.governance()).to.equal(newGovernor.address);
        await solaceCoverProduct.connect(newGovernor).setPendingGovernance(governor.address);
        await solaceCoverProduct.connect(governor).acceptGovernance();
      });

      it("can add signer", async () => {
        let tx = await solaceCoverProduct.connect(governor).addSigner(signer.address);
        await expect(tx).emit(solaceCoverProduct, "SignerAdded").withArgs(signer.address);
        expect(await solaceCoverProduct.numSigners()).eq(1);
        expect(await solaceCoverProduct.isSigner(signer.address)).eq(true);
        expect(await solaceCoverProduct.getSigner(0)).eq(signer.address);
      });

      it("can remove signer", async () => {
        let tx = await solaceCoverProduct.connect(governor).removeSigner(signer.address);
        await expect(tx).emit(solaceCoverProduct, "SignerRemoved").withArgs(signer.address);
        expect(await solaceCoverProduct.numSigners()).eq(0);
        expect(await solaceCoverProduct.isSigner(signer.address)).eq(false);
        await expect( solaceCoverProduct.getSigner(0)).reverted;
        await solaceCoverProduct.connect(governor).addSigner(signer.address);
      });
    });

    describe("pause", () => {
      it("starts unpaused", async () => {
        expect(await solaceCoverProduct.paused()).to.equal(false);
      });

      it("cannot be paused by non governance", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).setPaused(true)).to.be.revertedWith("!governance");
        expect(await solaceCoverProduct.paused()).to.equal(false);
      });

      it("can be paused", async () => {
        let tx = await solaceCoverProduct.connect(governor).setPaused(true);
        await expect(tx).to.emit(solaceCoverProduct, "PauseSet").withArgs(true);
        expect(await solaceCoverProduct.paused()).to.equal(true);
      });

      it("cannot be unpaused by non governance", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).setPaused(false)).to.be.revertedWith("!governance");
        expect(await solaceCoverProduct.paused()).to.equal(true);
      });

      it("can be unpaused", async () => {
        let tx = await solaceCoverProduct.connect(governor).setPaused(false);
        await expect(tx).to.emit(solaceCoverProduct, "PauseSet").withArgs(false);
        expect(await solaceCoverProduct.paused()).to.equal(false);
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
        await solaceCoverProduct.connect(governor).setRegistry(registry.address);
        expect(await solaceCoverProduct.connect(policyholder1).registry()).to.equal(registry.address);
      });

      it("starts with correct registry", async () => {
        expect(await solaceCoverProduct.connect(policyholder1).registry()).to.equal(registry.address);
      });

      it("starts with correct riskmanager", async () => {
        expect(await solaceCoverProduct.connect(policyholder1).riskManager()).to.equal(riskManager.address);
      });

      it("starts with correct payment manager", async () => {
        expect(await solaceCoverProduct.connect(policyholder1).paymentManager()).to.equal(coverPaymentManager.address);
      });

      it("cannot be set by non governance", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).setRegistry(registry2.address)).to.revertedWith("!governance");
      });

      it("reverts for zero address registry", async () => {
        await expect(solaceCoverProduct.connect(governor).setRegistry(ZERO_ADDRESS)).to.revertedWith("zero address registry");
      });

      it("reverts for zero address riskmanager", async () => {
        await expect(solaceCoverProduct.connect(governor).setRegistry(registry2.address)).to.revertedWith("zero address riskmanager");
      });

      it("reverts for zero address payment manager", async () => {
        await registry2.connect(governor).set(["riskManager"], [riskManager2.address]);
        await expect(solaceCoverProduct.connect(governor).setRegistry(registry2.address)).to.revertedWith("zero address payment manager");
      });

      it("governance can set registry", async () => {
        await registry2.connect(governor).set(["coverPaymentManager"], [coverPaymentManager.address]);
        let tx = await solaceCoverProduct.connect(governor).setRegistry(registry2.address);
        await expect(tx).emit(solaceCoverProduct, "RegistrySet").withArgs(registry2.address);
        expect(await solaceCoverProduct.connect(policyholder1).registry()).to.equal(registry2.address);
        expect(await solaceCoverProduct.connect(policyholder1).riskManager()).to.equal(riskManager2.address);
        expect(await solaceCoverProduct.connect(policyholder1).paymentManager()).to.equal(coverPaymentManager.address);
      });
    });

    describe("setMaxRate", () => {
      it("cannot be set by non governance", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).setMaxRate(1,1)).to.revertedWith("!governance");
      });
      it("can be set", async () => {
        let tx = await solaceCoverProduct.connect(governor).setMaxRate(maxRateNum, maxRateDenom)
        await expect(tx).emit(solaceCoverProduct, "MaxRateSet").withArgs(maxRateNum, maxRateDenom);
      })
      it("getter functions working", async () => {
        expect(await solaceCoverProduct.maxRateNum()).eq(maxRateNum);
        expect(await solaceCoverProduct.maxRateDenom()).eq(maxRateDenom);
      })
    })

    describe("setChargeCycle", () => {
      it("cannot be set by non governance", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).setChargeCycle(1)).to.revertedWith("!governance");
      });
      
      it("can be set weekly", async () => {
        let tx = await solaceCoverProduct.connect(governor).setChargeCycle(WEEKLY)
        await expect(tx).emit(solaceCoverProduct, "ChargeCycleSet").withArgs(ONE_WEEK);
      });

      it("can be set monthly", async () => {
        let tx = await solaceCoverProduct.connect(governor).setChargeCycle(3)
        await expect(tx).emit(solaceCoverProduct, "ChargeCycleSet").withArgs(2629746);
      });

      it("can be set one hourly", async () => {
        let tx = await solaceCoverProduct.connect(governor).setChargeCycle(0)
        await expect(tx).emit(solaceCoverProduct, "ChargeCycleSet").withArgs(3600);
      });

      it("can be set daily", async () => {
        let tx = await solaceCoverProduct.connect(governor).setChargeCycle(1)
        await expect(tx).emit(solaceCoverProduct, "ChargeCycleSet").withArgs(86400);
      });

      it("can be set annually", async () => {
        let tx = await solaceCoverProduct.connect(governor).setChargeCycle(4)
        await expect(tx).emit(solaceCoverProduct, "ChargeCycleSet").withArgs(31556952);
      });
      
      it("getter functions working", async () => {
        await solaceCoverProduct.connect(governor).setChargeCycle(WEEKLY)
        expect(await solaceCoverProduct.chargeCycle()).eq(ONE_WEEK);
      });

      it("cannot be set with invalid period", async () => {
        await expect(solaceCoverProduct.connect(governor).setChargeCycle(10)).to.reverted;
      });
    })

    describe("setBaseURI", () => {
      it("should default as expected string", async () => {
        expect(await solaceCoverProduct.baseURI()).eq("https://stats.solace.fi/policy/?chainID=31337&policyID=")
      });

      it("cannot be set by non governance", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).setBaseURI("https://solace")).to.revertedWith("!governance");
      });

      it("can be set", async () => {
        let tx = await solaceCoverProduct.connect(governor).setBaseURI("https://solace")
        await expect(tx).emit(solaceCoverProduct, "BaseURISet").withArgs("https://solace")
        expect(await solaceCoverProduct.baseURI()).eq("https://solace")

        // set default
        await solaceCoverProduct.connect(governor).setBaseURI("https://stats.solace.fi/policy/?chainID=31337&policyID=")
      });
    })

    describe("purchase(create)", () => {
      let rmActiveCoverLimit:BN;
      let rmSoteriaactiveCoverLimit: BN;
      let mcr: BN;
      let mcrps: BN;

      before(async () => {
        await riskManager.connect(governor).addCoverLimitUpdater(solaceCoverProduct.address);

        // risk manager active cover amount and active cover amount for soteria.
        rmActiveCoverLimit = await riskManager.activeCoverLimit();
        rmSoteriaactiveCoverLimit = await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address);

        // risk manager min. capital requirement and min. capital requirement for soteria
        mcr = await riskManager.minCapitalRequirement();
        mcrps = await riskManager.minCapitalRequirementPerStrategy(solaceCoverProduct.address);
      });

      it("cannot purchase policy when zero cover amount value is provided", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, ZERO_AMOUNT)).to.revertedWith("zero cover value");
      });

      it("cannot purchase policy when contract is paused", async () => {
        await solaceCoverProduct.connect(governor).setPaused(true);
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, COVER_LIMIT)).to.revertedWith("contract paused");
        await solaceCoverProduct.connect(governor).setPaused(false);
      });

      it("cannot purchase a policy if there is no enough capacity", async () => {
        expect (await solaceCoverProduct.maxCover()).eq(0)
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, COVER_LIMIT)).to.revertedWith("insufficient capacity");
      });

      it("can get updated max cover value", async () => {
        // add underwriting pool to the coverage data provider
        let maxCover1 = await riskManager.maxCover();
        expect(maxCover1).to.equal(0)
        expect(await coverageDataProvider.numOfPools()).to.equal(0);

        await coverageDataProvider.connect(governor).set("underwritingPool", ONE_MILLION_SCP);
        expect(await coverageDataProvider.connect(governor).numOfPools()).to.equal(1);
        let maxCover2 = await riskManager.maxCover();
        expect(maxCover2).to.equal(maxCover1.add(ONE_MILLION_SCP));

        // add Soteria to the risk manager and assign coverage allocation
        await riskManager.connect(governor).addRiskStrategy(solaceCoverProduct.address);
        await riskManager.connect(governor).setStrategyStatus(solaceCoverProduct.address, STRATEGY_STATUS.ACTIVE);
        await riskManager.connect(governor).setWeightAllocation(solaceCoverProduct.address, 1000);
        expect(await riskManager.maxCoverPerStrategy(solaceCoverProduct.address)).to.equal(maxCover2);
        expect(await riskManager.maxCoverPerStrategy(solaceCoverProduct.address)).to.equal(await solaceCoverProduct.maxCover());
      });

      it("cannot purchase policy when max cover exceeded", async () => {
        let maxCover = await solaceCoverProduct.maxCover();
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, maxCover.add(1))).to.revertedWith("insufficient capacity");
      });

      it("cannot purchase policy when insufficient user balance", async () => {
        expect(await scp.connect(policyholder1).balanceOf(policyholder1.address)).eq(0);
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, COVER_LIMIT)).to.revertedWith("insufficient scp balance");
      })

      it("can purchase policy", async () => {
        // mint 1000 scp to user
        await scp.connect(governor).setScpMoverStatuses([governor.address], [true]);
        await scp.connect(governor).setScpRetainerStatuses([solaceCoverProduct.address], [true]);
        await scp.connect(governor).mint(policyholder1.address, INITIAL_DEPOSIT, true);
        expect(await scp.connect(policyholder1).balanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT);

        // make purchase
        let tx = await solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, COVER_LIMIT);

        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_1);
        await expect(tx).emit(solaceCoverProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder1.address, POLICY_ID_1);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(solaceCoverProduct.address, rmActiveCoverLimit, COVER_LIMIT);

        expect(await solaceCoverProduct.policyStatus(POLICY_ID_1)).eq(true)
        expect(await solaceCoverProduct.policyOf(policyholder1.address)).eq(POLICY_ID_1)
        expect(await solaceCoverProduct.ownerOf(POLICY_ID_1)).eq(policyholder1.address)
        expect(await solaceCoverProduct.activeCoverLimit()).eq(COVER_LIMIT)
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(COVER_LIMIT)
        expect(await solaceCoverProduct.totalSupply()).eq(1)
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_1)).eq(COVER_LIMIT)
        expect(await scp.balanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT)
      });

      it("cannot re-purchase with same cover limit", async () => {
        await solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, COVER_LIMIT);
        expect(await solaceCoverProduct.policyStatus(POLICY_ID_1)).eq(true)
        expect(await solaceCoverProduct.policyOf(policyholder1.address)).eq(POLICY_ID_1)
        expect(await solaceCoverProduct.ownerOf(POLICY_ID_1)).eq(policyholder1.address)
        expect(await solaceCoverProduct.activeCoverLimit()).eq(COVER_LIMIT)
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(COVER_LIMIT)
        expect(await solaceCoverProduct.totalSupply()).eq(1)
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_1)).eq(COVER_LIMIT)
        expect(await scp.balanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT)
      });

      it("can get mrab", async () => {
        expect(await solaceCoverProduct.minRequiredAccountBalance(COVER_LIMIT)).eq(WEEKLY_MAX_PREMIUM);
      });

      it("cannot transfer policy", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, 1)).to.be.revertedWith("only minting permitted");
        await expect(solaceCoverProduct.connect(policyholder1).transferFrom(policyholder1.address, ZERO_ADDRESS, 1)).to.be.revertedWith("ERC721: transfer to the zero address");
      })

      it("can purchase another policy", async () => {
        // mint 1000 scp to policyholder2
        await scp.connect(governor).mint(policyholder2.address, INITIAL_DEPOSIT, true);
        expect(await scp.connect(policyholder2).balanceOf(policyholder2.address)).eq(INITIAL_DEPOSIT);

        // make purchase
        let tx = await solaceCoverProduct.connect(policyholder2).purchase(policyholder2.address, COVER_LIMIT);

        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_2);
        await expect(tx).emit(solaceCoverProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder2.address, POLICY_ID_2);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(solaceCoverProduct.address, COVER_LIMIT, COVER_LIMIT.add(COVER_LIMIT));

        expect(await scp.balanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT)
        expect(await scp.balanceOf(policyholder2.address)).eq(INITIAL_DEPOSIT)
        expect(await solaceCoverProduct.policyStatus(POLICY_ID_2)).eq(true)
        expect(await solaceCoverProduct.policyOf(policyholder2.address)).eq(POLICY_ID_2)
        expect(await solaceCoverProduct.ownerOf(POLICY_ID_2)).eq(policyholder2.address)
        expect(await solaceCoverProduct.activeCoverLimit()).eq(COVER_LIMIT.mul(2))
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(COVER_LIMIT.mul(2))
        expect(await solaceCoverProduct.totalSupply()).eq(2)
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_2)).eq(COVER_LIMIT)
      });

      it("can have nft after purchasing", async () => {
        expect(await solaceCoverProduct.connect(policyholder1).balanceOf(policyholder1.address)).to.equal(1);
        expect(await solaceCoverProduct.connect(policyholder2).balanceOf(policyholder2.address)).to.equal(1);
      });

      it("should update risk manager active cover amount", async () => {
        let activeCoverLimit = await solaceCoverProduct.activeCoverLimit();
        expect(await riskManager.activeCoverLimit()).to.equal(rmActiveCoverLimit.add(activeCoverLimit));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).to.equal(rmSoteriaactiveCoverLimit.add(activeCoverLimit));
      });

      it("should update risk manager mcr", async () => {
        let activeCoverLimit = await solaceCoverProduct.connect(governor).activeCoverLimit();
        expect(await riskManager.minCapitalRequirement()).to.equal(mcr.add(activeCoverLimit));
        expect(await riskManager.minCapitalRequirementPerStrategy(solaceCoverProduct.address)).to.equal(mcrps.add(activeCoverLimit));
      });
    });

    describe("tokenURI", () => {
      it("cannot get for invalid policy ID", async () => {
        await expect(solaceCoverProduct.tokenURI(INVALID_POLICY_ID)).to.revertedWith("invalid policy");
      });

      it("can get for valid policy ID", async () => {
        const chainID =(await provider.getNetwork()).chainId;
        expect(await solaceCoverProduct.tokenURI(POLICY_ID_1)).eq(`https://stats.solace.fi/policy/?chainID=${chainID}&policyID=1`)
      })
    });

    describe("purchase(update)", () => {
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
        maxCoverPerStrategy = await riskManager.maxCoverPerStrategy(solaceCoverProduct.address);

        // risk manager current values
        initialMCR = await riskManager.minCapitalRequirement();
        initialMCRForSoteria = await riskManager.minCapitalRequirementPerStrategy(solaceCoverProduct.address);

        // risk manager current values
        initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
        initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address);

        initialSoteriaActiveCoverLimit = await solaceCoverProduct.connect(policyholder1).activeCoverLimit();
        initialPolicyCoverLimit = await solaceCoverProduct.connect(policyholder1).coverLimitOf(POLICY_ID_1);

        expect(await solaceCoverProduct.connect(policyholder1).ownerOf(POLICY_ID_1)).to.equal(policyholder1.address);
      });

      it("cannot update for zero cover amount", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, ZERO_AMOUNT)).to.revertedWith("zero cover value");
      });

      it("cannot update while paused", async () => {
        await solaceCoverProduct.connect(governor).setPaused(true);
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, NEW_COVER_LIMIT)).to.revertedWith("contract paused");
        await solaceCoverProduct.connect(governor).setPaused(false);
      });

      it("cannot update if max cover is exceeded", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, maxCover.add(1))).to.revertedWith("insufficient capacity");
      });

      it("cannot update if max cover for the strategy is exceeded", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, maxCoverPerStrategy.add(1))).to.revertedWith("insufficient capacity");
      });

      it("cannot update if below minimum required account balance for new cover limit", async () => {
        let maxRateNum = await solaceCoverProduct.maxRateNum();
        let maxRateDenom = await solaceCoverProduct.maxRateDenom();
        let chargeCycle = await solaceCoverProduct.chargeCycle();
        let accountBalance = await scp.balanceOf(policyholder1.address)
        let maxPermissibleNewCoverLimit = accountBalance.mul(maxRateDenom).div(maxRateNum).div(chargeCycle)

        // Temporarily increase underwriting pool balance to avoid running into "insufficient capacity" revert
        await coverageDataProvider.connect(governor).set("underwritingPool", ONE_MILLION_SCP.mul(1000000));
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, maxPermissibleNewCoverLimit.add(ONE_ETH))).to.revertedWith("insufficient scp balance");
        await coverageDataProvider.connect(governor).set("underwritingPool", ONE_MILLION_SCP);
      });

      it("policy owner can update policy", async () => {
        let activeCoverLimit = initialSoteriaActiveCoverLimit.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);

        let tx = await solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, NEW_COVER_LIMIT);

        await expect(tx).emit(solaceCoverProduct, "PolicyUpdated").withArgs(POLICY_ID_1);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(solaceCoverProduct.address, initialRMActiveCoverLimit, initialRMActiveCoverLimit.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit));
        expect(await solaceCoverProduct.connect(policyholder1).activeCoverLimit()).to.equal(activeCoverLimit);
        expect(await solaceCoverProduct.connect(policyholder1).coverLimitOf(POLICY_ID_1)).to.equal(NEW_COVER_LIMIT);
      });

      it("policy owner can reduce cover limit", async () => {
        let tx = await solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, NEW_COVER_LIMIT.div(2));
        await expect(tx).emit(solaceCoverProduct, "PolicyUpdated").withArgs(POLICY_ID_1);
        expect(await solaceCoverProduct.connect(policyholder1).coverLimitOf(POLICY_ID_1)).to.equal(NEW_COVER_LIMIT.div(2));

        // revert state changes
        await solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address, NEW_COVER_LIMIT);
        expect(await solaceCoverProduct.connect(policyholder1).coverLimitOf(POLICY_ID_1)).to.equal(NEW_COVER_LIMIT);
      });

      it("should update risk manager active cover limit", async () => {
        let amount1 = initialRMActiveCoverLimit.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);
        let amount2 = initialRMActiveCoverLimitForSoteria.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);

        expect(await riskManager.activeCoverLimit()).to.equal(amount1);
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).to.equal(amount2);
      });

      it("should update risk manager mcr", async () => {
        let amount1 = initialMCR.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);
        let amount2 = initialMCRForSoteria.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);
        expect(await riskManager.minCapitalRequirement()).to.equal(amount1);
        expect(await riskManager.minCapitalRequirementPerStrategy(solaceCoverProduct.address)).to.equal(amount2);
      });
    });

    describe("purchaseWithStable", () => {
      let rmActiveCoverLimit:BN;
      let rmSoteriaactiveCoverLimit: BN;
      let mcr: BN;
      let mcrps: BN;
      const POLICYHOLDER3_DEPOSIT_AMOUNT = ONE_DAI.mul(1000); // 1000 DAI
      
      before(async () => {
        // checks
        expect(await solaceCoverProduct.totalSupply()).eq(2);
        expect(await solaceCoverProduct.policyOf(policyholder3.address)).eq(0);

        // risk manager active cover amount and active cover amount for soteria.
        rmActiveCoverLimit = await riskManager.activeCoverLimit();
        rmSoteriaactiveCoverLimit = await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address);

        // risk manager min. capital requirement and min. capital requirement for soteria
        mcr = await riskManager.minCapitalRequirement();
        mcrps = await riskManager.minCapitalRequirementPerStrategy(solaceCoverProduct.address); 
      });

      it("cannot purchase if product is not added as caller", async () => {
        await expect(solaceCoverProduct.connect(policyholder3)
          .purchaseWithStable(policyholder3.address, COVER_LIMIT, dai.address, POLICYHOLDER3_DEPOSIT_AMOUNT)).revertedWith("invalid product caller");
        await coverPaymentManager.connect(governor).addProduct(solaceCoverProduct.address);
      });

      it("cannot purchase policy with insufficient allowance", async () => {
        await dai.mintToken(policyholder3.address, POLICYHOLDER3_DEPOSIT_AMOUNT);
        expect(await dai.balanceOf(policyholder3.address)).eq(POLICYHOLDER3_DEPOSIT_AMOUNT);

        await expect(solaceCoverProduct.connect(policyholder3).purchaseWithStable(policyholder3.address, COVER_LIMIT, dai.address, POLICYHOLDER3_DEPOSIT_AMOUNT)).to.revertedWith("ERC20: transfer amount exceeds allowance");
        
        expect(await scp.balanceOf(policyholder3.address)).eq(0);
        await dai.connect(policyholder3).approve(coverPaymentManager.address, constants.MaxUint256);
        expect(await dai.allowance(policyholder3.address, coverPaymentManager.address)).eq(constants.MaxUint256);
      });

      it("cannot purchase policy with insufficient balance", async () => {
        await expect(solaceCoverProduct.connect(policyholder3).purchaseWithStable(policyholder3.address, COVER_LIMIT, dai.address, POLICYHOLDER3_DEPOSIT_AMOUNT.add(10000))).to.revertedWith("ERC20: transfer amount exceeds balance");
      });

      it("cannot purchase policy when zero cover limit value is provided", async () => {
        await expect(solaceCoverProduct.connect(policyholder3).purchaseWithStable(policyholder3.address, ZERO_AMOUNT, dai.address, POLICYHOLDER3_DEPOSIT_AMOUNT)).to.revertedWith("zero cover value");
      });

      it("cannot purchase policy when contract is paused", async () => {
        await solaceCoverProduct.connect(governor).setPaused(true);
        await expect(solaceCoverProduct.connect(policyholder3).purchaseWithStable(policyholder3.address, COVER_LIMIT, dai.address, POLICYHOLDER3_DEPOSIT_AMOUNT)).to.revertedWith("contract paused");
        await solaceCoverProduct.connect(governor).setPaused(false);
      });

      it("cannot purchase policy when max cover exceeded", async () => {
        let maxCover = await solaceCoverProduct.maxCover();
        await expect(solaceCoverProduct.connect(policyholder3).purchaseWithStable(policyholder3.address, maxCover.add(1), dai.address, POLICYHOLDER3_DEPOSIT_AMOUNT)).to.revertedWith("insufficient capacity");
      });
    
      it("can purchase policy", async () => {
        // make purchase
        let tx = await solaceCoverProduct.connect(policyholder3).purchaseWithStable(policyholder3.address, COVER_LIMIT, dai.address, POLICYHOLDER3_DEPOSIT_AMOUNT);

        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_3);
        await expect(tx).emit(solaceCoverProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder3.address, POLICY_ID_3);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(solaceCoverProduct.address, rmActiveCoverLimit, rmActiveCoverLimit.add(COVER_LIMIT));

        expect(await solaceCoverProduct.policyStatus(POLICY_ID_3)).eq(true)
        expect(await solaceCoverProduct.policyOf(policyholder3.address)).eq(POLICY_ID_3)
        expect(await solaceCoverProduct.ownerOf(POLICY_ID_3)).eq(policyholder3.address)
        expect(await solaceCoverProduct.activeCoverLimit()).eq(rmSoteriaactiveCoverLimit.add(COVER_LIMIT));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(rmSoteriaactiveCoverLimit.add(COVER_LIMIT))
        expect(await solaceCoverProduct.totalSupply()).eq(3)
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_3)).eq(COVER_LIMIT)
        expect(await scp.balanceOf(policyholder3.address)).eq(POLICYHOLDER3_DEPOSIT_AMOUNT)
        expect(await dai.balanceOf(policyholder3.address)).eq(0);
        expect(await coverPaymentManager.getSCPBalance(policyholder3.address)).eq(POLICYHOLDER3_DEPOSIT_AMOUNT)
      });

      it("cannot re-purchase with same cover limit", async () => {
        await dai.mintToken(policyholder3.address, POLICYHOLDER3_DEPOSIT_AMOUNT);
        await solaceCoverProduct.connect(policyholder3).purchaseWithStable(policyholder3.address, COVER_LIMIT, dai.address, POLICYHOLDER3_DEPOSIT_AMOUNT);
        expect(await solaceCoverProduct.policyStatus(POLICY_ID_3)).eq(true)
        expect(await solaceCoverProduct.policyOf(policyholder3.address)).eq(POLICY_ID_3)
        expect(await solaceCoverProduct.ownerOf(POLICY_ID_3)).eq(policyholder3.address)
        expect(await solaceCoverProduct.activeCoverLimit()).eq(rmSoteriaactiveCoverLimit.add(COVER_LIMIT));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(rmSoteriaactiveCoverLimit.add(COVER_LIMIT))
        expect(await solaceCoverProduct.totalSupply()).eq(3)
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_3)).eq(COVER_LIMIT)
        expect(await scp.balanceOf(policyholder3.address)).eq(POLICYHOLDER3_DEPOSIT_AMOUNT.mul(2));
        expect(await dai.balanceOf(policyholder3.address)).eq(0);
        expect(await coverPaymentManager.getSCPBalance(policyholder3.address)).eq(POLICYHOLDER3_DEPOSIT_AMOUNT.mul(2));
      });

      it("cannot transfer policy", async () => {
        expect(await solaceCoverProduct.ownerOf(POLICY_ID_3)).eq(policyholder3.address);
        await expect(solaceCoverProduct.connect(policyholder3).transferFrom(policyholder3.address, policyholder2.address, POLICY_ID_3)).to.be.revertedWith("only minting permitted");
        await expect(solaceCoverProduct.connect(policyholder3).transferFrom(policyholder3.address, ZERO_ADDRESS, POLICY_ID_3)).to.be.revertedWith("ERC721: transfer to the zero address");
      })

      it("can have nft after purchasing", async () => {
        expect(await solaceCoverProduct.connect(policyholder3).balanceOf(policyholder3.address)).to.equal(1);
      });

      it("should update risk manager active cover amount", async () => {
        expect(await riskManager.activeCoverLimit()).to.equal(rmActiveCoverLimit.add(COVER_LIMIT));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).to.equal(rmSoteriaactiveCoverLimit.add(COVER_LIMIT));
      });

      it("should update risk manager mcr", async () => {
        expect(await riskManager.minCapitalRequirement()).to.equal(mcr.add(COVER_LIMIT));
        expect(await riskManager.minCapitalRequirementPerStrategy(solaceCoverProduct.address)).to.equal(mcrps.add(COVER_LIMIT));
      });
    });

    describe("purchaseWithNonStable", () => {
      let rmActiveCoverLimit:BN;
      let rmSoteriaactiveCoverLimit: BN;
      let mcr: BN;
      let mcrps: BN;
      const POLICYHOLDER4_DEPOSIT_AMOUNT = ONE_SOLACE.mul(1000); // 1000 SOLACE
      let priceSignature1: string;
      let invalidPriceSignature: string;

      before(async () => {
        // checks
        expect(await solaceCoverProduct.totalSupply()).eq(3);
        expect(await solaceCoverProduct.policyOf(policyholder4.address)).eq(0);

        // risk manager active cover amount and active cover amount for soteria.
        rmActiveCoverLimit = await riskManager.activeCoverLimit();
        rmSoteriaactiveCoverLimit = await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address);

        // risk manager min. capital requirement and min. capital requirement for soteria
        mcr = await riskManager.minCapitalRequirement();
        mcrps = await riskManager.minCapitalRequirementPerStrategy(solaceCoverProduct.address);

        // sign SOLACE price
        const digest1 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, solace.address, SOLACE_PRICE_1, DEADLINE, TYPEHASH_PRICE);
        priceSignature1 = assembleSignature(sign(digest1, Buffer.from(governor.privateKey.slice(2), "hex")));
  
        const digest4 = getPriceDataDigest(DOMAIN_NAME, coverPaymentManager.address, CHAIN_ID, premiumPool.address, SOLACE_PRICE_1, DEADLINE, TYPEHASH_PRICE);
        invalidPriceSignature = assembleSignature(sign(digest4, Buffer.from(governor.privateKey.slice(2), "hex")));

        // remove product
        await coverPaymentManager.connect(governor).removeProduct(solaceCoverProduct.address);
      });

      it("cannot purchase if product is not added as caller", async () => {
        await expect(solaceCoverProduct.connect(policyholder4)
          .purchaseWithNonStable(policyholder4.address, COVER_LIMIT, solace.address, POLICYHOLDER4_DEPOSIT_AMOUNT, SOLACE_PRICE_1, DEADLINE, priceSignature1))
          .revertedWith("invalid product caller");
        
        await coverPaymentManager.connect(governor).addProduct(solaceCoverProduct.address);
      });

      it("cannot purchase policy with insufficient allowance", async () => {
        await solace.mintToken(policyholder4.address, POLICYHOLDER4_DEPOSIT_AMOUNT);
        expect(await solace.balanceOf(policyholder4.address)).eq(POLICYHOLDER4_DEPOSIT_AMOUNT);

        await expect(solaceCoverProduct.connect(policyholder4)
          .purchaseWithNonStable(policyholder4.address, COVER_LIMIT, solace.address, POLICYHOLDER4_DEPOSIT_AMOUNT, SOLACE_PRICE_1, DEADLINE, priceSignature1))
          .to.revertedWith("ERC20: transfer amount exceeds allowance");
          
        expect(await scp.balanceOf(policyholder4.address)).eq(0);
        await solace.connect(policyholder4).approve(coverPaymentManager.address, constants.MaxUint256);
        expect(await solace.allowance(policyholder4.address, coverPaymentManager.address)).eq(constants.MaxUint256);
      });

      it("cannot purchase policy with insufficient balance", async () => {
        await expect(solaceCoverProduct.connect(policyholder4)
          .purchaseWithNonStable(policyholder4.address, COVER_LIMIT, solace.address, POLICYHOLDER4_DEPOSIT_AMOUNT.add(100), SOLACE_PRICE_1, DEADLINE, priceSignature1))
          .to.revertedWith("ERC20: transfer amount exceeds balance");
      });

      it("cannot purchase policy with invalid token price", async () => {
        await expect(solaceCoverProduct.connect(policyholder4)
          .purchaseWithNonStable(policyholder4.address, COVER_LIMIT, solace.address, POLICYHOLDER4_DEPOSIT_AMOUNT, SOLACE_PRICE_1, DEADLINE, invalidPriceSignature))
          .to.revertedWith("invalid token price");
      });

      it("cannot purchase policy when zero cover limit value is provided", async () => {
        await expect(solaceCoverProduct.connect(policyholder4).purchaseWithNonStable(policyholder4.address, ZERO_AMOUNT, solace.address, POLICYHOLDER4_DEPOSIT_AMOUNT, SOLACE_PRICE_1, DEADLINE, priceSignature1)).to.revertedWith("zero cover value");
      });

      it("cannot purchase policy when contract is paused", async () => {
        await solaceCoverProduct.connect(governor).setPaused(true);
        await expect(solaceCoverProduct.connect(policyholder4)
          .purchaseWithNonStable(policyholder4.address, COVER_LIMIT, solace.address, POLICYHOLDER4_DEPOSIT_AMOUNT, SOLACE_PRICE_1, DEADLINE, priceSignature1))
          .to.revertedWith("contract paused");
        await solaceCoverProduct.connect(governor).setPaused(false);
      });

      it("cannot purchase policy when max cover exceeded", async () => {
        let maxCover = await solaceCoverProduct.maxCover();
        await expect(solaceCoverProduct.connect(policyholder4)
          .purchaseWithNonStable(policyholder4.address, maxCover.add(1000), solace.address, POLICYHOLDER4_DEPOSIT_AMOUNT, SOLACE_PRICE_1, DEADLINE, priceSignature1))
          .to.revertedWith("insufficient capacity");
      });
    
      it("can purchase policy", async () => {
        // make purchase
        let tx = await solaceCoverProduct.connect(policyholder4)
          .purchaseWithNonStable(policyholder4.address, COVER_LIMIT, solace.address, POLICYHOLDER4_DEPOSIT_AMOUNT, SOLACE_PRICE_1, DEADLINE, priceSignature1);

        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_4);
        await expect(tx).emit(solaceCoverProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder4.address, POLICY_ID_4);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(solaceCoverProduct.address, rmActiveCoverLimit, rmActiveCoverLimit.add(COVER_LIMIT));

        expect(await solaceCoverProduct.policyStatus(POLICY_ID_4)).eq(true)
        expect(await solaceCoverProduct.policyOf(policyholder4.address)).eq(POLICY_ID_4)
        expect(await solaceCoverProduct.ownerOf(POLICY_ID_4)).eq(policyholder4.address)
        expect(await solaceCoverProduct.activeCoverLimit()).eq(rmSoteriaactiveCoverLimit.add(COVER_LIMIT));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(rmSoteriaactiveCoverLimit.add(COVER_LIMIT))
        expect(await solaceCoverProduct.totalSupply()).eq(4)
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_4)).eq(COVER_LIMIT)
        expect(await scp.balanceOf(policyholder4.address)).eq(POLICYHOLDER4_DEPOSIT_AMOUNT)
        expect(await solace.balanceOf(policyholder4.address)).eq(0);
        expect(await coverPaymentManager.getSCPBalance(policyholder4.address)).eq(POLICYHOLDER4_DEPOSIT_AMOUNT)
      });

      it("cannot re-purchase with same cover limit", async () => {
        await solace.mintToken(policyholder4.address, POLICYHOLDER4_DEPOSIT_AMOUNT);
        await solaceCoverProduct.connect(policyholder4)
          .purchaseWithNonStable(policyholder4.address, COVER_LIMIT, solace.address, POLICYHOLDER4_DEPOSIT_AMOUNT, SOLACE_PRICE_1, DEADLINE, priceSignature1);
        expect(await solaceCoverProduct.policyStatus(POLICY_ID_4)).eq(true)
        expect(await solaceCoverProduct.policyOf(policyholder4.address)).eq(POLICY_ID_4)
        expect(await solaceCoverProduct.ownerOf(POLICY_ID_4)).eq(policyholder4.address)
        expect(await solaceCoverProduct.activeCoverLimit()).eq(rmSoteriaactiveCoverLimit.add(COVER_LIMIT));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(rmSoteriaactiveCoverLimit.add(COVER_LIMIT))
        expect(await solaceCoverProduct.totalSupply()).eq(4)
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_4)).eq(COVER_LIMIT)
        expect(await scp.balanceOf(policyholder4.address)).eq(POLICYHOLDER4_DEPOSIT_AMOUNT.mul(2));
        expect(await solace.balanceOf(policyholder4.address)).eq(0);
        expect(await coverPaymentManager.getSCPBalance(policyholder4.address)).eq(POLICYHOLDER4_DEPOSIT_AMOUNT.mul(2));
      });

      it("cannot transfer policy", async () => {
        expect(await solaceCoverProduct.ownerOf(POLICY_ID_4)).eq(policyholder4.address);
        await expect(solaceCoverProduct.connect(policyholder4).transferFrom(policyholder4.address, policyholder2.address, POLICY_ID_4)).to.be.revertedWith("only minting permitted");
        await expect(solaceCoverProduct.connect(policyholder4).transferFrom(policyholder4.address, ZERO_ADDRESS, POLICY_ID_4)).to.be.revertedWith("ERC721: transfer to the zero address");
      })

      it("can have nft after purchasing", async () => {
        expect(await solaceCoverProduct.connect(policyholder4).balanceOf(policyholder4.address)).to.equal(1);
      });

      it("should update risk manager active cover amount", async () => {
        expect(await riskManager.activeCoverLimit()).to.equal(rmActiveCoverLimit.add(COVER_LIMIT));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).to.equal(rmSoteriaactiveCoverLimit.add(COVER_LIMIT));
      });

      it("should update risk manager mcr", async () => {
        expect(await riskManager.minCapitalRequirement()).to.equal(mcr.add(COVER_LIMIT));
        expect(await riskManager.minCapitalRequirementPerStrategy(solaceCoverProduct.address)).to.equal(mcrps.add(COVER_LIMIT));
      });
    });
    
    describe("setChargedTime", async () => {
      it("cannot set while paused", async () => {
        await solaceCoverProduct.connect(governor).setPaused(true);
        expect(await solaceCoverProduct.connect(governor).paused()).to.true;
        await expect(solaceCoverProduct.connect(governor).setChargedTime(Date.now())).revertedWith("contract paused");
        await solaceCoverProduct.connect(governor).setPaused(false);
      });

      it("cannot set if not collector", async () => {
        await expect(solaceCoverProduct.connect(user).setChargedTime(Date.now())).revertedWith("not premium collector");
      });

      it("cannot set with 0 time", async () => {
        await expect(solaceCoverProduct.connect(governor).setChargedTime(0)).revertedWith("invalid charged timestamp");
      });

      it("cannot set with exceed time", async () => {
        await expect(solaceCoverProduct.connect(governor).setChargedTime(Date.now() + 100000)).revertedWith("invalid charged timestamp");
      });

      it("can set with governor", async () => {
        const chargedTime = (await provider.getBlock("latest")).timestamp;
        let tx = await solaceCoverProduct.connect(governor).setChargedTime(chargedTime);
        await expect(tx).emit(solaceCoverProduct, "LatestChargedTimeSet").withArgs(chargedTime);
      });

      it("can set with premium collector", async () => {
        const chargedTime = (await provider.getBlock("latest")).timestamp;
        let tx = await solaceCoverProduct.connect(premiumCollector).setChargedTime(chargedTime);
        await expect(tx).emit(solaceCoverProduct, "LatestChargedTimeSet").withArgs(chargedTime);
        expect(await solaceCoverProduct.connect(user).latestChargedTime()).equal(chargedTime);
      });
    });


    describe("cancel", () => {
      let digest: string;
      let invalidDigest1;
      let invalidDigest2;
      let signature1: string;
      let signature2: string;
      let signature3: string;
      let invalidSignature1: string;
      let invalidSignature2: string;
      let invalidSignature3: string;
      const PREMIUM_AMOUNT1 = ONE_ETH.mul(10); // $10
      const ZERO_PREMIUM = BN.from("0"); // $0
      const PREMIUM_AMOUNT2 = ONE_DAI.mul(10000); // $10.000
      const DEPOSIT_AMOUNT = ONE_DAI.mul(100); // $10
      const MINT_AMOUNT = ONE_DAI.mul(1000); // $1000

      before(async () => {
        // sign premium($10)
        digest = getPremiumDataDigest(DOMAIN_NAME, solaceCoverProduct.address, CHAIN_ID, PREMIUM_AMOUNT1, policyholder5.address, DEADLINE, TYPEHASH_PREMIUM);
        signature1 = assembleSignature(sign(digest, Buffer.from(signer.privateKey.slice(2), "hex")));
        invalidSignature1 = assembleSignature(sign(digest, Buffer.from(governor.privateKey.slice(2), "hex")));
  
        // invalid digests
        invalidDigest1 = getPremiumDataDigest(INVALID_DOMAIN_NAME, solaceCoverProduct.address, CHAIN_ID, PREMIUM_AMOUNT1, policyholder5.address, DEADLINE, TYPEHASH_PREMIUM);
        invalidDigest2 = getPremiumDataDigest(DOMAIN_NAME,solaceCoverProduct.address, CHAIN_ID, PREMIUM_AMOUNT1, policyholder5.address,DEADLINE,INVALID_TYPEHASH_PREMIUM);
  
        invalidSignature2 = assembleSignature(sign(invalidDigest1, Buffer.from(signer.privateKey.slice(2), "hex")));
        invalidSignature3 = assembleSignature(sign(invalidDigest2, Buffer.from(signer.privateKey.slice(2), "hex")));

        // sign premium($0)
        digest = getPremiumDataDigest(DOMAIN_NAME, solaceCoverProduct.address, CHAIN_ID, ZERO_AMOUNT, policyholder6.address, DEADLINE, TYPEHASH_PREMIUM);
        signature2 = assembleSignature(sign(digest, Buffer.from(signer.privateKey.slice(2), "hex")));

        // sign premium($10000)
        digest = getPremiumDataDigest(DOMAIN_NAME, solaceCoverProduct.address, CHAIN_ID, PREMIUM_AMOUNT2, policyholder7.address, DEADLINE, TYPEHASH_PREMIUM);
        signature3 = assembleSignature(sign(digest, Buffer.from(signer.privateKey.slice(2), "hex")));

        // mint tokens
        // policyholder5: premium < scp balance
        await dai.connect(governor).mintToken(policyholder5.address, MINT_AMOUNT);
        await dai.connect(policyholder5).approve(coverPaymentManager.address, constants.MaxUint256)
        expect(await coverPaymentManager.connect(policyholder5).getSCPBalance(policyholder5.address)).eq(0);

        // policyholder6: premium = 0
        await dai.connect(governor).mintToken(policyholder6.address, MINT_AMOUNT);
        await dai.connect(policyholder6).approve(coverPaymentManager.address, constants.MaxUint256)
        expect(await coverPaymentManager.connect(policyholder6).getSCPBalance(policyholder6.address)).eq(0);

        // policyholder7: premium > scp balance
        await dai.connect(governor).mintToken(policyholder7.address, MINT_AMOUNT);
        await dai.connect(policyholder7).approve(coverPaymentManager.address, constants.MaxUint256)
        expect(await coverPaymentManager.connect(policyholder7).getSCPBalance(policyholder7.address)).eq(0);

      });

      it("cannot cancel an invalid policy", async () => {
        await expect(solaceCoverProduct.connect(policyholder5)
          .cancel(PREMIUM_AMOUNT1, policyholder5.address, DEADLINE, signature1))
          .to.revertedWith("invalid policy");

        // purchase policyholder5
        let tx = await solaceCoverProduct.connect(policyholder5).purchaseWithStable(policyholder5.address, COVER_LIMIT, dai.address, DEPOSIT_AMOUNT);
        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_5);

        // purchase policyholder6
        tx = await solaceCoverProduct.connect(policyholder6).purchaseWithStable(policyholder6.address, COVER_LIMIT, dai.address, DEPOSIT_AMOUNT);
        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_6);

        // purchase policyholder7
        tx = await solaceCoverProduct.connect(policyholder7).purchaseWithStable(policyholder7.address, COVER_LIMIT, dai.address, DEPOSIT_AMOUNT);
        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_7);
      });

      it("cannot cancel policy if not owner", async () => {
        await expect(solaceCoverProduct.connect(policyholder5)
          .cancel(PREMIUM_AMOUNT1, policyholder4.address, DEADLINE, signature1))
          .to.revertedWith("not policy owner");
      });

      it("cannot cancel with invalid premium data(deadline)", async () => {
        await expect(solaceCoverProduct.connect(policyholder5)
          .cancel(PREMIUM_AMOUNT1, policyholder5.address, 0, invalidSignature1))
          .to.revertedWith("expired deadline");
      });

      it("cannot cancel with invalid premium data(signer)", async () => {
        await expect(solaceCoverProduct.connect(policyholder5)
          .cancel(PREMIUM_AMOUNT1, policyholder5.address, DEADLINE, invalidSignature1))
          .to.revertedWith("invalid premium data");
      });

      it("cannot cancel with invalid premium data(domain)", async () => {
        await expect(solaceCoverProduct.connect(policyholder5)
          .cancel(PREMIUM_AMOUNT1, policyholder5.address, DEADLINE, invalidSignature2))
          .to.revertedWith("invalid premium data");
      });

      it("cannot cancel with invalid premium data(typehash)", async () => {
        await expect(solaceCoverProduct.connect(policyholder5)
          .cancel(PREMIUM_AMOUNT1, policyholder5.address, DEADLINE, invalidSignature3))
          .to.revertedWith("invalid premium data");
      });

      it("policy owner can cancel policy(premium < scp balance)", async () => {
        let mrab = await solaceCoverProduct.minRequiredAccountBalance(COVER_LIMIT);
        let initialPolicyholderAccountBalance = await scp.balanceOf(policyholder5.address);
        let initialPolicyCoverLimit = await solaceCoverProduct.connect(policyholder5).coverLimitOf(POLICY_ID_5);
        let initialActiveCoverLimit = await solaceCoverProduct.connect(policyholder5).activeCoverLimit();
        let initialAvailableCoverCapacity = await solaceCoverProduct.availableCoverCapacity();
        let initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
        let initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address);

        // before cancel, min. required scp balance should be mrab
        expect(await solaceCoverProduct.connect(policyholder5).minScpRequired(policyholder5.address)).eq(mrab);

        // cancel policy
        let tx = await solaceCoverProduct.connect(policyholder5).cancel(PREMIUM_AMOUNT1, policyholder5.address, DEADLINE, signature1);
        await expect(tx).emit(solaceCoverProduct, "PolicyCanceled").withArgs(POLICY_ID_5);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated")
          .withArgs(solaceCoverProduct.address, initialRMActiveCoverLimit, initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));

        // check token balances
        expect(await scp.balanceOf(policyholder5.address)).to.equal(initialPolicyholderAccountBalance.sub(PREMIUM_AMOUNT1));
        expect(await dai.balanceOf(policyholder5.address)).eq(MINT_AMOUNT.sub(DEPOSIT_AMOUNT));

        // soteria active cover amount should be decreased
        expect(await solaceCoverProduct.activeCoverLimit()).to.equal(initialActiveCoverLimit.sub(initialPolicyCoverLimit));

        // cover limit should be zero
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_5)).to.equal(ZERO_AMOUNT);
        expect(await solaceCoverProduct.availableCoverCapacity()).eq(initialAvailableCoverCapacity.add(initialPolicyCoverLimit))

        // policy status should be inactive
        expect(await solaceCoverProduct.policyStatus(POLICY_ID_5)).to.be.false;

        // risk manager active cover amount and active cover amount for soteria should be decreased
        expect(await riskManager.activeCoverLimit()).to.equal(initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address))
          .to.equal(initialRMActiveCoverLimitForSoteria.sub(initialPolicyCoverLimit));
      });

      it("cannot cancel again", async () => {
        await expect(solaceCoverProduct.connect(policyholder5)
          .cancel(PREMIUM_AMOUNT1, policyholder5.address, DEADLINE, signature1))
          .to.revertedWith("invalid policy");
      });

      it("policy owner can cancel policy(premium=0)", async () => {
        let mrab = await solaceCoverProduct.minRequiredAccountBalance(COVER_LIMIT);
        let initialPolicyholderAccountBalance = await scp.balanceOf(policyholder6.address);
        let initialPolicyCoverLimit = await solaceCoverProduct.connect(policyholder6).coverLimitOf(POLICY_ID_6);
        let initialActiveCoverLimit = await solaceCoverProduct.connect(policyholder6).activeCoverLimit();
        let initialAvailableCoverCapacity = await solaceCoverProduct.availableCoverCapacity();
        let initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
        let initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address);

        // before cancel, min. required scp balance should be mrab
        expect(await solaceCoverProduct.connect(policyholder6).minScpRequired(policyholder6.address)).eq(mrab);

        // cancel policy
        let tx = await solaceCoverProduct.connect(policyholder6).cancel(ZERO_PREMIUM, policyholder6.address, DEADLINE, signature2);
        await expect(tx).emit(solaceCoverProduct, "PolicyCanceled").withArgs(POLICY_ID_6);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated")
          .withArgs(solaceCoverProduct.address, initialRMActiveCoverLimit, initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));

        // check token balances
        expect(await scp.balanceOf(policyholder6.address)).to.equal(initialPolicyholderAccountBalance.sub(ZERO_PREMIUM));
        expect(await dai.balanceOf(policyholder6.address)).eq(MINT_AMOUNT.sub(DEPOSIT_AMOUNT));

        // soteria active cover amount should be decreased
        expect(await solaceCoverProduct.activeCoverLimit()).to.equal(initialActiveCoverLimit.sub(initialPolicyCoverLimit));

        // cover limit should be zero
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_6)).to.equal(ZERO_AMOUNT);
        expect(await solaceCoverProduct.availableCoverCapacity()).eq(initialAvailableCoverCapacity.add(initialPolicyCoverLimit))

        // policy status should be inactive
        expect(await solaceCoverProduct.policyStatus(POLICY_ID_6)).to.be.false;

        // risk manager active cover amount and active cover amount for soteria should be decreased
        expect(await riskManager.activeCoverLimit()).to.equal(initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address))
          .to.equal(initialRMActiveCoverLimitForSoteria.sub(initialPolicyCoverLimit));
      });

      it("policy owner can cancel policy(premium > scp balance)", async () => {
        let mrab = await solaceCoverProduct.minRequiredAccountBalance(COVER_LIMIT);
        let initialPolicyholderAccountBalance = await scp.balanceOf(policyholder7.address);
        let initialPolicyCoverLimit = await solaceCoverProduct.connect(policyholder7).coverLimitOf(POLICY_ID_7);
        let initialActiveCoverLimit = await solaceCoverProduct.connect(policyholder7).activeCoverLimit();
        let initialAvailableCoverCapacity = await solaceCoverProduct.availableCoverCapacity();
        let initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
        let initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address);

        // before cancel, min. required scp balance should be mrab
        expect(await solaceCoverProduct.connect(policyholder7).minScpRequired(policyholder7.address)).eq(mrab);

        // cancel policy
        let tx = await solaceCoverProduct.connect(policyholder7).cancel(PREMIUM_AMOUNT2, policyholder7.address, DEADLINE, signature3);
        await expect(tx).emit(solaceCoverProduct, "PolicyCanceled").withArgs(POLICY_ID_7);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated")
          .withArgs(solaceCoverProduct.address, initialRMActiveCoverLimit, initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));

        // check token balances
        expect(await scp.balanceOf(policyholder7.address)).to.equal(initialPolicyholderAccountBalance.sub(DEPOSIT_AMOUNT));
        expect(await dai.balanceOf(policyholder7.address)).eq(MINT_AMOUNT.sub(DEPOSIT_AMOUNT));

        // soteria active cover amount should be decreased
        expect(await solaceCoverProduct.activeCoverLimit()).to.equal(initialActiveCoverLimit.sub(initialPolicyCoverLimit));

        // cover limit should be zero
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_7)).to.equal(ZERO_AMOUNT);
        expect(await solaceCoverProduct.availableCoverCapacity()).eq(initialAvailableCoverCapacity.add(initialPolicyCoverLimit))

        // policy status should be inactive
        expect(await solaceCoverProduct.policyStatus(POLICY_ID_7)).to.be.false;

        // risk manager active cover amount and active cover amount for soteria should be decreased
        expect(await riskManager.activeCoverLimit()).to.equal(initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address))
          .to.equal(initialRMActiveCoverLimitForSoteria.sub(initialPolicyCoverLimit));
      });
    });

    describe("cancelPolicies", () => {
      const DEPOSIT_AMOUNT = ONE_DAI.mul(100); // $10
      const MINT_AMOUNT = ONE_DAI.mul(1000); // $1000
      const ACCOUNTS: any = [policyholder8.address, policyholder9.address];

      before(async () => {
        // mint to policyholder8
        await dai.connect(governor).mintToken(policyholder8.address, MINT_AMOUNT);
        await dai.connect(policyholder8).approve(coverPaymentManager.address, constants.MaxUint256)
        expect(await coverPaymentManager.connect(policyholder8).getSCPBalance(policyholder8.address)).eq(0);

        // mint to policyholder9
        await dai.connect(governor).mintToken(policyholder9.address, MINT_AMOUNT);
        await dai.connect(policyholder9).approve(coverPaymentManager.address, constants.MaxUint256)
        expect(await coverPaymentManager.connect(policyholder9).getSCPBalance(policyholder9.address)).eq(0);

        // purchase policyholder8
        let tx = await solaceCoverProduct.connect(policyholder8).purchaseWithStable(policyholder8.address, COVER_LIMIT, dai.address, DEPOSIT_AMOUNT);
        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_8);

        // purchase policyholder9
        tx = await solaceCoverProduct.connect(policyholder9).purchaseWithStable(policyholder9.address, COVER_LIMIT, dai.address, DEPOSIT_AMOUNT);
        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_9);
      });

      it("cannot cancel policies with non-coller", async () => {
        await expect(solaceCoverProduct.connect(user).cancelPolicies(ACCOUNTS)).revertedWith("not premium collector");
      });

      it("cannot cancel with empty array data", async () => {
        await solaceCoverProduct.connect(premiumCollector).cancelPolicies([]);
         expect(await solaceCoverProduct.connect(policyholder8).policyOf(policyholder8.address)).eq(POLICY_ID_8);
         expect(await solaceCoverProduct.connect(policyholder9).policyOf(policyholder9.address)).eq(POLICY_ID_9);
         expect(await solaceCoverProduct.policyStatus(POLICY_ID_8)).eq(true);
         expect(await solaceCoverProduct.policyStatus(POLICY_ID_9)).eq(true);
      });

      it("cannot cancel already cancelled policies", async () => {
        await solaceCoverProduct.connect(premiumCollector).cancelPolicies([policyholder6.address, policyholder7.address]);
         expect(await solaceCoverProduct.connect(policyholder8).policyOf(policyholder8.address)).eq(POLICY_ID_8);
         expect(await solaceCoverProduct.connect(policyholder9).policyOf(policyholder9.address)).eq(POLICY_ID_9);
         expect(await solaceCoverProduct.policyStatus(POLICY_ID_8)).eq(true);
         expect(await solaceCoverProduct.policyStatus(POLICY_ID_9)).eq(true);
      });
    });

});
