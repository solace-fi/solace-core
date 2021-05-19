import chai from "chai";
import { waffle } from "hardhat";
import MockProductArtifact from '../artifacts/contracts/mocks/MockProduct.sol/MockProduct.json'
import PolicyManagerArtifact from '../artifacts/contracts/PolicyManager.sol/PolicyManager.json'
import ClaimsAdjusterArtifact from '../artifacts/contracts/ClaimsAdjustor.sol/ClaimsAdjustor.json'
import RegistryArtifact from "../artifacts/contracts/Registry.sol/Registry.json";
import { PolicyManager, ClaimsAdjustor, Registry, MockProduct } from "../typechain";
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet} from "ethers";
import { Account, zeroAddress } from "ethereumjs-util";
import { Address } from "node:cluster";

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);
describe('MockProduct', () => {
  let policyManager: PolicyManager;
  let registry: Registry;
  let claimsAdjuster: ClaimsAdjustor;
  let mockProduct: MockProduct;
  const [owner, governor, product1, product2, positionContract, buyer] = provider.getWallets();
  const sig = provider.getSigner();
  const minPeriod = 6450; // this is about 1 day
  const maxPeriod = 45100; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
  const maxCoverAmount = BN.from("100000000000000"); // 10 Ether in wei
  const cancelFee = BN.from("100000000"); // 0.1 Ether in wei or 1% of the maxCoverAmount
  const price = 1000; // price in wei for block/wei

  before(async () => {
    // deploy policy manager
    policyManager = (await deployContract(
      owner,
      PolicyManagerArtifact
    )) as PolicyManager;

    registry = (await deployContract(
      owner,
      RegistryArtifact
    )) as Registry;

    // deploy claims adjuster
    claimsAdjuster = (await deployContract(
      owner,
      ClaimsAdjusterArtifact,
      [registry.address]
    )) as ClaimsAdjustor;

    // deploy BaseProduct
    mockProduct = (await deployContract(
      owner,
      MockProductArtifact,
      [
        policyManager.address,
        claimsAdjuster.address, // this is for the coveredPlatform
        claimsAdjuster.address,
        price,
        cancelFee,
        minPeriod,
        maxPeriod,
        maxCoverAmount
      ]
    )) as MockProduct;
  })

  describe('governance', function () {
    it('can transfer governance', async function () {
      await mockProduct.setGovernance(governor.address);
      expect(await mockProduct.governance()).to.equal(governor.address);
    })
  })

  describe('claimsAdjuster', function () {
    it('should set claimsAdjuster', async function () {
      await mockProduct.connect(governor).setClaimsAdjuster(claimsAdjuster.address);
      expect(await mockProduct.claimsAdjuster()).to.equal(claimsAdjuster.address);
    });
    it("should revert if not called by governance", async function () {
      await expect(mockProduct.connect(owner).setClaimsAdjuster(claimsAdjuster.address)).to.be.revertedWith("!governance");
    });
  })

  describe('productParameters', () => {
    it('can set setPrice', async function () {
      await mockProduct.connect(governor).setPrice(price);
      expect(await mockProduct.price()).to.equal(price);
    })
    it("should revert if not called by governance", async function () {
      await expect(mockProduct.connect(owner).setClaimsAdjuster(claimsAdjuster.address)).to.be.revertedWith("!governance");
    });
    it('can set cancelFee', async function () {
      await mockProduct.connect(governor).setCancelFee(cancelFee);
      expect(await mockProduct.cancelFee()).to.equal(cancelFee);
    })
    it("should revert if not called by governance", async function () {
      await expect(mockProduct.connect(owner).setCancelFee(cancelFee)).to.be.revertedWith("!governance");
    });
    it('can set minPeriod', async function () {
      await mockProduct.connect(governor).setMinPeriod(minPeriod);
      expect(await mockProduct.minPeriod()).to.equal(minPeriod);
    })
    it("should revert if not called by governance", async function () {
      await expect(mockProduct.connect(owner).setMinPeriod(minPeriod)).to.be.revertedWith("!governance");
    });
    it('can set maxPeriod', async function () {
      await mockProduct.connect(governor).setMaxPeriod(maxPeriod);
      expect(await mockProduct.maxPeriod()).to.equal(maxPeriod);
    })
    it("should revert if not called by governance", async function () {
      await expect(mockProduct.connect(owner).setMaxPeriod(maxPeriod)).to.be.revertedWith("!governance");
    });
    it('can set maxCoverAmount', async function () {
      await mockProduct.connect(governor).setMaxCoverAmount(maxCoverAmount);
      expect(await mockProduct.maxCoverAmount()).to.equal(maxCoverAmount);
    })
    it("should revert if not called by governance", async function () {
      await expect(mockProduct.connect(owner).setMaxCoverAmount(maxCoverAmount)).to.be.revertedWith("!governance");
    });

    describe('implementedFunctions', () => {
      it('can getQuote', async function () {
        let price = BN.from(await mockProduct.price());
        let coverLimit = 50 // cover 50% of the position
        let blocks = BN.from(25100) // less than the max
        // premium should equal 
        // _positionAmount * _coverLimit/100 * _blocks * price;
        // implementing a static 100 return for appraisePosition
        // let expectedPremium = BN.from(100 * Number(coverLimit)/100 * Number(blocks) * Number(price)) // get expected premium
        let expectedPremium = 100 * Number(coverLimit) / 100 * Number(blocks) * Number(price) // had to add in divide by 10^-8 to prevent overflow in the .equals()
        let quote = BN.from(await mockProduct.getQuote(coverLimit, blocks, positionContract.address))
        expect(quote).to.equal(expectedPremium);
      })
      it('can buyPolicy', async function () {
        // adding the owner product to the ProductManager
        (await policyManager.connect(owner).addProduct("0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9")); // when using { value: quote } below it defaults to send from the first account
        // position contract set
        expect(await policyManager.productIsActive("0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9")).to.equal(true);

        let coverLimit = 50 // cover 50% of the position      
        let blocks = BN.from(25100) // less than the max
        let quote = BN.from(await mockProduct.connect(buyer).getQuote(coverLimit, blocks, positionContract.address));
        let res = (await mockProduct.buyPolicy(coverLimit, blocks, positionContract.address, { value: quote }));  
        let receipt = await res.wait()
        expect(receipt.logs[0].topics[3]).to.equal('0x0000000000000000000000000000000000000000000000000000000000000000') // the last element in the logs array is the policyID, in this case policyID = 0
      })  
      // it('can updateActivePolicies', async function () {
      //   let activeCoverAmount, activePolicyCount = await mockProduct.updateActivePolicies();
      //   let receipt = await activePolicyCount.wait();
      //   expect(activeCoverAmount).to.equal(100);
      // })
    })
  })  
})  