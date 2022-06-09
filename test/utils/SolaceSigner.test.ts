import { ethers, waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN , utils, constants } from "ethers";
import { assembleSignature, getPriceDataDigest, getPremiumDataDigest, sign } from "../utilities/signature";

import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { SolaceSigner} from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

const DOMAIN_NAME = "Solace.fi-SolaceSigner";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const TYPEHASH_PRICE = utils.keccak256(utils.toUtf8Bytes("PriceData(address token,uint256 price,uint256 deadline)"));
const TYPEHASH_PREMIUM = utils.keccak256(utils.toUtf8Bytes("PremiumData(uint256 premium,address policyholder,uint256 deadline)"));
const INVALID_TYPEHASH_PREMIUM = utils.keccak256(utils.toUtf8Bytes("Invalid(uint256 premium,address policyholder,uint256 deadline)"));
const INVALID_TYPEHASH_PRICE = utils.keccak256(utils.toUtf8Bytes("Invalid(address token,uint256 price,uint256 deadline)"));
const TOKEN_PRICE1 = BN.from("20000000000000000") // 0.02$
const PREMIUM_AMOUNT1 = BN.from("10000000000000000000") // 10$
const ZERO_TOKEN_PRICE = BN.from(0);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
let CHAIN_ID = 31337;
let DEADLINE = constants.MaxInt256;

describe("SolaceSigner", function() {
  let artifacts: ArtifactImports;
  let snapshot: BN;
  const [deployer, governor, user, signer1, signer2, signer3, token, policyholder] = provider.getWallets();

  // contracts
  let solaceSigner: SolaceSigner;

  before(async function () {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    CHAIN_ID = (await provider.getNetwork()).chainId;

    // deploy solace signer
    solaceSigner = (await deployContract(deployer, artifacts.SolaceSigner, [governor.address])) as SolaceSigner;
    await expectDeployed(solaceSigner.address);

  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await solaceSigner.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function() {
      await expect(solaceSigner.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function() {
      let tx = await solaceSigner.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(solaceSigner, "GovernancePending").withArgs(deployer.address);
      expect(await solaceSigner.governance()).to.equal(governor.address);
      expect(await solaceSigner.pendingGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async function() {
      await expect(solaceSigner.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async function() {
      let tx = await solaceSigner.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(solaceSigner, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await solaceSigner.governance()).to.equal(deployer.address);
      expect(await solaceSigner.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await solaceSigner.connect(deployer).setPendingGovernance(governor.address);
      await solaceSigner.connect(governor).acceptGovernance();
    });
  });

  describe("addSigner", function () {
    it("starts with no signer", async function() {
      expect(await solaceSigner.connect(user).isSigner(signer1.address)).to.false;
      expect(await solaceSigner.connect(user).isSigner(signer2.address)).to.false;
      expect(await solaceSigner.connect(user).isSigner(signer3.address)).to.false;
    });

    it("non-governor can't add signer", async function () {
      await expect(solaceSigner.connect(user).addSigner(signer1.address)).to.revertedWith("!governance");
    });

    it("can't add zero address signer", async function () {
      await expect(solaceSigner.connect(governor).addSigner(ZERO_ADDRESS)).to.revertedWith("zero address signer");
    });

    it("governance can add signer", async function () {
      let tx = await solaceSigner.connect(governor).addSigner(signer1.address);
      await expect(tx).emit(solaceSigner, "SignerAdded").withArgs(signer1.address);
    });

    it("can add more signers", async function () {
      let tx = await solaceSigner.connect(governor).addSigner(signer2.address);
      await expect(tx).emit(solaceSigner, "SignerAdded").withArgs(signer2.address);

      tx = await solaceSigner.connect(governor).addSigner(signer3.address);
      await expect(tx).emit(solaceSigner, "SignerAdded").withArgs(signer3.address);
      expect(await solaceSigner.connect(user).isSigner(signer1.address)).to.true;
      expect(await solaceSigner.connect(user).isSigner(signer2.address)).to.true;
      expect(await solaceSigner.connect(user).isSigner(signer3.address)).to.true;
    });

    it("can read correct values", async function() {
      expect(await solaceSigner.connect(user).numSigners()).eq(3);
      expect(await solaceSigner.connect(user).getSigner(0)).eq(signer1.address);
      expect(await solaceSigner.connect(user).getSigner(1)).eq(signer2.address);
      expect(await solaceSigner.connect(user).getSigner(2)).eq(signer3.address);
    });
  });

  describe("removeSigner", async function () {
    before(async function () {
      expect(await solaceSigner.connect(user).isSigner(signer1.address)).to.true;
      expect(await solaceSigner.connect(user).isSigner(signer2.address)).to.true;
      expect(await solaceSigner.connect(user).isSigner(signer3.address)).to.true;
    });

    it("non-governor can't remove signer", async function() {
      await expect(solaceSigner.connect(user).removeSigner(signer3.address)).revertedWith("!governance");
    });

    it("governor can remove signer", async function () {
      let tx = await solaceSigner.connect(governor).removeSigner(signer3.address);
      await expect(tx).emit(solaceSigner, "SignerRemoved").withArgs(signer3.address);
      expect(await solaceSigner.connect(user).isSigner(signer3.address)).to.false;
    });

    it("can remove again", async function () {
      let tx = await solaceSigner.connect(governor).removeSigner(signer3.address);
      await expect(tx).emit(solaceSigner, "SignerRemoved").withArgs(signer3.address);
      expect(await solaceSigner.connect(user).isSigner(signer3.address)).to.false;
      expect(await solaceSigner.connect(user).numSigners()).eq(2);
    });
  });

  describe("verifyPrice", async function () {
    let digest: string;
    let invalidDigest1;
    let invalidDigest2;
    let signature1: string;
    let signature2: string;
    let invalidSignature1: string;
    let invalidSignature2: string;
    let invalidSignature3: string;

    before(async function() {
      expect(await solaceSigner.connect(user).isSigner(signer1.address)).to.true;
      expect(await solaceSigner.connect(user).isSigner(signer2.address)).to.true;
      expect(await solaceSigner.connect(user).isSigner(signer3.address)).to.false;

      digest = getPriceDataDigest(DOMAIN_NAME, solaceSigner.address, CHAIN_ID, token.address, TOKEN_PRICE1, DEADLINE, TYPEHASH_PRICE);
      signature1 = assembleSignature(sign(digest, Buffer.from(signer1.privateKey.slice(2), "hex")));
      signature2 = assembleSignature(sign(digest, Buffer.from(signer2.privateKey.slice(2), "hex")));
      invalidSignature1 = assembleSignature(sign(digest, Buffer.from(signer3.privateKey.slice(2), "hex")));

      // invalid digests
      invalidDigest1 = getPriceDataDigest(INVALID_DOMAIN, solaceSigner.address, CHAIN_ID, token.address, TOKEN_PRICE1, DEADLINE, TYPEHASH_PRICE);
      invalidDigest2 = getPriceDataDigest(DOMAIN_NAME, solaceSigner.address, CHAIN_ID, token.address, TOKEN_PRICE1, DEADLINE, INVALID_TYPEHASH_PRICE);
      invalidSignature2 = assembleSignature(sign(invalidDigest1, Buffer.from(signer1.privateKey.slice(2), "hex")));
      invalidSignature3 = assembleSignature(sign(invalidDigest2, Buffer.from(signer1.privateKey.slice(2), "hex")));
    });

    it("can't verify zero address token", async function () {
      await expect(solaceSigner.connect(user).verifyPrice(ZERO_ADDRESS, TOKEN_PRICE1, DEADLINE, signature1)).revertedWith("zero address token");
    });

    it("can't verify zero value", async function () {
      await expect(solaceSigner.connect(user).verifyPrice(token.address, ZERO_TOKEN_PRICE, DEADLINE, signature1)).revertedWith("zero price");
    });

    it("can't verify if deadline passed", async function () {
      await expect(solaceSigner.connect(user).verifyPrice(token.address, TOKEN_PRICE1, 0, signature1)).revertedWith("expired deadline");
    });

    it("can't verify for invalid signer", async function () {
       expect(await solaceSigner.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, invalidSignature1)).to.false;
    });

    it("can't verify for invalid domain", async function () {
      expect(await solaceSigner.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, invalidSignature2)).to.false;
    });

    it("can't verify for invalid typehash", async function () {
      expect(await solaceSigner.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, invalidSignature3)).to.false;
    });

    it("can verify", async function () {
      expect(await solaceSigner.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, signature1)).to.true;
    });

    it("can verify another", async function () {
      expect(await solaceSigner.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, signature2)).to.true;
    });
  });

  describe("verifyPremium", async function () {
    let digest: string;
    let invalidDigest1;
    let invalidDigest2;
    let signature1: string;
    let signature2: string;
    let invalidSignature1: string;
    let invalidSignature2: string;
    let invalidSignature3: string;

    before(async function() {
      expect(await solaceSigner.connect(user).isSigner(signer1.address)).to.true;
      expect(await solaceSigner.connect(user).isSigner(signer2.address)).to.true;
      expect(await solaceSigner.connect(user).isSigner(signer3.address)).to.false;

      digest = getPremiumDataDigest(DOMAIN_NAME, solaceSigner.address, CHAIN_ID, PREMIUM_AMOUNT1, policyholder.address, DEADLINE, TYPEHASH_PREMIUM);
      signature1 = assembleSignature(sign(digest, Buffer.from(signer1.privateKey.slice(2), "hex")));
      signature2 = assembleSignature(sign(digest, Buffer.from(signer2.privateKey.slice(2), "hex")));
      invalidSignature1 = assembleSignature(sign(digest, Buffer.from(signer3.privateKey.slice(2), "hex")));

      // invalid digests
      invalidDigest1 = getPremiumDataDigest(INVALID_DOMAIN, solaceSigner.address, CHAIN_ID, PREMIUM_AMOUNT1, policyholder.address, DEADLINE, TYPEHASH_PREMIUM);
      invalidDigest2 = getPremiumDataDigest(DOMAIN_NAME,solaceSigner.address, CHAIN_ID,PREMIUM_AMOUNT1, policyholder.address,DEADLINE,INVALID_TYPEHASH_PREMIUM);

      invalidSignature2 = assembleSignature(sign(invalidDigest1, Buffer.from(signer1.privateKey.slice(2), "hex")));
      invalidSignature3 = assembleSignature(sign(invalidDigest2, Buffer.from(signer1.privateKey.slice(2), "hex")));
    });

    it("can't verify if deadline passed", async function () {
      await expect(solaceSigner.connect(user).verifyPremium(PREMIUM_AMOUNT1, policyholder.address, 0, signature1)).revertedWith("expired deadline");
    });

    it("can't verify for zero address policyholder", async function () {
      await expect(solaceSigner.connect(user).verifyPremium(PREMIUM_AMOUNT1, ZERO_ADDRESS, DEADLINE, signature1)).revertedWith("zero address policyholder");
    });

    it("can't verify for invalid signer", async function () {
       expect(await solaceSigner.connect(user).verifyPremium(PREMIUM_AMOUNT1, policyholder.address, DEADLINE, invalidSignature1)).to.false;
    });

    it("can't verify for invalid domain", async function () {
      expect(await solaceSigner.connect(user).verifyPremium(PREMIUM_AMOUNT1, policyholder.address, DEADLINE, invalidSignature2)).to.false;
    });

    it("can't verify for invalid typehash", async function () {
      expect(await solaceSigner.connect(user).verifyPremium(PREMIUM_AMOUNT1, policyholder.address, DEADLINE, invalidSignature3)).to.false;
    });

    it("can verify", async function () {
      expect(await solaceSigner.connect(user).verifyPremium(PREMIUM_AMOUNT1, policyholder.address, DEADLINE, signature1)).to.true;
    });

    it("can verify another", async function () {
      expect(await solaceSigner.connect(user).verifyPremium(PREMIUM_AMOUNT1, policyholder.address, DEADLINE, signature2)).to.true;
    });
  });

});
