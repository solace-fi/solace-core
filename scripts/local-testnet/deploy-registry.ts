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

const DEPLOYER_CONTRACT_ADDRESS = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const REGISTRY_ADDRESS          = "0x501ACe0f576fc4ef9C0380AA46A578eA96b85776";

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
      "scripts/contract_deploy_bytecodes/utils/Registry.txt",
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
    // multisigs
    "premiumPool"                 : "0x501ace27A074471F099ffFeC008Bd1b151c7F7dE",
    // EOAs
    "coverPromotionAdmin"         : "0x4770becA2628685F7C45102c7a649F921df71C70",
    "premiumCollector"            : "0xF321be3577B1AcB436869493862bA18bDde6fc39",
    // external contracts
    //"dai"                         : "", // TODO: set this
    // solace contracts
    "solace"                      : "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40",
    "xsLocker"                    : "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1",
    "riskManager"                 : "0x501AcEf9020632a71CB25CFa9F554252eB51732b",
    "coverageDataProvider"        : "0x501ACe6D80111c9B54FA36EEC5f1B213d7F24770",
    "coverageDataProviderWrapper" : "0x501Acef201B7Ad6FFe86A37d83df757454924aD5",
    "scp"                         : "0x501ACE72166956F57b44dbBcc531A8E741449997",
    "coverPaymentManager"         : "0x501acE7a18b0F59E51eb198cD73480F8467DE100",
    "solaceCoverProduct"          : "0x501ACeB72d62C9875825b71d9f78a27780B5624d",
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
