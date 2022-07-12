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
  const merkleRoot = "0xa0e21b0d305e9aed051db3078ce4169f8a06bfef37164220a51ade06ce18ce3f"
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

  describe("claim 1", function() {
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

    it("successfully claims 1", async function() {      
      user = "0x8b29b22b67964074648A5639BB7e8E31D2493a29"

      merkleProof = 
      ["0x8e7862cf40f0f01ac31812f9ee82a237ea539b773c40bec67303998846bbc590","0x3e847cf59026f7f00ce5b5c98470f04aaaeec22781f6685792b1bad208eb1d11","0x100eb0e4fe6d27f442c3fc70c58aa12360342bd8704c17dbd376e29e582fc1f0","0x13b05fc361a92a4a795d8caaa016c01461cbae9bf74789fd0e24158d245af400","0xd69a6f82543b2ca71e9233b7f89b8ba1845f5de238311dd371cdd57a0e228b50","0x007849af804a1201739aafa3909c269937c49c7c6766e292175c531c6a5bc490","0x8de9048d658948c6776c09c9b00b3ce29f020ba29c52499967eec6e2e137c2b0","0x0b594c41b110c89e7d511d936a8bec00113c2b120b34aa8250cf21c4d126a297","0x4e71c1998bc2d97e4f93b9da4b4910dbaed2c4a6eae66f8a2a9e378b4877e91b","0x6f0c012ca2ff066eba0743ed917e6894c04a39488881076a65d7b3ac47bac27e"]

      amount = BN.from("543630000000000000000")

      // Test that anyone can call airdrop claim on behalf of airdrop recipient
      // However the airdrop recipient will receive the airdrop, and NOT the claim() caller
      tx = await merkleDistributor.connect(greedy_anon).claim(user, amount, merkleProof);
      expect(await solace.balanceOf(user)).eq(amount)
      expect(await solace.balanceOf(greedy_anon.address)).eq(ZERO)
      await expect(tx).to.emit(merkleDistributor, "Claimed").withArgs(user, amount);
    });

    it("successfully claims 2", async function() {      
      user = "0x6924797FcC5B505cc1C3E2A6FB8ca21f9f0f8816"

      merkleProof = 
      ["0x73c685ea611c5306824dbfaef821e3d6ed323fc9753f2afa2a131ea75eb8e6f6","0x266718bfd215263d51bb036114728bbd0024119ec0d56ef9ada0e8af44b430f1","0x6ccbdb7dc37a5842e5823bb73913ce7acb0e9eba31a0dce57c4a59ede875ffaa","0x0cbd495394ab5781b0b39f3b0c33c87ffcac2151e8a5187918817a65ab86e938","0xd69a6f82543b2ca71e9233b7f89b8ba1845f5de238311dd371cdd57a0e228b50","0x007849af804a1201739aafa3909c269937c49c7c6766e292175c531c6a5bc490","0x8de9048d658948c6776c09c9b00b3ce29f020ba29c52499967eec6e2e137c2b0","0x0b594c41b110c89e7d511d936a8bec00113c2b120b34aa8250cf21c4d126a297","0x4e71c1998bc2d97e4f93b9da4b4910dbaed2c4a6eae66f8a2a9e378b4877e91b","0x6f0c012ca2ff066eba0743ed917e6894c04a39488881076a65d7b3ac47bac27e"]

      amount = BN.from("555770000000000000000")

      // Test that anyone can call airdrop claim on behalf of airdrop recipient
      // However the airdrop recipient will receive the airdrop, and NOT the claim() caller
      tx = await merkleDistributor.connect(greedy_anon).claim(user, amount, merkleProof);
      expect(await solace.balanceOf(user)).eq(amount)
      expect(await solace.balanceOf(greedy_anon.address)).eq(ZERO)
      await expect(tx).to.emit(merkleDistributor, "Claimed").withArgs(user, amount);
    });

    it("successfully claims 3", async function() {      
      user = "0x1770008fA8920411D9502103528A04A911B3dE22"

      merkleProof = 
      ["0x6c05d8ac5932b1f31558ffa8da37d2c73a14b08dcf2c0591811b9a8fbf6e9e57","0xe88c2387d44d6e2817b62ac9ba6a2c50b600d92c862974561ae6fff5790296ec","0x4af01ea661e3d60393475e78e7e5260bde6eef4d7a0fc0eb91708e16237de401","0xc3359f899aa0c8b03f0b9e94506d0a36328b3e2093184bce2020cffb4a7eadda","0xe617b5b875d691cadae14d7c0d3faf554ea68a4154b41ce9d87bae95a65341ea","0xfcd86764a621574ee0d5d671aa783a667943631f54f7ec5c63607610bace0de0","0x1cfd80c0b9253e38dae6b60cdad79434670c8806d6ba5830772bc6b96aa9c744","0x28dab22c07a577d9908929cfe6d649d5928a5b19fd68d444fdcdac67576ba89a","0x4e71c1998bc2d97e4f93b9da4b4910dbaed2c4a6eae66f8a2a9e378b4877e91b","0x6f0c012ca2ff066eba0743ed917e6894c04a39488881076a65d7b3ac47bac27e"]

      amount = BN.from("1655590000000000000000")

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
