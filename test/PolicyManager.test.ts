import { waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Wallet, BigNumber as BN } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager } from "../typechain";


describe("PolicyManager", function () {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, mockProduct1, mockProduct2, mockProduct3, positionContract] = provider.getWallets();

  // contracts
  let policyManager: PolicyManager;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const name = "Solace Policy";
  const symbol = "SPT";
  const expirationBlock = 20000000;
  const coverAmount = BN.from("100000000000000"); // 10 Ether in wei
  const price = 11044; // price in wei for block/wei

  before(async function () {
    artifacts = await import_artifacts();

    // deploy policy manager
    policyManager = (await deployContract(
      deployer,
      artifacts.PolicyManager,
      [
        governor.address
      ]
    )) as PolicyManager;
  })

  it("has a correct name", async function () {
    expect(await policyManager.name()).to.equal(name);
  })

  it("has a correct symbol", async function () {
    expect(await policyManager.symbol()).to.equal(symbol);
  })

  it("has no policies", async function () {
    expect(await policyManager.totalPolicyCount()).to.equal(0);
  })

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await policyManager.governance()).to.equal(governor.address);
    })

    it("rejects setting new governance by non governor", async function () {
      await expect(policyManager.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    })

    it("can set new governance", async function () {
      await policyManager.connect(governor).setGovernance(deployer.address);
      expect(await policyManager.governance()).to.equal(governor.address);
      expect(await policyManager.newGovernance()).to.equal(deployer.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(policyManager.connect(user).acceptGovernance()).to.be.revertedWith("!governance");
    })

    it("can transfer governance", async function () {
      let tx = await policyManager.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(policyManager, "GovernanceTransferred").withArgs(deployer.address);
      expect(await policyManager.governance()).to.equal(deployer.address);
      expect(await policyManager.newGovernance()).to.equal(ZERO_ADDRESS);

      await policyManager.connect(deployer).setGovernance(governor.address);
      await policyManager.connect(governor).acceptGovernance();
    })
  })

  describe("products", function () {
    it("starts with no products", async function () {
      expect(await policyManager.numProducts()).to.equal(0);
    })

    it("can add products", async function () {
      let tx1 = await policyManager.connect(governor).addProduct(mockProduct1.address);
      expect(await policyManager.numProducts()).to.equal(1);
      await expect(tx1).to.emit(policyManager, "ProductAdded").withArgs(mockProduct1.address);
      let tx2 = await policyManager.connect(governor).addProduct(mockProduct2.address);
      expect(await policyManager.numProducts()).to.equal(2);
      await expect(tx2).to.emit(policyManager, "ProductAdded").withArgs(mockProduct2.address);
    })

    it("returns products", async function () {
      expect(await policyManager.numProducts()).to.equal(2);
      expect(await policyManager.getProduct(0)).to.equal(mockProduct1.address);
      expect(await policyManager.getProduct(1)).to.equal(mockProduct2.address);
      expect(await policyManager.productIsActive(mockProduct1.address)).to.equal(true);
      expect(await policyManager.productIsActive(mockProduct2.address)).to.equal(true);
      expect(await policyManager.productIsActive(mockProduct3.address)).to.equal(false);
    })

    it("rejects adds and removes by non governor", async function () {
      await expect(policyManager.connect(user).addProduct(mockProduct3.address)).to.be.revertedWith("!governance");
      await expect(policyManager.connect(user).removeProduct(mockProduct1.address)).to.be.revertedWith("!governance");
    })

    it("can remove products", async function () {
      let tx1 = await policyManager.connect(governor).removeProduct(mockProduct1.address);
      expect(await policyManager.numProducts()).to.equal(1);
      expect(await policyManager.productIsActive(mockProduct1.address)).to.equal(false);
      await expect(tx1).to.emit(policyManager, "ProductRemoved").withArgs(mockProduct1.address);
      expect(await policyManager.getProduct(0)).to.equal(mockProduct2.address);
    })
  })

  describe("policies", function () {
    it("non product cannot create policy", async function () {
        await expect(policyManager.connect(user).createPolicy(user.address, positionContract.address, coverAmount, expirationBlock, price)).to.be.revertedWith("product inactive");
    })

    it("can create policy", async function (){
      let tokenID = await policyManager.connect(mockProduct2).createPolicy(user.address, positionContract.address, coverAmount, expirationBlock, price);
      let receipt = await tokenID.wait();
      expect(receipt.logs[0].topics[3]).to.equal("0x0000000000000000000000000000000000000000000000000000000000000001");
    })

    it("can get policy info", async function () {
      let policyInfo = await policyManager.getPolicyInfo(1);
      expect(policyInfo.policyholder).to.equal(user.address);
      expect(policyInfo.product).to.equal(mockProduct2.address);
      expect(policyInfo.positionContract).to.equal(positionContract.address);
      expect(policyInfo.coverAmount).to.equal(coverAmount);
      expect(policyInfo.expirationBlock).to.equal(expirationBlock);
      expect(policyInfo.price).to.equal(price);
      expect(await policyManager.getPolicyholder(1)).to.equal(user.address);
      expect(await policyManager.getPolicyProduct(1)).to.equal(mockProduct2.address);
      expect(await policyManager.getPolicyPositionContract(1)).to.equal(positionContract.address);
      expect(await policyManager.getPolicyExpirationBlock(1)).to.equal(expirationBlock);
      expect(await policyManager.getPolicyIsActive(1)).to.equal(true);
      expect(await policyManager.getPolicyCoverAmount(1)).to.equal(coverAmount);
      expect(await policyManager.getPolicyPrice(1)).to.equal(price);
      expect(await policyManager.exists(1)).to.equal(true);

      await expect(policyManager.getPolicyInfo(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyholder(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyProduct(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyPositionContract(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyExpirationBlock(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyCoverAmount(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyPrice(2)).to.be.revertedWith("query for nonexistent token");
      expect(await policyManager.exists(2)).to.equal(false);
    })

    it("cannot update nonexistent policy", async function () {
      await expect(policyManager.setPolicyInfo(2, user.address, positionContract.address, coverAmount, expirationBlock, price)).to.be.revertedWith("query for nonexistent token")
    })

    it("product cannot update other products policy", async function () {
      await expect(policyManager.setPolicyInfo(1, user.address, positionContract.address, coverAmount, expirationBlock, price)).to.be.revertedWith("wrong product");
    })

    it("can set policy info", async function () {
      await policyManager.connect(mockProduct2).setPolicyInfo(1, deployer.address, governor.address, 1, 2, 3);
      expect(await policyManager.getPolicyholder(1)).to.equal(deployer.address);
      expect(await policyManager.getPolicyProduct(1)).to.equal(mockProduct2.address);
      expect(await policyManager.getPolicyPositionContract(1)).to.equal(governor.address);
      expect(await policyManager.getPolicyCoverAmount(1)).to.equal(1);
      expect(await policyManager.getPolicyExpirationBlock(1)).to.equal(2);
      expect(await policyManager.getPolicyPrice(1)).to.equal(3);
      expect(await policyManager.getPolicyIsActive(1)).to.equal(false);
      expect(await policyManager.exists(1)).to.equal(true);
    })

    it("can list my policies", async function () {
      expect(await policyManager.listPolicies(deployer.address)).to.deep.equal([]);
      expect(await policyManager.listPolicies(user.address)).to.deep.equal([BN.from(1)]);
      await policyManager.connect(mockProduct2).createPolicy(user.address, positionContract.address, coverAmount, expirationBlock, price);
      expect(await policyManager.listPolicies(user.address)).to.deep.equal([BN.from(1),BN.from(2)]);
    })

    it("cannot directly burn policy", async function () {
      await expect(policyManager.connect(user).burn(1)).to.be.revertedWith("wrong product");
    })

    it("can burn policy via product", async function (){
      let tokenID = await policyManager.connect(mockProduct2).createPolicy(user.address, positionContract.address, coverAmount, expirationBlock, price);
      let receipt = (await tokenID.wait())
      expect(receipt.logs[0].topics[3]).to.equal("0x0000000000000000000000000000000000000000000000000000000000000003")

      await policyManager.connect(mockProduct2).burn(1); // burn tokenID 1
      expect(await policyManager.exists(1)).to.equal(false);
      await policyManager.connect(mockProduct2).burn(2); // burn tokenID 2
      expect(await policyManager.exists(2)).to.equal(false);
      let totalPolicyCount = await policyManager.totalPolicyCount();
      expect(totalPolicyCount).to.equal(3);
      let totalSupply = await policyManager.totalSupply();
      expect(totalSupply).to.equal(1);
    })
  })
});
