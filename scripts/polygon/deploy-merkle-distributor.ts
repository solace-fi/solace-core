// deploys MerkleDistributor

// Warning - can get stuck due to Polygon gas, can change gas values in `scripts/getNetworkSettings.ts`

// Requires following fields in .env
// POLYGON_URL
// POLYGON_ACCOUNTS
// PRIVATE_KEYS
// RINKEBY_ACCOUNTS
// RINKEBY_ALCHEMY_KEY
// POLYGONSCAN_API_KEY

// Deploy command
// npx hardhat run --network polygon scripts/polygon/deploy-merkle-distributor.ts

// Verify command
// npx hardhat verify --network polygon 0x501ace879459d49903ccaf7db5968e83b3c31213 "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40" "0xa0e21b0d305e9aed051db3078ce4169f8a06bfef37164220a51ade06ce18ce3f" "0x6D57Fb61847F0026AfA6b57e55518EaB000F4a38"

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { logContractAddress } from "../utils";

import { import_artifacts, ArtifactImports } from "../../test/utilities/artifact_importer";
import { MerkleDistributor } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2Contract } from "../create2Contract";

const DEPLOYER_CONTRACT_ADDRESS  = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const SOLACE_ADDRESS             = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const GOVERNOR_ADDRESS           = "0x6D57Fb61847F0026AfA6b57e55518EaB000F4a38"
const MERKLE_DISTRIBUTOR_ADDRESS = "";

const MERKLE_ROOT = "0xa0e21b0d305e9aed051db3078ce4169f8a06bfef37164220a51ade06ce18ce3f"


let artifacts: ArtifactImports;
let merkleDistributor: MerkleDistributor;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(SOLACE_ADDRESS);

  // deploy contracts
  await deployMerkleDistributor();

  // log addresses
  await logAddresses();
}


async function deployMerkleDistributor() {
  if (await isDeployed(MERKLE_DISTRIBUTOR_ADDRESS)) {
    merkleDistributor = (await ethers.getContractAt(artifacts.MerkleDistributor.abi, MERKLE_DISTRIBUTOR_ADDRESS)) as MerkleDistributor;
  } else {
    console.log("Deploying Merkle Distributor");
    const res = await create2Contract(deployer, artifacts.MerkleDistributor, [SOLACE_ADDRESS, MERKLE_ROOT, GOVERNOR_ADDRESS], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    merkleDistributor = (await ethers.getContractAt(artifacts.MerkleDistributor.abi, res.address)) as unknown as MerkleDistributor;
    console.log(`Deployed Merkle Distributor to ${merkleDistributor.address}`);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("MerkleDistributor", merkleDistributor.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });