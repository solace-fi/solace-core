import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, CurveProduct, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { toBytes32, setStorageAt } from "./utilities/setStorage";
import { encodeAddresses } from "./utilities/positionDescription";
import { oneToken } from "./utilities/math";

if(process.env.FORK_NETWORK === "mainnet"){
  describe("CurveProduct", function () {
    const [deployer, governor, user, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: CurveProduct;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const maxCoverPerUser = BN.from("10000000000000000000"); // 10 Ether in wei
    const cancelFee = BN.from("100000000000000000"); // 0.1 Ether in wei
    const price = 11044; // 2.60%/yr

    const coverAmount = BN.from("10000000000000000000"); // 10 eth
    const blocks = BN.from(threeDays);
    const expectedPremium = BN.from("2137014000000000");

    const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
    const ADDRESS_PROVIDER = "0x0000000022D53366457F9d5E68Ec105046FC4383";
    const THREEPOOL_TOKEN = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
    const THREEPOOL_POOL = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
    const REAL_USER = "0x5dcd83cf2dd90a4c7e1c189e74ec7dc072ad78e1";
    const BALANCE = BN.from("72907407389975430");

    before(async function () {
      artifacts = await import_artifacts();
      await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

      registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
      await registry.connect(governor).setWeth(weth.address);
      vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
      await registry.connect(governor).setVault(vault.address);
      claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, registry.address])) as ClaimsEscrow;
      await registry.connect(governor).setClaimsEscrow(claimsEscrow.address);
      treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
      await registry.connect(governor).setTreasury(treasury.address);
      policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
      await registry.connect(governor).setPolicyManager(policyManager.address);
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
      await registry.connect(governor).setRiskManager(riskManager.address);

      // deploy Curve Product
      product = (await deployContract(
        deployer,
        artifacts.CurveProduct,
        [
          governor.address,
          policyManager.address,
          treasury.address,
          ADDRESS_PROVIDER,
          minPeriod,
          maxPeriod
        ]
      )) as CurveProduct;

      await vault.connect(deployer).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1, 11044, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as curve address provider", async function () {
        expect(await product.coveredPlatform()).to.equal(ADDRESS_PROVIDER);
        expect(await product.addressProvider()).to.equal(ADDRESS_PROVIDER);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(user).setCoveredPlatform(user.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.addressProvider()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(ADDRESS_PROVIDER);
      });
    });

    describe("implementedFunctions", function() {
      it("can get product name", async function () {
        expect(await product.name()).to.equal("Curve");
      });
    });
  })
}
