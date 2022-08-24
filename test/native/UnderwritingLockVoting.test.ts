import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, constants, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { UnderwritingLocker, UnderwritingLockVoting, Registry, MockErc20PermitWithBurn, GaugeController } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";
import { expectClose } from "./../utilities/math";

/*******************
  GLOBAL CONSTANTS
*******************/
const ZERO = BN.from("0");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_MILLION_ETHER = ONE_ETHER.mul(1000000);
const ONE_YEAR = 31536000; // in seconds
const ONE_MONTH = ONE_YEAR / 12;
const ONE_WEEK = 604800; // in seconds
const DEPOSIT_AMOUNT = ONE_ETHER;
const SCALE_FACTOR = ONE_ETHER;
const ONE_PERCENT = ONE_ETHER.div(100);
const ONE_HUNDRED_PERCENT = ONE_ETHER;
const CUSTOM_GAS_LIMIT = 6000000;

describe("UnderwritingLockVoting", function () {
    const [deployer, governor, revenueRouter, voter1, voter2, delegate1, updater, anon] = provider.getWallets();
  
    /***************************
       VARIABLE DECLARATIONS
    ***************************/
    let token: MockErc20PermitWithBurn;
    let registry: Registry;
    let underwritingLocker: UnderwritingLocker;
    let gaugeController: GaugeController;
    let voting: UnderwritingLockVoting;
    let artifacts: ArtifactImports;
    let snapshot: BN;
  
    before(async function () {
      artifacts = await import_artifacts();
      snapshot = await provider.send("evm_snapshot", []);
      await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
      
      // Deploy $UWE, and mint 1M $UWE to deployer
      token = (await deployContract(deployer, artifacts.MockERC20PermitWithBurn, ["Underwriting Equity - Solace Native", "UWE", ONE_MILLION_ETHER, 18])) as MockErc20PermitWithBurn;

      // Deploy registry
      registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    });
  
    after(async function () {
      await provider.send("evm_revert", [snapshot]);
    });

    describe("deployment", function () {
        it("reverts if zero address governance", async function () {
          await expect(deployContract(deployer, artifacts.UnderwritingLockVoting, [ZERO_ADDRESS, registry.address])).to.be.revertedWith("zero address governance");
        });
        it("reverts if zero address registry", async function () {
          await expect(deployContract(deployer, artifacts.UnderwritingLockVoting, [governor.address, ZERO_ADDRESS])).to.be.revertedWith('ZeroAddressInput("registry")');
        });
        it("reverts if zero address revenueRouter in Registry", async function () {
          await expect(deployContract(deployer, artifacts.UnderwritingLockVoting, [governor.address, registry.address])).to.be.revertedWith('ZeroAddressInput("revenueRouter")');
          await registry.connect(governor).set(["revenueRouter"], [revenueRouter.address]);
        });
        it("reverts if zero address underwritingLocker in Registry", async function () {
          await expect(deployContract(deployer, artifacts.UnderwritingLockVoting, [governor.address, registry.address])).to.be.revertedWith('ZeroAddressInput("underwritingLocker")');
          await registry.connect(governor).set(["uwe"], [token.address]);
          underwritingLocker = (await deployContract(deployer, artifacts.UnderwritingLocker, [governor.address, registry.address])) as UnderwritingLocker;
          await expectDeployed(underwritingLocker.address);
          await registry.connect(governor).set(["underwritingLocker"], [underwritingLocker.address]);
        });
        it("reverts if zero address gaugeController in Registry", async function () {
          await expect(deployContract(deployer, artifacts.UnderwritingLockVoting, [governor.address, registry.address])).to.be.revertedWith('ZeroAddressInput("gaugeController")');
          gaugeController = (await deployContract(deployer, artifacts.GaugeController, [governor.address, token.address])) as GaugeController;
          await registry.connect(governor).set(["gaugeController"], [gaugeController.address]);
        });
        it("deploys", async function () {
          voting = (await deployContract(deployer, artifacts.UnderwritingLockVoting, [governor.address, registry.address])) as UnderwritingLockVoting;
          await expectDeployed(voting.address);
        });
        it("initializes properly", async function () {
          expect(await voting.revenueRouter()).eq(revenueRouter.address);
          expect(await voting.underwritingLocker()).eq(underwritingLocker.address);
          expect(await voting.gaugeController()).eq(gaugeController.address);
          expect(await voting.registry()).eq(registry.address);
          expect(await voting.updater()).eq(ZERO_ADDRESS);
          expect(await voting.lastTimePremiumsCharged()).eq(0);
          expect(await voting.isVotingOpen()).eq(false);
          expect(await gaugeController.getVoteCount(voting.address, voter1.address)).eq(0)
          expect(await gaugeController.getVotersCount(voting.address)).eq(0)
        });
        it("getEpochStartTimestamp gets current timestamp rounded down to a multiple of WEEK ", async function () {
          const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
          const EXPECTED_EPOCH_START_TIME = BN.from(CURRENT_TIME).div(ONE_WEEK).mul(ONE_WEEK)
          expect(await voting.getEpochStartTimestamp()).eq(EXPECTED_EPOCH_START_TIME)
        });
        it("getEpochEndTimestamp() == getEpochStartTimestamp() + ONE_WEEK ", async function () {
          expect(await voting.getEpochEndTimestamp()).eq((await voting.getEpochStartTimestamp()).add(ONE_WEEK))
        });
        it("getEpochStartTimestamp() should be equivalent to gaugeController ", async function () {
          expect(await voting.getEpochStartTimestamp()).eq(await gaugeController.getEpochStartTimestamp())
        });
        it("getEpochEndTimestamp() should be equivalent to gaugeController ", async function () {
          expect(await voting.getEpochEndTimestamp()).eq(await gaugeController.getEpochEndTimestamp())
        });
        it("getVotePower should return 0 for a non-lock owner", async function () {
          expect(await voting.getVotePower(voter1.address)).eq(0)
        });
        it("getVotes should return empty array for non-voter", async function () {
          expect(await voting.getVotes(voter1.address)).deep.eq([])
        });
        it("chargePremiums should revert", async function () {
          await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("GaugeWeightsNotYetUpdated")
        });
    });

    describe("governance", () => {
        it("starts with the correct governor", async () => {
          expect(await voting.governance()).to.equal(governor.address);
        });
        it("rejects setting new governance by non governor", async  () => {
          await expect(voting.connect(voter1).setPendingGovernance(voter1.address)).to.be.revertedWith("!governance");
        });
        it("can set new governance", async () => {
          let tx = await voting.connect(governor).setPendingGovernance(deployer.address);
          await expect(tx).to.emit(voting, "GovernancePending").withArgs(deployer.address);
          expect(await voting.governance()).to.equal(governor.address);
          expect(await voting.pendingGovernance()).to.equal(deployer.address);
        });
        it("rejects governance transfer by non governor", async () => {
          await expect(voting.connect(voter1).acceptGovernance()).to.be.revertedWith("!pending governance");
        });
        it("can transfer governance", async () => {
          let tx = await voting.connect(deployer).acceptGovernance();
          await expect(tx)
            .to.emit(voting, "GovernanceTransferred")
            .withArgs(governor.address, deployer.address);
          expect(await voting.governance()).to.equal(deployer.address);
          await voting.connect(deployer).setPendingGovernance(governor.address);
          await voting.connect(governor).acceptGovernance();
        });
    });

    describe("setRegistry", () => {
        let registry2: Registry;
        const RANDOM_ADDRESS_1 = ethers.Wallet.createRandom().connect(provider).address;
        const RANDOM_ADDRESS_2 = ethers.Wallet.createRandom().connect(provider).address;
        const RANDOM_ADDRESS_3 = ethers.Wallet.createRandom().connect(provider).address;
    
        before(async function () {
          registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
        });
        it("reverts if not governor", async function () {
          await expect(voting.connect(voter1).setRegistry(registry2.address)).to.be.revertedWith("!governance");
        })
        it("reverts if zero address registry", async function () {
          await expect(voting.connect(governor).setRegistry(ZERO_ADDRESS)).to.be.revertedWith('ZeroAddressInput("registry")');
        });
        it("reverts if zero address revenueRouter in Registry", async function () {
          await expect(voting.connect(governor).setRegistry(registry2.address)).to.be.revertedWith('ZeroAddressInput("revenueRouter")');
          await registry2.connect(governor).set(["revenueRouter"], [RANDOM_ADDRESS_1]);
        });
        it("reverts if zero address underwritingLocker in Registry", async function () {
          await expect(voting.connect(governor).setRegistry(registry2.address)).to.be.revertedWith('ZeroAddressInput("underwritingLocker")');
          await registry2.connect(governor).set(["underwritingLocker"], [RANDOM_ADDRESS_2]);
        })
        it("reverts if zero address gaugeController in Registry", async function () {
          await expect(voting.connect(governor).setRegistry(registry2.address)).to.be.revertedWith('ZeroAddressInput("gaugeController")');
          await registry2.connect(governor).set(["gaugeController"], [RANDOM_ADDRESS_3]);
        });
        it("sets registry", async function () {
          const tx = await voting.connect(governor).setRegistry(registry2.address);
          await expect(tx).to.emit(voting, "RegistrySet").withArgs(registry2.address);
        });
        it("copies Registry addresses to own state variables", async function () {
          expect(await voting.registry()).eq(registry2.address);
          expect(await voting.revenueRouter()).eq(RANDOM_ADDRESS_1);
          expect(await voting.underwritingLocker()).eq(RANDOM_ADDRESS_2);
          expect(await voting.gaugeController()).eq(RANDOM_ADDRESS_3);
        });
        after(async function () {
          await voting.connect(governor).setRegistry(registry.address);
        });
    });

    describe("setDelegate", () => {
        // Create two locks for voter1: lockID 1 => 1yr, lockID 2 => 2yr
        // and two locks for voter 2: lockID 3 => 3yr, lockID 4 => 4yr
        before(async function () {
            const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
            await token.connect(deployer).transfer(voter1.address, ONE_ETHER.mul(100000))
            await token.connect(deployer).transfer(voter2.address, ONE_ETHER.mul(100000))
            await token.connect(voter1).approve(underwritingLocker.address, constants.MaxUint256)
            await token.connect(voter2).approve(underwritingLocker.address, constants.MaxUint256)
            await underwritingLocker.connect(voter1).createLock(voter1.address, DEPOSIT_AMOUNT, CURRENT_TIME + ONE_YEAR);
            await underwritingLocker.connect(voter1).createLock(voter1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 2 * ONE_YEAR);
            await underwritingLocker.connect(voter2).createLock(voter2.address, DEPOSIT_AMOUNT, CURRENT_TIME + 3 * ONE_YEAR);
            await underwritingLocker.connect(voter2).createLock(voter2.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR);
            expect(await voting.delegateOf(voter1.address)).eq(ZERO_ADDRESS)
        });
        it("owner can set delegate", async function () {
            const tx = await voting.connect(voter1).setDelegate(delegate1.address);
            await expect(tx).to.emit(voting, "DelegateSet").withArgs(voter1.address, delegate1.address);
            expect(await voting.delegateOf(voter1.address)).eq(delegate1.address)
            expect(await voting.delegateOf(voter2.address)).eq(ZERO_ADDRESS)
        })
    });

    describe("setUpdater", () => {
      it("non governor cannot setUpdater", async  () => {
        await expect(voting.connect(voter1).setUpdater(updater.address)).to.be.revertedWith("!governance");
      });
      it("can set updater", async () => {
        let tx = await voting.connect(governor).setUpdater(updater.address);
        await expect(tx).to.emit(voting, "UpdaterSet").withArgs(updater.address);
        expect(await voting.updater()).eq(updater.address)
      });
    });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * There are four locks owned:
   * lockID 1 => 1e18 locked for 1 yr, owned by voter1, managed by delegate1
   * lockID 2 => 1e18 locked for 2 yrs, owned by voter1, managed by delegate1
   * lockID 3 => 1e18 locked for 3 yrs, owned by voter2
   * lockID 4 => 1e18 locked for 4 yrs, owned by voter2
   */

    describe("getVotePower() sanity check", () => {
      it("should return appropriate values", async function () {
        const ONE_YEAR_LOCK_ID = 1;
        const TWO_YEAR_LOCK_ID = 2;
        const THREE_YEAR_LOCK_ID = 3;
        const FOUR_YEAR_LOCK_ID = 4;
        expectClose(await underwritingLocker.timeLeft(ONE_YEAR_LOCK_ID), ONE_YEAR, 1e15)
        expectClose(await underwritingLocker.timeLeft(TWO_YEAR_LOCK_ID), 2 * ONE_YEAR, 1e15)
        expectClose(await underwritingLocker.timeLeft(THREE_YEAR_LOCK_ID), 3 * ONE_YEAR, 1e15)
        expectClose(await underwritingLocker.timeLeft(FOUR_YEAR_LOCK_ID), 4 * ONE_YEAR, 1e15)
        // Expect 1-yr lock multiplier = sqrt(12) / sqrt(6) = sqrt(2)
        const EXPECTED_LOCK_MULTIPLIER_ONE_YEAR = sqrt(SCALE_FACTOR.mul(SCALE_FACTOR).mul(2));
        // Expect 2-yr lock multiplier = sqrt(24) / sqrt(6) = 2
        const EXPECTED_LOCK_MULTIPLIER_TWO_YEAR = SCALE_FACTOR.mul(2);
        // Expect 3-yr lock multiplier = sqrt(36) / sqrt(6) = sqrt(6)
        const EXPECTED_LOCK_MULTIPLIER_THREE_YEAR = sqrt(SCALE_FACTOR.mul(SCALE_FACTOR).mul(6));
        // Expect 4-yr lock multiplier = sqrt(48) / sqrt(6) = sqrt(8)
        const EXPECTED_LOCK_MULTIPLIER_FOUR_YEAR = sqrt(SCALE_FACTOR.mul(SCALE_FACTOR).mul(8));
        expectClose(await underwritingLocker.getLockMultiplier(ONE_YEAR_LOCK_ID), EXPECTED_LOCK_MULTIPLIER_ONE_YEAR, 1e15)
        expectClose(await underwritingLocker.getLockMultiplier(TWO_YEAR_LOCK_ID), EXPECTED_LOCK_MULTIPLIER_TWO_YEAR, 1e15)
        expectClose(await underwritingLocker.getLockMultiplier(THREE_YEAR_LOCK_ID), EXPECTED_LOCK_MULTIPLIER_THREE_YEAR, 1e15)
        expectClose(await underwritingLocker.getLockMultiplier(FOUR_YEAR_LOCK_ID), EXPECTED_LOCK_MULTIPLIER_FOUR_YEAR, 1e15)
        const EXPECTED_VOTE_POWER_ONE_YEAR_LOCK = EXPECTED_LOCK_MULTIPLIER_ONE_YEAR.mul(DEPOSIT_AMOUNT).div(SCALE_FACTOR)
        const EXPECTED_VOTE_POWER_TWO_YEAR_LOCK = EXPECTED_LOCK_MULTIPLIER_TWO_YEAR.mul(DEPOSIT_AMOUNT).div(SCALE_FACTOR)
        const EXPECTED_VOTE_POWER_THREE_YEAR_LOCK = EXPECTED_LOCK_MULTIPLIER_THREE_YEAR.mul(DEPOSIT_AMOUNT).div(SCALE_FACTOR)
        const EXPECTED_VOTE_POWER_FOUR_YEAR_LOCK = EXPECTED_LOCK_MULTIPLIER_FOUR_YEAR.mul(DEPOSIT_AMOUNT).div(SCALE_FACTOR)
        expectClose(await voting.getVotePower(voter1.address), EXPECTED_VOTE_POWER_ONE_YEAR_LOCK.add(EXPECTED_VOTE_POWER_TWO_YEAR_LOCK), 1e15);
        expectClose(await voting.getVotePower(voter2.address), EXPECTED_VOTE_POWER_THREE_YEAR_LOCK.add(EXPECTED_VOTE_POWER_FOUR_YEAR_LOCK), 1e15);
      });
    });

    describe("cacheLastProcessedVotePower()", () => {
      it("should revert if called by non gaugeController", async function () {
        await expect(voting.connect(governor).cacheLastProcessedVotePower(voter1.address, 1)).to.be.revertedWith("NotGaugeController")
      });
    });

    describe("gaugeController.removeTokenholder", () => {
      it("rejects setting new governance by non governor", async  () => {
        await expect(gaugeController.connect(voter1).removeTokenholder(voter1.address)).to.be.revertedWith("!governance");
      });
      it("cannot remove address, that has not previously been added as voting contract", async  () => {
        await expect(gaugeController.connect(governor).removeTokenholder(deployer.address)).to.be.revertedWith("TokenholderNotPresent");
      });
      it("can remove voting contract", async () => {
        await gaugeController.connect(governor).addTokenholder(voter1.address);
        let tx = await gaugeController.connect(governor).removeTokenholder(voter1.address);
        await expect(tx).to.emit(gaugeController, "TokenholderRemoved").withArgs(voter1.address);
      });
    });

    describe("gaugeController.setLeverageFactor", () => {
      it("non governor cannot setLeverageFactor", async  () => {
        await expect(gaugeController.connect(voter1).setLeverageFactor(ONE_HUNDRED_PERCENT)).to.be.revertedWith("!governance");
      });
      it("can set new leverage factor", async () => {
        let tx = await gaugeController.connect(governor).setLeverageFactor(ONE_HUNDRED_PERCENT.mul(2));
        await expect(tx).to.emit(gaugeController, "LeverageFactorSet").withArgs(ONE_HUNDRED_PERCENT.mul(2));
        expect(await gaugeController.leverageFactor()).eq(ONE_HUNDRED_PERCENT.mul(2))
        await gaugeController.connect(governor).setLeverageFactor(ONE_HUNDRED_PERCENT)
      });
    });

    describe("gaugeController.setToken", () => {
      it("non governor cannot setToken", async  () => {
        await expect(gaugeController.connect(voter1).setToken(voter1.address)).to.be.revertedWith("!governance");
      });
      it("can set new token", async () => {
        let tx = await gaugeController.connect(governor).setToken(voter1.address);
        await expect(tx).to.emit(gaugeController, "TokenSet").withArgs(voter1.address);
        expect(await gaugeController.token()).eq(voter1.address)
        await gaugeController.connect(governor).setToken(token.address)
      });
    });

    describe("gaugeController.setUpdater", () => {
      it("non governor cannot setUpdater", async  () => {
        await expect(gaugeController.connect(voter1).setUpdater(updater.address)).to.be.revertedWith("!governance");
      });
      it("can set updater", async () => {
        let tx = await gaugeController.connect(governor).setUpdater(updater.address);
        await expect(tx).to.emit(gaugeController, "UpdaterSet").withArgs(updater.address);
        expect(await gaugeController.updater()).eq(updater.address)
      });
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    // voter1 will vote for gaugeID 1 with 100% of vote power

    describe("basic vote() scenario", () => {
      let LAST_RECORDED_VOTE_POWER: BN; // To transport VOTE_POWER value from one unit test to another.

      it("vote() and voteMultiple() should throw if gauge weights have not been processed", async function () {
        await expect(voting.connect(voter1).vote(voter1.address, 1, 10000)).to.be.revertedWith("LastEpochPremiumsNotCharged");
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [1, 2], [10000, 10000])).to.be.revertedWith("LastEpochPremiumsNotCharged");
      });
      it("updateGaugeWeights() should revert if non governor or updater", async function () {
        await expect(gaugeController.connect(voter1).updateGaugeWeights()).to.be.revertedWith("NotUpdaterNorGovernance");
      });
      it("chargePremiums() should revert if non governor or updater", async function () {
        await expect(voting.connect(voter1).chargePremiums()).to.be.revertedWith("NotUpdaterNorGovernance");
      });
      it("chargePremiums() should revert if gauge weights have not been updated", async function () {
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("GaugeWeightsNotYetUpdated");
      });
      it("updateGaugeWeights() should succeed", async function () {
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();
        const tx = await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT});
        await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
        expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect(await gaugeController.getVotePowerSum()).eq(0)
      });
      it("updateGaugeWeights() should revert if attempted again in the same epoch", async function () {
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated");
      });
      it("isVotingOpen() should return false at this point", async function () {
        expect(await voting.isVotingOpen()).eq(false);
      });
      it("vote() and voteMultiple() should throw if premiums have not been charged", async function () {
        await expect(voting.connect(voter1).vote(voter1.address, 1, 10000)).to.be.revertedWith("LastEpochPremiumsNotCharged");
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [1, 2], [10000, 10000])).to.be.revertedWith("LastEpochPremiumsNotCharged");
      });
      it("chargePremiums() should revert before tokenholder added to gaugeController()", async function () {
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("NoTokenholdersAdded");
        await gaugeController.connect(governor).addTokenholder(underwritingLocker.address);
      });
      it("chargePremiums() should succeed", async function () {
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();
        const tx = await voting.connect(governor).chargePremiums();
        await expect(tx).to.emit(voting, "AllPremiumsCharged").withArgs(EPOCH_START_TIME);
        expect(await voting.lastTimePremiumsCharged()).eq(EPOCH_START_TIME)
      });
      it("isVotingOpen() should return true at this point", async function () {
        expect(await voting.isVotingOpen()).eq(true);
      });
      it("chargePremiums() should revert if attempted again in the same epoch", async function () {
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed");
      });
      it("non-owner or non-delegate cannot vote() or voteMultiple()", async function () {
        await expect(voting.connect(anon).vote(voter1.address, 1, 1)).to.be.revertedWith("NotOwnerNorDelegate()");
        await expect(voting.connect(anon).voteMultiple(voter1.address, [1, 2], [10000, 10000])).to.be.revertedWith("NotOwnerNorDelegate");
      });
      it("cannot vote() or voteMultiple() for gauge that has not been added", async function () {
        await expect(voting.connect(voter1).vote(voter1.address, 1, 10000)).to.be.revertedWith("GaugeIDNotExist");
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [1, 2], [10000, 10000])).to.be.revertedWith("GaugeIDNotExist");
      });
      it("cannot vote() or voteMultiple() for gaugeID 0", async function () {
        await expect(voting.connect(voter1).vote(voter1.address, 0, 10000)).to.be.revertedWith("CannotVoteForGaugeID0");
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [0, 1], [10000, 10000])).to.be.revertedWith("CannotVoteForGaugeID0");
      });
      it("non-governor cannot add gauge", async function () {
        await expect(gaugeController.connect(voter1).addGauge("gauge1", ONE_PERCENT)).to.be.revertedWith("!governance");
      });
      it("governor can add gauge", async function () {
        const tx = await gaugeController.connect(governor).addGauge("gauge1", ONE_PERCENT);
        await expect(tx).to.emit(gaugeController, "GaugeAdded").withArgs(1, ONE_PERCENT, "gauge1");
        expect(await gaugeController.totalGauges()).eq(1)
        expect(await gaugeController.getGaugeName(1)).eq("gauge1")
        expect(await gaugeController.isGaugeActive(1)).eq(true)
        expect(await gaugeController.getRateOnLineOfGauge(1)).eq(ONE_PERCENT)
      });
      it("non governor cannot setRateOnLine", async  () => {
        await expect(gaugeController.connect(voter1).setRateOnLine([1], [1])).to.be.revertedWith("!governance");
      });
      it("cannot setRateOnLine of non-existent gauge", async  () => {
        await expect(gaugeController.connect(governor).setRateOnLine([2], [1])).to.be.reverted;
      });
      it("cannot setRateOnLine with mismatching arrays", async  () => {
        await expect(gaugeController.connect(governor).setRateOnLine([2, 0], [1])).to.be.revertedWith("ArrayArgumentsLengthMismatch");
      });
      it("can set setRateOnLine", async () => {
        let tx = await gaugeController.connect(governor).setRateOnLine([1], [1]);
        await expect(tx).to.emit(gaugeController, "RateOnLineSet").withArgs(1, 1);
        expect(await gaugeController.getRateOnLineOfGauge(1)).eq(1)
        await gaugeController.connect(governor).setRateOnLine([1], [ONE_PERCENT]);
      });
      it("cannot vote() or voteMultiple() before voting contract added to gaugeController", async function () {
        await expect(voting.connect(voter1).vote(voter1.address, 1, 10000)).to.be.revertedWith("NotVotingContract");
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [1, 1], [10000, 10000])).to.be.revertedWith("NotVotingContract");
        await gaugeController.connect(governor).addVotingContract(voting.address);
      });
      it("non governor cannot remove voting contract", async  () => {
        await expect(gaugeController.connect(voter1).removeVotingContract(voter1.address)).to.be.revertedWith("!governance");
      });
      it("cannot remove address, that has not previously been added as voting contract", async  () => {
        await expect(gaugeController.connect(governor).removeVotingContract(deployer.address)).to.be.revertedWith("VotingContractNotAdded");
      });
      it("can remove voting contract", async () => {
        const tx = await gaugeController.connect(governor).removeVotingContract(voting.address);
        await expect(tx).to.emit(gaugeController, "VotingContractRemoved").withArgs(voting.address);
        await gaugeController.connect(governor).addVotingContract(voting.address);
      });
      it("no premiums should have been collected at this point", async function () {
        expect(await token.balanceOf(revenueRouter.address)).eq(0)
      });
      it("non-governor cannot pause gauge", async function () {
        await expect(gaugeController.connect(voter1).pauseGauge(1)).to.be.revertedWith("!governance");
      });
      it("governor can pause gauge", async function () {
        const tx = await gaugeController.connect(governor).pauseGauge(1);
        await expect(tx).to.emit(gaugeController, "GaugePaused").withArgs(1, "gauge1");
        expect(await gaugeController.totalGauges()).eq(1)
        expect(await gaugeController.getNumPausedGauges()).eq(1)
      });
      it("non-governor cannot repause gauge", async function () {
        await expect(gaugeController.connect(governor).pauseGauge(1)).to.be.revertedWith("GaugeAlreadyPaused(1)");
      });
      it("neither voter nor delegate can vote() or voteMultiple() while gauge is paused", async function () {
        await expect(voting.connect(voter1).vote(voter1.address, 1, 10000)).to.be.revertedWith("GaugeIDPaused");
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [1, 1], [10000, 10000])).to.be.revertedWith("GaugeIDPaused");
        await gaugeController.connect(governor).unpauseGauge(1);
      });
      it("non-governor cannot re-unpause gauge", async function () {
        await expect(gaugeController.connect(governor).unpauseGauge(1)).to.be.revertedWith("GaugeAlreadyUnpaused(1)");
      });
      it("non-governor cannot unpause gaugeID 0", async function () {
        await expect(gaugeController.connect(governor).unpauseGauge(0)).to.be.revertedWith("CannotUnpauseGaugeID0");
      });
      it("non lockowner cannot vote", async function () {
        await expect(voting.connect(anon).vote(anon.address, 1, 10000)).to.be.revertedWith("VoterHasNoLocks");
        await expect(voting.connect(anon).voteMultiple(anon.address, [1, 1], [10000, 10000])).to.be.revertedWith("VoterHasNoLocks");
      });
      it("cannot vote with BPS > 10000", async function () {
        await expect(voting.connect(voter1).vote(voter1.address, 1, 10001)).to.be.revertedWith("SingleVotePowerBPSOver10000");
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [1, 2], [1, 10001])).to.be.revertedWith("SingleVotePowerBPSOver10000");
      });
      it("lock-owner can vote", async function () {
        const GAUGE_ID = 1;
        const tx = await voting.connect(voter1).vote(voter1.address, GAUGE_ID, 10000)
        await expect(tx).to.emit(voting, "VoteAdded").withArgs(voter1.address, GAUGE_ID, 10000);
      });
      it("delegate can change vote", async function () {
        const GAUGE_ID = 1;
        expect(await voting.delegateOf(voter1.address)).eq(delegate1.address)
        const tx = await voting.connect(delegate1).vote(voter1.address, GAUGE_ID, 10000)
        await expect(tx).to.emit(voting, "VoteChanged").withArgs(voter1.address, GAUGE_ID, 10000, 10000);
      });
      it("sanity check of getVotes and gauge weights", async function () {
        const GAUGE_ID = BN.from("1")
        const EXPECTED_VOTEPOWERBPS = BN.from("10000")
        const votes = await voting.getVotes(voter1.address)
        expect(votes.length).eq(1)
        expect(votes[0].gaugeID).eq(GAUGE_ID)
        expect(votes[0].votePowerBPS).eq(EXPECTED_VOTEPOWERBPS)
        expect(await voting.getVotes(voter1.address)).deep.eq([[GAUGE_ID, EXPECTED_VOTEPOWERBPS]])
        expect(await gaugeController.getGaugeWeight(1)).eq(ZERO)
        expect(await gaugeController.getAllGaugeWeights()).deep.eq([ZERO, ZERO]);
        expect(await gaugeController.getVotePowerSum()).eq(ZERO)
        expect(await gaugeController.getVoteCount(voting.address, voter1.address)).eq(1)
        expect(await gaugeController.getVotersCount(voting.address)).eq(1)
      });
      it("updateGaugeWeights() called by updater should succeed in the next epoch", async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        const tx = await gaugeController.connect(updater).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT});
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();
        const VOTE_POWER = await voting.getVotePower(voter1.address);
        await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
        LAST_RECORDED_VOTE_POWER = VOTE_POWER;
      });
      it("sanity check of gauge weights", async function () {
        expect(await gaugeController.getGaugeWeight(1)).eq(ONE_HUNDRED_PERCENT)
        expect(await gaugeController.getAllGaugeWeights()).deep.eq([ZERO, ONE_HUNDRED_PERCENT]);
        expect(await gaugeController.getVotePowerSum()).eq(LAST_RECORDED_VOTE_POWER)
      });      
      it("cannot vote or voteMultiple, between processVotes() and chargePremiums() for the same epoch", async function () {
        expect(await voting.isVotingOpen()).eq(false)
        await expect(voting.connect(voter1).vote(voter1.address, 1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged");
        await expect(voting.connect(delegate1).voteMultiple(voter1.address, [1, 2], [10000, 10000])).to.be.revertedWith("LastEpochPremiumsNotCharged");
      });      
      it("chargePremiums() should revert before underwritingLocker.sol call setVotingContract()", async function () {
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("NotVotingContract");
      });
      it("chargePremiums() call by updater should succeed in the next epoch, provided allowance granted by underwritingLocker", async function () {
        await registry.connect(governor).set(["underwritingLockVoting"],[voting.address]);
        await underwritingLocker.connect(governor).setVotingContract();
        const OLD_VOTER_LOCKED_AMOUNT = await getTotalLockedAmount(voter1.address)
        const OLD_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);

        const tx = await voting.connect(updater).chargePremiums();
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();
        const NEW_VOTER_LOCKED_AMOUNT = await getTotalLockedAmount(voter1.address)
        const NEW_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const EXPECTED_PREMIUM = await getExpectedPremium(voter1.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER)
        await expect(tx).to.emit(voting, "AllPremiumsCharged").withArgs(EPOCH_START_TIME);
        expect(await token.balanceOf(revenueRouter.address)).eq(EXPECTED_PREMIUM);
        expect(NEW_VOTER_LOCKED_AMOUNT.sub(OLD_VOTER_LOCKED_AMOUNT)).eq(EXPECTED_PREMIUM.mul(-1));
        expect(NEW_UNDERWRITING_LOCKER_BALANCE.sub(OLD_UNDERWRITING_LOCKER_BALANCE)).eq(EXPECTED_PREMIUM.mul(-1));
        expect(await voting.isVotingOpen()).eq(true)
      });
    });

    /**********
      LESSONS
    **********/
    /**
     * No vote can occur, gaugeController.updateGaugeWeights() and underwritingLockVoting.chargePremiums() has been completed for the last epoch, even at initialization.
     * 
     * GaugeController.sol requires the following setup:
     * i.) Deployed with correct must be deployed with correct token variable.
     * ii.) gaugeController.addVotingContract() called to add UnderwritingLockVesting.sol.
     * iii.) gaugeController.addTokenholder() called to add UnderwritingLocker.sol
     * 
     * Successful call of UnderwritingLocker.setVotingContract()
     * i.) underwritingLockVoting must be added as a registry entry key
     * ii.) underwritingLocker must have approved underwritingLockVoting.sol as a spender for its balance of $UWE.
     */

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * voter1:
     * - gauge1 with 100% vote power
     * - delegate is delegate1
     * - Own lockID 1 (1e18 initial deposit, locked for 1 yr)
     * - Own lockID 2 (1e18 initial deposit, locked for 2 yr)
     * 
     * voter2:
     * - no votes
     * - no delegates
     * - Own lockID 3 (1e18 initial deposit, locked for 3 yr)
     * - Own lockID 4 (1e18 initial deposit, locked for 4 yr)
     * 
     * There is 1 gauge
     * gaugeID 1 => "gauge1" => 100% weight
     * 
     * Votes and premiums have been processed for the last epoch
     */

    /**********************
      INTENTION STATEMENT 
    **********************/
    /**
     * We will add 2 more gauges, and create 1 more lock
     * - gaugeID 2 => 2% ROL
     * - gaugeID 3 => 5% ROL
     * - Create lockID 5 for voter1, but burn this lock after voting (but before updateGaugeWeights called).
     * 
     * voter1 => will vote 50% for gauge1 (we will pause this gauge after), and 50% for gauge2
     * voter2 => will vote 40% for gauge2, 30% for gauge3, leave 30% unallocated
     */

    describe("basic voteMultiple() scenario", () => {
      let LAST_RECORDED_VOTE_POWER_1: BN;
      let LAST_RECORDED_VOTE_POWER_2: BN;

      // Create new gauges and lock
      before(async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await underwritingLocker.connect(voter1).createLock(voter1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR)
        await gaugeController.connect(governor).addGauge("gauge2", ONE_PERCENT.mul(2))
        await gaugeController.connect(governor).addGauge("gauge3", ONE_PERCENT.mul(5))
      });
      it("should revert if provide mismatching array inputs", async function () {
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [1, 2], [1])).to.be.revertedWith("ArrayArgumentsLengthMismatch");
      });
      it("should revert if provide total vote power >10000", async function () {
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [1, 2, 3, 1, 1], [5000, 4000, 3000, 4000, 6000])).to.be.revertedWith("TotalVotePowerBPSOver10000");
      });
      it("delegate should be able to voteMultiple()", async function () {
        const GAUGE_ID_1 = 1
        const VOTE_POWER_BPS_1 = 5000
        const GAUGE_ID_2 = 2
        const VOTE_POWER_BPS_2 = 5000
        const tx = await voting.connect(delegate1).voteMultiple(voter1.address, [GAUGE_ID_1, GAUGE_ID_2], [VOTE_POWER_BPS_1, VOTE_POWER_BPS_2]);
        await expect(tx).to.emit(voting, "VoteChanged").withArgs(voter1.address, GAUGE_ID_1, VOTE_POWER_BPS_1, 10000);
        await expect(tx).to.emit(voting, "VoteAdded").withArgs(voter1.address, GAUGE_ID_2, VOTE_POWER_BPS_2);

        // Add edge conditions
        await gaugeController.connect(governor).pauseGauge(1)
        await underwritingLocker.connect(voter1).withdraw(5, voter1.address);
      });
      it("owner should be able to voteMultiple()", async function () {
        const GAUGE_ID_1 = 2
        const VOTE_POWER_BPS_1 = 4000
        const GAUGE_ID_2 = 3
        const VOTE_POWER_BPS_2 = 3000
        const tx = await voting.connect(voter2).voteMultiple(voter2.address, [GAUGE_ID_1, GAUGE_ID_2], [VOTE_POWER_BPS_1, VOTE_POWER_BPS_2]);
        await expect(tx).to.emit(voting, "VoteAdded").withArgs(voter2.address, GAUGE_ID_1, VOTE_POWER_BPS_1);
        await expect(tx).to.emit(voting, "VoteAdded").withArgs(voter2.address, GAUGE_ID_2, VOTE_POWER_BPS_2);
      });
      it("voter should not be able to add additional vote such that total used voting power BPS > 10000", async function () {
        await expect(voting.connect(voter1).vote(voter1.address, 3, 1)).to.be.revertedWith("TotalVotePowerBPSOver10000");
      });
      it("voter cannot use vote to remove a non-existent vote", async function () {
        await expect(voting.connect(voter1).vote(voter1.address, 3, 0)).to.be.revertedWith("EnumerableMap: nonexistent key");
      });
      it("cannot call updateGaugeWeights() before epoch passes", async function () {
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated");
      });
      it("cannot call chargePremiums() before epoch passes", async function () {
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed");
      });
      it("can updateGaugeWeights() in the next epoch", async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("GaugeWeightsNotYetUpdated");
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();

        const tx = await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})
        await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
        LAST_RECORDED_VOTE_POWER_1 = await voting.getVotePower(voter1.address)
        LAST_RECORDED_VOTE_POWER_2 = await voting.getVotePower(voter2.address)

        expect (await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect (await voting.isVotingOpen()).eq(false)
        await expect(voting.connect(voter1).vote(voter1.address, 1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged")
      });
      it("sanity check of gaugeWeights", async function () {
        // 50% votePower from voter1 + 40% votePower from voter2
        const VOTE_POWER_GAUGE_2 = (LAST_RECORDED_VOTE_POWER_1.div(2)).add(LAST_RECORDED_VOTE_POWER_2.mul(4).div(10))
        // 30% votePower from voter2
        const VOTE_POWER_GAUGE_3 = LAST_RECORDED_VOTE_POWER_2.mul(3).div(10)

        const EXPECTED_TOTAL_VOTE_POWER = VOTE_POWER_GAUGE_2.add(VOTE_POWER_GAUGE_3)
        expectClose(await gaugeController.getVotePowerSum(), EXPECTED_TOTAL_VOTE_POWER, 1e14)
        const EXPECTED_GAUGE_2_WEIGHT = SCALE_FACTOR.mul(VOTE_POWER_GAUGE_2).div(EXPECTED_TOTAL_VOTE_POWER)
        const EXPECTED_GAUGE_3_WEIGHT = SCALE_FACTOR.mul(VOTE_POWER_GAUGE_3).div(EXPECTED_TOTAL_VOTE_POWER)
        expect(await gaugeController.getGaugeWeight(1)).eq(0) // Paused gauge
        expectClose(await gaugeController.getGaugeWeight(2), EXPECTED_GAUGE_2_WEIGHT, 1e14)
        expectClose(await gaugeController.getGaugeWeight(3), EXPECTED_GAUGE_3_WEIGHT, 1e14)
        expect(await gaugeController.getAllGaugeWeights()).deep.eq([ZERO, ZERO, EXPECTED_GAUGE_2_WEIGHT, EXPECTED_GAUGE_3_WEIGHT]);
      });
      it("sanity check of relevant gaugeController view functions", async function () {
        expect(await gaugeController.totalGauges()).eq(3)
        expect(await gaugeController.getNumActiveGauges()).eq(2)
        expect(await gaugeController.getNumPausedGauges()).eq(1)
        const voters = await gaugeController.getVoters(voting.address);
        expect(voters.includes(voter1.address)).eq(true)
        expect(voters.includes(voter2.address)).eq(true)
        const votes_1 = await gaugeController.getVotes(voting.address, voter1.address)
        const votes_2 = await gaugeController.getVotes(voting.address, voter2.address)
        expect(votes_1[0].gaugeID).eq(1)
        expect(votes_1[0].votePowerBPS).eq(5000)
        expect(votes_1[1].gaugeID).eq(2)
        expect(votes_1[1].votePowerBPS).eq(5000)
        expect(votes_1.length).eq(2)
        expect(votes_2[0].gaugeID).eq(2)
        expect(votes_2[0].votePowerBPS).eq(4000)
        expect(votes_2[1].gaugeID).eq(3)
        expect(votes_2[1].votePowerBPS).eq(3000)
        expect(votes_2.length).eq(2)
      })
      it("can chargePremiums() in the next epoch", async function () {
        const OLD_VOTER1_LOCKED_AMOUNT = await getTotalLockedAmount(voter1.address)
        const OLD_VOTER2_LOCKED_AMOUNT = await getTotalLockedAmount(voter2.address)
        const OLD_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const OLD_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);

        const tx = await voting.connect(governor).chargePremiums();
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp()
        await expect(tx).to.emit(voting, "AllPremiumsCharged").withArgs(EPOCH_START_TIME)

        const NEW_VOTER1_LOCKED_AMOUNT = await getTotalLockedAmount(voter1.address)
        const NEW_VOTER2_LOCKED_AMOUNT = await getTotalLockedAmount(voter2.address)
        const NEW_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const NEW_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);
        const EXPECTED_PREMIUM_VOTER1 = await getExpectedPremium(voter1.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_1)
        const EXPECTED_PREMIUM_VOTER2 = await getExpectedPremium(voter2.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_2)
        const EXPECTED_TOTAL_PREMIUM = EXPECTED_PREMIUM_VOTER1.add(EXPECTED_PREMIUM_VOTER2)

        expect(NEW_REVENUE_ROUTER_BALANCE.sub(OLD_REVENUE_ROUTER_BALANCE)).eq(EXPECTED_TOTAL_PREMIUM);
        expectClose(NEW_VOTER1_LOCKED_AMOUNT.sub(OLD_VOTER1_LOCKED_AMOUNT),EXPECTED_PREMIUM_VOTER1.mul(-1), 1e15);
        expectClose(NEW_VOTER2_LOCKED_AMOUNT.sub(OLD_VOTER2_LOCKED_AMOUNT), EXPECTED_PREMIUM_VOTER2.mul(-1), 1e15);
        expectClose(NEW_UNDERWRITING_LOCKER_BALANCE.sub(OLD_UNDERWRITING_LOCKER_BALANCE), EXPECTED_TOTAL_PREMIUM.mul(-1), 1e15);
        expect(await voting.isVotingOpen()).eq(true)
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated")
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed")
        expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect(await voting.lastTimePremiumsCharged()).eq(EPOCH_START_TIME)
      });
    });

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * voter1:
     * - votes: gauge1 (50%), gauge2 (50%)
     * - delegate is delegate1
     * - Own lockID 1 (1e18 initial deposit, locked for 1 yr)
     * - Own lockID 2 (1e18 initial deposit, locked for 2 yr)
     * 
     * voter2:
     * - votes: gauge2 (40%), gauge3 (30%)
     * - no delegates
     * - Own lockID 3 (1e18 initial deposit, locked for 3 yr)
     * - Own lockID 4 (1e18 initial deposit, locked for 4 yr)
     * 
     * There are 3 gauges
     * - gauge1 is paused
     * 
     * LockID 5 is burned
     */

    /**********************
      INTENTION STATEMENT 
    **********************/
    /**
     * We will unpause gaugeID 1
     * Delegate 1 will remove voter1's vote for gauge2
     * Voter 2 will remove their vote for gauge 3
     */

    describe("basic removeVote() scenario", () => {
      let LAST_RECORDED_VOTE_POWER_1: BN;
      let LAST_RECORDED_VOTE_POWER_2: BN;

      before(async function () {
        await gaugeController.connect(governor).unpauseGauge(1)
      });
      it("should revert if non-owner or non-delegate attempts to removeVote()", async function () {
        await expect(voting.connect(anon).removeVote(voter1.address, 2)).to.be.revertedWith("NotOwnerNorDelegate");
      });
      it("should revert if attempt to removeVote() for non-existent gaugeID", async function () {
        await expect(voting.connect(voter1).removeVote(voter1.address, 4)).to.be.revertedWith("GaugeIDNotExist");
      });
      it("should revert if attempt to removeVote() for non-existent vote", async function () {
        await expect(voting.connect(voter1).removeVote(voter1.address, 3)).to.be.revertedWith("EnumerableMap: nonexistent key");
      });
      it("delegate can removeVote()", async function () {
        const GAUGE_ID = 2
        const tx = await voting.connect(delegate1).removeVote(voter1.address, GAUGE_ID);
        await expect(tx).to.emit(voting, "VoteRemoved").withArgs(voter1.address, GAUGE_ID);
      })
      it("owner can removeVote()", async function () {
        const GAUGE_ID = 2
        const tx = await voting.connect(voter2).removeVote(voter2.address, GAUGE_ID);
        await expect(tx).to.emit(voting, "VoteRemoved").withArgs(voter2.address, GAUGE_ID);
      })
      it("can removeVote() while gauge paused", async function () {
        const GAUGE_ID = 2
        await voting.connect(voter2).vote(voter2.address, 2, 4000)
        await gaugeController.connect(governor).pauseGauge(2)
        const tx = await voting.connect(voter2).removeVote(voter2.address, GAUGE_ID);
        await expect(tx).to.emit(voting, "VoteRemoved").withArgs(voter2.address, GAUGE_ID);
        await gaugeController.connect(governor).unpauseGauge(2)
      })
      it("updateGaugeWeight() updates gauge weights as expected in the next epoch", async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("GaugeWeightsNotYetUpdated");
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();

        let counter = 0;
        while (true) {
          counter += 1;
          const tx = await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})

          if ((await gaugeController.lastTimeGaugeWeightsUpdated()).lt(EPOCH_START_TIME)) {
            await expect(tx).to.emit(gaugeController, "IncompleteGaugeUpdate");
            continue;
          } else {
            await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
            break;
          }
        }
        console.log(`Required ${counter} iterations of updateGaugeWeights()`)

        LAST_RECORDED_VOTE_POWER_1 = await voting.getVotePower(voter1.address)
        LAST_RECORDED_VOTE_POWER_2 = await voting.getVotePower(voter2.address)

        expect (await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect (await voting.isVotingOpen()).eq(false)
        await expect(voting.connect(voter1).vote(voter1.address, 1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged")
      })
      it("sanity check of gaugeWeights", async function () {
        // 50% votePower from voter1
        const VOTE_POWER_GAUGE_1 = LAST_RECORDED_VOTE_POWER_1.div(2)
        // 30% votePower from voter2
        const VOTE_POWER_GAUGE_3 = LAST_RECORDED_VOTE_POWER_2.mul(3).div(10)

        const EXPECTED_TOTAL_VOTE_POWER = VOTE_POWER_GAUGE_1.add(VOTE_POWER_GAUGE_3)
        expectClose(await gaugeController.getVotePowerSum(), EXPECTED_TOTAL_VOTE_POWER, 1e14)
        const EXPECTED_GAUGE_1_WEIGHT = SCALE_FACTOR.mul(VOTE_POWER_GAUGE_1).div(EXPECTED_TOTAL_VOTE_POWER)
        const EXPECTED_GAUGE_3_WEIGHT = SCALE_FACTOR.mul(VOTE_POWER_GAUGE_3).div(EXPECTED_TOTAL_VOTE_POWER)
        expectClose(await gaugeController.getGaugeWeight(1), EXPECTED_GAUGE_1_WEIGHT, 1e14)
        expect(await gaugeController.getGaugeWeight(2)).eq(0) // No votes
        expectClose(await gaugeController.getGaugeWeight(3), EXPECTED_GAUGE_3_WEIGHT, 1e14)
      });
      it("sanity check of relevant gaugeController view functions", async function () {
        expect(await gaugeController.totalGauges()).eq(3)
        expect(await gaugeController.getNumActiveGauges()).eq(3)
        expect(await gaugeController.getNumPausedGauges()).eq(0)
        const votes_1 = await gaugeController.getVotes(voting.address, voter1.address)
        const votes_2 = await gaugeController.getVotes(voting.address, voter2.address)
        expect(votes_1[0].gaugeID).eq(1)
        expect(votes_1[0].votePowerBPS).eq(5000)
        expect(votes_1.length).eq(1)
        expect(votes_2[0].gaugeID).eq(3)
        expect(votes_2[0].votePowerBPS).eq(3000)
        expect(votes_2.length).eq(1)
      })
      it("chargePremium() charges premiums as expected", async function () {
        const OLD_VOTER1_LOCKED_AMOUNT = await getTotalLockedAmount(voter1.address)
        const OLD_VOTER2_LOCKED_AMOUNT = await getTotalLockedAmount(voter2.address)
        const OLD_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const OLD_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);

        const tx = await voting.connect(governor).chargePremiums();
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp()
        await expect(tx).to.emit(voting, "AllPremiumsCharged").withArgs(EPOCH_START_TIME)

        const NEW_VOTER1_LOCKED_AMOUNT = await getTotalLockedAmount(voter1.address)
        const NEW_VOTER2_LOCKED_AMOUNT = await getTotalLockedAmount(voter2.address)
        const NEW_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const NEW_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);
        const EXPECTED_PREMIUM_VOTER1 = await getExpectedPremium(voter1.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_1)
        const EXPECTED_PREMIUM_VOTER2 = await getExpectedPremium(voter2.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_2)
        const EXPECTED_TOTAL_PREMIUM = EXPECTED_PREMIUM_VOTER1.add(EXPECTED_PREMIUM_VOTER2)

        expectClose(NEW_REVENUE_ROUTER_BALANCE.sub(OLD_REVENUE_ROUTER_BALANCE), EXPECTED_TOTAL_PREMIUM, 1e15);
        expectClose(NEW_VOTER1_LOCKED_AMOUNT.sub(OLD_VOTER1_LOCKED_AMOUNT), EXPECTED_PREMIUM_VOTER1.mul(-1), 1e15);
        expectClose(NEW_VOTER2_LOCKED_AMOUNT.sub(OLD_VOTER2_LOCKED_AMOUNT), EXPECTED_PREMIUM_VOTER2.mul(-1), 1e15);
        expectClose(NEW_UNDERWRITING_LOCKER_BALANCE.sub(OLD_UNDERWRITING_LOCKER_BALANCE), EXPECTED_TOTAL_PREMIUM.mul(-1), 1e15);
        expect(await voting.isVotingOpen()).eq(true)
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated")
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed")
        expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect(await voting.lastTimePremiumsCharged()).eq(EPOCH_START_TIME)
      })
    });

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * voter1:
     * - votes: gauge1 (50%)
     * - delegate is delegate1
     * - Own lockID 1 (1e18 initial deposit, locked for 1 yr)
     * - Own lockID 2 (1e18 initial deposit, locked for 2 yr)
     * 
     * voter2:
     * - votes: gauge3 (30%)
     * - no delegates
     * - Own lockID 3 (1e18 initial deposit, locked for 3 yr)
     * - Own lockID 4 (1e18 initial deposit, locked for 4 yr)
     * 
     * There are 3 gauges
     * - gauge1: 1% ROL
     * - gauge2: 2% ROL
     * - gauge3: 5% ROL
     * 
     * LockID 5 is burned
     */

    /**********************
      INTENTION STATEMENT 
    **********************/
    /**
     * We will re-add the votes that were deleted in the last block (voter1 and voter2 votes for gauge2)
     * We will then removeVoteMultiple() for all of voter1 and voter2 votes
     * We will create 2 more gauges (for a total of 5)
     * We will create 100 locks of maximum duration for 100 new voters, and distribute their votes equally amongst gauges 1-5
     */

    describe("removeVoteMultiple() and stress test with 100 votes", () => {
      let LAST_RECORDED_VOTE_POWER_N: BN;
      let RANDOM_VOTER: Wallet

      before(async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await voting.connect(voter1).vote(voter1.address, 2, 5000);
        await voting.connect(voter2).vote(voter2.address, 2, 4000);
        await gaugeController.connect(governor).addGauge("gauge4", ONE_PERCENT)
        await gaugeController.connect(governor).addGauge("gauge5", ONE_PERCENT)
        for (let i = 0; i < 100; i++) {
          RANDOM_VOTER = ethers.Wallet.createRandom().connect(provider);
          await token.connect(deployer).transfer(RANDOM_VOTER.address, ONE_ETHER) // gas money
          // Can't createLock in parallel or else nonce re-use issue lol
          await underwritingLocker.connect(voter1).createLock(RANDOM_VOTER.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR)
          await deployer.sendTransaction({to: RANDOM_VOTER.address, value: ONE_ETHER.div(10)})
          await voting.connect(RANDOM_VOTER).vote(
            RANDOM_VOTER.address,
            i < 20 ? 1 :
            i < 40 ? 2 :
            i < 60 ? 3 :
            i < 80 ? 4 :
            5
            ,
            10000
          )
        }
        expect(await underwritingLocker.totalNumLocks()).eq(105)
      });
      it("should revert if non-owner or non-delegate attempts to removeVoteMultiple()", async function () {
        await expect(voting.connect(anon).removeVoteMultiple(voter1.address, [1, 2])).to.be.revertedWith("NotOwnerNorDelegate");
      });
      it("should revert if attempt to removeVoteMultiple() for non-existent lockID", async function () {
        await expect(voting.connect(voter1).removeVoteMultiple(voter1.address, [5, 1])).to.be.revertedWith("EnumerableMap: nonexistent key");
      });
      it("delegate can removeVoteMultiple()", async function () {
        const tx = await voting.connect(delegate1).removeVoteMultiple(voter1.address, [1, 2]);
        await expect(tx).to.emit(voting, "VoteRemoved").withArgs(voter1.address, 1);
        await expect(tx).to.emit(voting, "VoteRemoved").withArgs(voter1.address, 2);
      })
      it("voter can removeVoteMultiple()", async function () {
        const tx = await voting.connect(voter2).removeVoteMultiple(voter2.address, [2, 3]);
        await expect(tx).to.emit(voting, "VoteRemoved").withArgs(voter2.address, 2);
        await expect(tx).to.emit(voting, "VoteRemoved").withArgs(voter2.address, 3);
      })
      it("updateGaugeWeight() updates gauge weights as expected in the next epoch", async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("GaugeWeightsNotYetUpdated");
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();

        let counter = 0;
        while (true) {
          counter += 1;
          const tx = await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})

          if ((await gaugeController.lastTimeGaugeWeightsUpdated()).lt(EPOCH_START_TIME)) {
            await expect(tx).to.emit(gaugeController, "IncompleteGaugeUpdate");
            continue;
          } else {
            await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
            break;
          }
        }
        console.log(`Required ${counter} iterations of updateGaugeWeights()`)

        LAST_RECORDED_VOTE_POWER_N = await voting.getVotePower(RANDOM_VOTER.address)
        expect (await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect (await voting.isVotingOpen()).eq(false)
        await expect(voting.connect(voter1).vote(voter1.address, 1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged")
        
        const TOTAL_RECORDED_VOTE_POWER = LAST_RECORDED_VOTE_POWER_N.mul(100)
        // Don't expect exact equality because different votes processed at different timestamp
        expectClose(await gaugeController.getVotePowerSum(), TOTAL_RECORDED_VOTE_POWER, 1e14);
        expectClose(await gaugeController.getGaugeWeight(1), ONE_HUNDRED_PERCENT.div(5), 1e14);
        expectClose(await gaugeController.getGaugeWeight(2), ONE_HUNDRED_PERCENT.div(5), 1e14);
        expectClose(await gaugeController.getGaugeWeight(3), ONE_HUNDRED_PERCENT.div(5), 1e14);
        expectClose(await gaugeController.getGaugeWeight(4), ONE_HUNDRED_PERCENT.div(5), 1e14);
        expectClose(await gaugeController.getGaugeWeight(5), ONE_HUNDRED_PERCENT.div(5), 1e14);
      })
      it("chargePremium() charges premiums as expected", async function () {
        const OLD_VOTER_LOCKED_AMOUNT = await getTotalLockedAmount(RANDOM_VOTER.address)
        const OLD_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const OLD_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);

        const EPOCH_START_TIME = await voting.getEpochStartTimestamp()

        let counter = 0;
        while (true) {
          counter += 1;
          const tx = await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT})

          if ((await voting.lastTimePremiumsCharged()).lt(EPOCH_START_TIME)) {
            await expect(tx).to.emit(voting, "IncompletePremiumsCharge");
            continue;
          } else {
            await expect(tx).to.emit(voting, "AllPremiumsCharged").withArgs(EPOCH_START_TIME);
            break;
          }
        }
        console.log(`Required ${counter} iterations of chargePremiums()`)

        const NEW_VOTER_LOCKED_AMOUNT = await getTotalLockedAmount(RANDOM_VOTER.address)
        const NEW_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const NEW_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);
        const EXPECTED_PREMIUM = await getExpectedPremium(RANDOM_VOTER.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_N)
        const EXPECTED_PREMIUM_UNIT = await getExpectedUnitPremium(RANDOM_VOTER.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_N);
        const EXPECTED_TOTAL_PREMIUM = EXPECTED_PREMIUM_UNIT.mul(200) // 20*1 + 20*1 + 20*1 + 20*2 + 20*5

        expectClose(NEW_REVENUE_ROUTER_BALANCE.sub(OLD_REVENUE_ROUTER_BALANCE), EXPECTED_TOTAL_PREMIUM, 1e15);
        expectClose(NEW_VOTER_LOCKED_AMOUNT.sub(OLD_VOTER_LOCKED_AMOUNT), EXPECTED_PREMIUM.mul(-1), 1e15);
        expectClose(NEW_UNDERWRITING_LOCKER_BALANCE.sub(OLD_UNDERWRITING_LOCKER_BALANCE), EXPECTED_TOTAL_PREMIUM.mul(-1), 1e15);
        expect(await voting.isVotingOpen()).eq(true)
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated")
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed")
        expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect(await voting.lastTimePremiumsCharged()).eq(EPOCH_START_TIME)
      })
    });

    describe("edge case - total vote power BPS cannot > 10000", () => {
      it("should revert if total vote power BPS > 10000", async function () {
        await voting.connect(voter1).voteMultiple(voter1.address, [1, 2], [5000, 5000])
        await expect(voting.connect(voter1).voteMultiple(voter1.address, [2, 3, 4], [0, 2500, 2501])).to.be.revertedWith("TotalVotePowerBPSOver10000")
        await voting.connect(voter1).removeVoteMultiple(voter1.address, [1, 2])
      });
    });

    /**********
      LESSONS
    **********/
    /**
     * We can get through ~80 new votes with updateGaugeWeights() call with 6M gas limit, and about ~140 with chargePremiums() call with 6M gas limit
     * We need to checkpoint before the getVotePower() call, I need to investigate why this can be 50-100K for a view call.
     */

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * voter1:
     * - no votes
     * - delegate is delegate1
     * - Own lockID 1 (1e18 initial deposit, locked for 1 yr)
     * - Own lockID 2 (1e18 initial deposit, locked for 2 yr)
     * 
     * voter2:
     * - no votes
     * - no delegates
     * - Own lockID 3 (1e18 initial deposit, locked for 3 yr)
     * - Own lockID 4 (1e18 initial deposit, locked for 4 yr)
     * 
     * There are 5 gauges
     * - gauge1: 1% ROL
     * - gauge2: 2% ROL
     * - gauge3: 5% ROL
     * - gauge4: 1% ROL
     * - gauge5: 1% ROL
     * 
     * LockID 5 is burned
     */

    /**********************
      INTENTION STATEMENT 
    **********************/
    /**
     * We will test the system at a larger scale
     * We currently have 100 voters with 1 lock each
     * 
     * Let's add another 5 gauges.
     * Let's add the votes of another 100 voters with 1 max-duration lock each, and distribute them equally among these 5 new gauges.
     * 
     * Let's also add another 10 voters, with 10 max-duration locks each, equally distributed among the 10 gauges.
     * 
     * Let's then create another 100 voter who will vote for gauge 1, then lose their voting power after voting (but before vote processing).
     * 
     * I want to test if the system can revert with a out-of-gas error with i.) lots of locks to iterate through, ii.) lot of voters to remove 
     */

    describe("edge case - DDOS scenario with max locks", () => {
      let LAST_RECORDED_VOTE_POWER_N: BN;
      let SAVED_RANDOM_VOTER: Wallet

      before(async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;

        // Create 5 new gauges
        await gaugeController.connect(governor).addGauge("gauge6", ONE_PERCENT)
        await gaugeController.connect(governor).addGauge("gauge7", ONE_PERCENT)
        await gaugeController.connect(governor).addGauge("gauge8", ONE_PERCENT)
        await gaugeController.connect(governor).addGauge("gauge9", ONE_PERCENT)
        await gaugeController.connect(governor).addGauge("gauge10", ONE_PERCENT)

        // Create 100 voters with 1 max-duration locks each, each equally distributed among gauges 6 - 10.
        for (let i = 0; i < 100; i++) {
          const RANDOM_VOTER = ethers.Wallet.createRandom().connect(provider);
          SAVED_RANDOM_VOTER = RANDOM_VOTER;
          await token.connect(deployer).transfer(RANDOM_VOTER.address, ONE_ETHER) // gas money
          // Can't createLock in parallel or else nonce re-use issue lol
          await underwritingLocker.connect(voter1).createLock(RANDOM_VOTER.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR)
          await deployer.sendTransaction({to: RANDOM_VOTER.address, value: ONE_ETHER.div(10)})
          await voting.connect(RANDOM_VOTER).vote(
            RANDOM_VOTER.address,
            i < 20 ? 6 :
            i < 40 ? 7 :
            i < 60 ? 8 :
            i < 80 ? 9 :
            10
            ,
            10000
          )
        }
        expect(await underwritingLocker.totalNumLocks()).eq(205)

        // Create 10 voters with 10 max-duration locks each, each equally distributed among gauges 1 - 10.
        for (let i = 0; i < 10; i++) {
          const RANDOM_VOTER = ethers.Wallet.createRandom().connect(provider);
          await token.connect(deployer).transfer(RANDOM_VOTER.address, ONE_ETHER) // gas money
          // Create 10 locks each
          for (let j = 0; j < 10; j++) {
            await underwritingLocker.connect(voter1).createLock(RANDOM_VOTER.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR)            
          }
          await deployer.sendTransaction({to: RANDOM_VOTER.address, value: ONE_ETHER.div(10)})
          await voting.connect(RANDOM_VOTER).voteMultiple(
            RANDOM_VOTER.address,
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
          )
        }
        expect(await underwritingLocker.totalNumLocks()).eq(305)

        // Create 100 voters with 1 max-duration locks each, all voting for gauge1, all of whom votes will be removed
        // removeVote() will clean the _voters array, _votersToRemove array will fill only with voters who lose all voting 
        // power after voting
        for (let i = 0; i < 100; i++) {
          const RANDOM_VOTER = ethers.Wallet.createRandom().connect(provider);
          await token.connect(deployer).transfer(RANDOM_VOTER.address, ONE_ETHER) // gas money
          // Can't createLock in parallel or else nonce re-use issue lol
          await underwritingLocker.connect(voter1).createLock(RANDOM_VOTER.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR)
          await deployer.sendTransaction({to: RANDOM_VOTER.address, value: ONE_ETHER.div(10)})
          await voting.connect(RANDOM_VOTER).vote(RANDOM_VOTER.address, 1, 10000)
          await underwritingLocker.connect(RANDOM_VOTER).withdraw(306 + i, RANDOM_VOTER.address) // Lose voting power
        }
        expect(await underwritingLocker.totalNumLocks()).eq(405)
      });
      it("updateGaugeWeight() updates gauge weights as expected in the next epoch", async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("GaugeWeightsNotYetUpdated");
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();

        let counter = 0;
        while (true) {
          counter += 1;
          const tx = await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})

          if ((await gaugeController.lastTimeGaugeWeightsUpdated()).lt(EPOCH_START_TIME)) {
            await expect(tx).to.emit(gaugeController, "IncompleteGaugeUpdate");
            continue;
          } else {
            await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
            break;
          }
        }
        console.log(`Required ${counter} iterations of updateGaugeWeights()`)

        LAST_RECORDED_VOTE_POWER_N = await voting.getVotePower(SAVED_RANDOM_VOTER.address)
        expect (await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect (await voting.isVotingOpen()).eq(false)
        await expect(voting.connect(voter1).vote(voter1.address, 1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged")
        
        const EXPECTED_TOTAL_RECORDED_VOTE_POWER = LAST_RECORDED_VOTE_POWER_N.mul(300)
        // Accept 5% error - because first 100 votes from 1 week back
        expect(await gaugeController.getVotePowerSum()).gte(EXPECTED_TOTAL_RECORDED_VOTE_POWER.mul(95).div(100))
        expect(await gaugeController.getVotePowerSum()).lte(EXPECTED_TOTAL_RECORDED_VOTE_POWER.mul(105).div(100))
        expectClose(await gaugeController.getGaugeWeight(1), ONE_HUNDRED_PERCENT.div(10), 2e14);
        expectClose(await gaugeController.getGaugeWeight(2), ONE_HUNDRED_PERCENT.div(10), 2e14);
        expectClose(await gaugeController.getGaugeWeight(3), ONE_HUNDRED_PERCENT.div(10), 2e14);
        expectClose(await gaugeController.getGaugeWeight(4), ONE_HUNDRED_PERCENT.div(10), 2e14);
        expectClose(await gaugeController.getGaugeWeight(5), ONE_HUNDRED_PERCENT.div(10), 2e14);
        expectClose(await gaugeController.getGaugeWeight(6), ONE_HUNDRED_PERCENT.div(10), 2e14);
        expectClose(await gaugeController.getGaugeWeight(7), ONE_HUNDRED_PERCENT.div(10), 2e14);
        expectClose(await gaugeController.getGaugeWeight(8), ONE_HUNDRED_PERCENT.div(10), 2e14);
        expectClose(await gaugeController.getGaugeWeight(9), ONE_HUNDRED_PERCENT.div(10), 2e14);
        expectClose(await gaugeController.getGaugeWeight(10), ONE_HUNDRED_PERCENT.div(10), 2e14);
      })
      it("chargePremium() charges premiums as expected", async function () {
        const OLD_VOTER_LOCKED_AMOUNT = await getTotalLockedAmount(SAVED_RANDOM_VOTER.address)
        const OLD_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const OLD_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);

        const EPOCH_START_TIME = await voting.getEpochStartTimestamp()

        let counter = 0;
        while (true) {
          counter += 1;
          const tx = await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT})

          if ((await voting.lastTimePremiumsCharged()).lt(EPOCH_START_TIME)) {
            await expect(tx).to.emit(voting, "IncompletePremiumsCharge");
            continue;
          } else {
            await expect(tx).to.emit(voting, "AllPremiumsCharged").withArgs(EPOCH_START_TIME);
            break;
          }
        }
        console.log(`Required ${counter} iterations of chargePremiums()`)

        const NEW_VOTER_LOCKED_AMOUNT = await getTotalLockedAmount(SAVED_RANDOM_VOTER.address)
        const NEW_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const NEW_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);
        const EXPECTED_PREMIUM = await getExpectedPremium(SAVED_RANDOM_VOTER.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_N)
        const EXPECTED_PREMIUM_UNIT = await getExpectedUnitPremium(SAVED_RANDOM_VOTER.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_N);
        const EXPECTED_TOTAL_PREMIUM = EXPECTED_PREMIUM_UNIT.mul(450) 
        // 8*20 + 2*20 + 20*5 = 300 for single lock voters
        // 10 * (8 + 2 + 5) = 10 * 15 for 10-lock voters

        expectClose(NEW_REVENUE_ROUTER_BALANCE.sub(OLD_REVENUE_ROUTER_BALANCE), EXPECTED_TOTAL_PREMIUM, 1e15);
        expectClose(NEW_VOTER_LOCKED_AMOUNT.sub(OLD_VOTER_LOCKED_AMOUNT), EXPECTED_PREMIUM.mul(-1), 1e15);
        expectClose(NEW_UNDERWRITING_LOCKER_BALANCE.sub(OLD_UNDERWRITING_LOCKER_BALANCE), EXPECTED_TOTAL_PREMIUM.mul(-1), 1e15);
        expect(await voting.isVotingOpen()).eq(true)
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated")
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed")
        expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect(await voting.lastTimePremiumsCharged()).eq(EPOCH_START_TIME)
      })
    });

    /**********
      LESSONS
    **********/
    /**
     * Need to cap locks for one person - otherwise getVotePower() is an unbounded loop and anyone can deadlock the contract
     * by creating more than 500+ locks. 1 voter with 50 locks => ~750K gas to getVotePower()
     * 
     * Uniswap implementation of sqrt is inefficient - sqrt(6 * 1e18) requiring 35 iterations of Babylonian method => ~30K gas
     * Alternate implementation with bitwise operations = ~700 gas = 40x more efficient. Swapping this implementation of sqrt
     * allows us to process slightly more than 100 new one-lock voters in a 6M gas call.
     * 
     * Arbitrary cap of 10 locks => ~150K gas for updateGaugeWeights(). getVotePower() is an external call to UnderwritingLockVoting
     * And we want to keep layer between locks and votes, hence GaugeController should not need any methods from IUnderwritingLock. 
     * 
     * Balance need to protect against DDOS possibility, against desire to run simple scenarios in a single run. 
     * Mmm, when the system scales, who cares about simple scenarios. Should underweigh the convenience of simple unit tests
     * for durability in scale. Let's make it clear that the updateGaugeWeight() function is intended to be run
     * in a while-loop with custom gas limit of 6M each call.
     * 
     * I'm not as concerned with DDOS from having unbounded number of votes - we can save progress between vote iteration 
     * done in the updateGaugeWeights() function body. We cannot save progress between lock iterations done in an external call.
     * 
     * In terms of DDOS from removing empty voters - it costs ~10K gas for each voter, and we can save progress between iterations. So not an issue.
     * 
     * We need need to test for DDOS from unbounded amount of votes
     * 
     */

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * voter1:
     * - no votes
     * - delegate is delegate1
     * - Own lockID 1 (1e18 initial deposit, locked for 1 yr)
     * - Own lockID 2 (1e18 initial deposit, locked for 2 yr)
     * 
     * voter2:
     * - no votes
     * - no delegates
     * - Own lockID 3 (1e18 initial deposit, locked for 3 yr)
     * - Own lockID 4 (1e18 initial deposit, locked for 4 yr)
     * 
     * There are 10 gauges
     * - gauge1: 1% ROL
     * - gauge2: 2% ROL
     * - gauge3: 5% ROL
     * - gauge4: 1% ROL
     * - gauge5: 1% ROL
     * - gauge6: 1% ROL
     * - gauge7: 1% ROL
     * - gauge8: 1% ROL
     * - gauge9: 1% ROL
     * - gauge10: 1% ROL
     * 
     * LockIDs 5, 306-405 are burned
     * 
     * There are 200 voters with 1 max-duration lock, with votes equally distributed amongst the 10 gauges
     * There are 10 voters with 10 max-duration locks each, equally distributed among the 10 gauges
     */

    /**********************
      INTENTION STATEMENT 
    **********************/
    /**
     * We will add 90 gauges, for a total of 100
     * We will add 10 voters, with 10 max-duration locks each, who equally distribute their votes among the 100 gauges
     * 
     * I want to test how the system does with a larger number of gauges
     */

    describe("edge case - DDOS scenario with 100 gauges", () => {
      let LAST_RECORDED_VOTE_POWER_N: BN;
      let SAVED_RANDOM_VOTER: Wallet

      before(async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;

        // Create 90 new gauges
        for (let i = 0; i < 90; i++) {
          await gaugeController.connect(governor).addGauge(`gauge${i+11}`, ONE_PERCENT)
        }

        const VOTEPOWERBPS_ARRAY = []
        const GAUGEID_ARRAY = []

        for (let i = 0; i < 100; i++) {
          GAUGEID_ARRAY.push(i + 1)
          VOTEPOWERBPS_ARRAY.push(100)
        }

        // Create 10 voters with 10 max-duration locks each, each equally distributed among gauges 1 - 100.
        for (let i = 0; i < 10; i++) {
          const RANDOM_VOTER = ethers.Wallet.createRandom().connect(provider);
          SAVED_RANDOM_VOTER = RANDOM_VOTER;
          await token.connect(deployer).transfer(RANDOM_VOTER.address, ONE_ETHER) // gas money
          // Create 10 locks each
          for (let j = 0; j < 10; j++) {
            await underwritingLocker.connect(voter1).createLock(RANDOM_VOTER.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR)            
          }
          await deployer.sendTransaction({to: RANDOM_VOTER.address, value: ONE_ETHER.div(10)})
          await voting.connect(RANDOM_VOTER).voteMultiple(
            RANDOM_VOTER.address,
            GAUGEID_ARRAY,
            VOTEPOWERBPS_ARRAY,
          )
        }
        expect(await underwritingLocker.totalNumLocks()).eq(505)
      });
      it("updateGaugeWeight() updates gauge weights as expected in the next epoch", async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("GaugeWeightsNotYetUpdated");
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();

        let counter = 0;
        while (true) {
          counter += 1;
          const tx = await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})

          if ((await gaugeController.lastTimeGaugeWeightsUpdated()).lt(EPOCH_START_TIME)) {
            await expect(tx).to.emit(gaugeController, "IncompleteGaugeUpdate");
            continue;
          } else {
            await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
            break;
          }
        }
        console.log(`Required ${counter} iterations of updateGaugeWeights()`)

        LAST_RECORDED_VOTE_POWER_N = await voting.getVotePower(SAVED_RANDOM_VOTER.address)
        expect (await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect (await voting.isVotingOpen()).eq(false)
        await expect(voting.connect(voter1).vote(voter1.address, 1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged")
        
        // SAVED_RANDOM_VOTER here has 10 locks - has 10x the unit votePower
        // So we should have 200 1-lock users + 20 10-lock users => 400 unit votePower
        // So we have 400/10 = 40 of SAVED_RANDOM_VOTER votePower

        // Accept 5% error - because first 100 votes from 1 week back
        // expect(await gaugeController.getVotePowerSum()).gte(EXPECTED_TOTAL_RECORDED_VOTE_POWER.mul(95).div(100))
        // expect(await gaugeController.getVotePowerSum()).lte(EXPECTED_TOTAL_RECORDED_VOTE_POWER.mul(105).div(100))

        // 400 units
        // 200 voters with 200 units => 20 units to each of first 10 gauges
        // 10 voters with 100 units => 10 units to each of first 10 gauges
        // 10 voters with 100 units => 1 unit to each gauge
        // But time decay of vote power

        const OG_GAUGE_WEIGHT = await gaugeController.getGaugeWeight(1);
        expectClose(await gaugeController.getGaugeWeight(2), OG_GAUGE_WEIGHT, 2e14);
        expectClose(await gaugeController.getGaugeWeight(3), OG_GAUGE_WEIGHT, 2e14);
        expectClose(await gaugeController.getGaugeWeight(4), OG_GAUGE_WEIGHT, 2e14);
        expectClose(await gaugeController.getGaugeWeight(5), OG_GAUGE_WEIGHT, 2e14);
        expectClose(await gaugeController.getGaugeWeight(6), OG_GAUGE_WEIGHT, 2e14);
        expectClose(await gaugeController.getGaugeWeight(7), OG_GAUGE_WEIGHT, 2e14);
        expectClose(await gaugeController.getGaugeWeight(8), OG_GAUGE_WEIGHT, 2e14);
        expectClose(await gaugeController.getGaugeWeight(9), OG_GAUGE_WEIGHT, 2e14);
        expectClose(await gaugeController.getGaugeWeight(10), OG_GAUGE_WEIGHT, 2e14);

        for (let i = 11; i < 101; i++) {
          expectClose(await gaugeController.getGaugeWeight(i), (ONE_HUNDRED_PERCENT.sub(OG_GAUGE_WEIGHT.mul(10))).div(90), 2e14);
        }
      })
      it("chargePremium() charges premiums as expected", async function () {
        const OLD_VOTER_LOCKED_AMOUNT = await getTotalLockedAmount(SAVED_RANDOM_VOTER.address)
        const OLD_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const OLD_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);

        const EPOCH_START_TIME = await voting.getEpochStartTimestamp()

        let counter = 0;
        while (true) {
          counter += 1;
          const tx = await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT})

          if ((await voting.lastTimePremiumsCharged()).lt(EPOCH_START_TIME)) {
            await expect(tx).to.emit(voting, "IncompletePremiumsCharge");
            continue;
          } else {
            await expect(tx).to.emit(voting, "AllPremiumsCharged").withArgs(EPOCH_START_TIME);
            break;
          }
        }
        console.log(`Required ${counter} iterations of chargePremiums()`)

        // const NEW_VOTER_LOCKED_AMOUNT = await getTotalLockedAmount(SAVED_RANDOM_VOTER.address)
        // const NEW_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        // const NEW_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);
        // const EXPECTED_PREMIUM = await getExpectedPremium(SAVED_RANDOM_VOTER.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_N)
        // const EXPECTED_PREMIUM_UNIT = await getExpectedUnitPremium(SAVED_RANDOM_VOTER.address, OLD_UNDERWRITING_LOCKER_BALANCE, LAST_RECORDED_VOTE_POWER_N);
      //   const EXPECTED_TOTAL_PREMIUM = EXPECTED_PREMIUM_UNIT.mul(450) 
      //   // 8*20 + 2*20 + 20*5 = 300 for single lock voters
      //   // 10 * (8 + 2 + 5) = 10 * 15 for 10-lock voters

      //   expectClose(NEW_REVENUE_ROUTER_BALANCE.sub(OLD_REVENUE_ROUTER_BALANCE), EXPECTED_TOTAL_PREMIUM, 1e15);
      //   expectClose(NEW_VOTER_LOCKED_AMOUNT.sub(OLD_VOTER_LOCKED_AMOUNT), EXPECTED_PREMIUM.mul(-1), 1e15);
      //   expectClose(NEW_UNDERWRITING_LOCKER_BALANCE.sub(OLD_UNDERWRITING_LOCKER_BALANCE), EXPECTED_TOTAL_PREMIUM.mul(-1), 1e15);
        expect(await voting.isVotingOpen()).eq(true)
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated")
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed")
        expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect(await voting.lastTimePremiumsCharged()).eq(EPOCH_START_TIME)
      })
    });

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * voter1:
     * - no votes
     * - delegate is delegate1
     * - Own lockID 1 (1e18 initial deposit, locked for 1 yr)
     * - Own lockID 2 (1e18 initial deposit, locked for 2 yr)
     * 
     * voter2:
     * - no votes
     * - no delegates
     * - Own lockID 3 (1e18 initial deposit, locked for 3 yr)
     * - Own lockID 4 (1e18 initial deposit, locked for 4 yr)
     * 
     * There are 100 gauges
     * - gauge1: 1% ROL
     * - gauge2: 2% ROL
     * - gauge3: 5% ROL
     * - gauge4: 1% ROL
     * - gauges 5-100: 1% ROL
     * 
     * LockIDs 5, 306-405 are burned
     * 
     * There are 200 voters with 1 max-duration lock, with votes equally distributed amongst the first 10 gauges
     * There are 10 voters with 10 max-duration locks each, equally distributed among the first 10 gauges
     * There are another 10 voters with 10 max-duration locks each, equally distributed among the 100 gauges
     */

    /******************
      HELPER CLOSURES
    ******************/

    async function getTotalLockedAmount(owner: string): Promise<BN> {
      const lockIDs = await underwritingLocker.getAllLockIDsOf(owner);
      let totalLockedAmount = ZERO;
      for (let i = 0; i < lockIDs.length; i++) {
        totalLockedAmount = totalLockedAmount.add((await underwritingLocker.locks(lockIDs[i])).amount);
      }
      return totalLockedAmount;
    }

    async function getExpectedPremium(VOTER_ADDRESS: string, UWE_BALANCE: BN, LAST_RECORDED_VOTE_POWER: BN): Promise<BN> {
      // GLOBAL_MULTIPLIER = INSURANCE_CAPACITY * INDIVIDUAL_VOTE_POWER / TOTAL_VOTE_POWER
      // = LEVERAGE_FACTOR * UWE_BALANCE_OF_UNDERWRITINGLOCKER * INDIVIDUAL_VOTE_POWER / TOTAL_VOTE_POWER
      const LEVERAGE_FACTOR = await gaugeController.leverageFactor();
      const GLOBAL_NUMERATOR = LEVERAGE_FACTOR.mul(UWE_BALANCE).mul(LAST_RECORDED_VOTE_POWER);
      const VOTE_POWER_SUM = await gaugeController.getVotePowerSum();
      const GLOBAL_DENOMINATOR = VOTE_POWER_SUM

      // SCALE ROL => WEEK / (YEAR * 1e18)
      // SCALE BPS => (1 / 10000)
      // SCALE LEVERAGE FACTOR => (1 / 10000)
      const SCALING_NUMERATOR = ONE_WEEK
      const SCALING_DENOMINATOR = SCALE_FACTOR.mul(ONE_YEAR).mul(10000).mul(ONE_ETHER)

      // TOTAL_PREMIUM = GLOBAL_MULTIPLIER * SUM(ROL_GAUGE * ROL_WEIGHT)
      let ACCUMULATOR = ZERO
      const votes = await gaugeController.getVotes(voting.address, VOTER_ADDRESS)

      for (let i = 0; i < votes.length; i++) {
        const {gaugeID, votePowerBPS} = votes[i]
        const ANNUAL_ROL = await gaugeController.getRateOnLineOfGauge(gaugeID);
        ACCUMULATOR = ACCUMULATOR.add(ANNUAL_ROL.mul(votePowerBPS));
      }

      return ACCUMULATOR.mul(GLOBAL_NUMERATOR).mul(SCALING_NUMERATOR).div(GLOBAL_DENOMINATOR).div(SCALING_DENOMINATOR)
    }

    async function getExpectedUnitPremium(VOTER_ADDRESS: string, UWE_BALANCE: BN, LAST_RECORDED_VOTE_POWER: BN): Promise<BN> {
      // GLOBAL_MULTIPLIER = INSURANCE_CAPACITY * INDIVIDUAL_VOTE_POWER / TOTAL_VOTE_POWER
      // = LEVERAGE_FACTOR * UWE_BALANCE_OF_UNDERWRITINGLOCKER * INDIVIDUAL_VOTE_POWER / TOTAL_VOTE_POWER
      const LEVERAGE_FACTOR = await gaugeController.leverageFactor();
      const GLOBAL_NUMERATOR = LEVERAGE_FACTOR.mul(UWE_BALANCE).mul(LAST_RECORDED_VOTE_POWER);
      const VOTE_POWER_SUM = await gaugeController.getVotePowerSum();
      const GLOBAL_DENOMINATOR = VOTE_POWER_SUM

      // SCALE ROL => WEEK / (YEAR * 1e18)
      // SCALE BPS => (1 / 10000)
      // SCALE LEVERAGE FACTOR => (1 / 10000)
      const SCALING_NUMERATOR = ONE_WEEK
      const SCALING_DENOMINATOR = SCALE_FACTOR.mul(ONE_YEAR).mul(10000).mul(ONE_ETHER)

      // TOTAL_PREMIUM = GLOBAL_MULTIPLIER * SUM(ROL_GAUGE * ROL_WEIGHT)
      
      const ACCUMULATOR = ONE_PERCENT.mul(10000)
      return ACCUMULATOR.mul(GLOBAL_NUMERATOR).mul(SCALING_NUMERATOR).div(GLOBAL_DENOMINATOR).div(SCALING_DENOMINATOR)
    }

    function sqrt(x: BN) {
      const ONE = BN.from(1);
      const TWO = BN.from(2);
      let z = x.add(ONE).div(TWO);
      let y = x;
      while (z.sub(y).isNegative()) {
          y = z;
          z = x.div(z).add(z).div(TWO);
      }
      return y;
    }

});