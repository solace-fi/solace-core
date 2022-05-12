import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, ContractTransaction } from "ethers";
const { parseUnits } = ethers.utils
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Solace, MerkleDistributor, XsLocker } from "./../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

describe("MerkleDistributor", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, greedy_anon] = provider.getWallets();

  // solace contracts
  let solace: Solace;
  let xsLocker: XsLocker;
  let merkleDistributor: MerkleDistributor;

  let snapshot: BN;
  let tx: ContractTransaction

  // vars
  const ZERO = BN.from("0")
  const ONE = BN.from("1")
  const TEN_ETHER = BN.from("10000000000000000000");
  const MAX_LOCK_DURATION = 4 * 31536000
  const merkleRoot = "0x6e020dbc9a52672e91ea095f51827f76857d5d0bfecdb8d453c490031d3822ac"
  const TOTAL_AIRDROP_AMOUNT = parseUnits("10000000", 18) // 10M SOLACE
  let address_with_lock: string = "0x8b80755C441d355405CA7571443Bb9247B77Ec16"
  let address_without_lock: string = "0x7D7efB2521c6082796A3b565036657c90f4D6a6B"

  // Create class
  class AirdropRecipient{
    address: string;
    amount: BN;
    lockTime: BN;
    merkleProof: string[];
    
    constructor(
      address_: string, 
      amount_: BN, 
      lockTime_: BN, 
      merkleProof_: string[]
      ) {
        this.address = address_
        this.amount = amount_
        this.lockTime = lockTime_
        this.merkleProof = merkleProof_
    }
  }

  // Instantiate classes
  const user_with_lock = new AirdropRecipient(
    address_with_lock,
    BN.from("167260274146021285559982"),
    BN.from("66906979"),
    [
      '0x84555c2f0e7d94e43ab69333e673ff18f274f448776111dbcfc03724e72a49f7',
      '0x8d790ce073a728a25fb945a8d6d45f9559748f5e4f71ae12260e39eb1bee83f1',
      '0x851dbba27d0f5826d8363baa66123db3bea9597d6e42adf5015d68c513272f01',
      '0x8f9a0a9c39e0d4d7ed5a1b7ddb8291cb0a28ba54637aa6bdaf1c656fdee5138a',
      '0x1d7c54927fd756b7dd11ef259b932049954b7a4900b549be152d808d43aca458',
      '0x65d8bf7b752a468412771a7803254424003853ff999bcdf2d0764448b89a797f',
      '0x1bdd235b153b814877939c3ba00af4fcf29011b368d802cff54d8c8a3cc459d3',
      '0x8ef98ed4a82d37c728fdc5de64406b0e2f65e0a171e5eda4e1d396717bbd6466',
      '0x1eba9c19101202483d80ef277aaf0f0712d9260a091c07cbed98ee38e4290b00',
      '0xc00d35da994b71d1c63f63f2fc46d858ed2c3ed664f6904fe4195318b36e8f09'
    ]
  )

  const user_without_lock = new AirdropRecipient(
    address_without_lock,
    BN.from("7521268306386985386780"),
    ZERO,
    [
      '0xa69a187e2ed2e9e2aed1608742137a3c9a3542b3de41ba74e4bbbd29bb790c9c',
      '0xb7db82a705a7c97560d7b406dbd3e79d48da60679c485d692ef3fc96133951dc',
      '0xf936673a4726da2d42d96f07c40e5c36df6bc6e8b2ec5b848742b890f872423c',
      '0x13d92e2c9e2ff9efcca5bea46d6b49f00ee4df60e97f8bf05278d801ca117add',
      '0x67d491091dab2a6ad264fac470a8768ce689361dd3f2593a91103883f8caeddb'
    ]
  )

  // Incorrect merkle root
  const greedy_random = new AirdropRecipient(
    greedy_anon.address,
    TOTAL_AIRDROP_AMOUNT,
    ZERO,
    [
      '0xaffe48dd3bc622b18c95fef7f420a850319d9215dbb369344a4282c4b76e8c4d',
      '0x62534b60a2ca693e75395432d4f4240eb87a40cffb9a15d3d17ace67978d2fb5',
      '0xd55074396fb7f0c47f11eb43bf75faf03a66f7859c33f67c05dd5e013959f0aa',
      '0xfe5e23e2e2c89533072b8f44c032a25e7578300aa9e775a91ccb582d889e6010',
      '0x59bb99e4edf3d86bf99a6abab25ad5b71e4347e4fd703e1e116344589eb896a8',
      '0x92cf753759730eafe4526610c3f2e6f107e1d3d4d9ac325b07509af980af7526',
      '0xa8d661b9875964041863269ac6f80c742698e882f415f8b429bb62fb2179c993',
      '0x7bfc4fc6208faa54d71220f431895a244817c75514c7211253d4bdf2d1fbe6e7',
      '0xfb03cae7eb1ce135771749d804248165592a5fc56f023e3e91c2ca5d394cc9c4',
      '0x05f94696863f0716663de4708932f7148f65e7b5eb5d540fd5d658948cc07c2d'
    ]    
  )

  before(async function() {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    xsLocker = (await deployContract(deployer, artifacts.xsLocker, [governor.address, solace.address])) as XsLocker;

  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("deploys", async function () {
      merkleDistributor = (await deployContract(deployer, artifacts.MerkleDistributor, [solace.address, merkleRoot, governor.address, xsLocker.address])) as MerkleDistributor;
      await expectDeployed(merkleDistributor.address);
    });
    it("mints 10M SOLACE to merkleDistributor", async function () {
      await solace.connect(governor).addMinter(governor.address)
      await solace.connect(governor).mint(merkleDistributor.address, TOTAL_AIRDROP_AMOUNT)
    })
  });

  describe("governance", () => {
    it("starts with the correct governor", async () => {
      expect(await merkleDistributor.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async  () => {
      await expect(merkleDistributor.connect(greedy_anon).setPendingGovernance(greedy_anon.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async () => {
      let tx = await merkleDistributor.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(merkleDistributor, "GovernancePending").withArgs(deployer.address);
      expect(await merkleDistributor.governance()).to.equal(governor.address);
      expect(await merkleDistributor.pendingGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async () => {
      await expect(merkleDistributor.connect(greedy_anon).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async () => {
      let tx = await merkleDistributor.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(merkleDistributor, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await merkleDistributor.governance()).to.equal(deployer.address);
      await merkleDistributor.connect(deployer).setPendingGovernance(governor.address);
      await merkleDistributor.connect(governor).acceptGovernance();
    });
  });

  describe("MAX_LOCK_DURATION", function() {
    it("starts with the correct MAX_LOCK_DURATION value", async function() {
      expect(await merkleDistributor.MAX_LOCK_DURATION()).to.equal(MAX_LOCK_DURATION);
    });
  });

  describe("token", function() {
    it("starts with the correct token address", async function() {
      expect(await merkleDistributor.token()).to.equal(solace.address);
    });
  });

  describe("xsLocker", function() {
    it("starts with the correct xsLocker address", async function() {
      expect(await merkleDistributor.xsLocker()).to.equal(xsLocker.address);
    });
  });

  describe("merkleRoot", function() {
    it("starts with the correct merkleRoot", async function() {
      expect(await merkleDistributor.merkleRoot()).to.equal(merkleRoot);
    });
  });

  describe("claim", function() {
    it("throws if lockTime too long", async function() {      
      await expect(merkleDistributor.connect(governor).claim(user_without_lock.address, user_without_lock.amount, MAX_LOCK_DURATION + 1, user_without_lock.merkleProof)).to.be.revertedWith("LockTimeTooLong");
    });

    it("throws on invalid claim", async function() {      
      await expect(merkleDistributor.connect(greedy_anon).claim(greedy_random.address, greedy_random.amount, greedy_random.lockTime, greedy_random.merkleProof)).to.be.revertedWith("NotInMerkle");
    });

    it("successfully claims without lock", async function() {      
      // Test that anyone can call airdrop claim on behalf of airdrop recipient
      // However the airdrop recipient will receive the airdrop, and NOT the claim() caller
      tx = await merkleDistributor.connect(greedy_anon).claim(user_without_lock.address, user_without_lock.amount, user_without_lock.lockTime, user_without_lock.merkleProof);
      expect(await solace.balanceOf(user_without_lock.address)).eq(user_without_lock.amount)
      expect(await solace.balanceOf(greedy_anon.address)).eq(ZERO)
      await expect(tx).to.emit(merkleDistributor, "Claimed").withArgs(user_without_lock.address, user_without_lock.amount);
    });

    it("cannot claim without lock again", async function () {
      await expect(merkleDistributor.connect(greedy_anon).claim(user_without_lock.address, user_without_lock.amount, user_without_lock.lockTime, user_without_lock.merkleProof)).to.be.revertedWith("AlreadyClaimed")
    })

    it("successfully claims with lock", async function() {      
      const old_solace_balance_of_xslocker = await solace.balanceOf(xsLocker.address)
      // Test that anyone can call airdrop claim on behalf of airdrop recipient
      // However the airdrop recipient will receive the airdrop, and NOT the claim() caller
      tx = await merkleDistributor.connect(greedy_anon).claim(user_with_lock.address, user_with_lock.amount, user_with_lock.lockTime, user_with_lock.merkleProof);
      expect(await solace.balanceOf(user_with_lock.address)).eq(ZERO)
      expect(await solace.balanceOf(greedy_anon.address)).eq(ZERO)
      await expect(tx).to.emit(merkleDistributor, "Claimed").withArgs(user_with_lock.address, user_with_lock.amount);

      // Confirm lock created
      expect(await solace.balanceOf(xsLocker.address)).eq(old_solace_balance_of_xslocker.add(user_with_lock.amount))
      expect(await xsLocker.balanceOf(user_with_lock.address)).eq(ONE)
      expect(await xsLocker.tokenOfOwnerByIndex(user_with_lock.address, 0)).eq(ONE)
      expect(await xsLocker.timeLeft(ONE)).eq(user_with_lock.lockTime)
      expect(await xsLocker.stakedBalance(user_with_lock.address)).eq(user_with_lock.amount)
      await expect(tx).to.emit(xsLocker, "LockCreated").withArgs(ONE);
    });

    it("cannot claim with lock again", async function () {
      await expect(merkleDistributor.connect(greedy_anon).claim(user_with_lock.address, user_with_lock.amount, user_with_lock.lockTime, user_with_lock.merkleProof)).to.be.revertedWith("AlreadyClaimed")
    })
  });

  describe("hasClaimed", function() {
    it("returns true for users who have already claimed", async function() {
      expect(await merkleDistributor.hasClaimed(user_with_lock.address)).to.equal(true);
      expect(await merkleDistributor.hasClaimed(user_without_lock.address)).to.equal(true);
    });

    it("returns false for user who has not claimed", async function() {
      expect(await merkleDistributor.hasClaimed(greedy_anon.address)).to.equal(false);
    });
  });

  describe("governorRecoverAirdropTokens", function() {
    it("reverts if called by non-governor", async function() {
      await expect(merkleDistributor.connect(greedy_anon).governorRecoverAirdropTokens()).to.be.revertedWith("!governance")
    });

    it("successfully recovers airdrop tokens", async function() {
      const balance = await solace.balanceOf(merkleDistributor.address)
      tx = await merkleDistributor.connect(governor).governorRecoverAirdropTokens()
      expect(await solace.balanceOf(merkleDistributor.address)).to.eq(ZERO)
      expect(await solace.balanceOf(governor.address)).to.eq(balance)
      await expect(tx).to.emit(merkleDistributor, "GovernorRecoverAirdropTokens").withArgs(balance);
    });
  })

});
