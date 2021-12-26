import { waffle, ethers } from "hardhat";
import { MockProvider } from "ethereum-waffle";
import { BigNumber as BN, utils, Contract } from "ethers";
import chai from "chai";
import { config as dotenv_config } from "dotenv";
import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, ProductFactory, MockProductV2, Treasury, ClaimsEscrow, Registry, Vault, RiskManager, SoteriaCoverageProduct, Weth9, CoverageDataProvider, Solace, MockPriceOracle, MockSlp } from "../typechain";

const { expect } = chai;
const { deployContract, solidity} = waffle;
const provider: MockProvider = waffle.provider;

dotenv_config();
chai.use(solidity)

const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("SoteriaCoverageProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const DOMAIN_NAME = "Solace.fi-SoteriaCoverageProduct";
const VERSION = "1";

describe("SoteriaCoverageProduct", function() {
    let artifacts: ArtifactImports;
    let registry: Registry;
    let policyManager: PolicyManager;
    let riskManager: RiskManager;
    let solace: Solace;
    let soteriaCoverageProduct: SoteriaCoverageProduct;
    let weth: Weth9;
    let vault: Vault;
    let claimsEscrow: ClaimsEscrow;
    let treasury: Treasury;
    let priceOracle: MockPriceOracle;
    let solaceUsdcPool: MockSlp;
    let coverageDataProvider: CoverageDataProvider;

    const [deployer, governor, newGovernor, user,  policyholder1, policyholder2, underwritingPool] = provider.getWallets();
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const COVER_AMOUNT = BN.from("1000000000000000000"); // 1 eth
    const NEW_COVER_AMOUNT = BN.from("2000000000000000000"); // 2 eth
    const ONE_ETH = BN.from("1000000000000000000"); // 1 eth
    const ZERO_AMOUNT = BN.from("0");
    const TOKEN0 = "0x501ace9c35e60f03a2af4d484f49f9b1efde9f40";
    const TOKEN1 = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const RESERVE0 = BN.from("13250148273341498385651903");
    const RESERVE1 = BN.from("1277929641956");
    const STRATEGY_STATUS = {
        INACTIVE: 0,
        ACTIVE: 1
    };
    const POLICY_ID_ONE = BN.from("1");
    const POLICY_ID_TWO = BN.from("2");

    before( async () => {
        artifacts = await import_artifacts();
        await deployer.sendTransaction({to: deployer.address});

        registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;

        solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
        await registry.connect(governor).setSolace(solace.address);
        weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
        await registry.connect(governor).setWeth(weth.address);
        vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
        await registry.connect(governor).setVault(vault.address);
        claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, registry.address])) as ClaimsEscrow;
        await registry.connect(governor).setClaimsEscrow(claimsEscrow.address);
        treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
        await registry.connect(governor).setTreasury(treasury.address);
        policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
        await registry.connect(governor).setPolicyManager(policyManager.address);
        riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
        await registry.connect(governor).setRiskManager(riskManager.address);
       
        priceOracle = (await deployContract(deployer, artifacts.MockPriceOracle)) as MockPriceOracle;
        solaceUsdcPool = (await deployContract(deployer, artifacts.MockSLP, ["SushiSwap LP Token", "SLP", ONE_ETH.mul(1000000), TOKEN0, TOKEN1, RESERVE0, RESERVE1])) as MockSlp;
  
        coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry.address, priceOracle.address, solaceUsdcPool.address])) as CoverageDataProvider;
        await registry.connect(governor).setCoverageDataProvider(coverageDataProvider.address);


        await vault.connect(governor).addRequestor(claimsEscrow.address);
        await vault.connect(governor).addRequestor(treasury.address);
    });

    describe("deployment", () => {
        let mockRegistry: Registry;
        before(async () => {
            mockRegistry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
        });

        it("reverts for zero address registry", async () => {
            await expect(deployContract(deployer, artifacts.SoteriaCoverageProduct, [governor.address, ZERO_ADDRESS, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, VERSION])).to.be.revertedWith("zero address registry");
        });

        it("reverts for zero address riskmanager", async () => {
            await expect(deployContract(deployer, artifacts.SoteriaCoverageProduct, [governor.address, mockRegistry.address, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, VERSION])).to.be.revertedWith("zero address riskmanager");
        });

        it("reverts for zero address policymanager", async () => {
            await mockRegistry.connect(governor).setRiskManager(riskManager.address);
            await expect(deployContract(deployer, artifacts.SoteriaCoverageProduct, [governor.address, mockRegistry.address, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, VERSION])).to.be.revertedWith("zero address policymanager");
        });

        it("reverts for zero address governance", async () => {
            await expect(deployContract(deployer, artifacts.SoteriaCoverageProduct, [ZERO_ADDRESS, registry.address , SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, VERSION])).to.be.revertedWith("zero address governance");
        });

        it("can deploy", async () => {
            soteriaCoverageProduct = await deployContract(deployer, artifacts.SoteriaCoverageProduct, [governor.address, registry.address , SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, VERSION]) as SoteriaCoverageProduct;
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
        let policyManager2: PolicyManager;

        before(async () => {
            registry2 =  (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
            riskManager2 = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
            policyManager2 = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;

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
            await expect(soteriaCoverageProduct.connect(governor).setRegistry(registry2.address)).to.revertedWith("zero address riskmanager");
        });

        it("reverts for zero address policymanager", async () => {
            await registry2.connect(governor).setRiskManager(riskManager2.address);
            await expect(soteriaCoverageProduct.connect(governor).setRegistry(registry2.address)).to.revertedWith("zero address policymanager");
        });

        it("governance can set registry", async () => {
            await registry2.connect(governor).setPolicyManager(policyManager2.address);
            let tx = await soteriaCoverageProduct.connect(governor).setRegistry(registry2.address);
            expect(tx).emit(soteriaCoverageProduct, "RegistrySet").withArgs(registry2.address);
            expect(await soteriaCoverageProduct.connect(policyholder1).riskManager()).to.equal(riskManager2.address);
            expect(await soteriaCoverageProduct.connect(policyholder1).registry()).to.equal(registry2.address);
        });
    });

    describe("buyPolicy", () => {
        let pmActiveCoverAmount:BN;
        let pmSoteriaActiveCoverAmount: BN;
        let mcr: BN;
        let mcrps: BN;

        before(async () => {
            // policy manager active cover amount and active cover amount for soteria.
            await policyManager.connect(governor).setSoteriaProduct(soteriaCoverageProduct.address);
            expect(await policyManager.connect(governor).getSoteriaProduct()).to.equal(soteriaCoverageProduct.address);
            pmActiveCoverAmount = await policyManager.connect(governor).activeCoverAmount();
            pmSoteriaActiveCoverAmount = await policyManager.connect(governor).activeCoverAmountPerStrategy(soteriaCoverageProduct.address);

            // risk manager min. capital requirement and min. capital requirement for soteria
            mcr = await riskManager.connect(governor).minCapitalRequirement();
            mcrps = await riskManager.connect(governor).minCapitalRequirementPerStrategy(soteriaCoverageProduct.address);
        });

        it("cannot buy policy when zero address policy holder is provided", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).buyPolicy(ZERO_ADDRESS, COVER_AMOUNT)).to.revertedWith("zero address policyholder");
        });

        it("cannot buy policy when zero cover amaount value is provided", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).buyPolicy(policyholder1.address, ZERO_AMOUNT)).to.revertedWith("zero cover value");
        });

        it("cannot buy policy when zero msg.value is provided", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).buyPolicy(policyholder1.address, COVER_AMOUNT, {value: ZERO_AMOUNT})).to.revertedWith("zero fund");
        });

        it("cannot buy policy when risk is not accepted", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).buyPolicy(policyholder1.address, COVER_AMOUNT, {value: ONE_ETH})).to.revertedWith("cannot accept that risk");
        });

        it("cannot buy policy when contract is paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).buyPolicy(policyholder1.address, COVER_AMOUNT, {value: ONE_ETH})).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });

        it("can buy policy", async () => {
            // add underwriting pool to the coverage data provider
            let maxCover1 = await riskManager.connect(governor).maxCover();
            expect(maxCover1).to.equal(0)
            expect(await coverageDataProvider.connect(governor).numOfPools()).to.equal(0);
            await coverageDataProvider.connect(governor).addPools([underwritingPool.address]);
            expect(await coverageDataProvider.connect(governor).numOfPools()).to.equal(1);

            let uwpETHBalance = await underwritingPool.getBalance();
            let maxCover2 = await riskManager.connect(governor).maxCover();
            expect(maxCover2).to.equal(maxCover1.add(uwpETHBalance));

            // add Soteria to the risk manager and assign coverage allocation
            await riskManager.connect(governor).addRiskStrategy(soteriaCoverageProduct.address);
            await riskManager.connect(governor).setStrategyStatus(soteriaCoverageProduct.address, STRATEGY_STATUS.ACTIVE);
            await riskManager.connect(governor).setWeightAllocation(soteriaCoverageProduct.address, 1000);
            expect(await riskManager.connect(governor).maxCoverPerStrategy(soteriaCoverageProduct.address)).to.equal(maxCover2);
    
            // buy policy
            let tx = await soteriaCoverageProduct.connect(policyholder1).buyPolicy(policyholder1.address, COVER_AMOUNT, {value: ONE_ETH});
            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_ONE);
            expect(await soteriaCoverageProduct.connect(policyholder1).activeCoverAmount()).to.equal(COVER_AMOUNT);
            expect(await soteriaCoverageProduct.connect(policyholder1).policyCount()).to.equal(1);
            expect(await soteriaCoverageProduct.connect(policyholder1).coverAmountOf(POLICY_ID_ONE)).to.equal(COVER_AMOUNT);
            expect(await soteriaCoverageProduct.connect(policyholder1).funds(policyholder1.address)).to.equal(ONE_ETH);
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(ONE_ETH);
        });

        it("can buy policy on behalf of the policy holder", async () => {
            let tx = await soteriaCoverageProduct.connect(policyholder1).buyPolicy(policyholder2.address, COVER_AMOUNT, {value: ONE_ETH});
            await expect(tx).emit(soteriaCoverageProduct, "PolicyCreated").withArgs(POLICY_ID_TWO);
            expect(await soteriaCoverageProduct.connect(policyholder1).activeCoverAmount()).to.equal(COVER_AMOUNT.mul(2));
            expect(await soteriaCoverageProduct.connect(policyholder1).policyCount()).to.equal(2);
            expect(await soteriaCoverageProduct.connect(policyholder1).coverAmountOf(POLICY_ID_TWO)).to.equal(COVER_AMOUNT);
            expect(await soteriaCoverageProduct.connect(policyholder1).funds(policyholder2.address)).to.equal(ONE_ETH);
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(ONE_ETH.mul(2));
        });

        it("cannot buy policy if policy holder has already bought for soteria", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).buyPolicy(policyholder1.address, COVER_AMOUNT, {value: ONE_ETH})).to.revertedWith("already bought policy");
        });

        it("policy holder should have policy nft after buying coverage", async () => {
            expect(await soteriaCoverageProduct.connect(policyholder1).balanceOf(policyholder1.address)).to.equal(1);
            expect(await soteriaCoverageProduct.connect(policyholder2).balanceOf(policyholder2.address)).to.equal(1);
        });

        it("can query via policy id", async () => {
            expect(await soteriaCoverageProduct.connect(policyholder1).ownerOfPolicy(POLICY_ID_ONE)).to.equal(policyholder1.address);
            expect(await soteriaCoverageProduct.connect(policyholder2).ownerOfPolicy(POLICY_ID_TWO)).to.equal(policyholder2.address);
        });

        it("can query via owner", async () => {
            expect(await soteriaCoverageProduct.connect(policyholder1).policyByOwner(policyholder1.address)).to.equal(POLICY_ID_ONE);
            expect(await soteriaCoverageProduct.connect(policyholder2).policyByOwner(policyholder2.address)).to.equal(POLICY_ID_TWO);
        });

        it("can query all holders", async () => {
            let holders = await soteriaCoverageProduct.connect(policyholder1).policyholders();
            expect(holders.length).to.equal(await soteriaCoverageProduct.policyCount());
        });

        it("should update policy manager active cover amount", async () => {
            let activeCoverAmount = await soteriaCoverageProduct.connect(governor).activeCoverAmount();
            expect(await policyManager.connect(governor).activeCoverAmount()).to.equal(pmActiveCoverAmount.add(activeCoverAmount));
            expect(await policyManager.connect(governor).activeCoverAmountPerStrategy(soteriaCoverageProduct.address)).to.equal(pmSoteriaActiveCoverAmount.add(activeCoverAmount));
        });

        it("should update risk manager mcr", async () => {
            let activeCoverAmount = await soteriaCoverageProduct.connect(governor).activeCoverAmount();
            expect(await riskManager.connect(governor).minCapitalRequirement()).to.equal(mcr.add(activeCoverAmount));
            expect(await riskManager.connect(governor).minCapitalRequirementPerStrategy(soteriaCoverageProduct.address)).to.equal(mcrps.add(activeCoverAmount));
        });
    });

    describe("deposit", () => {
        it("can deposit", async () => {
            let funds = await soteriaCoverageProduct.connect(policyholder1).funds(policyholder1.address);
            let balance = await provider.getBalance(soteriaCoverageProduct.address);
            let tx = await soteriaCoverageProduct.connect(policyholder1).deposit(policyholder1.address, { value: ONE_ETH });
            await expect(tx).emit(soteriaCoverageProduct, "DepositMade").withArgs(policyholder1.address, ONE_ETH);
            expect(await soteriaCoverageProduct.funds(policyholder1.address)).to.equal(funds.add(ONE_ETH));
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(balance.add(ONE_ETH));
        });

        it("can deposit on behalf of policy holder", async () => {
            let funds = await soteriaCoverageProduct.connect(policyholder1).funds(policyholder2.address);
            let balance = await provider.getBalance(soteriaCoverageProduct.address);
            let tx = await soteriaCoverageProduct.connect(policyholder1).deposit(policyholder2.address, { value: ONE_ETH });
            await expect(tx).emit(soteriaCoverageProduct, "DepositMade").withArgs(policyholder2.address, ONE_ETH);
            expect(await soteriaCoverageProduct.funds(policyholder2.address)).to.equal(funds.add(ONE_ETH));
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(balance.add(ONE_ETH));
        });

        it("can deposit via fallback", async () => {
            let funds = await soteriaCoverageProduct.connect(policyholder1).funds(policyholder1.address);
            let balance = await provider.getBalance(soteriaCoverageProduct.address);
            let tx = await policyholder1.sendTransaction({ to: soteriaCoverageProduct.address, value: ONE_ETH });
            await expect(tx).emit(soteriaCoverageProduct, "DepositMade").withArgs(policyholder1.address, ONE_ETH);
            expect(await soteriaCoverageProduct.funds(policyholder1.address)).to.equal(funds.add(ONE_ETH));
            expect(await provider.getBalance(soteriaCoverageProduct.address)).to.equal(balance.add(ONE_ETH));
        });

        it("cannot deposit while paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).deposit(policyholder1.address, { value: ONE_ETH })).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });
    });

    describe("updateCoverAmount", () => {
        let maxCover: BN;
        let maxCoverPerStrategy: BN;
        let prevMCRForSoteria: BN;
        let prevMCR: BN; // min. capital requirement
        let prevSoteriaActiveCoverAmount: BN;
        let prevPolicyCoverAmount: BN;
        let prevPMActiveCoverAmount: BN; // policy manager active cover amount
        let prevPMActiveCoverAmountForSoteria: BN; // policy manager active cover amount for soteria
    

        before(async () => {
            maxCover = await riskManager.connect(governor).maxCover();
            maxCoverPerStrategy = await riskManager.connect(governor).maxCoverPerStrategy(soteriaCoverageProduct.address);

            // risk manager current values
            prevMCR = await riskManager.connect(governor).minCapitalRequirement();
            prevMCRForSoteria = await riskManager.connect(governor).minCapitalRequirementPerStrategy(soteriaCoverageProduct.address);
            
            // policy manager current values
            prevPMActiveCoverAmount = await policyManager.connect(governor).activeCoverAmount();
            prevPMActiveCoverAmountForSoteria = await policyManager.connect(governor).activeCoverAmountPerStrategy(soteriaCoverageProduct.address);

            prevSoteriaActiveCoverAmount = await soteriaCoverageProduct.connect(policyholder1).activeCoverAmount();
            prevPolicyCoverAmount = await soteriaCoverageProduct.connect(policyholder1).coverAmountOf(POLICY_ID_ONE);

            expect(await soteriaCoverageProduct.connect(policyholder1).ownerOfPolicy(POLICY_ID_ONE)).to.equal(policyholder1.address);
            expect(await soteriaCoverageProduct.connect(policyholder1).ownerOf(POLICY_ID_ONE)).to.equal(policyholder1.address);
        });

        it("cannot update for zero cover amount", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverAmount(ZERO_AMOUNT)).to.revertedWith("zero cover value");
        });

        it("cannot update for invalid policy", async () => {
            await expect(soteriaCoverageProduct.connect(governor).updateCoverAmount(NEW_COVER_AMOUNT)).to.revertedWith("invalid policy");
        });

        it("cannot update while paused", async () => {
            await soteriaCoverageProduct.connect(governor).setPaused(true);
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverAmount(NEW_COVER_AMOUNT)).to.revertedWith("contract paused");
            await soteriaCoverageProduct.connect(governor).setPaused(false);
        });

        it("cannot update if max cover is exceeded", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverAmount(maxCover.add(1))).to.revertedWith("cannot accept that risk");
        });

        it("cannot update if max cover for the strategy is exceeded", async () => {
            await expect(soteriaCoverageProduct.connect(policyholder1).updateCoverAmount(maxCoverPerStrategy.add(1))).to.revertedWith("cannot accept that risk");
        });

        it("can update policy", async () => {
            let tx = await soteriaCoverageProduct.connect(policyholder1).updateCoverAmount(NEW_COVER_AMOUNT);
            await expect(tx).emit(soteriaCoverageProduct, "PolicyUpdated").withArgs(POLICY_ID_ONE);
            let activeCoverAmount = prevSoteriaActiveCoverAmount.add(NEW_COVER_AMOUNT).sub(prevPolicyCoverAmount);
            expect(await soteriaCoverageProduct.connect(policyholder1).activeCoverAmount()).to.equal(activeCoverAmount);
            expect(await soteriaCoverageProduct.connect(policyholder1).coverAmountOf(POLICY_ID_ONE)).to.equal(NEW_COVER_AMOUNT);
        });

        it("should update policy manager active cover amount", async () => {
            let amount1 = prevPMActiveCoverAmount.add(NEW_COVER_AMOUNT).sub(prevPolicyCoverAmount);
            let amount2 = prevPMActiveCoverAmountForSoteria.add(NEW_COVER_AMOUNT).sub(prevPolicyCoverAmount);

            expect(await policyManager.connect(governor).activeCoverAmount()).to.equal(amount1);
            expect(await policyManager.connect(governor).activeCoverAmountPerStrategy(soteriaCoverageProduct.address)).to.equal(amount2);
        });

        it("should update risk manager mcr", async () => {         
            let amount1 = prevMCR.add(NEW_COVER_AMOUNT).sub(prevPolicyCoverAmount);
            let amount2 = prevMCRForSoteria.add(NEW_COVER_AMOUNT).sub(prevPolicyCoverAmount);
            expect(await riskManager.connect(governor).minCapitalRequirement()).to.equal(amount1);
            expect(await riskManager.connect(governor).minCapitalRequirementPerStrategy(soteriaCoverageProduct.address)).to.equal(amount2);
        });
    });


    describe("cancelPolicy", () => {

        before(async () => {

        });

        
    });



});