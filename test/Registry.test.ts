import { waffle } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import chai from "chai";
const { expect } = chai;

import RegistryArtifact from "../artifacts/contracts/Registry.sol/Registry.json";
import SolaceArtifact from "../artifacts/contracts/SOLACE.sol/SOLACE.json";
import MasterArtifact from "../artifacts/contracts/Master.sol/Master.json";
// TODO: switch from mocks and SignerWithAddress to actual contracts after implementation
import MockProductArtifact from "../artifacts/contracts/mocks/MockProduct.sol/MockProduct.json";
import MockVaultArtifact from "../artifacts/contracts/mocks/MockVault.sol/MockVault.json";
import { Registry, Solace, Master, Vault, MockProduct, MockVault } from "../typechain";

chai.use(solidity);

describe("Registry", function () {
  // users
  // @ts-ignore
  let governor1: SignerWithAddress;
  // @ts-ignore
  let governor2: SignerWithAddress;
  // @ts-ignore
  let user: SignerWithAddress;

  // contracts
  let registry: Registry;
  let solaceToken: Solace;
  let master: Master;
  // mock contracts
  let product: MockProduct;
  let vault: MockVault;
  // @ts-ignore
  let treasury: SignerWithAddress;
  // @ts-ignore
  let locker: SignerWithAddress;
  // @ts-ignore
  let mockContract1: SignerWithAddress;
  // @ts-ignore
  let mockContract2: SignerWithAddress;
  // @ts-ignore
  let mockContract3: SignerWithAddress;

  // vars
  let productAddress: any;
  let policyAddress: any;
  let strategyAddress: any;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  before(async function () {
    [governor1, governor2, user, treasury, locker, mockContract1, mockContract2, mockContract3] = provider.getWallets();

    // deploy registry contract
    registry = (await deployContract(
      governor1,
      RegistryArtifact
    )) as Registry;

    // deploy solace token
    solaceToken = (await deployContract(
      governor1,
      SolaceArtifact
    )) as Solace;

    // deploy master contract
    master = (await deployContract(
      governor1,
      MasterArtifact,
      [
        solaceToken.address,
        1
      ]
    )) as Master;

    // deploy mock vault contract
    vault = (await deployContract(
        governor1,
        MockVaultArtifact,
        [
          registry.address
        ]
    )) as MockVault;

    // deploy a mock product
    product = (await deployContract(
      governor1,
      MockProductArtifact,
      [
        registry.address
      ]
    )) as MockProduct;

  })

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await registry.governance()).to.equal(governor1.address);
    })

    it("can transfer governance", async function () {
      await registry.connect(governor1).setGovernance(governor2.address);
      expect(await registry.governance()).to.equal(governor2.address);
    })

    it("rejects governance transfer by non governor", async function () {
      await expect(registry.connect(user).setGovernance(user.address)).to.be.revertedWith("!governance");
    })
  })

  describe("solace token", function () {
    it("starts as the zero address", async function () {
      expect(await registry.solace()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      await registry.connect(governor2).setSolace(solaceToken.address);
      expect(await registry.solace()).to.equal(solaceToken.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setSolace(solaceToken.address)).to.be.revertedWith("!governance");
    })
  })

  describe("master", function () {
    it("starts as the zero address", async function () {
      expect(await registry.master()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      await registry.connect(governor2).setMaster(master.address);
      expect(await registry.master()).to.equal(master.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setMaster(master.address)).to.be.revertedWith("!governance");
    })
  })

  describe("vault", function () {
    it("starts as the zero address", async function () {
      expect(await registry.vault()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      await registry.connect(governor2).setVault(vault.address);
      expect(await registry.vault()).to.equal(vault.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setVault(vault.address)).to.be.revertedWith("!governance");
    })
  })

  describe("strategies", function () {
    it("starts with no strategies", async function () {
      expect(await registry.numStrategies()).to.equal(0);
    })

    it("can add strategies", async function () {
      await registry.connect(governor2).addStrategy(mockContract1.address);
      let tx = await vault.createStrategy(); // TODO: get strategy address from this transaction
      let events = (await tx.wait()).events;
      expect(events).to.exist;
      //expect(events.length).to.not.equal(0); // TODO: get typescript to stop flagging unnecessarily
      if(events && events.length > 0 && events[0].args && events[0].args.strategy){
        strategyAddress = events[0].args.strategy;
      }else{
        expect(true).to.equal(false);
      }
    })

    it("returns strategies", async function () {
      expect(await registry.numStrategies()).to.equal(2);
      expect(await registry.getStrategy(0)).to.equal(mockContract1.address);
      expect(await registry.getStrategy(1)).to.equal(strategyAddress);
      expect(await registry.isStrategy(mockContract1.address)).to.equal(true);
      expect(await registry.isStrategy(strategyAddress)).to.equal(true);
      expect(await registry.isStrategy(mockContract3.address)).to.equal(false);
    })

    it("rejects adds and removes by non manager", async function () {
      await expect(registry.connect(user).addStrategy(mockContract3.address)).to.be.revertedWith("!manager");
      await expect(registry.connect(user).removeStrategy(mockContract1.address)).to.be.revertedWith("!manager");
    })

    it("can remove strategies", async function () {
      await registry.connect(governor2).removeStrategy(mockContract1.address);
      await vault.deleteStrategy(strategyAddress);
      expect(await registry.numStrategies()).to.equal(0);
      expect(await registry.isStrategy(mockContract1.address)).to.equal(false);
    })
  })

  describe("treasury", function () {
    it("starts as the zero address", async function () {
      expect(await registry.treasury()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      await registry.connect(governor2).setTreasury(treasury.address);
      expect(await registry.treasury()).to.equal(treasury.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setTreasury(treasury.address)).to.be.revertedWith("!governance");
    })
  })

  describe("locker", function () {
    it("starts as the zero address", async function () {
      expect(await registry.locker()).to.equal(ZERO_ADDRESS);
    })

    it("can be set", async function () {
      await registry.connect(governor2).setLocker(locker.address);
      expect(await registry.locker()).to.equal(locker.address);
    })

    it("cannot be set by non governor", async function () {
      await expect(registry.connect(user).setLocker(locker.address)).to.be.revertedWith("!governance");
    })
  })

  describe("strategies", function () {
    it("starts with no strategies", async function () {
      expect(await registry.numStrategies()).to.equal(0);
    })

    it("can add strategies", async function () {
      await registry.connect(governor2).addStrategy(mockContract1.address);
    })

    it("returns strategies", async function () {
      expect(await registry.numStrategies()).to.equal(1);
      expect(await registry.getStrategy(0)).to.equal(mockContract1.address);
      expect(await registry.isStrategy(mockContract1.address)).to.equal(true);
      expect(await registry.isStrategy(mockContract2.address)).to.equal(false);
    })

    it("rejects adds and removes by non manager", async function () {
      await expect(registry.connect(user).addStrategy(mockContract2.address)).to.be.revertedWith("!manager");
      await expect(registry.connect(user).removeStrategy(mockContract1.address)).to.be.revertedWith("!manager");
    })

    it("can remove strategies", async function () {
      await registry.connect(governor2).removeStrategy(mockContract1.address);
      expect(await registry.numStrategies()).to.equal(0);
      expect(await registry.isStrategy(mockContract1.address)).to.equal(false);
    })
  })

  describe("products", function () {
    it("starts with no products", async function () {
      expect(await registry.numProducts()).to.equal(0);
    })

    it("can add products", async function () {
      let tx = await registry.connect(governor2).addProduct(mockContract1.address);
      expect(await registry.numProducts()).to.equal(1);
    })

    it("returns products", async function () {
      expect(await registry.numProducts()).to.equal(1);
      expect(await registry.getProduct(0)).to.equal(mockContract1.address);
      expect(await registry.isProduct(mockContract1.address)).to.equal(true);
      expect(await registry.isProduct(mockContract3.address)).to.equal(false);
    })

    it("rejects adds and removes by non manager", async function () {
      await expect(registry.connect(user).addProduct(mockContract3.address)).to.be.revertedWith("!governance");
      await expect(registry.connect(user).removeProduct(mockContract1.address)).to.be.revertedWith("!governance");
    })

    it("can remove products", async function () {
      await registry.connect(governor2).removeProduct(mockContract1.address);
      expect(await registry.numStrategies()).to.equal(0);
      expect(await registry.isProduct(mockContract1.address)).to.equal(false);
    })
  })

  describe("policies", function () {
    before(async function () {
      await registry.connect(governor2).addProduct(product.address);
    })

    it("starts with no policies", async function () {
      expect(await registry.numPolicies()).to.equal(0);
    })

    it("can add policies", async function () {
      await registry.connect(governor2).addPolicy(mockContract1.address);
      let tx = await product.createPolicy();
      let events = (await tx.wait()).events;
      expect(events).to.exist;
      //expect(events.length).to.not.equal(0); // TODO: get typescript to stop flagging unnecessarily
      if(events && events.length > 0 && events[0].args && events[0].args.policy){
        policyAddress = events[0].args.policy;
      }else{
        expect(true).to.equal(false);
      }
    })

    it("returns policies", async function () {
      expect(await registry.numPolicies()).to.equal(2);
      expect(await registry.getPolicy(0)).to.equal(mockContract1.address);
      expect(await registry.getPolicy(1)).to.equal(policyAddress);
      expect(await registry.isPolicy(mockContract1.address)).to.equal(true);
      expect(await registry.isPolicy(policyAddress)).to.equal(true);
      expect(await registry.isPolicy(mockContract3.address)).to.equal(false);
    })

    it("rejects adds and removes by non manager", async function () {
      await expect(registry.connect(user).addPolicy(mockContract3.address)).to.be.revertedWith("!manager");
      await expect(registry.connect(user).removePolicy(mockContract1.address)).to.be.revertedWith("!manager");
    })

    it("can remove policies", async function () {
      await registry.connect(governor2).removePolicy(mockContract1.address);
      await product.deletePolicy(policyAddress);
      expect(await registry.numStrategies()).to.equal(0);
      expect(await registry.isPolicy(mockContract1.address)).to.equal(false);
    })
  })
});
