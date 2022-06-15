import hardhat from "hardhat";
const { ethers } = hardhat;
import { config as dotenv_config } from "dotenv";
dotenv_config();

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Registry } from "../typechain";
import { expectDeployed } from "../test/utilities/expectDeployed";
let artifacts: ArtifactImports;

const REGISTRY_ADDRESS               = "0x501ACe0f576fc4ef9C0380AA46A578eA96b85776";

async function main() {
  artifacts = await import_artifacts();
  await expectDeployed(REGISTRY_ADDRESS);
  let registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  let length = (await registry.length()).toNumber();
  let indices = range(1, length+1);
  let keys = await Promise.all(indices.map((i:number) => registry.getKey(i)));
  let values = await Promise.all(keys.map((key:string) => registry.get(key)));
  console.log(`| ${formatKey('Key')} | Value                                      |\n|-----------------------------|--------------------------------------------|`)
  range(0, length).forEach((i:number) => {
    console.log(`| ${formatKey(keys[i])} | ${values[i]} |`)
  })
}

function range(start: number, stop: number) {
  let arr = [];
  for(var i = start; i < stop; ++i) {
    arr.push(i);
  }
  return arr;
}

function formatKey(key: string) {
  while(key.length < 27) key = key + ' ';
  return key;
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
