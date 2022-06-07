// deploys v2 of solace wallet coverage

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
const BN = ethers.BigNumber;
import fs from "fs";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { create2Contract } from "./../create2Contract";

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Deployer, CoverageDataProviderV2, Registry, RiskManager, SolaceCoverProductV2 } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";

const DEPLOYER_CONTRACT_ADDRESS     = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";

const DAI_ADDRESS                   = "0xC709a8965eF42fD80b28F226E253283539ddBb12";
const FRAX_ADDRESS                  = "0x87Eba7597721C156240Ae7d8aE26e269118AFdca";

// wallet addresses
let   COVERAGE_DATA_PROVIDER_UPDATER_ADDRESS  = "0xc5683ea4888DadfdE421a1E593DfbD36290D63AB"; // the bot address to update underwriting pool values
const PREMIUM_POOL_ADDRESS                    = "0x501ace27A074471F099ffFeC008Bd1b151c7F7dE"; // will be set in registry
let   COVER_PROMOTION_ADMIN_ADDRESS           = "0x4770becA2628685F7C45102c7a649F921df71C70"; // will be set in registry
const PREMIUM_COLLECTOR_ADDRESS               = "0xF321be3577B1AcB436869493862bA18bDde6fc39"; // the bot address that will be set in registry

// contract addresses
const REGISTRY_ADDRESS               = "0x501ACE944a9679b30774Bb87F37a5Af5C4d4910b";
const COVERAGE_DATA_PROVIDER_ADDRESS = "0x501ace25625CadaF178558346A4603ceDb5a0A43";
const RISK_MANAGER_ADDRESS           = "0x501aceF459292B26CC165ebA2F5960b49c4EA990";
const SOLACE_COVER_PRODUCT_ADDRESS   = "0x501ACe36fF9078aEA9b9Cc43a4e329f01361764e";

const MESSAGE_BUS_ADDRESS                    = "0xb92d6933A024bcca9A21669a480C236Cbc973110";
const COVERAGE_DATA_PROVIDER_WRAPPER_ADDRESS = "0x501aceFd6Af9C83170F975595d9f1B9D9Eb044cF";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let coverageDataProvider: CoverageDataProviderV2;
let registry: Registry;
let riskManager: RiskManager;
let solaceCoverProduct: SolaceCoverProductV2;

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
  await expectDeployed(FRAX_ADDRESS);
  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;

  // deploy contracts
  await deployRegistry();
  await registerAddresses();
  await deployCoverageDataProvider();
  await deployRiskManager();
  await deploySolaceCoverProductV2();

  // log addresses
  await logAddresses();
}

async function deployRegistry() {
  if(await isDeployed(REGISTRY_ADDRESS)) {
    registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    const res = await create2Contract(deployer, artifacts.Registry, [signerAddress], {}, "", deployerContract.address);
    registry = (await ethers.getContractAt(artifacts.Registry.abi, res.address)) as unknown as Registry;
    //let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/utils/Registry.txt").toString().trim();
    //let tx = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    //await tx.wait(networkSettings.confirmations);
    //registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as unknown as Registry;
    console.log(`Deployed Registry to ${registry.address}`);
  }
}

async function registerAddresses() {
  // set default addresses
  if (await registry.governance() == signerAddress) {
    /*
    console.log("Setting 'DAI', 'premiumPool', 'coverPromotionAdmin', 'premiumCollector', 'riskManager', 'coverageDataProvider', 'solaceCoverProduct' addresses");
    let tx = await registry.connect(deployer).set(
      ["dai", "premiumPool", "coverPromotionAdmin", "premiumCollector", "riskManager", "coverageDataProvider", "solaceCoverProduct"],
      [DAI_ADDRESS, PREMIUM_POOL_ADDRESS, COVER_PROMOTION_ADMIN_ADDRESS, PREMIUM_COLLECTOR_ADDRESS, RISK_MANAGER_ADDRESS, COVERAGE_DATA_PROVIDER_ADDRESS, SOLACE_COVER_PRODUCT_ADDRESS], {...networkSettings.overrides, gasLimit: 1000000}
    );
    await tx.wait(networkSettings.confirmations)
    */
    /*
    console.log("Setting 'messagebus', 'coverageDataProviderWrapper' addresses");
    let tx2 = await registry.connect(deployer).set(
      ["messagebus", "coverageDataProviderWrapper"],
      [MESSAGE_BUS_ADDRESS, COVERAGE_DATA_PROVIDER_WRAPPER_ADDRESS],
      networkSettings.overrides
    );
    await tx2.wait(networkSettings.confirmations);
    */
    /*
    console.log("Setting 'DAI', 'FRAX' addresses");
    let tx = await registry.connect(deployer).set(
      ["dai", "frax"],
      [DAI_ADDRESS, FRAX_ADDRESS], {...networkSettings.overrides, gasLimit: 1000000}
    );
    await tx.wait(networkSettings.confirmations)
    */
  }
}

async function deployCoverageDataProvider() {
  if (await isDeployed(COVERAGE_DATA_PROVIDER_ADDRESS)) {
    coverageDataProvider = (await ethers.getContractAt(artifacts.CoverageDataProviderV2.abi, COVERAGE_DATA_PROVIDER_ADDRESS)) as CoverageDataProviderV2;
  } else {
    console.log("Deploying Coverage Data Provider");
    const res = await create2Contract(deployer, artifacts.CoverageDataProviderV2, [signerAddress], {}, "", deployerContract.address);

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
    const res = await create2Contract(deployer, artifacts.RiskManager, [signerAddress, registry.address], {}, "", deployerContract.address);
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

async function deploySolaceCoverProductV2() {
  const DOMAIN_NAME = "Solace.fi-SolaceCoverProductV2";
  const VERSION = "2";

  if (await isDeployed(SOLACE_COVER_PRODUCT_ADDRESS)) {
    solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProductV2.abi, SOLACE_COVER_PRODUCT_ADDRESS)) as SolaceCoverProductV2;
  } else {
    console.log("Deploying Solace Cover Product");
    const res = await create2Contract(deployer, artifacts.SolaceCoverProductV2, [signerAddress, registry.address, "frax", DOMAIN_NAME, VERSION], {}, "", deployerContract.address);
    solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProductV2.abi, res.address)) as SolaceCoverProductV2;

    //let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/products/SolaceCoverProductV2.txt").toString().trim();
    //let tx1 = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    //await tx1.wait(networkSettings.confirmations);
    //solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProductV2.abi, SOLACE_COVER_PRODUCT_ADDRESS)) as SolaceCoverProductV2;
    console.log(`Deployed Solace Cover Product to ${solaceCoverProduct.address}`);

    console.log('SWC - setting asset to DAI')
    let tx2 = await solaceCoverProduct.connect(deployer).setAsset("dai");
    await tx2.wait(networkSettings.confirmations);

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
  /*
  console.log('SWC - setting asset to DAI')
  let tx2 = await solaceCoverProduct.connect(deployer).setAsset("dai");
  await tx2.wait(networkSettings.confirmations);
  */
  console.log('SWC - adding supported chains');
  let tx3 = await solaceCoverProduct.connect(deployer).addSupportedChains(["1","137","250"]);
  await tx3.wait(networkSettings.confirmations);

  let { success, value } = await registry.tryGet("solaceCoverProduct");
  if ((value != SOLACE_COVER_PRODUCT_ADDRESS) && await registry.governance() == signerAddress) {
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
  logContractAddress("FRAX", FRAX_ADDRESS);
  logContractAddress("MessageBus", MESSAGE_BUS_ADDRESS);
  logContractAddress("CoverageDataProviderWrapper", COVERAGE_DATA_PROVIDER_WRAPPER_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
