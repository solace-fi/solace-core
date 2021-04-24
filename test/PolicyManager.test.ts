import chai from "chai";
import { waffle } from "hardhat";
import PolicyManagerArtifact from '../artifacts/contracts/PolicyManager.sol/PolicyManager.json'
import { PolicyManager } from "../typechain";

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);

describe('PolicyManager', () => {
  let policyManager: PolicyManager;
  const [owner, governor, product1, product2, policyholder, buyer] = provider.getWallets();
  const name = 'SolacePolicy';
  const symbol = 'SPT';
  const expirationBlock = 123456;
  const coverAmount = 10000000000000000000; // 10 Ether in wei
  const price = 1000; // price in wei for block/wei
  

  beforeEach(async () => {
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

  it('has no products', async function () {
    expect(await policyManager.productIsActive()).to.equal(0);
  })

  describe('governance', function () {
    it('can transfer governance', async function () {
      await policyManager.setGovernance(governor.address);
      expect(await policyManager.governance()).to.equal(governor.address);
    })

    it('reverts governance transfers by non-governor', async function () {
      await expect(policyManager.connect(receiver1).setGovernance(policyholder.address)).to.be.reverted;
    })

    it('can add products', async function (){
      await policyManager.connect(owner).addProduct(product1.address);
      expect(await policyManager.productIsActive(product1.address)).to.equal(true);
    })
  
    it('can remove products', async function () {
      await policyManager.connect(owner).removeProduct(product1.address);
      expect(await policyManager.productIsActive(product1.address)).to.equal(false);
    })

    it('reverts when !governance adds / removes products', async function () {
      await expect(policyManager.connect(policyholder).addProduct(product2.address)).to.be.reverted;
      await expect(policyManager.connect(policyholder).removeProduct(product2.address)).to.be.reverted;
    })
  })

  describe('policyholder', function () {

    before(async function () {
        await policyManager.connect(owner).addProduct(product1.address);
        await policyManager.connect(product1).createPolicy(policyholder,expirationBlock,coverAmount,price);
        await policyManager.connect(product1).createPolicy(policyholder,expirationBlock,coverAmount,price);
    })

    it('can view all my policies', async function (){
      expect(await policyManager.connect(policyholder).myPolicies()).to.equal([0,1]);
    })
  })
})