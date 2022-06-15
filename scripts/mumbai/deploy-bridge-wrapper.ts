// deploys the bridge wrapper contract

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import fs from "fs";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { create2Contract } from "./../create2Contract";

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Deployer, Solace, BridgeWrapper } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";

const DEPLOYER_CONTRACT_ADDRESS     = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const BSOLACE_ADDRESS               = "0xB18033769f62EEe27e63f85224d86f1b4F2478C9";
const BRIDGE_WRAPPER_ADDRESS        = "0x501AcE1a18aB550E4E8c7775a23d96fD290b0BbF";

let artifacts: ArtifactImports;
let deployerContract: Deployer;
let solace: Solace;
let wrapper: BridgeWrapper;

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
  await expectDeployed(BSOLACE_ADDRESS);
  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  await deployBridgeWrapper();

  await logAddresses();
}

async function deployBridgeWrapper() {
  if(await isDeployed(BRIDGE_WRAPPER_ADDRESS)) {
    wrapper = (await ethers.getContractAt(artifacts.BridgeWrapper.abi, BRIDGE_WRAPPER_ADDRESS)) as BridgeWrapper;
  } else {
    console.log("Deploying Bridge Wrapper");
    var res = await create2Contract(deployer, artifacts.BridgeWrapper, [SOLACE_ADDRESS, BSOLACE_ADDRESS], {}, "", deployerContract.address);
    wrapper = (await ethers.getContractAt(artifacts.BridgeWrapper.abi, res.address)) as BridgeWrapper;
    await expectDeployed(wrapper.address);
    console.log(`Deployed Bridge Wrapper to ${wrapper.address}`);
    console.log("Adding BridgeWrapper as SOLACE minter");
    let tx1 = await solace.connect(deployer).addMinter(wrapper.address);
    await tx1.wait(networkSettings.confirmations);
    console.log("Added BridgeWrapper as SOLACE minter");
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SOLACE", SOLACE_ADDRESS);
  logContractAddress("bSOLACE", BSOLACE_ADDRESS);
  logContractAddress("Bridge Wrapper", wrapper.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
