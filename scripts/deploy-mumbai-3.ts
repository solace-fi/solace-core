import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.MUMBAI_ACCOUNTS || '[]')[0], provider);

import { create2Contract } from "./create2Contract";

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "../test/utilities/artifact_importer";
import { Deployer, CoverageDataProviderV2, Registry } from "../typechain";
import { isDeployed } from "../test/utilities/expectDeployed";

const DEPLOYER_CONTRACT_ADDRESS     = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

// wallet addresses
let COVERAGE_DATA_PROVIDER_UPDATER_ADDRESS  = "0xc5683ea4888DadfdE421a1E593DfbD36290D63AB"; // the bot address to update underwriting pool values

// contract addresses
const REGISTRY_V2_ADDRESS               = "0x501ACe0f576fc4ef9C0380AA46A578eA96b85776";
const COVERAGE_DATA_PROVIDER_ADDRESS    = "0x42D3565cf5D37acB1980638F9364EE65ae571c3F";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let coverageDataProvider: CoverageDataProviderV2;
let registryV2: Registry;


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

  // log addresses
  await logAddresses();
}

async function deployRegistry() {
  if(await isDeployed(REGISTRY_V2_ADDRESS)) {
    registryV2 = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_V2_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry(V2)");
    const res = await create2Contract(deployer, artifacts.Registry, [signerAddress], {}, "", deployerContract.address);
    registryV2 = (await ethers.getContractAt(artifacts.Registry.abi, res.address)) as Registry;

    // const contract = await ethers.getContractFactory("Registry");
    // registryV2 = (await contract.deploy(signerAddress)) as Registry;
    console.log(`Deployed Registry(V2) to ${registryV2.address}`);
  }
}

async function deployCoverageDataProvider() {
  if (await isDeployed(COVERAGE_DATA_PROVIDER_ADDRESS)) {
    coverageDataProvider = (await ethers.getContractAt(artifacts.CoverageDataProviderV2.abi, COVERAGE_DATA_PROVIDER_ADDRESS)) as CoverageDataProviderV2;
  } else {
    console.log("Deploying Coverage Data Provider");
    const res = await create2Contract(deployer, artifacts.CoverageDataProviderV2, [signerAddress], {}, "", deployerContract.address);
    coverageDataProvider = (await ethers.getContractAt(artifacts.CoverageDataProviderV2.abi, res.address)) as CoverageDataProviderV2;

    // const contract = await ethers.getContractFactory("CoverageDataProviderV2");
    // coverageDataProvider = (await contract.deploy(signerAddress)) as CoverageDataProviderV2;

    console.log(`Deployed Coverage Data Provider to ${coverageDataProvider.address}`);
  }

  console.log("Registering Coverage Data Provider");
  let tx = await registryV2.connect(deployer).set(["coverageDataProvider"], [coverageDataProvider.address]);
  await tx.wait();

  console.log("Setting Underwriting Pool Updater");
  tx = await coverageDataProvider.connect(deployer).addUpdater(COVERAGE_DATA_PROVIDER_UPDATER_ADDRESS);
  await tx.wait();

  console.log("Setting Underwriting Pool Amounts");
  tx = await coverageDataProvider.connect(deployer).set(["mainnet"], [BN.from("1000000000000000000").mul(8450000)]); // 8.45M USD
  await tx.wait();
}


async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("RegistryV2", registryV2.address);
  logContractAddress("CoverageDataProviderV2", coverageDataProvider.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
