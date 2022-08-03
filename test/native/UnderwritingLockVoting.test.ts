import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { UnderwritingLocker, UnderwritingLockVoting, Registry, MockErc20Permit, GaugeController } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";
import { expectClose } from "./../utilities/math";

// To-do
// Edge case of lock is burned after voting
// Can we remove dead votes?

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
const WITHDRAW_AMOUNT = ONE_ETHER;
const SCALE_FACTOR = ONE_ETHER;
const ONE_PERCENT = ONE_ETHER.div(100);
const ONE_HUNDRED_PERCENT = ONE_ETHER;

describe("UnderwritingLockVoting", function () {
    const [deployer, governor, revenueRouter, owner1, delegate1, delegate2, anon] = provider.getWallets();
  
    /***************************
       VARIABLE DECLARATIONS
    ***************************/
    let token: MockErc20Permit;
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
      token = (await deployContract(deployer, artifacts.MockERC20Permit, ["Underwriting Equity - Solace Native", "UWE", ONE_MILLION_ETHER, 18])) as MockErc20Permit;

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
          expect(await voting.lastTimePremiumsCharged()).eq(0);
          expect(await voting.isVotingOpen()).eq(false);
          expect(await voting.WEEK()).eq(ONE_WEEK);
          expect(await voting.MONTH()).eq(ONE_MONTH);
          expect(await voting.YEAR()).eq(ONE_YEAR);
        });
        it("getEpochStartTimestamp gets current timestamp rounded down to a multiple of WEEK ", async function () {
          const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
          const EXPECTED_EPOCH_START_TIME = BN.from(CURRENT_TIME).div(ONE_WEEK).mul(ONE_WEEK)
          expect(await voting.getEpochStartTimestamp()).eq(EXPECTED_EPOCH_START_TIME)
        });
        it("getEpochEndTimestamp() == getEpochStartTimestamp() + ONE_WEEK ", async function () {
          expect(await voting.getEpochEndTimestamp()).eq((await voting.getEpochStartTimestamp()).add(ONE_WEEK))
        });
        it("getVotePower should return 0 for a invalid lockID", async function () {
          await expect(underwritingLocker.locks(1)).to.be.revertedWith("query for nonexistent token")
          expect(await voting.getVotePower(1)).eq(0)
        });
        it("getVote should throw before voting contract added to GaugeController.sol", async function () {
          await expect(voting.getVote(1)).to.be.revertedWith("NotVotingContract");
          await gaugeController.connect(governor).addVotingContract(voting.address);
        });
        it("getVote should throw for an invalid lockID", async function () {
          await expect(voting.getVote(1)).to.be.revertedWith("VoteNotFound");
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
          await expect(voting.connect(owner1).setPendingGovernance(owner1.address)).to.be.revertedWith("!governance");
        });
        it("can set new governance", async () => {
          let tx = await voting.connect(governor).setPendingGovernance(deployer.address);
          await expect(tx).to.emit(voting, "GovernancePending").withArgs(deployer.address);
          expect(await voting.governance()).to.equal(governor.address);
          expect(await voting.pendingGovernance()).to.equal(deployer.address);
        });
        it("rejects governance transfer by non governor", async () => {
          await expect(voting.connect(owner1).acceptGovernance()).to.be.revertedWith("!pending governance");
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
          await expect(voting.connect(owner1).setRegistry(registry2.address)).to.be.revertedWith("!governance");
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

    describe("setLockDelegate", () => {
        // Create four locks for owner1, lockID 1 => 1yr, lockID 2 => 2yr, lockID 3 => 3yr, lockID 4 => 4yr
        before(async function () {
            const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
            await token.connect(deployer).transfer(owner1.address, ONE_ETHER.mul(100))
            await token.connect(owner1).approve(underwritingLocker.address, constants.MaxUint256)
            await underwritingLocker.connect(owner1).createLock(owner1.address, DEPOSIT_AMOUNT, CURRENT_TIME + ONE_YEAR);
            await underwritingLocker.connect(owner1).createLock(owner1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 2 * ONE_YEAR);
            await underwritingLocker.connect(owner1).createLock(owner1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 3 * ONE_YEAR);
            await underwritingLocker.connect(owner1).createLock(owner1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR);
            expect(await voting.lockDelegateOf(1)).eq(ZERO_ADDRESS)
            expect(await voting.lockDelegateOf(2)).eq(ZERO_ADDRESS)
            expect(await voting.lockDelegateOf(3)).eq(ZERO_ADDRESS)
            expect(await voting.lockDelegateOf(4)).eq(ZERO_ADDRESS)
        });
        it("cannot set for non-existent lock", async function () {
          await expect(voting.connect(delegate1).setLockDelegate(5, delegate1.address)).to.be.revertedWith("ERC721: invalid token ID");          
        })
        it("non-owner cannot set delegate", async function () {
            await expect(voting.connect(delegate1).setLockDelegate(1, delegate1.address)).to.be.revertedWith("NotOwner");
        })
        it("owner can set delegate", async function () {
            const tx = await voting.connect(owner1).setLockDelegate(1, delegate1.address);
            await expect(tx).to.emit(voting, "LockDelegateSet").withArgs(1, delegate1.address);
            expect(await voting.lockDelegateOf(1)).eq(delegate1.address)
        })
        it("owner can set delegate again", async function () {
            const tx = await voting.connect(owner1).setLockDelegate(1, delegate2.address);
            await expect(tx).to.emit(voting, "LockDelegateSet").withArgs(1, delegate2.address);
            expect(await voting.lockDelegateOf(1)).eq(delegate2.address)
            await voting.connect(owner1).setLockDelegate(1, delegate1.address);
            expect(await voting.lockDelegateOf(1)).eq(delegate1.address)
        })
    });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * There are four locks owned by owner1:
   * lockID 1 => 1e18 locked for 1 yr, managed by delegate1
   * lockID 2 => 1e18 locked for 2 yrs
   * lockID 3 => 1e18 locked for 3 yrs
   * lockID 4 => 1e18 locked for 4 yrs
   */

    describe("setLockDelegateMultiple", () => {
      it("must provide argument arrays of matching length", async function () {
          await expect(voting.connect(owner1).setLockDelegateMultiple([2, 3], [delegate1.address])).to.be.revertedWith("ArrayArgumentsLengthMismatch");
        });
      it("cannot set for non-existent lock", async function () {
        await expect(voting.connect(delegate1).setLockDelegateMultiple([5, 3], [delegate1.address, delegate1.address])).to.be.revertedWith("ERC721: invalid token ID");          
      })
      it("non-owner cannot set delegate", async function () {
          await expect(voting.connect(delegate1).setLockDelegateMultiple([2, 3], [delegate1.address, delegate1.address])).to.be.revertedWith("NotOwner");
      })
      it("owner can set multiple delegate", async function () {
          const tx = await voting.connect(owner1).setLockDelegateMultiple([2, 3], [delegate1.address, delegate1.address]);
          await expect(tx).to.emit(voting, "LockDelegateSet").withArgs(2, delegate1.address);
          await expect(tx).to.emit(voting, "LockDelegateSet").withArgs(3, delegate1.address);
          expect(await voting.lockDelegateOf(2)).eq(delegate1.address)
          expect(await voting.lockDelegateOf(3)).eq(delegate1.address)
      })
      it("owner can set delegate again", async function () {
          const tx = await voting.connect(owner1).setLockDelegateMultiple([2, 3], [delegate2.address, delegate2.address]);
          await expect(tx).to.emit(voting, "LockDelegateSet").withArgs(2, delegate2.address);
          await expect(tx).to.emit(voting, "LockDelegateSet").withArgs(3, delegate2.address);
          expect(await voting.lockDelegateOf(2)).eq(delegate2.address)
          expect(await voting.lockDelegateOf(3)).eq(delegate2.address)
      })
    });

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * There are four locks owned by owner1:
     * lockID 1 => 1e18 locked for 1 yr, managed by delegate1
     * lockID 2 => 1e18 locked for 2 yrs, managed by delegate2
     * lockID 3 => 1e18 locked for 3 yrs, managed by delegate2
     * lockID 4 => 1e18 locked for 4 yrs
     */

    describe("getVotePower() sanity check", () => {
      it("should return appropriate value for 1-yr lock", async function () {
        const LOCK_ID = 1;
        expectClose(await underwritingLocker.timeLeft(LOCK_ID), ONE_YEAR, 1e15)
        // Expect lock multiplier = sqrt(12) / sqrt(6) = sqrt(2)
        const EXPECTED_LOCK_MULTIPLIER = sqrt(SCALE_FACTOR.mul(SCALE_FACTOR).mul(2));
        expectClose(await underwritingLocker.getLockMultiplier(LOCK_ID), EXPECTED_LOCK_MULTIPLIER, 1e15)
        expectClose(await voting.getVotePower(LOCK_ID), EXPECTED_LOCK_MULTIPLIER.mul(DEPOSIT_AMOUNT).div(SCALE_FACTOR), 1e15);
      });
      it("should return appropriate value for 2-yr lock", async function () {
        const LOCK_ID = 2;
        expectClose(await underwritingLocker.timeLeft(LOCK_ID), 2 * ONE_YEAR, 1e15)
        // Expect lock multiplier = sqrt(24) / sqrt(6) = 2
        const EXPECTED_LOCK_MULTIPLIER = SCALE_FACTOR.mul(2);
        expectClose(await underwritingLocker.getLockMultiplier(LOCK_ID), EXPECTED_LOCK_MULTIPLIER, 1e15)
        expectClose(await voting.getVotePower(LOCK_ID), EXPECTED_LOCK_MULTIPLIER.mul(DEPOSIT_AMOUNT).div(SCALE_FACTOR), 1e15);
      });
      it("should return appropriate value for 3-yr lock", async function () {
        const LOCK_ID = 3;
        expectClose(await underwritingLocker.timeLeft(LOCK_ID), 3 * ONE_YEAR, 1e15)
        // Expect lock multiplier = sqrt(36) / sqrt(6) = sqrt(6)
        const EXPECTED_LOCK_MULTIPLIER = sqrt(SCALE_FACTOR.mul(SCALE_FACTOR).mul(6));
        expectClose(await underwritingLocker.getLockMultiplier(LOCK_ID), EXPECTED_LOCK_MULTIPLIER, 1e15)
        expectClose(await voting.getVotePower(LOCK_ID), EXPECTED_LOCK_MULTIPLIER.mul(DEPOSIT_AMOUNT).div(SCALE_FACTOR), 1e15);
      });
      it("should return appropriate value for 4-yr lock", async function () {
        const LOCK_ID = 4;
        expectClose(await underwritingLocker.timeLeft(LOCK_ID), 4 * ONE_YEAR, 1e15)
        // Expect lock multiplier = sqrt(48) / sqrt(6) = sqrt(8)
        const EXPECTED_LOCK_MULTIPLIER = sqrt(SCALE_FACTOR.mul(SCALE_FACTOR).mul(8));
        expectClose(await underwritingLocker.getLockMultiplier(LOCK_ID), EXPECTED_LOCK_MULTIPLIER, 1e15)
        expectClose(await voting.getVotePower(LOCK_ID), EXPECTED_LOCK_MULTIPLIER.mul(DEPOSIT_AMOUNT).div(SCALE_FACTOR), 1e15);
      });
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    // owner1 will vote for gaugeID 1 with lockID 1

    describe("basic vote() scenario", () => {
      let LAST_RECORDED_VOTE_POWER: BN; // To transport VOTE_POWER value from one unit test to another.

      it("vote() and voteMultiple() should throw if gauge weights have not been processed", async function () {
        await expect(voting.connect(owner1).vote(1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged");
        await expect(voting.connect(owner1).voteMultiple([1, 2], [1, 1])).to.be.revertedWith("LastEpochPremiumsNotCharged");
      });
      it("updateGaugeWeights() should revert if non governor", async function () {
        await expect(gaugeController.connect(owner1).updateGaugeWeights()).to.be.revertedWith("!governance");
      });
      it("chargePremiums() should revert if non governor", async function () {
        await expect(voting.connect(owner1).chargePremiums()).to.be.revertedWith("!governance");
      });
      it("chargePremiums() should revert if gauge weights have not been updated", async function () {
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("GaugeWeightsNotYetUpdated");
      });
      it("updateGaugeWeights() should succeed", async function () {
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();
        const tx = await gaugeController.connect(governor).updateGaugeWeights();
        await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
        await expect(tx).to.not.emit(voting, "VoteProcessed");
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
        await expect(voting.connect(owner1).vote(1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged");
        await expect(voting.connect(owner1).voteMultiple([1, 2], [1, 1])).to.be.revertedWith("LastEpochPremiumsNotCharged");
      });
      it("chargePremiums() should succeed", async function () {
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();
        const tx = await voting.connect(governor).chargePremiums();
        await expect(tx).to.emit(voting, "AllPremiumsCharged").withArgs(EPOCH_START_TIME);
        await expect(tx).to.not.emit(voting, "PremiumCharged");
        expect(await voting.lastTimePremiumsCharged()).eq(EPOCH_START_TIME)
      });
      it("isVotingOpen() should return true at this point", async function () {
        expect(await voting.isVotingOpen()).eq(true);
      });
      it("chargePremiums() should revert if attempted again in the same epoch", async function () {
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed");
      });
      it("non-owner or non-delegate cannot vote() or voteMultiple()", async function () {
        await expect(voting.connect(anon).vote(1, 1)).to.be.revertedWith("NotOwnerNorDelegate()");
        await expect(voting.connect(anon).voteMultiple([1, 2], [1, 1])).to.be.revertedWith("NotOwnerNorDelegate");
      });
      it("cannot vote() or voteMultiple() for non-existent lock", async function () {
        await expect(voting.connect(owner1).vote(5, 1)).to.be.revertedWith("ERC721: invalid token ID");
        await expect(voting.connect(owner1).voteMultiple([5, 1], [1, 1])).to.be.revertedWith("ERC721: invalid token ID");
      });
      it("cannot vote() or voteMultiple() for gauge that has not been added", async function () {
        await expect(voting.connect(owner1).vote(1, 1)).to.be.revertedWith("VotedGaugeIDNotExist");
        await expect(voting.connect(owner1).voteMultiple([1, 2], [1, 1])).to.be.revertedWith("VotedGaugeIDNotExist");
      });
      it("cannot vote() or voteMultiple() for gaugeID 0", async function () {
        await expect(voting.connect(owner1).vote(1, 0)).to.be.revertedWith("CannotVoteForGaugeID0");
        await expect(voting.connect(owner1).voteMultiple([1, 2], [0, 0])).to.be.revertedWith("CannotVoteForGaugeID0");
      });
      it("non-governor cannot add gauge", async function () {
        await expect(gaugeController.connect(owner1).addGauge("gauge1", ONE_PERCENT)).to.be.revertedWith("!governance");
      });
      it("governor can add gauge", async function () {
        const tx = await gaugeController.connect(governor).addGauge("gauge1", ONE_PERCENT);
        await expect(tx).to.emit(gaugeController, "GaugeAdded").withArgs(1, ONE_PERCENT, "gauge1");
        expect(await gaugeController.totalGauges()).eq(1)
        expect(await gaugeController.getRateOnLineOfGauge(1)).eq(ONE_PERCENT)
      });
      it("owner can vote", async function () {
        const LOCK_ID = 1;
        const GAUGE_ID = 1;
        const tx = await voting.connect(owner1).vote(LOCK_ID, GAUGE_ID)
        const EPOCH_END_TIME = await voting.getEpochEndTimestamp();
        const VOTE_POWER = await voting.getVotePower(LOCK_ID)
        await expect(tx).to.emit(voting, "Vote").withArgs(LOCK_ID, GAUGE_ID, owner1.address, EPOCH_END_TIME, VOTE_POWER);
        expect(await voting.getVote(LOCK_ID)).eq(GAUGE_ID)
      });
      it("delegate can vote", async function () {
        const LOCK_ID = 1;
        const GAUGE_ID = 1;
        expect(await voting.lockDelegateOf(LOCK_ID)).eq(delegate1.address)
        const tx = await voting.connect(delegate1).vote(LOCK_ID, GAUGE_ID)
        const EPOCH_END_TIME = await voting.getEpochEndTimestamp();
        const VOTE_POWER = await voting.getVotePower(LOCK_ID)
        await expect(tx).to.emit(voting, "Vote").withArgs(LOCK_ID, GAUGE_ID, delegate1.address, EPOCH_END_TIME, VOTE_POWER);
        expect(await voting.getVote(LOCK_ID)).eq(GAUGE_ID)
      });
      it("no premiums should have been collected at this point", async function () {
        expect(await token.balanceOf(revenueRouter.address)).eq(0)
      });
      it("non-governor cannot pause gauge", async function () {
        await expect(gaugeController.connect(owner1).pauseGauge(1)).to.be.revertedWith("!governance");
      });
      it("governor can pause gauge", async function () {
        const tx = await gaugeController.connect(governor).pauseGauge(1);
        await expect(tx).to.emit(gaugeController, "GaugePaused").withArgs(1, "gauge1");
        expect(await gaugeController.totalGauges()).eq(1)
        expect(await gaugeController.getNumPausedGauges()).eq(1)
      });
      it("neither owner nor delegate can vote() or voteMultiple() while gauge paused", async function() {
        await expect(voting.connect(owner1).vote(1, 1)).to.be.revertedWith("VotedGaugeIDPaused");
        await expect(voting.connect(owner1).voteMultiple([1, 2], [1, 1])).to.be.revertedWith("VotedGaugeIDPaused");
        await expect(voting.connect(delegate1).vote(1, 1)).to.be.revertedWith("VotedGaugeIDPaused");
        await expect(voting.connect(delegate1).voteMultiple([1, 2], [1, 1])).to.be.revertedWith("VotedGaugeIDPaused");
        await gaugeController.connect(governor).unpauseGauge(1);
      })
      it("processVotes() should succeed in the next epoch", async function () {
        const LOCK_ID = 1;
        const GAUGE_ID = 1;
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        const tx = await gaugeController.connect(governor).updateGaugeWeights();
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();
        const VOTE_POWER = await voting.getVotePower(LOCK_ID);
        await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
        await expect(tx).to.emit(voting, "VoteProcessed").withArgs(LOCK_ID, GAUGE_ID, EPOCH_START_TIME, VOTE_POWER)
        LAST_RECORDED_VOTE_POWER = VOTE_POWER;
      });
      it("sanity check of gauge weights", async function () {
        expect(await gaugeController.getGaugeWeight(1)).eq(ONE_HUNDRED_PERCENT)
        expect(await gaugeController.getAllGaugeWeights()).deep.eq([ZERO, ONE_HUNDRED_PERCENT]);
        expect(await gaugeController.getVotePowerSum()).eq(LAST_RECORDED_VOTE_POWER)
      });      
      it("cannot vote or voteMultiple, between processVotes() and chargePremiums() for the same epoch", async function () {
        expect(await voting.isVotingOpen()).eq(false)
        await expect(voting.connect(owner1).vote(1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged");
        await expect(voting.connect(delegate1).voteMultiple([1, 2], [1, 1])).to.be.revertedWith("LastEpochPremiumsNotCharged");
      });      
      it("chargePremiums() should revert before underwritingLocker.sol call setVotingContract()", async function () {
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("NotVotingContract");
      });
      it("chargePremiums() should succeed in the next epoch, provided allowance granted by underwritingLocker", async function () {
        await registry.connect(governor).set(["underwritingLockVoting"],[voting.address]);
        await underwritingLocker.connect(governor).setVotingContract();
        await gaugeController.connect(governor).addTokenholder(underwritingLocker.address) // Avoid insurance capacity == 0
        const LOCK_ID = 1;
        const GAUGE_ID = 1;
        const OLD_LOCK_AMOUNT = (await underwritingLocker.locks(LOCK_ID)).amount;
        const OLD_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);

        const tx = await voting.connect(governor).chargePremiums();
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();
        const NEW_LOCK_AMOUNT = (await underwritingLocker.locks(LOCK_ID)).amount;
        const NEW_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);

        // Expect premium = UWE_balance_of_underwritinglocker * leverage * rateOnLine * votePower / votePowerSum
        const LEVERAGE_FACTOR = await gaugeController.leverageFactor();
        const RATE_ON_LINE = await gaugeController.getRateOnLineOfGauge(GAUGE_ID);
        const VOTE_POWER_SUM = await gaugeController.getVotePowerSum();
        const EXPECTED_PREMIUM = OLD_UNDERWRITING_LOCKER_BALANCE.mul(LEVERAGE_FACTOR).mul(RATE_ON_LINE).mul(ONE_WEEK).mul(LAST_RECORDED_VOTE_POWER).div(VOTE_POWER_SUM).div(ONE_YEAR).div(SCALE_FACTOR).div(SCALE_FACTOR)

        await expect(tx).to.emit(voting, "AllPremiumsCharged").withArgs(EPOCH_START_TIME);
        await expect(tx).to.emit(voting, "PremiumCharged").withArgs(LOCK_ID, EPOCH_START_TIME, EXPECTED_PREMIUM);
        expect(await token.balanceOf(revenueRouter.address)).eq(EXPECTED_PREMIUM);
        expect(OLD_LOCK_AMOUNT.sub(NEW_LOCK_AMOUNT)).eq(EXPECTED_PREMIUM);
        expect(OLD_UNDERWRITING_LOCKER_BALANCE.sub(NEW_UNDERWRITING_LOCKER_BALANCE)).eq(EXPECTED_PREMIUM);
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
     * 
     * Most of UWE total supply should be sitting in the lock 
     */

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * There are four locks owned by owner1:
     * lockID 1 => (1e18 - premium) locked for 1 yr, managed by delegate1, has a vote for gaugeID 1
     * lockID 2 => 1e18 locked for 2 yrs, managed by delegate2
     * lockID 3 => 1e18 locked for 3 yrs, managed by delegate2
     * lockID 4 => 1e18 locked for 4 yrs
     * 
     * There is 1 gauge
     * gaugeID 1 => "gauge1" => 100% weight
     * 
     * Votes and premiums have been processed for the last epoch
     * lockID1 has been charged for one epoch
     */

    /**********************
      INTENTION STATEMENT 
    **********************/
    /**
     * We will add 2 more gauges, and create 1 more lock
     * 
     * lockID 1 => keep vote for gaugeID 1 (we will pause this gauge)
     * lockID 2 => will vote for gaugeID 2 (2% ROL)
     * lockID 3 => will vote for gaugeID 3 (5% ROL)
     * lockID 4 => will vote for gaugeID 1 (we will pause this gauge)
     * lockID 5 => will vote for gaugeID 2, will burn this lock after voting, but before it is processed
     */

    describe("basic voteMultiple() scenario", () => {
      let LAST_RECORDED_VOTE_POWER_1: BN;
      let LAST_RECORDED_VOTE_POWER_2: BN;
      let LAST_RECORDED_VOTE_POWER_3: BN;
      let LAST_RECORDED_VOTE_POWER_4: BN;
      let LAST_RECORDED_VOTE_POWER_5: BN;

      // Create new lock
      before(async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await underwritingLocker.connect(owner1).createLock(owner1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR)
      });
      it("should revert if provide mismatching array inputs", async function () {
        await expect(voting.connect(owner1).voteMultiple([1, 2], [1])).to.be.revertedWith("ArrayArgumentsLengthMismatch");
      });
      it("owner should be able to voteMultiple()", async function () {
        const LOCK_ID_1 = 1
        const LOCK_ID_2 = 4
        const GAUGE_ID_1 = 1
        const GAUGE_ID_2 = 1
        const tx = await voting.connect(owner1).voteMultiple([LOCK_ID_1, LOCK_ID_2], [GAUGE_ID_1, GAUGE_ID_2]);
        const EPOCH_END_TIME = await voting.getEpochEndTimestamp()
        const VOTE_POWER_1 = await voting.getVotePower(LOCK_ID_1)
        const VOTE_POWER_2 = await voting.getVotePower(LOCK_ID_2)
        await expect(tx).to.emit(voting, "Vote").withArgs(LOCK_ID_1, GAUGE_ID_1, owner1.address, EPOCH_END_TIME, VOTE_POWER_1);
        await expect(tx).to.emit(voting, "Vote").withArgs(LOCK_ID_2, GAUGE_ID_2, owner1.address, EPOCH_END_TIME, VOTE_POWER_2);

        // Setup state as per intention statement
        await gaugeController.connect(governor).addGauge("gauge2", ONE_PERCENT.mul(2))
        await gaugeController.connect(governor).addGauge("gauge3", ONE_PERCENT.mul(5))
        await gaugeController.connect(governor).pauseGauge(1)
      });
      it("delegate should be able to voteMultiple()", async function () {
        const LOCK_ID_1 = 2
        const LOCK_ID_2 = 3
        const LOCK_ID_3 = 5
        await voting.connect(owner1).setLockDelegateMultiple([LOCK_ID_1, LOCK_ID_2, LOCK_ID_3], [delegate1.address, delegate1.address, delegate1.address])
        const GAUGE_ID_1 = 2
        const GAUGE_ID_2 = 3
        const GAUGE_ID_3 = 2
        const tx = await voting.connect(delegate1).voteMultiple([LOCK_ID_1, LOCK_ID_2, LOCK_ID_3], [GAUGE_ID_1, GAUGE_ID_2, GAUGE_ID_3]);
        const EPOCH_END_TIME = await voting.getEpochEndTimestamp()
        const VOTE_POWER_1 = await voting.getVotePower(LOCK_ID_1)
        const VOTE_POWER_2 = await voting.getVotePower(LOCK_ID_2)
        const VOTE_POWER_3 = await voting.getVotePower(LOCK_ID_3)
        await expect(tx).to.emit(voting, "Vote").withArgs(LOCK_ID_1, GAUGE_ID_1, delegate1.address, EPOCH_END_TIME, VOTE_POWER_1);
        await expect(tx).to.emit(voting, "Vote").withArgs(LOCK_ID_2, GAUGE_ID_2, delegate1.address, EPOCH_END_TIME, VOTE_POWER_2);
        await expect(tx).to.emit(voting, "Vote").withArgs(LOCK_ID_3, GAUGE_ID_3, delegate1.address, EPOCH_END_TIME, VOTE_POWER_3);

        await underwritingLocker.connect(owner1).withdraw(LOCK_ID_3, owner1.address)
      });
      it("cannot call updateGaugeWeights() before epoch passes", async function () {
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated");
      });
      it("cannot call chargePremiums() before epoch passes", async function () {
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed");
      });
      it("can updateGaugeWeights() in the next epoch", async function () {
        const LOCK_ID_1 = 1
        const LOCK_ID_2 = 2
        const LOCK_ID_3 = 3
        const LOCK_ID_4 = 4
        const LOCK_ID_5 = 5
        const VOTE_1 = await voting.getVote(LOCK_ID_1)
        const VOTE_2 = await voting.getVote(LOCK_ID_2)
        const VOTE_3 = await voting.getVote(LOCK_ID_3)
        const VOTE_4 = await voting.getVote(LOCK_ID_4)
        const VOTE_5 = await voting.getVote(LOCK_ID_5)

        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("GaugeWeightsNotYetUpdated");
        const tx1 = await gaugeController.connect(governor).updateGaugeWeights()
        await expect(tx1).to.emit(gaugeController, "GaugeWeightsUpdated");

        const EPOCH_START_TIME = await voting.getEpochStartTimestamp();
        const VOTE_POWER_2 = await voting.getVotePower(LOCK_ID_2);
        const VOTE_POWER_3 = await voting.getVotePower(LOCK_ID_3);
        const VOTE_POWER_5 = await voting.getVotePower(LOCK_ID_5);

        expect(VOTE_POWER_5).eq(0) // lock burned
        await expect(tx1).to.emit(voting, "VoteProcessed").withArgs(LOCK_ID_1, VOTE_1, EPOCH_START_TIME, 0) // gaugeID 1 => paused
        await expect(tx1).to.emit(voting, "VoteProcessed").withArgs(LOCK_ID_2, VOTE_2, EPOCH_START_TIME, VOTE_POWER_2)
        await expect(tx1).to.emit(voting, "VoteProcessed").withArgs(LOCK_ID_3, VOTE_3, EPOCH_START_TIME, VOTE_POWER_3)
        await expect(tx1).to.emit(voting, "VoteProcessed").withArgs(LOCK_ID_4, VOTE_4, EPOCH_START_TIME, 0) // gaugeID 1 => paused gauge
        await expect(tx1).to.emit(voting, "VoteProcessed").withArgs(LOCK_ID_5, VOTE_5, EPOCH_START_TIME, 0) // locked burned
        LAST_RECORDED_VOTE_POWER_1 = ZERO
        LAST_RECORDED_VOTE_POWER_2 = VOTE_POWER_2
        LAST_RECORDED_VOTE_POWER_3 = VOTE_POWER_3
        LAST_RECORDED_VOTE_POWER_4 = ZERO
        LAST_RECORDED_VOTE_POWER_5 = ZERO

        expect (await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect (await voting.isVotingOpen()).eq(false)
        await expect(voting.connect(owner1).vote(1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged")
      });
      it("should have removed vote for burned lock", async function () {
        const BURNED_LOCK_ID = 5
        await expect(voting.getVote(BURNED_LOCK_ID)).to.be.revertedWith("VoteNotFound");
      });
      it("can chargePremiums() in the next epoch", async function () {
        const LOCK_ID_1 = 1
        const LOCK_ID_2 = 2
        const LOCK_ID_3 = 3
        const LOCK_ID_4 = 4
        const LOCK_ID_5 = 4
        const VOTE_1 = await voting.getVote(LOCK_ID_1)
        const VOTE_2 = await voting.getVote(LOCK_ID_2)
        const VOTE_3 = await voting.getVote(LOCK_ID_3)
        const VOTE_4 = await voting.getVote(LOCK_ID_4)
        const OLD_LOCK_AMOUNT_1 = (await underwritingLocker.locks(LOCK_ID_1)).amount;
        const OLD_LOCK_AMOUNT_2 = (await underwritingLocker.locks(LOCK_ID_2)).amount;
        const OLD_LOCK_AMOUNT_3 = (await underwritingLocker.locks(LOCK_ID_3)).amount;
        const OLD_LOCK_AMOUNT_4 = (await underwritingLocker.locks(LOCK_ID_4)).amount;
        const RATE_ON_LINE_1 = await gaugeController.getRateOnLineOfGauge(VOTE_1)
        const RATE_ON_LINE_2 = await gaugeController.getRateOnLineOfGauge(VOTE_2)
        const RATE_ON_LINE_3 = await gaugeController.getRateOnLineOfGauge(VOTE_3)
        const RATE_ON_LINE_4 = await gaugeController.getRateOnLineOfGauge(VOTE_4)
        const OLD_UNDERWRITING_LOCKER_BALANCE = await token.balanceOf(underwritingLocker.address);
        const OLD_REVENUE_ROUTER_BALANCE = await token.balanceOf(revenueRouter.address);

        const tx1 = await voting.connect(governor).chargePremiums();
        const EPOCH_START_TIME = await voting.getEpochStartTimestamp()
        const NEW_LOCK_AMOUNT_1 = (await underwritingLocker.locks(LOCK_ID_1)).amount;
        const NEW_LOCK_AMOUNT_2 = (await underwritingLocker.locks(LOCK_ID_2)).amount;
        const NEW_LOCK_AMOUNT_3 = (await underwritingLocker.locks(LOCK_ID_3)).amount;
        const NEW_LOCK_AMOUNT_4 = (await underwritingLocker.locks(LOCK_ID_4)).amount;
        const NEW_UNDERWRITING_LOCKER_BALANCE_1 = await token.balanceOf(underwritingLocker.address);
        const NEW_REVENUE_ROUTER_BALANCE_1 = await token.balanceOf(revenueRouter.address);

        // Expect premium = UWE_balance_of_underwritinglocker * leverage * rateOnLine * votePower / votePowerSum
        const LEVERAGE_FACTOR = await gaugeController.leverageFactor();
        const VOTE_POWER_SUM = await gaugeController.getVotePowerSum();
        const EXPECTED_PREMIUM_1 = OLD_UNDERWRITING_LOCKER_BALANCE.mul(LEVERAGE_FACTOR).mul(RATE_ON_LINE_1).mul(ONE_WEEK).mul(LAST_RECORDED_VOTE_POWER_1).div(VOTE_POWER_SUM).div(ONE_YEAR).div(SCALE_FACTOR).div(SCALE_FACTOR)
        const EXPECTED_PREMIUM_2 = OLD_UNDERWRITING_LOCKER_BALANCE.mul(LEVERAGE_FACTOR).mul(RATE_ON_LINE_2).mul(ONE_WEEK).mul(LAST_RECORDED_VOTE_POWER_2).div(VOTE_POWER_SUM).div(ONE_YEAR).div(SCALE_FACTOR).div(SCALE_FACTOR)
        const EXPECTED_PREMIUM_3 = OLD_UNDERWRITING_LOCKER_BALANCE.mul(LEVERAGE_FACTOR).mul(RATE_ON_LINE_3).mul(ONE_WEEK).mul(LAST_RECORDED_VOTE_POWER_3).div(VOTE_POWER_SUM).div(ONE_YEAR).div(SCALE_FACTOR).div(SCALE_FACTOR)
        const EXPECTED_PREMIUM_4 = OLD_UNDERWRITING_LOCKER_BALANCE.mul(LEVERAGE_FACTOR).mul(RATE_ON_LINE_4).mul(ONE_WEEK).mul(LAST_RECORDED_VOTE_POWER_4).div(VOTE_POWER_SUM).div(ONE_YEAR).div(SCALE_FACTOR).div(SCALE_FACTOR)
        expect(EXPECTED_PREMIUM_1).eq(0); // Paused gauge
        expect(EXPECTED_PREMIUM_4).eq(0); // Paused gauge
        const TOTAL_EXPECTED_PREMIUM_CHARGED = EXPECTED_PREMIUM_1.add(EXPECTED_PREMIUM_2).add(EXPECTED_PREMIUM_3).add(EXPECTED_PREMIUM_4)

        await expect(tx1).to.not.emit(voting, "AllPremiumsCharged")
        await expect(tx1).to.emit(voting, "PremiumCharged").withArgs(LOCK_ID_1, EPOCH_START_TIME, EXPECTED_PREMIUM_1);
        await expect(tx1).to.emit(voting, "PremiumCharged").withArgs(LOCK_ID_2, EPOCH_START_TIME, EXPECTED_PREMIUM_2);
        await expect(tx1).to.emit(voting, "PremiumCharged").withArgs(LOCK_ID_3, EPOCH_START_TIME, EXPECTED_PREMIUM_3);
        await expect(tx1).to.emit(voting, "PremiumCharged").withArgs(LOCK_ID_4, EPOCH_START_TIME, EXPECTED_PREMIUM_4);
        expect(OLD_LOCK_AMOUNT_1.sub(NEW_LOCK_AMOUNT_1)).eq(EXPECTED_PREMIUM_1);
        expect(OLD_LOCK_AMOUNT_2.sub(NEW_LOCK_AMOUNT_2)).eq(EXPECTED_PREMIUM_2);
        expect(OLD_LOCK_AMOUNT_3.sub(NEW_LOCK_AMOUNT_3)).eq(EXPECTED_PREMIUM_3);
        expect(OLD_LOCK_AMOUNT_4.sub(NEW_LOCK_AMOUNT_4)).eq(EXPECTED_PREMIUM_4);
        expect(NEW_UNDERWRITING_LOCKER_BALANCE_1).eq(OLD_UNDERWRITING_LOCKER_BALANCE);
        expect(NEW_REVENUE_ROUTER_BALANCE_1).eq(OLD_REVENUE_ROUTER_BALANCE);

        // Should not be able to vote or updateGaugeWeights in this incomplete chargePremiums() state
        expect(await voting.isVotingOpen()).eq(false)
        await expect (voting.connect(owner1).vote(1, 1)).to.be.revertedWith("LastEpochPremiumsNotCharged")
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated")

        const tx2 = await voting.connect(governor).chargePremiums();
        const NEW_UNDERWRITING_LOCKER_BALANCE_2 = await token.balanceOf(underwritingLocker.address);
        const NEW_REVENUE_ROUTER_BALANCE_2 = await token.balanceOf(revenueRouter.address);
        await expect(tx2).to.emit(voting, "AllPremiumsCharged")
        await expect(tx1).to.emit(voting, "PremiumCharged").withArgs(LOCK_ID_5, EPOCH_START_TIME, 0); // Burned lock ID
        expect(NEW_UNDERWRITING_LOCKER_BALANCE_2.sub(OLD_UNDERWRITING_LOCKER_BALANCE)).eq(TOTAL_EXPECTED_PREMIUM_CHARGED.mul(-1));
        expect(NEW_REVENUE_ROUTER_BALANCE_2.sub(OLD_REVENUE_ROUTER_BALANCE)).eq(TOTAL_EXPECTED_PREMIUM_CHARGED);

        // Can vote again
        expect(await voting.isVotingOpen()).eq(true)
        await expect(gaugeController.connect(governor).updateGaugeWeights()).to.be.revertedWith("GaugeWeightsAlreadyUpdated")
        await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochPremiumsAlreadyProcessed")
        expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(EPOCH_START_TIME)
        expect(await voting.lastTimePremiumsCharged()).eq(EPOCH_START_TIME)
      });

    });

    /**********
      LESSONS
    **********/
    /**
     * You should customise gas limit to max for underwritingLockVoting.chargePremiums() and gaugeController.updateGaugeWeights()
     */

    // Need to test behaviour with 100 votes



    /******************
      HELPER CLOSURES
    ******************/

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