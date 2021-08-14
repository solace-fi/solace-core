import { Signer } from "@ethersproject/abstract-signer";
import { deployContract } from "ethereum-waffle";
import { ContractJSON } from "ethereum-waffle/dist/esm/ContractJSON";
import { Contract } from "ethers";
const eth = require('ethereumjs-util')

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
let artifacts: ArtifactImports;

let initialized = false;
const SINGLETON_FACTORY_ADDRESS = "0xce0042B868300000d44A59004Da54A005ffdcf9f";
let singletonFactory: Contract;

// deploys a new contract using CREATE2
// call like you would waffle.deployContract
export async function create2Contract(wallet: Signer, factoryOrContractJson: ContractJSON, args: any[] | undefined = [], overrideOptions = {}, contractPath: string = "") {
  _init();
  var bytecode = await _bytecodeGetter(wallet, factoryOrContractJson, args, overrideOptions);
  //console.log('bytecode:', bytecode);
  var [i, address, salt] = _hasher(bytecode);
  //console.log('i       :', i.toLocaleString('en-US'));
  //console.log('address :', address);
  //console.log('salt    :', salt);
  var exists = await _exists(address, factoryOrContractJson);
  if(!exists) await _deployer(wallet, bytecode, salt);
  await _verifier(address, args, contractPath);
  return address;
}

// initializes global variables if not done yet
async function _init() {
  if(initialized) return;
  artifacts = await import_artifacts();
  singletonFactory = await ethers.getContractAt(artifacts.SingletonFactory.abi, SINGLETON_FACTORY_ADDRESS);
  initialized = true;
}

// gets the bytecode to deploy the contract
let provider2 = new ethers.providers.AlchemyProvider(4, process.env.RINKEBY_ALCHEMY_KEY);
const failDeployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider2);
async function _bytecodeGetter(wallet: Signer, factoryOrContractJson: ContractJSON, args: any[] | undefined = [], overrideOptions = {}) {
  // TODO: intelligently construct the bytecode instead of depending on failed transaction
  let contract;
  try {
    contract = await deployContract(failDeployer, factoryOrContractJson, args, overrideOptions);
  } catch(e) {
    return e.tx.data;
  }
  console.log(contract);
  throw "somehow created the contract";
}

// test salts until one results in an acceptable address
function _hasher(bytecode: string): [number, string, string] {
  // 0xff ++ deployingAddress is fixed:
  var string1 = '0xff'.concat(SINGLETON_FACTORY_ADDRESS.substring(2))
  //var string1 = '0xffce0042B868300000d44A59004Da54A005ffdcf9f'
  // hash the bytecode
  var string2 = eth.keccak256(Buffer.from(bytecode.substring(2), 'hex')).toString('hex');
  // In each loop, i is the value of the salt we are checking
  for (var i = 0; i < 72057594037927936; i++) {
  //for (var i =    6440000; i < 72057594037927936; i++) {
  //for (var i =  8821000; i < 72057594037927936; i++) {
  //for (var i = 27000000; i < 72057594037927936; i++) {
    //if(i % 1000000 == 0) console.log(i.toLocaleString('en-US'));
    // 1. Convert i to hex, and it pad to 32 bytes:
    var saltToBytes = i.toString(16).padStart(64, '0');
    // 2. Concatenate this between the other 2 strings
    var concatString = string1.concat(saltToBytes).concat(string2);
    // 3. Hash the resulting string
    var hashed = eth.bufferToHex(eth.keccak256(Buffer.from(concatString.substring(2), 'hex')));
    // 4. Remove leading 0x and 12 bytes to get address
    var addr = hashed.substr(26);
    // 5. Check if the result starts with 'solace'
    if (addr.substring(0,6) == '501ace') {
      var address = ethers.utils.getAddress('0x'+addr);
      var salt = '0x'+saltToBytes;
      return [i, address, salt];
    }
  }
  throw "no solution found";
}

// returns true if a contract already exists at that address
async function _exists(address: string, factoryOrContractJson: ContractJSON) {
  //var contract = await ethers.getContractAt(factoryOrContractJson.abi, address);
  return false;
}

// deploy the contract
async function _deployer(wallet: Signer, bytecode: string, salt: string) {
  // TODO: check for existing contract before redeploy
  let tx = await singletonFactory.connect(wallet).deploy(bytecode, salt, {gasLimit: 10000000});
  await tx.wait();
}

// verify on etherscan
async function _verifier(address: string, args: any[] | undefined, contractPath: string) {
  var verifyArgs: any = {
    address: address,
    constructorArguments: args
  };
  if(contractPath != "") verifyArgs.contract = contractPath;
  try {
    await hardhat.run("verify:verify", verifyArgs);
  } catch(e) { /* probably already verified */ }
}
