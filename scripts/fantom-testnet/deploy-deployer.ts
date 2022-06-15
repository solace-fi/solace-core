// deploys the deployer contract

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import fs from "fs";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Deployer } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2ContractStashed } from "../create2ContractStashed";

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

  await deploySingletonFactory();
  await deployDeployerContract();

  await logAddresses();
}

async function deploySingletonFactory() {
  if(await isDeployed(SINGLETON_FACTORY_ADDRESS)) return;
  console.log("Deploying SingletonFactory");
  let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes_aurora_testnet/utils/SingletonFactory.txt").toString().trim();
  let tx2 = await deployer.sendTransaction({...networkSettings.overrides, gasLimit: 5000000, data: bytecode});
  await tx2.wait(networkSettings.confirmations);
  await expectDeployed(SINGLETON_FACTORY_ADDRESS);
  console.log(`Deployed SingletonFactory to ${SINGLETON_FACTORY_ADDRESS}`);
}

async function deployDeployerContract() {
  if(await isDeployed(DEPLOYER_CONTRACT_ADDRESS)) {
    deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  } else {
    console.log("Deploying Deployer");
    await create2ContractStashed(
      "Deployer",
      "scripts/contract_deploy_bytecodes_aurora_testnet/utils/Deployer.txt",
      "stash/contracts_processed/utils/Deployer.sol",
      deployer,
      SINGLETON_FACTORY_ADDRESS,
      DEPLOYER_CONTRACT_ADDRESS,
      ""
    );
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
