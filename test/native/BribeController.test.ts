import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, constants, BigNumberish, Wallet, ContractTransaction } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { UnderwritingLocker, UnderwritingLockVoting, Registry, MockErc20PermitWithBurn, GaugeController, BribeController } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";
import { expectClose } from "../utilities/math";

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
const BRIBE_AMOUNT = ONE_ETHER.mul(100);
const SCALE_FACTOR = ONE_ETHER;
const ONE_PERCENT = ONE_ETHER.div(100);
const ONE_HUNDRED_PERCENT = ONE_ETHER;
const CUSTOM_GAS_LIMIT = 6000000;

describe("BribeController", function () {
    const [deployer, governor, revenueRouter, voter1, voter2, delegate1, updater, briber1, anon] = provider.getWallets();
  
    /***************************
       VARIABLE DECLARATIONS
    ***************************/
    let token: MockErc20PermitWithBurn;
    let bribeToken1: MockErc20PermitWithBurn;
    let bribeToken2: MockErc20PermitWithBurn;
    let registry: Registry;
    let underwritingLocker: UnderwritingLocker;
    let gaugeController: GaugeController;
    let voting: UnderwritingLockVoting;
    let bribeController: BribeController;
    let artifacts: ArtifactImports;
    let snapshot: BN;

    before(async function () {
        artifacts = await import_artifacts();
        snapshot = await provider.send("evm_snapshot", []);
        await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
        
        // Deploy $UWE, and mint 1M $UWE to deployer
        token = (await deployContract(deployer, artifacts.MockERC20PermitWithBurn, ["Underwriting Equity - Solace Native", "UWE", ONE_MILLION_ETHER, 18])) as MockErc20PermitWithBurn;
  
        // Deploy bribe tokens
        bribeToken1 = (await deployContract(deployer, artifacts.MockERC20PermitWithBurn, ["BribeToken1", "bt1", ONE_MILLION_ETHER, 18])) as MockErc20PermitWithBurn;
        bribeToken2 = (await deployContract(deployer, artifacts.MockERC20PermitWithBurn, ["BribeToken2", "bt2", ONE_MILLION_ETHER, 18])) as MockErc20PermitWithBurn;

        // Deploy registry
        registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    });
    
    after(async function () {
      await provider.send("evm_revert", [snapshot]);
    });

    describe("deployment", function () {
        it("reverts if zero address governance", async function () {
          await expect(deployContract(deployer, artifacts.BribeController, [ZERO_ADDRESS, registry.address])).to.be.revertedWith("zero address governance");
        });
        it("reverts if zero address registry", async function () {
          await expect(deployContract(deployer, artifacts.BribeController, [governor.address, ZERO_ADDRESS])).to.be.revertedWith('ZeroAddressInput("registry")');
        });
        it("reverts if zero address gaugeController in Registry", async function () {
          await expect(deployContract(deployer, artifacts.BribeController, [governor.address, registry.address])).to.be.revertedWith('ZeroAddressInput("gaugeController")');
          await registry.connect(governor).set(["revenueRouter"], [revenueRouter.address]);
          gaugeController = (await deployContract(deployer, artifacts.GaugeController, [governor.address, token.address])) as GaugeController;
          await expectDeployed(gaugeController.address);
          await registry.connect(governor).set(["gaugeController"], [gaugeController.address]);
        });
        it("reverts if zero address underwritingLockVoting in Registry", async function () {
          await expect(deployContract(deployer, artifacts.BribeController, [governor.address, registry.address])).to.be.revertedWith('ZeroAddressInput("underwritingLockVoting")');
          await registry.connect(governor).set(["uwe"], [token.address]);
          underwritingLocker = (await deployContract(deployer, artifacts.UnderwritingLocker, [governor.address, registry.address])) as UnderwritingLocker;
          await expectDeployed(underwritingLocker.address);
          await registry.connect(governor).set(["underwritingLocker"], [underwritingLocker.address]);
          voting = (await deployContract(deployer, artifacts.UnderwritingLockVoting, [governor.address, registry.address])) as UnderwritingLockVoting;
          await expectDeployed(voting.address);
          await registry.connect(governor).set(["underwritingLockVoting"], [voting.address]);
        });
        it("deploys", async function () {
          bribeController = (await deployContract(deployer, artifacts.BribeController, [governor.address, registry.address])) as BribeController;
          await expectDeployed(bribeController.address);
        });
        it("initializes properly", async function () {
          expect(await bribeController.registry()).eq(registry.address);
          expect(await bribeController.gaugeController()).eq(gaugeController.address);
          expect(await bribeController.revenueRouter()).eq(revenueRouter.address);
          expect(await bribeController.votingContract()).eq(voting.address);
          expect(await bribeController.updater()).eq(ZERO_ADDRESS);
          expect(await bribeController.lastTimeBribesProcessed()).eq(await bribeController.getEpochStartTimestamp());
          expect(await bribeController.getBribeTokenWhitelist()).deep.eq([]);
          expect(await bribeController.getClaimableBribes(voter1.address)).deep.eq([]);
          expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(10000);
          expect(await bribeController.getAllGaugesWithBribe()).deep.eq([]);
          expect(await bribeController.getProvidedBribesForGauge(1)).deep.eq([]);
          expect(await bribeController.getLifetimeProvidedBribes(briber1.address)).deep.eq([]);
          expect(await bribeController.getVotesForVoter(voter1.address)).deep.eq([]);
          expect(await bribeController.getVotesForGauge(1)).deep.eq([]);
          expect(await bribeController.isBribingOpen()).eq(true);
        });
        it("getEpochStartTimestamp gets current timestamp rounded down to a multiple of WEEK ", async function () {
          const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
          const EXPECTED_EPOCH_START_TIME = BN.from(CURRENT_TIME).div(ONE_WEEK).mul(ONE_WEEK)
          expect(await gaugeController.getEpochStartTimestamp()).eq(EXPECTED_EPOCH_START_TIME)
        });
        it("getEpochEndTimestamp() == getEpochStartTimestamp() + ONE_WEEK ", async function () {
          expect(await gaugeController.getEpochEndTimestamp()).eq((await gaugeController.getEpochStartTimestamp()).add(ONE_WEEK))
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

    describe("setRegistry", () => {
      let registry2: Registry;
      const RANDOM_ADDRESS_1 = ethers.Wallet.createRandom().connect(provider).address;
      const RANDOM_ADDRESS_2 = ethers.Wallet.createRandom().connect(provider).address;
      const RANDOM_ADDRESS_3 = ethers.Wallet.createRandom().connect(provider).address;
  
      before(async function () {
        registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      });
      it("reverts if not governor", async function () {
        await expect(bribeController.connect(voter1).setRegistry(registry2.address)).to.be.revertedWith("!governance");
      })
      it("reverts if zero address registry", async function () {
        await expect(bribeController.connect(governor).setRegistry(ZERO_ADDRESS)).to.be.revertedWith('ZeroAddressInput("registry")');
      });
      it("reverts if zero address gaugeController in Registry", async function () {
        await expect(bribeController.connect(governor).setRegistry(registry2.address)).to.be.revertedWith('ZeroAddressInput("gaugeController")');
        await registry2.connect(governor).set(["gaugeController"], [RANDOM_ADDRESS_1]);
      });
      it("reverts if zero address underwritingLockVoting in Registry", async function () {
        await expect(bribeController.connect(governor).setRegistry(registry2.address)).to.be.revertedWith('ZeroAddressInput("underwritingLockVoting")');
        await registry2.connect(governor).set(["underwritingLockVoting"], [RANDOM_ADDRESS_2]);
      })
      it("reverts if zero address revenueRouter in Registry", async function () {
        await expect(bribeController.connect(governor).setRegistry(registry2.address)).to.be.revertedWith('ZeroAddressInput("revenueRouter")');
        await registry2.connect(governor).set(["revenueRouter"], [RANDOM_ADDRESS_3]);
      })
      it("sets registry", async function () {
        const tx = await bribeController.connect(governor).setRegistry(registry2.address);
        await expect(tx).to.emit(bribeController, "RegistrySet").withArgs(registry2.address);
      });
      it("copies Registry addresses to own state variables", async function () {
        expect(await bribeController.registry()).eq(registry2.address);
        expect(await bribeController.gaugeController()).eq(RANDOM_ADDRESS_1);
        expect(await bribeController.votingContract()).eq(RANDOM_ADDRESS_2);
        expect(await bribeController.revenueRouter()).eq(RANDOM_ADDRESS_3);
      });
      after(async function () {
        await bribeController.connect(governor).setRegistry(registry.address);
      });
    });

    describe("setUpdater", () => {
      it("non governor cannot setUpdater", async  () => {
        await expect(bribeController.connect(voter1).setUpdater(updater.address)).to.be.revertedWith("!governance");
      });
      it("can set updater", async () => {
        let tx = await bribeController.connect(governor).setUpdater(updater.address);
        await expect(tx).to.emit(bribeController, "UpdaterSet").withArgs(updater.address);
        expect(await bribeController.updater()).eq(updater.address)
      });
    });

    describe("addBribeToken", () => {
      it("non governor cannot add new bribe token", async  () => {
        await expect(bribeController.connect(voter1).addBribeToken(bribeToken1.address)).to.be.revertedWith("!governance");
      });
      it("can add new bribe token", async () => {
        let tx = await bribeController.connect(governor).addBribeToken(bribeToken1.address);
        await expect(tx).to.emit(bribeController, "BribeTokenAdded").withArgs(bribeToken1.address);
        expect(await bribeController.getBribeTokenWhitelist()).deep.eq([bribeToken1.address]);
        await bribeController.connect(governor).addBribeToken(bribeToken2.address);
        expect(await bribeController.getBribeTokenWhitelist()).deep.eq([bribeToken1.address, bribeToken2.address]);
      });
    });

    describe("removeBribeToken", () => {
      it("non governor cannot remove bribe token", async  () => {
        await expect(bribeController.connect(voter1).removeBribeToken(bribeToken1.address)).to.be.revertedWith("!governance");
      });
      it("cannot remove a token that has not been previously added as a bribe token", async  () => {
        await expect(bribeController.connect(governor).removeBribeToken(deployer.address)).to.be.revertedWith("BribeTokenNotAdded");
      });
      it("can remove bribe token", async () => {
        let tx = await bribeController.connect(governor).removeBribeToken(bribeToken2.address);
        await expect(tx).to.emit(bribeController, "BribeTokenRemoved").withArgs(bribeToken2.address);
        expect(await bribeController.getBribeTokenWhitelist()).deep.eq([bribeToken1.address]);
        await bribeController.connect(governor).addBribeToken(bribeToken2.address);
        expect(await bribeController.getBribeTokenWhitelist()).deep.eq([bribeToken1.address, bribeToken2.address]);
      });
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    // briber1 will provide 100 of bribeToken1 and 100 of bribeToken2 as a bribe for gauge 1
    // create gauge2

    describe("provideBribe", () => {
      it("will throw if bribeToken and bribeAmount arrays mismatched", async  () => {
        await expect(bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [1], 1)).to.be.revertedWith("ArrayArgumentsLengthMismatch");
      });
      it("will throw if bribe for paused gauge", async  () => {
        await expect(bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [1, 1], 0)).to.be.revertedWith("CannotBribeForInactiveGauge");
      });
      it("will throw if bribe for non-existent gauge", async  () => {
        await expect(bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [1, 1], 1)).to.be.revertedWith("CannotBribeForNonExistentGauge");
        await gaugeController.connect(governor).addGauge("1", ONE_PERCENT);
        await gaugeController.connect(governor).addGauge("2", ONE_PERCENT);
      });
      it("will throw if bribe for non-whitelisted token", async  () => {
        await expect(bribeController.connect(briber1).provideBribes([token.address, bribeToken2.address], [1, 1], 1)).to.be.revertedWith("CannotBribeWithNonWhitelistedToken");
      });
      it("can provide bribe", async  () => {
        const GAUGE_ID = BN.from("1")
        await bribeToken1.connect(deployer).transfer(briber1.address, ONE_ETHER.mul(10000));
        await bribeToken2.connect(deployer).transfer(briber1.address, ONE_ETHER.mul(10000));
        await bribeToken1.connect(briber1).approve(bribeController.address, constants.MaxUint256);
        await bribeToken2.connect(briber1).approve(bribeController.address, constants.MaxUint256);

        const OLD_BRIBER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(briber1.address)
        const OLD_BRIBER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(briber1.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const tx = await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], GAUGE_ID)
        await expect(tx).to.emit(bribeController, "BribeProvided").withArgs(briber1.address, GAUGE_ID, bribeToken1.address, BRIBE_AMOUNT);
        await expect(tx).to.emit(bribeController, "BribeProvided").withArgs(briber1.address, GAUGE_ID, bribeToken2.address, BRIBE_AMOUNT);

        const NEW_BRIBER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(briber1.address)
        const NEW_BRIBER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(briber1.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const BRIBER_BALANCE_BRIBE_TOKEN_1_CHANGE = NEW_BRIBER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBER_BALANCE_BRIBE_TOKEN_1)
        const BRIBER_BALANCE_BRIBE_TOKEN_2_CHANGE = NEW_BRIBER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBER_BALANCE_BRIBE_TOKEN_2)
        const BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1_CHANGE = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2_CHANGE = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
        expect(BRIBER_BALANCE_BRIBE_TOKEN_1_CHANGE).eq(BRIBE_AMOUNT.mul(-1))
        expect(BRIBER_BALANCE_BRIBE_TOKEN_2_CHANGE).eq(BRIBE_AMOUNT.mul(-1))
        expect(BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1_CHANGE).eq(BRIBE_AMOUNT)
        expect(BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2_CHANGE).eq(BRIBE_AMOUNT)
        
        const lifetimeBribes = await bribeController.getLifetimeProvidedBribes(briber1.address);
        expect(lifetimeBribes[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(lifetimeBribes[1].bribeAmount).eq(BRIBE_AMOUNT)
        expect(lifetimeBribes[0].bribeToken).eq(bribeToken1.address)
        expect(lifetimeBribes[1].bribeToken).eq(bribeToken2.address)

        const bribes = await bribeController.getProvidedBribesForGauge(1);
        expect(bribes[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes[1].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes[0].bribeToken).eq(bribeToken1.address)
        expect(bribes[1].bribeToken).eq(bribeToken2.address)

        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([GAUGE_ID]);
      });
      it("claimBribes does not revert, but does not do anything", async  () => {
        const tx = await bribeController.connect(voter1).claimBribes();
        await expect(tx).to.not.emit(bribeController, "BribeClaimed")
      });
    });

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * gaugeID 1 => 100 of bribeToken1 and 100 and bribeToken2 provided for the current epoch
     * gaugeID 2 => No bribes
     */

    /*********************
      INTENTION STATEMENT 
    *********************/
    /**
     * voter1 will create lockID 1, and make allocate votePowerBPS:
     * gaugeID 1 => 1000
     * gaugeID 2 => 9000
     */

    describe("voteForBribe", () => {
      before(async function () {
        await gaugeController.connect(governor).addVotingContract(voting.address)
      });
      it("will throw if called by non-lock owner or delegate", async  () => {
        await expect(bribeController.connect(briber1).voteForBribe(voter1.address, 1, 10000)).to.be.revertedWith("NotOwnerNorDelegate");
      });
      it("will throw if voter has no locks", async  () => {
        await expect(bribeController.connect(voter1).voteForBribe(voter1.address, 1, 10000)).to.be.revertedWith("VoterHasNoLocks");
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await token.connect(deployer).approve(underwritingLocker.address, constants.MaxUint256);
        await underwritingLocker.connect(deployer).createLock(voter1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR);
      });
      it("will throw if voteForBribe for gauge with no bribe", async  () => {
        await expect(bribeController.connect(voter1).voteForBribe(voter1.address, 2, 10000)).to.be.revertedWith("NoBribesForSelectedGauge");
      });
      it("will throw if bribeController not set in voting contract", async  () => {
        await expect(bribeController.connect(voter1).voteForBribe(voter1.address, 1, 10000)).to.be.revertedWith("NotOwnerNorDelegate");
      });
      it("will throw if voteForBribe for more than unused votepower", async  () => {
        await voting.connect(voter1).vote(voter1.address, 2, 9000);
        await registry.connect(governor).set(["bribeController"], [bribeController.address]);
        await voting.connect(governor).setBribeController();
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(1000);
        await expect(bribeController.connect(voter1).voteForBribe(voter1.address, 1, 10000)).to.be.revertedWith("TotalVotePowerBPSOver10000");
      });
      it("can voteForBribe", async  () => {
        const tx = await bribeController.connect(voter1).voteForBribe(voter1.address, 1, 1000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter1.address, 1, 1000);
        const vote = await bribeController.getVotesForVoter(voter1.address);
        expect(vote[0].gaugeID).eq(1)
        expect(vote[0].votePowerBPS).eq(1000)
        const voteForBribe = await bribeController.getVotesForGauge(1);
        expect(voteForBribe[0].voter).eq(voter1.address)
        expect(voteForBribe[0].votePowerBPS).eq(1000)
      });
    });

    /*******************
      STATE SUMMARY
    *******************/
    /**
     * Vote state:
     * voter1 has lockID 1, and allocated votes
     * gaugeID 1 => 1000, gaugeID 2 => 9000
     * 
     * Bribe state:
     * gaugeID 1 => 100 of bribeToken1 and 100 and bribeToken2 provided for the current epoch
     * gaugeID 2 => No bribes
     */

    describe("processBribes", () => {
      before(async function () {
        await underwritingLocker.connect(governor).setVotingContract()
        await gaugeController.connect(governor).addTokenholder(underwritingLocker.address)
      });
      it("will throw if called by non-governor or non-updater", async  () => {
        await expect(bribeController.connect(briber1).processBribes()).to.be.revertedWith("NotUpdaterNorGovernance");
      });
      it("will throw if called in same epoch as contract deployment", async  () => {
        await expect(bribeController.connect(governor).processBribes()).to.be.revertedWith("BribesAlreadyProcessed");
      });
      it("will throw in next epoch if gauge weights not yet updated", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await expect(bribeController.connect(governor).processBribes()).to.be.revertedWith("LastEpochPremiumsNotCharged");
        await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})
      });
      it("will throw in next epoch if premiums not yet charged", async () => {
        await expect(bribeController.connect(governor).processBribes()).to.be.revertedWith("LastEpochPremiumsNotCharged");
        await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT})
      });
      it("cannot vote or remove vote in next epoch, before bribes processed", async () => {
        await expect(bribeController.connect(voter1).voteForBribe(voter1.address, 1, 1000)).to.be.revertedWith("LastEpochBribesNotProcessed");
        await expect(bribeController.connect(voter1).removeVoteForBribe(voter1.address, 1)).to.be.revertedWith("LastEpochBribesNotProcessed");
      });
      it("updater can process bribes", async () => {
        const EPOCH_START_TIMESTAMP = await bribeController.getEpochStartTimestamp();
        const tx = await bribeController.connect(governor).processBribes({gasLimit: CUSTOM_GAS_LIMIT});
        await expect(tx).to.emit(bribeController, "BribesProcessed").withArgs(EPOCH_START_TIMESTAMP);
        expect(await bribeController.lastTimeBribesProcessed()).eq(EPOCH_START_TIMESTAMP);
        expect(await bribeController.isBribingOpen()).eq(true);
      });
      it("Mappings storing votes and provided bribes should be empty after bribes processing", async () => {
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(1)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter1.address)).deep.eq([])
        expect(await bribeController.getVotesForGauge(1)).deep.eq([])
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(1000)
      })
    });

    describe("claimBribes", () => {
      it("Should be able to see claimable bribes", async () => {
        const bribes = await bribeController.getClaimableBribes(voter1.address);
        expect(bribes[0].bribeToken).eq(bribeToken1.address)
        expect(bribes[1].bribeToken).eq(bribeToken2.address)
        expect(bribes[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes[1].bribeAmount).eq(BRIBE_AMOUNT)
      })
      it("can claimBribes", async () => {
        const OLD_VOTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const tx = await bribeController.connect(voter1).claimBribes();
        await expect(tx).to.emit(bribeController, "BribeClaimed").withArgs(voter1.address, bribeToken1.address, BRIBE_AMOUNT);
        await expect(tx).to.emit(bribeController, "BribeClaimed").withArgs(voter1.address, bribeToken2.address, BRIBE_AMOUNT);

        const NEW_VOTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const BRIBER_BALANCE_BRIBE_TOKEN_1_CHANGE = NEW_VOTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_BALANCE_BRIBE_TOKEN_1)
        const BRIBER_BALANCE_BRIBE_TOKEN_2_CHANGE = NEW_VOTER_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_BALANCE_BRIBE_TOKEN_2)
        const BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1_CHANGE = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2_CHANGE = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
        expect(BRIBER_BALANCE_BRIBE_TOKEN_1_CHANGE).eq(BRIBE_AMOUNT)
        expect(BRIBER_BALANCE_BRIBE_TOKEN_2_CHANGE).eq(BRIBE_AMOUNT)
        expect(BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1_CHANGE).eq(BRIBE_AMOUNT.mul(-1))
        expect(BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2_CHANGE).eq(BRIBE_AMOUNT.mul(-1))
        expect(await bribeController.getClaimableBribes(briber1.address)).deep.eq([]);
      })
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    /**
     * briber1 will provide bribe for gaugeID 1 with 100 of bribeToken1.
     * voter1 will initially vote for gaugeID 1, then remove the vote.
     * We will vary the epoch length to 3 weeks here.
     * We expect that all bribe tokens will be routed to the revenue router
     */

    describe("removeVoteForBribe scenario", () => {
      before(async function () {
        await gaugeController.connect(governor).setEpochLengthInWeeks(3);
        await bribeController.connect(briber1).provideBribes([bribeToken1.address], [BRIBE_AMOUNT], 1)
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([BN.from("1")]);
        const bribes = await bribeController.getProvidedBribesForGauge(1);
        expect(bribes[0].bribeToken).eq(bribeToken1.address)
        expect(bribes[0].bribeAmount).eq(BRIBE_AMOUNT)
      });
      it("throws if called by non voter or delegate", async () => {
        await expect(bribeController.connect(briber1.address).removeVoteForBribe(voter1.address, 1)).to.be.revertedWith("NotOwnerNorDelegate");
      })
      it("throws if attempt to remove vote for gauge without bribe", async () => {
        await expect(bribeController.connect(voter1.address).removeVoteForBribe(voter1.address, 2)).to.be.revertedWith("NoBribesForSelectedGauge");
      })
      it("throws if remove inexistent vote", async () => {
        await expect(bribeController.connect(voter1.address).removeVoteForBribe(voter1.address, 1)).to.be.revertedWith("EnumerableMap: nonexistent key");
      })
      it("if gauge paused, cannot vote", async () => {
        await gaugeController.connect(governor).pauseGauge(1);
        await expect(bribeController.connect(voter1.address).voteForBribe(voter1.address, 1, 1000)).to.be.revertedWith("GaugeIDPaused");
        await gaugeController.connect(governor).unpauseGauge(1);
        await bribeController.connect(voter1).voteForBribe(voter1.address, 1, 1000);
      })
      it("if gauge paused, can remove vote", async () => {
        await gaugeController.connect(governor).pauseGauge(1);
        const tx = await bribeController.connect(voter1).removeVoteForBribe(voter1.address, 1);
        await expect(tx).to.emit(bribeController, "VoteForBribeRemoved").withArgs(voter1.address, 1);
      })
      it("cannot process bribes before next epoch", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await expect(bribeController.connect(governor.address).processBribes()).to.be.revertedWith("BribesAlreadyProcessed");
      })
      it("after processing bribes, all bribes should be distributed to revenue router", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + 2 * ONE_WEEK]);
        await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})
        await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT})

        const OLD_VOTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        await bribeController.connect(updater).processBribes({gasLimit: CUSTOM_GAS_LIMIT})

        const NEW_VOTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const VOTER_BALANCE_BRIBE_TOKEN_1_CHANGE = NEW_VOTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_BALANCE_BRIBE_TOKEN_1)
        const BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1_CHANGE = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1);
        const REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1_CHANGE = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)

        expect(VOTER_BALANCE_BRIBE_TOKEN_1_CHANGE).eq(0)
        expect(BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1_CHANGE).eq(BRIBE_AMOUNT.mul(-1))
        expect(REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1_CHANGE).eq(BRIBE_AMOUNT)
        expect(await bribeToken1.balanceOf(revenueRouter.address)).eq(BRIBE_AMOUNT)
      })
      after(async function () {
        await gaugeController.connect(governor).setEpochLengthInWeeks(1);
        await gaugeController.connect(governor).unpauseGauge(1);
      });
    });



    /*******************
      STATE SUMMARY
    *******************/
    /**
     * voter1 => lockID1, voted for gaugeID 1 with 10000 votePowerBPS
     * gaugeID 1 => 1K of bribeToken1 and 1K and bribeToken2 provided for the epoch just past
     */



});