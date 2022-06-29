// deploys v2 of solace wallet coverage

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
import fs from "fs";
import { create2Contract } from "../create2Contract";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { logContractAddress } from "../utils";
import { import_artifacts, ArtifactImports } from "../../test/utilities/artifact_importer";
import { Deployer, MerkleDistributor } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";

const DEPLOYER_CONTRACT_ADDRESS     = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

// contract addresses
let MERKLE_DISTRIBUTOR_ADDRESS               = "";

let artifacts: ArtifactImports;
let deployerContract: Deployer;
let merkleDistributor: MerkleDistributor;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  // await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  // deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;

  // deploy contracts
  await deployMerkleDistributor();

  // log addresses
  await logAddresses();
}

async function deployMerkleDistributor() {
  if(await isDeployed(MERKLE_DISTRIBUTOR_ADDRESS)) {
    merkleDistributor = (await ethers.getContractAt(artifacts.MerkleDistributor.abi, MERKLE_DISTRIBUTOR_ADDRESS)) as MerkleDistributor;
  } else {
    console.log("Deploying MerkleDistributor");

    const merkleRoot = "0xa3355b0ea435593f559c0e6e51a16e374bd801ce86911543fa6b09161ad0235c"

    // Basic deploy as per https://hardhat.org/guides/deploying.html
    const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
    const merkleDistributor = await MerkleDistributor.deploy(signerAddress, merkleRoot, signerAddress);
    await merkleDistributor.deployed();

    // Deployment process 1
    // const res = await create2Contract(deployer, artifacts.MerkleDistributor, [signerAddress], {}, "", deployerContract.address);
    // const res = await create2Contract(deployer, artifacts.MerkleDistributor, [signerAddress, merkleRoot, signerAddress], {}, "", deployer.address);
    // merkleDistributor = (await ethers.getContractAt(artifacts.MerkleDistributor.abi, res.address)) as unknown as MerkleDistributor;

    // let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/utils/Registry.txt").toString().trim();
    // let tx = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    // await tx.wait(networkSettings.confirmations);
    // merkleDistributor = (await ethers.getContractAt(artifacts.MerkleDistributor.abi, MERKLE_DISTRIBUTOR_ADDRESS)) as unknown as MerkleDistributor;

    console.log("Deployed MerkleDistributor to:", merkleDistributor.address);
    MERKLE_DISTRIBUTOR_ADDRESS = merkleDistributor.address
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("MerkleDistributor", MERKLE_DISTRIBUTOR_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
