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
const DEADLINE = constants.MaxUint256;
const DEPOSIT_AMOUNT = ONE_ETHER;
const WITHDRAW_AMOUNT = ONE_ETHER;
const DEFAULT_VOTE_BATCH_SIZE = 500;

describe("UnderwritingLockVoting", function () {
    const [deployer, governor, revenueRouter, owner1, manager1, manager2] = provider.getWallets();
  
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
          gaugeController = (await deployContract(deployer, artifacts.GaugeController, [governor.address])) as GaugeController;
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
          expect(await voting.voteBatchSize()).eq(DEFAULT_VOTE_BATCH_SIZE);
          expect(await voting.lastTimeAllVotesProcessed()).eq(0);
          expect(await voting.lastTimePremiumsCharged()).eq(0);
          expect(await voting.WEEK()).eq(ONE_WEEK);
          expect(await voting.MONTH()).eq(ONE_MONTH);
        });
        it("getEpochStartTimestamp gets current timestamp rounded down to a multiple of WEEK ", async function () {
          const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
          expect(await voting.getEpochStartTimestamp()).eq(Math.floor((CURRENT_TIME / ONE_WEEK) * ONE_WEEK))
        });
        it("getEpochEndTimestamp() == getEpochStartTimestamp() + ONE_WEEK ", async function () {
          expect(await voting.getEpochEndTimestamp()).eq((await voting.getEpochStartTimestamp()).add(ONE_WEEK))
        });
        it("getVotePower should throw for an invalid lockID", async function () {
          await expect(voting.getVotePower(1)).to.be.revertedWith("query for nonexistent token")
        });
        it("getVote should throw for an invalid lockID", async function () {
          await expect(voting.getVote(1)).to.be.revertedWith("VoteNotFound")
        });
        it("processVotes should do nothing", async function () {
          const tx = await voting.connect(governor).processVotes();
          await expect(tx).to.not.emit(voting, "AllVotesProcessed");
          expect(await voting.lastTimeAllVotesProcessed()).eq(0)
        });
        it("chargePremiums should revert", async function () {
          await expect(voting.connect(governor).chargePremiums()).to.be.revertedWith("LastEpochVotesNotProcessed")
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

    describe("setVoteBatchSize", () => {
        it("non governor cannot set vote batch size", async function () {
          await expect(voting.connect(owner1).setVoteBatchSize(1)).to.be.revertedWith("!governance");
        });
        it("governor can set vote batch size", async function () {
            const tx = await voting.connect(governor).setVoteBatchSize(1);
            await expect(tx).to.emit(voting, "VoteBatchSizeSet").withArgs(1);
            await voting.connect(governor).setVoteBatchSize(DEFAULT_VOTE_BATCH_SIZE); 
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

    describe("setLockManager", () => {
        // Create four locks for owner1, lockID 1 => 1yr, lockID 2 => 2yr, lockID 3 => 3yr, lockID 4 => 4yr
        before(async function () {
            const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
            await token.connect(deployer).transfer(owner1.address, ONE_ETHER.mul(100))
            await token.connect(owner1).approve(underwritingLocker.address, constants.MaxUint256)
            await underwritingLocker.connect(owner1).createLock(owner1.address, DEPOSIT_AMOUNT, CURRENT_TIME + ONE_YEAR);
            await underwritingLocker.connect(owner1).createLock(owner1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 2 * ONE_YEAR);
            await underwritingLocker.connect(owner1).createLock(owner1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 3 * ONE_YEAR);
            await underwritingLocker.connect(owner1).createLock(owner1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR);
            expect(await voting.lockManagerOf(1)).eq(ZERO_ADDRESS)
            expect(await voting.lockManagerOf(2)).eq(ZERO_ADDRESS)
            expect(await voting.lockManagerOf(3)).eq(ZERO_ADDRESS)
            expect(await voting.lockManagerOf(4)).eq(ZERO_ADDRESS)
        });
        it("cannot set for non-existent lock", async function () {
          await expect(voting.connect(manager1).setLockManager(5, manager1.address)).to.be.revertedWith("ERC721: invalid token ID");          
        })
        it("non-owner cannot set manager", async function () {
            await expect(voting.connect(manager1).setLockManager(1, manager1.address)).to.be.revertedWith("NotOwner");
        })
        it("owner can set manager", async function () {
            const tx = await voting.connect(owner1).setLockManager(1, manager1.address);
            await expect(tx).to.emit(voting, "LockManagerSet").withArgs(1, manager1.address);
            expect(await voting.lockManagerOf(1)).eq(manager1.address)
        })
        it("owner can set manager again", async function () {
            const tx = await voting.connect(owner1).setLockManager(1, manager2.address);
            await expect(tx).to.emit(voting, "LockManagerSet").withArgs(1, manager2.address);
            expect(await voting.lockManagerOf(1)).eq(manager2.address)
            await voting.connect(owner1).setLockManager(1, manager1.address);
            expect(await voting.lockManagerOf(1)).eq(manager1.address)
        })
    });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * There are four locks owned by owner1:
   * lockID 1 => 1e18 locked for 1 yr, managed by manager1
   * lockID 2 => 1e18 locked for 2 yrs
   * lockID 3 => 1e18 locked for 3 yrs
   * lockID 4 => 1e18 locked for 4 yrs
   */

  describe("setLockManagerMultiple", () => {
    it("must provide argument arrays of matching length", async function () {
        await expect(voting.connect(owner1).setLockManagerMultiple([2, 3], [manager1.address])).to.be.revertedWith("ArrayArgumentsLengthMismatch");
      });
    it("cannot set for non-existent lock", async function () {
      await expect(voting.connect(manager1).setLockManagerMultiple([5, 3], [manager1.address, manager1.address])).to.be.revertedWith("ERC721: invalid token ID");          
    })
    it("non-owner cannot set manager", async function () {
        await expect(voting.connect(manager1).setLockManagerMultiple([2, 3], [manager1.address, manager1.address])).to.be.revertedWith("NotOwner");
    })
    it("owner can set multiple manager", async function () {
        const tx = await voting.connect(owner1).setLockManagerMultiple([2, 3], [manager1.address, manager1.address]);
        await expect(tx).to.emit(voting, "LockManagerSet").withArgs(2, manager1.address);
        await expect(tx).to.emit(voting, "LockManagerSet").withArgs(3, manager1.address);
        expect(await voting.lockManagerOf(2)).eq(manager1.address)
        expect(await voting.lockManagerOf(3)).eq(manager1.address)
    })
    it("owner can set manager again", async function () {
        const tx = await voting.connect(owner1).setLockManagerMultiple([2, 3], [manager2.address, manager2.address]);
        await expect(tx).to.emit(voting, "LockManagerSet").withArgs(2, manager2.address);
        await expect(tx).to.emit(voting, "LockManagerSet").withArgs(3, manager2.address);
        expect(await voting.lockManagerOf(2)).eq(manager2.address)
        expect(await voting.lockManagerOf(3)).eq(manager2.address)
    })
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * There are four locks owned by owner1:
   * lockID 1 => 1e18 locked for 1 yr, managed by manager1
   * lockID 2 => 1e18 locked for 2 yrs, managed by manager2
   * lockID 3 => 1e18 locked for 3 yrs, managed by manager2
   * lockID 4 => 1e18 locked for 4 yrs
   */


});