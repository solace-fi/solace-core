import chai from "chai";
import { waffle } from "hardhat";
import MockProductArtifact from '../artifacts/contracts/mocks/MockProduct.sol/MockProduct.json'
import PolicyManagerArtifact from '../artifacts/contracts/PolicyManager.sol/PolicyManager.json'
import ClaimsAdjusterArtifact from '../artifacts/contracts/ClaimsAdjustor.sol/ClaimsAdjustor.json'
import RegistryArtifact from "../artifacts/contracts/Registry.sol/Registry.json";
import SolaceArtifact from "../artifacts/contracts/SOLACE.sol/SOLACE.json"
import WETHArtifact from "../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json";
import TreasuryArtifact from "../artifacts/contracts/Treasury.sol/Treasury.json";
import { PolicyManager, ClaimsAdjustor, Registry, MockProduct, Solace, MockWeth, Treasury } from "../typechain";

// uniswap imports
import UniswapV3FactoryArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import SwapRouterArtifact from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";

import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);
describe('MockProduct', () => {
 let policyManager: PolicyManager;
 let registry: Registry;
 let coveredPlatform: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"; // testing UniswapFactory for cover
 let claimsAdjuster: ClaimsAdjustor;
 let solace: Solace;
 let weth: MockWeth;
 let treasury: Treasury;
 let mockProduct: MockProduct;
 let uniswapFactory: Contract;
 let uniswapRouter: Contract;
 const [owner, governor] = provider.getWallets();
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

  // deploy registry
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

  // deploy solace
  solace = (await deployContract(
    owner,
    SolaceArtifact
  )) as Solace;

  // deploy weth
  weth = (await deployContract(
      owner,
      WETHArtifact
  )) as MockWeth;

  // deploy uniswap factory
  uniswapFactory = (await deployContract(
    owner,
    UniswapV3FactoryArtifact
  )) as Contract;

  // deploy uniswap router
  uniswapRouter = (await deployContract(
    owner,
    SwapRouterArtifact,
    [
      uniswapFactory.address,
      weth.address
    ]
  )) as Contract;

  // deploy treasury contract
  treasury = (await deployContract(
    owner,
    TreasuryArtifact,
    [
      solace.address,
      uniswapRouter.address,
      weth.address
    ]
  )) as Treasury;

  // deploy BaseProduct
  mockProduct = (await deployContract(
   owner,
   MockProductArtifact,
   [
    policyManager.address,
    treasury.address,
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
 })
})
