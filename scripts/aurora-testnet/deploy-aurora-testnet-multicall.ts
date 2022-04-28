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

const DEPLOYER_CONTRACT_ADDRESS = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";
const MULTICALL_1_ADDRESS       = "0x8f81207F59A4f86d68608fF90b259A0927242967";
const MULTICALL_2_ADDRESS       = "0xa30256B329B22E47787C67CF35D601A7EEE72b50";

let artifacts: ArtifactImports;
let deployerContract: Deployer;
let multicall1: Contract;
let multicall2: Contract;

let signerAddress: string;

const MULTICALL_1_ABI = [{"constant":false,"inputs":[{"components":[{"name":"target","type":"address"},{"name":"callData","type":"bytes"}],"name":"calls","type":"tuple[]"}],"name":"aggregate","outputs":[{"name":"blockNumber","type":"uint256"},{"name":"returnData","type":"bytes[]"}],"payable":false,"stateMutability":"nonpayable","type":"function"}];
const MULTICALL_2_ABI = [{"inputs":[{"components":[{"internalType":"address","name":"target","type":"address"},{"internalType":"bytes","name":"callData","type":"bytes"}],"internalType":"struct Multicall2.Call[]","name":"calls","type":"tuple[]"}],"name":"aggregate","outputs":[{"internalType":"uint256","name":"blockNumber","type":"uint256"},{"internalType":"bytes[]","name":"returnData","type":"bytes[]"}],"stateMutability":"nonpayable","type":"function"}];

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  await deployMulticall1();
  await deployMulticall2();

  await logAddresses();
}

async function deployMulticall1() {
  if(await isDeployed(MULTICALL_1_ADDRESS)) {
    multicall1 = await ethers.getContractAt(MULTICALL_1_ABI, MULTICALL_1_ADDRESS);
  } else {
    console.log("deploying multicall 1");
    let salt = "0x0000000000000000000000000000000000000000000000000000000000000000";
    let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/utils/Multicall1.txt").toString().trim();
    let tx = await deployerContract.connect(deployer).deploy(bytecode, salt, {gasLimit: 6000000, type: 0});
    await tx.wait(networkSettings.confirmations);
    let addr = predictAddress(bytecode, DEPLOYER_CONTRACT_ADDRESS, salt);
    await expectDeployed(addr);
    multicall1 = await ethers.getContractAt(MULTICALL_1_ABI, addr);
  }
  /*
  let tx2 = await multicall1.connect(deployer).aggregate([{target:"0x501acEC6005979Be31C0c1d962A922c3a609C71D",callData:"0x9f678cca"}])
  await tx2.wait(networkSettings.confirmations)
  */
}

async function deployMulticall2() {
  if(await isDeployed(MULTICALL_2_ADDRESS)) {
    multicall2 = await ethers.getContractAt(MULTICALL_2_ABI, MULTICALL_2_ADDRESS);
  } else {
    console.log("deploying multicall 2");
    let salt = "0x0000000000000000000000000000000000000000000000000000000000000001";
    let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/utils/Multicall2.txt").toString().trim();
    let tx = await deployerContract.connect(deployer).deploy(bytecode, salt, {gasLimit: 6000000, type: 0});
    await tx.wait(networkSettings.confirmations);
    let addr = predictAddress(bytecode, DEPLOYER_CONTRACT_ADDRESS, salt);
    await expectDeployed(addr);
    multicall2 = await ethers.getContractAt(MULTICALL_2_ABI, addr);
  }
  /*
  let tx2 = await multicall2.connect(deployer).aggregate([{target:"0x501acEC6005979Be31C0c1d962A922c3a609C71D",callData:"0x9f678cca"}])
  await tx2.wait(networkSettings.confirmations)
  */
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
  addr = ethers.utils.getAddress('0x' + addr);
  return addr;
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("Multicall 1", multicall1?.address);
  logContractAddress("Multicall 2", multicall2?.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
