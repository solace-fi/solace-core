import { ethers, waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN , utils, constants } from "ethers";
import { assembleSignature, getPriceDataDigest, sign } from "../utilities/signature";

import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { PriceVerifier} from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";

const DOMAIN_NAME = "Solace.fi-PriceVerifier";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const TYPEHASH = utils.keccak256(utils.toUtf8Bytes("PriceData(address token,uint256 price,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("Invalid(address token,uint256 price,uint256 deadline)"));
const TOKEN_PRICE1 = BN.from("20000000000000000") // 0.02 USD
const ZERO_TOKEN_PRICE = BN.from(0);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
let CHAIN_ID = 31337;
let DEADLINE = constants.MaxInt256;

describe("PriceVerifier", function() {
  let artifacts: ArtifactImports;
  let snapshot: BN;
  const [deployer, governor, user, signer1, signer2, signer3, token] = provider.getWallets();

  // contracts
  let priceVerifier: PriceVerifier;

  before(async function () {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    CHAIN_ID = (await provider.getNetwork()).chainId;

    // deploy price verifier
    priceVerifier = (await deployContract(deployer, artifacts.PriceVerifier, [governor.address])) as PriceVerifier;
    await expectDeployed(priceVerifier.address);

  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await priceVerifier.governance()).to.equal(governor.address);
    });

    it("rejects setting new governance by non governor", async function() {
      await expect(priceVerifier.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });

    it("can set new governance", async function() {
      let tx = await priceVerifier.connect(governor).setPendingGovernance(deployer.address);
      await expect(tx).to.emit(priceVerifier, "GovernancePending").withArgs(deployer.address);
      expect(await priceVerifier.governance()).to.equal(governor.address);
      expect(await priceVerifier.pendingGovernance()).to.equal(deployer.address);
    });

    it("rejects governance transfer by non governor", async function() {
      await expect(priceVerifier.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });

    it("can transfer governance", async function() {
      let tx = await priceVerifier.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(priceVerifier, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await priceVerifier.governance()).to.equal(deployer.address);
      expect(await priceVerifier.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await priceVerifier.connect(deployer).setPendingGovernance(governor.address);
      await priceVerifier.connect(governor).acceptGovernance();
    });
  });

  describe("addPriceSigner", function () {
    it("starts with no signer", async function() {
      expect(await priceVerifier.connect(user).isPriceSigner(signer1.address)).to.false;
      expect(await priceVerifier.connect(user).isPriceSigner(signer2.address)).to.false;
      expect(await priceVerifier.connect(user).isPriceSigner(signer3.address)).to.false;
    });

    it("non-governor can't add signer", async function () {
      await expect(priceVerifier.connect(user).addPriceSigner(signer1.address)).to.revertedWith("!governance");
    });

    it("can't add zero address signer", async function () {
      await expect(priceVerifier.connect(governor).addPriceSigner(ZERO_ADDRESS)).to.revertedWith("zero address signer");
    });

    it("governance can add signer", async function () {
      let tx = await priceVerifier.connect(governor).addPriceSigner(signer1.address);
      await expect(tx).emit(priceVerifier, "PriceSignerAdded").withArgs(signer1.address);
    });

    it("can add more signers", async function () {
      let tx = await priceVerifier.connect(governor).addPriceSigner(signer2.address);
      await expect(tx).emit(priceVerifier, "PriceSignerAdded").withArgs(signer2.address);

      tx = await priceVerifier.connect(governor).addPriceSigner(signer3.address);
      await expect(tx).emit(priceVerifier, "PriceSignerAdded").withArgs(signer3.address);
      expect(await priceVerifier.connect(user).isPriceSigner(signer1.address)).to.true;
      expect(await priceVerifier.connect(user).isPriceSigner(signer2.address)).to.true;
      expect(await priceVerifier.connect(user).isPriceSigner(signer3.address)).to.true;
    });
  });

  describe("removePriceSigner", async function () {
    before(async function () {
      expect(await priceVerifier.connect(user).isPriceSigner(signer1.address)).to.true;
      expect(await priceVerifier.connect(user).isPriceSigner(signer2.address)).to.true;
      expect(await priceVerifier.connect(user).isPriceSigner(signer3.address)).to.true;
    });

    it("non-governor can't remove price signer", async function() {
      await expect(priceVerifier.connect(user).removePriceSigner(signer3.address)).revertedWith("!governance");
    });

    it("governor can remove price signer", async function () {
      let tx = await priceVerifier.connect(governor).removePriceSigner(signer3.address);
      await expect(tx).emit(priceVerifier, "PriceSignerRemoved").withArgs(signer3.address);
      expect(await priceVerifier.connect(user).isPriceSigner(signer3.address)).to.false;
    });

    it("can remove again", async function () {
      let tx = await priceVerifier.connect(governor).removePriceSigner(signer3.address);
      await expect(tx).emit(priceVerifier, "PriceSignerRemoved").withArgs(signer3.address);
      expect(await priceVerifier.connect(user).isPriceSigner(signer3.address)).to.false;
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
      expect(await priceVerifier.connect(user).isPriceSigner(signer1.address)).to.true;
      expect(await priceVerifier.connect(user).isPriceSigner(signer2.address)).to.true;
      expect(await priceVerifier.connect(user).isPriceSigner(signer3.address)).to.false;

      digest = getPriceDataDigest(DOMAIN_NAME, priceVerifier.address, CHAIN_ID, token.address, TOKEN_PRICE1, DEADLINE, TYPEHASH);
      signature1 = assembleSignature(sign(digest, Buffer.from(signer1.privateKey.slice(2), "hex")));
      signature2 = assembleSignature(sign(digest, Buffer.from(signer2.privateKey.slice(2), "hex")));
      invalidSignature1 = assembleSignature(sign(digest, Buffer.from(signer3.privateKey.slice(2), "hex")));

      // invalid digests
      invalidDigest1 = getPriceDataDigest(INVALID_DOMAIN, priceVerifier.address, CHAIN_ID, token.address, TOKEN_PRICE1, DEADLINE, TYPEHASH);
      invalidDigest2 = getPriceDataDigest(DOMAIN_NAME, priceVerifier.address, CHAIN_ID, token.address, TOKEN_PRICE1, DEADLINE, INVALID_TYPEHASH);
      invalidSignature2 = assembleSignature(sign(invalidDigest1, Buffer.from(signer1.privateKey.slice(2), "hex")));
      invalidSignature3 = assembleSignature(sign(invalidDigest2, Buffer.from(signer1.privateKey.slice(2), "hex")));
    });

    it("can't verify zero address token", async function () {
      await expect(priceVerifier.connect(user).verifyPrice(ZERO_ADDRESS, TOKEN_PRICE1, DEADLINE, signature1)).revertedWith("zero address token");
    });

    it("can't verify zero price value", async function () {
      await expect(priceVerifier.connect(user).verifyPrice(token.address, ZERO_TOKEN_PRICE, DEADLINE, signature1)).revertedWith("zero price");
    });

    it("can't verify if deadline passed", async function () {
      await expect(priceVerifier.connect(user).verifyPrice(token.address, TOKEN_PRICE1, 0, signature1)).revertedWith("expired deadline");
    });

    it("can't verify for invalid signer", async function () {
       expect(await priceVerifier.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, invalidSignature1)).to.false;
    });

    it("can't verify for invalid domain", async function () {
      expect(await priceVerifier.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, invalidSignature2)).to.false;
    });

    it("can't verify for invalid typehash", async function () {
      expect(await priceVerifier.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, invalidSignature3)).to.false;
    });

    it("can verify", async function () {
      expect(await priceVerifier.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, signature1)).to.true;
    });

    it("can verify another", async function () {
      expect(await priceVerifier.connect(user).verifyPrice(token.address, TOKEN_PRICE1, DEADLINE, signature2)).to.true;
    });
  });

});
