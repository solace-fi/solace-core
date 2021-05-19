import chai from "chai";
import { waffle } from "hardhat";
import PolicyManagerArtifact from '../artifacts/contracts/PolicyManager.sol/PolicyManager.json'
import { PolicyManager } from "../typechain";
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);

describe('PolicyManager', () => {
  let policyManager: PolicyManager;
  const [owner, governor, product1, product2, positionContract, buyer] = provider.getWallets();
  const name = 'Solace Policy';
  const symbol = 'SPT';
  const expirationBlock = 123456;
  const coverAmount = BN.from("100000000000000"); // 10 Ether in wei
  const price = 1000; // price in wei for block/wei
  

  before(async () => {
    policyManager = (await deployContract(
      owner,
      PolicyManagerArtifact
    )) as PolicyManager;
  })

  it('has a correct name', async function () {
    expect(await policyManager.name()).to.equal(name);
  })

  it('has a correct symbol', async function () {
    expect(await policyManager.symbol()).to.equal(symbol);
  })

  it('has a correct governance', async function () {
    expect(await policyManager.governance()).to.equal(owner.address);
  })

  it('has no policies', async function () {
    expect(await policyManager.totalPolicyCount()).to.equal(0);
  })

  describe('governance', function () {
    it('can transfer governance', async function () {
      await policyManager.setGovernance(governor.address);
      expect(await policyManager.governance()).to.equal(governor.address);
    })

    it('reverts governance transfers by non-governor', async function () {
      await expect(policyManager.connect(buyer).setGovernance(buyer.address)).to.be.reverted;
    })

    it('can add products', async function (){
      await policyManager.connect(governor).addProduct(product1.address);
      expect(await policyManager.productIsActive(product1.address)).to.equal(true);
    })
  
    it('can remove products', async function () {
      await policyManager.connect(governor).removeProduct(product1.address);
      expect(await policyManager.productIsActive(product1.address)).to.equal(false);
      await policyManager.connect(governor).addProduct(product1.address);
    })

    it('reverts when !governance adds / removes products', async function () {
      await expect(policyManager.connect(buyer).addProduct(product2.address)).to.be.reverted;
      await policyManager.connect(governor).addProduct(product2.address);
      await expect(policyManager.connect(buyer).removeProduct(product2.address)).to.be.reverted;
    })
  })

  describe('product', function () {

    before(async function () {
      await policyManager.connect(governor).addProduct(governor.address);
    })

    it('can create policy', async function (){
      let tokenID = await policyManager.connect(governor).createPolicy(buyer.address, positionContract.address, expirationBlock, coverAmount, price);
      let receipt = await tokenID.wait();
      expect(receipt.logs[0].topics[3]).to.equal('0x0000000000000000000000000000000000000000000000000000000000000000');
    })  

    it('can burn policy', async function (){
      let tokenID = await policyManager.connect(governor).createPolicy(buyer.address, positionContract.address, expirationBlock, coverAmount, price);
      let receipt = (await tokenID.wait())
      expect(receipt.logs[0].topics[3]).to.equal("0x0000000000000000000000000000000000000000000000000000000000000001") // 1 policy creaeted

      await policyManager.connect(governor).burn(0); // burn tokenID 0
      await policyManager.connect(governor).burn(1); // burn tokenID 1
      let totalPolicyCount = await policyManager.totalPolicyCount();
      expect(totalPolicyCount).to.equal(0); // all policies are gone
    })  
  })

  describe('policyholder', function () { 

    it('can view all my policies', async function (){   
      let tokenID = await policyManager.connect(governor).createPolicy(buyer.address, positionContract.address, expirationBlock, coverAmount, price);
      let myPolicies = await policyManager.connect(buyer).myPolicies();
      expect(myPolicies.length).to.equal(1); // 1 policy created
    })  

    it('can view my policy expiration block', async function (){
      let policyID = (await policyManager.connect(buyer).myPolicies())[0]
      expect(await policyManager.connect(buyer).getPolicyExpirationBlock(policyID)).to.equal(expirationBlock);
    })

    it('can view my policy coverage amount', async function (){
      let policyID = (await policyManager.connect(buyer).myPolicies());  
      let policyCoverAmount = await policyManager.connect(buyer).getPolicyCoverAmount(0);
      expect(policyCoverAmount.toNumber()).to.equal(coverAmount);
    })
  })
})