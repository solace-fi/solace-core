import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { MockErc20Permit, UnderwritingLocker, Registry, MockUnderwritingLockListener } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";
import { expectClose } from "./../utilities/math";
import { getERC20PermitSignature } from "../utilities/getERC20PermitSignature";

/*******************
    STYLE GUIDE
*******************/
// Capitalised snake case for `primitive` type variables
// Camel case for objects and arrays
// Prefer 'const' over 'let' when possible

/*******************
  GLOBAL CONSTANTS
*******************/
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_MILLION_ETHER = ONE_ETHER.mul(1000000);
const ONE_YEAR = 31536000; // in seconds
const ONE_MONTH = ONE_YEAR / 12;
const ONE_WEEK = 604800; // in seconds
const DEADLINE = constants.MaxUint256;
const DEPOSIT_AMOUNT = ONE_ETHER;

describe("UnderwritingLocker", function () {
  const [deployer, governor, revenueRouter, user1, user2, user3] = provider.getWallets();

  /***************************
     VARIABLE DECLARATIONS
  ***************************/
  let token: MockErc20Permit;
  let registry: Registry;
  let underwritingLocker: UnderwritingLocker;
  let listener: MockUnderwritingLockListener;
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

    // Deploy listener
    listener = (await deployContract(deployer, artifacts.MockUnderwritingLockListener)) as MockUnderwritingLockListener;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("reverts if zero address governance", async function () {
      await expect(deployContract(deployer, artifacts.UnderwritingLocker, [ZERO_ADDRESS, registry.address])).to.be.revertedWith("zero address governance");
    });
    it("reverts if zero address registry", async function () {
      await expect(deployContract(deployer, artifacts.UnderwritingLocker, [governor.address, ZERO_ADDRESS])).to.be.revertedWith('ZeroAddressInput("registry")');
    });
    it("reverts if zero address revenueRouter in Registry", async function () {
      await expect(deployContract(deployer, artifacts.UnderwritingLocker, [governor.address, registry.address])).to.be.revertedWith('ZeroAddressInput("revenueRouter")');
      await registry.connect(governor).set(["revenueRouter"], [revenueRouter.address]);
    });
    it("reverts if zero address uwe in Registry", async function () {
      await expect(deployContract(deployer, artifacts.UnderwritingLocker, [governor.address, registry.address])).to.be.revertedWith('ZeroAddressInput("uwe")');
      await registry.connect(governor).set(["uwe"], [token.address]);
    });
    it("deploys", async function () {
      underwritingLocker = (await deployContract(deployer, artifacts.UnderwritingLocker, [governor.address, registry.address])) as UnderwritingLocker;
      await expectDeployed(underwritingLocker.address);
    });
    it("initializes properly", async function () {
      expect(await underwritingLocker.name()).eq("Underwriting Lock");
      expect(await underwritingLocker.symbol()).eq("UnderwritingLock");
      expect(await underwritingLocker.token()).eq(token.address);
      expect(await underwritingLocker.revenueRouter()).eq(revenueRouter.address);
      expect(await underwritingLocker.votingContract()).eq(ZERO_ADDRESS);
      expect(await underwritingLocker.registry()).eq(registry.address);
      expect(await underwritingLocker.totalNumLocks()).eq(0);
      expect(await underwritingLocker.MIN_LOCK_DURATION()).eq(ONE_YEAR / 2);
      expect(await underwritingLocker.MAX_LOCK_DURATION()).eq(4 * ONE_YEAR);
      await expect(underwritingLocker.locks(0)).to.be.revertedWith("query for nonexistent token");
      expect(await underwritingLocker.totalStakedBalance(user1.address)).eq(0);
      expect(await underwritingLocker.getLockListeners()).deep.eq([]);
      expect(await underwritingLocker.balanceOf(user1.address)).eq(0);
      expect(await underwritingLocker.totalSupply()).eq(0);
    });
  });

  describe("governance", () => {
    it("starts with the correct governor", async () => {
      expect(await underwritingLocker.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async  () => {
      await expect(underwritingLocker.connect(user1).setPendingGovernance(user1.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async () => {
      let tx = await underwritingLocker.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(underwritingLocker, "GovernancePending").withArgs(deployer.address);
      expect(await underwritingLocker.governance()).to.equal(governor.address);
      expect(await underwritingLocker.pendingGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async () => {
      await expect(underwritingLocker.connect(user1).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async () => {
      let tx = await underwritingLocker.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(underwritingLocker, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await underwritingLocker.governance()).to.equal(deployer.address);
      await underwritingLocker.connect(deployer).setPendingGovernance(governor.address);
      await underwritingLocker.connect(governor).acceptGovernance();
    });
  });

  describe("addLockListener & removeLockListener", () => {
    it("non governor cannot add or remove listener", async function () {
      await expect(underwritingLocker.connect(user1).addLockListener(user1.address)).to.be.revertedWith("!governance");
      await expect(underwritingLocker.connect(user1).removeLockListener(user1.address)).to.be.revertedWith("!governance");
    });
    it("governor can add a listener", async function () {
      expect(await underwritingLocker.getLockListeners()).deep.eq([]);
      const tx = await underwritingLocker.connect(governor).addLockListener(listener.address);
      await expect(tx).to.emit(underwritingLocker, "LockListenerAdded").withArgs(listener.address);
      expect(await underwritingLocker.getLockListeners()).deep.eq([listener.address]);
    });
    it("governor can remove a listener", async function () {
      const add_tx = await underwritingLocker.connect(governor).addLockListener(user1.address);
      await expect(add_tx).to.emit(underwritingLocker, "LockListenerAdded").withArgs(user1.address);
      expect(await underwritingLocker.getLockListeners()).deep.eq([listener.address, user1.address]);

      const remove_tx = await underwritingLocker.connect(governor).removeLockListener(user1.address);
      await expect(remove_tx).to.emit(underwritingLocker, "LockListenerRemoved").withArgs(user1.address);
      expect(await underwritingLocker.getLockListeners()).deep.eq([listener.address]);
    });
  });

  describe("setVotingContract", () => {
    it("non governor cannot set voting contract approval", async function () {
      await expect(underwritingLocker.connect(user1).setVotingContract()).to.be.revertedWith("!governance");
    });
    it("non governor cannot set voting contract if not set in Registry", async function () {
      await expect(underwritingLocker.connect(governor).setVotingContract()).to.be.revertedWith('ZeroAddressInput("underwritingLockVoting")');
    });
    it("governor can set voting contract", async function () {
      const RANDOM_ADDRESS = ethers.Wallet.createRandom().connect(provider).address;
      await registry.connect(governor).set(["underwritingLockVoting"], [RANDOM_ADDRESS]);
      const tx = await underwritingLocker.connect(governor).setVotingContract();
      await expect(tx).to.emit(token, "Approval").withArgs(underwritingLocker.address, RANDOM_ADDRESS, constants.MaxUint256);
      await expect(tx).to.emit(underwritingLocker, "VotingContractSet").withArgs(RANDOM_ADDRESS);
      expect(await token.allowance(underwritingLocker.address, RANDOM_ADDRESS)).eq(constants.MaxUint256);
      expect(await underwritingLocker.votingContract()).eq(RANDOM_ADDRESS);
    });
    it("old approval revoked when new voting contract set", async function () {
      const OLD_VOTING_CONTRACT_ADDRESS = await underwritingLocker.votingContract();
      const RANDOM_ADDRESS = ethers.Wallet.createRandom().connect(provider).address;
      await registry.connect(governor).set(["underwritingLockVoting"], [RANDOM_ADDRESS]);
      const tx = await underwritingLocker.connect(governor).setVotingContract();
      await expect(tx).to.emit(token, "Approval").withArgs(underwritingLocker.address, OLD_VOTING_CONTRACT_ADDRESS, 0);
      await expect(tx).to.emit(token, "Approval").withArgs(underwritingLocker.address, RANDOM_ADDRESS, constants.MaxUint256);
      await expect(tx).to.emit(underwritingLocker, "VotingContractSet").withArgs(RANDOM_ADDRESS);
      expect(await token.allowance(underwritingLocker.address, OLD_VOTING_CONTRACT_ADDRESS)).eq(0);
      expect(await token.allowance(underwritingLocker.address, RANDOM_ADDRESS)).eq(constants.MaxUint256);
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
      await expect(underwritingLocker.connect(user1).setRegistry(registry2.address)).to.be.revertedWith("!governance");
    })
    it("reverts if zero address registry", async function () {
      await expect(underwritingLocker.connect(governor).setRegistry(ZERO_ADDRESS)).to.be.revertedWith('ZeroAddressInput("registry")');
    });
    it("reverts if zero address revenueRouter in Registry", async function () {
      await expect(underwritingLocker.connect(governor).setRegistry(registry2.address)).to.be.revertedWith('ZeroAddressInput("revenueRouter")');
      await registry2.connect(governor).set(["revenueRouter"], [RANDOM_ADDRESS_1]);
    });
    it("reverts if zero address uwe in Registry", async function () {
      await expect(underwritingLocker.connect(governor).setRegistry(registry2.address)).to.be.revertedWith('ZeroAddressInput("uwe")');
      await registry2.connect(governor).set(["uwe"], [RANDOM_ADDRESS_2]);
    });
    it("sets registry", async function () {
      const tx = await underwritingLocker.connect(governor).setRegistry(registry2.address);
      await expect(tx).to.emit(underwritingLocker, "RegistrySet").withArgs(registry2.address);
    });
    it("copies Registry addresses to own state variables", async function () {
      expect(await underwritingLocker.registry()).eq(registry2.address);
      expect(await underwritingLocker.revenueRouter()).eq(RANDOM_ADDRESS_1);
      expect(await underwritingLocker.token()).eq(RANDOM_ADDRESS_2);
    });
    after(async function () {
      await underwritingLocker.connect(governor).setRegistry(registry.address);
    });
  });

  describe("createLock", function () {
    it("cannot create lock with no allowance", async function () {
      await expect(underwritingLocker.connect(user1).createLock(user1.address, 1, 0)).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("cannot create lock with no balance", async function () {
      await token.connect(user1).approve(underwritingLocker.address, constants.MaxUint256);
      await expect(underwritingLocker.connect(user1).createLock(user1.address, 1, 0)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot create lock below minimum duration", async function () {
      await token.connect(deployer).transfer(user1.address, ONE_ETHER.mul(100));
      // await provider.send("evm_mine", []);
      const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
      await expect(underwritingLocker.connect(user1).createLock(user1.address, 1, CURRENT_TIME)).to.be.revertedWith("LockTimeTooShort");
    });
    it("cannot create lock above maximum duration", async function () {
      const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
      await expect(underwritingLocker.connect(user1).createLock(user1.address, 1, CURRENT_TIME + 4 * ONE_YEAR + 100)).to.be.revertedWith("LockTimeTooLong");
    });
    it("cannot create lock with 0 deposit", async function () {
      const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
      await expect(underwritingLocker.connect(user1).createLock(user1.address, 0, CURRENT_TIME + ONE_YEAR)).to.be.revertedWith("CannotCreateEmptyLock");
    });
    it("can create a lock, and listener notified", async function () {
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const {timestamp: CURRENT_TIME, number: CURRENT_BLOCK} = await provider.getBlock('latest')

      const tx = await underwritingLocker.connect(user1).createLock(user1.address, DEPOSIT_AMOUNT, CURRENT_TIME + ONE_YEAR);
      const LOCK_ID = await underwritingLocker.totalNumLocks();
      expect(LOCK_ID).eq(1);
      await expect(tx).to.emit(underwritingLocker, "LockCreated").withArgs(LOCK_ID);
      await expect(tx).to.emit(underwritingLocker, "Transfer").withArgs(ZERO_ADDRESS, user1.address, LOCK_ID)

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      expect(globalStateChange.totalNumLocks.eq(1));
      expect(globalStateChange.totalStakedAmount.eq(DEPOSIT_AMOUNT));
      expect(globalStateChange.totalSupply).eq(1)
      expect(userStateChange.lockedTokenAmount).eq(DEPOSIT_AMOUNT);
      expect(userStateChange.numOfLocks).eq(1);
      expect(userStateChange.tokenAmountInWallet).eq(DEPOSIT_AMOUNT.mul(-1));

      const lock = await underwritingLocker.locks(LOCK_ID);
      expect(lock.amount).eq(DEPOSIT_AMOUNT);
      expect(lock.end).eq(CURRENT_TIME + ONE_YEAR);
      expect(await underwritingLocker.ownerOf(LOCK_ID)).eq(user1.address);
      expect(await underwritingLocker.isLocked(LOCK_ID)).eq(true);
      expect(await underwritingLocker.timeLeft(LOCK_ID)).eq(ONE_YEAR - 1); // 1s seems to have passed in Hardhat environment at this point, from our initial query for CURRENT_TIME

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(ZERO_ADDRESS);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(0);
      expect(listenerUpdate.oldLock.end).eq(0);
      expect(listenerUpdate.newLock.amount).eq(lock.amount);
      expect(listenerUpdate.newLock.end).eq(lock.end);
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * user1 has 99e18 tokens
   * 
   * There are one lock:
   * i.) lockID 1 => One-year lock held by user1, with 1e18 token locked
   */

  describe("createLockSigned", function () {
    it("cannot create lock with no balance", async function () {
      const { v, r, s } = await getERC20PermitSignature(user2, underwritingLocker, token, DEPOSIT_AMOUNT, DEADLINE);
      await expect(underwritingLocker.connect(user2).createLockSigned(DEPOSIT_AMOUNT, 0, DEADLINE, v, r, s)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot deposit with invalid permit", async function () {
      const { v, r, s } = await getERC20PermitSignature(user2, underwritingLocker, token, DEPOSIT_AMOUNT, DEADLINE);
      await expect(underwritingLocker.connect(user2).createLockSigned(2, 0, DEADLINE, v, r, s)).to.be.revertedWith("ERC20Permit: invalid signature");
    });
    it("cannot create lock below minimum duration", async function () {
      const { v, r, s } = await getERC20PermitSignature(user1, underwritingLocker, token, DEPOSIT_AMOUNT, DEADLINE);
      const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
      await expect(underwritingLocker.connect(user1).createLockSigned(DEPOSIT_AMOUNT, CURRENT_TIME, DEADLINE, v, r, s)).to.be.revertedWith("LockTimeTooShort");
    });
    it("cannot create lock above maximum duration", async function () {
      const { v, r, s } = await getERC20PermitSignature(user1, underwritingLocker, token, DEPOSIT_AMOUNT, DEADLINE);
      const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
      await expect(underwritingLocker.connect(user1).createLockSigned(DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR + 100, DEADLINE, v, r, s)).to.be.revertedWith("LockTimeTooLong");
    });
    it("can create a lock, and listener alerted", async function () {
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const {timestamp: CURRENT_TIME, number: CURRENT_BLOCK} = await provider.getBlock('latest')

      const { v, r, s } = await getERC20PermitSignature(user1, underwritingLocker, token, DEPOSIT_AMOUNT, DEADLINE);
      const tx = await underwritingLocker.connect(user1).createLockSigned(DEPOSIT_AMOUNT, CURRENT_TIME + ONE_YEAR, DEADLINE, v, r, s);
      const LOCK_ID = await underwritingLocker.totalNumLocks();
      expect(LOCK_ID).eq(2);
      await expect(tx).to.emit(underwritingLocker, "LockCreated").withArgs(LOCK_ID);
      await expect(tx).to.emit(underwritingLocker, "Transfer").withArgs(ZERO_ADDRESS, user1.address, LOCK_ID)

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      expect(globalStateChange.totalNumLocks.eq(1));
      expect(globalStateChange.totalStakedAmount.eq(DEPOSIT_AMOUNT));
      expect(globalStateChange.totalSupply).eq(1)
      expect(userStateChange.lockedTokenAmount).eq(DEPOSIT_AMOUNT);
      expect(userStateChange.numOfLocks).eq(1);
      expect(userStateChange.tokenAmountInWallet).eq(DEPOSIT_AMOUNT.mul(-1));

      const lock = await underwritingLocker.locks(LOCK_ID);
      expect(lock.amount).eq(DEPOSIT_AMOUNT);
      expect(lock.end).eq(CURRENT_TIME + ONE_YEAR);
      expect(await underwritingLocker.ownerOf(LOCK_ID)).eq(user1.address);
      expect(await underwritingLocker.isLocked(LOCK_ID)).eq(true);
      expect(await underwritingLocker.timeLeft(LOCK_ID)).eq(ONE_YEAR - 1); // 1s seems to have passed in Hardhat environment at this point, from our initial query for CURRENT_TIME

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(ZERO_ADDRESS);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(0);
      expect(listenerUpdate.oldLock.end).eq(0);
      expect(listenerUpdate.newLock.amount).eq(lock.amount);
      expect(listenerUpdate.newLock.end).eq(lock.end);
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * user1 has 98e18 tokens
   * 
   * There are two locks:
   * i.) lockID 1 => One-year lock held by user1, with 1e18 token locked
   * ii.) lockID 2 => One-year lock held by user1, with 1e18 token locked
   */

  describe("increaseAmount", function () {
    it("cannot deposit with no allowance", async function () {
      await expect(underwritingLocker.connect(user1).increaseAmount(1, 1)).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("cannot deposit to non existant lock", async function () {
      await token.connect(user1).approve(underwritingLocker.address, constants.MaxUint256); // Creating permit in createLockSigned reduced allowance, and token transfer afterwards reduced allowance to 0.
      await expect(underwritingLocker.connect(user1).increaseAmount(999, 1)).to.be.revertedWith("ERC721: invalid token ID");
    });
    it("can increaseAmount, and listener notified", async function () {
      const LOCK_ID = 1;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

      // Deposit 1e18 additional tokens into lockID 1
      let tx = await underwritingLocker.connect(user1).increaseAmount(LOCK_ID, DEPOSIT_AMOUNT);
      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newLockState = await getLockState(LOCK_ID);
      await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID, oldLockState.amount.add(DEPOSIT_AMOUNT), oldLockState.end);
      await expect(tx).to.emit(underwritingLocker, "LockIncreased").withArgs(LOCK_ID, oldLockState.amount.add(DEPOSIT_AMOUNT), DEPOSIT_AMOUNT);

      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const lockStateChange = getLockStateChange(newLockState, oldLockState);
      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(DEPOSIT_AMOUNT));
      expect(globalStateChange.totalSupply).eq(0)
      expect(userStateChange.lockedTokenAmount).eq(DEPOSIT_AMOUNT);
      expect(userStateChange.numOfLocks).eq(0);
      expect(userStateChange.tokenAmountInWallet).eq(DEPOSIT_AMOUNT.mul(-1));
      expect(lockStateChange.amount).eq(DEPOSIT_AMOUNT);
      expect(lockStateChange.end).eq(0);
      expect(oldLockState.isLocked).eq(newLockState.isLocked)

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState.end);
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * user1 has 97e18 tokens
   * 
   * There are two locks:
   * i.) lockID 1 => One-year lock held by user1, with 2e18 token locked
   * ii.) lockID 2 => One-year lock held by user1, with 1e18 token locked
   */

   describe("increaseAmountSigned", function () {
    it("cannot increaseAmountSigned with no balance", async function () {
      const { v, r, s } = await getERC20PermitSignature(user2, underwritingLocker, token, DEPOSIT_AMOUNT, DEADLINE);
      await expect(underwritingLocker.connect(user2).createLockSigned(DEPOSIT_AMOUNT, 0, DEADLINE, v, r, s)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("cannot increaseAmountSigned with invalid permit", async function () {
      const { v, r, s } = await getERC20PermitSignature(user1, underwritingLocker, token, DEPOSIT_AMOUNT, DEADLINE);
      await expect(underwritingLocker.connect(user1).createLockSigned(2, 0, DEADLINE, v, r, s)).to.be.revertedWith("ERC20Permit: invalid signature");
    });
    it("cannot increaseAmountSigned to non existant lock", async function () {
      const { v, r, s } = await getERC20PermitSignature(user1, underwritingLocker, token, DEPOSIT_AMOUNT, DEADLINE);
      await expect(underwritingLocker.connect(user1).increaseAmountSigned(999, DEPOSIT_AMOUNT, DEADLINE, v, r, s)).to.be.revertedWith("ERC721: invalid token ID");
    });
    it("can increaseAmountSigned, and listener notified", async function () {
      const LOCK_ID = 2;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

      // Deposit 1e18 additional tokens into lockID 2
      const { v, r, s } = await getERC20PermitSignature(user1, underwritingLocker, token, DEPOSIT_AMOUNT, DEADLINE);
      let tx = await underwritingLocker.connect(user1).increaseAmountSigned(LOCK_ID, DEPOSIT_AMOUNT, DEADLINE, v, r, s);
      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newLockState = await getLockState(LOCK_ID);
      await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID, oldLockState.amount.add(DEPOSIT_AMOUNT), oldLockState.end);
      await expect(tx).to.emit(underwritingLocker, "LockIncreased").withArgs(LOCK_ID, oldLockState.amount.add(DEPOSIT_AMOUNT), DEPOSIT_AMOUNT);

      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const lockStateChange = getLockStateChange(newLockState, oldLockState);
      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(DEPOSIT_AMOUNT));
      expect(globalStateChange.totalSupply).eq(0)
      expect(userStateChange.lockedTokenAmount).eq(DEPOSIT_AMOUNT);
      expect(userStateChange.numOfLocks).eq(0);
      expect(userStateChange.tokenAmountInWallet).eq(DEPOSIT_AMOUNT.mul(-1));
      expect(lockStateChange.amount).eq(DEPOSIT_AMOUNT);
      expect(lockStateChange.end).eq(0);
      expect(oldLockState.isLocked).eq(newLockState.isLocked)

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState.end);
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * user1 has 96e18 tokens
   * 
   * There are two locks:
   * i.) lockID 1 => One-year lock held by user1, with 2e18 token locked
   * ii.) lockID 2 => One-year lock held by user1, with 2e18 token locked
   */

   describe("increaseAmountMultiple", function () {
    it("must provide argument arrays of matching length", async function () {
      await expect(underwritingLocker.connect(user1).increaseAmountMultiple([1, 2], [DEPOSIT_AMOUNT])).to.be.revertedWith("ArrayArgumentsLengthMismatch");
    });
    it("cannot deposit to a non-existant lock", async function () {
      await expect(underwritingLocker.connect(user1).increaseAmountMultiple([1, 999], [DEPOSIT_AMOUNT, DEPOSIT_AMOUNT])).to.be.revertedWith("ERC721: invalid token ID");
    });
    it("cannot deposit with no allowance", async function () {
      await expect(underwritingLocker.connect(user2).increaseAmountMultiple([1, 2], [DEPOSIT_AMOUNT, DEPOSIT_AMOUNT])).to.be.revertedWith("ERC20: insufficient allowance");
    });
    it("cannot deposit with no balance", async function () {
      await token.connect(user2).approve(underwritingLocker.address, constants.MaxUint256);
      await expect(underwritingLocker.connect(user2).increaseAmountMultiple([1, 2], [DEPOSIT_AMOUNT, DEPOSIT_AMOUNT])).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      await token.connect(user2).approve(underwritingLocker.address, 0);
    });
    it("can increaseAmountMultiple, and listener notified", async function () {
      const LOCK_ID_1 = 1;
      const LOCK_ID_2 = 2;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState1 = await getLockState(LOCK_ID_1);
      const oldLockState2 = await getLockState(LOCK_ID_2);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

      // Deposit 1e18 additional tokens into both lockID 1 and lockID2
      await token.connect(user1).approve(underwritingLocker.address, constants.MaxUint256);
      let tx = await underwritingLocker.connect(user1).increaseAmountMultiple([LOCK_ID_1, LOCK_ID_2], [DEPOSIT_AMOUNT, DEPOSIT_AMOUNT]);

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newLockState1 = await getLockState(LOCK_ID_1);
      const newLockState2 = await getLockState(LOCK_ID_2);
      await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID_1, oldLockState1.amount.add(DEPOSIT_AMOUNT), oldLockState1.end);
      await expect(tx).to.emit(underwritingLocker, "LockIncreased").withArgs(LOCK_ID_1, oldLockState1.amount.add(DEPOSIT_AMOUNT), DEPOSIT_AMOUNT);
      await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID_2, oldLockState2.amount.add(DEPOSIT_AMOUNT), oldLockState2.end);
      await expect(tx).to.emit(underwritingLocker, "LockIncreased").withArgs(LOCK_ID_2, oldLockState2.amount.add(DEPOSIT_AMOUNT), DEPOSIT_AMOUNT);

      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const lockStateChange1 = getLockStateChange(newLockState1, oldLockState1);
      const lockStateChange2 = getLockStateChange(newLockState2, oldLockState2);
      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(DEPOSIT_AMOUNT.mul(2)));
      expect(globalStateChange.totalSupply).eq(0)
      expect(userStateChange.lockedTokenAmount).eq(DEPOSIT_AMOUNT.mul(2));
      expect(userStateChange.numOfLocks).eq(0);
      expect(userStateChange.tokenAmountInWallet).eq(DEPOSIT_AMOUNT.mul(-2));
      expect(lockStateChange1.amount).eq(DEPOSIT_AMOUNT);
      expect(lockStateChange1.end).eq(0);
      expect(oldLockState1.isLocked).eq(newLockState2.isLocked)
      expect(lockStateChange2.amount).eq(DEPOSIT_AMOUNT);
      expect(lockStateChange2.end).eq(0);
      expect(oldLockState2.isLocked).eq(newLockState2.isLocked)

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 2);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCK_ID_2);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState2.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState2.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState2.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState2.end);
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * user1 has 94e18 tokens
   * 
   * There are two locks:
   * i.) lockID 1 => One-year lock held by user1, with 3e18 token locked
   * ii.) lockID 2 => One-year lock held by user1, with 3e18 token locked
   */

  describe("extendLock", function () {
    it("cannot extend non-existant lock", async function () {
      await expect(underwritingLocker.connect(user1).extendLock(999, 1)).to.be.revertedWith("ERC721: invalid token ID");
    });
    it("non-owned or non-approved cannot extend lock", async function () {
      await expect(underwritingLocker.connect(user2).extendLock(1, 1)).to.be.revertedWith("only owner or approved");
    });
    it("cannot extend over four years", async function () {
      const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
      await expect(underwritingLocker.connect(user1).extendLock(1, CURRENT_TIME + ONE_YEAR*4 + ONE_WEEK)).to.be.revertedWith("LockTimeTooLong");
    });
    it("cannot reduce lock duration", async function () {
      const CURRENT_END = (await underwritingLocker.locks(1)).end;
      await expect(underwritingLocker.connect(user1).extendLock(1, CURRENT_END.sub(1))).to.be.revertedWith("LockTimeNotExtended");
    });
    it("owner can extend lock, and listener notified", async function () {
      const LOCK_ID = 1;
      const EXTENSION_TIME = ONE_WEEK;
      const oldLockState = await getLockState(LOCK_ID);
      expect(oldLockState.ownerOf).eq(user1.address)
      const NEW_END = oldLockState.end.add(EXTENSION_TIME);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

      const tx = await underwritingLocker.connect(user1).extendLock(LOCK_ID, NEW_END);
      await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID, oldLockState.amount, NEW_END);
      await expect(tx).to.emit(underwritingLocker, "LockExtended").withArgs(LOCK_ID, NEW_END);

      const newLockState = await getLockState(LOCK_ID);
      const lockStateChange = getLockStateChange(newLockState, oldLockState);
      expect(lockStateChange.amount).eq(0)
      expect(lockStateChange.end).eq(EXTENSION_TIME)

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState.end);
    });
    it("approved can extend, and listener notified", async function () {
      const LOCK_ID = 1;
      const EXTENSION_TIME = ONE_WEEK;
      const oldLockState = await getLockState(LOCK_ID);
      expect(oldLockState.ownerOf).not.eq(user2.address)
      const NEW_END = oldLockState.end.add(EXTENSION_TIME);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

      await underwritingLocker.connect(user1).approve(user2.address, LOCK_ID);
      const tx = await underwritingLocker.connect(user1).extendLock(LOCK_ID, NEW_END);
      await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID, oldLockState.amount, NEW_END);
      await expect(tx).to.emit(underwritingLocker, "LockExtended").withArgs(LOCK_ID, NEW_END);

      const newLockState = await getLockState(LOCK_ID);
      const lockStateChange = getLockStateChange(newLockState, oldLockState);
      expect(lockStateChange.amount).eq(0)
      expect(lockStateChange.end).eq(EXTENSION_TIME)

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 2);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState.end);
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * user1 has 94e18 tokens
   * 
   * There are two locks:
   * i.) lockID 1 => 1yr + 2wk lock held by user1, with 3e18 token locked
   * ii.) lockID 2 => 1yr lock held by user1, with 3e18 token locked
   */

   describe("extendLockMultiple", function () {
    it("must provide argument arrays of matching length", async function () {
      const LOCK_ID_1 = 1;
      const LOCK_ID_2 = 2;
      const CURRENT_END_1 = (await underwritingLocker.locks(LOCK_ID_1)).end;
      const EXTENSION_TIME = ONE_WEEK;

      await expect(underwritingLocker.connect(user1).extendLockMultiple(
        [LOCK_ID_1, LOCK_ID_2], 
        [CURRENT_END_1.add(EXTENSION_TIME)]
      )).to.be.revertedWith("ArrayArgumentsLengthMismatch");
    });
    it("cannot extend non-existant lock", async function () {
      const LOCK_ID_1 = 1;
      const CURRENT_END_1 = (await underwritingLocker.locks(LOCK_ID_1)).end;
      const EXTENSION_TIME = ONE_WEEK;

      await expect(underwritingLocker.connect(user1).extendLockMultiple(
        [LOCK_ID_1, 999], 
        [CURRENT_END_1.add(EXTENSION_TIME), CURRENT_END_1.add(EXTENSION_TIME)]
      )).to.be.revertedWith("ERC721: invalid token ID");
    });
    it("non-owned or non-approved cannot extend lock", async function () {
      const LOCK_ID_1 = 1;
      const LOCK_ID_2 = 2;
      const CURRENT_END_1 = (await underwritingLocker.locks(LOCK_ID_1)).end;
      const CURRENT_END_2 = (await underwritingLocker.locks(LOCK_ID_2)).end;
      const EXTENSION_TIME = ONE_WEEK;

      await expect(underwritingLocker.connect(user3).extendLockMultiple(
        [LOCK_ID_1, LOCK_ID_2], 
        [CURRENT_END_1.add(EXTENSION_TIME), CURRENT_END_2.add(EXTENSION_TIME)]
      )).to.be.revertedWith("only owner or approved");
    });
      it("cannot extend over four years", async function () {
        const LOCK_ID_1 = 1;
        const LOCK_ID_2 = 2;
        const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;

        await expect(underwritingLocker.connect(user1).extendLockMultiple(
          [LOCK_ID_1, LOCK_ID_2], 
          [CURRENT_TIME + ONE_YEAR*4 + ONE_WEEK, CURRENT_TIME + ONE_YEAR*4 + ONE_WEEK]
        )).to.be.revertedWith("LockTimeTooLong");
      });
      it("cannot reduce lock duration", async function () {
        const LOCK_ID_1 = 1;
        const LOCK_ID_2 = 2;
        const CURRENT_END_1 = (await underwritingLocker.locks(LOCK_ID_1)).end;
        const CURRENT_END_2 = (await underwritingLocker.locks(LOCK_ID_2)).end;

        await expect(underwritingLocker.connect(user1).extendLockMultiple(
          [LOCK_ID_1, LOCK_ID_2], 
          [CURRENT_END_1.sub(1), CURRENT_END_2.sub(1)]
        )).to.be.revertedWith("LockTimeNotExtended");
      });
      it("owner can extend multiple locks, with listener notified", async function () {
        const LOCK_ID_1 = 1;
        const LOCK_ID_2 = 2;
        const EXTENSION_TIME = ONE_WEEK;

        const oldLockState1 = await getLockState(LOCK_ID_1);
        const oldLockState2 = await getLockState(LOCK_ID_2);
        expect(oldLockState1.ownerOf).eq(user1.address)
        expect(oldLockState2.ownerOf).eq(user1.address)
        const NEW_END_1 = oldLockState1.end.add(EXTENSION_TIME);
        const NEW_END_2 = oldLockState2.end.add(EXTENSION_TIME);
        const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

        const tx = await underwritingLocker.connect(user1).extendLockMultiple(
          [LOCK_ID_1, LOCK_ID_2], 
          [NEW_END_1, NEW_END_2]
        );
        await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID_1, oldLockState1.amount, NEW_END_1);
        await expect(tx).to.emit(underwritingLocker, "LockExtended").withArgs(LOCK_ID_1, NEW_END_1);
        await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID_2, oldLockState2.amount, NEW_END_2);
        await expect(tx).to.emit(underwritingLocker, "LockExtended").withArgs(LOCK_ID_2, NEW_END_2);
  
        const newLockState1 = await getLockState(LOCK_ID_1);
        const newLockState2 = await getLockState(LOCK_ID_2);
        const lockStateChange1 = getLockStateChange(newLockState1, oldLockState1);
        const lockStateChange2 = getLockStateChange(newLockState2, oldLockState2);
        expect(lockStateChange1.amount).eq(0)
        expect(lockStateChange2.amount).eq(0)
        expect(lockStateChange1.end).eq(EXTENSION_TIME)
        expect(lockStateChange2.end).eq(EXTENSION_TIME)
  
        const listenerUpdate = await listener.lastUpdate();
        expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
        expect(listenerUpdate.caller).eq(underwritingLocker.address);
        expect(listenerUpdate.lockID).eq(LOCK_ID_2);
        expect(listenerUpdate.oldOwner).eq(user1.address);
        expect(listenerUpdate.newOwner).eq(user1.address);
        expect(listenerUpdate.oldLock.amount).eq(oldLockState2.amount);
        expect(listenerUpdate.oldLock.end).eq(oldLockState2.end);
        expect(listenerUpdate.newLock.amount).eq(newLockState2.amount);
        expect(listenerUpdate.newLock.end).eq(newLockState2.end);
      });
      it("approved can extend multiple locks, with listener notified", async function () {
        const LOCK_ID_1 = 1;
        const LOCK_ID_2 = 2;
        const EXTENSION_TIME = ONE_WEEK;

        const oldLockState1 = await getLockState(LOCK_ID_1);
        const oldLockState2 = await getLockState(LOCK_ID_2);
        expect(oldLockState1.ownerOf).not.eq(user2.address)
        expect(oldLockState2.ownerOf).not.eq(user2.address)
        const NEW_END_1 = oldLockState1.end.add(EXTENSION_TIME);
        const NEW_END_2 = oldLockState2.end.add(EXTENSION_TIME);
        const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

        await underwritingLocker.connect(user1).approve(user2.address, LOCK_ID_2);
        const tx = await underwritingLocker.connect(user2).extendLockMultiple(
          [LOCK_ID_1, LOCK_ID_2], 
          [NEW_END_1, NEW_END_2]
        );
        await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID_1, oldLockState1.amount, NEW_END_1);
        await expect(tx).to.emit(underwritingLocker, "LockExtended").withArgs(LOCK_ID_1, NEW_END_1);
        await expect(tx).to.emit(underwritingLocker, "LockUpdated").withArgs(LOCK_ID_2, oldLockState2.amount, NEW_END_2);
        await expect(tx).to.emit(underwritingLocker, "LockExtended").withArgs(LOCK_ID_2, NEW_END_2);
  
        const newLockState1 = await getLockState(LOCK_ID_1);
        const newLockState2 = await getLockState(LOCK_ID_2);
        const lockStateChange1 = getLockStateChange(newLockState1, oldLockState1);
        const lockStateChange2 = getLockStateChange(newLockState2, oldLockState2);
        expect(lockStateChange1.amount).eq(0)
        expect(lockStateChange2.amount).eq(0)
        expect(lockStateChange1.end).eq(EXTENSION_TIME)
        expect(lockStateChange2.end).eq(EXTENSION_TIME)
  
        const listenerUpdate = await listener.lastUpdate();
        expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 2);
        expect(listenerUpdate.caller).eq(underwritingLocker.address);
        expect(listenerUpdate.lockID).eq(LOCK_ID_2);
        expect(listenerUpdate.oldOwner).eq(user1.address);
        expect(listenerUpdate.newOwner).eq(user1.address);
        expect(listenerUpdate.oldLock.amount).eq(oldLockState2.amount);
        expect(listenerUpdate.oldLock.end).eq(oldLockState2.end);
        expect(listenerUpdate.newLock.amount).eq(newLockState2.amount);
        expect(listenerUpdate.newLock.end).eq(newLockState2.end);
      });

  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * user1 has 94e18 tokens
   * 
   * There are two locks:
   * i.) lockID 1 => 1yr + 4wk lock held by user1, with 3e18 token locked
   * ii.) lockID 2 => 1yr + 2wk lock held by user1, with 3e18 token locked
   */

  /*********************
    INTENTION STATEMENT 
  *********************/
  // Before proceeding, let's do a time-skip such that lockID 1 is locked, whereas lockID 2 is unlocked

  describe("Timeskip 1", function () {
    it("skips time such that lockID 1 is locked, while lockID 2 is unlocked", async function () {
      const LOCK_ID_1 = 1;
      const LOCK_ID_2 = 2;
      const LOCK_END_2 = (await underwritingLocker.locks(LOCK_ID_2)).end;
      await provider.send("evm_mine", [LOCK_END_2.toNumber()]);
      expect (await underwritingLocker.isLocked(LOCK_ID_1)).eq(true)
      expect (await underwritingLocker.isLocked(LOCK_ID_2)).eq(false)
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * user1 has 94e18 tokens
   * 
   * There are two locks:
   * i.) lockID 1 => 2wk lock held by user1, with 3e18 token locked
   * ii.) lockID 2 => Unlocked lock held by user1, with 3e18 token staked
   */

  describe("uri", function () {
    it("cannot get the uri of non existant token", async function () {
      await expect(underwritingLocker.tokenURI(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("starts simple", async function () {
      expect(await underwritingLocker.baseURI()).eq("");
      expect(await underwritingLocker.tokenURI(1)).eq("1");
    });
    it("non governor cannot set base uri", async function () {
      await expect(underwritingLocker.connect(user1).setBaseURI("asdf")).to.be.revertedWith("!governance");
    });
    it("governor can set base uri", async function () {
      const baseURI = "https://token.fi/xsLocks?xsLockID=";
      const tx = await underwritingLocker.connect(governor).setBaseURI(baseURI);
      await expect(tx).to.emit(underwritingLocker, "BaseURISet").withArgs(baseURI);
      expect(await underwritingLocker.baseURI()).eq(baseURI);
      expect(await underwritingLocker.tokenURI(1)).eq(baseURI.concat("1"));
    });
  });

  describe("lock transfer", function () {
    it("cannot transfer when locked", async function () {
      const LOCKED_LOCK_ID = 1;
      await expect(underwritingLocker.connect(user1).transfer(user2.address, LOCKED_LOCK_ID)).to.be.revertedWith("CannotTransferWhileLocked");
      await expect(underwritingLocker.connect(user1).safeTransfer(user2.address, LOCKED_LOCK_ID)).to.be.revertedWith("CannotTransferWhileLocked");
      await underwritingLocker.connect(user1).approve(user2.address, LOCKED_LOCK_ID);
      await expect(underwritingLocker.connect(user2).transferFrom(user1.address, user2.address, LOCKED_LOCK_ID)).to.be.revertedWith("CannotTransferWhileLocked");
      await expect(underwritingLocker.connect(user2)['safeTransferFrom(address,address,uint256)'](user1.address, user2.address, LOCKED_LOCK_ID)).to.be.revertedWith("CannotTransferWhileLocked");
    });
    it("can transfer when unlocked", async function () {
      const UNLOCKED_LOCK_ID = 2;
      await underwritingLocker.connect(user1).transfer(user2.address, UNLOCKED_LOCK_ID);
      expect(await underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).eq(user2.address);
      await underwritingLocker.connect(user2).safeTransfer(user1.address, UNLOCKED_LOCK_ID);
      expect(await underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).eq(user1.address);
      await underwritingLocker.connect(user1).approve(user2.address, UNLOCKED_LOCK_ID);
      await underwritingLocker.connect(user2).transferFrom(user1.address, user2.address, UNLOCKED_LOCK_ID); // user2 already approved
      expect(await underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).eq(user2.address);
      await underwritingLocker.connect(user2).approve(user1.address, UNLOCKED_LOCK_ID);
      await underwritingLocker.connect(user1)['safeTransferFrom(address,address,uint256)'](user2.address, user1.address, UNLOCKED_LOCK_ID);
      expect(await underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).eq(user1.address);
    });
  });

  describe("sanity check for view functions for individual locks", function () {
    it("should not be able to query nonexistent lockIDs", async function () {
      await expect(underwritingLocker.ownerOf(999)).to.be.revertedWith("ERC721: invalid token ID");
      await expect(underwritingLocker.locks(999)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.isLocked(999)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.timeLeft(999)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getEarlyWithdrawPenalty(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("should return appropriate values for locked lock", async function () {
      const LOCKED_LOCK_ID = 1;
      expect(await underwritingLocker.isLocked(LOCKED_LOCK_ID)).eq(true);
      const TIME_LEFT = await underwritingLocker.timeLeft(LOCKED_LOCK_ID);
      expect(TIME_LEFT).above(0);
      
      // Round up in months
      const LOCK_AMOUNT = (await underwritingLocker.locks(LOCKED_LOCK_ID)).amount;
      const TIME_LEFT_MONTHS = Math.ceil( TIME_LEFT.toNumber() / ONE_MONTH);
      const EXPECTED_PENALTY_PERCENTAGE_NUMERATOR = 6;
      const EXPECTED_PENALTY_PERCENTAGE_DENOMINATOR = TIME_LEFT_MONTHS + 6;
      const EXPECTED_PENALTY = LOCK_AMOUNT.mul(EXPECTED_PENALTY_PERCENTAGE_NUMERATOR).div(EXPECTED_PENALTY_PERCENTAGE_DENOMINATOR);
      expectClose(EXPECTED_PENALTY, await underwritingLocker.getEarlyWithdrawPenalty(LOCKED_LOCK_ID), 1e15);
    });
    it("should return appropriate values for unlocked lock", async function () {
      const UNLOCKED_LOCK_ID = 2;
      expect(await underwritingLocker.isLocked(UNLOCKED_LOCK_ID)).eq(false);
      expect(await underwritingLocker.timeLeft(UNLOCKED_LOCK_ID)).eq(0);
      expect(await underwritingLocker.getEarlyWithdrawPenalty(UNLOCKED_LOCK_ID)).eq(0);
    });
  });

  // describe("withdraw in full", function () {
  //   before("create more locks", async function () {
  //     await token.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
  //     await token.connect(user1).approve(underwritingLocker.address, ONE_ETHER.mul(100));
  //     await underwritingLocker.connect(user1).setApprovalForAll(user3.address, false);
  //     await provider.send("evm_mine", []);
  //     let timestamp = (await provider.getBlock('latest')).timestamp;
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0); // 5
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_WEEK*2); // 6
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(3), 0); // 7
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(4), 0); // 8
  //   });
  //   it("cannot withdraw non existant token", async function () {
  //     await expect(underwritingLocker.connect(user1).withdraw(999, user1.address)).to.be.revertedWith("query for nonexistent token")
  //   });
  //   it("cannot withdraw not your token", async function () {
  //     await expect(underwritingLocker.connect(user2).withdraw(5, user1.address)).to.be.revertedWith("only owner or approved")
  //   });
  //   it("cannot withdraw locked token", async function () {
  //     await expect(underwritingLocker.connect(user1).withdraw(6, user1.address)).to.be.revertedWith("locked")
  //   });
  //   it("can withdraw never locked token", async function () {
  //     let xsLockID = 5;
  //     let balancesBefore = await getBalances();
  //     let amount = (await underwritingLocker.locks(xsLockID)).amount;
  //     let tx = await underwritingLocker.connect(user1).withdraw(xsLockID, user2.address);
  //     await expect(tx).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, amount);
  //     let balancesAfter = await getBalances();
  //     let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
  //     expect(balancesDiff.user1Solace).eq(0);
  //     expect(balancesDiff.user1StakedSolace).eq(amount.mul(-1));
  //     expect(balancesDiff.user2Solace).eq(amount);
  //     expect(balancesDiff.user2StakedSolace).eq(0);
  //     expect(balancesDiff.totalStakedSolace).eq(amount.mul(-1));
  //     expect(balancesDiff.user1Locks).eq(-1);
  //     expect(balancesDiff.user2Locks).eq(0);
  //     expect(balancesDiff.totalNumLocks).eq(0);
  //     expect(balancesDiff.totalSupply).eq(-1);
  //     await expect(underwritingLocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
  //   });
  //   it("can withdraw after lock expiration", async function () {
  //     let xsLockID = 6;
  //     let balancesBefore = await getBalances();
  //     let end = (await underwritingLocker.locks(xsLockID)).end.toNumber();
  //     await provider.send("evm_setNextBlockTimestamp", [end]);
  //     await provider.send("evm_mine", []);
  //     let amount = (await underwritingLocker.locks(xsLockID)).amount;
  //     let tx = await underwritingLocker.connect(user1).withdraw(xsLockID, user2.address);
  //     await expect(tx).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, amount);
  //     let balancesAfter = await getBalances();
  //     let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
  //     expect(balancesDiff.user1Solace).eq(0);
  //     expect(balancesDiff.user1StakedSolace).eq(amount.mul(-1));
  //     expect(balancesDiff.user2Solace).eq(amount);
  //     expect(balancesDiff.user2StakedSolace).eq(0);
  //     expect(balancesDiff.totalStakedSolace).eq(amount.mul(-1));
  //     expect(balancesDiff.user1Locks).eq(-1);
  //     expect(balancesDiff.user2Locks).eq(0);
  //     expect(balancesDiff.totalNumLocks).eq(0);
  //     expect(balancesDiff.totalSupply).eq(-1);
  //     await expect(underwritingLocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
  //   });
  //   it("can withdraw if approved for one", async function () {
  //     let xsLockID = 7;
  //     let balancesBefore = await getBalances();
  //     await underwritingLocker.connect(user1).approve(user3.address, xsLockID);
  //     let amount = (await underwritingLocker.locks(xsLockID)).amount;
  //     let tx = await underwritingLocker.connect(user3).withdraw(xsLockID, user2.address);
  //     await expect(tx).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, amount);
  //     let balancesAfter = await getBalances();
  //     let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
  //     expect(balancesDiff.user1Solace).eq(0);
  //     expect(balancesDiff.user1StakedSolace).eq(amount.mul(-1));
  //     expect(balancesDiff.user2Solace).eq(amount);
  //     expect(balancesDiff.user2StakedSolace).eq(0);
  //     expect(balancesDiff.user3Solace).eq(0);
  //     expect(balancesDiff.user3StakedSolace).eq(0);
  //     expect(balancesDiff.totalStakedSolace).eq(amount.mul(-1));
  //     expect(balancesDiff.user1Locks).eq(-1);
  //     expect(balancesDiff.user2Locks).eq(0);
  //     expect(balancesDiff.user3Locks).eq(0);
  //     expect(balancesDiff.totalNumLocks).eq(0);
  //     expect(balancesDiff.totalSupply).eq(-1);
  //     await expect(underwritingLocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
  //   });
  //   it("can withdraw if approved for all", async function () {
  //     let xsLockID = 8;
  //     let balancesBefore = await getBalances();
  //     await underwritingLocker.connect(user1).setApprovalForAll(user3.address, true);
  //     let amount = (await underwritingLocker.locks(xsLockID)).amount;
  //     let tx = await underwritingLocker.connect(user3).withdraw(xsLockID, user2.address);
  //     await expect(tx).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, amount);
  //     let balancesAfter = await getBalances();
  //     let balancesDiff = getBalancesDiff(balancesAfter, balancesBefore);
  //     expect(balancesDiff.user1Solace).eq(0);
  //     expect(balancesDiff.user1StakedSolace).eq(amount.mul(-1));
  //     expect(balancesDiff.user2Solace).eq(amount);
  //     expect(balancesDiff.user2StakedSolace).eq(0);
  //     expect(balancesDiff.user3Solace).eq(0);
  //     expect(balancesDiff.user3StakedSolace).eq(0);
  //     expect(balancesDiff.totalStakedSolace).eq(amount.mul(-1));
  //     expect(balancesDiff.user1Locks).eq(-1);
  //     expect(balancesDiff.user2Locks).eq(0);
  //     expect(balancesDiff.user3Locks).eq(0);
  //     expect(balancesDiff.totalNumLocks).eq(0);
  //     expect(balancesDiff.totalSupply).eq(-1);
  //     await expect(underwritingLocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
  //   });
  // });

  // describe("withdraw in part", function () {
  //   before("create more locks", async function () {
  //     await token.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
  //     await token.connect(user1).approve(underwritingLocker.address, ONE_ETHER.mul(100));
  //     await underwritingLocker.connect(user1).setApprovalForAll(user3.address, false);
  //     await provider.send("evm_mine", []);
  //     let timestamp = (await provider.getBlock('latest')).timestamp;
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0); // 9
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_WEEK*2); // 10
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(3), 0); // 11
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(4), 0); // 12
  //   });
  //   it("cannot withdraw non existant token", async function () {
  //     await expect(underwritingLocker.connect(user1).withdrawInPart(999, user1.address, 1)).to.be.revertedWith("query for nonexistent token")
  //   });
  //   it("cannot withdraw not your token", async function () {
  //     await expect(underwritingLocker.connect(user2).withdrawInPart(9, user1.address, 1)).to.be.revertedWith("only owner or approved")
  //   });
  //   it("cannot withdraw locked token", async function () {
  //     await expect(underwritingLocker.connect(user1).withdrawInPart(10, user1.address, 1)).to.be.revertedWith("locked")
  //   });
  //   it("cannot withdraw in excess", async function () {
  //     await expect(underwritingLocker.connect(user1).withdrawInPart(9, user1.address, ONE_ETHER.mul(2).add(1))).to.be.revertedWith("excess withdraw")
  //   });
  //   it("can withdraw never locked token", async function () {
  //     // in part
  //     let xsLockID = 9;
  //     let amount = (await underwritingLocker.locks(xsLockID)).amount;
  //     let withdrawAmount1 = amount.div(3);
  //     let withdrawAmount2 = amount.sub(withdrawAmount1);
  //     let balances1 = await getBalances();
  //     let tx1 = await underwritingLocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount1);
  //     await expect(tx1).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, withdrawAmount1);
  //     let balances2 = await getBalances();
  //     let balances12 = getBalancesDiff(balances2, balances1);
  //     expect(balances12.user1Solace).eq(0);
  //     expect(balances12.user1StakedSolace).eq(withdrawAmount1.mul(-1));
  //     expect(balances12.user2Solace).eq(withdrawAmount1);
  //     expect(balances12.user2StakedSolace).eq(0);
  //     expect(balances12.totalStakedSolace).eq(withdrawAmount1.mul(-1));
  //     expect(balances12.user1Locks).eq(0);
  //     expect(balances12.user2Locks).eq(0);
  //     expect(balances12.totalNumLocks).eq(0);
  //     expect(balances12.totalSupply).eq(0);
  //     let lock = await underwritingLocker.locks(xsLockID);
  //     expect(lock.amount).eq(withdrawAmount2);
  //     expect(lock.end).eq(0);
  //     // in full
  //     let tx2 = await underwritingLocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount2);
  //     await expect(tx2).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, withdrawAmount2);
  //     let balances3 = await getBalances();
  //     let balances23 = getBalancesDiff(balances3, balances2);
  //     expect(balances23.user1Solace).eq(0);
  //     expect(balances23.user1StakedSolace).eq(withdrawAmount2.mul(-1));
  //     expect(balances23.user2Solace).eq(withdrawAmount2);
  //     expect(balances23.user2StakedSolace).eq(0);
  //     expect(balances23.totalStakedSolace).eq(withdrawAmount2.mul(-1));
  //     expect(balances23.user1Locks).eq(-1);
  //     expect(balances23.user2Locks).eq(0);
  //     expect(balances23.totalNumLocks).eq(0);
  //     expect(balances23.totalSupply).eq(-1);
  //     await expect(underwritingLocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
  //   });
  //   it("can withdraw after lock expiration", async function () {
  //     // in part
  //     let xsLockID = 10;
  //     let end = (await underwritingLocker.locks(xsLockID)).end.toNumber();
  //     await provider.send("evm_setNextBlockTimestamp", [end]);
  //     await provider.send("evm_mine", []);
  //     let amount = (await underwritingLocker.locks(xsLockID)).amount;
  //     let withdrawAmount1 = amount.div(3);
  //     let withdrawAmount2 = amount.sub(withdrawAmount1);
  //     let balances1 = await getBalances();
  //     let tx1 = await underwritingLocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount1);
  //     await expect(tx1).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, withdrawAmount1);
  //     let balances2 = await getBalances();
  //     let balances12 = getBalancesDiff(balances2, balances1);
  //     expect(balances12.user1Solace).eq(0);
  //     expect(balances12.user1StakedSolace).eq(withdrawAmount1.mul(-1));
  //     expect(balances12.user2Solace).eq(withdrawAmount1);
  //     expect(balances12.user2StakedSolace).eq(0);
  //     expect(balances12.totalStakedSolace).eq(withdrawAmount1.mul(-1));
  //     expect(balances12.user1Locks).eq(0);
  //     expect(balances12.user2Locks).eq(0);
  //     expect(balances12.totalNumLocks).eq(0);
  //     expect(balances12.totalSupply).eq(0);
  //     let lock = await underwritingLocker.locks(xsLockID);
  //     expect(lock.amount).eq(withdrawAmount2);
  //     expect(lock.end).eq(end);
  //     // in full
  //     let tx2 = await underwritingLocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount2);
  //     await expect(tx2).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, withdrawAmount2);
  //     let balances3 = await getBalances();
  //     let balances23 = getBalancesDiff(balances3, balances2);
  //     expect(balances23.user1Solace).eq(0);
  //     expect(balances23.user1StakedSolace).eq(withdrawAmount2.mul(-1));
  //     expect(balances23.user2Solace).eq(withdrawAmount2);
  //     expect(balances23.user2StakedSolace).eq(0);
  //     expect(balances23.totalStakedSolace).eq(withdrawAmount2.mul(-1));
  //     expect(balances23.user1Locks).eq(-1);
  //     expect(balances23.user2Locks).eq(0);
  //     expect(balances23.totalNumLocks).eq(0);
  //     expect(balances23.totalSupply).eq(-1);
  //     await expect(underwritingLocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
  //   });
  //   it("can withdraw if approved for one", async function () {
  //     // in part
  //     let xsLockID = 11;
  //     await underwritingLocker.connect(user1).approve(user3.address, xsLockID);
  //     let amount = (await underwritingLocker.locks(xsLockID)).amount;
  //     let withdrawAmount1 = amount.div(3);
  //     let withdrawAmount2 = amount.sub(withdrawAmount1);
  //     let balances1 = await getBalances();
  //     let tx1 = await underwritingLocker.connect(user3).withdrawInPart(xsLockID, user2.address, withdrawAmount1);
  //     await expect(tx1).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, withdrawAmount1);
  //     let balances2 = await getBalances();
  //     let balances12 = getBalancesDiff(balances2, balances1);
  //     expect(balances12.user1Solace).eq(0);
  //     expect(balances12.user1StakedSolace).eq(withdrawAmount1.mul(-1));
  //     expect(balances12.user2Solace).eq(withdrawAmount1);
  //     expect(balances12.user2StakedSolace).eq(0);
  //     expect(balances12.user3Solace).eq(0);
  //     expect(balances12.user3StakedSolace).eq(0);
  //     expect(balances12.totalStakedSolace).eq(withdrawAmount1.mul(-1));
  //     expect(balances12.user1Locks).eq(0);
  //     expect(balances12.user2Locks).eq(0);
  //     expect(balances12.user3Locks).eq(0);
  //     expect(balances12.totalNumLocks).eq(0);
  //     expect(balances12.totalSupply).eq(0);
  //     let lock = await underwritingLocker.locks(xsLockID);
  //     expect(lock.amount).eq(withdrawAmount2);
  //     expect(lock.end).eq(0);
  //     // in full
  //     let tx2 = await underwritingLocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount2);
  //     await expect(tx2).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, withdrawAmount2);
  //     let balances3 = await getBalances();
  //     let balances23 = getBalancesDiff(balances3, balances2);
  //     expect(balances23.user1Solace).eq(0);
  //     expect(balances23.user1StakedSolace).eq(withdrawAmount2.mul(-1));
  //     expect(balances23.user2Solace).eq(withdrawAmount2);
  //     expect(balances23.user2StakedSolace).eq(0);
  //     expect(balances23.user3Solace).eq(0);
  //     expect(balances23.user3StakedSolace).eq(0);
  //     expect(balances23.totalStakedSolace).eq(withdrawAmount2.mul(-1));
  //     expect(balances23.user1Locks).eq(-1);
  //     expect(balances23.user2Locks).eq(0);
  //     expect(balances23.user3Locks).eq(0);
  //     expect(balances23.totalNumLocks).eq(0);
  //     expect(balances23.totalSupply).eq(-1);
  //     await expect(underwritingLocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
  //   });
  //   it("can withdraw if approved for all", async function () {
  //     // in part
  //     let xsLockID = 12;
  //     await underwritingLocker.connect(user1).setApprovalForAll(user3.address, true);
  //     let amount = (await underwritingLocker.locks(xsLockID)).amount;
  //     let withdrawAmount1 = amount.div(3);
  //     let withdrawAmount2 = amount.sub(withdrawAmount1);
  //     let balances1 = await getBalances();
  //     let tx1 = await underwritingLocker.connect(user3).withdrawInPart(xsLockID, user2.address, withdrawAmount1);
  //     await expect(tx1).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, withdrawAmount1);
  //     let balances2 = await getBalances();
  //     let balances12 = getBalancesDiff(balances2, balances1);
  //     expect(balances12.user1Solace).eq(0);
  //     expect(balances12.user1StakedSolace).eq(withdrawAmount1.mul(-1));
  //     expect(balances12.user2Solace).eq(withdrawAmount1);
  //     expect(balances12.user2StakedSolace).eq(0);
  //     expect(balances12.user3Solace).eq(0);
  //     expect(balances12.user3StakedSolace).eq(0);
  //     expect(balances12.totalStakedSolace).eq(withdrawAmount1.mul(-1));
  //     expect(balances12.user1Locks).eq(0);
  //     expect(balances12.user2Locks).eq(0);
  //     expect(balances12.user3Locks).eq(0);
  //     expect(balances12.totalNumLocks).eq(0);
  //     expect(balances12.totalSupply).eq(0);
  //     let lock = await underwritingLocker.locks(xsLockID);
  //     expect(lock.amount).eq(withdrawAmount2);
  //     expect(lock.end).eq(0);
  //     // in full
  //     let tx2 = await underwritingLocker.connect(user1).withdrawInPart(xsLockID, user2.address, withdrawAmount2);
  //     await expect(tx2).to.emit(underwritingLocker, "Withdrawl").withArgs(xsLockID, withdrawAmount2);
  //     let balances3 = await getBalances();
  //     let balances23 = getBalancesDiff(balances3, balances2);
  //     expect(balances23.user1Solace).eq(0);
  //     expect(balances23.user1StakedSolace).eq(withdrawAmount2.mul(-1));
  //     expect(balances23.user2Solace).eq(withdrawAmount2);
  //     expect(balances23.user2StakedSolace).eq(0);
  //     expect(balances23.user3Solace).eq(0);
  //     expect(balances23.user3StakedSolace).eq(0);
  //     expect(balances23.totalStakedSolace).eq(withdrawAmount2.mul(-1));
  //     expect(balances23.user1Locks).eq(-1);
  //     expect(balances23.user2Locks).eq(0);
  //     expect(balances23.user3Locks).eq(0);
  //     expect(balances23.totalNumLocks).eq(0);
  //     expect(balances23.totalSupply).eq(-1);
  //     await expect(underwritingLocker.locks(xsLockID)).to.be.revertedWith("query for nonexistent token");
  //   });
  // });

  // describe("withdraw multiple", function () {
  //   before("create more locks", async function () {
  //     await token.connect(governor).mint(user1.address, ONE_ETHER.mul(100));
  //     await token.connect(user1).approve(underwritingLocker.address, ONE_ETHER.mul(100));
  //     await underwritingLocker.connect(user1).setApprovalForAll(user3.address, false);
  //     await provider.send("evm_mine", []);
  //     let timestamp = (await provider.getBlock('latest')).timestamp;
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER, 0); // 13
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(2), timestamp+ONE_WEEK*2); // 14
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(3), 0); // 15
  //     await underwritingLocker.connect(user1).createLock(user1.address, ONE_ETHER.mul(4), 0); // 16
  //   });
  //   it("can withdraw none", async function () {
  //     let balances1 = await getBalances();
  //     await underwritingLocker.connect(user1).withdrawMany([], user1.address);
  //     let balances2 = await getBalances();
  //     let balances12 = getBalancesDiff(balances2, balances1);
  //     expect(balances12.user1Solace).eq(0);
  //     expect(balances12.user1StakedSolace).eq(0);
  //     expect(balances12.user2Solace).eq(0);
  //     expect(balances12.user2StakedSolace).eq(0);
  //     expect(balances12.user3Solace).eq(0);
  //     expect(balances12.user3StakedSolace).eq(0);
  //     expect(balances12.totalStakedSolace).eq(0);
  //     expect(balances12.user1Locks).eq(0);
  //     expect(balances12.user2Locks).eq(0);
  //     expect(balances12.user3Locks).eq(0);
  //     expect(balances12.totalNumLocks).eq(0);
  //     expect(balances12.totalSupply).eq(0);
  //   });
  //   it("cannot withdraw multiple if one fails", async function () {
  //     await expect(underwritingLocker.connect(user1).withdrawMany([999], user1.address)).to.be.revertedWith("query for nonexistent token");
  //     await expect(underwritingLocker.connect(user2).withdrawMany([13], user1.address)).to.be.revertedWith("only owner or approved");
  //     await expect(underwritingLocker.connect(user1).withdrawMany([14], user1.address)).to.be.revertedWith("locked");
  //   });
  //   it("can withdraw multiple", async function () {
  //     let end = (await underwritingLocker.locks(14)).end.toNumber();
  //     await provider.send("evm_setNextBlockTimestamp", [end]);
  //     await provider.send("evm_mine", []);
  //     let expectedAmount = ONE_ETHER.mul(6);
  //     let balances1 = await getBalances();
  //     await underwritingLocker.connect(user1).withdrawMany([13, 14, 15], user2.address);
  //     let balances2 = await getBalances();
  //     let balances12 = getBalancesDiff(balances2, balances1);
  //     expect(balances12.user1Solace).eq(0);
  //     expect(balances12.user1StakedSolace).eq(expectedAmount.mul(-1));
  //     expect(balances12.user2Solace).eq(expectedAmount);
  //     expect(balances12.user2StakedSolace).eq(0);
  //     expect(balances12.user3Solace).eq(0);
  //     expect(balances12.user3StakedSolace).eq(0);
  //     expect(balances12.totalStakedSolace).eq(expectedAmount.mul(-1));
  //     expect(balances12.user1Locks).eq(-3);
  //     expect(balances12.user2Locks).eq(0);
  //     expect(balances12.user3Locks).eq(0);
  //     expect(balances12.totalNumLocks).eq(0);
  //     expect(balances12.totalSupply).eq(-3);
  //     await expect(underwritingLocker.locks(13)).to.be.revertedWith("query for nonexistent token");
  //     await expect(underwritingLocker.locks(14)).to.be.revertedWith("query for nonexistent token");
  //     await expect(underwritingLocker.locks(15)).to.be.revertedWith("query for nonexistent token");
  //   });
  // });

  // describe("listeners", function () {

  //   it("listeners hear burn", async function () {
  //     let block = await provider.getBlock('latest');
  //     let blocknum = block.number;
  //     let end = ONE_WEEK * 52 * 20;
  //     let xsLockID = await underwritingLocker.totalNumLocks();
  //     await underwritingLocker.connect(user2).withdraw(xsLockID, user3.address);
  //     // listener 1
  //     let lastUpdate1 = await listener1.lastUpdate();
  //     expect(lastUpdate1.blocknum).eq(blocknum+1);
  //     expect(lastUpdate1.caller).eq(underwritingLocker.address);
  //     expect(lastUpdate1.xsLockID).eq(xsLockID);
  //     expect(lastUpdate1.oldOwner).eq(user2.address);
  //     expect(lastUpdate1.newOwner).eq(ZERO_ADDRESS);
  //     expect(lastUpdate1.oldLock.amount).eq(ONE_ETHER);
  //     expect(lastUpdate1.oldLock.end).eq(end);
  //     expect(lastUpdate1.newLock.amount).eq(0);
  //     expect(lastUpdate1.newLock.end).eq(0);
  //     // listener 2
  //     let lastUpdate2 = await listener2.lastUpdate();
  //     expect(lastUpdate2.blocknum).eq(blocknum+1);
  //     expect(lastUpdate2.caller).eq(underwritingLocker.address);
  //     expect(lastUpdate2.xsLockID).eq(xsLockID);
  //     expect(lastUpdate2.oldOwner).eq(user2.address);
  //     expect(lastUpdate2.newOwner).eq(ZERO_ADDRESS);
  //     expect(lastUpdate2.oldLock.amount).eq(ONE_ETHER);
  //     expect(lastUpdate2.oldLock.end).eq(end);
  //     expect(lastUpdate2.newLock.amount).eq(0);
  //     expect(lastUpdate2.newLock.end).eq(0);
  //     // listener 3, detached
  //     let lastUpdate3 = await listener3.lastUpdate();
  //     expect(lastUpdate3.blocknum).eq(0);
  //     expect(lastUpdate3.caller).eq(ZERO_ADDRESS);
  //     expect(lastUpdate3.xsLockID).eq(0);
  //     expect(lastUpdate3.oldOwner).eq(ZERO_ADDRESS);
  //     expect(lastUpdate3.newOwner).eq(ZERO_ADDRESS);
  //     expect(lastUpdate3.oldLock.amount).eq(0);
  //     expect(lastUpdate3.oldLock.end).eq(0);
  //     expect(lastUpdate3.newLock.amount).eq(0);
  //     expect(lastUpdate3.newLock.end).eq(0);
  //   });
  //   it("listeners hear transfer", async function () {
  //     let end = ONE_WEEK * 52 * 20;
  //     await underwritingLocker.connect(user1).createLock(user2.address, ONE_ETHER, end);
  //     let block = await provider.getBlock('latest');
  //     let blocknum = block.number;
  //     let xsLockID = await underwritingLocker.totalNumLocks();
  //     await underwritingLocker.connect(user2).transfer(user3.address, xsLockID);
  //     // listener 1
  //     let lastUpdate1 = await listener1.lastUpdate();
  //     expect(lastUpdate1.blocknum).eq(blocknum+1);
  //     expect(lastUpdate1.caller).eq(underwritingLocker.address);
  //     expect(lastUpdate1.xsLockID).eq(xsLockID);
  //     expect(lastUpdate1.oldOwner).eq(user2.address);
  //     expect(lastUpdate1.newOwner).eq(user3.address);
  //     expect(lastUpdate1.oldLock.amount).eq(ONE_ETHER);
  //     expect(lastUpdate1.oldLock.end).eq(end);
  //     expect(lastUpdate1.newLock.amount).eq(ONE_ETHER);
  //     expect(lastUpdate1.newLock.end).eq(end);
  //     // listener 2
  //     let lastUpdate2 = await listener2.lastUpdate();
  //     expect(lastUpdate2.blocknum).eq(blocknum+1);
  //     expect(lastUpdate2.caller).eq(underwritingLocker.address);
  //     expect(lastUpdate2.xsLockID).eq(xsLockID);
  //     expect(lastUpdate2.oldOwner).eq(user2.address);
  //     expect(lastUpdate2.newOwner).eq(user3.address);
  //     expect(lastUpdate2.oldLock.amount).eq(ONE_ETHER);
  //     expect(lastUpdate2.oldLock.end).eq(end);
  //     expect(lastUpdate2.newLock.amount).eq(ONE_ETHER);
  //     expect(lastUpdate2.newLock.end).eq(end);
  //     // listener 3, detached
  //     let lastUpdate3 = await listener3.lastUpdate();
  //     expect(lastUpdate3.blocknum).eq(0);
  //     expect(lastUpdate3.caller).eq(ZERO_ADDRESS);
  //     expect(lastUpdate3.xsLockID).eq(0);
  //     expect(lastUpdate3.oldOwner).eq(ZERO_ADDRESS);
  //     expect(lastUpdate3.newOwner).eq(ZERO_ADDRESS);
  //     expect(lastUpdate3.oldLock.amount).eq(0);
  //     expect(lastUpdate3.oldLock.end).eq(0);
  //     expect(lastUpdate3.newLock.amount).eq(0);
  //     expect(lastUpdate3.newLock.end).eq(0);
  //   });
  // });

  /******************
    HELPER CLOSURES
  ******************/

  interface GlobalState {
    totalNumLocks: BN;
    totalSupply: BN;
    totalStakedAmount: BN;
  }

  interface UserState {
    tokenAmountInWallet: BN;
    lockedTokenAmount: BN;
    numOfLocks: BN;
  }

  interface LockState {
    amount: BN;
    end: BN;
    timeLeft: BN;
    isLocked: boolean;
    ownerOf: string;
  }

  interface LockStateChange {
    amount: BN;
    end: BN;
    timeLeft: BN;
  }

  async function getGlobalState(): Promise<GlobalState> {
    return {
      totalNumLocks: await underwritingLocker.totalNumLocks(),
      totalSupply: await underwritingLocker.totalSupply(),
      totalStakedAmount: await token.balanceOf(underwritingLocker.address)
    }
  }

  async function getUserState(user: Wallet): Promise<UserState> {
    return {
      tokenAmountInWallet: await token.balanceOf(user.address),
      lockedTokenAmount: await underwritingLocker.totalStakedBalance(user.address),
      numOfLocks: await underwritingLocker.balanceOf(user.address)
    }
  }

  async function getLockState(lockID: BigNumberish): Promise<LockState> {
    const lock = await underwritingLocker.locks(lockID);
    return {
      amount: lock.amount,
      end: lock.end,
      timeLeft: await underwritingLocker.timeLeft(lockID),
      isLocked: await underwritingLocker.isLocked(lockID),
      ownerOf: await underwritingLocker.ownerOf(lockID)
    }
  }

  function getGlobalStateChange(newGlobalState: GlobalState, oldGlobalState: GlobalState): GlobalState {
    return {
      totalNumLocks: newGlobalState.totalNumLocks.sub(oldGlobalState.totalNumLocks),
      totalSupply: newGlobalState.totalSupply.sub(oldGlobalState.totalSupply),
      totalStakedAmount: newGlobalState.totalStakedAmount.sub(oldGlobalState.totalStakedAmount)
    }
  }

  function getUserStateChange(newUserState: UserState, oldUserState: UserState): UserState {
    return {
      tokenAmountInWallet: newUserState.tokenAmountInWallet.sub(oldUserState.tokenAmountInWallet),
      lockedTokenAmount: newUserState.lockedTokenAmount.sub(oldUserState.lockedTokenAmount),
      numOfLocks: newUserState.numOfLocks.sub(oldUserState.numOfLocks)
    }
  }

  function getLockStateChange(newLockState: LockState, oldLockState: LockState): LockStateChange {
    return {
      amount: newLockState.amount.sub(oldLockState.amount),
      end: newLockState.end.sub(oldLockState.end),
      timeLeft: newLockState.timeLeft.sub(oldLockState.timeLeft)
    }
  }
});
