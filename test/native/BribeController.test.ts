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
const ONE_PERCENT = ONE_ETHER.div(100);
const ONE_HUNDRED_PERCENT = ONE_ETHER;
const CUSTOM_GAS_LIMIT = 6000000;

describe("BribeController", function () {
    const [deployer, governor, revenueRouter, voter1, voter2, voter3, voter4, delegate1, briber1, anon] = provider.getWallets();
  
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
          expect(await bribeController.votingContract()).eq(voting.address);
          expect(await bribeController.lastTimeBribesProcessed()).eq(await bribeController.getEpochStartTimestamp());
          expect(await bribeController.getBribeTokenWhitelist()).deep.eq([]);
          expect(await bribeController.getClaimableBribes(voter1.address)).deep.eq([]);
          expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(10000);
          expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(10000);
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
          expect(await bribeController.getEpochStartTimestamp()).eq(EXPECTED_EPOCH_START_TIME)
        });
        it("getEpochEndTimestamp() == getEpochStartTimestamp() + ONE_WEEK ", async function () {
          expect(await bribeController.getEpochEndTimestamp()).eq((await bribeController.getEpochStartTimestamp()).add(ONE_WEEK))
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
      it("sets registry", async function () {
        const tx = await bribeController.connect(governor).setRegistry(registry2.address);
        await expect(tx).to.emit(bribeController, "RegistrySet").withArgs(registry2.address);
      });
      it("copies Registry addresses to own state variables", async function () {
        expect(await bribeController.registry()).eq(registry2.address);
        expect(await bribeController.gaugeController()).eq(RANDOM_ADDRESS_1);
        expect(await bribeController.votingContract()).eq(RANDOM_ADDRESS_2);
      });
      after(async function () {
        await bribeController.connect(governor).setRegistry(registry.address);
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
        await bribeToken1.connect(deployer).transfer(briber1.address, ONE_ETHER.mul(100000));
        await bribeToken2.connect(deployer).transfer(briber1.address, ONE_ETHER.mul(100000));
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
      it("claimBribes throws if no bribes to claim", async  () => {
        await expect(bribeController.connect(voter1).claimBribes()).to.be.revertedWith("NoClaimableBribes");
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
        await voting.connect(voter1).setDelegate(delegate1.address);
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
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(1000);
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
      it("claimForBribe immediately after vote has no token transfer", async () => {
        const tx = await bribeController.connect(voter1).claimBribes();
        await expect(tx).to.not.emit(bribeController, "BribeClaimed");
      })
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
      it("cannot provide bribe, before bribes processed", async () => {
        await expect(bribeController.connect(briber1).provideBribes([bribeToken1.address], [1], 1)).to.be.revertedWith("LastEpochBribesNotProcessed");
      });
      it("anon can process bribes", async () => {
        const EPOCH_START_TIMESTAMP = await bribeController.getEpochStartTimestamp();
        const tx = await bribeController.connect(anon).processBribes({gasLimit: CUSTOM_GAS_LIMIT});
        await expect(tx).to.emit(bribeController, "BribesProcessed").withArgs(EPOCH_START_TIMESTAMP);
        expect(await bribeController.lastTimeBribesProcessed()).eq(EPOCH_START_TIMESTAMP);
        expect(await bribeController.isBribingOpen()).eq(true);
      });
      it("Mappings storing votes and provided bribes should be empty after bribes processing", async () => {
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(1)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter1.address)).deep.eq([])
        expect(await bribeController.getVotesForGauge(1)).deep.eq([])
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(0)
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(1000)
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
      it("if gauge paused, delegate can remove vote", async () => {
        await gaugeController.connect(governor).pauseGauge(1);
        const tx = await bribeController.connect(delegate1).removeVoteForBribe(voter1.address, 1);
        await expect(tx).to.emit(bribeController, "VoteForBribeRemoved").withArgs(voter1.address, 1);
      })
      it("cannot process bribes before next epoch", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await expect(bribeController.connect(governor.address).processBribes()).to.be.reverted;
      })
      it("after processing bribes, all bribes should stay on the bribing contract, and paused gauge does not impact this", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + 2 * ONE_WEEK]);
        await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})
        await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT})

        const OLD_VOTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        await bribeController.connect(anon).processBribes({gasLimit: CUSTOM_GAS_LIMIT})

        const NEW_VOTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const VOTER_BALANCE_BRIBE_TOKEN_1_CHANGE = NEW_VOTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_BALANCE_BRIBE_TOKEN_1)
        const BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1_CHANGE = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1);

        expect(VOTER_BALANCE_BRIBE_TOKEN_1_CHANGE).eq(0)
        expect(NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(BRIBE_AMOUNT)
        expect(BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1_CHANGE).eq(0)
        expect(await bribeController.getClaimableBribes(voter1.address)).deep.eq([])
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(1)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter1.address)).deep.eq([])
        expect(await bribeController.getVotesForGauge(1)).deep.eq([])
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(1000)
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(1000)
      })
      it("rescueTokens cannot be called by non-governance", async () => {
        await expect(bribeController.connect(voter1).rescueTokens([bribeToken1.address, bribeToken2.address], revenueRouter.address)).to.be.revertedWith("!governance");
      })
      it("rescueTokens can be called", async () => {
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)

        const tx = await bribeController.connect(governor).rescueTokens([bribeToken1.address], revenueRouter.address)
        await expect(tx).to.emit(bribeController, "TokenRescued").withArgs(bribeToken1.address, revenueRouter.address, OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1);

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)

        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(BRIBE_AMOUNT.mul(-1))
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1).eq(BRIBE_AMOUNT)
      })
      it("check for reset of epoch length", async function () {
        await gaugeController.connect(governor).setEpochLengthInWeeks(1)
        const LAST_CHECKPOINT_TIMESTAMP = await bribeController.lastTimeBribesProcessed();
        const EPOCH_START_TIMESTAMP = await bribeController.getEpochStartTimestamp();
        if(EPOCH_START_TIMESTAMP.gt(LAST_CHECKPOINT_TIMESTAMP)) {
          await gaugeController.connect(anon).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT})
          await voting.connect(anon).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT});
          await bribeController.connect(anon).processBribes({gasLimit: CUSTOM_GAS_LIMIT});
        }
        expect(await bribeController.isBribingOpen()).eq(true);
      });
      after(async function () {
        await gaugeController.connect(governor).unpauseGauge(1);
      });
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    /**
     * Create gaugeID 3
     * briber1 will provide bribe for gaugeID 1 with 100 of bribeToken1 and 100 of bribeToken2.
     * briber1 will provide bribe for gaugeID 3 with 100 of bribeToken1 and 100 of bribeToken2.
     * voter2 and voter3 will create an equivalent lock to voter1
     * voter1 will voteForBribe for gaugeID 1 with 5% and gaugeID 2 with 5% 
     * voter2 will voteForBribe for gaugeID 1 with 50% and gaugeID 2 with 50% 
     * voter3 will initially mirror voter2 voteForBribes, but then remove their bribe
     */

    describe("voteForMultipleBribes and removeVotesForMultipleBribes scenario", () => {
      before(async function () {
        await gaugeController.connect(governor).addGauge("3", ONE_PERCENT);
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 1)
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 3)
        const lock = await underwritingLocker.locks(1);
        await underwritingLocker.connect(deployer).createLock(voter2.address, lock.amount, lock.end);
        await underwritingLocker.connect(deployer).createLock(voter3.address, lock.amount, lock.end);
        expect(await voting.getVotePower(voter1.address)).eq(await voting.getVotePower(voter2.address))
        expect(await voting.getVotePower(voter1.address)).eq(await voting.getVotePower(voter3.address))
        expect(await voting.getVotePower(voter2.address)).eq(await voting.getVotePower(voter3.address))
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([BN.from("1"), BN.from("3")])
        const bribes1 = await bribeController.getProvidedBribesForGauge(1);
        expect(bribes1[0].bribeToken).eq(bribeToken1.address)
        expect(bribes1[1].bribeToken).eq(bribeToken2.address)
        expect(bribes1[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes1[1].bribeAmount).eq(BRIBE_AMOUNT)
        const bribes3 = await bribeController.getProvidedBribesForGauge(3);
        expect(bribes3[0].bribeToken).eq(bribeToken1.address)
        expect(bribes3[1].bribeToken).eq(bribeToken2.address)
        expect(bribes3[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes3[1].bribeAmount).eq(BRIBE_AMOUNT)
        await voting.connect(voter2).setDelegate(delegate1.address)
        const lifetimeBribes1 = await bribeController.getLifetimeProvidedBribes(briber1.address);
        expect(lifetimeBribes1[0].bribeToken).eq(bribeToken1.address)
        expect(lifetimeBribes1[1].bribeToken).eq(bribeToken2.address)
        expect(lifetimeBribes1[0].bribeAmount).eq(BRIBE_AMOUNT.mul(4))
        expect(lifetimeBribes1[1].bribeAmount).eq(BRIBE_AMOUNT.mul(3))
      });
      it("will throw if called by non-lock owner or delegate", async () => {
        await expect(bribeController.connect(briber1).voteForMultipleBribes(voter1.address, [1, 2], [500, 500])).to.be.revertedWith("NotOwnerNorDelegate");
        await expect(bribeController.connect(briber1).removeVotesForMultipleBribes(voter1.address, [1, 2])).to.be.revertedWith("NotOwnerNorDelegate");
      });
      it("will throw if voter has no locks", async () => {
        await expect(bribeController.connect(briber1).voteForMultipleBribes(briber1.address, [1, 2], [500, 500])).to.be.revertedWith("VoterHasNoLocks");
      });
      it("will throw if voteForBribe for gauge with no bribe", async () => {
        await expect(bribeController.connect(voter1).voteForMultipleBribes(voter1.address, [1, 4], [500, 500])).to.be.revertedWith("NoBribesForSelectedGauge");
      });
      it("will throw if voteForBribe for more than unused votepower", async () => {
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(1000);
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(1000);
        await expect(bribeController.connect(voter1).voteForMultipleBribes(voter1.address, [1, 3], [500, 501])).to.be.revertedWith("TotalVotePowerBPSOver10000");
      });
      it("can voteForMultipleBribes", async () => {
        const tx1 = await bribeController.connect(voter1).voteForMultipleBribes(voter1.address, [1, 3], [500, 500]);
        await expect(tx1).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter1.address, 1, 500);
        await expect(tx1).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter1.address, 3, 500);
        const tx2 = await bribeController.connect(delegate1).voteForMultipleBribes(voter2.address, [1, 3], [500, 500]);
        await expect(tx2).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter2.address, 1, 500);
        await expect(tx2).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter2.address, 3, 500);
        const tx3 = await bribeController.connect(delegate1).voteForMultipleBribes(voter2.address, [1, 3], [5000, 5000]);
        await expect(tx3).to.emit(bribeController, "VoteForBribeChanged").withArgs(voter2.address, 1, 5000, 500);
        await expect(tx3).to.emit(bribeController, "VoteForBribeChanged").withArgs(voter2.address, 3, 5000, 500);
        const tx4 = await bribeController.connect(voter3).voteForMultipleBribes(voter3.address, [1, 3], [5000, 5000]);
        await expect(tx4).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter3.address, 1, 5000);
        await expect(tx4).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter3.address, 3, 5000);
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(0)
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(0)
        expect(await bribeController.getUnusedVotePowerBPS(voter2.address)).eq(0)
        expect(await bribeController.getAvailableVotePowerBPS(voter2.address)).eq(0)
        expect(await bribeController.getUnusedVotePowerBPS(voter3.address)).eq(0)
        expect(await bribeController.getAvailableVotePowerBPS(voter3.address)).eq(0)
      });
      it("can removeVotesForMultipleBribes", async () => {
        const tx = await bribeController.connect(voter3).removeVotesForMultipleBribes(voter3.address, [1, 3]);
        await expect(tx).to.emit(bribeController, "VoteForBribeRemoved").withArgs(voter3.address, 1);
        await expect(tx).to.emit(bribeController, "VoteForBribeRemoved").withArgs(voter3.address, 3);
        expect(await bribeController.getUnusedVotePowerBPS(voter3.address)).eq(10000)
        expect(await bribeController.getAvailableVotePowerBPS(voter3.address)).eq(10000)
      });
      it("getVotesForGauge", async () => {
        const votes1 = await bribeController.getVotesForGauge(1);
        expect(votes1[0].voter).eq(voter1.address)
        expect(votes1[1].voter).eq(voter2.address)
        expect(votes1[0].votePowerBPS).eq(500)
        expect(votes1[1].votePowerBPS).eq(5000)
        const votes3 = await bribeController.getVotesForGauge(3);
        expect(votes1[0].voter).eq(voter1.address)
        expect(votes1[1].voter).eq(voter2.address)
        expect(votes1[0].votePowerBPS).eq(500)
        expect(votes1[1].votePowerBPS).eq(5000)
      })
      it("getVotesForVoter", async () => {
        const votes1 = await bribeController.getVotesForVoter(voter1.address);
        expect(votes1[0].gaugeID).eq(1)
        expect(votes1[1].gaugeID).eq(3)
        expect(votes1[0].votePowerBPS).eq(500)
        expect(votes1[1].votePowerBPS).eq(500)
        const votes2 = await bribeController.getVotesForVoter(voter2.address);
        expect(votes2[0].gaugeID).eq(1)
        expect(votes2[1].gaugeID).eq(3)
        expect(votes2[0].votePowerBPS).eq(5000)
        expect(votes2[1].votePowerBPS).eq(5000)
        expect(await bribeController.getVotesForVoter(voter3.address)).deep.eq([])
      })
      it("processBribes will change state as expected", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT});
        await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT});

        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        await bribeController.connect(governor).processBribes({gasLimit: CUSTOM_GAS_LIMIT});

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2)
        
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2).eq(0)

        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(1)).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(3)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter1.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter2.address)).deep.eq([])
        expect(await bribeController.getVotesForGauge(1)).deep.eq([])
        expect(await bribeController.getVotesForGauge(3)).deep.eq([])
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(0)
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(1000)
        expect(await bribeController.getUnusedVotePowerBPS(voter2.address)).eq(0)
        expect(await bribeController.getAvailableVotePowerBPS(voter2.address)).eq(10000)
        expect(await bribeController.getUnusedVotePowerBPS(voter3.address)).eq(10000)
        expect(await bribeController.getAvailableVotePowerBPS(voter3.address)).eq(10000)
      })
      it("getClaimableBribes", async () => {
        const claim1 = await bribeController.getClaimableBribes(voter1.address);
        expect(claim1[0].bribeToken).eq(bribeToken1.address)
        expect(claim1[1].bribeToken).eq(bribeToken2.address)
        expectClose(claim1[0].bribeAmount, BRIBE_AMOUNT.mul(2).mul(1).div(11), 1e3)
        expectClose(claim1[1].bribeAmount, BRIBE_AMOUNT.mul(2).mul(1).div(11), 1e3)
        const claim2 = await bribeController.getClaimableBribes(voter2.address);
        expect(claim2[0].bribeToken).eq(bribeToken1.address)
        expect(claim2[1].bribeToken).eq(bribeToken2.address)
        expectClose(claim2[0].bribeAmount, BRIBE_AMOUNT.mul(2).mul(10).div(11), 1e3)
        expectClose(claim2[1].bribeAmount, BRIBE_AMOUNT.mul(2).mul(10).div(11), 1e3)
        expect(await bribeController.getClaimableBribes(voter3.address)).deep.eq([])
      })
      it("can claimBribes", async () => {
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken1.balanceOf(revenueRouter.address)
        const tx1 = await bribeController.connect(voter1).claimBribes();
        const tx2 = await bribeController.connect(voter2).claimBribes();
        await expect(tx1).to.emit(bribeController, "BribeClaimed");
        await expect(tx2).to.emit(bribeController, "BribeClaimed");

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken1.balanceOf(revenueRouter.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2)

        expectClose(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1, BRIBE_AMOUNT.mul(2).mul(1).div(11), 1e3);
        expectClose(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2, BRIBE_AMOUNT.mul(2).mul(1).div(11), 1e3);
        expectClose(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1, BRIBE_AMOUNT.mul(2).mul(10).div(11), 1e3);
        expectClose(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2, BRIBE_AMOUNT.mul(2).mul(10).div(11), 1e3);
        expectClose(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1, BRIBE_AMOUNT.mul(-2), 1e4);
        expectClose(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2, BRIBE_AMOUNT.mul(-2), 1e4);
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(await bribeController.getClaimableBribes(briber1.address)).deep.eq([]);
      })
      it("rescueTokens cannot be called by non-governance", async () => {
        await expect(bribeController.connect(voter1).rescueTokens([bribeToken1.address, bribeToken2.address], revenueRouter.address)).to.be.revertedWith("!governance");
      })
      it("rescueTokens can be called", async () => {
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken1.balanceOf(revenueRouter.address)

        const tx = await bribeController.connect(governor).rescueTokens([bribeToken1.address, bribeToken2.address], revenueRouter.address)
        await expect(tx).to.emit(bribeController, "TokenRescued").withArgs(bribeToken1.address, revenueRouter.address, OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1);
        await expect(tx).to.emit(bribeController, "TokenRescued").withArgs(bribeToken1.address, revenueRouter.address, OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2);

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken1.balanceOf(revenueRouter.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2)

        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1).eq(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2).eq(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
      })
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    /**
     * Create gauge4 with no bribes
     * voter4 will create equivalent lock to voter3
     * voter3 and 4 has slightly more votePower than voter1 and , because voter3 did not get charged a premium in the last epoch
     * briber1 will provide bribe for gaugeID 1 with 100 of bribeToken1, 100 of bribeToken2
     * briber1 will provide bribe for gaugeID 2 with 200 of bribeToken1, 200 of bribeToken2
     * briber1 will provide bribe for gaugeID 3 with 100 of bribeToken1, 100 of bribeToken2
     * delegate1 will be the delegate for voter1, voter2, voter3 and voter4
     * delegate1 will vote voteForBribeForMultipleVoters 20% for gauge1, 50% for gauge2, 10% for gauge3, for voters 1, 2, 3 and 4
     * delegate1 will removeVotesForBribeForMultipleVoters for voters 3 and 4, for gauge3 only
     */

    describe("voteForBribeForMultipleVoters and removeVotesForBribeForMultipleVoters scenario", () => {
      before(async function () {
        const lock = await underwritingLocker.locks(3);
        await underwritingLocker.connect(deployer).createLock(voter4.address, lock.amount, lock.end)
        expect(await voting.getVotePower(voter4.address)).eq(await voting.getVotePower(voter3.address))
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 1)
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT.mul(2), BRIBE_AMOUNT.mul(2)], 2)
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 3)
        await voting.connect(voter1).setDelegate(delegate1.address)
        await voting.connect(voter2).setDelegate(delegate1.address)
        await voting.connect(voter3).setDelegate(delegate1.address)
        await voting.connect(voter4).setDelegate(delegate1.address)
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([BN.from("1"), BN.from("2"), BN.from("3")])
        const bribes1 = await bribeController.getProvidedBribesForGauge(1);
        expect(bribes1[0].bribeToken).eq(bribeToken1.address)
        expect(bribes1[1].bribeToken).eq(bribeToken2.address)
        expect(bribes1[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes1[1].bribeAmount).eq(BRIBE_AMOUNT)
        const bribes2 = await bribeController.getProvidedBribesForGauge(2);
        expect(bribes2[0].bribeToken).eq(bribeToken1.address)
        expect(bribes2[1].bribeToken).eq(bribeToken2.address)
        expect(bribes2[0].bribeAmount).eq(BRIBE_AMOUNT.mul(2))
        expect(bribes2[1].bribeAmount).eq(BRIBE_AMOUNT.mul(2))
        const bribes3 = await bribeController.getProvidedBribesForGauge(3);
        expect(bribes3[0].bribeToken).eq(bribeToken1.address)
        expect(bribes3[1].bribeToken).eq(bribeToken2.address)
        expect(bribes3[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes3[1].bribeAmount).eq(BRIBE_AMOUNT)
        const lifetimeBribes1 = await bribeController.getLifetimeProvidedBribes(briber1.address);
        expect(lifetimeBribes1[0].bribeToken).eq(bribeToken1.address)
        expect(lifetimeBribes1[1].bribeToken).eq(bribeToken2.address)
        expect(lifetimeBribes1[0].bribeAmount).eq(BRIBE_AMOUNT.mul(8))
        expect(lifetimeBribes1[1].bribeAmount).eq(BRIBE_AMOUNT.mul(7))
        await gaugeController.connect(governor).addGauge("4", ONE_PERCENT)
      });
      it("will throw if called by non-lock owner or delegate", async () => {
        await expect(bribeController.connect(briber1).voteForBribeForMultipleVoters([voter1.address, voter2.address, voter3.address, voter4.address], [1, 2, 3], [2000, 5000, 1000])).to.be.revertedWith("NotOwnerNorDelegate");
        await expect(bribeController.connect(briber1).removeVotesForBribeForMultipleVoters([voter1.address, voter2.address, voter3.address, voter4.address], [1, 2, 3])).to.be.revertedWith("NotOwnerNorDelegate");
      });
      it("will throw if voter has no locks", async () => {
        await expect(bribeController.connect(briber1).voteForBribeForMultipleVoters([briber1.address, voter2.address, voter3.address, voter4.address], [1, 2, 3], [2000, 5000, 1000])).to.be.revertedWith("VoterHasNoLocks");
      });
      it("will throw if voteForBribe for gauge with no bribe", async () => {
        await expect(bribeController.connect(delegate1).voteForBribeForMultipleVoters([voter1.address, voter2.address], [1, 4], [500, 500])).to.be.revertedWith("NoBribesForSelectedGauge");
      });
      it("will throw if voteForBribe for more than unused votepower", async () => {
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(0);
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(1000);
        await expect(bribeController.connect(delegate1).voteForBribeForMultipleVoters([voter1.address, voter2.address, voter3.address, voter4.address], [1, 2, 3], [2000, 5000, 1000])).to.be.revertedWith("TotalVotePowerBPSOver10000");
      });
      it("can voteForBribeForMultipleVoters", async () => {
        await voting.connect(delegate1).removeVoteMultiple(voter1.address, [2])
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(9000);
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(10000);
        expect(await bribeController.getUnusedVotePowerBPS(voter2.address)).eq(0);
        expect(await bribeController.getAvailableVotePowerBPS(voter2.address)).eq(10000);
        expect(await bribeController.getUnusedVotePowerBPS(voter3.address)).eq(10000);
        expect(await bribeController.getAvailableVotePowerBPS(voter3.address)).eq(10000);
        expect(await bribeController.getUnusedVotePowerBPS(voter4.address)).eq(10000);
        expect(await bribeController.getAvailableVotePowerBPS(voter4.address)).eq(10000);
        const tx = await bribeController.connect(delegate1).voteForBribeForMultipleVoters([voter1.address, voter2.address, voter3.address, voter4.address], [1, 2, 3], [2000, 5000, 1000]);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter1.address, 1, 2000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter2.address, 1, 2000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter3.address, 1, 2000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter4.address, 1, 2000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter1.address, 2, 5000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter2.address, 2, 5000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter3.address, 2, 5000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter4.address, 2, 5000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter1.address, 3, 1000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter2.address, 3, 1000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter3.address, 3, 1000);
        await expect(tx).to.emit(bribeController, "VoteForBribeAdded").withArgs(voter4.address, 3, 1000);
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(2000)
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(2000)
        expect(await bribeController.getUnusedVotePowerBPS(voter2.address)).eq(2000)
        expect(await bribeController.getAvailableVotePowerBPS(voter2.address)).eq(2000)
        expect(await bribeController.getUnusedVotePowerBPS(voter3.address)).eq(2000)
        expect(await bribeController.getAvailableVotePowerBPS(voter3.address)).eq(2000)
        expect(await bribeController.getUnusedVotePowerBPS(voter4.address)).eq(2000)
        expect(await bribeController.getAvailableVotePowerBPS(voter4.address)).eq(2000)
      });
      it("can removeVotesForMultipleBribes", async () => {
        const tx = await bribeController.connect(delegate1).removeVotesForBribeForMultipleVoters([voter3.address, voter4.address], [3]);
        await expect(tx).to.emit(bribeController, "VoteForBribeRemoved").withArgs(voter3.address, 3);
        await expect(tx).to.emit(bribeController, "VoteForBribeRemoved").withArgs(voter4.address, 3);
        expect(await bribeController.getUnusedVotePowerBPS(voter3.address)).eq(3000)
        expect(await bribeController.getAvailableVotePowerBPS(voter3.address)).eq(3000)
        expect(await bribeController.getUnusedVotePowerBPS(voter4.address)).eq(3000)
        expect(await bribeController.getAvailableVotePowerBPS(voter4.address)).eq(3000)
      });
      it("getVotesForGauge", async () => {
        const votes1 = await bribeController.getVotesForGauge(1);
        expect(votes1[0].voter).eq(voter1.address)
        expect(votes1[1].voter).eq(voter2.address)
        expect(votes1[2].voter).eq(voter3.address)
        expect(votes1[3].voter).eq(voter4.address)
        expect(votes1[0].votePowerBPS).eq(2000)
        expect(votes1[1].votePowerBPS).eq(2000)
        expect(votes1[2].votePowerBPS).eq(2000)
        expect(votes1[3].votePowerBPS).eq(2000)
        const votes2 = await bribeController.getVotesForGauge(2);
        expect(votes2[0].voter).eq(voter1.address)
        expect(votes2[1].voter).eq(voter2.address)
        expect(votes2[2].voter).eq(voter3.address)
        expect(votes2[3].voter).eq(voter4.address)
        expect(votes2[0].votePowerBPS).eq(5000)
        expect(votes2[1].votePowerBPS).eq(5000)
        expect(votes2[2].votePowerBPS).eq(5000)
        expect(votes2[3].votePowerBPS).eq(5000)
        const votes3 = await bribeController.getVotesForGauge(3);
        expect(votes3[0].voter).eq(voter1.address)
        expect(votes3[1].voter).eq(voter2.address)
        expect(votes3[0].votePowerBPS).eq(1000)
        expect(votes3[1].votePowerBPS).eq(1000)
        expect(votes3.length).eq(2)
      })
      it("getVotesForVoter", async () => {
        const votes1 = await bribeController.getVotesForVoter(voter1.address);
        expect(votes1[0].gaugeID).eq(1)
        expect(votes1[1].gaugeID).eq(2)
        expect(votes1[2].gaugeID).eq(3)
        expect(votes1[0].votePowerBPS).eq(2000)
        expect(votes1[1].votePowerBPS).eq(5000)
        expect(votes1[2].votePowerBPS).eq(1000)
        const votes2 = await bribeController.getVotesForVoter(voter2.address);
        expect(votes2[0].gaugeID).eq(1)
        expect(votes2[1].gaugeID).eq(2)
        expect(votes2[2].gaugeID).eq(3)
        expect(votes2[0].votePowerBPS).eq(2000)
        expect(votes2[1].votePowerBPS).eq(5000)
        expect(votes2[2].votePowerBPS).eq(1000)
        const votes3 = await bribeController.getVotesForVoter(voter3.address);
        expect(votes3[0].gaugeID).eq(1)
        expect(votes3[1].gaugeID).eq(2)
        expect(votes3[0].votePowerBPS).eq(2000)
        expect(votes3[1].votePowerBPS).eq(5000)
        expect(votes3.length).eq(2)
        const votes4 = await bribeController.getVotesForVoter(voter3.address);
        expect(votes4[0].gaugeID).eq(1)
        expect(votes4[1].gaugeID).eq(2)
        expect(votes4[0].votePowerBPS).eq(2000)
        expect(votes4[1].votePowerBPS).eq(5000)
        expect(votes4.length).eq(2)
      })
      it("processBribes will change state as expected", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT});
        await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT});

        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        await bribeController.connect(governor).processBribes({gasLimit: CUSTOM_GAS_LIMIT});

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2)
        
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2).eq(0)

        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(1)).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(2)).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(3)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter1.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter2.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter3.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter4.address)).deep.eq([])
        expect(await bribeController.getVotesForGauge(1)).deep.eq([])
        expect(await bribeController.getVotesForGauge(2)).deep.eq([])
        expect(await bribeController.getVotesForGauge(3)).deep.eq([])
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(2000)
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(10000)
        expect(await bribeController.getUnusedVotePowerBPS(voter2.address)).eq(2000)
        expect(await bribeController.getAvailableVotePowerBPS(voter2.address)).eq(10000)
        expect(await bribeController.getUnusedVotePowerBPS(voter3.address)).eq(3000)
        expect(await bribeController.getAvailableVotePowerBPS(voter3.address)).eq(10000)
        expect(await bribeController.getUnusedVotePowerBPS(voter4.address)).eq(3000)
        expect(await bribeController.getAvailableVotePowerBPS(voter4.address)).eq(10000)
      })
      it("getClaimableBribes", async () => {
        const claim1 = await bribeController.getClaimableBribes(voter1.address);
        expect(claim1[0].bribeToken).eq(bribeToken1.address)
        expect(claim1[1].bribeToken).eq(bribeToken2.address)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(5).div(16)).div(claim1[0].bribeAmount), ONE_HUNDRED_PERCENT, 1e14)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(5).div(16)).div(claim1[1].bribeAmount), ONE_HUNDRED_PERCENT, 1e14)
        const claim2 = await bribeController.getClaimableBribes(voter2.address);
        expect(claim2[0].bribeToken).eq(bribeToken1.address)
        expect(claim2[1].bribeToken).eq(bribeToken2.address)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(5).div(16)).div(claim2[0].bribeAmount), ONE_HUNDRED_PERCENT, 1e14)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(5).div(16)).div(claim2[1].bribeAmount), ONE_HUNDRED_PERCENT, 1e14)
        const claim3 = await bribeController.getClaimableBribes(voter3.address);
        expect(claim3[0].bribeToken).eq(bribeToken1.address)
        expect(claim3[1].bribeToken).eq(bribeToken2.address)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(3).div(16)).div(claim3[0].bribeAmount), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(3).div(16)).div(claim3[1].bribeAmount), ONE_HUNDRED_PERCENT, 1e15)
        const claim4 = await bribeController.getClaimableBribes(voter4.address);
        expect(claim4[0].bribeToken).eq(bribeToken1.address)
        expect(claim4[1].bribeToken).eq(bribeToken2.address)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(3).div(16)).div(claim4[0].bribeAmount), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(3).div(16)).div(claim4[1].bribeAmount), ONE_HUNDRED_PERCENT, 1e15)
      })
      it("can claimBribes for voter1", async () => {
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)

        const tx = await bribeController.connect(voter1).claimBribes();
        await expect(tx).to.emit(bribeController, "BribeClaimed");

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)

        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(5).div(16)).div(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(5).div(16)).div(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2), ONE_HUNDRED_PERCENT, 1e15)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2).eq(0)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(-4).mul(5).div(16)).div(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(-4).mul(5).div(16)).div(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2), ONE_HUNDRED_PERCENT, 1e15)
        expect(await bribeController.getClaimableBribes(voter1.address)).deep.eq([]);
      })
      it("can claimBribes for voter2", async () => {
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)

        const tx = await bribeController.connect(voter2).claimBribes();
        await expect(tx).to.emit(bribeController, "BribeClaimed");

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)

        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2).eq(0)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(5).div(16)).div(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(5).div(16)).div(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2), ONE_HUNDRED_PERCENT, 1e15)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2).eq(0)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(-4).mul(5).div(16)).div(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(-4).mul(5).div(16)).div(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2), ONE_HUNDRED_PERCENT, 1e15)
        expect(await bribeController.getClaimableBribes(voter2.address)).deep.eq([]);
      })
      it("can claimBribes for voter3", async () => {
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)

        const tx = await bribeController.connect(voter3).claimBribes();
        await expect(tx).to.emit(bribeController, "BribeClaimed");

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)

        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2).eq(0)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(3).div(16)).div(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(3).div(16)).div(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2), ONE_HUNDRED_PERCENT, 1e15)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2).eq(0)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(-4).mul(3).div(16)).div(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(-4).mul(3).div(16)).div(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2), ONE_HUNDRED_PERCENT, 1e15)
        expect(await bribeController.getClaimableBribes(voter3.address)).deep.eq([]);
      })
      it("can claimBribes for voter4", async () => {
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)

        const tx = await bribeController.connect(voter4).claimBribes();
        await expect(tx).to.emit(bribeController, "BribeClaimed");

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)

        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2).eq(0)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(3).div(16)).div(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(4).mul(3).div(16)).div(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(-4).mul(3).div(16)).div(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1), ONE_HUNDRED_PERCENT, 1e15)
        expectClose(ONE_HUNDRED_PERCENT.mul(BRIBE_AMOUNT.mul(-4).mul(3).div(16)).div(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2), ONE_HUNDRED_PERCENT, 1e15)
        expect(await bribeController.getClaimableBribes(voter4.address)).deep.eq([]);
      })
      it("voters cannot claim bribes again", async () => {
        await expect(bribeController.connect(voter1).claimBribes()).to.be.revertedWith("NoClaimableBribes");
        await expect(bribeController.connect(voter2).claimBribes()).to.be.revertedWith("NoClaimableBribes");
        await expect(bribeController.connect(voter3).claimBribes()).to.be.revertedWith("NoClaimableBribes");
        await expect(bribeController.connect(voter4).claimBribes()).to.be.revertedWith("NoClaimableBribes");
      });
      after(async function () {
        await bribeController.connect(governor).rescueTokens([bribeToken1.address, bribeToken2.address], revenueRouter.address)
      });
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    /**
     * briber1 will provide bribe for gaugeID 1 with 100 of bribeToken1, 100 of bribeToken2
     * briber1 will provide bribe for gaugeID 2 with 100 of bribeToken1, 100 of bribeToken2
     * briber1 will provide bribe for gaugeID 3 with 100 of bribeToken1, 100 of bribeToken2
     * delegate1 will vote voteForBribeForMultipleVoters 20% for gauge1, 50% for gauge2, 10% for gauge3, for voters 1, 2, 3 and 4
     * delegate1 will removeVotesForBribeForMultipleVoters so that no votes are remaining.
     */

    describe("no votes scenario", () => {
      before(async function () {
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 1)
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 2)
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 3)
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([BN.from("1"), BN.from("2"), BN.from("3")])
        const bribes1 = await bribeController.getProvidedBribesForGauge(1);
        expect(bribes1[0].bribeToken).eq(bribeToken1.address)
        expect(bribes1[1].bribeToken).eq(bribeToken2.address)
        expect(bribes1[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes1[1].bribeAmount).eq(BRIBE_AMOUNT)
        const bribes2 = await bribeController.getProvidedBribesForGauge(2);
        expect(bribes2[0].bribeToken).eq(bribeToken1.address)
        expect(bribes2[1].bribeToken).eq(bribeToken2.address)
        expect(bribes2[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes2[1].bribeAmount).eq(BRIBE_AMOUNT)
        const bribes3 = await bribeController.getProvidedBribesForGauge(3);
        expect(bribes3[0].bribeToken).eq(bribeToken1.address)
        expect(bribes3[1].bribeToken).eq(bribeToken2.address)
        expect(bribes3[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes3[1].bribeAmount).eq(BRIBE_AMOUNT)
        const lifetimeBribes1 = await bribeController.getLifetimeProvidedBribes(briber1.address);
        expect(lifetimeBribes1[0].bribeToken).eq(bribeToken1.address)
        expect(lifetimeBribes1[1].bribeToken).eq(bribeToken2.address)
        expect(lifetimeBribes1[0].bribeAmount).eq(BRIBE_AMOUNT.mul(11))
        expect(lifetimeBribes1[1].bribeAmount).eq(BRIBE_AMOUNT.mul(10))
      });
      it("processBribes will change state as expected", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT});
        await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT});

        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        await bribeController.connect(governor).processBribes({gasLimit: CUSTOM_GAS_LIMIT});

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2)
        
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(BRIBE_AMOUNT.mul(3))
        expect(NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2).eq(BRIBE_AMOUNT.mul(3))

        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(1)).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(2)).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(3)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter1.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter2.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter3.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter4.address)).deep.eq([])
        expect(await bribeController.getVotesForGauge(1)).deep.eq([])
        expect(await bribeController.getVotesForGauge(2)).deep.eq([])
        expect(await bribeController.getVotesForGauge(3)).deep.eq([])
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(10000)
        expect(await bribeController.getAvailableVotePowerBPS(voter2.address)).eq(10000)
        expect(await bribeController.getAvailableVotePowerBPS(voter3.address)).eq(10000)
        expect(await bribeController.getAvailableVotePowerBPS(voter4.address)).eq(10000)
        expect(await bribeController.getClaimableBribes(voter1.address)).deep.eq([]);
        expect(await bribeController.getClaimableBribes(voter2.address)).deep.eq([]);
        expect(await bribeController.getClaimableBribes(voter3.address)).deep.eq([]);
        expect(await bribeController.getClaimableBribes(voter4.address)).deep.eq([]);
      })
      after(async function () {
        await bribeController.connect(governor).rescueTokens([bribeToken1.address, bribeToken2.address], revenueRouter.address)
      });
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    /**
     * briber1 will provide bribe for gaugeID 1 with 100 of bribeToken1, 100 of bribeToken2
     * briber1 will provide bribe for gaugeID 2 with 100 of bribeToken1, 100 of bribeToken2
     * briber1 will provide bribe for gaugeID 3 with 100 of bribeToken1, 100 of bribeToken2
     * There are no voteForBribes
     */

    describe("all votes removed scenario", () => {
      before(async function () {
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 1)
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 2)
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 3)
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([BN.from("1"), BN.from("2"), BN.from("3")])
        const bribes1 = await bribeController.getProvidedBribesForGauge(1);
        expect(bribes1[0].bribeToken).eq(bribeToken1.address)
        expect(bribes1[1].bribeToken).eq(bribeToken2.address)
        expect(bribes1[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes1[1].bribeAmount).eq(BRIBE_AMOUNT)
        const bribes2 = await bribeController.getProvidedBribesForGauge(2);
        expect(bribes2[0].bribeToken).eq(bribeToken1.address)
        expect(bribes2[1].bribeToken).eq(bribeToken2.address)
        expect(bribes2[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes2[1].bribeAmount).eq(BRIBE_AMOUNT)
        const bribes3 = await bribeController.getProvidedBribesForGauge(3);
        expect(bribes3[0].bribeToken).eq(bribeToken1.address)
        expect(bribes3[1].bribeToken).eq(bribeToken2.address)
        expect(bribes3[0].bribeAmount).eq(BRIBE_AMOUNT)
        expect(bribes3[1].bribeAmount).eq(BRIBE_AMOUNT)
        const lifetimeBribes1 = await bribeController.getLifetimeProvidedBribes(briber1.address);
        expect(lifetimeBribes1[0].bribeToken).eq(bribeToken1.address)
        expect(lifetimeBribes1[1].bribeToken).eq(bribeToken2.address)
        expect(lifetimeBribes1[0].bribeAmount).eq(BRIBE_AMOUNT.mul(14))
        expect(lifetimeBribes1[1].bribeAmount).eq(BRIBE_AMOUNT.mul(13))
        await bribeController.connect(delegate1).voteForBribeForMultipleVoters([voter1.address, voter2.address, voter3.address, voter4.address], [1, 2, 3], [2000, 5000, 1000]);
        await bribeController.connect(delegate1).removeVotesForBribeForMultipleVoters([voter1.address, voter2.address, voter3.address, voter4.address], [1, 2, 3]);
      });
      it("processBribes will change state as expected", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT});
        await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT});

        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        await bribeController.connect(governor).processBribes({gasLimit: CUSTOM_GAS_LIMIT});

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter4.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter2.address)
        const NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter3.address)
        const NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter4.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_2_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_2_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_3_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_3_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_4_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_4_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2)
        
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_2_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_3_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_VOTER_4_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(BRIBE_AMOUNT.mul(3))
        expect(NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2).eq(BRIBE_AMOUNT.mul(3))

        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(1)).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(2)).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(3)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter1.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter2.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter3.address)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter4.address)).deep.eq([])
        expect(await bribeController.getVotesForGauge(1)).deep.eq([])
        expect(await bribeController.getVotesForGauge(2)).deep.eq([])
        expect(await bribeController.getVotesForGauge(3)).deep.eq([])
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(10000)
        expect(await bribeController.getAvailableVotePowerBPS(voter2.address)).eq(10000)
        expect(await bribeController.getAvailableVotePowerBPS(voter3.address)).eq(10000)
        expect(await bribeController.getAvailableVotePowerBPS(voter4.address)).eq(10000)
        expect(await bribeController.getClaimableBribes(voter1.address)).deep.eq([]);
        expect(await bribeController.getClaimableBribes(voter2.address)).deep.eq([]);
        expect(await bribeController.getClaimableBribes(voter3.address)).deep.eq([]);
        expect(await bribeController.getClaimableBribes(voter4.address)).deep.eq([]);
      })
      after(async function () {
        await bribeController.connect(governor).rescueTokens([bribeToken1.address, bribeToken2.address], revenueRouter.address)
      });
    });

    /*********************
      INTENTION STATEMENT 
    *********************/
    /**
     * briber1 will provide bribe for gaugeID 1 with 100 of bribeToken1, 100 of bribeToken2
     * anon will provide bribe for gaugeID 1 with 100 of bribeToken1, 100 of bribeToken2
     * voter1 will vote with all available votepower for gaugeID 1
     */

    describe("multiple bribers scenario", () => {
      const GAUGE_ID = 1;

      before(async function () {
        await bribeToken1.connect(briber1).transfer(anon.address, BRIBE_AMOUNT.mul(2));
        await bribeToken1.connect(anon).approve(bribeController.address, constants.MaxUint256);
        await bribeToken2.connect(briber1).transfer(anon.address, BRIBE_AMOUNT.mul(2));
        await bribeToken2.connect(anon).approve(bribeController.address, constants.MaxUint256);
        await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], GAUGE_ID)
        await bribeController.connect(anon).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], GAUGE_ID)
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([BN.from("1")])
        const bribes1 = await bribeController.getProvidedBribesForGauge(GAUGE_ID);
        expect(bribes1[0].bribeToken).eq(bribeToken1.address)
        expect(bribes1[1].bribeToken).eq(bribeToken2.address)
        expect(bribes1[0].bribeAmount).eq(BRIBE_AMOUNT.mul(2))
        expect(bribes1[1].bribeAmount).eq(BRIBE_AMOUNT.mul(2))
      });
      it("can vote", async () => {
        const votePowerBPS = await bribeController.getAvailableVotePowerBPS(voter1.address);
        await bribeController.connect(voter1).voteForBribe(voter1.address, GAUGE_ID, votePowerBPS);
      })
      it("processBribes will change state as expected", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        await gaugeController.connect(governor).updateGaugeWeights({gasLimit: CUSTOM_GAS_LIMIT});
        await voting.connect(governor).chargePremiums({gasLimit: CUSTOM_GAS_LIMIT});

        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        await bribeController.connect(anon).processBribes({gasLimit: CUSTOM_GAS_LIMIT});

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(revenueRouter.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2)
        
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2).eq(0)

        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([])
        expect(await bribeController.getProvidedBribesForGauge(1)).deep.eq([])
        expect(await bribeController.getVotesForVoter(voter1.address)).deep.eq([])
        expect(await bribeController.getVotesForGauge(1)).deep.eq([])
        expect(await bribeController.getUnusedVotePowerBPS(voter1.address)).eq(0)
        expect(await bribeController.getAvailableVotePowerBPS(voter1.address)).eq(10000)
      });
      it("getClaimableBribes", async () => {
        const claim1 = await bribeController.getClaimableBribes(voter1.address);
        expect(claim1[0].bribeToken).eq(bribeToken1.address)
        expect(claim1[1].bribeToken).eq(bribeToken2.address)
        expect(claim1[0].bribeAmount).eq(BRIBE_AMOUNT.mul(2))
        expect(claim1[1].bribeAmount).eq(BRIBE_AMOUNT.mul(2))
      })
      it("can claimBribes", async () => {
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken1.balanceOf(revenueRouter.address)

        const tx1 = await bribeController.connect(voter1).claimBribes();
        await expect(tx1).to.emit(bribeController, "BribeClaimed");

        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(voter1.address)
        const NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(voter1.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(revenueRouter.address)
        const NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = await bribeToken1.balanceOf(revenueRouter.address)

        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_1.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2 = NEW_VOTER_1_BALANCE_BRIBE_TOKEN_2.sub(OLD_VOTER_1_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2.sub(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1)
        const CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2 = NEW_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2.sub(OLD_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2)

        expectClose(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_1, BRIBE_AMOUNT.mul(2), 1e3);
        expectClose(CHANGE_VOTER_1_BALANCE_BRIBE_TOKEN_2, BRIBE_AMOUNT.mul(2), 1e3);
        expectClose(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1, BRIBE_AMOUNT.mul(-2), 1e4);
        expectClose(CHANGE_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2, BRIBE_AMOUNT.mul(-2), 1e4);
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_1).eq(0)
        expect(CHANGE_REVENUE_ROUTER_BALANCE_BRIBE_TOKEN_2).eq(0)
        expect(await bribeController.getClaimableBribes(briber1.address)).deep.eq([]);
      })
    });


    /*********************
      INTENTION STATEMENT 
    *********************/
    /**
     * We will create 46 new gauges, for a total of 50
     * We will create 25 new voters with equivalent locks, who all delegate to delegate1
     * briber1 will allocate { 100 of bribeToken1, 100 of bribeToken 2 } to each of these gauges
     * All new voters will allocate 2% of votePowerBPS to each gauge
     */

    describe("stress test with 25 voters and 50 gauges", () => {
      const TOTAL_GAUGES = 50;
      const TOTAL_VOTERS = 25;
      let WALLET_ARRAY: Wallet[] = []
      let VOTER_ARRAY: string[] = []

      before(async function () {
        // Create 46 new gauges
        const tx1 = await gaugeController.connect(governor).addGauge("X", ONE_PERCENT)
        let nonce1 = tx1.nonce
        const promises = []
        for (let i = 0; i < TOTAL_GAUGES - 5; i++) {
          nonce1 += 1;
          promises.push(gaugeController.connect(governor).addGauge("X", ONE_PERCENT, {nonce: nonce1}))
        }

        // Create 25 new voters with equivalent locks, and all setDelegate to delegate1
        for (let i = 0; i < TOTAL_VOTERS; i++) {
          WALLET_ARRAY.push(ethers.Wallet.createRandom().connect(provider))
        }

        const lock = await underwritingLocker.locks(1)
        const tx2 = await underwritingLocker.connect(deployer).createLock(WALLET_ARRAY[0].address, lock.amount, lock.end);
        let nonce2 = tx2.nonce
        nonce2 += 1;
        await deployer.sendTransaction({to: WALLET_ARRAY[0].address, value: ONE_ETHER.div(10)})
        promises.push(voting.connect(WALLET_ARRAY[0]).setDelegate(delegate1.address));

        for (let i = 1; i < TOTAL_VOTERS; i++) {
          nonce2 += 1;
          promises.push(deployer.sendTransaction({to: WALLET_ARRAY[i].address, value: ONE_ETHER.div(10), nonce: nonce2}))
          promises.push(voting.connect(WALLET_ARRAY[i]).setDelegate(delegate1.address));
        }

        for (let i = 1; i < TOTAL_VOTERS; i++) {
          nonce2 += 1;
          promises.push(underwritingLocker.connect(deployer).createLock(WALLET_ARRAY[i].address, lock.amount, lock.end, {nonce: nonce2}))
        }

        // Briber1 will allocate { 100 of bribeToken1, 100 of bribeToken 2 } to each of these 50 gauges

        const tx3 = await bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], 1);
        let nonce3 = tx3.nonce;

        for (let i = 2; i < TOTAL_GAUGES + 1; i++) {
          nonce3 += 1;
          promises.push(bribeController.connect(briber1).provideBribes([bribeToken1.address, bribeToken2.address], [BRIBE_AMOUNT, BRIBE_AMOUNT], i, {nonce: nonce3}));
        }

        await Promise.all(promises);
        VOTER_ARRAY = WALLET_ARRAY.map(voter => voter.address)

        // All new voters will allocate 2% of votePowerBPS to each of the 50 gauges
        const votePowerBPSArray = []
        const gaugeArray = []

        for (let i = 1; i < TOTAL_GAUGES + 1; i++) {
          votePowerBPSArray.push(10000 / TOTAL_GAUGES);
          gaugeArray.push(i);
        }

        const promises2 = []
        const tx4 = await bribeController.connect(delegate1).voteForMultipleBribes(VOTER_ARRAY[0], gaugeArray, votePowerBPSArray);
        let nonce4 = tx4.nonce
        for (let i = 1; i < TOTAL_VOTERS; i++) {
          nonce4 += 1;
          promises2.push(bribeController.connect(delegate1).voteForMultipleBribes(VOTER_ARRAY[i], gaugeArray, votePowerBPSArray, {nonce: nonce4}))
        }
        await Promise.all(promises2);

        const promises3 = []
        for (let i = 0; i < TOTAL_VOTERS; i++) {
          promises3.push(bribeController.getUnusedVotePowerBPS(VOTER_ARRAY[i]))
        }
        const unusedVotePowerBPSArray = await Promise.all(promises3)
        for (let i = 0; i < TOTAL_VOTERS; i++) {
          expect(unusedVotePowerBPSArray[i]).eq(0)
        }

      });
      it("processBribes will change state as expected", async () => {
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
        await provider.send("evm_mine", [CURRENT_TIME + ONE_WEEK]);
        const EPOCH_START_TIME = await bribeController.getEpochStartTimestamp()

        {
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
        }

        {
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
        }

        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)

        {
          let counter = 0;
          while (true) {
            counter += 1;
            const tx = await bribeController.connect(anon).processBribes({gasLimit: CUSTOM_GAS_LIMIT})

            if ((await bribeController.lastTimeBribesProcessed()).lt(EPOCH_START_TIME)) {
              await expect(tx).to.emit(bribeController, "IncompleteBribesProcessing");
              continue;
            } else {
              await expect(tx).to.emit(bribeController, "BribesProcessed").withArgs(EPOCH_START_TIME);
              break;
            }
          }
          console.log(`Required ${counter} iterations of processBribes()`)
        }

        // CHECK BRIBE TOKEN BALANCES
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1 = await bribeToken1.balanceOf(bribeController.address)
        const NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2 = await bribeToken2.balanceOf(bribeController.address)
        expect(NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1).eq(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_1)
        expect(NEW_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2).eq(OLD_BRIBING_CONTROLLER_BALANCE_BRIBE_TOKEN_2)

        // CHECK MAPPINGS
        expect(await bribeController.getAllGaugesWithBribe()).deep.eq([])

        // CHECK GAUGE MAPPINGS
        const gauge_promises = []

        for (let i = 0; i < TOTAL_GAUGES; i++) {
          gauge_promises.push(bribeController.getProvidedBribesForGauge(i))
          gauge_promises.push(bribeController.getVotesForGauge(i))
        }

        const GAUGE_MAPPINGS_ARRAY = await Promise.all(gauge_promises);

        for (let i = 0; i < GAUGE_MAPPINGS_ARRAY.length; i++) {
          expect(GAUGE_MAPPINGS_ARRAY[i]).deep.eq([]);
        }

        // CHECK VOTER MAPPINGS

        const voter_promises_1 = []

        for (let i = 0; i < TOTAL_VOTERS; i++) {
          voter_promises_1.push(bribeController.getVotesForVoter(VOTER_ARRAY[i]))
        }

        const VOTER_VOTES_ARRAY = await Promise.all(voter_promises_1);

        for (let i = 0; i < VOTER_VOTES_ARRAY.length; i++) {
          expect(VOTER_VOTES_ARRAY[i]).deep.eq([]);
        }

        const voter_promises_2 = []

        for (let i = 0; i < TOTAL_VOTERS; i++) {
          voter_promises_2.push(bribeController.getAvailableVotePowerBPS(VOTER_ARRAY[i]))
        }

        const availableVotePowerBPSArray = await Promise.all(voter_promises_2);

        for (let i = 0; i < VOTER_VOTES_ARRAY.length; i++) {
          expect(availableVotePowerBPSArray[i]).eq(10000);
        }
      });
      it("getClaimableBribes", async () => {
        const claim_promises = []

        for (let i = 0; i < TOTAL_VOTERS; i++) {
          claim_promises.push(bribeController.getClaimableBribes(VOTER_ARRAY[i]));
        }

        const CLAIMS_ARRAY = await Promise.all(claim_promises);

        for (let i = 0; i < CLAIMS_ARRAY.length; i++) {
          const claim = CLAIMS_ARRAY[i]
          expect(claim[0].bribeToken).eq(bribeToken1.address)
          expect(claim[1].bribeToken).eq(bribeToken2.address)
          expectClose(claim[0].bribeAmount, BRIBE_AMOUNT.mul(TOTAL_GAUGES).div(TOTAL_VOTERS), 1e15)
          expectClose(claim[1].bribeAmount, BRIBE_AMOUNT.mul(TOTAL_GAUGES).div(TOTAL_VOTERS), 1e15)
        }
      })
      it("claimBribes", async () => {
        const claim_promises = [];
        const old_balance_promises = [];
        const new_balance_promises = [];

        for (let i = 0; i < TOTAL_VOTERS; i++) {
          old_balance_promises.push(bribeToken1.balanceOf(VOTER_ARRAY[i]))
          old_balance_promises.push(bribeToken2.balanceOf(VOTER_ARRAY[i]))
          claim_promises.push(bribeController.connect(WALLET_ARRAY[i]).claimBribes())
        }

        const OLD_BALANCE_ARRAY = await Promise.all(old_balance_promises)
        await Promise.all(claim_promises)

        for (let i = 0; i < TOTAL_VOTERS; i++) {
          new_balance_promises.push(bribeToken1.balanceOf(VOTER_ARRAY[i]))
          new_balance_promises.push(bribeToken2.balanceOf(VOTER_ARRAY[i]))
        }

        const NEW_BALANCE_ARRAY = await Promise.all(new_balance_promises)

        for (let i = 0; i < NEW_BALANCE_ARRAY.length; i++) {
          expectClose(NEW_BALANCE_ARRAY[i].sub(OLD_BALANCE_ARRAY[i]), BRIBE_AMOUNT.mul(TOTAL_GAUGES).div(TOTAL_VOTERS), 1e12)
        }
      })
      after(async function () {
        await bribeController.connect(governor).rescueTokens([bribeToken1.address, bribeToken2.address], revenueRouter.address)
      });
    });

});