// deploys the deployer contract

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import fs from "fs";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.GOERLI_ACCOUNTS || '[]')[0], provider);

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Deployer } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";

const SINGLETON_FACTORY_ADDRESS     = "0x941F6f17Eade71E88D926FD9ca020dB535bDe573";
const DEPLOYER_CONTRACT_ADDRESS     = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(SINGLETON_FACTORY_ADDRESS);
  await deployDeployerContract();

  await logAddresses();
}

async function deployDeployerContract() {
  if(await isDeployed(DEPLOYER_CONTRACT_ADDRESS)) {
    deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  } else {
    console.log("Deploying Deployer");
    let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/aurora_testnet/utils/Deployer.txt").toString().trim();
    let tx = await deployer.sendTransaction({...networkSettings.overrides, to:SINGLETON_FACTORY_ADDRESS, gasLimit: 5000000, data: bytecode});
    await tx.wait(networkSettings.confirmations);
    await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
    deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
    console.log(`Deployed Deployer to ${deployerContract.address}`);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SingletonFactory", SINGLETON_FACTORY_ADDRESS);
  logContractAddress("DeployerContract", deployerContract.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
