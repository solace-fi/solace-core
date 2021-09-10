import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Wallet, BigNumber as BN } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { burnBlocks, burnBlocksUntil } from "./utilities/time";
import { encodeAddresses } from "./utilities/positionDescription";

import { PolicyManager, MockProduct, Treasury, Registry, RiskManager, PolicyDescriptor, Vault } from "../typechain";

describe("PolicyManager", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, user2, walletProduct1, walletProduct2, walletProduct3, positionContract] = provider.getWallets();

  // contracts
  let policyManager: PolicyManager;
  let mockProduct: MockProduct;
  let treasury: Treasury;
  let vault: Vault;
  let registry: Registry;
  let riskManager: RiskManager;
  let policyDescriptor: PolicyDescriptor;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const name = "Solace Policy";
  const symbol = "SPT";
  const expirationBlock = 20000000;
  const coverAmount = BN.from("100000000000000"); // 10 Ether in wei
  const price = 11044; // price in wei for block/wei

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy policy manager
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;

    // deploy registry contract
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;

    // deploy treasury contract
    treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, ZERO_ADDRESS, registry.address])) as Treasury;

    // deploy vault contract
    vault = (await deployContract(deployer,artifacts.Vault,[governor.address,registry.address])) as Vault;

    // deploy risk manager contract
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;

    // deploy nft descriptor
    policyDescriptor = (await deployContract(deployer, artifacts.PolicyDescriptor)) as PolicyDescriptor;

    await registry.connect(governor).setTreasury(treasury.address);
    await registry.connect(governor).setVault(vault.address);
    await registry.connect(governor).setPolicyManager(policyManager.address);
    await registry.connect(governor).setRiskManager(riskManager.address);
    await deployer.sendTransaction({ to: treasury.address, value: BN.from("10000000000000000") });
    await vault.connect(governor).setRequestor(treasury.address, true);
  });

  it("has a correct name", async function() {
    expect(await policyManager.name()).to.equal(name);
  });

  it("has a correct symbol", async function() {
    expect(await policyManager.symbol()).to.equal(symbol);
  });

  it("has no policies", async function() {
    expect(await policyManager.totalPolicyCount()).to.equal(0);
  });

  it("has no nft token descriptor", async function() {
    expect(await policyManager.policyDescriptor()).to.equal(ZERO_ADDRESS);
  });

  describe("governance", function() {
    it("starts with the correct governor", async function() {
      expect(await policyManager.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function() {
      await expect(policyManager.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      await policyManager.connect(governor).setGovernance(deployer.address);
      expect(await policyManager.governance()).to.equal(governor.address);
      expect(await policyManager.newGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(policyManager.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    });
    it("can transfer governance", async function() {
      let tx = await policyManager.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(policyManager, "GovernanceTransferred")
        .withArgs(deployer.address);
      expect(await policyManager.governance()).to.equal(deployer.address);
      expect(await policyManager.newGovernance()).to.equal(ZERO_ADDRESS);

      await policyManager.connect(deployer).setGovernance(governor.address);
      await policyManager.connect(governor).acceptGovernance();
    });

    it("rejects setting new nft token descriptor by non governor", async function() {
      await expect(policyManager.connect(user).setPolicyDescriptor(policyDescriptor.address)).to.be.revertedWith("!governance");
    });
    it("can set new nft token descriptor", async function() {
      await policyManager.connect(governor).setPolicyDescriptor(policyDescriptor.address);
      expect(await policyManager.connect(governor).policyDescriptor()).to.equal(policyDescriptor.address);
    });
  });

  describe("products", function() {
    it("starts with no products", async function() {
      expect(await policyManager.numProducts()).to.equal(0);
    });
    it("can add products", async function() {
      let tx1 = await policyManager.connect(governor).addProduct(walletProduct1.address);
      expect(await policyManager.numProducts()).to.equal(1);
      await expect(tx1)
        .to.emit(policyManager, "ProductAdded")
        .withArgs(walletProduct1.address);
      let tx2 = await policyManager.connect(governor).addProduct(walletProduct2.address);
      expect(await policyManager.numProducts()).to.equal(2);
      await expect(tx2)
        .to.emit(policyManager, "ProductAdded")
        .withArgs(walletProduct2.address);
    });
    it("returns products", async function() {
      expect(await policyManager.numProducts()).to.equal(2);
      expect(await policyManager.getProduct(0)).to.equal(walletProduct1.address);
      expect(await policyManager.getProduct(1)).to.equal(walletProduct2.address);
      expect(await policyManager.productIsActive(walletProduct1.address)).to.equal(true);
      expect(await policyManager.productIsActive(walletProduct2.address)).to.equal(true);
      expect(await policyManager.productIsActive(walletProduct3.address)).to.equal(false);
    });
    it("rejects adds and removes by non governor", async function() {
      await expect(policyManager.connect(user).addProduct(walletProduct3.address)).to.be.revertedWith("!governance");
      await expect(policyManager.connect(user).removeProduct(walletProduct1.address)).to.be.revertedWith("!governance");
    });
    it("can remove products", async function() {
      let tx1 = await policyManager.connect(governor).removeProduct(walletProduct1.address);
      expect(await policyManager.numProducts()).to.equal(1);
      expect(await policyManager.productIsActive(walletProduct1.address)).to.equal(false);
      await expect(tx1)
        .to.emit(policyManager, "ProductRemoved")
        .withArgs(walletProduct1.address);
      expect(await policyManager.getProduct(0)).to.equal(walletProduct2.address);
    });
  });

  describe("policies", function() {
    let positionDescription = encodeAddresses([positionContract.address]);
    it("non product cannot create policy", async function() {
      await expect(policyManager.connect(user).createPolicy(user.address, coverAmount, expirationBlock, price, positionContract.address)).to.be.revertedWith("product inactive");
    });
    it("can create policy", async function() {
      let tx = await policyManager.connect(walletProduct2).createPolicy(user.address, coverAmount, expirationBlock, price, positionDescription);
      expect(tx).to.emit(policyManager, "PolicyCreated").withArgs(1);
      expect(await policyManager.activeCoverAmount()).to.equal(coverAmount);
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount);
    });
    it("can get policy info", async function() {
      // policyInfo()
      let policyInfo1 = await policyManager.policyInfo(1);
      expect(policyInfo1.product).to.equal(walletProduct2.address);
      expect(policyInfo1.positionDescription).to.equal(positionDescription);
      expect(policyInfo1.coverAmount).to.equal(coverAmount);
      expect(policyInfo1.expirationBlock).to.equal(expirationBlock);
      expect(policyInfo1.price).to.equal(price);
      // getPolicyInfo()
      let policyInfo2 = await policyManager.getPolicyInfo(1);
      expect(policyInfo2.policyholder).to.equal(user.address);
      expect(policyInfo2.product).to.equal(walletProduct2.address);
      expect(policyInfo2.positionDescription).to.equal(positionDescription);
      expect(policyInfo2.coverAmount).to.equal(coverAmount);
      expect(policyInfo2.expirationBlock).to.equal(expirationBlock);
      expect(policyInfo2.price).to.equal(price);
      // individual
      expect(await policyManager.getPolicyholder(1)).to.equal(user.address);
      expect(await policyManager.getPolicyProduct(1)).to.equal(walletProduct2.address);
      expect(await policyManager.getPositionDescription(1)).to.equal(positionContract.address.toLowerCase());
      expect(await policyManager.getPolicyExpirationBlock(1)).to.equal(expirationBlock);
      expect(await policyManager.policyIsActive(1)).to.equal(true);
      expect(await policyManager.getPolicyCoverAmount(1)).to.equal(coverAmount);
      expect(await policyManager.getPolicyPrice(1)).to.equal(price);
      expect(await policyManager.exists(1)).to.equal(true);
      // invalid
      await expect(policyManager.policyInfo(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyInfo(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyholder(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyProduct(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPositionDescription(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyExpirationBlock(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyCoverAmount(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyPrice(2)).to.be.revertedWith("query for nonexistent token");
      expect(await policyManager.exists(2)).to.equal(false);
    });
    it("cannot update nonexistent policy", async function() {
      await expect(policyManager.setPolicyInfo(2, coverAmount, expirationBlock, price, positionContract.address)).to.be.revertedWith("query for nonexistent token");
    });
    it("product cannot update other products policy", async function() {
      await expect(policyManager.setPolicyInfo(1, coverAmount, expirationBlock, price, positionContract.address)).to.be.revertedWith("wrong product");
    });
    it("can set policy info", async function() {
      let policyDescription = "0xabcd1234";
      await policyManager.connect(walletProduct2).setPolicyInfo(1, 1, 2, 3, policyDescription);
      expect(await policyManager.getPolicyholder(1)).to.equal(user.address);
      expect(await policyManager.getPolicyProduct(1)).to.equal(walletProduct2.address);
      expect(await policyManager.getPositionDescription(1)).to.equal(policyDescription);
      expect(await policyManager.getPolicyCoverAmount(1)).to.equal(1);
      expect(await policyManager.getPolicyExpirationBlock(1)).to.equal(2);
      expect(await policyManager.getPolicyPrice(1)).to.equal(3);
      expect(await policyManager.policyIsActive(1)).to.equal(false);
      expect(await policyManager.exists(1)).to.equal(true);
      expect(await policyManager.activeCoverAmount()).to.equal(1);
      expect(await riskManager.minCapitalRequirement()).to.equal(1);
    });
    it("can list my policies", async function() {
      expect(await policyManager.listPolicies(deployer.address)).to.deep.equal([]);
      expect(await policyManager.listPolicies(user.address)).to.deep.equal([BN.from(1)]);
      await policyManager.connect(walletProduct2).createPolicy(user.address, coverAmount, expirationBlock, price, positionContract.address);
      expect(await policyManager.listPolicies(user.address)).to.deep.equal([BN.from(1), BN.from(2)]);
      expect(await policyManager.activeCoverAmount()).to.equal(coverAmount.add(1));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount.add(1));
    });
    it("cannot directly burn policy", async function() {
      await expect(policyManager.connect(user).burn(1)).to.be.revertedWith("wrong product");
      await expect(policyManager.connect(user).burn(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("can burn policy via product", async function() {
      let tx = await policyManager.connect(walletProduct2).createPolicy(user.address, coverAmount, expirationBlock, price, positionContract.address);
      expect(tx).to.emit(policyManager, "PolicyCreated").withArgs(3);
      expect(await policyManager.activeCoverAmount()).to.equal(coverAmount.mul(2).add(1));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount.mul(2).add(1));

      await policyManager.connect(walletProduct2).burn(1); // burn tokenID 1
      expect(await policyManager.exists(1)).to.equal(false);
      expect(await policyManager.activeCoverAmount()).to.equal(coverAmount.mul(2));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount.mul(2));
      await policyManager.connect(walletProduct2).burn(2); // burn tokenID 2
      expect(await policyManager.exists(2)).to.equal(false);
      expect(await policyManager.activeCoverAmount()).to.equal(coverAmount);
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount);
      let totalPolicyCount = await policyManager.totalPolicyCount();
      expect(totalPolicyCount).to.equal(3);
      let totalSupply = await policyManager.totalSupply();
      expect(totalSupply).to.equal(1);
    });
    it("policy holder is token owner", async function () {
      let policyID = BN.from(3);
      expect(await policyManager.ownerOf(policyID)).to.equal(user.address);
      expect(await policyManager.getPolicyholder(policyID)).to.equal(user.address);
      expect((await policyManager.getPolicyInfo(policyID)).policyholder).to.equal(user.address);
      expect(await policyManager.listPolicies(user.address)).to.deep.equal([policyID]);
      expect(await policyManager.listPolicies(user2.address)).to.deep.equal([]);
      await policyManager.connect(user).transferFrom(user.address, user2.address, policyID);
      expect(await policyManager.ownerOf(policyID)).to.equal(user2.address);
      expect(await policyManager.getPolicyholder(policyID)).to.equal(user2.address);
      expect((await policyManager.getPolicyInfo(policyID)).policyholder).to.equal(user2.address);
      expect(await policyManager.listPolicies(user.address)).to.deep.equal([]);
      expect(await policyManager.listPolicies(user2.address)).to.deep.equal([policyID]);
      await policyManager.connect(user2).approve(user.address, policyID);
      await policyManager.connect(user).transferFrom(user2.address, user.address, policyID);
      expect(await policyManager.ownerOf(policyID)).to.equal(user.address);
      expect(await policyManager.getPolicyholder(policyID)).to.equal(user.address);
      expect((await policyManager.getPolicyInfo(policyID)).policyholder).to.equal(user.address);
      expect(await policyManager.listPolicies(user.address)).to.deep.equal([policyID]);
      expect(await policyManager.listPolicies(user2.address)).to.deep.equal([]);
    });
  });

  describe("lifecycle", function() {
    //             A B C D
    // exists      0 1 1 0
    // isActive    0 1 0 0
    // hasExpired  0 0 1 0

    let policyID = 4;
    let blockNum: BN;
    let expBlock: BN;

    it("pre-mint", async function() {
      expect(await policyManager.exists(policyID)).to.be.false;
      expect(await policyManager.policyIsActive(policyID)).to.be.false;
      expect(await policyManager.policyHasExpired(policyID)).to.be.false;
    });
    it("pre-expiration", async function() {
      blockNum = BN.from(await provider.getBlockNumber());
      expBlock = blockNum.add(10);
      await policyManager.connect(walletProduct2).createPolicy(user.address, coverAmount, expBlock, price, positionContract.address);
      expect(await policyManager.exists(policyID)).to.be.true;
      expect(await policyManager.policyIsActive(policyID)).to.be.true;
      expect(await policyManager.policyHasExpired(policyID)).to.be.false;
      expect(await policyManager.activeCoverAmount()).to.equal(coverAmount.mul(2));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount.mul(2));
    });
    it("post-expiration", async function() {
      await burnBlocks(12);
      expect(await policyManager.exists(policyID)).to.be.true;
      expect(await policyManager.policyIsActive(policyID)).to.be.false;
      expect(await policyManager.policyHasExpired(policyID)).to.be.true;
      expect(await policyManager.activeCoverAmount()).to.equal(coverAmount.mul(2));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount.mul(2));
    });
    it("post-burn", async function() {
      await policyManager.connect(walletProduct2).burn(policyID); // burn tokenID 1
      expect(await policyManager.exists(policyID)).to.be.false;
      expect(await policyManager.policyIsActive(policyID)).to.be.false;
      expect(await policyManager.policyHasExpired(policyID)).to.be.false;
      expect(await policyManager.activeCoverAmount()).to.equal(coverAmount);
      expect(await riskManager.minCapitalRequirement()).to.equal(coverAmount);
    });
  });

  describe("updateActivePolicies", async function() {
    before(async function() {
      // redeploy policy manager
      policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
      // add products
      mockProduct = (await deployContract(
        deployer,
        artifacts.MockProduct,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          treasury.address,
          0,
          100000000000,
          1,
          16777215
        ]
      )) as MockProduct;
      await policyManager.connect(governor).addProduct(mockProduct.address);
      await registry.connect(governor).setPolicyManager(policyManager.address);
    });
    it("can update active policies", async function() {
      // create policies
      // policy 1 expires
      await mockProduct.connect(user)._buyPolicy(user.address, positionContract.address, 0b00001, 110);
      expect(await policyManager.activeCoverAmount()).to.equal(0b00001);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b00001);
      // policy 2 expires
      await mockProduct.connect(user)._buyPolicy(user.address, positionContract.address, 0b00010, 120);
      expect(await policyManager.activeCoverAmount()).to.equal(0b00011);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b00011);
      // policy 3 expires but is not updated
      await mockProduct.connect(user)._buyPolicy(user.address, positionContract.address, 0b00100, 130);
      expect(await policyManager.activeCoverAmount()).to.equal(0b00111);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b00111);
      // policy 4 does not expire
      await mockProduct.connect(user)._buyPolicy(user.address, positionContract.address, 0b01000, 200);
      expect(await policyManager.activeCoverAmount()).to.equal(0b01111);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b01111);
      // policy 5 is canceled
      await mockProduct.connect(user)._buyPolicy(user.address, positionContract.address, 0b10000, 300);
      expect(await policyManager.activeCoverAmount()).to.equal(0b11111);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b11111);
      // pass time
      await burnBlocks(150);
      await mockProduct.connect(user).cancelPolicy(5);
      expect(await policyManager.activeCoverAmount()).to.equal(0b01111);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b01111);
      // update policies
      await policyManager.updateActivePolicies([1, 2, 4, 5, 999]);
      expect(await policyManager.exists(1)).to.be.false;
      expect(await policyManager.exists(2)).to.be.false;
      expect(await policyManager.exists(3)).to.be.true;
      expect(await policyManager.exists(4)).to.be.true;
      expect(await policyManager.exists(5)).to.be.false;
      expect(await mockProduct.activeCoverAmount()).to.equal(0b01100);
      expect(await policyManager.activeCoverAmount()).to.equal(0b01100);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b01100);
    });
  });

  describe("tokenURI", function() {
    let policyId:BN;
    let productName:string;
    before(async function(){
        // redeploy policy manager
        policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
        // add products
        mockProduct = (await deployContract(
          deployer,
          artifacts.MockProduct,
          [
            deployer.address,
            policyManager.address,
            registry.address,
            treasury.address,
            0,
            100000000000,
            1,
            16777215
          ]
        )) as MockProduct;
        await policyManager.connect(governor).addProduct(mockProduct.address);
        await policyManager.connect(governor).setPolicyDescriptor(policyDescriptor.address);
        await registry.connect(governor).setPolicyManager(policyManager.address);
        await mockProduct.connect(user)._buyPolicy(user.address, positionContract.address, 5000, 110);
        policyId = await policyManager.totalPolicyCount();
        productName = await mockProduct.name();
    });
    it("can get tokenURI", async function() {
        let tokenURI = `This is a Solace Finance policy that covers a ${productName} position`;
        expect(await policyManager.tokenURI(policyId)).to.equal(tokenURI);
    });
    it("cannot get tokenURI for nonexistant policy id", async function() {
      await expect(policyManager.tokenURI(1000)).to.be.revertedWith("query for nonexistent token");
    });
  });
});
