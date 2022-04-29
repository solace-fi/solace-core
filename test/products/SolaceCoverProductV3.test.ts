// NOTE - this test requires MATIC mainnet fork to pass

import { waffle, ethers } from "hardhat";
import { MockProvider } from "ethereum-waffle";
import { BigNumber as BN, utils, Contract, Wallet, constants } from "ethers";
import chai from "chai";
import { config as dotenv_config } from "dotenv";
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { Registry, RiskManager, SolaceCoverProductV3, CoverageDataProvider, Solace, MockErc20Permit, Scp} from "../../typechain";

const { expect } = chai;
const { deployContract, solidity} = waffle;
const provider: MockProvider = waffle.provider;

dotenv_config();
chai.use(solidity)

let forkNetwork = process.env.FORK_NETWORK || "";
let supportedNetworks = ["mainnet","polygon"];

describe("SolaceCoverProductV3", function() {
  if(!supportedNetworks.includes(forkNetwork)) {
    it(`can only be tested when forking one of ${supportedNetworks.join(',')}`, async function() {
      console.log(`SolaceCoverProductV3 can only be tested when forking one of ${supportedNetworks.join(',')}`);
      console.log("set `FORK_NETWORK=mainnet` in .env");
      expect(true, `SolaceCoverProductV3 can only be tested when forking one of ${supportedNetworks.join(',')}`).to.be.false;
    });
  } else {
    let artifacts: ArtifactImports;
    let registry: Registry;
    let riskManager: RiskManager;
    let solace: Solace;
    let solaceCoverProduct: SolaceCoverProductV3;
    let token: MockErc20Permit;
    let coverageDataProvider: CoverageDataProvider;
    let scp: Scp;

    const [deployer, governor, newGovernor, policyholder1, policyholder2, policyholder3, policyholder4, policyholder5, premiumPool, premiumCollector] = provider.getWallets();

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const ONE_ETH = BN.from("1000000000000000000"); // 1 eth
    const INITIAL_DEPOSIT = ONE_ETH.mul(1000); // 1000 SCP
    const COVER_LIMIT = ONE_ETH.mul(10000); // 10000 SCP
    const ONE_MILLION_SCP = ONE_ETH.mul(1000000)
    const NEW_COVER_LIMIT = COVER_LIMIT.mul(2); // 20000 SCP
    const ZERO_AMOUNT = BN.from("0");
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
    const ONE_WEEK = BN.from("604800");
    const maxRateNum = BN.from("1");
    const maxRateDenom = BN.from("315360000"); // We are testing with maxRateNum and maxRateDenom that gives us an annual max rate of 10% coverLimit
    let snapshot: BN;

    before( async () => {
      artifacts = await import_artifacts();
      snapshot = await provider.send("evm_snapshot", []);
      
      await deployer.sendTransaction({to: deployer.address});

      // deploy registry
      registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;

      // deploy solace
      solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
      await registry.connect(governor).set(["solace"], [solace.address])

      // deploy riskmanager
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
      await registry.connect(governor).set(["riskManager"], [riskManager.address])

      // deploy scp
      scp = (await deployContract(deployer, artifacts.SCP, [governor.address])) as Scp;
      await registry.connect(governor).set(["scp"], [scp.address])

      // deploy coveragedataprovider
      coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address])) as CoverageDataProvider;
      await registry.connect(governor).set(["coverageDataProvider"], [coverageDataProvider.address])

      // set premium collector(calls setChargedTime, setDebts)
      await registry.connect(governor).set(["premiumCollector"], [premiumCollector.address]);
    });

    after(async function () {
      await provider.send("evm_revert", [snapshot]);
    });

    describe.only("deployment", () => {
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

      it("reverts for zero address scp", async () => {
        await expect(deployContract(deployer, artifacts.SolaceCoverProductV3, [governor.address, mockRegistry.address])).to.be.revertedWith("zero address scp");
      });

      it("can deploy", async () => {
        solaceCoverProduct = await deployContract(deployer, artifacts.SolaceCoverProductV3, [governor.address, registry.address]) as SolaceCoverProductV3;
        expect(solaceCoverProduct.address).to.not.undefined;
      });

      it("should start with defaults", async () => {
        expect(await solaceCoverProduct.maxRateNum()).eq(maxRateNum);
        expect(await solaceCoverProduct.maxRateDenom()).eq(maxRateDenom);
        expect(await solaceCoverProduct.chargeCycle()).eq(ONE_WEEK)
      })
    });

    describe.only("governance", () => {
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
    });

    describe.only("pause", () => {
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

    describe.only("registry", () => {
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

      it("starts with correct scp", async () => {
        expect(await solaceCoverProduct.connect(policyholder1).scp()).to.equal(scp.address);
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

      it("reverts for zero address scp", async () => {
        await registry2.connect(governor).set(["riskManager"], [riskManager2.address]);
        await expect(solaceCoverProduct.connect(governor).setRegistry(registry2.address)).to.revertedWith("zero address scp");
      });

      it("governance can set registry", async () => {
        await registry2.connect(governor).set(["scp"], [scp.address]);
        let tx = await solaceCoverProduct.connect(governor).setRegistry(registry2.address);
        await expect(tx).emit(solaceCoverProduct, "RegistrySet").withArgs(registry2.address);
        expect(await solaceCoverProduct.connect(policyholder1).registry()).to.equal(registry2.address);
        expect(await solaceCoverProduct.connect(policyholder1).riskManager()).to.equal(riskManager2.address);
        expect(await solaceCoverProduct.connect(policyholder1).scp()).to.equal(scp.address);
      });
    });

    describe.only("setMaxRate", () => {
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

    describe.only("setChargeCycle", () => {
      it("cannot be set by non governance", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).setChargeCycle(1)).to.revertedWith("!governance");
      });
      it("can be set", async () => {
        let tx = await solaceCoverProduct.connect(governor).setChargeCycle(ONE_WEEK)
        await expect(tx).emit(solaceCoverProduct, "ChargeCycleSet").withArgs(ONE_WEEK);
      })
      it("getter functions working", async () => {
        expect(await solaceCoverProduct.chargeCycle()).eq(ONE_WEEK)
      })
    })

    describe.only("setBaseURI", () => {
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


    describe.only("purchase(create)", () => {
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
        await expect(solaceCoverProduct.connect(policyholder1).purchase(ZERO_AMOUNT)).to.revertedWith("zero cover value");
      });

      it("cannot purchase policy when contract is paused", async () => {
        await solaceCoverProduct.connect(governor).setPaused(true);
        await expect(solaceCoverProduct.connect(policyholder1).purchase(COVER_LIMIT)).to.revertedWith("contract paused");
        await solaceCoverProduct.connect(governor).setPaused(false);
      });

      it("cannot purchase a policy if there is no enough capacity", async () => {
        expect (await solaceCoverProduct.maxCover()).eq(0)
        await expect(solaceCoverProduct.connect(policyholder1).purchase(policyholder1.address)).to.revertedWith("insufficient capacity");
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
        await expect(solaceCoverProduct.connect(policyholder1).purchase(maxCover.add(1))).to.revertedWith("insufficient capacity");
      });

      it("cannot purchase policy when insufficient user balance", async () => {
        expect(await scp.connect(policyholder1).balanceOf(policyholder1.address)).eq(0);
        await expect(solaceCoverProduct.connect(policyholder1).purchase(COVER_LIMIT)).to.revertedWith("insufficient scp balance");
      })

      it("can purchase policy", async () => {
        // mint 1000 scp to user
        await scp.connect(governor).setScpMoverStatuses([governor.address], [true]);
        await scp.connect(governor).mint(policyholder1.address, INITIAL_DEPOSIT, true);
        expect(await scp.connect(policyholder1).balanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT);

        // make purchase
        let tx = await solaceCoverProduct.connect(policyholder1).purchase(COVER_LIMIT);

        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_1);
        await expect(tx).emit(solaceCoverProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder1.address, POLICY_ID_1);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(solaceCoverProduct.address, rmActiveCoverLimit, COVER_LIMIT);

        expect (await solaceCoverProduct.policyStatus(POLICY_ID_1)).eq(true)
        expect (await solaceCoverProduct.policyOf(policyholder1.address)).eq(POLICY_ID_1)
        expect (await solaceCoverProduct.ownerOf(POLICY_ID_1)).eq(policyholder1.address)
        expect (await solaceCoverProduct.activeCoverLimit()).eq(COVER_LIMIT)
        expect (await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(COVER_LIMIT)
        expect (await solaceCoverProduct.policyCount()).eq(1)
        expect (await solaceCoverProduct.coverLimitOf(POLICY_ID_1)).eq(COVER_LIMIT)
        expect (await scp.balanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT)
      });

      it("cannot re-purchase with same cover limit", async () => {
        await solaceCoverProduct.connect(policyholder1).purchase(COVER_LIMIT);
        expect (await solaceCoverProduct.policyStatus(POLICY_ID_1)).eq(true)
        expect (await solaceCoverProduct.policyOf(policyholder1.address)).eq(POLICY_ID_1)
        expect (await solaceCoverProduct.ownerOf(POLICY_ID_1)).eq(policyholder1.address)
        expect (await solaceCoverProduct.activeCoverLimit()).eq(COVER_LIMIT)
        expect (await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(COVER_LIMIT)
        expect (await solaceCoverProduct.policyCount()).eq(1)
        expect (await solaceCoverProduct.coverLimitOf(POLICY_ID_1)).eq(COVER_LIMIT)
        expect (await scp.balanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT)
      })

      it("cannot transfer policy", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, 1)).to.be.revertedWith("only minting permitted");
        await expect(solaceCoverProduct.connect(policyholder1).transferFrom(policyholder1.address, ZERO_ADDRESS, 1)).to.be.revertedWith("ERC721: transfer to the zero address");
      })

      it("can purchase another policy", async () => {
        // mint 1000 scp to policyholder2
        await scp.connect(governor).mint(policyholder2.address, INITIAL_DEPOSIT, true);
        expect(await scp.connect(policyholder2).balanceOf(policyholder2.address)).eq(INITIAL_DEPOSIT);

        // make purchase
        let tx = await solaceCoverProduct.connect(policyholder2).purchase(COVER_LIMIT);

        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_2);
        await expect(tx).emit(solaceCoverProduct, "Transfer").withArgs(ZERO_ADDRESS, policyholder2.address, POLICY_ID_2);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(solaceCoverProduct.address, COVER_LIMIT, COVER_LIMIT.add(COVER_LIMIT));

        expect (await scp.balanceOf(policyholder1.address)).eq(INITIAL_DEPOSIT)
        expect (await scp.balanceOf(policyholder2.address)).eq(INITIAL_DEPOSIT)
        expect (await solaceCoverProduct.policyStatus(POLICY_ID_2)).eq(true)
        expect (await solaceCoverProduct.policyOf(policyholder2.address)).eq(POLICY_ID_2)
        expect (await solaceCoverProduct.ownerOf(POLICY_ID_2)).eq(policyholder2.address)
        expect (await solaceCoverProduct.activeCoverLimit()).eq(COVER_LIMIT.mul(2))
        expect (await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).eq(COVER_LIMIT.mul(2))
        expect (await solaceCoverProduct.policyCount()).eq(2)
        expect (await solaceCoverProduct.coverLimitOf(POLICY_ID_2)).eq(COVER_LIMIT)
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

    describe.only("tokenURI", () => {
      it("cannot get for invalid policy ID", async () => {
        await expect(solaceCoverProduct.tokenURI(INVALID_POLICY_ID)).to.revertedWith("invalid policy");
      });

      it("can get for valid policy ID", async () => {
        const chainID =(await provider.getNetwork()).chainId;
        expect(await solaceCoverProduct.tokenURI(POLICY_ID_1)).eq(`https://stats.solace.fi/policy/?chainID=${chainID}&policyID=1`)
      })
    });

    describe.only("purchase(update)", () => {
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
        await expect(solaceCoverProduct.connect(policyholder1).purchase(ZERO_AMOUNT)).to.revertedWith("zero cover value");
      });

      it("cannot update while paused", async () => {
        await solaceCoverProduct.connect(governor).setPaused(true);
        await expect(solaceCoverProduct.connect(policyholder1).purchase(NEW_COVER_LIMIT)).to.revertedWith("contract paused");
        await solaceCoverProduct.connect(governor).setPaused(false);
      });

      it("cannot update if max cover is exceeded", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).purchase(maxCover.add(1))).to.revertedWith("insufficient capacity");
      });

      it("cannot update if max cover for the strategy is exceeded", async () => {
        await expect(solaceCoverProduct.connect(policyholder1).purchase(maxCoverPerStrategy.add(1))).to.revertedWith("insufficient capacity");
      });

      it("cannot update if below minimum required account balance for new cover limit", async () => {
        let maxRateNum = await solaceCoverProduct.maxRateNum();
        let maxRateDenom = await solaceCoverProduct.maxRateDenom();
        let chargeCycle = await solaceCoverProduct.chargeCycle();
        let accountBalance = await scp.balanceOf(policyholder1.address)
        let maxPermissibleNewCoverLimit = accountBalance.mul(maxRateDenom).div(maxRateNum).div(chargeCycle)

        // Temporarily increase underwriting pool balance to avoid running into "insufficient capacity" revert
        await coverageDataProvider.connect(governor).set("underwritingPool", ONE_MILLION_SCP.mul(1000000));
        await expect(solaceCoverProduct.connect(policyholder1).purchase(maxPermissibleNewCoverLimit.add(ONE_ETH))).to.revertedWith("insufficient scp balance");
        await coverageDataProvider.connect(governor).set("underwritingPool", ONE_MILLION_SCP);
      });

      it("policy owner can update policy", async () => {
        let activeCoverLimit = initialSoteriaActiveCoverLimit.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit);

        let tx = await solaceCoverProduct.connect(policyholder1).purchase(NEW_COVER_LIMIT);

        await expect(tx).emit(solaceCoverProduct, "PolicyUpdated").withArgs(POLICY_ID_1);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(solaceCoverProduct.address, initialRMActiveCoverLimit, initialRMActiveCoverLimit.add(NEW_COVER_LIMIT).sub(initialPolicyCoverLimit));
        expect(await solaceCoverProduct.connect(policyholder1).activeCoverLimit()).to.equal(activeCoverLimit);
        expect(await solaceCoverProduct.connect(policyholder1).coverLimitOf(POLICY_ID_1)).to.equal(NEW_COVER_LIMIT);
      });

      it("policy owner can reduce cover limit", async () => {
        let tx = await solaceCoverProduct.connect(policyholder1).purchase(NEW_COVER_LIMIT.div(2));
        await expect(tx).emit(solaceCoverProduct, "PolicyUpdated").withArgs(POLICY_ID_1);
        expect(await solaceCoverProduct.connect(policyholder1).coverLimitOf(POLICY_ID_1)).to.equal(NEW_COVER_LIMIT.div(2));

        // revert state changes
        await solaceCoverProduct.connect(policyholder1).purchase(NEW_COVER_LIMIT);
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

    describe.only("cancel", () => {
      it("cannot cancel an invalid policy", async () => {
        await expect(solaceCoverProduct.connect(policyholder4).cancel()).to.revertedWith("invalid policy");
      });

      it("policy owner can cancel policy", async () => {
        // mint 1000 scp to user
        await scp.connect(governor).mint(policyholder3.address, INITIAL_DEPOSIT, true);
        expect(await scp.connect(policyholder3).balanceOf(policyholder3.address)).eq(INITIAL_DEPOSIT);

        let tx = await solaceCoverProduct.connect(policyholder3).purchase(COVER_LIMIT);
        await expect(tx).emit(solaceCoverProduct, "PolicyCreated").withArgs(POLICY_ID_3);

        // set charged time
        let timestamp = (await provider.getBlock("latest")).timestamp;
        await solaceCoverProduct.connect(governor).setChargedTime(timestamp - 1000);

        let initialPolicyholderAccountBalance = await scp.balanceOf(policyholder3.address);
        let cancelFee = await solaceCoverProduct.calculateCancelFee(POLICY_ID_3);
        let initialPolicyCoverLimit = await solaceCoverProduct.connect(policyholder3).coverLimitOf(POLICY_ID_3);
        let initialActiveCoverLimit = await solaceCoverProduct.connect(policyholder3).activeCoverLimit();
        let initialAvailableCoverCapacity = await solaceCoverProduct.availableCoverCapacity();
        let initialRMActiveCoverLimit = await riskManager.activeCoverLimit();
        let initialRMActiveCoverLimitForSoteria = await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address);

        // cancel policy
        tx = await solaceCoverProduct.connect(policyholder3).cancel();
        await expect(tx).emit(solaceCoverProduct, "PolicyCanceled").withArgs(POLICY_ID_3);
        await expect(tx).emit(riskManager, "ActiveCoverLimitUpdated").withArgs(solaceCoverProduct.address, initialRMActiveCoverLimit, initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));

        // cancel fee should be added as debt
        expect(await solaceCoverProduct.connect(policyholder3.address).debtOf(policyholder3.address)).eq(cancelFee);

        // user balance should not change
        expect(await scp.balanceOf(policyholder3.address)).to.equal(initialPolicyholderAccountBalance);

        // soteria active cover amount should be decreased
        expect(await solaceCoverProduct.activeCoverLimit()).to.equal(initialActiveCoverLimit.sub(initialPolicyCoverLimit));

        // cover limit should be zero
        expect(await solaceCoverProduct.coverLimitOf(POLICY_ID_3)).to.equal(ZERO_AMOUNT);
        expect(await solaceCoverProduct.availableCoverCapacity()).eq(initialAvailableCoverCapacity.add(initialPolicyCoverLimit))

        // policy status should be inactive
        expect(await solaceCoverProduct.policyStatus(POLICY_ID_3)).to.be.false;

        // risk manager active cover amount and active cover amount for soteria should be decreased
        expect(await riskManager.activeCoverLimit()).to.equal(initialRMActiveCoverLimit.sub(initialPolicyCoverLimit));
        expect(await riskManager.activeCoverLimitPerStrategy(solaceCoverProduct.address)).to.equal(initialRMActiveCoverLimitForSoteria.sub(initialPolicyCoverLimit));
      });
    });

  }

});
