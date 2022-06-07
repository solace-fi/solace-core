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
import { create2ContractStashed } from "../create2ContractStashed";

const FACTORY_DEPLOYER_ADDRESS      = "0xBb6e024b9cFFACB947A71991E386681B1Cd1477D";
const SINGLETON_FACTORY_ADDRESS     = "0xce0042B868300000d44A59004Da54A005ffdcf9f";
const DEPLOYER_CONTRACT_ADDRESS     = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

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

  if(chainID == 31337) { // testnet
    console.log('funding')
    var [funder] = await hardhat.ethers.getSigners();
    let tx = await funder.sendTransaction({to: signerAddress, value: BN.from("100000000000000000000")});
    await tx.wait(networkSettings.confirmations);
  }

  await deploySingletonFactoryNicksMethod();
  await deployDeployerContract();

  await logAddresses();
}

async function deploySingletonFactoryNicksMethod() {
  if(await isDeployed(SINGLETON_FACTORY_ADDRESS)) return;
  console.log("Deploying SingletonFactory");
  let bal = await provider.getBalance(FACTORY_DEPLOYER_ADDRESS);
  let amountNeeded = BN.from("24700000000000000");
  if(bal.lt(amountNeeded)) {
    console.log('funding')
    let tx1 = await deployer.sendTransaction({to: FACTORY_DEPLOYER_ADDRESS, value: amountNeeded.sub(bal), ...networkSettings.overrides});
    await tx1.wait(networkSettings.confirmations);
  }
  console.log('deploying')
  let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/utils/SingletonFactoryNicksMethod.txt").toString().trim();
  let tx2 = await provider.sendTransaction(bytecode);
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
      "scripts/contract_deploy_bytecodes/utils/Deployer.txt",
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
