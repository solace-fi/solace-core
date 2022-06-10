// deploys the staking contracts

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { create2ContractStashed } from "./../create2ContractStashed";

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Solace, XsLocker, XSolace, StakingRewards } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { abiEncodeArgs } from "../../test/utilities/setStorage";

const DEPLOYER_CONTRACT_ADDRESS     = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";
const SOLACE_ADDRESS                = "0x501ACE0C6DeA16206bb2D120484a257B9F393891";
const XSLOCKER_ADDRESS              = "0x501ACebF0918c99546b65cEdCD430e0D4A8E9167";
const STAKING_REWARDS_ADDRESS       = "0x501ACe4D89f596296C66f14D087a4BbB53Ed2049";
const XSOLACE_ADDRESS               = "0x501ACEF0358fb055027A89AE46387a53C75498e0";

let artifacts: ArtifactImports;
let solace: Solace;
let xslocker: XsLocker;
let xsolace: XSolace;
let stakingRewards: StakingRewards;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await deploySOLACE();
  await deployXSLocker();
  await deployStakingRewards();
  await deployXSOLACE();

  await logAddresses();
}

async function deploySOLACE() {
  if(await isDeployed(SOLACE_ADDRESS)) {
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    await create2ContractStashed(
      "SOLACE",
      "scripts/contract_deploy_bytecodes_aurora_testnet/SOLACE.txt",
      "stash/contracts_processed/SOLACE.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      SOLACE_ADDRESS,
      abiEncodeArgs([signerAddress])
    );
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
    console.log(`Deployed SOLACE to ${solace.address}`);

    console.log("Adding deployer as SOLACE minter");
    let tx2 = await solace.connect(deployer).addMinter(signerAddress, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
    console.log("Added deployer as SOLACE minter");
  }
}

async function deployXSLocker() {
  if(await isDeployed(XSLOCKER_ADDRESS)) {
    xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, XSLOCKER_ADDRESS)) as unknown as XsLocker;
  } else {
    console.log("Deploying xsLocker");
    await create2ContractStashed(
      "xsLocker",
      "scripts/contract_deploy_bytecodes_aurora_testnet/staking/xsLocker.txt",
      "stash/contracts_processed/staking/xsLocker.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      XSLOCKER_ADDRESS,
      abiEncodeArgs([signerAddress, SOLACE_ADDRESS])
    );
    xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, XSLOCKER_ADDRESS)) as unknown as XsLocker;
    console.log(`Deployed xsLocker to ${xslocker.address}`);
  }
}

async function deployStakingRewards() {
  const startTime = BN.from("1643655600"); // 11 AM PST / 7 PM UTC January 31 2022
  const endTime = 1673978400; // Monday January 17, 2023 10 AM PST / 6 PM UTC
  const solacePerYear = BN.from("10000000000000000000000000"); // 10M/yr
  const solacePerSecond = BN.from("317097919837645865");

  if(await isDeployed(STAKING_REWARDS_ADDRESS)) {
    stakingRewards = (await ethers.getContractAt(artifacts.StakingRewards.abi, STAKING_REWARDS_ADDRESS)) as StakingRewards;
  } else {
    console.log("Deploying StakingRewards");
    await create2ContractStashed(
      "StakingRewards",
      "scripts/contract_deploy_bytecodes_aurora_testnet/staking/StakingRewards.txt",
      "stash/contracts_processed/staking/StakingRewards.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      STAKING_REWARDS_ADDRESS,
      abiEncodeArgs([signerAddress, SOLACE_ADDRESS, XSLOCKER_ADDRESS, solacePerSecond])
    );
    stakingRewards = (await ethers.getContractAt(artifacts.StakingRewards.abi, STAKING_REWARDS_ADDRESS)) as StakingRewards;
    console.log(`Deployed StakingRewards to ${stakingRewards.address}`);

    console.log("staking rewards - registering in xslocker");
    let tx1 = await xslocker.connect(deployer).addXsLockListener(stakingRewards.address, networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
    console.log("staking rewards - set rewards");
    let tx2 = await stakingRewards.connect(deployer).setRewards(solacePerSecond, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
    console.log("staking rewards - set times");
    let tx3 = await stakingRewards.connect(deployer).setTimes(startTime, endTime, networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);
    console.log("staking rewards - minting SOLACE");
    let tx4 = await solace.connect(deployer).mint(stakingRewards.address, solacePerYear, networkSettings.overrides);
    await tx4.wait(networkSettings.confirmations);
  }
}

async function deployXSOLACE() {
  if(await isDeployed(XSOLACE_ADDRESS)) {
    xsolace = (await ethers.getContractAt(artifacts.xSOLACE.abi, XSOLACE_ADDRESS)) as XSolace;
  } else {
    console.log("Deploying xSOLACE");
    await create2ContractStashed(
      "xSOLACE",
      "scripts/contract_deploy_bytecodes_aurora_testnet/staking/xSOLACE.txt",
      "stash/contracts_processed/staking/xSOLACE.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      XSOLACE_ADDRESS,
      abiEncodeArgs([XSLOCKER_ADDRESS])
    );
    xsolace = (await ethers.getContractAt(artifacts.xSOLACE.abi, XSOLACE_ADDRESS)) as XSolace;
    console.log(`Deployed xSOLACE to ${xsolace.address}`);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SOLACE", solace.address);
  logContractAddress("xsLocker", xslocker.address);
  logContractAddress("StakingRewards", stakingRewards.address);
  logContractAddress("xSOLACE", xsolace.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
