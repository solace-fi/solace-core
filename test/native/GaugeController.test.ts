/// @dev Testing simple setter/getter functions only in this test file.
/// @dev More complex integration tests in `UnderwritingLockVoting.test.ts`

import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, constants, BigNumberish, Wallet, ContractTransaction } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { UnderwritingLocker, UnderwritingLockVoting, Registry, MockErc20Permit, GaugeController } from "../../typechain";
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

describe("GaugeController", function () {
    const [deployer, governor, revenueRouter, voter1, updater, anon] = provider.getWallets();
  
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
          await expect(deployContract(deployer, artifacts.GaugeController, [ZERO_ADDRESS, registry.address])).to.be.revertedWith("zero address governance");
        });
        it("reverts if zero address token", async function () {
          await expect(deployContract(deployer, artifacts.GaugeController, [governor.address, ZERO_ADDRESS])).to.be.revertedWith('ZeroAddressInput("token")');
        });
        it("deploys", async function () {
          gaugeController = (await deployContract(deployer, artifacts.GaugeController, [governor.address, token.address])) as GaugeController;
          await expectDeployed(gaugeController.address);
        });
        it("initializes properly", async function () {
          expect(await gaugeController.token()).eq(token.address);
          expect(await gaugeController.updater()).eq(ZERO_ADDRESS);
          expect(await gaugeController.leverageFactor()).eq(ONE_HUNDRED_PERCENT);
          expect(await gaugeController.totalGauges()).eq(0);
          expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(0);
          expect(await gaugeController.getGaugeWeight(0)).eq(ZERO);
          expect(await gaugeController.getAllGaugeWeights()).deep.eq([ZERO]);
          expect(await gaugeController.getNumActiveGauges()).eq(0);
          expect(await gaugeController.getNumPausedGauges()).eq(0);
          expect(await gaugeController.getGaugeName(0)).eq("");
          expect(await gaugeController.isGaugeActive(0)).eq(false);
          expect(await gaugeController.getRateOnLineOfGauge(0)).eq(0);
          expect(await gaugeController.getVotePowerSum()).eq(0);
        });
        it("getEpochStartTimestamp gets current timestamp rounded down to a multiple of WEEK ", async function () {
          const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
          const EXPECTED_EPOCH_START_TIME = BN.from(CURRENT_TIME).div(ONE_WEEK).mul(ONE_WEEK)
          expect(await gaugeController.getEpochStartTimestamp()).eq(EXPECTED_EPOCH_START_TIME)
        });
        it("getEpochEndTimestamp() == getEpochStartTimestamp() + ONE_WEEK ", async function () {
          expect(await gaugeController.getEpochEndTimestamp()).eq((await gaugeController.getEpochStartTimestamp()).add(ONE_WEEK))
        });
        it("getInsuranceCapacity should revert before tokenholder added", async function () {
          await expect(gaugeController.getInsuranceCapacity()).to.be.revertedWith("NoTokenholdersAdded");
        });
    });

    describe("governance", () => {
      it("starts with the correct governor", async () => {
        expect(await gaugeController.governance()).to.equal(governor.address);
      });
      it("rejects setting new governance by non governor", async  () => {
        await expect(gaugeController.connect(voter1).setPendingGovernance(voter1.address)).to.be.revertedWith("!governance");
      });
      it("can set new governance", async () => {
        let tx = await gaugeController.connect(governor).setPendingGovernance(deployer.address);
        await expect(tx).to.emit(gaugeController, "GovernancePending").withArgs(deployer.address);
        expect(await gaugeController.governance()).to.equal(governor.address);
        expect(await gaugeController.pendingGovernance()).to.equal(deployer.address);
      });
      it("rejects governance transfer by non governor", async () => {
        await expect(gaugeController.connect(voter1).acceptGovernance()).to.be.revertedWith("!pending governance");
      });
      it("can transfer governance", async () => {
        let tx = await gaugeController.connect(deployer).acceptGovernance();
        await expect(tx)
          .to.emit(gaugeController, "GovernanceTransferred")
          .withArgs(governor.address, deployer.address);
        expect(await gaugeController.governance()).to.equal(deployer.address);
        await gaugeController.connect(deployer).setPendingGovernance(governor.address);
        await gaugeController.connect(governor).acceptGovernance();
      });
    });

    describe("addVotingContract", () => {
      it("non governor cannot add new voting contract", async  () => {
        await expect(gaugeController.connect(voter1).addVotingContract(voter1.address)).to.be.revertedWith("!governance");
      });
      it("can add new voting contract", async () => {
        let tx = await gaugeController.connect(governor).addVotingContract(voter1.address);
        await expect(tx).to.emit(gaugeController, "VotingContractAdded").withArgs(voter1.address);
      });
    });

    describe("removeVotingContract", () => {
      it("rejects setting new governance by non governor", async  () => {
        await expect(gaugeController.connect(voter1).removeVotingContract(voter1.address)).to.be.revertedWith("!governance");
      });
      it("cannot remove address, that has not previously been added as voting contract", async  () => {
        await expect(gaugeController.connect(governor).removeVotingContract(deployer.address)).to.be.revertedWith("VotingContractNotAdded");
      });
      it("can remove voting contract", async () => {
        let tx = await gaugeController.connect(governor).removeVotingContract(voter1.address);
        await expect(tx).to.emit(gaugeController, "VotingContractRemoved").withArgs(voter1.address);
      });
    });

    describe("addTokenholder", () => {
      it("non governor cannot add new tokenholder", async  () => {
        await expect(gaugeController.connect(voter1).addTokenholder(voter1.address)).to.be.revertedWith("!governance");
      });
      it("can add new tokenholder", async () => {
        let tx = await gaugeController.connect(governor).addTokenholder(voter1.address);
        await expect(tx).to.emit(gaugeController, "TokenholderAdded").withArgs(voter1.address);
      });
      it("getInsurancePremium() will not throw after tokenholder added", async () => {
        const tx = await gaugeController.getInsuranceCapacity()
      });
    });

    describe("removeTokenholder", () => {
      it("rejects setting new governance by non governor", async  () => {
        await expect(gaugeController.connect(voter1).removeTokenholder(voter1.address)).to.be.revertedWith("!governance");
      });
      it("cannot remove address, that has not previously been added as voting contract", async  () => {
        await expect(gaugeController.connect(governor).removeTokenholder(deployer.address)).to.be.revertedWith("TokenholderNotPresent");
      });
      it("can remove voting contract", async () => {
        let tx = await gaugeController.connect(governor).removeTokenholder(voter1.address);
        await expect(tx).to.emit(gaugeController, "TokenholderRemoved").withArgs(voter1.address);
      });
    });

    describe("setLeverageFactor", () => {
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

    describe("setToken", () => {
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

    describe("setUpdater", () => {
      it("non governor cannot setUpdater", async  () => {
        await expect(gaugeController.connect(voter1).setUpdater(updater.address)).to.be.revertedWith("!governance");
      });
      it("can set updater", async () => {
        let tx = await gaugeController.connect(governor).setUpdater(updater.address);
        await expect(tx).to.emit(gaugeController, "UpdaterSet").withArgs(updater.address);
        expect(await gaugeController.updater()).eq(updater.address)
      });
    });

    describe("setEpochLengthInWeeks", () => {
      it("non governor cannot setEpochLengthInWeeks", async  () => {
        await expect(gaugeController.connect(voter1).setEpochLengthInWeeks(1)).to.be.revertedWith("!governance");
      });
      it("can setEpochLengthInWeeks", async () => {
        let tx = await gaugeController.connect(governor).setEpochLengthInWeeks(2);
        await expect(tx).to.emit(gaugeController, "EpochLengthSet").withArgs(2);
        expect(await gaugeController.getEpochLength()).eq(2 * ONE_WEEK);
        await gaugeController.connect(governor).setEpochLengthInWeeks(1);
        expect(await gaugeController.getEpochLength()).eq(ONE_WEEK);
      });
    });

    describe("addGauge", () => {
      it("non governor cannot add new gauge", async  () => {
        await expect(gaugeController.connect(voter1).addGauge("1", ONE_PERCENT)).to.be.revertedWith("!governance");
      });
      it("can add new gauge", async () => {
        let tx = await gaugeController.connect(governor).addGauge("1", ONE_PERCENT);
        await expect(tx).to.emit(gaugeController, "GaugeAdded").withArgs(1, ONE_PERCENT, "1");
        expect(await gaugeController.totalGauges()).eq(1)
        expect(await gaugeController.getNumActiveGauges()).eq(1)
        expect(await gaugeController.getNumPausedGauges()).eq(0)
        expect(await gaugeController.getGaugeName(1)).eq("1")
        expect(await gaugeController.isGaugeActive(1)).eq(true)
        expect(await gaugeController.getRateOnLineOfGauge(1)).eq(ONE_PERCENT)
        expect(await gaugeController.getGaugeWeight(1)).eq(ZERO)
      });
    });

    describe("pauseGauge", () => {
      it("non governor cannot pause gauge", async  () => {
        await expect(gaugeController.connect(voter1).pauseGauge(1)).to.be.revertedWith("!governance");
      });
      it("cannot pause non-existent gauge", async  () => {
        await expect(gaugeController.connect(governor).pauseGauge(2)).to.be.reverted;
      });
      it("can pause gauge", async () => {
        let tx = await gaugeController.connect(governor).pauseGauge(1);
        await expect(tx).to.emit(gaugeController, "GaugePaused").withArgs(1, "1");
        expect(await gaugeController.totalGauges()).eq(1)
        expect(await gaugeController.getNumActiveGauges()).eq(0)
        expect(await gaugeController.getNumPausedGauges()).eq(1)
        expect(await gaugeController.isGaugeActive(1)).eq(false)
        expect(await gaugeController.getRateOnLineOfGauge(1)).eq(ONE_PERCENT)
        expect(await gaugeController.getGaugeWeight(1)).eq(ZERO)
      });
      it("cannot pause gauge again", async () => {
        await expect(gaugeController.connect(governor).pauseGauge(1)).to.be.revertedWith("GaugeAlreadyPaused");
      });
    });

    describe("unpauseGauge", () => {
      it("non governor cannot unpause gauge", async  () => {
        await expect(gaugeController.connect(voter1).unpauseGauge(1)).to.be.revertedWith("!governance");
      });
      it("cannot unpause non-existent gauge", async  () => {
        await expect(gaugeController.connect(governor).unpauseGauge(2)).to.be.reverted;
      });
      it("cannot unpause gaugeID 0", async  () => {
        await expect(gaugeController.connect(governor).unpauseGauge(0)).to.be.revertedWith("CannotUnpauseGaugeID0")
      });
      it("can unpause gauge", async () => {
        let tx = await gaugeController.connect(governor).unpauseGauge(1);
        await expect(tx).to.emit(gaugeController, "GaugeUnpaused").withArgs(1, "1");
        expect(await gaugeController.totalGauges()).eq(1)
        expect(await gaugeController.getNumActiveGauges()).eq(1)
        expect(await gaugeController.getNumPausedGauges()).eq(0)
        expect(await gaugeController.isGaugeActive(1)).eq(true)
        expect(await gaugeController.getRateOnLineOfGauge(1)).eq(ONE_PERCENT)
        expect(await gaugeController.getGaugeWeight(1)).eq(ZERO)
      });
      it("cannot unpause gauge again", async () => {
        await expect(gaugeController.connect(governor).unpauseGauge(1)).to.be.revertedWith("GaugeAlreadyUnpaused");
      });
    });

    describe("setRateOnLine", () => {
      it("non governor cannot setRateOnLine", async  () => {
        await expect(gaugeController.connect(voter1).setRateOnLine([1], [1])).to.be.revertedWith("!governance");
      });
      it("cannot setRateOnLine of non-existent gauge", async  () => {
        await expect(gaugeController.connect(voter1).setRateOnLine([2], [1])).to.be.revertedWith("!governance");
      });
      it("can set setRateOnLine", async () => {
        let tx = await gaugeController.connect(governor).setRateOnLine([1], [1]);
        await expect(tx).to.emit(gaugeController, "RateOnLineSet").withArgs(1, 1);
        expect(await gaugeController.getRateOnLineOfGauge(1)).eq(1)
        await gaugeController.connect(governor).setRateOnLine([1], [ONE_PERCENT]);
      });
    });

    describe("vote", () => {
      it("cannot be vote for gaugeID 0", async  () => {
        await expect(gaugeController.connect(voter1).vote(voter1.address, 0, 1)).to.be.revertedWith("CannotVoteForGaugeID0");
      });
      it("cannot be called before gauge weight updated", async  () => {
        await expect(gaugeController.connect(voter1).vote(voter1.address, 1, 1)).to.be.revertedWith("GaugeWeightsNotYetUpdated");
      });
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    // voter1 will vote for gaugeID 1 with 100% of vote power

    describe("simple vote() scenario", () => {
      before(async function () {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;

        await registry.connect(governor).set(["uwe"], [token.address]);
        underwritingLocker = (await deployContract(deployer, artifacts.UnderwritingLocker, [governor.address, registry.address])) as UnderwritingLocker;
        await registry.connect(governor).set(["revenueRouter"], [revenueRouter.address]);
        await registry.connect(governor).set(["underwritingLocker"], [underwritingLocker.address]);
        await registry.connect(governor).set(["gaugeController"], [gaugeController.address]);
        voting = (await deployContract(deployer, artifacts.UnderwritingLockVoting, [governor.address, registry.address])) as UnderwritingLockVoting;
        await gaugeController.connect(governor).addTokenholder(underwritingLocker.address)
        await gaugeController.connect(governor).addVotingContract(voting.address)
        await registry.connect(governor).set(["underwritingLockVoting"], [voting.address]);
        await underwritingLocker.connect(governor).setVotingContract()
        await gaugeController.connect(governor).updateGaugeWeights();
        await voting.connect(governor).chargePremiums();
        await token.connect(deployer).transfer(voter1.address, ONE_ETHER.mul(1000))
        await token.connect(voter1).approve(underwritingLocker.address, constants.MaxUint256)
        await underwritingLocker.connect(voter1).createLock(voter1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR)
        await voting.connect(voter1).vote(voter1.address, 1, 10000)
      });
      it("cannot vote for non existent gauge ID", async  () => {
        await expect(gaugeController.connect(voter1).vote(voter1.address, 2, 1)).to.be.revertedWith("GaugeIDNotExist");
      });
      it("will throw if not called by voting contract", async  () => {
        await expect(gaugeController.connect(voter1).vote(voter1.address, 1, 1)).to.be.revertedWith("NotVotingContract");
      });
      it("sanity check of view functions before votes processed", async  () => {
        expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(await gaugeController.getEpochStartTimestamp())
        expect(await gaugeController.getGaugeWeight(1)).eq(0)
        expect(await gaugeController.getAllGaugeWeights()).deep.eq([ZERO, ZERO])
        expect(await gaugeController.getVotePowerSum()).eq(0)
        const votes = await gaugeController.getVotes(voting.address, voter1.address)
        expect(votes.length).eq(1)
        expect(votes[0].gaugeID).eq(1)
        expect(votes[0].votePowerBPS).eq(10000)
        expect(await gaugeController.getVoters(voting.address)).deep.eq([voter1.address])
        expect(await gaugeController.getVoteCount(voting.address, voter1.address)).eq(1)
        expect(await gaugeController.getVotersCount(voting.address)).eq(1)
      });
      it("updater can updateGaugeWeight in next epoch", async  () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        const tx = await gaugeController.connect(updater).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})
        const EPOCH_START_TIME = await gaugeController.getEpochStartTimestamp()
        await expect(tx).to.emit(gaugeController, "GaugeWeightsUpdated").withArgs(EPOCH_START_TIME);
      });
      it("sanity check of view functions after votes processed", async  () => {
        expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(await gaugeController.getEpochStartTimestamp())
        expect(await gaugeController.getGaugeWeight(1)).eq(ONE_HUNDRED_PERCENT)
        expect(await gaugeController.getAllGaugeWeights()).deep.eq([ZERO, ONE_HUNDRED_PERCENT])
        expect(await gaugeController.getVotePowerSum()).eq(await voting.getVotePower(voter1.address))
        const votes = await gaugeController.getVotes(voting.address, voter1.address)
        expect(votes.length).eq(1)
        expect(votes[0].gaugeID).eq(1)
        expect(votes[0].votePowerBPS).eq(10000)
        expect(await gaugeController.getVoters(voting.address)).deep.eq([voter1.address])
        expect(await gaugeController.getVoteCount(voting.address, voter1.address)).eq(1)
        expect(await gaugeController.getVotersCount(voting.address)).eq(1)
      });
    });
});