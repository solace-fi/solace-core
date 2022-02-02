// Intended to deploy Soteria

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.LOCALHOST_ACCOUNTS || '[]')[0], provider);
import { create2Contract } from "./create2Contract";

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "../test/utilities/artifact_importer";
import { Deployer, Solace, SolaceCoverProduct, Registry, RiskManager, CoverageDataProvider, MockErc20Permit } from "../typechain";

import { BytesLike, constants } from "ethers";

const ONE_ETHER = BN.from("1000000000000000000");
const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const DOMAIN_NAME = "Solace.fi-SolaceCoverProduct";
const VERSION = "1";

const REGISTRY_ADDRESS                  = "";
const DEPLOYER_CONTRACT_ADDRESS         = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const SOLACE_ADDRESS                    = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const DAI_ADDRESS                       = "0x6B175474E89094C44Da98b954EedeAC495271d0F"

const PREMIUM_POOL_ADDRESS              = "0x88fdDCe9aD3C5A12c06B597F0948F8EafFC3862d"; // premium pool
const COVER_PROMOTION_ADMIN_ADDRESS     = "0x0000000000000000000000000000000000000001";
const PREMIUM_COLLECTOR_ADDRESS         = "0x0000000000000000000000000000000000000001";

const RISK_MANAGER_ADDRESS              = "";
const COVERAGE_DATA_PROVIDER_ADDRESS    = "";
const SOTERIA_COVERAGE_PRODUCT_ADDRESS  = "";

let artifacts: ArtifactImports;

let solace: Solace;
let registry: Registry;
let dai: MockErc20Permit
let deployerContract: Deployer;;
let riskManager: RiskManager;
let coverageDataProvider: CoverageDataProvider;
let solaceCoverProduct: SolaceCoverProduct;

let signerAddress: string;
let tellerImplementationAddress: string;
let tokenAddresses: any = {};

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  if((await provider.getNetwork()).chainId == 31337) { // testnet
    console.log('funding')
    var [funder] = await hardhat.ethers.getSigners();
    let tx = await funder.sendTransaction({to: signerAddress, value: BN.from("100000000000000000000")});
    await tx.wait();
  }

  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;

  await deployRegistry();
  await deploySOLACE();
  await deployDai();
  await deployRiskManager();
  await deployCoverageDataProvider();
  await deploySolaceCoverProduct();

  await logAddresses();
}

async function deployRegistry() {
  if(!!REGISTRY_ADDRESS) {
    registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    registry = (await deployContract(deployer, artifacts.Registry, [signerAddress])) as Registry;
    console.log(`Deployed Registry to ${registry.address}`);
  }
}

async function deploySOLACE() {
  if(!!SOLACE_ADDRESS) {
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    solace = (await deployContract(deployer, artifacts.SOLACE, [signerAddress])) as Solace;
    console.log(`Deployed SOLACE to ${solace.address}`);
  }
  const { success } = await registry.tryGet("solace");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering SOLACE");
    let tx = await registry.connect(deployer).set(["solace"], [solace.address]);
    await tx.wait();
  }
}

async function deployDai() {
  if(!!DAI_ADDRESS) {
    dai = (await ethers.getContractAt(artifacts.MockERC20Permit.abi, DAI_ADDRESS)) as MockErc20Permit;
  } else {
    console.log("Deploying DAI");
    dai = (await deployContract(deployer, artifacts.MockERC20Permit)) as MockErc20Permit;
    console.log(`Deployed DAI to ${dai.address}`);
  }
  const { success } = await registry.tryGet("dai");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering DAI");
    let tx = await registry.connect(deployer).set(["dai"], [dai.address]);
    await tx.wait();
  }
}

async function deployRiskManager() {
  if(!!RISK_MANAGER_ADDRESS) {
    riskManager = (await ethers.getContractAt(artifacts.RiskManager.abi, RISK_MANAGER_ADDRESS)) as RiskManager;
  } else {
    console.log("Deploying Risk Manager");
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [signerAddress, registry.address])) as RiskManager;
    console.log(`Deployed Risk Manager to ${riskManager.address}`);
  }
  const { success } = await registry.tryGet("riskManager");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Risk Manager");
    let tx = await registry.connect(deployer).set(["riskManager"], [riskManager.address]);
    await tx.wait();
  }
}

async function deployCoverageDataProvider() {
  if(!!COVERAGE_DATA_PROVIDER_ADDRESS) {
    coverageDataProvider = (await ethers.getContractAt(artifacts.CoverageDataProvider.abi, COVERAGE_DATA_PROVIDER_ADDRESS)) as CoverageDataProvider;
  } else {
    console.log("Deploying Coverage Data Provider");
    coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [signerAddress])) as CoverageDataProvider;
    console.log(`Deployed Coverage Data Provider to ${coverageDataProvider.address}`);
  }
  const { success } = await registry.tryGet("coverageDataProvider");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Coverage Data Provider");
    let tx = await registry.connect(deployer).set(["coverageDataProvider"], [coverageDataProvider.address]);
    await tx.wait();
  }
}

async function deploySolaceCoverProduct() {
  if(!!SOTERIA_COVERAGE_PRODUCT_ADDRESS) {
    solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProduct.abi, SOTERIA_COVERAGE_PRODUCT_ADDRESS)) as SolaceCoverProduct;
  } else {
    console.log("Deploying Solace Cover Product");
    solaceCoverProduct = (await deployContract(deployer, artifacts.SolaceCoverProduct, [signerAddress, registry.address, DOMAIN_NAME, VERSION])) as SolaceCoverProduct;
    console.log(`Deployed Solace Cover Product to ${solaceCoverProduct.address}`);
  }

  let { success } = await registry.tryGet("solaceCoverProduct");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Solace Cover Product");
    let tx = await registry.connect(deployer).set(["solaceCoverProduct"], [solaceCoverProduct.address]);
    await tx.wait();
  }

  ({ success } = await registry.tryGet("coverPromotionAdmin"));
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Cover Promotion Admin");
    let tx = await registry.connect(deployer).set(["coverPromotionAdmin"], [COVER_PROMOTION_ADMIN_ADDRESS]);
    await tx.wait();
  }

  ({ success } = await registry.tryGet("premiumPool"));
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Premium Pool");
    let tx = await registry.connect(deployer).set(["premiumPool"], [PREMIUM_POOL_ADDRESS]);
    await tx.wait();
  }

  ({ success } = await registry.tryGet("premiumCollector"));
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Premium Collector");
    let tx = await registry.connect(deployer).set(["premiumCollector"], [PREMIUM_COLLECTOR_ADDRESS]);
    await tx.wait();
  }

  console.log('Risk Manager - Add Soteria as Risk Strategy');
  let tx = await riskManager.connect(deployer).addRiskStrategy(solaceCoverProduct.address)
  await tx.wait();

  console.log('Risk Manager - Add Soteria as an active strategy');
  tx = await riskManager.connect(deployer).setStrategyStatus(solaceCoverProduct.address, 1)
  await tx.wait();

  console.log('Risk Manager - Set Soteria weight');
  tx = await riskManager.connect(deployer).setWeightAllocation(solaceCoverProduct.address, 1000)
  await tx.wait();

  console.log('Risk Manager - Add Soteria as a cover limit updated');
  tx = await riskManager.connect(deployer).addCoverLimitUpdater(solaceCoverProduct.address)
  await tx.wait();
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("Registry", registry.address);
  logContractAddress("SOLACE", solace.address);
  logContractAddress("DAI", dai.address);
  logContractAddress("Risk Manager", riskManager.address);
  logContractAddress("Coverage Data Provider", coverageDataProvider.address);
  logContractAddress("Solace Cover Product", solaceCoverProduct.address);
  console.log("\nnote that these token addresses may not be the same as the tokens deployed in part 1");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
