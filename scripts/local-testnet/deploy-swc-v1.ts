// deploys v1 of solace wallet coverage

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Deployer, CoverageDataProviderV2, Registry, RiskManager, SolaceCoverProduct } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2Contract } from "./../create2Contract";
import { create2ContractStashed } from "../create2ContractStashed";
import { abiEncodeArgs } from "../../test/utilities/setStorage";
import { logContractAddress } from "./../utils";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

// TODO: set address
const DAI_ADDRESS                  = "";

// wallet addresses
let   COVERAGE_DATA_PROVIDER_UPDATER_ADDRESS  = "0xc5683ea4888DadfdE421a1E593DfbD36290D63AB"; // the bot address to update underwriting pool values
const PREMIUM_POOL_ADDRESS                    = "0x501ace27A074471F099ffFeC008Bd1b151c7F7dE"; // will be set in registry
let   COVER_PROMOTION_ADMIN_ADDRESS           = "0x4770becA2628685F7C45102c7a649F921df71C70"; // will be set in registry
const PREMIUM_COLLECTOR_ADDRESS               = "0xF321be3577B1AcB436869493862bA18bDde6fc39"; // the bot address that will be set in registry

// contract addresses
const REGISTRY_ADDRESS               = "0x501ACe0f576fc4ef9C0380AA46A578eA96b85776";
const RISK_MANAGER_ADDRESS           = "0x501AcEf9020632a71CB25CFa9F554252eB51732b";
const COVERAGE_DATA_PROVIDER_ADDRESS = "0x501ACe6D80111c9B54FA36EEC5f1B213d7F24770";
const SOLACE_COVER_PRODUCT_ADDRESS   = "0x501ACEbe29eabc346779BcB5Fd62Eaf6Bfb5320E";

const DOMAIN_NAME = "Solace.fi-SolaceCoverProduct";
const VERSION = "1";

let artifacts: ArtifactImports;

let coverageDataProvider: CoverageDataProviderV2;
let registry: Registry;
let riskManager: RiskManager;
let solaceCoverProduct: SolaceCoverProduct;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(DAI_ADDRESS);
  await expectDeployed(REGISTRY_ADDRESS);
  registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;

  // deploy contracts
  await deployCoverageDataProvider();
  await deployRiskManager();
  await deploySolaceCoverProduct();

  // log addresses
  await logAddresses();
}

async function deployCoverageDataProvider() {
  if (await isDeployed(COVERAGE_DATA_PROVIDER_ADDRESS)) {
    coverageDataProvider = (await ethers.getContractAt(artifacts.CoverageDataProviderV2.abi, COVERAGE_DATA_PROVIDER_ADDRESS)) as CoverageDataProviderV2;
  } else {
    console.log("Deploying Coverage Data Provider");
    const res = await create2Contract(deployer, artifacts.CoverageDataProviderV2, [signerAddress], {}, "", DEPLOYER_CONTRACT_ADDRESS);

    coverageDataProvider = (await ethers.getContractAt(artifacts.CoverageDataProviderV2.abi, res.address)) as CoverageDataProviderV2;

    console.log(`Deployed Coverage Data Provider to ${coverageDataProvider.address}`);

    console.log("Registering Coverage Data Provider");
    let tx = await registry.connect(deployer).set(["coverageDataProvider"], [coverageDataProvider.address], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);

    console.log("Setting Underwriting Pool Updater");
    tx = await coverageDataProvider.connect(deployer).addUpdater(COVERAGE_DATA_PROVIDER_UPDATER_ADDRESS, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);

    console.log("Setting Underwriting Pool Amounts");
    tx = await coverageDataProvider.connect(deployer).set(["mainnet"], [BN.from("1000000000000000000").mul(8450000)], networkSettings.overrides); // 8.45M USD
    await tx.wait(networkSettings.confirmations);
  }
}

async function deployRiskManager() {
  if (await isDeployed(RISK_MANAGER_ADDRESS)) {
    riskManager = (await ethers.getContractAt(artifacts.RiskManager.abi, RISK_MANAGER_ADDRESS)) as RiskManager;
  } else {
    console.log("Deploying Risk Manager");
    const res = await create2Contract(deployer, artifacts.RiskManager, [signerAddress, registry.address], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    riskManager = (await ethers.getContractAt(artifacts.RiskManager.abi, res.address)) as unknown as RiskManager;
    console.log(`Deployed Risk Manager to ${riskManager.address}`);
  }
  const { success } = await registry.tryGet("riskManager");
  if (!success && await registry.governance() == signerAddress) {
    console.log("Registering Risk Manager");
    let tx = await registry.connect(deployer).set(["riskManager"], [riskManager.address], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
}

async function deploySolaceCoverProduct() {
  if (await isDeployed(SOLACE_COVER_PRODUCT_ADDRESS)) {
    solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProduct.abi, SOLACE_COVER_PRODUCT_ADDRESS)) as SolaceCoverProduct;
  } else {
    console.log("Deploying Solace Cover Product");
    await create2ContractStashed(
      "SolaceCoverProduct",
      "scripts/contract_deploy_bytecodes/products/SolaceCoverProduct.txt",
      "stash/contracts_processed/products/SolaceCoverProduct.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      SOLACE_COVER_PRODUCT_ADDRESS,
      abiEncodeArgs([signerAddress, REGISTRY_ADDRESS, DOMAIN_NAME, VERSION])
    );
    solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProduct.abi, SOLACE_COVER_PRODUCT_ADDRESS)) as SolaceCoverProduct;
    console.log(`Deployed Solace Cover Product to ${solaceCoverProduct.address}`);

    console.log('Risk Manager - Adding Soteria as Risk Strategy');
    let tx = await riskManager.connect(deployer).addRiskStrategy(solaceCoverProduct.address, networkSettings.overrides)
    await tx.wait(networkSettings.confirmations);

    console.log('Risk Manager - Setting Soteria as an active strategy');
    tx = await riskManager.connect(deployer).setStrategyStatus(solaceCoverProduct.address, 1, networkSettings.overrides)
    await tx.wait(networkSettings.confirmations);

    console.log('Risk Manager - Setting Soteria weight allocation');
    tx = await riskManager.connect(deployer).setWeightAllocation(solaceCoverProduct.address, 1000, networkSettings.overrides)
    await tx.wait(networkSettings.confirmations);

    console.log('Risk Manager - Adding Soteria as a cover limit updater');
    tx = await riskManager.connect(deployer).addCoverLimitUpdater(solaceCoverProduct.address, networkSettings.overrides)
    await tx.wait(networkSettings.confirmations);
  }

  let { success } = await registry.tryGet("solaceCoverProduct");
  if (!success && await registry.governance() == signerAddress) {
    console.log("Registering Solace Cover Product");
    let tx = await registry.connect(deployer).set(["solaceCoverProduct"], [solaceCoverProduct.address], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }

  ({ success } = await registry.tryGet("coverPromotionAdmin"));
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Cover Promotion Admin");
    let tx = await registry.connect(deployer).set(["coverPromotionAdmin"], [COVER_PROMOTION_ADMIN_ADDRESS], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }

  ({ success } = await registry.tryGet("premiumPool"));
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Premium Pool");
    let tx = await registry.connect(deployer).set(["premiumPool"], [PREMIUM_POOL_ADDRESS], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }

  ({ success } = await registry.tryGet("premiumCollector"));
  if ( !success && await registry.governance() == signerAddress) {
    console.log("Registering Premium Collector");
    let tx = await registry.connect(deployer).set(["premiumCollector"], [PREMIUM_COLLECTOR_ADDRESS], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("Registry", registry.address);
  logContractAddress("RiskManager", riskManager.address);
  logContractAddress("CoverageDataProvider", coverageDataProvider.address);
  logContractAddress("SolaceCoverProduct", solaceCoverProduct.address);
  logContractAddress("Dai", DAI_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
