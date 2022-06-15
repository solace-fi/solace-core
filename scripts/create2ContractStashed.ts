import { Signer } from "@ethersproject/abstract-signer";
import { deployContract } from "ethereum-waffle";
import { ContractJSON } from "ethereum-waffle/dist/esm/ContractJSON";
import { Contract, BigNumber as BN } from "ethers";
import { keccak256, bufferToHex } from "ethereumjs-util";
import { readFileSync, writeFileSync } from "fs";

import axios from "axios";

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;

import { isDeployed } from "../test/utilities/expectDeployed";
import { getNetworkSettings } from "./getNetworkSettings";

export async function create2ContractStashed(contractName:string, bytecodeFile:string, solidityFile:string, deployerWallet:any, deployerContractAddress:string, deploymentAddress:string, constructorArguments:string) {
  let chainID = (await provider.getNetwork()).chainId;
  let networkSettings: any = getNetworkSettings(chainID);
  networkSettings.overrides.gasLimit = 6000000;
  // step 1: deploy
  let deploy = true;
  var alreadyDeployed = await isDeployed(deploymentAddress);
  if(alreadyDeployed) console.log(`already deployed to ${deploymentAddress}, skipping`);
  else if(!deploy) console.log('skipping deployment');
  else {
    let bytecode;
    try {
      bytecode = readFileSync(bytecodeFile).toString().trim();
    } catch(e) {
      console.error(`Could not read ${bytecodeFile}`);
      throw e;
    }
    let tx = await deployerWallet.sendTransaction({...networkSettings.overrides, to: deployerContractAddress, gasLimit: 5000000, data: bytecode});
    await tx.wait(networkSettings.confirmations);
    await _sleeper(10000);
  }

  // step 2.1: verify on etherscan
  if(!networkSettings.etherscanSettings) return;
  let solidity;
  try {
    solidity = readFileSync(solidityFile).toString();
  } catch(e) {
    console.error(`Could not read ${solidityFile}`);
    throw e;
  }
  console.log('verifying')
  let params = new URLSearchParams();
  params.append("apikey", networkSettings.etherscanSettings.apikey);
  params.append("module", "contract");
  params.append("action", "verifysourcecode");
  params.append("sourceCode", solidity);
  params.append("contractAddress", deploymentAddress);
  params.append("codeformat", "solidity-single-file");
  params.append("contractName", contractName);
  params.append("compilerversion", "v0.8.6+commit.11564f7e");
  params.append("optimizationUsed", "1");
  params.append("runs", "800");
  params.append("constructorArguments", constructorArguments);
  params.append("licenseType", "5");
  let res = await axios.post(networkSettings.etherscanSettings.url, params)
  console.log(res.data);
  if(res.data.status != '1') {
    console.log('error verifying contract')
    return;
  }
  let guid = res.data.result;
  await _sleeper(60000);

  // step 2.2: verify verification
  let params2 = new URLSearchParams();
  params2.append("apikey", networkSettings.etherscanSettings.apikey);
  params2.append("guid", guid);
  params2.append("module", "contract");
  params2.append("action", "checkverifystatus");
  let res2 = await axios.post(networkSettings.etherscanSettings.url, params)
  console.log(res2.data)
}

async function _sleeper(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
