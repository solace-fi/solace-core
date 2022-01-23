import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Wallet, BigNumber as BN, Contract, utils} from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { burnBlocks, burnBlocksUntil } from "../utilities/time";
import { encodeAddresses } from "../utilities/positionDescription";

import { PolicyManager, MockProductV2, Registry, RiskManager, PolicyDescriptorV2, Vault, Weth9, MockRiskStrategy, CoverageDataProvider, ProductFactory } from "../../typechain";

describe("PolicyManager", function() {
  let artifacts: ArtifactImports;
  const [deployer, governor, user, user2, premiumPool, walletProduct1, walletProduct2, walletProduct3, positionContract, solace, solaceUsdcPool, priceOracle] = provider.getWallets();

  // contracts
  let policyManager: PolicyManager;
  let mockProduct: MockProductV2;
  let vault: Vault;
  let registry: Registry;
  let coverageDataProvider: CoverageDataProvider;
  let riskManager: RiskManager;
  let riskStrategy: MockRiskStrategy;
  let baseRiskStrategy: MockRiskStrategy;
  let riskStrategyFactory: Contract;
  let policyDescriptor: PolicyDescriptorV2;
  let weth: Weth9;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const name = "Solace Policy";
  const symbol = "SPT";
  const expirationBlock = 20000000;
  const coverLimit = BN.from("100000000000000"); 
  const price = 11044; // price in wei for block/wei
  const chainId = 31337;
  const STRATEGY_STATUS_ACTIVE = 1;
  const STRATEGY_WEIGHT_ALLOCATION = 1000;
  const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("MockProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
  const DOMAIN_NAME = "Solace.fi-MockProduct";

  before(async function() {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // deploy registry contract
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    await registry.connect(governor).set(["premiumPool"],[premiumPool.address])

    // deploy policy manager
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address, registry.address])) as PolicyManager;
    await registry.connect(governor).set(["policyManager"],[policyManager.address])

    // deploy weth
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    await registry.connect(governor).set(["weth"],[weth.address])

    // deploy vault contract
    vault = (await deployContract(deployer,artifacts.Vault,[governor.address,registry.address])) as Vault;

    // deploy risk manager contract
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;

    // deploy nft descriptor
    policyDescriptor = (await deployContract(deployer, artifacts.PolicyDescriptorV2, [governor.address])) as PolicyDescriptorV2;

    // deploy coverage provider contract    
    await registry.connect(governor).set(["solace"],[solace.address])

    coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [governor.address, registry.address, priceOracle.address, solaceUsdcPool.address])) as CoverageDataProvider;

    await registry.connect(governor).set(["vault"],[vault.address])
    await registry.connect(governor).set(["riskManager"],[riskManager.address])

    await governor.sendTransaction({ to: vault.address, value: BN.from("9000000000000000000000") });

    await registry.connect(governor).set(["coverageDataProvider"],[coverageDataProvider.address])

    // deploy risk strategy factory
    let riskStrategyContractFactory = await ethers.getContractFactory("RiskStrategyFactory", deployer);
    riskStrategyFactory = (await riskStrategyContractFactory.deploy(registry.address, governor.address));
    await riskStrategyFactory.deployed();
  
    // create risk strategy for products
    baseRiskStrategy = (await deployContract(deployer, artifacts.MockRiskStrategy)) as MockRiskStrategy;
    let tx = await riskStrategyFactory.createRiskStrategy(baseRiskStrategy.address, [walletProduct1.address, walletProduct2.address, walletProduct3.address],[1,2,3],[10000,10000,10000],[1,1,1]);
    
    let events = (await tx.wait())?.events;
    if (events && events.length > 0) {
      let event = events[0];
      riskStrategy = await ethers.getContractAt(artifacts.MockRiskStrategy.abi, event?.args?.["deployment"]) as MockRiskStrategy;
    } else {
      throw "no risk strategy deployment!";
    }
    // add and enable risk strategy
    await riskManager.connect(governor).addRiskStrategy(riskStrategy.address);
    await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, STRATEGY_STATUS_ACTIVE);
    await riskManager.connect(governor).setWeightAllocation(riskStrategy.address, STRATEGY_WEIGHT_ALLOCATION);
    await riskManager.connect(governor).addCoverLimitUpdater(policyManager.address);
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
      await expect(policyManager.connect(user).setPendingGovernance(user.address)).to.be.revertedWith("!governance");
    });
    it("can set new governance", async function() {
      let tx = await policyManager.connect(governor).setPendingGovernance(deployer.address);
      expect(tx).to.emit(policyManager, "GovernancePending").withArgs(deployer.address);
      expect(await policyManager.governance()).to.equal(governor.address);
      expect(await policyManager.pendingGovernance()).to.equal(deployer.address);
    });
    it("rejects governance transfer by non governor", async function() {
      await expect(policyManager.connect(user).acceptGovernance()).to.be.revertedWith("!pending governance");
    });
    it("can transfer governance", async function() {
      let tx = await policyManager.connect(deployer).acceptGovernance();
      await expect(tx)
        .to.emit(policyManager, "GovernanceTransferred")
        .withArgs(governor.address, deployer.address);
      expect(await policyManager.governance()).to.equal(deployer.address);
      expect(await policyManager.pendingGovernance()).to.equal(ZERO_ADDRESS);

      await policyManager.connect(deployer).setPendingGovernance(governor.address);
      await policyManager.connect(governor).acceptGovernance();
    });

    it("rejects setting new nft token descriptor by non governor", async function() {
      await expect(policyManager.connect(user).setPolicyDescriptor(policyDescriptor.address)).to.be.revertedWith("!governance");
    });
    it("can set new nft token descriptor", async function() {
      let tx = await policyManager.connect(governor).setPolicyDescriptor(policyDescriptor.address);
      expect(tx).to.emit(policyManager, "PolicyDescriptorSet").withArgs(policyDescriptor.address);
      expect(await policyManager.connect(governor).policyDescriptor()).to.equal(policyDescriptor.address);
    });
  });

  describe("products", function() {
    it("starts with no products", async function() {
      expect(await policyManager.numProducts()).to.equal(0);
    });
    it("cannot add zero address", async function () {
      await expect(policyManager.connect(governor).addProduct(ZERO_ADDRESS)).to.be.revertedWith("zero product");
    })
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
      await expect(policyManager.connect(user).createPolicy(user.address, coverLimit, expirationBlock, price, positionContract.address, riskStrategy.address)).to.be.revertedWith("product inactive");
    });

    it("can create policy", async function() {
      let tx = await policyManager.connect(walletProduct2).createPolicy(user.address, coverLimit, expirationBlock, price, positionDescription, riskStrategy.address);
      expect(tx).to.emit(policyManager, "PolicyCreated").withArgs(1);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.eq(coverLimit);
      expect(await riskManager.activeCoverLimit()).to.equal(coverLimit);
      expect(await riskManager.minCapitalRequirement()).to.equal(coverLimit);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(coverLimit);
    });

    it("can get policy info", async function() {
      // policyInfo()
      let policyInfo1 = await policyManager.policyInfo(1);
      expect(policyInfo1.product).to.equal(walletProduct2.address);
      expect(policyInfo1.positionDescription).to.equal(positionDescription);
      expect(policyInfo1.coverLimit).to.equal(coverLimit);
      expect(policyInfo1.expirationBlock).to.equal(expirationBlock);
      expect(policyInfo1.price).to.equal(price);
      expect(policyInfo1.riskStrategy).to.equal(riskStrategy.address);
      // getPolicyInfo()
      let policyInfo2 = await policyManager.getPolicyInfo(1);
      expect(policyInfo2.policyholder).to.equal(user.address);
      expect(policyInfo2.product).to.equal(walletProduct2.address);
      expect(policyInfo2.positionDescription).to.equal(positionDescription);
      expect(policyInfo2.coverLimit).to.equal(coverLimit);
      expect(policyInfo2.expirationBlock).to.equal(expirationBlock);
      expect(policyInfo2.price).to.equal(price);
      expect(policyInfo2.riskStrategy).to.equal(riskStrategy.address);
      // individual
      expect(await policyManager.getPolicyholder(1)).to.equal(user.address);
      expect(await policyManager.getPolicyProduct(1)).to.equal(walletProduct2.address);
      expect(await policyManager.getPositionDescription(1)).to.equal(positionContract.address.toLowerCase());
      expect(await policyManager.getPolicyExpirationBlock(1)).to.equal(expirationBlock);
      expect(await policyManager.policyIsActive(1)).to.equal(true);
      expect(await policyManager.getPolicyCoverLimit(1)).to.equal(coverLimit);
      expect(await policyManager.getPolicyPrice(1)).to.equal(price);
      expect(await policyManager.exists(1)).to.equal(true);
      expect(await policyManager.getPolicyRiskStrategy(1)).to.equal(riskStrategy.address);
      // invalid
      await expect(policyManager.policyInfo(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyInfo(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyholder(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyProduct(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPositionDescription(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyExpirationBlock(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyCoverLimit(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyPrice(2)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.getPolicyRiskStrategy(2)).to.be.revertedWith("query for nonexistent token");
      expect(await policyManager.exists(2)).to.equal(false);
    });
    it("cannot update nonexistent policy", async function() {
      await expect(policyManager.setPolicyInfo(2, coverLimit, expirationBlock, price, positionContract.address, riskStrategy.address)).to.be.revertedWith("query for nonexistent token");
      await expect(policyManager.updatePolicyInfo(2, coverLimit, expirationBlock, price, riskStrategy.address)).to.be.revertedWith("query for nonexistent token");
    });
    it("product cannot update other products policy", async function() {
      await expect(policyManager.setPolicyInfo(1, coverLimit, expirationBlock, price, positionContract.address, riskStrategy.address)).to.be.revertedWith("wrong product");
      await expect(policyManager.updatePolicyInfo(1, coverLimit, expirationBlock, price, riskStrategy.address)).to.be.revertedWith("wrong product");
    });
    it("can set policy info", async function() {
      let policyDescription = "0xabcd1234";
      // users must provide valid risk strategy
      let tx = await policyManager.connect(walletProduct2).setPolicyInfo(1, 1, 2, 3, policyDescription, riskStrategy.address);
      expect(tx).to.emit(policyManager, "PolicyUpdated").withArgs(1);
      expect(await policyManager.getPolicyholder(1)).to.equal(user.address);
      expect(await policyManager.getPolicyProduct(1)).to.equal(walletProduct2.address);
      expect(await policyManager.getPositionDescription(1)).to.equal(policyDescription);
      expect(await policyManager.getPolicyCoverLimit(1)).to.equal(1);
      expect(await policyManager.getPolicyExpirationBlock(1)).to.equal(2);
      expect(await policyManager.getPolicyPrice(1)).to.equal(3);
      expect(await policyManager.policyIsActive(1)).to.equal(false);
      expect(await policyManager.exists(1)).to.equal(true);
      expect(await riskManager.activeCoverLimit()).to.equal(1);
      expect(await riskManager.minCapitalRequirement()).to.equal(1);
      expect(await policyManager.getPolicyRiskStrategy(1)).to.equal(riskStrategy.address);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(1);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(1);
    });
    it("can update policy info with same parameters", async function () {
      let tx = await policyManager.connect(walletProduct2).updatePolicyInfo(1, 1, 2, 3, riskStrategy.address);
      expect(tx).to.emit(policyManager, "PolicyUpdated").withArgs(1);
      expect(await policyManager.getPolicyholder(1)).to.equal(user.address);
      expect(await policyManager.getPolicyProduct(1)).to.equal(walletProduct2.address);
      expect(await policyManager.getPolicyCoverLimit(1)).to.equal(1);
      expect(await policyManager.getPolicyExpirationBlock(1)).to.equal(2);
      expect(await policyManager.getPolicyPrice(1)).to.equal(3);
      expect(await policyManager.policyIsActive(1)).to.equal(false);
      expect(await policyManager.exists(1)).to.equal(true);
      expect(await riskManager.activeCoverLimit()).to.equal(1);
      expect(await riskManager.minCapitalRequirement()).to.equal(1);
      expect(await policyManager.getPolicyRiskStrategy(1)).to.equal(riskStrategy.address);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(1);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(1);
    })
    it("can list my policies", async function() {
      expect(await policyManager.listTokensOfOwner(deployer.address)).to.deep.equal([]);
      expect(await policyManager.listTokensOfOwner(user.address)).to.deep.equal([BN.from(1)]);
      await policyManager.connect(walletProduct2).createPolicy(user.address, coverLimit, expirationBlock, price, positionContract.address, riskStrategy.address);
      expect(await policyManager.listTokensOfOwner(user.address)).to.deep.equal([BN.from(1), BN.from(2)]);
      expect(await riskManager.activeCoverLimit()).to.equal(coverLimit.add(1));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverLimit.add(1));
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(coverLimit.add(1));
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(coverLimit.add(1));
    });
    it("cannot directly burn policy", async function() {
      await expect(policyManager.connect(user).burn(1)).to.be.revertedWith("wrong product");
      await expect(policyManager.connect(user).burn(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("can burn policy via product", async function() {
      let tx = await policyManager.connect(walletProduct2).createPolicy(user.address, coverLimit, expirationBlock, price, positionContract.address, riskStrategy.address);
      expect(tx).to.emit(policyManager, "PolicyCreated").withArgs(3);
      expect(await riskManager.activeCoverLimit()).to.equal(coverLimit.mul(2).add(1));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverLimit.mul(2).add(1));
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(coverLimit.mul(2).add(1));
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(coverLimit.mul(2).add(1));

      await policyManager.connect(walletProduct2).burn(1); // burn tokenID 1
      expect(await policyManager.exists(1)).to.equal(false);
      expect(await riskManager.activeCoverLimit()).to.equal(coverLimit.mul(2));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverLimit.mul(2));
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(coverLimit.mul(2));
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(coverLimit.mul(2));
      await policyManager.connect(walletProduct2).burn(2); // burn tokenID 2
      expect(await policyManager.exists(2)).to.equal(false);
      expect(await riskManager.activeCoverLimit()).to.equal(coverLimit);
      expect(await riskManager.minCapitalRequirement()).to.equal(coverLimit);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(coverLimit);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(coverLimit);
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
      expect(await policyManager.listTokensOfOwner(user.address)).to.deep.equal([policyID]);
      expect(await policyManager.listTokensOfOwner(user2.address)).to.deep.equal([]);
      await policyManager.connect(user).transferFrom(user.address, user2.address, policyID);
      expect(await policyManager.ownerOf(policyID)).to.equal(user2.address);
      expect(await policyManager.getPolicyholder(policyID)).to.equal(user2.address);
      expect((await policyManager.getPolicyInfo(policyID)).policyholder).to.equal(user2.address);
      expect(await policyManager.listTokensOfOwner(user.address)).to.deep.equal([]);
      expect(await policyManager.listTokensOfOwner(user2.address)).to.deep.equal([policyID]);
      await policyManager.connect(user2).approve(user.address, policyID);
      await policyManager.connect(user).transferFrom(user2.address, user.address, policyID);
      expect(await policyManager.ownerOf(policyID)).to.equal(user.address);
      expect(await policyManager.getPolicyholder(policyID)).to.equal(user.address);
      expect((await policyManager.getPolicyInfo(policyID)).policyholder).to.equal(user.address);
      expect(await policyManager.listTokensOfOwner(user.address)).to.deep.equal([policyID]);
      expect(await policyManager.listTokensOfOwner(user2.address)).to.deep.equal([]);
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
      await policyManager.connect(walletProduct2).createPolicy(user.address, coverLimit, expBlock, price, positionContract.address, riskStrategy.address);
      expect(await policyManager.exists(policyID)).to.be.true;
      expect(await policyManager.policyIsActive(policyID)).to.be.true;
      expect(await policyManager.policyHasExpired(policyID)).to.be.false;
      expect(await riskManager.activeCoverLimit()).to.equal(coverLimit.mul(2));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverLimit.mul(2));
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(coverLimit.mul(2));
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(coverLimit.mul(2));
    });
    it("post-expiration", async function() {
      await burnBlocks(12);
      expect(await policyManager.exists(policyID)).to.be.true;
      expect(await policyManager.policyIsActive(policyID)).to.be.false;
      expect(await policyManager.policyHasExpired(policyID)).to.be.true;
      expect(await riskManager.activeCoverLimit()).to.equal(coverLimit.mul(2));
      expect(await riskManager.minCapitalRequirement()).to.equal(coverLimit.mul(2));
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(coverLimit.mul(2));
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(coverLimit.mul(2));
    });
    it("post-burn", async function() {
      await policyManager.connect(walletProduct2).burn(policyID); // burn tokenID 1
      expect(await policyManager.exists(policyID)).to.be.false;
      expect(await policyManager.policyIsActive(policyID)).to.be.false;
      expect(await policyManager.policyHasExpired(policyID)).to.be.false;
      expect(await riskManager.activeCoverLimit()).to.equal(coverLimit);
      expect(await riskManager.minCapitalRequirement()).to.equal(coverLimit);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(coverLimit);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(coverLimit);
    });
  });

  describe("updateActivePolicies", async function() {
    before(async function() {
      let productFactory: ProductFactory;

      // Send extra ETH to governor to avoid insufficient funds error in `npx hardhat coverage --testfiles test/PolicyManager.test.ts`
      const balancePriceOracle = await priceOracle.getBalance()
      await priceOracle.sendTransaction({to: governor.address, value: balancePriceOracle.mul(999).div(1000)})

      // deploy product factory
      productFactory = (await deployContract(deployer, artifacts.ProductFactory)) as ProductFactory;

      // deploy base product
      let coverageProduct = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;
     
      // redeploy risk manager
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
      await registry.connect(governor).set(["riskManager"], [riskManager.address])
//
      // redeploy policy manager
      policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address, registry.address])) as PolicyManager;
      await registry.connect(governor).set(["policyManager"], [policyManager.address])

      // add products
      let tx1 = await productFactory.createProduct(coverageProduct.address, governor.address, registry.address, 0, 100000000000, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
      let events1 = (await tx1.wait())?.events;
      if(events1 && events1.length > 0) {
        let event1 = events1[0];
        mockProduct = await ethers.getContractAt(artifacts.MockProductV2.abi, event1?.args?.["deployment"]) as MockProductV2;
      } else throw "no deployment";

      await mockProduct.connect(governor).setPrice(1);
      await policyManager.connect(governor).addProduct(mockProduct.address);

      // deploy new risk strategy for the product
      let tx = await riskStrategyFactory.createRiskStrategy(baseRiskStrategy.address, [mockProduct.address],[1],[10000],[1]);
      let events = (await tx.wait())?.events;
      if (events && events.length > 0) {
        let event = events[0];
        riskStrategy = await ethers.getContractAt(artifacts.MockRiskStrategy.abi, event?.args?.["deployment"]) as MockRiskStrategy;
      } else {
        throw "no risk strategy deployment!";
      }

      // add and enable risk strategy
      await riskManager.connect(governor).addRiskStrategy(riskStrategy.address);
      await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, STRATEGY_STATUS_ACTIVE);
      await riskManager.connect(governor).setWeightAllocation(riskStrategy.address, STRATEGY_WEIGHT_ALLOCATION);
      await riskManager.connect(governor).addCoverLimitUpdater(policyManager.address);

    });

    it("can update active policies", async function() {
      // create policies
      // policy 1 expires
      await mockProduct.connect(user)._buyPolicy(user.address, 0b00001, 110, positionContract.address, riskStrategy.address);
      expect(await riskManager.activeCoverLimit()).to.equal(0b00001);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(0b00001);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b00001);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(0b00001);

      // policy 2 expires
      await mockProduct.connect(user)._buyPolicy(user.address, 0b00010, 120, positionContract.address, riskStrategy.address);
      expect(await riskManager.activeCoverLimit()).to.equal(0b00011);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b00011);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(0b00011);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(0b00011);

      // policy 3 expires but is not updated
      await mockProduct.connect(user)._buyPolicy(user.address, 0b00100, 130, positionContract.address, riskStrategy.address);
      expect(await riskManager.activeCoverLimit()).to.equal(0b00111);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b00111);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(0b00111);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(0b00111);

      // policy 4 does not expire
      await mockProduct.connect(user)._buyPolicy(user.address, 0b01000, 200, positionContract.address, riskStrategy.address);
      expect(await riskManager.activeCoverLimit()).to.equal(0b01111);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b01111);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(0b01111);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(0b01111);

      // policy 5 is canceled
      await mockProduct.connect(user)._buyPolicy(user.address, 0b10000, 300, positionContract.address, riskStrategy.address);
      expect(await riskManager.activeCoverLimit()).to.equal(0b11111);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b11111);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(0b11111);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(0b11111);

      // pass time
      await burnBlocks(150);
      await mockProduct.connect(user).cancelPolicy(5);
      expect(await riskManager.activeCoverLimit()).to.equal(0b01111);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b01111);
      expect(await riskManager.activeCoverLimitPerStrategy(riskStrategy.address)).to.equal(0b01111);
      expect(await riskManager.minCapitalRequirementPerStrategy(riskStrategy.address)).to.equal(0b01111);

      // update policies
      await policyManager.updateActivePolicies([1, 2, 4, 5, 999]);
      expect(await policyManager.exists(1)).to.be.false;
      expect(await policyManager.exists(2)).to.be.false;
      expect(await policyManager.exists(3)).to.be.true;
      expect(await policyManager.exists(4)).to.be.true;
      expect(await policyManager.exists(5)).to.be.false;
      expect(await mockProduct.activeCoverLimit()).to.equal(0b01100);
      expect(await riskManager.activeCoverLimit()).to.equal(0b01100);
      expect(await riskManager.minCapitalRequirement()).to.equal(0b01100);
    });
  });

  describe("tokenURI", function() {
    let policyId:BN;
    before(async function(){
        let productFactory: ProductFactory;

        // deploy product factory
        productFactory = (await deployContract(deployer, artifacts.ProductFactory)) as ProductFactory;

        // deploy base product
        let coverageProduct = (await deployContract(deployer, artifacts.MockProductV2)) as MockProductV2;
      
        // redeploy risk manager
        riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
        await registry.connect(governor).set(["riskManager"], [riskManager.address])
      
        // redeploy policy manager
        policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address, registry.address])) as PolicyManager;
        await registry.connect(governor).set(["policyManager"], [policyManager.address])

        // add products
        let tx1 = await productFactory.createProduct(coverageProduct.address, governor.address, registry.address, 0, 100000000000, SUBMIT_CLAIM_TYPEHASH, DOMAIN_NAME, "1");
        let events1 = (await tx1.wait())?.events;
        if(events1 && events1.length > 0) {
          let event1 = events1[0];
          mockProduct = await ethers.getContractAt(artifacts.MockProductV2.abi, event1?.args?.["deployment"]) as MockProductV2;
        } else throw "no deployment";

        await mockProduct.connect(governor).setPrice(1);
        await policyManager.connect(governor).addProduct(mockProduct.address);

        // deploy new risk strategy for the product
        let tx = await riskStrategyFactory.createRiskStrategy(baseRiskStrategy.address, [mockProduct.address],[1],[10000],[1]);
        let events = (await tx.wait())?.events;
        if (events && events.length > 0) {
          let event = events[0];
          riskStrategy = await ethers.getContractAt(artifacts.MockRiskStrategy.abi, event?.args?.["deployment"]) as MockRiskStrategy;
        } else {
          throw "no risk strategy deployment!";
        }

        // add and enable risk strategy
        await riskManager.connect(governor).addRiskStrategy(riskStrategy.address);
        await riskManager.connect(governor).setStrategyStatus(riskStrategy.address, STRATEGY_STATUS_ACTIVE);
        await riskManager.connect(governor).setWeightAllocation(riskStrategy.address, STRATEGY_WEIGHT_ALLOCATION);
        await riskManager.connect(governor).addCoverLimitUpdater(policyManager.address);
        await policyManager.connect(governor).setPolicyDescriptor(policyDescriptor.address);
        await mockProduct.connect(user)._buyPolicy(user.address, 5000, 110, positionContract.address,riskStrategy.address);
        policyId = await policyManager.totalPolicyCount();
    });

    it("can get tokenURI", async function() {
        let tokenURI = `https://paclas.solace.fi/policy/?chainid=${chainId}&policyid=${policyId}`;
        expect(await policyManager.tokenURI(policyId)).to.equal(tokenURI);
        let baseURI = `https://paclas.solace.fi/policy/?chainid=${chainId}&policyid=`;
        expect(await policyDescriptor.baseURI()).to.equal(baseURI);
    });
    it("non governor cannot change base", async function () {
      await expect(policyDescriptor.connect(deployer).setBaseURI("asdf")).to.be.revertedWith("!governance");
    });
    it("can change base", async function () {
      let newBase = "https://new.site/";
      let tx = await policyDescriptor.connect(governor).setBaseURI(newBase);
      expect(tx).to.emit(policyDescriptor, "BaseUriSet").withArgs(newBase);
      let tokenURI = `https://new.site/${policyId}`;
      expect(await policyManager.tokenURI(policyId)).to.equal(tokenURI);
      let baseURI = `https://new.site/`;
      expect(await policyDescriptor.baseURI()).to.equal(baseURI);
    });
    it("cannot get tokenURI for nonexistant policy id", async function() {
      await expect(policyManager.tokenURI(1000)).to.be.revertedWith("query for nonexistent token");
    });
  });
});