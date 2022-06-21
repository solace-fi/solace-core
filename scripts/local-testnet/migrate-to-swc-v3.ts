// migrates to v3 of solace wallet coverage

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
import fs from "fs";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { RiskManager, Scp, CoverPaymentManager, SolaceCoverProduct, SolaceCoverProductV3 } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { abiEncodeArgs } from "../../test/utilities/setStorage";

// contract addresses
const SOLACE_ADDRESS                  = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const SCP_ADDRESS                     = "0x501ACE72166956F57b44dbBcc531A8E741449997";
const COVER_PAYMENT_MANAGER_ADDRESS   = "0x501aCe8EA57c0f83De8aEB179f32951181e36Fc1";
const SOLACE_COVER_PRODUCT_ADDRESS_V1 = "0x501ACEbe29eabc346779BcB5Fd62Eaf6Bfb5320E";
const SOLACE_COVER_PRODUCT_ADDRESS_V3 = "0x501ACeB72d62C9875825b71d9f78a27780B5624d";
const MULTICALL_ADDRESS               = ""; // TODO: fill this in

let artifacts: ArtifactImports;

//let solace: Solace;
let scp: Scp;
let coverPaymentManager: CoverPaymentManager;
let solaceCoverProductV1: SolaceCoverProduct;
let solaceCoverProductV3: SolaceCoverProductV3;
let multicall: any;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(SOLACE_ADDRESS);
  await expectDeployed(SCP_ADDRESS);
  await expectDeployed(COVER_PAYMENT_MANAGER_ADDRESS);
  await expectDeployed(SOLACE_COVER_PRODUCT_ADDRESS_V1);
  await expectDeployed(SOLACE_COVER_PRODUCT_ADDRESS_V3);
  await expectDeployed(MULTICALL_ADDRESS);

  //solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  scp = (await ethers.getContractAt(artifacts.SCP.abi, SCP_ADDRESS)) as Scp;
  coverPaymentManager = (await ethers.getContractAt(artifacts.CoverPaymentManager.abi, COVER_PAYMENT_MANAGER_ADDRESS)) as CoverPaymentManager;
  solaceCoverProductV1 = (await ethers.getContractAt(artifacts.SolaceCoverProduct.abi, SOLACE_COVER_PRODUCT_ADDRESS_V1)) as SolaceCoverProduct;
  solaceCoverProductV3 = (await ethers.getContractAt(artifacts.SolaceCoverProductV3.abi, SOLACE_COVER_PRODUCT_ADDRESS_V3)) as SolaceCoverProductV3;
  multicall = await ethers.getContractAt(artifacts.Multicall.abi, MULTICALL_ADDRESS);

  // deploy contracts
  //await fetchAccountBalances();
  await mintScp();
  //await fetchPolicies();
  //await mintPolicies();
  await pauseV1();
}

async function fetchAccountBalances() {
  let balances = [];
  let policyCount = (await solaceCoverProductV1.policyCount()).toNumber();
  for(let i = 1; i <= policyCount; ++i) {
    let policyholder = await solaceCoverProductV1.ownerOf(i);
    let balance = (await solaceCoverProductV1.accountBalanceOf(policyholder)).toString();
    let rewardPoints = (await solaceCoverProductV1.rewardPointsOf(policyholder)).toString();
    balances.push({account: policyholder, balance: balance, rewardPoints: rewardPoints});
  }
  console.log(JSON.stringify(balances, undefined, 2));
}

async function mintScp() {
  let balances = JSON.parse(fs.readFileSync('./stash/data/rinkeby/scpBalances.json').toString());

  let txs = []
  for(let i = 0; i < balances.length; ++i) {
    if(balances[i].balance != "0") txs.push(encodeMint(balances[i].account, balances[i].balance, 1));
    if(balances[i].rewardPoints != "0") txs.push(encodeMint(balances[i].account, balances[i].rewardPoints, 0));
  }
  if(txs.length == 0) return;

  if(!(await scp.isScpMover(signerAddress))) {
    console.log("Adding deployer as scp mover");
    txs.unshift('0x95a81cb8000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000501ace0e8d16b92236763e2ded7ae3bc2dffa27600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001')
  }

  console.log('minting scp');

  console.log("Removing deployer as scp mover");
  txs.push('0x95a81cb8000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000501ace0e8d16b92236763e2ded7ae3bc2dffa27600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000');

  let tx3 = await scp.connect(deployer).multicall(txs, networkSettings.overrides);
  await tx3.wait(networkSettings.confirmations);
}

function encodeMint(account:any, amount:any, isRefundable:any) {
  return `0xd1a1beb4${abiEncodeArgs([account, amount, isRefundable])}`
}

async function fetchPolicies() {
  let policies = [];
  let policyCount = (await solaceCoverProductV1.policyCount()).toNumber();
  for(let i = 1; i <= policyCount; ++i) {
    let policyholder = await solaceCoverProductV1.ownerOf(i);
    let coverLimit = (await solaceCoverProductV1.coverLimitOf(i)).toString();
    policies.push({policyID: i, policyholder, coverLimit})
  }
  console.log(JSON.stringify(policies, undefined, 2));
}

async function mintPolicies() {
  let policies = JSON.parse(fs.readFileSync('./stash/data/rinkeby/policies.json').toString());

  let txs = []
  for(let i = 0; i < policies.length; ++i) {
    let callData = encodePurchase(policies[i].policyholder, policies[i].coverLimit);
    txs.push({target: solaceCoverProductV3.address, callData});
  }
  if(txs.length == 0) return;

  console.log("purchasing policies");
  let tx = await multicall.connect(deployer).aggregate(txs, networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
}

function encodePurchase(account:any, coverLimit:any) {
  return `0x8de93222${abiEncodeArgs([account, coverLimit])}`
}

async function pauseV1() {
  if(!(await solaceCoverProductV1.paused())) {
    console.log("pausing spi v1");
    let tx = await solaceCoverProductV1.connect(deployer).setPaused(true, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
