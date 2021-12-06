import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet , utils} from "ethers";
import { Contract, ContractFactory } from "@ethersproject/contracts";
import { toBytes32 } from "./utilities/setStorage";

import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { RiskManager, Registry, Vault, Weth9, PolicyManager, MockProductV2, MockRiskStrategy, CoverageDataProvider, ProductFactory, RiskStrategy } from "../typechain";

describe("RiskStrategy", function () {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, product1, product2, product3, solace, solaceUsdcPool, priceOracle] = provider.getWallets();

  // solace contracts
  let registry: Registry;
  let vault: Vault;
  let policyManager: PolicyManager;
  let riskManager: RiskManager;
  let riskStrategy: RiskStrategy;
  let baseRiskStrategy: RiskStrategy;
  let riskStrategyFactory: Contract;
  let riskStrategyContractFactory: ContractFactory;
  let coverageDataProvider: CoverageDataProvider;
  let productFactory: ProductFactory;
  let product4: MockProductV2;
  let product5: MockProductV2;
  let product6: MockProductV2;

  let weth: Weth9;

  // vars
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const NO_WEIGHT = BN.from("4294967295"); // max uint32
  const MAX_PRICE = BN.from("16777215"); // max uint24
  const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("MockProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
  const DOMAIN_NAME = "Solace.fi-MockProduct"; 

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    weth = (await deployContract(deployer,artifacts.WETH)) as Weth9;
    await registry.connect(governor).setWeth(weth.address);
    vault = (await deployContract(deployer,artifacts.Vault,[deployer.address,registry.address])) as Vault;
    await registry.connect(governor).setVault(vault.address);
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
    await registry.connect(governor).setPolicyManager(policyManager.address);
    await registry.connect(governor).setSolace(solace.address);
    coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry.address, priceOracle.address, solaceUsdcPool.address])) as CoverageDataProvider;
    await registry.connect(governor).setCoverageDataProvider(coverageDataProvider.address);
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
    await registry.connect(governor).setRiskManager(riskManager.address);

    // deploy product factory
    productFactory = (await deployContract(deployer, artifacts.ProductFactory)) as ProductFactory;

    // create product4
    let baseProduct4 = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;
    let tx1 = await productFactory.createProduct(baseProduct4.address, governor.address, registry.address, 0, 1000, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
    let events1 = (await tx1.wait())?.events;
    if(events1 && events1.length > 0) {
      let event1 = events1[0];
      product4 = await ethers.getContractAt(artifacts.MockProductV2.abi, event1?.args?.["deployment"]) as MockProductV2;
    } else throw "no deployment";

    // create product5
    let baseProduct5 = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;
    let tx2 = await productFactory.createProduct(baseProduct5.address, governor.address, registry.address, 0, 1000, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
    let events2 = (await tx2.wait())?.events;
    if(events2 && events2.length > 0) {
      let event2 = events2[0];
      product5 = await ethers.getContractAt(artifacts.MockProductV2.abi, event2?.args?.["deployment"]) as MockProductV2;
    } else throw "no deployment";

    // create product6
    let baseProduct6 = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;
    let tx3 = await productFactory.createProduct(baseProduct6.address, governor.address, registry.address, 0, 1000, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
    let events3 = (await tx3.wait())?.events;
    if(events3 && events3.length > 0) {
      let event3 = events3[0];
      product6 = await ethers.getContractAt(artifacts.MockProductV2.abi, event3?.args?.["deployment"]) as MockProductV2;
    } else throw "no deployment";
 
    // create base risk strategy
    baseRiskStrategy = (await deployContract(deployer, artifacts.MockRiskStrategy)) as MockRiskStrategy;

    await policyManager.connect(governor).addProduct(product1.address);
    await policyManager.connect(governor).addProduct(product2.address);
    await policyManager.connect(governor).addProduct(product3.address);
    await policyManager.connect(governor).addProduct(product4.address);
    await policyManager.connect(governor).addProduct(product5.address);
    await policyManager.connect(governor).addProduct(product6.address);
  });

  describe("deployment", function () {
    let mockStrategyFactory: Contract;
    let mockRegistry: Registry;

    before(async function() {
      // deploy mock registry
      mockRegistry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      expect(await mockRegistry.policyManager()).to.equal(ZERO_ADDRESS);

      // get risk strategy factory contract
      riskStrategyContractFactory = await ethers.getContractFactory("RiskStrategyFactory", deployer);

      // mock risk strategy factory
      mockStrategyFactory = await riskStrategyContractFactory.deploy(mockRegistry.address, governor.address);
    });

    it("risk strategy factory should revert if governance is zero address", async function() {
      await expect(riskStrategyContractFactory.deploy(mockRegistry.address, ZERO_ADDRESS)).to.be.revertedWith("zero address governance");
    });

    it("risk strategy factory should revert if registry is zero address", async function() {
      await expect(riskStrategyContractFactory.deploy(ZERO_ADDRESS, governor.address)).to.be.revertedWith("zero address registry");
    });

    it("risk strategy factory should be deployed", async function() {
      riskStrategyFactory = await riskStrategyContractFactory.deploy(registry.address, governor.address);
      expect(riskStrategyFactory.connect(user).bytecode).to.not.null;
    });

    it("cannot create if risk manager is zero address", async function () {
      await expect(mockStrategyFactory.createRiskStrategy(baseRiskStrategy.address, [product1.address],[1],[10000],[1])).to.be.revertedWith("zero address risk manager");
    });

    it("cannot create2 if risk manager is zero address", async function () {
      await expect(mockStrategyFactory.create2RiskStrategy(baseRiskStrategy.address,toBytes32(0), [product1.address],[1],[10000],[1])).to.be.revertedWith("zero address risk manager");
    });

    it("can deploy with create", async function () {
      let tx = await riskStrategyFactory.createRiskStrategy(baseRiskStrategy.address, [product4.address, product5.address, product6.address],[1,2,3],[10000,10000,10000],[1,1,1]);

      let events = (await tx.wait())?.events;
      if (events && events.length > 0) {
        let event = events[0];
        riskStrategy = await ethers.getContractAt(artifacts.MockRiskStrategy.abi, event?.args?.["deployment"]) as MockRiskStrategy;
      } else {
        throw "no risk strategy deployment!";
      }
      expect(tx).emit(riskStrategyFactory, "StrategyCreated").withArgs(events[0]["args"]["deployment"], deployer.address);
      expect(await riskStrategy.connect(user).numProducts()).to.eq(3);
      expect(await riskStrategy.connect(user).product(1)).to.equal(product4.address);
    });

    it("can deploy with create2", async function () {
      let create2RiskStrategy1: MockRiskStrategy;
      let create2RiskStrategy2: MockRiskStrategy;
      let predictedAddress1 = await riskStrategyFactory.calculateMinimalProxyDeploymentAddress(baseRiskStrategy.address, toBytes32(0));
      let tx = await riskStrategyFactory.create2RiskStrategy(baseRiskStrategy.address, toBytes32(0), [product1.address],[1],[10000],[1]);
      let events = (await tx.wait())?.events;
  
      if (events && events.length > 0) {
        let event = events[0];
        create2RiskStrategy1 = await ethers.getContractAt(artifacts.MockRiskStrategy.abi, event?.args?.["deployment"]) as MockRiskStrategy;
      } else {
        throw "no risk strategy deployment!";
      }
      expect(create2RiskStrategy1.address).to.equal(predictedAddress1);

      let predictedAddress2 = await riskStrategyFactory.calculateMinimalProxyDeploymentAddress(baseRiskStrategy.address, toBytes32(1));
      let tx2 = await riskStrategyFactory.create2RiskStrategy(baseRiskStrategy.address, toBytes32(1), [product1.address],[1],[10000],[1]);
      let events2 = (await tx2.wait())?.events;
  
      if (events2 && events2.length > 0) {
        let event2 = events2[0];
        create2RiskStrategy2 = await ethers.getContractAt(artifacts.MockRiskStrategy.abi, event2?.args?.["deployment"]) as MockRiskStrategy;
      } else {
        throw "no risk strategy deployment!";
      }
      expect(create2RiskStrategy1.address).to.not.equal(create2RiskStrategy2.address);
      expect(create2RiskStrategy2.address).to.equal(predictedAddress2);
    });

    it("cannot reinitialize risk strategy", async function() {
      await expect(riskStrategy.connect(governor).initialize(governor.address, riskManager.address, deployer.address, [product1.address],[1],[10000],[1])).to.be.reverted;
    });
  });

  describe("governance", function () {
    it("starts with the correct governor", async function () {
      expect(await riskStrategy.governance()).to.equal(governor.address);
    });
    it("rejects setting new governance by non governor", async function () {
      await expect(riskStrategy.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function () {
      let tx = await riskStrategy.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(riskStrategy, "GovernancePending").withArgs(deployer.address);
      expect(await riskStrategy.governance()).to.equal(governor.address);
      expect(await riskStrategy.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function () {
      await expect(riskStrategy.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function () {
      let tx = await riskStrategy.connect(deployer).acceptGovernance();
      await expect(tx).to.emit(riskStrategy, "GovernanceTransferred").withArgs(governor.address, deployer.address);
      expect(await riskStrategy.governance()).to.equal(deployer.address);
      expect(await riskStrategy.pendingGovernance()).to.equal(ZERO_ADDRESS);
      await riskStrategy.connect(deployer).setPendingGovernance(governor.address);
      await riskStrategy.connect(governor).acceptGovernance();
    });
  });

  describe("strategy params", function () {
    before(async function() {
      riskStrategyContractFactory = await ethers.getContractFactory("RiskStrategyFactory", deployer);
      riskStrategyFactory = await riskStrategyContractFactory.deploy(registry.address, governor.address);
      expect(riskStrategyFactory.connect(user).bytecode).to.not.null;

      let tx = await riskStrategyFactory.createRiskStrategy(baseRiskStrategy.address, [product4.address, product5.address, product6.address],[1,2,3],[10000,10000,10000],[1,1,1]);
      let events = (await tx.wait())?.events;
      if (events && events.length > 0) {
        let event = events[0];
        riskStrategy = await ethers.getContractAt(artifacts.MockRiskStrategy.abi, event?.args?.["deployment"]) as MockRiskStrategy;
      } else {
        throw "no risk strategy deployment!";
      }
      expect(tx).emit(riskStrategyFactory, "StrategyCreated").withArgs(events[0]["args"]["deployment"], deployer.address);
    });

    it("should start with defaults", async function () {
      expect(await riskStrategy.status()).to.be.false;
      expect(await riskStrategy.strategist()).to.equal(deployer.address);
      expect(await riskStrategy.numProducts()).to.equal(3);
      expect(await riskStrategy.product(0)).to.equal(ZERO_ADDRESS);
      await expect(riskStrategy.productRiskParams(product1.address)).to.be.revertedWith("product inactive");
      expect(await riskStrategy.weightSum()).to.equal(6);
      expect(await riskStrategy.weightAllocation()).to.equal(NO_WEIGHT);
      expect(await riskStrategy.productIsActive(ZERO_ADDRESS)).to.be.false;
  
      let products = [product4.address, product5.address, product6.address];
      for (let i = 1; i < 3; i++) {
        expect(await riskStrategy.productIsActive(products[i-1])).to.be.true;
        expect(await riskStrategy.product(i)).to.equal(products[i-1]);
        let params = await riskStrategy.productRiskParams(products[i-1]);
        expect(params.price).to.equal(10000);
        expect(params.weight).to.equal(i);
        expect(params.divisor).to.equal(1);
      }
    });

    it("should reject change by non governor", async function () {
      await expect(riskStrategy.connect(user).addProduct(product1.address, 1, 11044, 10)).to.be.revertedWith("!governance");
      await expect(riskStrategy.connect(user).setProductParams([product1.address],[1],[11044],[10])).to.be.revertedWith("!governance");
      await expect(riskStrategy.connect(user).removeProduct(product1.address)).to.be.revertedWith("!governance");
    });

    it("should reject invalid inputs", async function () {
      await expect(riskStrategy.connect(governor).addProduct(ZERO_ADDRESS, 1, 11044, 10)).to.be.revertedWith("invalid product risk param");
      await expect(riskStrategy.connect(governor).addProduct(product1.address, 0, 11044, 10)).to.be.revertedWith("invalid weight risk param");
      await expect(riskStrategy.connect(governor).addProduct(product1.address, 1, 0, 10)).to.be.revertedWith("invalid price risk param");
      await expect(riskStrategy.connect(governor).addProduct(product1.address, 1, 11044, 0)).to.be.revertedWith("invalid divisor risk param");
      await expect(riskStrategy.connect(governor).addProduct(product1.address, BN.from(2).pow(32), 11044, 1)).to.be.reverted; // overflow
      await expect(riskStrategy.connect(governor).setProductParams([product1.address], [1,2], [11044], [10])).to.be.revertedWith("length mismatch");
      await expect(riskStrategy.connect(governor).setProductParams([product1.address], [1], [11044,22088], [10])).to.be.revertedWith("length mismatch");
      await expect(riskStrategy.connect(governor).setProductParams([product1.address], [1], [11044], [10,20])).to.be.revertedWith("length mismatch");
      await expect(riskStrategy.connect(governor).setProductParams([product1.address,product1.address], [1,2], [11044,11044], [10,10])).to.be.revertedWith("duplicate product");
      await expect(riskStrategy.connect(governor).setProductParams([ZERO_ADDRESS], [1], [11044], [10])).to.be.revertedWith("invalid product risk param");
      await expect(riskStrategy.connect(governor).setProductParams([product1.address], [0], [11044], [10])).to.be.revertedWith("invalid weight risk param");
      await expect(riskStrategy.connect(governor).setProductParams([product1.address], [1], [0], [10])).to.be.revertedWith("invalid price risk param");
      await expect(riskStrategy.connect(governor).setProductParams([product1.address], [1], [11044], [0])).to.be.revertedWith("invalid divisor risk param");
      await expect(riskStrategy.connect(governor).setProductParams([product1.address], [BN.from(2).pow(32)], [11044], [10])).to.be.reverted; // overflow
    });

    it("should be set with setProductParams()", async function () {
      let tx = await riskStrategy.connect(governor).setProductParams([product1.address,product2.address],[3,5],[11044,22088],[10,20]);
      expect(tx).to.emit(riskStrategy, "ProductRiskParamsSetByGovernance").withArgs(product1.address, 3, 11044, 10);
      expect(tx).to.emit(riskStrategy, "ProductRiskParamsSetByGovernance").withArgs(product2.address, 5, 22088, 20);
      expect(await riskStrategy.numProducts()).to.equal(2);
      expect(await riskStrategy.product(1)).to.equal(product1.address);
      expect(await riskStrategy.product(2)).to.equal(product2.address);
      expect(await riskStrategy.productIsActive(product1.address)).to.be.true;
      expect(await riskStrategy.productIsActive(product2.address)).to.be.true;
      let params1 = await riskStrategy.productRiskParams(product1.address);
      expect(params1.weight).to.equal(3);
      expect(params1.price).to.equal(11044);
      expect(params1.divisor).to.equal(10);
      let params2 = await riskStrategy.productRiskParams(product2.address);
      expect(params2.weight).to.equal(5);
      expect(params2.price).to.equal(22088);
      expect(params2.divisor).to.equal(20);
      expect(await riskStrategy.weightSum()).to.equal(8);
    });

    it("should be set with addProduct()", async function () {
      let tx = await riskStrategy.connect(governor).addProduct(product3.address, 21, 10000, 1);
      expect(tx).to.emit(riskStrategy, "ProductAddedByGovernance").withArgs(product3.address, 21, 10000, 1);
      expect(await riskStrategy.numProducts()).to.equal(3);
      expect(await riskStrategy.product(3)).to.equal(product3.address);
      expect(await riskStrategy.productIsActive(product3.address)).to.be.true;
      let params3 = await riskStrategy.productRiskParams(product3.address);
      expect(params3.weight).to.equal(21);
      expect(params3.price).to.equal(10000);
      expect(params3.divisor).to.equal(1);
      expect(await riskStrategy.weightSum()).to.equal(29);
    });

    it("should delete old products with setProductParams()", async function () {
      let tx = await riskStrategy.connect(governor).setProductParams([product2.address,product3.address], [7,3], [1,2], [3,4]);
      expect(tx).to.emit(riskStrategy, "ProductRiskParamsSetByGovernance").withArgs(product1.address, 0, 0, 0);
      expect(tx).to.emit(riskStrategy, "ProductRiskParamsSetByGovernance").withArgs(product2.address, 0, 0, 0);
      expect(tx).to.emit(riskStrategy, "ProductRiskParamsSetByGovernance").withArgs(product2.address, 7, 1, 3);
      expect(tx).to.emit(riskStrategy, "ProductRiskParamsSetByGovernance").withArgs(product3.address, 3, 2, 4);
      expect(await riskStrategy.numProducts()).to.equal(2);
      expect(await riskStrategy.product(1)).to.equal(product2.address);
      expect(await riskStrategy.product(2)).to.equal(product3.address);
      expect(await riskStrategy.productIsActive(product1.address)).to.be.false;
      expect(await riskStrategy.productIsActive(product2.address)).to.be.true;
      expect(await riskStrategy.productIsActive(product3.address)).to.be.true;
      await expect(riskStrategy.productRiskParams(product1.address)).to.be.revertedWith("product inactive");
      let params2 = await riskStrategy.productRiskParams(product2.address);
      expect(params2.weight).to.equal(7);
      expect(params2.price).to.equal(1);
      expect(params2.divisor).to.equal(3);
      let params3 = await riskStrategy.productRiskParams(product3.address);
      expect(params3.weight).to.equal(3);
      expect(params3.price).to.equal(2);
      expect(params3.divisor).to.equal(4);
      expect(await riskStrategy.weightSum()).to.equal(10);
    });

    it("should change weight with addProduct()", async function () {
      let tx = await riskStrategy.connect(governor).addProduct(product3.address, 9, 5, 6);
      expect(tx).to.emit(riskStrategy, "ProductUpdatedByGovernance").withArgs(product3.address, 9, 5, 6);
      expect(await riskStrategy.numProducts()).to.equal(2);
      expect(await riskStrategy.product(2)).to.equal(product3.address);
      expect(await riskStrategy.product(3)).to.equal(ZERO_ADDRESS);
      expect(await riskStrategy.productIsActive(product1.address)).to.be.false;
      expect(await riskStrategy.productIsActive(product2.address)).to.be.true;
      expect(await riskStrategy.productIsActive(product3.address)).to.be.true;
      let params3 = await riskStrategy.productRiskParams(product3.address);
      expect(params3.weight).to.equal(9);
      expect(params3.price).to.equal(5);
      expect(params3.divisor).to.equal(6);
      expect(await riskStrategy.weightSum()).to.equal(16);
    });

    it("should remove products", async function () {
      // add product 1 / index 3
      await riskStrategy.connect(governor).addProduct(product1.address, 13, 1, 1);
      expect(await riskStrategy.product(3)).to.equal(product1.address);
      expect((await riskStrategy.productRiskParams(product1.address)).weight).to.equal(13);
      expect(await riskStrategy.weightSum()).to.equal(29);
      expect(await riskStrategy.numProducts()).to.equal(3);
      expect(await riskStrategy.product(1)).to.equal(product2.address);
      expect(await riskStrategy.product(2)).to.equal(product3.address);
      expect(await riskStrategy.product(3)).to.equal(product1.address);
      expect(await riskStrategy.productIsActive(product1.address)).to.be.true;
      expect(await riskStrategy.productIsActive(product2.address)).to.be.true;
      expect(await riskStrategy.productIsActive(product3.address)).to.be.true;
      // remove product 2 / index 1
      let tx1 = await riskStrategy.connect(governor).removeProduct(product2.address);
      expect(tx1).to.emit(riskStrategy, "ProductRemovedByGovernance").withArgs(product2.address);
      expect(await riskStrategy.product(1)).to.equal(product1.address);
      expect(await riskStrategy.product(2)).to.equal(product3.address);
      expect(await riskStrategy.product(3)).to.equal(ZERO_ADDRESS);
      expect((await riskStrategy.productRiskParams(product1.address)).weight).to.equal(13);
      await expect(riskStrategy.productRiskParams(product2.address)).to.be.revertedWith("product inactive");
      expect((await riskStrategy.productRiskParams(product3.address)).weight).to.equal(9);
      expect(await riskStrategy.weightSum()).to.equal(22);
      expect(await riskStrategy.numProducts()).to.equal(2);
      expect(await riskStrategy.productIsActive(product1.address)).to.be.true;
      expect(await riskStrategy.productIsActive(product2.address)).to.be.false;
      expect(await riskStrategy.productIsActive(product3.address)).to.be.true;
      // remove product 3 / index 2
      let tx2 = await riskStrategy.connect(governor).removeProduct(product3.address);
      expect(tx2).to.emit(riskStrategy, "ProductRemovedByGovernance").withArgs(product3.address);
      expect(await riskStrategy.product(1)).to.equal(product1.address);
      expect(await riskStrategy.product(2)).to.equal(ZERO_ADDRESS);
      expect(await riskStrategy.product(3)).to.equal(ZERO_ADDRESS);
      expect((await riskStrategy.productRiskParams(product1.address)).weight).to.equal(13);
      await expect(riskStrategy.productRiskParams(product2.address)).to.be.revertedWith("product inactive");
      await expect(riskStrategy.productRiskParams(product3.address)).to.be.revertedWith("product inactive");
      expect(await riskStrategy.weightSum()).to.equal(13);
      expect(await riskStrategy.numProducts()).to.equal(1);
      expect(await riskStrategy.productIsActive(product1.address)).to.be.true;
      expect(await riskStrategy.productIsActive(product2.address)).to.be.false;
      expect(await riskStrategy.productIsActive(product3.address)).to.be.false;
      await riskStrategy.connect(governor).removeProduct(product3.address); // remove non existent product
      // remove product 1 / index 1
      let tx3 = await riskStrategy.connect(governor).removeProduct(product1.address);
      expect(tx3).to.emit(riskStrategy, "ProductRemovedByGovernance").withArgs(product1.address);
      expect(await riskStrategy.product(1)).to.equal(ZERO_ADDRESS);
      expect(await riskStrategy.product(2)).to.equal(ZERO_ADDRESS);
      expect(await riskStrategy.product(3)).to.equal(ZERO_ADDRESS);
      await expect(riskStrategy.productRiskParams(product1.address)).to.be.revertedWith("product inactive");
      await expect(riskStrategy.productRiskParams(product2.address)).to.be.revertedWith("product inactive");
      await expect(riskStrategy.productRiskParams(product3.address)).to.be.revertedWith("product inactive");
      expect(await riskStrategy.weightSum()).to.equal(NO_WEIGHT);
      expect(await riskStrategy.numProducts()).to.equal(0);
      expect(await riskStrategy.productIsActive(product1.address)).to.be.false;
      expect(await riskStrategy.productIsActive(product2.address)).to.be.false;
      expect(await riskStrategy.productIsActive(product3.address)).to.be.false;
      await riskStrategy.connect(governor).removeProduct(product1.address); // remove non existent product
      // reset
      await riskStrategy.connect(governor).setProductParams([product2.address,product3.address], [7,9], [11044,22088], [10,20]);
      expect(await riskStrategy.productIsActive(product1.address)).to.be.false;
      expect(await riskStrategy.productIsActive(product2.address)).to.be.true;
      expect(await riskStrategy.productIsActive(product3.address)).to.be.true;
    });
  });


  describe("max cover amount", function () {
    before(async function() {
      // add and enable risk strategy
      await riskManager.connect(governor).addRiskStrategy(riskStrategy.address);
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, 1);
      await riskManager.connect(governor).setWeightAllocation(riskStrategy.address, 10000);
      expect(await riskStrategy.weightAllocation()).to.equal(10000);
      expect(await riskStrategy.status()).to.be.true;
    });

    it("no assets no cover", async function () {
      expect(await vault.totalAssets()).to.equal(0);
      expect(await riskStrategy.maxCover()).to.equal(0);
      expect(await riskStrategy.maxCoverPerProduct(product2.address)).to.equal(0);
      expect(await riskStrategy.maxCoverPerPolicy(product2.address)).to.equal(0);
    });

    it("can cover", async function () {
      let depositAmount = BN.from("1000000000000000000");
      await vault.connect(user).depositEth({value:depositAmount});
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await riskStrategy.maxCover()).to.equal(depositAmount);
      expect(await riskStrategy.maxCoverPerProduct(product1.address)).to.equal(0);
      expect(await riskStrategy.maxCoverPerProduct(product2.address)).to.equal(depositAmount.mul(7).div(16));
      expect(await riskStrategy.maxCoverPerProduct(product3.address)).to.equal(depositAmount.mul(9).div(16));
      await expect(riskStrategy.maxCoverPerPolicy(product1.address)).be.revertedWith("product inactive");
      expect(await riskStrategy.maxCoverPerPolicy(product2.address)).to.equal(depositAmount.mul(7).div(16).div(10));
      expect(await riskStrategy.maxCoverPerPolicy(product3.address)).to.equal(depositAmount.mul(9).div(16).div(20));
    });
  });

  describe("assess risk", function () {
    before(async function () {
      await riskStrategy.connect(governor).addProduct(product4.address, 1, 11044, 1);
    });

    it("cannot accept risk from unregistered products", async function () {
      await expect(riskStrategy.assessRisk(product5.address, 0, 0)).to.be.revertedWith("invalid product");
    });

    it("can accept risk at max cover per product", async function () {
      // new policy
      let mc = await riskStrategy.maxCoverPerProduct(product4.address);
      let ac = await product4.activeCoverAmount();
      expect(mc).to.be.gt(ac);
      let diff = mc.sub(ac);
      let risk = await riskStrategy.assessRisk(product4.address, 0, diff);
      expect(risk.acceptable).to.equal(true);
      expect(risk.price).to.equal(11044);
      // update policy
      let risk2 = await riskStrategy.assessRisk(product4.address, ac, mc);
      expect(risk2.acceptable).to.equal(true);
      expect(risk2.price).to.equal(11044);
    });

    it("cannot accept risk over max cover per product", async function () {
      // new policy
      let mc = await riskStrategy.maxCoverPerProduct(product4.address);
      let ac = await product4.activeCoverAmount();
      expect(mc).to.be.gt(ac);
      let diff = mc.sub(ac);
      let risk = await riskStrategy.assessRisk(product4.address, 0, diff.add(1));
      expect(risk.acceptable).to.equal(false);
      expect(risk.price).to.equal(11044);
      // update policy
      let risk2 = await riskStrategy.assessRisk(product4.address, mc.sub(10), mc.add(1));
      expect(risk2.acceptable).to.equal(false);
      expect(risk2.price).to.equal(11044);
    });

    it("can accept risk at max cover per policy", async function () {
      // set divisor to 10
      await riskStrategy.connect(governor).addProduct(product4.address, 1, 11044, 10);
      // new policy
      let mc = await riskStrategy.maxCoverPerPolicy(product4.address);
      expect(mc).to.be.gt(10);
      let risk = await riskStrategy.assessRisk(product4.address, 0, mc);
      expect(risk.acceptable).to.equal(true);
      expect(risk.price).to.equal(11044);
      // update policy
      let risk2 = await riskStrategy.assessRisk(product4.address, mc.sub(10), mc);
      expect(risk2.acceptable).to.equal(true);
      expect(risk2.price).to.equal(11044);
    });

    it("cannot accept risk over max cover per policy", async function () {
      // new policy
      let mc = await riskStrategy.maxCoverPerPolicy(product4.address);
      expect(mc).to.be.gt(10);
      let risk = await riskStrategy.assessRisk(product4.address, 0, mc.add(1));
      expect(risk.acceptable).to.equal(false);
      expect(risk.price).to.equal(11044);
      // update policy
      let risk2 = await riskStrategy.assessRisk(product4.address, mc.sub(10), mc.add(1));
      expect(risk2.acceptable).to.equal(false);
      expect(risk2.price).to.equal(11044);
    });
  });

  describe("sellable cover per product", function () {
    it("should revert on non products", async function () {
      await expect(riskStrategy.sellableCoverPerProduct(ZERO_ADDRESS)).to.be.reverted;
      await expect(riskStrategy.sellableCoverPerProduct(deployer.address)).to.be.reverted;
    });
    it("should be zero for inactive products", async function () {
      expect(await riskStrategy.sellableCoverPerProduct(product5.address));
    });
    it("should return correct amount", async function () {
      let mc = await riskStrategy.maxCoverPerProduct(product4.address);
      let ac = await product4.activeCoverAmount();
      expect(mc).to.be.gt(ac);
      let diff = mc.sub(ac);
      let sc = await riskStrategy.sellableCoverPerProduct(product4.address);
      expect(sc).to.equal(diff);
      // TODO: test case where mc >= ac
    });
  });
});
