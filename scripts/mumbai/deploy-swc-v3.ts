// deploys v3 of solace wallet coverage

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { CoverageDataProviderV2, Registry, RiskManager, Scp, CoverPaymentManager, SolaceCoverProductV3 } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2Contract } from "../create2Contract";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

// wallet addresses
let   COVERAGE_DATA_PROVIDER_UPDATER_ADDRESS  = "0xc5683ea4888DadfdE421a1E593DfbD36290D63AB"; // the bot address to update underwriting pool values
const PREMIUM_POOL_ADDRESS                    = "0x501ace27A074471F099ffFeC008Bd1b151c7F7dE"; // will be set in registry
let   COVER_PROMOTION_ADMIN_ADDRESS           = "0x4770becA2628685F7C45102c7a649F921df71C70"; // will be set in registry
const PREMIUM_COLLECTOR_ADDRESS               = "0xF321be3577B1AcB436869493862bA18bDde6fc39"; // the bot address that will be set in registry
const SOLACE_PRICE_SIGNER                     = "0x6790db64A2c92C6763DF63cbc397090E77320136";

// contract addresses
const SOLACE_ADDRESS                 = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const REGISTRY_ADDRESS               = "0x501ACe0f576fc4ef9C0380AA46A578eA96b85776";
const COVERAGE_DATA_PROVIDER_ADDRESS = "0x501ACe6D80111c9B54FA36EEC5f1B213d7F24770";
const RISK_MANAGER_ADDRESS           = "0x501AcEf9020632a71CB25CFa9F554252eB51732b";
const SCP_ADDRESS                    = "0x501ACE72166956F57b44dbBcc531A8E741449997";
const COVER_PAYMENT_MANAGER_ADDRESS  = "0x501aCe8EA57c0f83De8aEB179f32951181e36Fc1";
const SOLACE_COVER_PRODUCT_ADDRESS   = "0x501ACeB72d62C9875825b71d9f78a27780B5624d";

const MESSAGE_BUS_ADDRESS                    = "0x7d43AABC515C356145049227CeE54B608342c0ad";
const COVERAGE_DATA_PROVIDER_WRAPPER_ADDRESS = "0x501Acef201B7Ad6FFe86A37d83df757454924aD5";

const DAI_ADDRESS   = "0x829F3bc2f95E190fcf75Cca9D53ECd873404AeA4";
const USDC_ADDRESS  = "0xca08aB81e4E437AcDda0E7505026bdD9A97b8B76";
const USDT_ADDRESS  = "0x992fbE5C6fc9d5f09F4Fd85eF1FD331df078821C";
const FRAX_ADDRESS  = "0xE338d08783CE3bdE2Cc03b137b196168641A8C05";
const MAI_ADDRESS   = "0x5e8200F06Ed6B7bBC10f905b40D38eE453366a0B";

let artifacts: ArtifactImports;

let coverageDataProvider: CoverageDataProviderV2;
let registry: Registry;
let riskManager: RiskManager;
let scp: Scp;
let coverPaymentManager: CoverPaymentManager;
let solaceCoverProduct: SolaceCoverProductV3;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(SOLACE_ADDRESS);
  await expectDeployed(REGISTRY_ADDRESS);
  registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;

  // deploy contracts
  await deployCoverageDataProvider();
  await deployRiskManager();
  await deployScp();
  await deployCoverPaymentManager();
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

    let { value } = await registry.tryGet("coverageDataProvider");
    if (value != coverageDataProvider.address && await registry.governance() == signerAddress) {
      console.log("Registering coverageDataProvider");
      let tx2 = await registry.connect(deployer).set(["coverageDataProvider"], [coverageDataProvider.address], networkSettings.overrides);
      await tx2.wait(networkSettings.confirmations);
    }

    console.log("Setting Underwriting Pool Updater");
    let tx = await coverageDataProvider.connect(deployer).addUpdater(COVERAGE_DATA_PROVIDER_UPDATER_ADDRESS, networkSettings.overrides);
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

  let { value } = await registry.tryGet("riskManager");
  if (value != riskManager.address && await registry.governance() == signerAddress) {
    console.log("Registering Risk Manager");
    let tx = await registry.connect(deployer).set(["riskManager"], [riskManager.address], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
}

async function deployScp() {
  if (await isDeployed(SCP_ADDRESS)) {
    scp = (await ethers.getContractAt(artifacts.SCP.abi, SCP_ADDRESS)) as Scp;
  } else {
    console.log("Deploying SCP");
    const res = await create2Contract(deployer, artifacts.SCP, [signerAddress], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    scp = (await ethers.getContractAt(artifacts.SCP.abi, res.address)) as Scp;
    console.log(`Deployed SCP to ${scp.address}`);
  }

  let { value } = await registry.tryGet("scp");
  if (value != scp.address && await registry.governance() == signerAddress) {
    console.log("Registering SCP");
    let tx = await registry.connect(deployer).set(["scp"], [scp.address], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }

  if(!(await scp.isScpMover(PREMIUM_COLLECTOR_ADDRESS))) {
    console.log("Adding premium collector as scp mover");
    let tx = await scp.connect(deployer).setScpMoverStatuses([PREMIUM_COLLECTOR_ADDRESS], [true], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
}

async function deployCoverPaymentManager() {
  if (await isDeployed(COVER_PAYMENT_MANAGER_ADDRESS)) {
    coverPaymentManager = (await ethers.getContractAt(artifacts.CoverPaymentManager.abi, COVER_PAYMENT_MANAGER_ADDRESS)) as CoverPaymentManager;
  } else {
    console.log("Deploying CoverPaymentManager");
    const res = await create2Contract(deployer, artifacts.CoverPaymentManager, [signerAddress, registry.address], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    coverPaymentManager = (await ethers.getContractAt(artifacts.CoverPaymentManager.abi, res.address)) as CoverPaymentManager;
    console.log(`Deployed CoverPaymentManager to ${coverPaymentManager.address}`);

    console.log("Setting CoverPaymentManager as SCP mover");
    let tx1 = await scp.connect(deployer).setScpMoverStatuses([coverPaymentManager.address], [true], networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
    console.log("Set CoverPaymentManager as SCP mover");

    if(!(await coverPaymentManager.isSigner(SOLACE_PRICE_SIGNER))) {
      console.log("Adding SOLACE price signer");
      let tx2 = await coverPaymentManager.connect(deployer).addSigner(SOLACE_PRICE_SIGNER, networkSettings.overrides);
      await tx2.wait(networkSettings.confirmations);
    }

    console.log('setting token info');
    let tx3 = await coverPaymentManager.connect(deployer).setTokenInfo([
      {token: DAI_ADDRESS, accepted: true, permittable: false, refundable: true, stable: true},
      {token: USDC_ADDRESS, accepted: true, permittable: true, refundable: true, stable: true},
      {token: USDT_ADDRESS, accepted: true, permittable: false, refundable: true, stable: true},
      {token: FRAX_ADDRESS, accepted: true, permittable: false, refundable: true, stable: true},
      {token: MAI_ADDRESS, accepted: true, permittable: false, refundable: true, stable: true},
      {token: SOLACE_ADDRESS, accepted: true, permittable: true, refundable: true, stable: false},
    ], networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);

    // NOTE: use this when the premium pool is an EOA
    // mainnet premium pools are gnosis multisigs so the transaction needs to be sent there
    let solace = await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS);
    console.log("premium pool - approve solace to cover payment manager");
    const premiumPool = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[4], provider);
    let tx5 = await solace.connect(premiumPool).approve(coverPaymentManager.address, ethers.constants.MaxUint256, networkSettings.overrides);
    await tx5.wait(networkSettings.confirmations);
  }

  let { value } = await registry.tryGet("coverPaymentManager");
  if (value != coverPaymentManager.address && await registry.governance() == signerAddress) {
    console.log("Registering CoverPaymentManager");
    let tx = await registry.connect(deployer).set(["coverPaymentManager"], [coverPaymentManager.address], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
}

async function deploySolaceCoverProduct() {
  if (await isDeployed(SOLACE_COVER_PRODUCT_ADDRESS)) {
    solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProductV3.abi, SOLACE_COVER_PRODUCT_ADDRESS)) as SolaceCoverProductV3;
  } else {
    console.log("Deploying Solace Cover Product");
    const res = await create2Contract(deployer, artifacts.SolaceCoverProductV3, [signerAddress, registry.address], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    solaceCoverProduct = (await ethers.getContractAt(artifacts.SolaceCoverProductV3.abi, res.address)) as SolaceCoverProductV3;
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

  var { value } = await registry.tryGet("solaceCoverProduct");
  if ((value != solaceCoverProduct.address) && await registry.governance() == signerAddress) {
    console.log("Registering Solace Cover Product");
    let tx = await registry.connect(deployer).set(["solaceCoverProduct"], [solaceCoverProduct.address], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }

  var { value } = await registry.tryGet("coverPromotionAdmin");
  if (value != COVER_PROMOTION_ADMIN_ADDRESS && await registry.governance() == signerAddress) {
    console.log("Registering Cover Promotion Admin");
    let tx = await registry.connect(deployer).set(["coverPromotionAdmin"], [COVER_PROMOTION_ADMIN_ADDRESS], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }

  var { value } = await registry.tryGet("premiumPool");
  if (value != PREMIUM_POOL_ADDRESS && await registry.governance() == signerAddress) {
    console.log("Registering Premium Pool");
    let tx = await registry.connect(deployer).set(["premiumPool"], [PREMIUM_POOL_ADDRESS], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }

  var { value } = await registry.tryGet("premiumCollector");
  if (value != PREMIUM_COLLECTOR_ADDRESS && await registry.governance() == signerAddress) {
    console.log("Registering Premium Collector");
    let tx = await registry.connect(deployer).set(["premiumCollector"], [PREMIUM_COLLECTOR_ADDRESS], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }

  if(!(await coverPaymentManager.productIsActive(solaceCoverProduct.address))) {
    console.log('Adding SolaceCoverProduct as CoverPaymentManager product')
    let tx = await coverPaymentManager.connect(deployer).addProduct(solaceCoverProduct.address, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }

  if(!(await solaceCoverProduct.isSigner(SOLACE_PRICE_SIGNER))) {
    console.log("Adding premium verifier");
    let tx2 = await solaceCoverProduct.connect(deployer).addSigner(SOLACE_PRICE_SIGNER, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("Registry", registry.address);
  logContractAddress("RiskManager", riskManager.address);
  logContractAddress("CoverageDataProvider", coverageDataProvider.address);
  logContractAddress("SCP", scp.address);
  logContractAddress("CoverPaymentManager", coverPaymentManager.address);
  logContractAddress("SolaceCoverProduct", solaceCoverProduct.address);
  logContractAddress("MessageBus", MESSAGE_BUS_ADDRESS);
  logContractAddress("CoverageDataProviderWrapper", COVERAGE_DATA_PROVIDER_WRAPPER_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
