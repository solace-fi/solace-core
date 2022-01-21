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
import { Deployer, Solace, Vault, SoteriaCoverageProduct, Registry, Weth9, PolicyManager, RiskManager, CoverageDataProvider, MockPriceOracle, MockSlp } from "../typechain";

import { BytesLike, constants } from "ethers";

const ONE_ETHER = BN.from("1000000000000000000");
const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const DOMAIN_NAME = "Solace.fi-SoteriaCoverageProduct";
const VERSION = "1";
const ONE_WEEK = BN.from("604800");
const maxRateNum = BN.from("1");
const maxRateDenom = BN.from("315360000"); // We are testing with maxRateNum and maxRateDenom that gives us an annual max rate of 10% coverLimit
const REFERRAL_REWARD_PERCENTAGE = BN.from("500") // 5% referral reward

const REGISTRY_ADDRESS                  = "";
const DEPLOYER_CONTRACT_ADDRESS         = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const SOLACE_ADDRESS                    = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const WETH_ADDRESS                      = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const PREMIUM_POOL_ADDRESS              = "0x88fdDCe9aD3C5A12c06B597F0948F8EafFC3862d"; // premium pool
const COVER_PROMOTION_ADMIN_ADDRESS     = "0x0000000000000000000000000000000000000001";
const PREMIUM_COLLECTOR_ADDRESS         = "0x0000000000000000000000000000000000000001";

const UNDERWRITING_POOL_ADDRESS         = "0x0000000000000000000000000000000000000001";      
const VAULT_ADDRESS                     = "0x501AcEe83a6f269B77c167c6701843D454E2EFA0";
const POLICY_MANAGER_ADDRESS            = "";
const RISK_MANAGER_ADDRESS              = "";
const AAVE_PRICE_ORACLE_ADDRESS         = "0xA50ba011c48153De246E5192C8f9258A2ba79Ca9";
const SOLACE_USDC_POOL_ADDRESS          = "0x9C051F8A6648a51eF324D30C235da74D060153aC";
const COVERAGE_DATA_PROVIDER_ADDRESS    = "";
const SOTERIA_COVERAGE_PRODUCT_ADDRESS  = "";

let artifacts: ArtifactImports;

let solace: Solace;
let registry: Registry;
let weth: Weth9;
let vault: Vault
let deployerContract: Deployer;;
let policyManager: PolicyManager;
let riskManager: RiskManager;
let priceOracle: MockPriceOracle;
let solaceUsdcPool: MockSlp;
let coverageDataProvider: CoverageDataProvider;
let soteriaCoverageProduct: SoteriaCoverageProduct;

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
  await deployWeth();
  await deployVault();
  await deployPolicyManager();
  await deployRiskManager();
  await deployCoverageDataProvider();
  await deploySoteriaCoverageProduct();

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

async function deployWeth() {
  if(!!WETH_ADDRESS) {
    weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;
  } else {
    console.log("Deploying WETH");
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    console.log(`Deployed WETH to ${weth.address}`);
  }
  const { success } = await registry.tryGet("weth");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering WETH");
    let tx = await registry.connect(deployer).set(["weth"], [weth.address]);
    await tx.wait();
  }
}

async function deployVault() {
  if(!!VAULT_ADDRESS) {
    vault = (await ethers.getContractAt(artifacts.Vault.abi, VAULT_ADDRESS)) as Vault;
  } else {
    console.log("Deploying Vault");
    vault = (await deployContract(deployer, artifacts.Vault, [signerAddress, registry.address])) as Vault;
    console.log(`Deployed Vault to ${vault.address}`);
  }
  const { success } = await registry.tryGet("vault");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Vault");
    let tx = await registry.connect(deployer).set(["vault"], [vault.address]);
    await tx.wait();
  }
}

async function deployPolicyManager() {
  if(!!POLICY_MANAGER_ADDRESS) {
    policyManager = (await ethers.getContractAt(artifacts.PolicyManager.abi, POLICY_MANAGER_ADDRESS)) as PolicyManager;
  } else {
    console.log("Deploying Policy Manager");
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [signerAddress, registry.address])) as PolicyManager;
    console.log(`Deployed Policy Manager to ${policyManager.address}`);
  }
  const { success } = await registry.tryGet("policyManager");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Policy Manager");
    let tx = await registry.connect(deployer).set(["policyManager"], [policyManager.address]);
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
    coverageDataProvider = (await deployContract(deployer, artifacts.CoverageDataProvider, [signerAddress, registry.address, AAVE_PRICE_ORACLE_ADDRESS, SOLACE_USDC_POOL_ADDRESS])) as CoverageDataProvider;
    console.log(`Deployed Coverage Data Provider to ${coverageDataProvider.address}`);
  }
  const { success } = await registry.tryGet("coverageDataProvider");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Coverage Data Provider");
    let tx = await registry.connect(deployer).set(["coverageDataProvider"], [coverageDataProvider.address]);
    await tx.wait();
  }
  console.log('Coverage Data Provider - Add underwriting pool');
  let tx1 = await coverageDataProvider.connect(deployer).addPools([UNDERWRITING_POOL_ADDRESS])
  await tx1.wait();
}

async function deploySoteriaCoverageProduct() {
  if(!!SOTERIA_COVERAGE_PRODUCT_ADDRESS) {
    soteriaCoverageProduct = (await ethers.getContractAt(artifacts.SoteriaCoverageProduct.abi, SOTERIA_COVERAGE_PRODUCT_ADDRESS)) as SoteriaCoverageProduct;
  } else {
    console.log("Deploying Soteria Coverage Product");
    soteriaCoverageProduct = (await deployContract(deployer, artifacts.SoteriaCoverageProduct, [signerAddress, registry.address, DOMAIN_NAME, VERSION])) as SoteriaCoverageProduct;
    console.log(`Deployed Soteria Coverage Product to ${soteriaCoverageProduct.address}`);
  }

  let { success } = await registry.tryGet("soteriaCoverageProduct");
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Soteria Coverage Product");
    let tx = await registry.connect(deployer).set(["soteriaCoverageProduct"], [soteriaCoverageProduct.address]);
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
  let tx = await riskManager.connect(deployer).addRiskStrategy(soteriaCoverageProduct.address)
  await tx.wait();

  console.log('Risk Manager - Add Soteria as an active strategy');
  tx = await riskManager.connect(deployer).setStrategyStatus(soteriaCoverageProduct.address, 1)
  await tx.wait();

  console.log('Risk Manager - Set Soteria weight');
  tx = await riskManager.connect(deployer).setWeightAllocation(soteriaCoverageProduct.address, 1000)
  await tx.wait();

  console.log('Risk Manager - Add Soteria as a cover limit updated');
  tx = await riskManager.connect(deployer).addCoverLimitUpdater(soteriaCoverageProduct.address)
  await tx.wait();

  console.log('Soteria Coverage Product - setMaxRateNum');
  tx = await soteriaCoverageProduct.connect(deployer).setMaxRateNum(maxRateNum)
  await tx.wait();

  console.log('Soteria Coverage Product - setMaxRateDenom');
  tx = await soteriaCoverageProduct.connect(deployer).setMaxRateDenom(maxRateDenom)
  await tx.wait();

  console.log('Soteria Coverage Product - setChargeCycle');
  tx = await soteriaCoverageProduct.connect(deployer).setChargeCycle(ONE_WEEK)
  await tx.wait();

  console.log('Soteria Coverage Product - setCooldownPeriod');
  tx = await soteriaCoverageProduct.connect(deployer).setCooldownPeriod(ONE_WEEK)
  await tx.wait();

  console.log('Soteria Coverage Product - setReferralRewardPercentage');
  tx = await soteriaCoverageProduct.connect(deployer).setReferralRewardPercentage(REFERRAL_REWARD_PERCENTAGE)
  await tx.wait();
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("Registry", registry.address);
  logContractAddress("SOLACE", solace.address);
  logContractAddress("WETH", weth.address);
  logContractAddress("Vault", vault.address);
  logContractAddress("Policy Manager", policyManager.address);
  logContractAddress("Risk Manager", riskManager.address);
  logContractAddress("Coverage Data Provider", coverageDataProvider.address);
  logContractAddress("Soteria Coverage Product", soteriaCoverageProduct.address);
  console.log("\nnote that these token addresses may not be the same as the tokens deployed in part 1");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
