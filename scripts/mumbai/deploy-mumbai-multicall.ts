// deploys the multicall contracts

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import fs from "fs";
import { Contract } from "ethers";
import { bufferToHex, keccak256 } from "ethereumjs-util";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.AURORA_TESTNET_ACCOUNTS || '[]')[0], provider);

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Deployer } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";

const DEPLOYER_CONTRACT_ADDRESS = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const MULTICALL_1_ADDRESS       = "0xdc1522872E440cF9cD48E237EAFEfaa5F157Ca1d";
const MULTICALL_2_ADDRESS       = "";

let artifacts: ArtifactImports;
let deployerContract: Deployer;
let multicall1: Contract;
let multicall2: Contract;

let signerAddress: string;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  await deployMulticall1();
  //await deployMulticall2();

  await logAddresses();
}

async function deployMulticall1() {
  if(await isDeployed(MULTICALL_1_ADDRESS)) {
    multicall1 = await ethers.getContractAt([], MULTICALL_1_ADDRESS);
  } else {
    console.log("deploying multicall 1");
    let salt = "0x0000000000000000000000000000000000000000000000000000000000000000";
    let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/utils/Multicall1.txt").toString().trim();
    let tx = await deployerContract.connect(deployer).deploy(bytecode, salt, {gasLimit: 6000000});
    let receipt = await tx.wait(networkSettings.confirmations);
    console.log(receipt);
    console.log(receipt.events);
    let addr = predictAddress(bytecode, DEPLOYER_CONTRACT_ADDRESS, salt);
    console.log('expecting deployed to', addr)
    console.log(addr === undefined || addr === null)
    console.log(addr.length !== 42)
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    console.log(addr == ZERO_ADDRESS)
    console.log((await provider.getCode(addr)).length <= 2)

    await expectDeployed(addr);
    multicall1 = await ethers.getContractAt([], addr);
  }
}

function predictAddress(initCode: string, deployerAddress: string, salt: string): string {
  // 0xff ++ deployingAddress is fixed:
  var string1 = '0xff'.concat(deployerAddress.substring(2).toLowerCase());
  // hash the initCode
  var string2 = keccak256(Buffer.from(initCode.substring(2), 'hex')).toString('hex');
  // 1. Convert i to hex, and it pad to 32 bytes:
  var saltToBytes = BN.from(salt).toNumber().toString(16).padStart(64, '0');
  // 2. Concatenate this between the other 2 strings
  var concatString = string1.concat(saltToBytes).concat(string2);
  // 3. Hash the resulting string
  var hashed = bufferToHex(keccak256(Buffer.from(concatString.substring(2), 'hex')));
  // 4. Remove leading 0x and 12 bytes to get address
  var addr = hashed.substr(26);
  return '0x' + addr;
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("Multicall 1", multicall1.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
