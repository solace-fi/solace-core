// deploys contracts that assist in v1 -> v2 staking migration

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { create2Contract } from "./../create2Contract";

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Deployer, Solace, XsLocker, XSolace, StakingRewards, XSolaceMigrator, FarmRewards, FarmRewardsV2 } from "../../typechain";
import { getNetworkSettings } from "../getNetworkSettings";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSLOCKER_ADDRESS              = "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1";
const XSOLACE_V1_ADDRESS            = "0x501AcE5aC3Af20F49D53242B6D208f3B91cfc411";
const XSOLACE_ADDRESS               = "0x501ACe802447B1Ed4Aae36EA830BFBde19afbbF9";
const XSOLACE_MIGRATOR_ADDRESS      = "0x501aCe6Ce61D1fFecdade5BB04539809Bc301FeE";
const FARM_REWARDS_V1_ADDRESS       = "0x501aCE3c1A6aA2f1C00A5A7F32B171e648e542F9";
const FARM_REWARDS_V2_ADDRESS       = "0x501acEA5a5B21f863215385C1EDaA46eeB562328";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let migrator: XSolaceMigrator;
let farmRewardsv1: FarmRewards;
let farmRewardsv2: FarmRewardsV2;

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
  await expectDeployed(XSOLACE_V1_ADDRESS);
  await expectDeployed(FARM_REWARDS_V1_ADDRESS);
  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  farmRewardsv1 = (await ethers.getContractAt(artifacts.FarmRewards.abi, FARM_REWARDS_V1_ADDRESS)) as FarmRewards;
  await deployMigrator();
  await deployFarmRewardsV2();

  await logAddresses();
}

async function deployMigrator() {
  if(await isDeployed(XSOLACE_MIGRATOR_ADDRESS)) {
    migrator = (await ethers.getContractAt(artifacts.xSolaceMigrator.abi, XSOLACE_MIGRATOR_ADDRESS)) as XSolaceMigrator;
  } else {
    console.log("Deploying xSOLACE Migrator");
    var res = await create2Contract(deployer, artifacts.xSolaceMigrator, [SOLACE_ADDRESS, XSOLACE_V1_ADDRESS, XSLOCKER_ADDRESS], {}, "", deployerContract.address);
    migrator = (await ethers.getContractAt(artifacts.xSolaceMigrator.abi, res.address)) as XSolaceMigrator;
    console.log(`Deployed xSOLACE Migrator to ${migrator.address}`);
  }
}

async function deployFarmRewardsV2() {
  if(await isDeployed(FARM_REWARDS_V2_ADDRESS)) {
    farmRewardsv2 = (await ethers.getContractAt(artifacts.FarmRewardsV2.abi, FARM_REWARDS_V2_ADDRESS)) as FarmRewardsV2;
  } else {
    console.log("Deploying FarmRewardsV2");
    let receiver = "0xc47911f768c6fE3a9fe076B95e93a33Ed45B7B34"; // mainnet core multisig
    var res = await create2Contract(deployer, artifacts.FarmRewardsV2, [signerAddress, SOLACE_ADDRESS, XSOLACE_V1_ADDRESS, FARM_REWARDS_V1_ADDRESS, XSLOCKER_ADDRESS, receiver], {}, "", deployerContract.address);
    farmRewardsv2 = (await ethers.getContractAt(artifacts.FarmRewardsV2.abi, res.address)) as FarmRewardsV2;
    console.log(`Deployed FarmRewardsV2 to ${farmRewardsv2.address}`);
  }
  if((await farmRewardsv1.governance()) === (signerAddress) && (await farmRewardsv1.pendingGovernance()) !== farmRewardsv2.address) {
    console.log('FarmRewardsV1 set pending governance');
    let tx = await farmRewardsv1.connect(deployer).setPendingGovernance(farmRewardsv2.address, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
  if((await farmRewardsv1.pendingGovernance()) === (farmRewardsv2.address)) {
    console.log('FarmRewardsV2 accept V1 governance');
    let tx = await farmRewardsv2.connect(deployer).acceptFarmRewardsV1Governance(networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SOLACE", SOLACE_ADDRESS);
  logContractAddress("xSOLACEV1", XSOLACE_V1_ADDRESS);
  logContractAddress("xSOLACE", XSOLACE_ADDRESS);
  logContractAddress("xSolaceMigrator", migrator.address);
  logContractAddress("FarmRewardsV1", farmRewardsv1.address);
  logContractAddress("FarmRewardsV2", farmRewardsv2.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
