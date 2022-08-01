import { ethers, waffle } from "hardhat";
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
const ZERO = BN.from("0");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BURN_ADDRESS = "0x0000000000000000000000000000000000000001";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_MILLION_ETHER = ONE_ETHER.mul(1000000);
const ONE_YEAR = 31536000; // in seconds
const ONE_MONTH = ONE_YEAR / 12;
const ONE_WEEK = 604800; // in seconds
const DEADLINE = constants.MaxUint256;
const DEPOSIT_AMOUNT = ONE_ETHER;
const WITHDRAW_AMOUNT = ONE_ETHER;
const FUNDING_RATE = ONE_ETHER.div(10);
const ONE_HUNDRED_PERCENT = ONE_ETHER;
const SCALE_FACTOR = ONE_ETHER;

describe("UnderwritingLocker", function () {
  const [deployer, governor, user1, user2, user3] = provider.getWallets();

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
      expect(await underwritingLocker.votingContract()).eq(ZERO_ADDRESS);
      expect(await underwritingLocker.registry()).eq(registry.address);
      expect(await underwritingLocker.totalNumLocks()).eq(0);
      expect(await underwritingLocker.fundingRate()).eq(0);
      expect(await underwritingLocker.MIN_LOCK_DURATION()).eq(ONE_YEAR / 2);
      expect(await underwritingLocker.MAX_LOCK_DURATION()).eq(4 * ONE_YEAR);
      expect(await underwritingLocker.totalStakedBalance(user1.address)).eq(0);
      expect(await underwritingLocker.getLockListeners()).deep.eq([]);
      expect(await underwritingLocker.balanceOf(user1.address)).eq(0);
      expect(await underwritingLocker.totalSupply()).eq(0);

      await expect(underwritingLocker.locks(0)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.isLocked(0)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.timeLeft(0)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getWithdrawAmount(0)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getWithdrawInPartAmount(0, 0)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getBurnOnWithdrawAmount(0)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getBurnOnWithdrawInPartAmount(0, 0)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getLockMultiplier(0)).to.be.revertedWith("query for nonexistent token");
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

  describe("setFundingRate", () => {
    it("non governor cannot set voting contract approval", async function () {
      await expect(underwritingLocker.connect(user1).setFundingRate(FUNDING_RATE)).to.be.revertedWith("!governance");
    });
    it("governor can set funding rate", async function () {
      const tx = await underwritingLocker.connect(governor).setFundingRate(FUNDING_RATE);
      await expect(tx).to.emit(underwritingLocker, "FundingRateSet").withArgs(FUNDING_RATE);
      expect(await underwritingLocker.fundingRate()).eq(FUNDING_RATE);
    });
  });

  describe("setRegistry", () => {
    let registry2: Registry;
    const RANDOM_ADDRESS = ethers.Wallet.createRandom().connect(provider).address;

    before(async function () {
      registry2 = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    });
    it("reverts if not governor", async function () {
      await expect(underwritingLocker.connect(user1).setRegistry(registry2.address)).to.be.revertedWith("!governance");
    })
    it("reverts if zero address registry", async function () {
      await expect(underwritingLocker.connect(governor).setRegistry(ZERO_ADDRESS)).to.be.revertedWith('ZeroAddressInput("registry")');
    });
    it("reverts if zero address uwe in Registry", async function () {
      await expect(underwritingLocker.connect(governor).setRegistry(registry2.address)).to.be.revertedWith('ZeroAddressInput("uwe")');
      await registry2.connect(governor).set(["uwe"], [RANDOM_ADDRESS]);
    });
    it("sets registry", async function () {
      const tx = await underwritingLocker.connect(governor).setRegistry(registry2.address);
      await expect(tx).to.emit(underwritingLocker, "RegistrySet").withArgs(registry2.address);
    });
    it("copies Registry addresses to own state variables", async function () {
      expect(await underwritingLocker.registry()).eq(registry2.address);
      expect(await underwritingLocker.token()).eq(RANDOM_ADDRESS);
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
    it("can transfer when locked, and listener notified", async function () {
      const LOCKED_LOCK_ID = 2;
      const {amount: LOCK_AMOUNT, end: LOCK_END} = await underwritingLocker.locks(LOCKED_LOCK_ID);
      await underwritingLocker.connect(user1).transfer(user2.address, LOCKED_LOCK_ID);
      expect(await underwritingLocker.ownerOf(LOCKED_LOCK_ID)).eq(user2.address);
      await underwritingLocker.connect(user2).safeTransfer(user1.address, LOCKED_LOCK_ID);
      expect(await underwritingLocker.ownerOf(LOCKED_LOCK_ID)).eq(user1.address);
      await underwritingLocker.connect(user1).approve(user2.address, LOCKED_LOCK_ID);
      await underwritingLocker.connect(user2).transferFrom(user1.address, user2.address, LOCKED_LOCK_ID); // user2 already approved
      expect(await underwritingLocker.ownerOf(LOCKED_LOCK_ID)).eq(user2.address);
      await underwritingLocker.connect(user2).approve(user1.address, LOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      await underwritingLocker.connect(user1)['safeTransferFrom(address,address,uint256)'](user2.address, user1.address, LOCKED_LOCK_ID);
      expect(await underwritingLocker.ownerOf(LOCKED_LOCK_ID)).eq(user1.address);
      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user2.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(LOCK_AMOUNT);
      expect(listenerUpdate.oldLock.end).eq(LOCK_END);
      expect(listenerUpdate.newLock.amount).eq(LOCK_AMOUNT);
      expect(listenerUpdate.newLock.end).eq(LOCK_END);
    });
    it("can transfer when unlocked, and listener notified", async function () {
      const UNLOCKED_LOCK_ID = 2;
      const {amount: LOCK_AMOUNT, end: LOCK_END} = await underwritingLocker.locks(UNLOCKED_LOCK_ID);
      await underwritingLocker.connect(user1).transfer(user2.address, UNLOCKED_LOCK_ID);
      expect(await underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).eq(user2.address);
      await underwritingLocker.connect(user2).safeTransfer(user1.address, UNLOCKED_LOCK_ID);
      expect(await underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).eq(user1.address);
      await underwritingLocker.connect(user1).approve(user2.address, UNLOCKED_LOCK_ID);
      await underwritingLocker.connect(user2).transferFrom(user1.address, user2.address, UNLOCKED_LOCK_ID); // user2 already approved
      expect(await underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).eq(user2.address);
      await underwritingLocker.connect(user2).approve(user1.address, UNLOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      await underwritingLocker.connect(user1)['safeTransferFrom(address,address,uint256)'](user2.address, user1.address, UNLOCKED_LOCK_ID);
      expect(await underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).eq(user1.address);
      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(UNLOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user2.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(LOCK_AMOUNT);
      expect(listenerUpdate.oldLock.end).eq(LOCK_END);
      expect(listenerUpdate.newLock.amount).eq(LOCK_AMOUNT);
      expect(listenerUpdate.newLock.end).eq(LOCK_END);
    });
  });

  describe("sanity check for view functions for individual locks", function () {
    it("should not be able to query nonexistent lockIDs", async function () {
      await expect(underwritingLocker.ownerOf(999)).to.be.revertedWith("ERC721: invalid token ID");
      await expect(underwritingLocker.locks(999)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.isLocked(999)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.timeLeft(999)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getWithdrawAmount(999)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getWithdrawInPartAmount(999, 0)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getBurnOnWithdrawAmount(999)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getBurnOnWithdrawInPartAmount(999, 0)).to.be.revertedWith("query for nonexistent token");
      await expect(underwritingLocker.getLockMultiplier(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("should return appropriate values for locked lock", async function () {
      const LOCKED_LOCK_ID = 1;
      const lockState = await getLockState(LOCKED_LOCK_ID);

      expect(await lockState.isLocked).eq(true);
      expect(await lockState.timeLeft).above(0);
      
      /************************************************
        ALTER HERE IF WITHDRAWAL BURN FORMULA CHANGES
      ************************************************/

      const TIME_LEFT_IN_MONTHS_SCALED = SCALE_FACTOR.mul(lockState.timeLeft).div(ONE_MONTH);
      const EXPECTED_LOCK_MULTIPLIER = SCALE_FACTOR.mul(sqrt(TIME_LEFT_IN_MONTHS_SCALED)).div(sqrt(SCALE_FACTOR.mul(6)))
      expect(EXPECTED_LOCK_MULTIPLIER).eq(await underwritingLocker.getLockMultiplier(LOCKED_LOCK_ID))

      // ( 1 / (1 + lock_multiplier) ) * (1 - funding_rate)
      const EXPECTED_EARLY_WITHDRAW_MULTIPLIER_NUMERATOR = SCALE_FACTOR;
      const EXPECTED_EARLY_WITHDRAW_MULTIPLIER_DENOMINATOR = EXPECTED_LOCK_MULTIPLIER.add(SCALE_FACTOR);
      const EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_NUMERATOR = ONE_HUNDRED_PERCENT.sub(FUNDING_RATE)
      const EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_DENOMINATOR = SCALE_FACTOR

      const EXPECTED_WITHDRAW_AMOUNT = lockState.amount
      .mul(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_NUMERATOR)
      .mul(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_NUMERATOR)
      .div(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_DENOMINATOR)
      .div(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_DENOMINATOR)

      expect(await underwritingLocker.getWithdrawAmount(LOCKED_LOCK_ID)).eq(EXPECTED_WITHDRAW_AMOUNT);
      expect(await underwritingLocker.getBurnOnWithdrawAmount(LOCKED_LOCK_ID)).eq(lockState.amount.sub(EXPECTED_WITHDRAW_AMOUNT));

      const EXPECTED_WITHDRAW_IN_PART_AMOUNT = WITHDRAW_AMOUNT
      .mul(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_NUMERATOR)
      .mul(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_NUMERATOR)
      .div(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_DENOMINATOR)
      .div(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_DENOMINATOR)

      expect(await underwritingLocker.getWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)).eq(EXPECTED_WITHDRAW_IN_PART_AMOUNT);
      expect(await underwritingLocker.getBurnOnWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)).eq(WITHDRAW_AMOUNT.sub(EXPECTED_WITHDRAW_IN_PART_AMOUNT));
    });
    it("should return appropriate values for unlocked lock", async function () {
      const UNLOCKED_LOCK_ID = 2;
      const lockState = await getLockState(UNLOCKED_LOCK_ID);
      expect(await lockState.isLocked).eq(false);
      expect(await lockState.timeLeft).eq(0);

      // Expect withdraw = (1 - funding_rate) * requested_amount

      expect(await underwritingLocker.getLockMultiplier(UNLOCKED_LOCK_ID)).eq(0);
      expect(await underwritingLocker.getWithdrawAmount(UNLOCKED_LOCK_ID)).eq(lockState.amount.mul(ONE_HUNDRED_PERCENT.sub(FUNDING_RATE)).div(ONE_HUNDRED_PERCENT));
      expect(await underwritingLocker.getWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)).eq(WITHDRAW_AMOUNT.mul(ONE_HUNDRED_PERCENT.sub(FUNDING_RATE)).div(ONE_HUNDRED_PERCENT));
      expect(await underwritingLocker.getBurnOnWithdrawAmount(UNLOCKED_LOCK_ID)).eq(lockState.amount.mul(FUNDING_RATE).div(ONE_HUNDRED_PERCENT));
      expect(await underwritingLocker.getBurnOnWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)).eq(WITHDRAW_AMOUNT.mul(FUNDING_RATE).div(ONE_HUNDRED_PERCENT));
    });
  });

  describe("withdrawInPart", function () {
    it("cannot withdraw non existant token", async function () {
      const NON_EXISTENT_LOCK_ID = 999;
      // Error does not indicate non-existant tokenID, however it will revert regardless
      await expect(underwritingLocker.connect(user1).withdrawInPart(999, WITHDRAW_AMOUNT, user1.address)).to.be.revertedWith(`ExcessWithdraw(${NON_EXISTENT_LOCK_ID}, 0, ${WITHDRAW_AMOUNT.toString()})`)
    });
    it("cannot withdraw more than lock amount", async function () {
      const LOCK_ID = 1;
      const LOCK_AMOUNT = (await underwritingLocker.locks(1)).amount
      await expect(underwritingLocker.connect(user1).withdrawInPart(LOCK_ID, LOCK_AMOUNT.mul(2), user1.address)).to.be.revertedWith(`ExcessWithdraw(${LOCK_ID}, ${LOCK_AMOUNT.toString()}, ${LOCK_AMOUNT.mul(2).toString()})`)  
    });
    it("non owner or approved cannot withdraw", async function () {
      const LOCK_ID = 1;
      await expect(underwritingLocker.connect(user3).withdrawInPart(LOCK_ID, WITHDRAW_AMOUNT, user1.address)).to.be.revertedWith("only owner or approved");
    });
    it("owner can withdraw in part from unlocked lock, and listener notified", async function () {
      const UNLOCKED_LOCK_ID = 2;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(UNLOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      const ACTUAL_WITHDRAW_AMOUNT = await underwritingLocker.getWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const BURN_AMOUNT = await underwritingLocker.getBurnOnWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)

      const tx = await underwritingLocker.connect(user1).withdrawInPart(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT, user1.address);
      await expect(tx).to.emit(underwritingLocker, "Withdrawal").withArgs(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, BURN_ADDRESS, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, user1.address, ACTUAL_WITHDRAW_AMOUNT);
      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newLockState = await getLockState(UNLOCKED_LOCK_ID);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const lockStateChange = getLockStateChange(newLockState, oldLockState);

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(WITHDRAW_AMOUNT));
      expect(globalStateChange.totalSupply).eq(0)
      expect(userStateChange.lockedTokenAmount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(userStateChange.numOfLocks).eq(0);
      expect(userStateChange.tokenAmountInWallet).eq(ACTUAL_WITHDRAW_AMOUNT);
      expect(lockStateChange.amount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(lockStateChange.end).eq(0);
      expect(lockStateChange.timeLeft).eq(0);

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(UNLOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState.end);
    });
    it("approved can withdraw in part from unlocked lock, and listener notified", async function () {
      const UNLOCKED_LOCK_ID = 2;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(UNLOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      const ACTUAL_WITHDRAW_AMOUNT = await underwritingLocker.getWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const BURN_AMOUNT = await underwritingLocker.getBurnOnWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)

      await underwritingLocker.connect(user1).approve(user2.address, UNLOCKED_LOCK_ID);
      const tx = await underwritingLocker.connect(user2).withdrawInPart(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT, user1.address);
      await expect(tx).to.emit(underwritingLocker, "Withdrawal").withArgs(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, BURN_ADDRESS, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, user1.address, ACTUAL_WITHDRAW_AMOUNT);

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newLockState = await getLockState(UNLOCKED_LOCK_ID);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const lockStateChange = getLockStateChange(newLockState, oldLockState);

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(WITHDRAW_AMOUNT));
      expect(globalStateChange.totalSupply).eq(0)
      expect(userStateChange.lockedTokenAmount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(userStateChange.numOfLocks).eq(0);
      expect(userStateChange.tokenAmountInWallet).eq(ACTUAL_WITHDRAW_AMOUNT);
      expect(lockStateChange.amount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(lockStateChange.end).eq(0);
      expect(lockStateChange.timeLeft).eq(0);

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 2);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(UNLOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState.end);
    });
    it("owner can withdraw in part from locked lock with penalty, and listener notified", async function () {
      const LOCKED_LOCK_ID = 1;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(LOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

      const tx = await underwritingLocker.connect(user1).withdrawInPart(LOCKED_LOCK_ID, WITHDRAW_AMOUNT, user1.address);
      // Need to calculate ACTUAL_WITHDRAW_AMOUNT and BURN_AMOUNT after tx executed, transaction uses block finalization timestamp?
      const ACTUAL_WITHDRAW_AMOUNT = await underwritingLocker.getWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const BURN_AMOUNT = await underwritingLocker.getBurnOnWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      await expect(tx).to.emit(underwritingLocker, "EarlyWithdrawal").withArgs(LOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, BURN_ADDRESS, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, user1.address, ACTUAL_WITHDRAW_AMOUNT);

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newLockState = await getLockState(LOCKED_LOCK_ID);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const lockStateChange = getLockStateChange(newLockState, oldLockState);

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(WITHDRAW_AMOUNT));
      expect(globalStateChange.totalSupply).eq(0)
      expect(userStateChange.lockedTokenAmount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(userStateChange.numOfLocks).eq(0);
      expect(userStateChange.tokenAmountInWallet).eq(ACTUAL_WITHDRAW_AMOUNT);
      expect(lockStateChange.amount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(lockStateChange.end).eq(0);

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState.end);
    });
    it("approved can withdraw in part from locked lock with penalty, and listener notified", async function () {
      const LOCKED_LOCK_ID = 1;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(LOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

      await underwritingLocker.connect(user1).approve(user2.address, LOCKED_LOCK_ID);
      const tx = await underwritingLocker.connect(user2).withdrawInPart(LOCKED_LOCK_ID, WITHDRAW_AMOUNT, user1.address);
      const ACTUAL_WITHDRAW_AMOUNT = await underwritingLocker.getWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const BURN_AMOUNT = await underwritingLocker.getBurnOnWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      await expect(tx).to.emit(underwritingLocker, "EarlyWithdrawal").withArgs(LOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, BURN_ADDRESS, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, user1.address, ACTUAL_WITHDRAW_AMOUNT);

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newLockState = await getLockState(LOCKED_LOCK_ID);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const lockStateChange = getLockStateChange(newLockState, oldLockState);

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(WITHDRAW_AMOUNT));
      expect(globalStateChange.totalSupply).eq(0)
      expect(userStateChange.lockedTokenAmount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(userStateChange.numOfLocks).eq(0);
      expect(userStateChange.tokenAmountInWallet).eq(ACTUAL_WITHDRAW_AMOUNT);
      expect(lockStateChange.amount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(lockStateChange.end).eq(0);

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 2);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCKED_LOCK_ID);
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
   * There are two locks:
   * i.) lockID 1 => 2wk lock held by user1, with 1e18 token locked
   * ii.) lockID 2 => Unlocked lock held by user1, with 1e18 token staked
   */

  describe("withdrawInPartMultiple", function () {
    // Deposit 4e18 token into each lockID
    before(async function () {
      await underwritingLocker.connect(user1).increaseAmountMultiple([1, 2], [DEPOSIT_AMOUNT.mul(2), DEPOSIT_AMOUNT.mul(2)])
    });
    it("must provide argument arrays of matching length", async function () {
      const LOCK_ID_1 = 1;
      const LOCK_ID_2 = 2;

      await expect(underwritingLocker.connect(user1).withdrawInPartMultiple(
        [LOCK_ID_1, LOCK_ID_2], 
        [WITHDRAW_AMOUNT],
        user1.address
      )).to.be.revertedWith("ArrayArgumentsLengthMismatch");
    });
    it("cannot withdraw non existant token", async function () {
      const NON_EXISTENT_LOCK_ID = 999;
      const LOCK_ID_1 = 1;
      // Error does not indicate non-existant tokenID, however it will revert regardless
      await expect(underwritingLocker.connect(user1).withdrawInPartMultiple(
        [LOCK_ID_1, NON_EXISTENT_LOCK_ID], 
        [WITHDRAW_AMOUNT, WITHDRAW_AMOUNT],
        user1.address
      )).to.be.revertedWith("ERC721: invalid token ID");
    });
    it("cannot withdraw more than lock amount", async function () {
      const LOCK_ID_1 = 1;
      const LOCK_ID_2 = 2;
      const LOCK_AMOUNT_2 = (await underwritingLocker.locks(2)).amount
      await expect(underwritingLocker.connect(user1).withdrawInPartMultiple(
        [LOCK_ID_1, LOCK_ID_2], 
        [WITHDRAW_AMOUNT, LOCK_AMOUNT_2.mul(2)],
        user1.address
      )).to.be.revertedWith(`ExcessWithdraw(${LOCK_ID_2}, ${LOCK_AMOUNT_2.toString()}, ${LOCK_AMOUNT_2.mul(2).toString()})`);
    });
    it("non owner or approved cannot withdraw", async function () {
      const LOCK_ID_1 = 1;
      const LOCK_ID_2 = 2;
      await expect(underwritingLocker.connect(user3).withdrawInPartMultiple(
        [LOCK_ID_1, LOCK_ID_2], 
        [WITHDRAW_AMOUNT, WITHDRAW_AMOUNT],
        user1.address
      )).to.be.revertedWith("NotOwnerNorApproved");
    });
    it("owner can withdraw in part from multiple locks, and listener notified", async function () {
      const LOCKED_LOCK_ID = 1;
      const UNLOCKED_LOCK_ID = 2;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState_Locked = await getLockState(LOCKED_LOCK_ID);
      const oldLockState_Unlocked = await getLockState(UNLOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')

      const tx = await underwritingLocker.connect(user1).withdrawInPartMultiple(
        [LOCKED_LOCK_ID, UNLOCKED_LOCK_ID], 
        [WITHDRAW_AMOUNT, WITHDRAW_AMOUNT],
        user1.address
      )
      
      const ACTUAL_WITHDRAW_AMOUNT_UNLOCKED = await underwritingLocker.getWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const BURN_AMOUNT_UNLOCKED = await underwritingLocker.getBurnOnWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const ACTUAL_WITHDRAW_AMOUNT_LOCKED = await underwritingLocker.getWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const BURN_AMOUNT_LOCKED = await underwritingLocker.getBurnOnWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      await expect(tx).to.emit(underwritingLocker, "Withdrawal").withArgs(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT_UNLOCKED, BURN_AMOUNT_UNLOCKED);
      await expect(tx).to.emit(underwritingLocker, "EarlyWithdrawal").withArgs(LOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT_LOCKED, BURN_AMOUNT_LOCKED);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, BURN_ADDRESS, BURN_AMOUNT_UNLOCKED.add(BURN_AMOUNT_LOCKED));
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, user1.address, ACTUAL_WITHDRAW_AMOUNT_UNLOCKED.add(ACTUAL_WITHDRAW_AMOUNT_LOCKED));

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newLockState_Locked = await getLockState(LOCKED_LOCK_ID);
      const newLockState_Unlocked = await getLockState(UNLOCKED_LOCK_ID);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const lockStateChange_Locked = getLockStateChange(newLockState_Locked, oldLockState_Locked);
      const lockStateChange_Unlocked = getLockStateChange(newLockState_Unlocked, oldLockState_Unlocked);

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(WITHDRAW_AMOUNT.mul(2)));
      expect(globalStateChange.totalSupply).eq(0)
      expect(userStateChange.lockedTokenAmount).eq(WITHDRAW_AMOUNT.mul(-2));
      expect(userStateChange.numOfLocks).eq(0);
      expect(userStateChange.tokenAmountInWallet).eq(ACTUAL_WITHDRAW_AMOUNT_LOCKED.add(ACTUAL_WITHDRAW_AMOUNT_UNLOCKED));
      expect(lockStateChange_Locked.amount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(lockStateChange_Locked.end).eq(0);
      expect(lockStateChange_Unlocked.amount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(lockStateChange_Unlocked.end).eq(0);

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(UNLOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState_Unlocked.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState_Unlocked.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState_Unlocked.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState_Unlocked.end);
    });
    it("approved can withdraw in part from multiple locks, and listener notified", async function () {
      const LOCKED_LOCK_ID = 1;
      const UNLOCKED_LOCK_ID = 2;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState_Locked = await getLockState(LOCKED_LOCK_ID);
      const oldLockState_Unlocked = await getLockState(UNLOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest');

      await underwritingLocker.connect(user1).setApprovalForAll(user2.address, true)
      const tx = await underwritingLocker.connect(user2).withdrawInPartMultiple(
        [LOCKED_LOCK_ID, UNLOCKED_LOCK_ID], 
        [WITHDRAW_AMOUNT, WITHDRAW_AMOUNT],
        user1.address
      )

      const ACTUAL_WITHDRAW_AMOUNT_UNLOCKED = await underwritingLocker.getWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const BURN_AMOUNT_UNLOCKED = await underwritingLocker.getBurnOnWithdrawInPartAmount(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const ACTUAL_WITHDRAW_AMOUNT_LOCKED = await underwritingLocker.getWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      const BURN_AMOUNT_LOCKED = await underwritingLocker.getBurnOnWithdrawInPartAmount(LOCKED_LOCK_ID, WITHDRAW_AMOUNT)
      await expect(tx).to.emit(underwritingLocker, "Withdrawal").withArgs(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT_UNLOCKED, BURN_AMOUNT_UNLOCKED);
      await expect(tx).to.emit(underwritingLocker, "EarlyWithdrawal").withArgs(LOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT_LOCKED, BURN_AMOUNT_LOCKED);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, BURN_ADDRESS, BURN_AMOUNT_UNLOCKED.add(BURN_AMOUNT_LOCKED));
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, user1.address, ACTUAL_WITHDRAW_AMOUNT_UNLOCKED.add(ACTUAL_WITHDRAW_AMOUNT_LOCKED));

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newLockState_Locked = await getLockState(LOCKED_LOCK_ID);
      const newLockState_Unlocked = await getLockState(UNLOCKED_LOCK_ID);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const lockStateChange_Locked = getLockStateChange(newLockState_Locked, oldLockState_Locked);
      const lockStateChange_Unlocked = getLockStateChange(newLockState_Unlocked, oldLockState_Unlocked);

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(WITHDRAW_AMOUNT.mul(2)));
      expect(globalStateChange.totalSupply).eq(0)
      expect(userStateChange.lockedTokenAmount).eq(WITHDRAW_AMOUNT.mul(-2));
      expect(userStateChange.numOfLocks).eq(0);
      expect(userStateChange.tokenAmountInWallet).eq(ACTUAL_WITHDRAW_AMOUNT_UNLOCKED.add(ACTUAL_WITHDRAW_AMOUNT_LOCKED));
      expect(lockStateChange_Locked.amount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(lockStateChange_Locked.end).eq(0);
      expect(lockStateChange_Unlocked.amount).eq(WITHDRAW_AMOUNT.mul(-1));
      expect(lockStateChange_Unlocked.end).eq(0);

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 2);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(UNLOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState_Unlocked.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState_Unlocked.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState_Unlocked.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState_Unlocked.end);
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * There are two locks:
   * i.) lockID 1 => 2wk lock held by user1, with 1e18 token locked
   * ii.) lockID 2 => Unlocked lock held by user1, with 1e18 token staked
   */

  describe("withdraw", function () {

    /**
     * Skip time forward, and create two more locks such that:
     * 
     * lockID 1 => Unlocked lock held by user1, with 1e18 token staked
     * lockID 2 => Unlocked lock held by user1, with 1e18 token staked
     * lockID 3 => Locked (1yr) lock held by user1, with 1e18 token staked
     * lockID 4 => Locked (1yr) lock held by user1, with 1e18 token staked
     */
    //

    before(async function () {
      const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
      await provider.send("evm_mine", [CURRENT_TIME + 2 * ONE_WEEK]);
      expect(await underwritingLocker.isLocked(1)).eq(false)
      expect(await underwritingLocker.isLocked(2)).eq(false)
      await underwritingLocker.connect(user1).createLock(user1.address, DEPOSIT_AMOUNT, CURRENT_TIME + ONE_YEAR);
      await underwritingLocker.connect(user1).createLock(user1.address, DEPOSIT_AMOUNT, CURRENT_TIME + ONE_YEAR);
    });
    it("cannot withdraw non existant token", async function () {
      const NON_EXISTENT_LOCK_ID = 999;
      // Error does not indicate non-existant tokenID, however it will revert regardless
      await expect(underwritingLocker.connect(user1).withdraw(999, user1.address)).to.be.revertedWith("ERC721: invalid token ID")
    });
    it("non owner or approved cannot withdraw", async function () {
      const LOCK_ID = 1;
      await expect(underwritingLocker.connect(user3).withdraw(LOCK_ID, user3.address)).to.be.revertedWith("only owner or approved");
    });
    it("owner can withdraw from unlocked lock, and listener notified", async function () {
      const UNLOCKED_LOCK_ID = 1;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(UNLOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      const LOCK_AMOUNT = oldLockState.amount;

      const ACTUAL_WITHDRAW_AMOUNT = await underwritingLocker.getWithdrawAmount(UNLOCKED_LOCK_ID)
      const BURN_AMOUNT = await underwritingLocker.getBurnOnWithdrawAmount(UNLOCKED_LOCK_ID)
      const tx = await underwritingLocker.connect(user1).withdraw(UNLOCKED_LOCK_ID, user1.address);
      await expect(tx).to.emit(underwritingLocker, "Withdrawal").withArgs(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, BURN_ADDRESS, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, user1.address, ACTUAL_WITHDRAW_AMOUNT);

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(LOCK_AMOUNT));
      expect(globalStateChange.totalSupply).eq(-1)
      expect(userStateChange.lockedTokenAmount).eq(LOCK_AMOUNT.mul(-1));
      expect(userStateChange.numOfLocks).eq(-1);
      expect(userStateChange.tokenAmountInWallet).eq(ACTUAL_WITHDRAW_AMOUNT);
      await expect(underwritingLocker.locks(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.timeLeft(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.isLocked(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).to.be.revertedWith("ERC721: invalid token ID")

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(UNLOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(ZERO_ADDRESS);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(ZERO);
      expect(listenerUpdate.newLock.end).eq(ZERO);
    });
    it("approved can withdraw from unlocked lock, and listener notified", async function () {
      const UNLOCKED_LOCK_ID = 2;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(UNLOCKED_LOCK_ID);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      const LOCK_AMOUNT = oldLockState.amount;

      await underwritingLocker.connect(user1).approve(user2.address, UNLOCKED_LOCK_ID);
      const ACTUAL_WITHDRAW_AMOUNT = await underwritingLocker.getWithdrawAmount(UNLOCKED_LOCK_ID)
      const BURN_AMOUNT = await underwritingLocker.getBurnOnWithdrawAmount(UNLOCKED_LOCK_ID)
      const tx = await underwritingLocker.connect(user2).withdraw(UNLOCKED_LOCK_ID, user1.address);
      await expect(tx).to.emit(underwritingLocker, "Withdrawal").withArgs(UNLOCKED_LOCK_ID, WITHDRAW_AMOUNT, ACTUAL_WITHDRAW_AMOUNT, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, BURN_ADDRESS, BURN_AMOUNT);
      await expect(tx).to.emit(token, "Transfer").withArgs(underwritingLocker.address, user1.address, ACTUAL_WITHDRAW_AMOUNT);

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(LOCK_AMOUNT));
      expect(globalStateChange.totalSupply).eq(-1)
      expect(userStateChange.lockedTokenAmount).eq(LOCK_AMOUNT.mul(-1));
      expect(userStateChange.numOfLocks).eq(-1);
      expect(userStateChange.tokenAmountInWallet).eq(ACTUAL_WITHDRAW_AMOUNT);
      await expect(underwritingLocker.locks(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.timeLeft(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.isLocked(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).to.be.revertedWith("ERC721: invalid token ID")

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 2);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(UNLOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(ZERO_ADDRESS);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(ZERO);
      expect(listenerUpdate.newLock.end).eq(ZERO);
    });
    it("owner can withdraw from locked lock with penalty, and listener notified", async function () {
      const LOCKED_LOCK_ID = 3;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(LOCKED_LOCK_ID);
      const oldBurnAddressBalance = await token.balanceOf(BURN_ADDRESS);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      const LOCK_AMOUNT = oldLockState.amount;
      
      const ACTUAL_WITHDRAW_AMOUNT = await underwritingLocker.getWithdrawAmount(LOCKED_LOCK_ID)
      const BURN_AMOUNT = await underwritingLocker.getBurnOnWithdrawAmount(LOCKED_LOCK_ID)
      const tx = await underwritingLocker.connect(user1).withdraw(LOCKED_LOCK_ID, user1.address);

      // Cannot get exact match to Withdrawal event parameters, because queries getWithdrawAmount and getBurnOnWithdrawAmount
      // are done at time `x`, however the timestamp for the mutator call withdraw is done at time `x + 1`
      // We cannot do `getWithdrawAmount` and `getBurnOnWithdrawAmount` queries at time `x + 1` because the lock doesn't exist at this time
      // Unless there is a way to simulate these queries at `x + 1`, then bring time back to `x` for withdraw call to be done at `x+1`
      // So we need to rely on i.) Testing of exact event parameters in earlier tests, ii.) Accept approximate result for results of desired events
      await expect(tx).to.emit(underwritingLocker, "EarlyWithdrawal")

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newBurnAddressBalance = await token.balanceOf(BURN_ADDRESS);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const burnAddressBalanceChange = newBurnAddressBalance.sub(oldBurnAddressBalance)

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(LOCK_AMOUNT));
      expect(globalStateChange.totalSupply).eq(-1)
      expect(userStateChange.lockedTokenAmount).eq(LOCK_AMOUNT.mul(-1));
      expect(userStateChange.numOfLocks).eq(-1);
      expectClose(userStateChange.tokenAmountInWallet, ACTUAL_WITHDRAW_AMOUNT, 1e15);
      expectClose(burnAddressBalanceChange, BURN_AMOUNT, 1e15);
      await expect(underwritingLocker.locks(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.timeLeft(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.isLocked(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.ownerOf(LOCKED_LOCK_ID)).to.be.revertedWith("ERC721: invalid token ID")

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(ZERO_ADDRESS);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(ZERO);
      expect(listenerUpdate.newLock.end).eq(ZERO);
    });
    it("approved can withdraw from locked lock with penalty, and listener notified", async function () {
      const LOCKED_LOCK_ID = 4;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(LOCKED_LOCK_ID);
      const oldBurnAddressBalance = await token.balanceOf(BURN_ADDRESS);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      const LOCK_AMOUNT = oldLockState.amount;

      await underwritingLocker.connect(user1).approve(user2.address, LOCKED_LOCK_ID);

      const ACTUAL_WITHDRAW_AMOUNT = await underwritingLocker.getWithdrawAmount(LOCKED_LOCK_ID)
      const BURN_AMOUNT = await underwritingLocker.getBurnOnWithdrawAmount(LOCKED_LOCK_ID)
      const tx = await underwritingLocker.connect(user2).withdraw(LOCKED_LOCK_ID, user1.address);
      await expect(tx).to.emit(underwritingLocker, "EarlyWithdrawal")

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newBurnAddressBalance = await token.balanceOf(BURN_ADDRESS);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const burnAddressBalanceChange = newBurnAddressBalance.sub(oldBurnAddressBalance)

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(LOCK_AMOUNT));
      expect(globalStateChange.totalSupply).eq(-1)
      expect(userStateChange.lockedTokenAmount).eq(LOCK_AMOUNT.mul(-1));
      expect(userStateChange.numOfLocks).eq(-1);
      expectClose(userStateChange.tokenAmountInWallet, ACTUAL_WITHDRAW_AMOUNT, 1e15);
      expectClose(burnAddressBalanceChange, BURN_AMOUNT, 1e15);
      await expect(underwritingLocker.locks(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.timeLeft(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.isLocked(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.ownerOf(LOCKED_LOCK_ID)).to.be.revertedWith("ERC721: invalid token ID")

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 2);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(ZERO_ADDRESS);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(ZERO);
      expect(listenerUpdate.newLock.end).eq(ZERO);
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * All locks have been burned, however the current lockIDs have been used previously and cannot be used again:
   * 1, 2, 3, 4
   */

  describe("withdrawMultiple", function () {
    /**
     * Create 4 locks - 2 locked and 2 unlocked:
     * 
     * lockID 5 -> unlocked
     * lockID 6 -> locked
     * lockID 7 -> unlocked
     * lockID 8 -> locked
     */
    before(async function () {
      const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
      await underwritingLocker.connect(user1).createLock(user1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 6 * ONE_MONTH + 10);
      await underwritingLocker.connect(user1).createLock(user1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 2 * ONE_YEAR);
      await underwritingLocker.connect(user1).createLock(user1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 6 * ONE_MONTH + 10);
      await underwritingLocker.connect(user1).createLock(user1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 2 * ONE_YEAR);
      await provider.send("evm_mine", [CURRENT_TIME + 6 * ONE_MONTH + ONE_WEEK]);
      expect(await underwritingLocker.isLocked(5)).eq(false)
      expect(await underwritingLocker.isLocked(6)).eq(true)
      expect(await underwritingLocker.isLocked(7)).eq(false)
      expect(await underwritingLocker.isLocked(8)).eq(true)
    });
    it("cannot withdraw non existant token", async function () {
      const NON_EXISTENT_LOCK_ID = 999;
      const UNLOCKED_LOCK_ID = 5;
      await expect(underwritingLocker.connect(user1).withdrawMultiple(
        [UNLOCKED_LOCK_ID, NON_EXISTENT_LOCK_ID], 
        user1.address
      )).to.be.revertedWith("ERC721: invalid token ID");
    });
    it("non owner or approved cannot withdraw", async function () {
      const UNLOCKED_LOCK_ID = 5;
      const LOCKED_LOCK_ID = 6;
      await expect(underwritingLocker.connect(user3).withdrawMultiple(
        [UNLOCKED_LOCK_ID, LOCKED_LOCK_ID], 
        user1.address
      )).to.be.revertedWith("NotOwnerNorApproved");
    });
    it("owner can withdraw from multiple locks, and listener notified", async function () {
      const UNLOCKED_LOCK_ID = 5;
      const LOCKED_LOCK_ID = 6;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(LOCKED_LOCK_ID);
      const oldBurnAddressBalance = await token.balanceOf(BURN_ADDRESS);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      const LOCK_AMOUNT = oldLockState.amount

      const ACTUAL_WITHDRAW_AMOUNT_LOCKED = await underwritingLocker.getWithdrawAmount(LOCKED_LOCK_ID)
      const BURN_AMOUNT_LOCKED = await underwritingLocker.getBurnOnWithdrawAmount(LOCKED_LOCK_ID)
      const ACTUAL_WITHDRAW_AMOUNT_UNLOCKED = await underwritingLocker.getWithdrawAmount(UNLOCKED_LOCK_ID)
      const BURN_AMOUNT_UNLOCKED = await underwritingLocker.getBurnOnWithdrawAmount(UNLOCKED_LOCK_ID)
      const tx = underwritingLocker.connect(user1).withdrawMultiple(
        [UNLOCKED_LOCK_ID, LOCKED_LOCK_ID], 
        user1.address
      )
      await expect(tx).to.emit(underwritingLocker, "Withdrawal")
      await expect(tx).to.emit(underwritingLocker, "EarlyWithdrawal")

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newBurnAddressBalance = await token.balanceOf(BURN_ADDRESS);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const burnAddressBalanceChange = newBurnAddressBalance.sub(oldBurnAddressBalance);

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(LOCK_AMOUNT));
      expect(globalStateChange.totalSupply).eq(-2)
      expect(userStateChange.lockedTokenAmount).eq(LOCK_AMOUNT.mul(-2));
      expect(userStateChange.numOfLocks).eq(-2);
      expectClose(userStateChange.tokenAmountInWallet, ACTUAL_WITHDRAW_AMOUNT_LOCKED.add(ACTUAL_WITHDRAW_AMOUNT_UNLOCKED), 1e15)
      expectClose(burnAddressBalanceChange, BURN_AMOUNT_LOCKED.add(BURN_AMOUNT_UNLOCKED), 1e15)

      await expect(underwritingLocker.locks(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.timeLeft(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.isLocked(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).to.be.revertedWith("ERC721: invalid token ID")
      await expect(underwritingLocker.locks(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.timeLeft(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.isLocked(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.ownerOf(LOCKED_LOCK_ID)).to.be.revertedWith("ERC721: invalid token ID")

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 1);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(ZERO_ADDRESS);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(ZERO);
      expect(listenerUpdate.newLock.end).eq(ZERO);
    });
    it("approved can withdraw from multiple locks, and listener notified", async function () {
      const UNLOCKED_LOCK_ID = 7;
      const LOCKED_LOCK_ID = 8;
      const oldGlobalState = await getGlobalState();
      const oldUserState = await getUserState(user1);
      const oldLockState = await getLockState(LOCKED_LOCK_ID);
      const oldBurnAddressBalance = await token.balanceOf(BURN_ADDRESS);
      const {number: CURRENT_BLOCK} = await provider.getBlock('latest')
      const LOCK_AMOUNT = oldLockState.amount

      await underwritingLocker.connect(user1).setApprovalForAll(user2.address, true)
      const ACTUAL_WITHDRAW_AMOUNT_LOCKED = await underwritingLocker.getWithdrawAmount(LOCKED_LOCK_ID)
      const BURN_AMOUNT_LOCKED = await underwritingLocker.getBurnOnWithdrawAmount(LOCKED_LOCK_ID)
      const ACTUAL_WITHDRAW_AMOUNT_UNLOCKED = await underwritingLocker.getWithdrawAmount(UNLOCKED_LOCK_ID)
      const BURN_AMOUNT_UNLOCKED = await underwritingLocker.getBurnOnWithdrawAmount(UNLOCKED_LOCK_ID)
      const tx = underwritingLocker.connect(user2).withdrawMultiple(
        [UNLOCKED_LOCK_ID, LOCKED_LOCK_ID], 
        user1.address
      )
      await expect(tx).to.emit(underwritingLocker, "Withdrawal");
      await expect(tx).to.emit(underwritingLocker, "EarlyWithdrawal");

      const newGlobalState = await getGlobalState();
      const newUserState = await getUserState(user1);
      const newBurnAddressBalance = await token.balanceOf(BURN_ADDRESS);
      const globalStateChange = getGlobalStateChange(newGlobalState, oldGlobalState);
      const userStateChange = getUserStateChange(newUserState, oldUserState);
      const burnAddressBalanceChange = newBurnAddressBalance.sub(oldBurnAddressBalance);

      expect(globalStateChange.totalNumLocks.eq(0));
      expect(globalStateChange.totalStakedAmount.eq(LOCK_AMOUNT));
      expect(globalStateChange.totalSupply).eq(-2)
      expect(userStateChange.lockedTokenAmount).eq(LOCK_AMOUNT.mul(-2));
      expect(userStateChange.numOfLocks).eq(-2);
      expectClose(userStateChange.tokenAmountInWallet, ACTUAL_WITHDRAW_AMOUNT_LOCKED.add(ACTUAL_WITHDRAW_AMOUNT_UNLOCKED), 1e15)
      expectClose(burnAddressBalanceChange, BURN_AMOUNT_LOCKED.add(BURN_AMOUNT_UNLOCKED), 1e15)

      await expect(underwritingLocker.locks(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.timeLeft(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.isLocked(UNLOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.ownerOf(UNLOCKED_LOCK_ID)).to.be.revertedWith("ERC721: invalid token ID")
      await expect(underwritingLocker.locks(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.timeLeft(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.isLocked(LOCKED_LOCK_ID)).to.be.revertedWith("query for nonexistent token")
      await expect(underwritingLocker.ownerOf(LOCKED_LOCK_ID)).to.be.revertedWith("ERC721: invalid token ID")

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.blocknum).eq(CURRENT_BLOCK + 2);
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCKED_LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(ZERO_ADDRESS);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(ZERO);
      expect(listenerUpdate.newLock.end).eq(ZERO);
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * All locks have been burned, however the current lockIDs have been used previously and cannot be used again:
   * 1, 2, 3, 4, 5, 6, 7, 8
   */

  describe("further sanity checks of funding rate mechanism", function () {
    /**
     * Create 2 more locks - 1 minimum-period lock (6 months) and 1 maximum-period lock (4 years)
     * 
     * lockID 9 -> 6-month lock
     * lockID 10 -> 4-yr lock
     */
    before(async function () {
      const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
      await underwritingLocker.connect(user1).createLock(user1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 6 * ONE_MONTH + 2);
      await underwritingLocker.connect(user1).createLock(user1.address, DEPOSIT_AMOUNT, CURRENT_TIME + 4 * ONE_YEAR);
    });

    it("should return appropriate values for minimum-period lock", async function () {
      const LOCK_ID = 9;
      const lockState = await getLockState(LOCK_ID);

      expect(lockState.isLocked).eq(true);
      expectClose(lockState.timeLeft, BN.from(6).mul(ONE_MONTH), 1e15)
      
      // Expect multiplier for minimum-period lock to be 1.0x
      const EXPECTED_LOCK_MULTIPLIER = ONE_HUNDRED_PERCENT;
      expectClose(await underwritingLocker.getLockMultiplier(LOCK_ID), EXPECTED_LOCK_MULTIPLIER, 1e15)

      // ( 1 / (1 + lock_multiplier) ) * (1 - funding_rate)
      const EXPECTED_EARLY_WITHDRAW_MULTIPLIER_NUMERATOR = SCALE_FACTOR;
      const EXPECTED_EARLY_WITHDRAW_MULTIPLIER_DENOMINATOR = EXPECTED_LOCK_MULTIPLIER.add(SCALE_FACTOR);
      const EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_NUMERATOR = ONE_HUNDRED_PERCENT.sub(FUNDING_RATE)
      const EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_DENOMINATOR = SCALE_FACTOR

      const EXPECTED_WITHDRAW_AMOUNT = lockState.amount
      .mul(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_NUMERATOR)
      .mul(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_NUMERATOR)
      .div(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_DENOMINATOR)
      .div(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_DENOMINATOR)

      expect(await underwritingLocker.getWithdrawAmount(LOCK_ID)).eq(EXPECTED_WITHDRAW_AMOUNT);
      expect(await underwritingLocker.getBurnOnWithdrawAmount(LOCK_ID)).eq(lockState.amount.sub(EXPECTED_WITHDRAW_AMOUNT));

      const EXPECTED_WITHDRAW_IN_PART_AMOUNT = WITHDRAW_AMOUNT
      .mul(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_NUMERATOR)
      .mul(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_NUMERATOR)
      .div(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_DENOMINATOR)
      .div(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_DENOMINATOR)

      expect(await underwritingLocker.getWithdrawInPartAmount(LOCK_ID, WITHDRAW_AMOUNT)).eq(EXPECTED_WITHDRAW_IN_PART_AMOUNT);
      expect(await underwritingLocker.getBurnOnWithdrawInPartAmount(LOCK_ID, WITHDRAW_AMOUNT)).eq(WITHDRAW_AMOUNT.sub(EXPECTED_WITHDRAW_IN_PART_AMOUNT));

      // Expect ~45% to be returned on withdraw at minimum lock period
      expectClose(await underwritingLocker.getWithdrawInPartAmount(LOCK_ID, WITHDRAW_AMOUNT), WITHDRAW_AMOUNT.mul(45).div(100), 1e15)
    });
    it("should return appropriate values for maximum-period lock", async function () {
      const LOCK_ID = 10;
      const lockState = await getLockState(LOCK_ID);

      expect(lockState.isLocked).eq(true);
      expectClose(lockState.timeLeft, BN.from(4).mul(ONE_YEAR), 1e15)
      
      // Expect multiplier for maximum-period lock to be sqrt(8) = 2.83x
      const EXPECTED_LOCK_MULTIPLIER = sqrt(SCALE_FACTOR.mul(SCALE_FACTOR).mul(8));
      expectClose(await underwritingLocker.getLockMultiplier(LOCK_ID), EXPECTED_LOCK_MULTIPLIER, 1e15)

      // ( 1 / (1 + lock_multiplier) ) * (1 - funding_rate)
      const EXPECTED_EARLY_WITHDRAW_MULTIPLIER_NUMERATOR = SCALE_FACTOR;
      const EXPECTED_EARLY_WITHDRAW_MULTIPLIER_DENOMINATOR = EXPECTED_LOCK_MULTIPLIER.add(SCALE_FACTOR);
      const EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_NUMERATOR = ONE_HUNDRED_PERCENT.sub(FUNDING_RATE)
      const EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_DENOMINATOR = SCALE_FACTOR

      const EXPECTED_WITHDRAW_AMOUNT = lockState.amount
      .mul(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_NUMERATOR)
      .mul(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_NUMERATOR)
      .div(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_DENOMINATOR)
      .div(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_DENOMINATOR)

      expectClose(await underwritingLocker.getWithdrawAmount(LOCK_ID), EXPECTED_WITHDRAW_AMOUNT, 1e15);
      expectClose(await underwritingLocker.getBurnOnWithdrawAmount(LOCK_ID), lockState.amount.sub(EXPECTED_WITHDRAW_AMOUNT), 1e15);

      const EXPECTED_WITHDRAW_IN_PART_AMOUNT = WITHDRAW_AMOUNT
      .mul(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_NUMERATOR)
      .mul(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_NUMERATOR)
      .div(EXPECTED_EARLY_WITHDRAW_MULTIPLIER_DENOMINATOR)
      .div(EXPECTED_WITHDRAW_MULTIPLIER_AFTER_FUNDING_DENOMINATOR)

      expectClose(await underwritingLocker.getWithdrawInPartAmount(LOCK_ID, WITHDRAW_AMOUNT), EXPECTED_WITHDRAW_IN_PART_AMOUNT, 1e15);
      expectClose(await underwritingLocker.getBurnOnWithdrawInPartAmount(LOCK_ID, WITHDRAW_AMOUNT), WITHDRAW_AMOUNT.sub(EXPECTED_WITHDRAW_IN_PART_AMOUNT), 1e15);

      // Expect ~23.5% to be returned on withdraw at maximum lock period
      expectClose(await underwritingLocker.getWithdrawInPartAmount(LOCK_ID, WITHDRAW_AMOUNT), WITHDRAW_AMOUNT.mul(235).div(1000), 1e15)
    });
  });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * The following locks have been burned, and the IDs cannot be used again:
   * 1, 2, 3, 4, 5, 6, 7, 8
   * 
   * The following locks exist:
   * lockID 9 -> 6-month lock, 1e18 deposit
   * lockID 10 -> 4-yr lock, 1e18 deposit
   */

  describe("chargePremium", function () {
    const votingContractProxy = ethers.Wallet.createRandom().connect(provider);

    it("will revert if called by non voting-contract", async function () {
      await expect(underwritingLocker.connect(governor).chargePremium(1, 1)).to.be.revertedWith("NotVotingContract");
    });
    it("will revert if attempt to charge premium for non-existent lock", async function () {
      await registry.connect(governor).set(["underwritingLockVoting"], [votingContractProxy.address])
      await underwritingLocker.connect(governor).setVotingContract()
      expect(await underwritingLocker.votingContract()).eq(votingContractProxy.address)
      await expect(underwritingLocker.connect(votingContractProxy).chargePremium(1, 0)).to.be.revertedWith("ERC721: invalid token ID");
    });
    it("will revert if attempt to charge more premium than exists in the lock", async function () {
      await expect(underwritingLocker.connect(votingContractProxy).chargePremium(9, DEPOSIT_AMOUNT.mul(2))).to.be.reverted;
    });
    it("premium can be charged, and listeners notified", async function () {
      const LOCK_ID = 9;
      const PREMIUM_AMOUNT = DEPOSIT_AMOUNT.div(2)
      const oldLockState = await getLockState(LOCK_ID)

      await user1.sendTransaction({to: votingContractProxy.address, value: ONE_ETHER}) // Send gas money
      const tx = await underwritingLocker.connect(votingContractProxy).chargePremium(9, PREMIUM_AMOUNT)
      const newLockState = await getLockState(LOCK_ID)
      const lockStateChange = await getLockStateChange(newLockState, oldLockState)
      expect(lockStateChange.amount).eq(PREMIUM_AMOUNT.mul(-1))

      const listenerUpdate = await listener.lastUpdate();
      expect(listenerUpdate.caller).eq(underwritingLocker.address);
      expect(listenerUpdate.lockID).eq(LOCK_ID);
      expect(listenerUpdate.oldOwner).eq(user1.address);
      expect(listenerUpdate.newOwner).eq(user1.address);
      expect(listenerUpdate.oldLock.amount).eq(oldLockState.amount);
      expect(listenerUpdate.oldLock.end).eq(oldLockState.end);
      expect(listenerUpdate.newLock.amount).eq(newLockState.amount);
      expect(listenerUpdate.newLock.end).eq(newLockState.end);
    });

  /*******************
    STATE SUMMARY
  *******************/
  /**
   * The following locks have been burned, and the IDs cannot be used again:
   * 1, 2, 3, 4, 5, 6, 7, 8
   * 
   * The following locks exist:
   * lockID 9 -> 6-month lock, 5e17 deposit
   * lockID 10 -> 4-yr lock, 1e18 deposit
   */


  });

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
    try {
      const lock = await underwritingLocker.locks(lockID);

      return {
        amount: lock.amount,
        end: lock.end,
        timeLeft: await underwritingLocker.timeLeft(lockID),
        isLocked: await underwritingLocker.isLocked(lockID),
        ownerOf: await underwritingLocker.ownerOf(lockID)
      }
    } catch {
      return {
        amount: ZERO,
        end: ZERO,
        timeLeft: ZERO,
        isLocked: false,
        ownerOf: ZERO_ADDRESS
      }
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

  // https://github.com/ethers-io/ethers.js/issues/1182
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
