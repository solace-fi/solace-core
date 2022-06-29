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
import { Solace, MerkleDistributor } from "./../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

describe("MerkleDistributor", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, greedy_anon] = provider.getWallets();

  // solace contracts
  let solace: Solace;
  let merkleDistributor: MerkleDistributor;

  let snapshot: BN;

  // vars
  const ZERO = BN.from("0")
  const TEN_ETHER = BN.from("10000000000000000000");
  const merkleRoot = "0xa3355b0ea435593f559c0e6e51a16e374bd801ce86911543fa6b09161ad0235c"
  const TOTAL_AIRDROP_AMOUNT = parseUnits("10000000", 18) // 10M SOLACE

  // vars to setup later
  let user: string
  let merkleProof: string[]
  let invalidMerkleProof: string[]
  let amount: BN
  let tx: ContractTransaction

  before(async function() {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", function () {
    it("deploys", async function () {
      merkleDistributor = (await deployContract(deployer, artifacts.MerkleDistributor, [solace.address, merkleRoot, governor.address])) as MerkleDistributor;
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

  describe("token", function() {
    it("starts with the correct token address", async function() {
      expect(await merkleDistributor.token()).to.equal(solace.address);
    });
  });

  describe("merkleRoot", function() {
    it("starts with the correct merkleRoot", async function() {
      expect(await merkleDistributor.merkleRoot()).to.equal(merkleRoot);
    });
  });

  describe("claim", function() {
    before(async () => {
      // user = "0x010efb04880aacf3121f6822b18034e15F3F10Be"
      user = "0x725087B23bAB9796Fc8ec57911C413bfdd8B65c1"

      merkleProof = 
      ["0x49c53860ba715801200baa5be1730ed47f38dd5445eff6d9979552e104921efe","0x454a584d8e07f73dcebf55ecc45200a63ee438496e040e02727a924a58c23638","0x76ebe3d4ad75076c56ff37981ccf8f553ab43a07a7571fab343f780252b5ed03","0x94dac03d37aa2f75979c5226f00d59a48ac423784a62ffe0c9c556184cfc6363","0x44780d2553d5f6185a140b2878fb2ffc0988c92ddd2a7b4b880ea4d6f774872e","0x001d7124307016a08c37688604c6413a16625a3b4c0ca6183b8b3b8ee439dfa2","0x3b06eeef9272f30bc125684585da5680e9d792458e5f940e776818f5471aef2a","0x8a23b7cc2b7aa220912a4e2e760135ca85aeaf8398e405d7aaba49dc5d600ff4","0xd2435ed88aa123e48d4727f8ae3e5150843b34ca26fb7c6a162bce17c2c16457","0xb7b00b2962586d3f625b8f31adeb8260d594cf2b59429d54e905c69366f25552"]

      // merkleProof = [
      //   "0xc238951c433954f175a5d00c10d84a972bd182f9ac7c180f32f42fd4b4d43bf3",
      //   "0xc46854fb6780ce31d965b96ecd0dab17f8ac637b66ddd6a1d69d4ceaa35975c4",
      //   "0xd36525631174b0a4885377704d9420b6f190a297bfdaaafb29568672bed570f2",
      //   "0xe82ef4aecf940e7be8171ba16a6dfb22724ac150ba887f0fbcaf05a14bc6d058",
      //   "0x130aea82795b60e859c20aaa8b6ec8d557a530df15ade20e4df5cabeb12c46ac",
      //   "0x001d7124307016a08c37688604c6413a16625a3b4c0ca6183b8b3b8ee439dfa2",
      //   "0x3b06eeef9272f30bc125684585da5680e9d792458e5f940e776818f5471aef2a",
      //   "0x8a23b7cc2b7aa220912a4e2e760135ca85aeaf8398e405d7aaba49dc5d600ff4",
      //   "0xd2435ed88aa123e48d4727f8ae3e5150843b34ca26fb7c6a162bce17c2c16457",
      //   "0xb7b00b2962586d3f625b8f31adeb8260d594cf2b59429d54e905c69366f25552"
      // ]

      amount = BN.from("1213570000000000000000")
      // amount = BN.from("1181910000000000000000")
    });

    it("throws on invalid claim", async function() {
      invalidMerkleProof = [
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
      
      await expect(merkleDistributor.connect(greedy_anon).claim(greedy_anon.address, TOTAL_AIRDROP_AMOUNT, invalidMerkleProof)).to.be.revertedWith("NotInMerkle");
    });

    it("successfully claims", async function() {      
      // Test that anyone can call airdrop claim on behalf of airdrop recipient
      // However the airdrop recipient will receive the airdrop, and NOT the claim() caller
      tx = await merkleDistributor.connect(greedy_anon).claim(user, amount, merkleProof);
      expect(await solace.balanceOf(user)).eq(amount)
      expect(await solace.balanceOf(greedy_anon.address)).eq(ZERO)
      await expect(tx).to.emit(merkleDistributor, "Claimed").withArgs(user, amount);
    });

    it("cannot claim again", async function () {
      await expect(merkleDistributor.connect(greedy_anon).claim(user, amount, merkleProof)).to.be.revertedWith("AlreadyClaimed")
    })
  });

  describe("hasClaimed", function() {
    it("returns true for user who has already claimed", async function() {
      expect(await merkleDistributor.hasClaimed(user)).to.equal(true);
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
