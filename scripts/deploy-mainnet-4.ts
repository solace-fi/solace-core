import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { create2Contract } from "./create2Contract";

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Deployer, CoverageDataProvider, Registry, RiskManager, SolaceCoverProduct } from "../typechain";
import { isDeployed } from "../test/utilities/expectDeployed";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

const DAI_ADDRESS                  = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

// wallet addresses
let   COVERAGE_DATA_PROVIDER_UPDATER_ADDRESS  = "0xc5683ea4888DadfdE421a1E593DfbD36290D63AB"; // the bot address to update underwriting pool values
const PREMIUM_POOL_ADDRESS                    = "0x86392998F4c8950b312137E8d635b0cB003E92EA"; // will be set in registry
let   COVER_PROMOTION_ADMIN_ADDRESS           = "0x4770becA2628685F7C45102c7a649F921df71C70"; // will be set in registry
const PREMIUM_COLLECTOR_ADDRESS               = "0xF321be3577B1AcB436869493862bA18bDde6fc39"; // the bot address that will be set in registry

// contract addresses
const REGISTRY_V2_ADDRESS               = "0x501ACe0f576fc4ef9C0380AA46A578eA96b85776";
const RISK_MANAGER_V2_ADDRESS           = "0x501AcEf9020632a71CB25CFa9F554252eB51732b";
const COVERAGE_DATA_PROVIDER_ADDRESS    = "0x501ACE6C5fFf4d42EaC02357B6DD9b756E337355";
const SOLACE_COVER_PRODUCT_ADDRESS      = "0x501ACEbe29eabc346779BcB5Fd62Eaf6Bfb5320E";

const DOMAIN_NAME = "Solace.fi-SolaceCoverProduct";
const VERSION = "1";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let coverageDataProvider: CoverageDataProvider;
let registryV2: Registry;
let riskManagerV2: RiskManager;
let solaceCoverProduct: SolaceCoverProduct;

let signerAddress: string;
async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  if ((await provider.getNetwork()).chainId == 31337) { // testnet
    console.log('funding')
    var [funder] = await hardhat.ethers.getSigners();
    let tx = await funder.sendTransaction({to: signerAddress, value: BN.from("100000000000000000000")});
    await tx.wait();
  }

  // deploy the deployer contract
  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;

  // deploy contracts
  await deployRegistry()
  await deployCoverageDataProvider();
  await deployRiskManager();
  await deploySolaceCoverProduct();

  // log addresses
  await logAddresses();
}

async function deployRegistry() {
  if(await isDeployed(REGISTRY_V2_ADDRESS)) {
    registryV2 = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_V2_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry(V2)");
    const res = await create2Contract(deployer, artifacts.Registry, [signerAddress], {}, "", deployerContract.address);
    registryV2 = (await ethers.getContractAt(artifacts.Registry.abi, res.address)) as unknown as Registry;
    console.log(`Deployed Registry(V2) to ${registryV2.address}`);
  }

  // set default addresses
  if (await registryV2.governance() == signerAddress) {
    console.log("Setting 'DAI', 'premiumPool', 'coverPromotionAdmin', 'premiumCollector', 'riskManager', 'coverageDataProvider', 'solaceCoverProduct' addresses");
    let tx = await registryV2.connect(deployer).set(
          ["dai", "premiumPool", "coverPromotionAdmin", "premiumCollector", "riskManager", "coverageDataProvider", "solaceCoverProduct"],
          [DAI_ADDRESS, PREMIUM_POOL_ADDRESS, COVER_PROMOTION_ADMIN_ADDRESS, PREMIUM_COLLECTOR_ADDRESS, RISK_MANAGER_V2_ADDRESS, COVERAGE_DATA_PROVIDER_ADDRESS, SOLACE_COVER_PRODUCT_ADDRESS]
        );
    await tx.wait()
  }
}

async function deployCoverageDataProvider() {
  if (await isDeployed(COVERAGE_DATA_PROVIDER_ADDRESS)) {
    coverageDataProvider = (await ethers.getContractAt(artifacts.CoverageDataProvider.abi, COVERAGE_DATA_PROVIDER_ADDRESS)) as CoverageDataProvider;
  } else {
    console.log("Deploying Coverage Data Provider");
    const res = await create2Contract(deployer, artifacts.CoverageDataProvider, [signerAddress], {}, "", deployerContract.address);
    coverageDataProvider = (await ethers.getContractAt(artifacts.CoverageDataProvider.abi, res.address)) as unknown as CoverageDataProvider;
    console.log(`Deployed Coverage Data Provider to ${coverageDataProvider.address}`);
  }

  const { success } = await registryV2.tryGet("coverageDataProvider");
  if (!success && await registryV2.governance() == signerAddress) {
    console.log("Registering Coverage Data Provider");
    let tx = await registryV2.connect(deployer).set(["coverageDataProvider"], [coverageDataProvider.address]);
    await tx.wait();

    console.log("Setting Underwriting Pool Updater");
    tx = await coverageDataProvider.connect(deployer).setUwpUpdater(COVERAGE_DATA_PROVIDER_UPDATER_ADDRESS);
    await tx.wait();

    console.log("Setting Underwriting Pool Amounts");
    tx = await coverageDataProvider.connect(deployer).set("mainnet", BN.from("1000000000000000000").mul(8450000)); // 8.45M USD
    await tx.wait();

    // tx = await coverageDataProvider.connect(deployer).set("aurora", AMOUNT2);
    // await tx.wait();
  }
}

async function deployRiskManager() {
  if (await isDeployed(RISK_MANAGER_V2_ADDRESS)) {
    riskManagerV2 = (await ethers.getContractAt(artifacts.RiskManager.abi, RISK_MANAGER_V2_ADDRESS)) as RiskManager;
  } else {
    console.log("Deploying Risk Manager(V2)");
    const res = await create2Contract(deployer, artifacts.RiskManager, [signerAddress, registryV2.address], {}, "", deployerContract.address);
    riskManagerV2 = (await ethers.getContractAt(artifacts.RiskManager.abi, res.address)) as unknown as RiskManager;
    console.log(`Deployed Risk Manager(V2) to ${riskManagerV2.address}`);
  }
  const { success } = await registryV2.tryGet("riskManager");
  if (!success && await registryV2.governance() == signerAddress) {
    console.log("Registering Risk Manager");
    let tx = await registryV2.connect(deployer).set(["riskManager"], [riskManagerV2.address]);
    await tx.wait();
  }
}

async function deploySolaceCoverProduct() {
  if (await isDeployed(SOLACE_COVER_PRODUCT_ADDRESS)) {
    solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProduct.abi, SOLACE_COVER_PRODUCT_ADDRESS)) as SolaceCoverProduct;
  } else {
    console.log("Deploying Solace Cover Product");
    const res = await create2Contract(deployer, artifacts.SolaceCoverProduct, [signerAddress, registryV2.address, DOMAIN_NAME, VERSION], {}, "", deployerContract.address);
    solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProduct.abi, res.address)) as unknown as SolaceCoverProduct;
    console.log(`Deployed Solace Cover Product to ${solaceCoverProduct.address}`);
  }

  let { success } = await registryV2.tryGet("solaceCoverProduct");
  if (!success && await registryV2.governance() == signerAddress) {
    console.log("Registering Solace Cover Product");
    let tx = await registryV2.connect(deployer).set(["solaceCoverProduct"], [solaceCoverProduct.address]);
    await tx.wait();
  }

  ({ success } = await registryV2.tryGet("coverPromotionAdmin"));
  if ( !success && await registryV2.governance() == signerAddress) {
    console.log("Registering Cover Promotion Admin");
    let tx = await registryV2.connect(deployer).set(["coverPromotionAdmin"], [COVER_PROMOTION_ADMIN_ADDRESS]);
    await tx.wait();
  }

  ({ success } = await registryV2.tryGet("premiumPool"));
  if ( !success && await registryV2.governance() == signerAddress) {
    console.log("Registering Premium Pool");
    let tx = await registryV2.connect(deployer).set(["premiumPool"], [PREMIUM_POOL_ADDRESS]);
    await tx.wait();
  }

  ({ success } = await registryV2.tryGet("premiumCollector"));
  if ( !success && await registryV2.governance() == signerAddress) {
    console.log("Registering Premium Collector");
    let tx = await registryV2.connect(deployer).set(["premiumCollector"], [PREMIUM_COLLECTOR_ADDRESS]);
    await tx.wait();
  }

  console.log('Risk Manager(V2) - Adding Soteria as Risk Strategy');
  let tx = await riskManagerV2.connect(deployer).addRiskStrategy(solaceCoverProduct.address)
  await tx.wait();

  console.log('Risk Manager(V2) - Setting Soteria as an active strategy');
  tx = await riskManagerV2.connect(deployer).setStrategyStatus(solaceCoverProduct.address, 1)
  await tx.wait();

  console.log('Risk Manager(V2) - Setting Soteria weight allocation');
  tx = await riskManagerV2.connect(deployer).setWeightAllocation(solaceCoverProduct.address, 1000)
  await tx.wait();

  console.log('Risk Manager(V2) - Adding Soteria as a cover limit updated');
  tx = await riskManagerV2.connect(deployer).addCoverLimitUpdater(solaceCoverProduct.address)
  await tx.wait();
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("RegistryV2", registryV2.address);
  logContractAddress("RiskManagerV2", riskManagerV2.address);
  logContractAddress("CoverageDataProvider", coverageDataProvider.address);
  logContractAddress("SolaceCoverProduct", solaceCoverProduct.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
