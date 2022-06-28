// deploys v2 of staking rewards

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { create2Contract } from "./../create2Contract";

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Registry, Scp, CoverPaymentManager, StakingRewards, StakingRewardsV2, XsLocker, Solace } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { toAbiEncoded } from "../../test/utilities/setStorage";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

// contract addresses
const SOLACE_ADDRESS                 = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSLOCKER_ADDRESS               = "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1";
const REGISTRY_ADDRESS               = "0x501ACe0f576fc4ef9C0380AA46A578eA96b85776";
const SCP_ADDRESS                    = "0x501ACE72166956F57b44dbBcc531A8E741449997";
const COVER_PAYMENT_MANAGER_ADDRESS  = "0x501acE7a18b0F59E51eb198cD73480F8467DE100";
const STAKING_REWARDS_V1_ADDRESS     = "0x501ace3D42f9c8723B108D4fBE29989060a91411";
const STAKING_REWARDS_V2_ADDRESS     = "0x501ACee6350BB566EBE4A0dABDC9901100B8c445";
const ZERO_ADDRESS                   = "0x0000000000000000000000000000000000000000";

let artifacts: ArtifactImports;

let solace: Solace;
let xslocker: XsLocker;
let stakingRewardsV1: StakingRewards;
let stakingRewardsV2: StakingRewardsV2;

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
  await expectDeployed(REGISTRY_ADDRESS);
  await expectDeployed(SCP_ADDRESS);
  await expectDeployed(COVER_PAYMENT_MANAGER_ADDRESS);
  await expectDeployed(XSLOCKER_ADDRESS);
  await expectDeployed(STAKING_REWARDS_V1_ADDRESS);

  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, XSLOCKER_ADDRESS)) as XsLocker;
  stakingRewardsV1 = (await ethers.getContractAt(artifacts.StakingRewards.abi, STAKING_REWARDS_V1_ADDRESS)) as StakingRewards;

  // deploy contracts
  await deployStakingRewardsV2();
  await migrateToStakingV2();
  //await checkStakingV1Rewards();

  // log addresses
  await logAddresses();
}

async function deployStakingRewardsV2() {
  const startTime = BN.from("1643655600"); // 11 AM PST / 7 PM UTC January 31 2022
  const endTime = 1673978400; // Monday January 17, 2023 10 AM PST / 6 PM UTC
  const solacePerSecond = BN.from("63419583967529173");

  if(await isDeployed(STAKING_REWARDS_V2_ADDRESS)) {
    stakingRewardsV2 = (await ethers.getContractAt(artifacts.StakingRewardsV2.abi, STAKING_REWARDS_V2_ADDRESS)) as StakingRewardsV2;
  } else {
    console.log("Deploying StakingRewardsV2");
    const res = await create2Contract(deployer, artifacts.StakingRewardsV2, [signerAddress, REGISTRY_ADDRESS], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    stakingRewardsV2 = (await ethers.getContractAt(artifacts.StakingRewardsV2.abi, res.address)) as StakingRewardsV2;
    console.log(`Deployed StakingRewards to ${stakingRewardsV2.address}`);

    console.log("staking rewards - registering in xslocker");
    let tx1 = await xslocker.connect(deployer).addXsLockListener(stakingRewardsV2.address, networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
    console.log("staking rewards - set rewards");
    let tx2 = await stakingRewardsV2.connect(deployer).setRewards(solacePerSecond, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
    console.log("staking rewards - set times");
    let tx3 = await stakingRewardsV2.connect(deployer).setTimes(startTime, endTime, networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);
  }
}

async function migrateToStakingV2() {
  // remove old rewards
  if((await stakingRewardsV1.rewardPerSecond()).gt(0)) {
    console.log("staking rewards - pausing rewards");
    let tx2 = await stakingRewardsV1.connect(deployer).setRewards(0, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations)
  }
  let listeners = await xslocker.getXsLockListeners();
  if(listeners.includes(stakingRewardsV1.address)) {
    console.log("staking rewards - unregistering in xslocker");
    let tx1 = await xslocker.connect(deployer).removeXsLockListener(stakingRewardsV1.address, networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
  }
  let bal = await solace.balanceOf(stakingRewardsV1.address);
  if(bal.gt(0)) {
    console.log("rescuing solace");
    let tx3 = await stakingRewardsV1.connect(deployer).rescueTokens(solace.address, bal, stakingRewardsV2.address, networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);
  }

  let supply = (await xslocker.totalSupply()).toNumber();
  let lockIDs = [];
  for(var i = 0; i < supply; ++i) {
    let lockID = await xslocker.tokenByIndex(i);
    let lockInfo = await stakingRewardsV2.stakedLockInfo(lockID);
    if(lockInfo.value.eq(0) && lockInfo.owner == ZERO_ADDRESS) {
      console.log(`registering lock ${lockID}`);
      lockIDs.push(lockID);
    }
  }
  if(lockIDs.length > 0) {
    console.log(`migrating ${lockIDs.length} locks`);
    let groupSize = 35;
    for(var i = 0; i < lockIDs.length; i += groupSize) {
      let lockIDs2 = lockIDs.slice(i, i+groupSize);
      console.log(`sending txs ${i}-${i+lockIDs2.length} of ${lockIDs.length}`);
      let tx = await stakingRewardsV2.connect(deployer).migrate(stakingRewardsV1.address, lockIDs2, {...networkSettings.overrides, gasLimit: 5000000});
      await tx.wait(networkSettings.confirmations);
    }
  }
}

async function checkStakingV1Rewards() {
  let supply = (await xslocker.totalSupply()).toNumber();
  for(var i = 0; i < supply; ++i) {
    let lockID = await xslocker.tokenByIndex(i);
    let rewards = await stakingRewardsV1.pendingRewardsOfLock(lockID);
    console.log(`${lockID}: ${ethers.utils.formatUnits(rewards)}`);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("StakingRewardsV1", stakingRewardsV1.address);
  logContractAddress("StakingRewardsV2", stakingRewardsV2.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
