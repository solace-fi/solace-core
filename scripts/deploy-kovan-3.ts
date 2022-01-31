import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { create2Contract } from "./create2Contract";

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Deployer, Solace, XsLocker, XSolace, StakingRewards, XSolaceMigrator, FarmRewards, FarmRewardsV2 } from "../typechain";
import { isDeployed } from "../test/utilities/expectDeployed";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSOLACE_V1_ADDRESS            = "0x501AcE5aC3Af20F49D53242B6D208f3B91cfc411";
const FARM_REWARDS_V1_ADDRESS       = "0x501aCE3c1A6aA2f1C00A5A7F32B171e648e542F9";

const XSLOCKER_ADDRESS              = "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1";
const STAKING_REWARDS_ADDRESS       = "0x501ace3D42f9c8723B108D4fBE29989060a91411";
const XSOLACE_ADDRESS               = "0x501ACe802447B1Ed4Aae36EA830BFBde19afbbF9";
const XSOLACE_MIGRATOR_ADDRESS      = "0x501aCe6Ce61D1fFecdade5BB04539809Bc301FeE";
const FARM_REWARDS_V2_ADDRESS       = "0x501acEA5a5B21f863215385C1EDaA46eeB562328";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let solace: Solace;
let xslocker: XsLocker;
let xsolace: XSolace;
let stakingRewards: StakingRewards;
let migrator: XSolaceMigrator;
let farmRewards: FarmRewards;
let farmRewardsv2: FarmRewardsV2;

let signerAddress: string;
async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  if((await provider.getNetwork()).chainId == 31337) { // testnet
    console.log('funding')
    var [funder] = await hardhat.ethers.getSigners();
    let tx = await funder.sendTransaction({to: signerAddress, value: BN.from("100000000000000000000")});
    await tx.wait();
  }

  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;

  // new staking
  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  await deployXSLocker();
  await deployStakingRewards();
  await deployXSOLACE();
  await deployMigrator();
  await deployFarmRewards();

  await logAddresses();
}

async function deployXSLocker() {
  if(await isDeployed(XSLOCKER_ADDRESS)) {
    xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, XSLOCKER_ADDRESS)) as unknown as XsLocker;
  } else {
    console.log("Deploying xsLocker");
    var res = await create2Contract(deployer, artifacts.xsLocker, [signerAddress, SOLACE_ADDRESS], {}, "", deployerContract.address);
    xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, res.address)) as unknown as XsLocker;
    console.log(`Deployed xsLocker to ${xslocker.address}`);
  }
}

async function deployStakingRewards() {
  const startTime = 1642442400; // Monday January 17, 2022 10 AM PST / 6 PM UTC
  const endTime = 1673978400; // Monday January 17, 2023 10 AM PST / 6 PM UTC
  const solacePerYear = BN.from("10000000000000000000000000"); // 10M/yr
  const solacePerSecond = BN.from("317097919837645865");

  if(await isDeployed(STAKING_REWARDS_ADDRESS)) {
    stakingRewards = (await ethers.getContractAt(artifacts.StakingRewards.abi, STAKING_REWARDS_ADDRESS)) as StakingRewards;
  } else {
    console.log("Deploying StakingRewards");
    var res = await create2Contract(deployer, artifacts.StakingRewards, [signerAddress, SOLACE_ADDRESS, xslocker.address, solacePerSecond], {}, "", deployerContract.address);
    stakingRewards = (await ethers.getContractAt(artifacts.StakingRewards.abi, res.address)) as StakingRewards;
    console.log(`Deployed StakingRewards to ${stakingRewards.address}`);
  }
  /*
  console.log("staking rewards - registering in xslocker");
  let tx1 = await xslocker.connect(deployer).addXsLockListener(stakingRewards.address);
  await tx1.wait();
  console.log("staking rewards - set rewards");
  let tx2 = await stakingRewards.connect(deployer).setRewards(solacePerSecond);
  await tx2.wait();
  console.log("staking rewards - set times");
  let tx3 = await stakingRewards.connect(deployer).setTimes(startTime, endTime);
  await tx3.wait();
  console.log("staking rewards - minting solace");
  let tx4 = await solace.connect(deployer).mint(stakingRewards.address, solacePerYear);
  await tx4.wait();
  */
}

async function deployXSOLACE() {
  if(await isDeployed(XSOLACE_ADDRESS)) {
    xsolace = (await ethers.getContractAt(artifacts.xSOLACE.abi, XSOLACE_ADDRESS)) as XSolace;
  } else {
    console.log("Deploying xSOLACE");
    var res = await create2Contract(deployer, artifacts.xSOLACE, [xslocker.address], {}, "", deployerContract.address);
    xsolace = (await ethers.getContractAt(artifacts.xSOLACE.abi, res.address)) as XSolace;
    console.log(`Deployed xSOLACE to ${xsolace.address}`);
  }
}

async function deployMigrator() {
  if(await isDeployed(XSOLACE_MIGRATOR_ADDRESS)) {
    migrator = (await ethers.getContractAt(artifacts.xSolaceMigrator.abi, XSOLACE_MIGRATOR_ADDRESS)) as XSolaceMigrator;
  } else {
    console.log("Deploying xSOLACE Migrator");
    var res = await create2Contract(deployer, artifacts.xSolaceMigrator, [SOLACE_ADDRESS, XSOLACE_V1_ADDRESS, xslocker.address], {}, "", deployerContract.address);
    migrator = (await ethers.getContractAt(artifacts.xSolaceMigrator.abi, res.address)) as XSolaceMigrator;
    console.log(`Deployed xSOLACE Migrator to ${migrator.address}`);
  }
}

async function deployFarmRewards() {
  farmRewards = (await ethers.getContractAt(artifacts.FarmRewards.abi, FARM_REWARDS_V1_ADDRESS)) as FarmRewards;
  if(await isDeployed(FARM_REWARDS_V2_ADDRESS)) {
    farmRewardsv2 = (await ethers.getContractAt(artifacts.FarmRewardsV2.abi, FARM_REWARDS_V2_ADDRESS)) as FarmRewardsV2;
  } else {
    console.log("Deploying FarmRewardsV2");
    let receiver = "0xc47911f768c6fE3a9fe076B95e93a33Ed45B7B34"; // mainnet core multisig
    var res = await create2Contract(deployer, artifacts.FarmRewardsV2, [signerAddress, SOLACE_ADDRESS, XSOLACE_V1_ADDRESS, FARM_REWARDS_V1_ADDRESS, xslocker.address, receiver], {}, "", deployerContract.address);
    farmRewardsv2 = (await ethers.getContractAt(artifacts.FarmRewardsV2.abi, res.address)) as FarmRewardsV2;
    console.log(`Deployed FarmRewardsV2 to ${farmRewardsv2.address}`);
  }
  /*
  if((await farmRewards.governance()) === (signerAddress) && (await farmRewards.pendingGovernance()) !== farmRewardsv2.address) {
    console.log('FarmRewardsV1 set pending governance');
    let tx = await farmRewards.connect(deployer).setPendingGovernance(farmRewardsv2.address);
    await tx.wait();
  }
  if((await farmRewards.pendingGovernance()) === (farmRewardsv2.address)) {
    console.log('FarmRewardsV2 accept V1 governance');
    let tx = await farmRewardsv2.connect(deployer).acceptFarmRewardsV1Governance();
    await tx.wait();
  }
  */
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SOLACE", SOLACE_ADDRESS);
  logContractAddress("xSOLACEV1", XSOLACE_V1_ADDRESS);
  logContractAddress("xsLocker", xslocker.address);
  logContractAddress("StakingRewards", stakingRewards.address);
  logContractAddress("xSOLACE", xsolace.address);
  logContractAddress("xSolaceMigrator", migrator.address);
  logContractAddress("FarmRewards", farmRewards.address);
  logContractAddress("FarmRewardsV2", farmRewardsv2.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
