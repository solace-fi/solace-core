// deploys the registry and sets entries

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Registry } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2ContractStashed } from "../create2ContractStashed";
import { abiEncodeArgs } from "../../test/utilities/setStorage";

const DEPLOYER_CONTRACT_ADDRESS = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";
const REGISTRY_ADDRESS          = "0x501ACE944a9679b30774Bb87F37a5Af5C4d4910b";

let artifacts: ArtifactImports;

let registry: Registry;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);

  // deploy contracts
  await deployRegistry();
  await registerAddresses();

  // log addresses
  await logAddresses();
}

async function deployRegistry() {
  if(await isDeployed(REGISTRY_ADDRESS)) {
    registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    await create2ContractStashed(
      "Registry",
      "scripts/contract_deploy_bytecodes_aurora_testnet/utils/Registry.txt",
      "stash/contracts_processed/utils/Registry.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      REGISTRY_ADDRESS,
      abiEncodeArgs([signerAddress])
    );
    registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as unknown as Registry;
    console.log(`Deployed Registry to ${registry.address}`);
  }
}

async function registerAddresses() {

  // add key->value pairs to this list as needed
  const registryEntries:any = {


  }

  // set default addresses
  if (await registry.governance() == signerAddress) {
    let keys = Object.keys(registryEntries);
    let keysAlreadySet = [];
    let keysToSet = [];
    let valuesToSet = [];

    for(var i = 0; i < keys.length; ++i) {
      let key = keys[i];
      let { value } = await registry.tryGet(key);
      if (value == registryEntries[key]) {
        keysAlreadySet.push(key);
      } else {
        keysToSet.push(key);
        valuesToSet.push(registryEntries[key]);
      }
    }

    console.log('keys already set :', keysAlreadySet.join(', '));
    console.log('keys to set      :', keysToSet.join(', '));
    if(keysToSet.length > 0) {
      console.log('setting');
      let tx = await registry.connect(deployer).set(keysToSet, valuesToSet, networkSettings.overrides);
      await tx.wait(networkSettings.confirmations);
    }
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("Registry", registry.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
