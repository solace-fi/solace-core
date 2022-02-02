import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Wallet, BigNumber as BN, constants, utils } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";

import { MockErc721, MockErc1271 } from "./../../typechain";
import { getPermitErc721EnhancedSignature, getPermitErc721EnhancedDigest, getDomainSeparator, assembleRSV } from "./../utilities/getPermitNFTSignature";
import { expectDeployed } from "../utilities/expectDeployed";

describe("ERC721Enhanced", function() {
  let artifacts: ArtifactImports;
  const [deployer, user1, user2, user3] = provider.getWallets();

  // contracts
  let token: MockErc721;
  let token2: MockErc721;
  let signerContract: MockErc1271;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const chainId = 31337;
  const deadline = constants.MaxUint256;
  const name = "My Mock Token";
  const symbol = "MMT";
  const PERMIT_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("Permit(address spender,uint256 tokenID,uint256 nonce,uint256 deadline)"));
  let DOMAIN_SEPARATOR: string;

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    signerContract = (await deployContract(deployer, artifacts.MockERC1271)) as MockErc1271;
  });

  describe("deployment", async function () {
    before(async function () {
      token = (await deployContract(deployer, artifacts.MockERC721, [name, symbol])) as MockErc721;
      await expectDeployed(token.address);
    });
    it("has a correct name", async function() {
      expect(await token.name()).to.equal(name);
    });
    it("has a correct symbol", async function() {
      expect(await token.symbol()).to.equal(symbol);
    });
    it("should start with zero supply", async function () {
      expect(await token.totalSupply()).to.equal(0);
      expect(await token.tokenCount()).eq(0);
      expect(await token.exists(0)).to.be.false;
      expect(await token.exists(1)).to.be.false;
    });
    it("should start with zero balance", async function () {
      expect(await token.balanceOf(user1.address)).to.equal(0);
    });
  });

  describe("mint", function () {
    it("should mint token", async function () {
      await token.mint(user1.address);
    });
    it("should increment supply", async function () {
      expect(await token.totalSupply()).to.equal(1);
      expect(await token.tokenCount()).eq(1);
    });
    it("should increment balance", async function () {
      expect(await token.balanceOf(user1.address)).to.equal(1);
    });
    it("should exist", async function () {
      expect(await token.exists(1)).to.be.true;
    });
    it("should mint another token", async function () {
      await token.mint(user1.address);
    });
    it("should increment supply", async function () {
      expect(await token.totalSupply()).to.equal(2);
      expect(await token.tokenCount()).eq(2);
    });
    it("should increment balance", async function () {
      expect(await token.balanceOf(user1.address)).to.equal(2);
    });
  });

  describe("transfer", async function () {
    let tokenID = 2;
    it("should reject transfer of nonexistent token", async function () {
      await expect(token.connect(user1).transfer(user2.address, 99)).to.be.revertedWith("ERC721: operator query for nonexistent token");
    });
    it("should reject transfer by non owner", async function () {
      await expect(token.connect(user2).transfer(user2.address, tokenID)).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });
    it("should transfer", async function () {
      let bal11 = await token.balanceOf(user1.address);
      let bal12 = await token.balanceOf(user2.address);
      let ts1 = await token.totalSupply();
      expect(await token.ownerOf(tokenID)).to.equal(user1.address);
      let tx = await token.connect(user1).transfer(user2.address, tokenID);
      await expect(tx).to.emit(token, "Transfer").withArgs(user1.address, user2.address, tokenID);
      let bal21 = await token.balanceOf(user1.address);
      let bal22 = await token.balanceOf(user2.address);
      let ts2 = await token.totalSupply();
      expect(await token.ownerOf(tokenID)).to.equal(user2.address);
      expect(bal11.sub(bal21)).to.equal(1);
      expect(bal22.sub(bal12)).to.equal(1);
      expect(ts1).to.equal(ts2);
    });
    it("should reject safeTransfer of nonexistent token", async function () {
      await expect(token.connect(user2).safeTransfer(user1.address, 99)).to.be.revertedWith("ERC721: operator query for nonexistent token");
    });
    it("should reject safeTransfer by non owner", async function () {
      await expect(token.connect(user1).safeTransfer(user1.address, tokenID)).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });
    it("should safeTransfer", async function () {
      tokenID = 1;
      let bal11 = await token.balanceOf(user1.address);
      let bal12 = await token.balanceOf(user2.address);
      let ts1 = await token.totalSupply();
      expect(await token.ownerOf(tokenID)).to.equal(user1.address);
      let tx = await token.connect(user1).safeTransfer(user2.address, tokenID);
      await expect(tx).to.emit(token, "Transfer").withArgs(user1.address, user2.address, tokenID);
      let bal21 = await token.balanceOf(user1.address);
      let bal22 = await token.balanceOf(user2.address);
      let ts2 = await token.totalSupply();
      expect(await token.ownerOf(tokenID)).to.equal(user2.address);
      expect(bal11.sub(bal21)).to.equal(1);
      expect(bal22.sub(bal12)).to.equal(1);
      expect(ts1).to.equal(ts2);
    });
    it("should clear approvals", async function () {
      tokenID = 1;
      await token.connect(user2).approve(user1.address, tokenID);
      expect(await token.getApproved(tokenID)).to.equal(user1.address);
      let bal11 = await token.balanceOf(user1.address);
      let bal12 = await token.balanceOf(user2.address);
      let ts1 = await token.totalSupply();
      expect(await token.ownerOf(tokenID)).to.equal(user2.address);
      let tx = await token.connect(user2).safeTransfer(user1.address, tokenID);
      await expect(tx).to.emit(token, "Transfer").withArgs(user2.address, user1.address, tokenID);
      let bal21 = await token.balanceOf(user1.address);
      let bal22 = await token.balanceOf(user2.address);
      let ts2 = await token.totalSupply();
      expect(await token.ownerOf(tokenID)).to.equal(user1.address);
      expect(bal21.sub(bal11)).to.equal(1);
      expect(bal12.sub(bal22)).to.equal(1);
      expect(ts1).to.equal(ts2);
      expect(await token.getApproved(tokenID)).to.equal(ZERO_ADDRESS);
    });
  });

  describe("permit", function () {
    let tokenID = 1;
    before(async function () {
      await token.mint(user1.address); // tokenID 3
    });
    it("has a permit typehash", async function () {
      // constant across deployments
      let typehash = await token.PERMIT_TYPEHASH();
      expect(typehash).to.eq("0x137406564cdcf9b40b1700502a9241e87476728da7ae3d0edfcf0541e5b49b3e");
      expect(typehash).to.eq(PERMIT_TYPEHASH);
      expect(typehash.length).to.eq(66); // bytes32
    });
    it("has a domain seperator", async function () {
      // changes across deployments
      let seperator = await token.DOMAIN_SEPARATOR();
      DOMAIN_SEPARATOR = getDomainSeparator(name, token.address, chainId);
      expect(seperator).to.eq(DOMAIN_SEPARATOR);
      expect(seperator.length).to.eq(66); // bytes32
    });
    it("has a nonce", async function () {
      expect(await token.nonces(tokenID)).to.equal(0);
    });
    it("cannot permit non existant token", async function () {
      const { v, r, s } = await getPermitErc721EnhancedSignature(user1, token, user2.address, 999);
      await expect(token.permit(user2.address, 999, deadline, v, r, s)).to.be.revertedWith("query for nonexistent token");
    });
    it("cannot permit past deadline", async function () {
      // get current timestamp
      await provider.send("evm_mine", []);
      let timestamp = (await provider.getBlock("latest")).timestamp;
      // next block timestamp = prev block timestamp + 1
      const { v, r, s } = await getPermitErc721EnhancedSignature(user1, token, user2.address, tokenID, timestamp);
      await expect(token.permit(user2.address, tokenID, timestamp, v, r, s)).to.be.revertedWith("permit expired");
    });
    it("cannot permit to self", async function () {
      const { v, r, s } = await getPermitErc721EnhancedSignature(user1, token, user1.address, tokenID);
      await expect(token.permit(user1.address, tokenID, deadline, v, r, s)).to.be.revertedWith("cannot permit to self");
    });
    it("cannot permit not your token", async function () {
      let tokenID2 = 2;
      const { v, r, s } = await getPermitErc721EnhancedSignature(user1, token, user3.address, tokenID2);
      await expect(token.permit(user3.address, tokenID2, deadline, v, r, s)).to.be.revertedWith("unauthorized");
    });
    it("cannot use signature for another contract", async function () {
      token2 = (await deployContract(deployer, artifacts.MockERC721, ["", ""])) as MockErc721;
      await token2.mint(user1.address);
      const { v, r, s } = await getPermitErc721EnhancedSignature(user1, token2, user2.address, tokenID);
      await expect(token.permit(user2.address, tokenID, deadline, v, r, s)).to.be.revertedWith("unauthorized");
    });
    it("should reject forged signatures", async function () {
      await expect(token.permit(user2.address, tokenID, deadline, 27, "0x1234567890123456789012345678901234567890123456789012345678901234", "0x1234567890123456789012345678901234567890123456789012345678901234")).to.be.revertedWith("invalid signature");
    });
    it("should reject modified parameters", async function () {
      const { v, r, s } = await getPermitErc721EnhancedSignature(user1, token, user2.address, tokenID, deadline);
      await expect(token.permit(user3.address, tokenID, deadline, v, r, s)).to.be.revertedWith("unauthorized");
      await expect(token.permit(user2.address, 3, deadline, v, r, s)).to.be.revertedWith("unauthorized");
      await expect(token.permit(user2.address, tokenID, deadline.sub(1), v, r, s)).to.be.revertedWith("unauthorized");
    });
    it("should permit EOA signatures", async function () {
      // permit
      const { v, r, s } = await getPermitErc721EnhancedSignature(user1, token, user2.address, tokenID);
      let tx = await token.permit(user2.address, tokenID, deadline, v, r, s);
      await expect(tx).to.emit(token, "Approval").withArgs(user1.address, user2.address, tokenID);
      // effects
      expect(await token.getApproved(tokenID)).to.equal(user2.address);
      await token.connect(user2).transferFrom(user1.address, user2.address, tokenID);
      expect(await token.ownerOf(tokenID)).to.equal(user2.address);
      expect(await token.nonces(tokenID)).to.equal(1);
    });
    it("should revert nonce too low", async function () {
      const { v, r, s } = await getPermitErc721EnhancedSignature(user2, token, user3.address, tokenID, deadline, 0);
      await expect(token.permit(user3.address, tokenID, deadline, v, r, s)).to.be.revertedWith("unauthorized");
    });
    it("should revert nonce too high", async function () {
      const { v, r, s } = await getPermitErc721EnhancedSignature(user2, token, user3.address, tokenID, deadline, 2);
      await expect(token.permit(user3.address, tokenID, deadline, v, r, s)).to.be.revertedWith("unauthorized");
    });
    it("should increment nonce", async function () {
      // permit
      const { v, r, s } = await getPermitErc721EnhancedSignature(user2, token, user3.address, tokenID, deadline, 1);
      let tx = await token.permit(user3.address, tokenID, deadline, v, r, s);
      await expect(tx).to.emit(token, "Approval").withArgs(user2.address, user3.address, tokenID);
      // effects
      expect(await token.getApproved(tokenID)).to.equal(user3.address);
      await token.connect(user3).transferFrom(user2.address, user3.address, tokenID);
      expect(await token.ownerOf(tokenID)).to.equal(user3.address);
      expect(await token.nonces(tokenID)).to.equal(2);
    });
    it("should reject erc1271 invalid signatures", async function () {
      let tokenID4 = 4;
      await token.mint(signerContract.address);
      const { v, r, s } = await getPermitErc721EnhancedSignature(user1, token, user3.address, tokenID4);
      await expect(token.permit(user3.address, tokenID4, deadline, v, r, s)).to.be.revertedWith("unauthorized");
    });
    it("should support erc1271 valid signatures", async function () {
      // permit
      let tokenID4 = 4;
      let digest = getPermitErc721EnhancedDigest(name, token.address, chainId, tokenID4, user3.address, 0, deadline, PERMIT_TYPEHASH);
      const { v, r, s } = await getPermitErc721EnhancedSignature(user1, token, user3.address, tokenID4);
      const signature = assembleRSV(r, s, v);
      await signerContract.setSignature(digest, signature, true);
      let tx = await token.permit(user3.address, tokenID4, deadline, v, r, s);
      await expect(tx).to.emit(token, "Approval").withArgs(signerContract.address, user3.address, tokenID4);
      // effects
      expect(await token.getApproved(tokenID4)).to.equal(user3.address);
      await token.connect(user3).transferFrom(signerContract.address, user3.address, tokenID4);
      expect(await token.ownerOf(tokenID4)).to.equal(user3.address);
      expect(await token.nonces(tokenID4)).to.equal(1);
    });
  });

  describe("token must exist", function () {
    it("cannot do things to non tokens", async function () {
      await expect(token.doThing1(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("can do things to tokens", async function () {
      await token.doThing1(1);
    });
  });

  describe("only owner", function () {
    let tokenID: BN;
    before("mint", async function () {
      await token.mint(user1.address);
      tokenID = await token.tokenCount();
    });
    it("cannot do things to not your token", async function () {
      await expect(token.connect(user2).doThing2(tokenID)).to.be.revertedWith("only owner");
    });
    it("can do things to your token", async function () {
      await token.connect(user1).doThing2(tokenID);
    });
  });

  describe("only owner or approved", function () {
    let tokenID: BN;
    before("mint", async function () {
      await token.mint(user1.address);
      tokenID = await token.tokenCount();
    });
    it("cannot do things to not your token", async function () {
      await expect(token.connect(user2).doThing3(tokenID)).to.be.revertedWith("only owner or approved");
    });
    it("can do things to your token", async function () {
      await token.connect(user1).doThing3(tokenID);
    });
    it("can do things to token if approved for one", async function () {
      await token.connect(user1).approve(user2.address, tokenID);
      await token.connect(user2).doThing3(tokenID);
    });
    it("can do things to token if approved for all", async function () {
      await token.connect(user1).setApprovalForAll(user3.address, true);
      await token.connect(user3).doThing3(tokenID);
    });
  });

  describe("uri", function () {
    it("cannot get the uri of non existant token", async function () {
      await expect(token.tokenURI(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("starts simple", async function () {
      expect(await token.baseURI()).eq("");
      expect(await token.getBaseURI()).eq("");
      expect(await token.tokenURI(4)).eq("4");
    });
    it("governor can set base uri", async function () {
      let base = "https://solace.fi/tokens?tokenID=";
      let tx = await token.setBaseURI(base);
      await expect(tx).to.emit(token, "BaseURISet").withArgs(base);
      expect(await token.baseURI()).eq(base);
      expect(await token.getBaseURI()).eq(base);
      expect(await token.tokenURI(4)).eq(base+"4");
    });
  });

  describe("listTokensOfOwner", function () {
    it("reverts zero address lookup", async function () {
      await expect(token.listTokensOfOwner(ZERO_ADDRESS)).to.be.revertedWith("zero address owner");
    });
  });

  describe("_afterTokenTransfer", function () {
    let tokenID: BN;
    it("hears mint", async function () {
      await token.mint(user1.address);
      tokenID = await token.tokenCount();
      let afterTransfer = await token.lastTransfer();
      expect(afterTransfer.from).eq(ZERO_ADDRESS);
      expect(afterTransfer.to).eq(user1.address);
      expect(afterTransfer.tokenID).eq(tokenID);
    });
    it("hears transfer", async function () {
      await token.connect(user1).transfer(user2.address, tokenID);
      let afterTransfer = await token.lastTransfer();
      expect(afterTransfer.from).eq(user1.address);
      expect(afterTransfer.to).eq(user2.address);
      expect(afterTransfer.tokenID).eq(tokenID);
    });
    it("hears burn", async function () {
      await token.connect(user2).burn(tokenID);
      let afterTransfer = await token.lastTransfer();
      expect(afterTransfer.from).eq(user2.address);
      expect(afterTransfer.to).eq(ZERO_ADDRESS);
      expect(afterTransfer.tokenID).eq(tokenID);
    });
  });
});
