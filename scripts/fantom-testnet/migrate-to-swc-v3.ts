// migrates to v3 of solace wallet coverage

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
import fs from "fs";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { RiskManager, Scp, CoverPaymentManager, SolaceCoverProductV2, SolaceCoverProductV3 } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { abiEncodeArgs } from "../../test/utilities/setStorage";

// contract addresses
const SOLACE_ADDRESS                  = "0x501ACE0C6DeA16206bb2D120484a257B9F393891";
const SCP_ADDRESS                     = "0x501acE73cF81312D02d40A02a9a6e656038aa9A3";
const COVER_PAYMENT_MANAGER_ADDRESS   = "0x501Ace82f6C1e584656a3B3ba528bc8b86EB2160";
const SOLACE_COVER_PRODUCT_ADDRESS_V2 = "0x501ACe36fF9078aEA9b9Cc43a4e329f01361764e";
const SOLACE_COVER_PRODUCT_ADDRESS_V3 = "0x501aCeAe7Cc16A145C88EE581d03D37068254e90";
const MULTICALL_ADDRESS               = "0x8f81207F59A4f86d68608fF90b259A0927242967";

let artifacts: ArtifactImports;

//let solace: Solace;
let scp: Scp;
let coverPaymentManager: CoverPaymentManager;
let solaceCoverProductV2: SolaceCoverProductV2;
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
  await expectDeployed(SOLACE_COVER_PRODUCT_ADDRESS_V2);
  await expectDeployed(SOLACE_COVER_PRODUCT_ADDRESS_V3);
  await expectDeployed(MULTICALL_ADDRESS);

  scp = (await ethers.getContractAt(artifacts.SCP.abi, SCP_ADDRESS)) as Scp;
  coverPaymentManager = (await ethers.getContractAt(artifacts.CoverPaymentManager.abi, COVER_PAYMENT_MANAGER_ADDRESS)) as CoverPaymentManager;
  solaceCoverProductV2 = (await ethers.getContractAt(artifacts.SolaceCoverProductV2.abi, SOLACE_COVER_PRODUCT_ADDRESS_V2)) as SolaceCoverProductV2;
  solaceCoverProductV3 = (await ethers.getContractAt(artifacts.SolaceCoverProductV3.abi, SOLACE_COVER_PRODUCT_ADDRESS_V3)) as SolaceCoverProductV3;
  multicall = await ethers.getContractAt(artifacts.Multicall.abi, MULTICALL_ADDRESS);

  // deploy contracts
  //await fetchPolicies();
  //await mintScp();
  //await mintPolicies();
  //await pauseV2();
}

async function fetchPolicies() {
  let policies = [];
  let policyCount = (await solaceCoverProductV2.policyCount()).toNumber();
  console.log(`fetching ${policyCount} policies (this may take a while)`);
  for(let policyID = 1; policyID <= policyCount; ++policyID) {
    let policyholder = await solaceCoverProductV2.ownerOf(policyID);
    let [coverLimit, balance, rewardPoints] = await Promise.all([
      solaceCoverProductV2.coverLimitOf(policyID).then(r=>r.toString()),
      solaceCoverProductV2.accountBalanceOf(policyholder).then(r=>r.toString()),
      solaceCoverProductV2.rewardPointsOf(policyholder).then(r=>r.toString()),
    ]);
    policies.push({policyID, policyholder, coverLimit, balance, rewardPoints});
  }
  let res = JSON.stringify(policies, undefined, 2);
  fs.writeFileSync('./stash/data/mumbai/policies.json', res);
  console.log(res);
}

async function mintScp() {
  let policies = JSON.parse(fs.readFileSync('./stash/data/mumbai/policies.json').toString());

  let txs = []
  for(let i = 0; i < policies.length; ++i) {
    if(policies[i].balance != "0") txs.push(encodeMint(policies[i].policyholder, policies[i].balance, 1));
    if(policies[i].rewardPoints != "0") txs.push(encodeMint(policies[i].policyholder, policies[i].rewardPoints, 0));
  }
  if(txs.length == 0) return;

  if(!(await scp.isScpMover(signerAddress))) {
    console.log("Adding deployer as scp mover");
    txs.unshift('0x95a81cb8000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000501ace0e8d16b92236763e2ded7ae3bc2dffa27600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001')
  }

  console.log('minting scp');

  console.log("Removing deployer as scp mover");
  txs.push('0x95a81cb8000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000501ace0e8d16b92236763e2ded7ae3bc2dffa27600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000');

  let groupSize = 100;
  for(var i = 0; i < txs.length; i += groupSize) {
    let txs2 = txs.slice(i, i+groupSize);
    console.log(`sending txs ${i}-${i+txs2.length} of ${txs.length}`);
    let tx3 = await scp.connect(deployer).multicall(txs2, {...networkSettings.overrides, gasLimit: 10000000});
    await tx3.wait(networkSettings.confirmations);
  }
}

function encodeMint(account:any, amount:any, isRefundable:any) {
  return `0xd1a1beb4${abiEncodeArgs([account, amount, isRefundable])}`
}

async function mintPolicies() {
  let policies = JSON.parse(fs.readFileSync('./stash/data/mumbai/policies.json').toString());

  let txs = []
  for(let i = 0; i < policies.length; ++i) {
    let callData = encodePurchase(policies[i].policyholder, policies[i].coverLimit);
    txs.push({target: solaceCoverProductV3.address, callData});
  }
  if(txs.length == 0) return;

  console.log("purchasing policies");
  let groupSize = 50;
  for(var i = 0; i < txs.length; i += groupSize) {
    let txs2 = txs.slice(i, i+groupSize);
    console.log(`sending txs ${i}-${i+txs2.length} of ${txs.length}`);
    let tx3 = await multicall.connect(deployer).aggregate(txs2, {...networkSettings.overrides, gasLimit: 10000000});
    await tx3.wait(networkSettings.confirmations);
  }
}

function encodePurchase(account:any, coverLimit:any) {
  return `0x8de93222${abiEncodeArgs([account, coverLimit])}`
}

async function pauseV2() {
  if(!(await solaceCoverProductV2.paused())) {
    console.log("pausing spi v2");
    let tx = await solaceCoverProductV2.connect(deployer).setPaused(true, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
