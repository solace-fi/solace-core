// deploys MerkleDistributor

// Requires following fields in .env
// RINKEBY_URL
// PRIVATE_KEYS
// RINKEBY_ACCOUNTS
// RINKEBY_ALCHEMY_KEY
// POLYGONSCAN_API_KEY

// Verify command
// npx hardhat verify --network rinkeby 0x501aCe8B85dBF43552FA44aDEe4Fd817AdF7e6e7 "0x8ad3aA5d5ff084307d28C8f514D7a193B2Bfe725" "0xa3355b0ea435593f559c0e6e51a16e374bd801ce86911543fa6b09161ad0235c" "0xC32e0d89e25222ABb4d2d68755baBF5aA6648F15"

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
const TOKEN_ADDRESS             = "0x8ad3aA5d5ff084307d28C8f514D7a193B2Bfe725";
const MERKLE_DISTRIBUTOR_ADDRESS = "0x501aCe8B85dBF43552FA44aDEe4Fd817AdF7e6e7";

const MERKLE_ROOT = "0xa3355b0ea435593f559c0e6e51a16e374bd801ce86911543fa6b09161ad0235c"


let artifacts: ArtifactImports;
let merkleDistributor: MerkleDistributor;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(TOKEN_ADDRESS);

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
    const res = await create2Contract(deployer, artifacts.MerkleDistributor, [TOKEN_ADDRESS, MERKLE_ROOT, signerAddress], {}, "", DEPLOYER_CONTRACT_ADDRESS);
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