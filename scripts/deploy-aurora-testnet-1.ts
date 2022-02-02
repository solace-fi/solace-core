import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.AURORA_TESTNET_ACCOUNTS || '[]')[0], provider);

import { create2ContractAuroraTestnet } from "./create2ContractAuroraTestnet";

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Deployer, Solace, Faucet, XsLocker, XSolace, StakingRewards, BridgeWrapper } from "../typechain";
import { expectDeployed, isDeployed } from "../test/utilities/expectDeployed";

const SINGLETON_FACTORY_ADDRESS     = "0x941F6f17Eade71E88D926FD9ca020dB535bDe573";
const DEPLOYER_CONTRACT_ADDRESS     = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";
const SOLACE_ADDRESS                = "0x501ACE0C6DeA16206bb2D120484a257B9F393891";
const FAUCET_ADDRESS                = "0x501acEC6005979Be31C0c1d962A922c3a609C71D";
const XSLOCKER_ADDRESS              = "0x501ACebF0918c99546b65cEdCD430e0D4A8E9167";
const STAKING_REWARDS_ADDRESS       = "0x501ACe4D89f596296C66f14D087a4BbB53Ed2049";
const XSOLACE_ADDRESS               = "0x501ACEF0358fb055027A89AE46387a53C75498e0";
const BSOLACE_ADDRESS               = "0x38373AEF7C0ebaF67530A46e49981e77c68A829F";
const BRIDGE_WRAPPER_ADDRESS        = "0x501ACeed7aae8875aC8bb881e6849979f91Ea160";

let artifacts: ArtifactImports;
let deployerContract: Deployer;
let solace: Solace;
let faucet: Faucet;
let xslocker: XsLocker;
let xsolace: XSolace;
let stakingRewards: StakingRewards;
let wrapper: BridgeWrapper;

let signerAddress: string;
//let multisigAddress = "0xc47911f768c6fE3a9fe076B95e93a33Ed45B7B34";

const ONE_ETHER = BN.from("1000000000000000000");

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  await deploySingletonFactory();
  await deployDeployerContract();
  await deploySOLACE();
  await deployFaucet();
  await deployXSLocker();
  await deployStakingRewards();
  await deployXSOLACE();
  await deployBridgeWrapper();

  await logAddresses();
}

async function deploySingletonFactory() {
  if(await isDeployed(SINGLETON_FACTORY_ADDRESS)) {
  } else {
    console.log("deploying singleton factory");
    let tx = await deployer.sendTransaction({
      data: '0x608060405234801561001057600080fd5b50610134806100206000396000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c80634af63f0214602d575b600080fd5b60cf60048036036040811015604157600080fd5b810190602081018135640100000000811115605b57600080fd5b820183602082011115606c57600080fd5b80359060200191846001830284011164010000000083111715608d57600080fd5b91908080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250929550509135925060eb915050565b604080516001600160a01b039092168252519081900360200190f35b6000818351602085016000f5939250505056fea26469706673582212206b44f8a82cb6b156bfcc3dc6aadd6df4eefd204bc928a4397fd15dacf6d5320564736f6c63430006020033',
      gasLimit: 247000
    });
    await tx.wait(10);
    await expectDeployed(SINGLETON_FACTORY_ADDRESS);
  }
}

async function deployDeployerContract() {
  if(await isDeployed(DEPLOYER_CONTRACT_ADDRESS)) {
    deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  } else {
    console.log("Deploying Deployer");
    var res = await create2ContractAuroraTestnet(deployer,artifacts.Deployer, [], {}, "", SINGLETON_FACTORY_ADDRESS);
    deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, res.address)) as Deployer;
    await expectDeployed(deployerContract.address);
    console.log(`Deployed Deployer to ${deployerContract.address}`);
  }
}

async function deploySOLACE() {
  if(await isDeployed(SOLACE_ADDRESS)) {
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    var res = await create2ContractAuroraTestnet(deployer,artifacts.SOLACE,[signerAddress], {}, "", deployerContract.address);
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, res.address)) as Solace;
    await expectDeployed(solace.address);
    console.log(`Deployed SOLACE to ${solace.address}`);
  }
}

async function deployFaucet() {
  if(await isDeployed(FAUCET_ADDRESS)) {
    faucet = (await ethers.getContractAt(artifacts.Faucet.abi, FAUCET_ADDRESS)) as Faucet;
  } else {
    console.log("Deploying Faucet");
    var res = await create2ContractAuroraTestnet(deployer, artifacts.Faucet, [solace.address], {}, "", deployerContract.address);
    faucet = (await ethers.getContractAt(artifacts.Faucet.abi, res.address)) as Faucet;
    await expectDeployed(faucet.address);
    console.log(`Deployed Faucet to ${faucet.address}`);
  }
  if(!(await solace.isMinter(faucet.address)) && (await solace.governance()) == signerAddress) {
    console.log("Adding faucet as SOLACE minter");
    let tx = await solace.connect(deployer).addMinter(faucet.address);
    await tx.wait(10);
    console.log("Added faucet as SOLACE minter");
  }
}

async function deployXSLocker() {
  if(await isDeployed(XSLOCKER_ADDRESS)) {
    xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, XSLOCKER_ADDRESS)) as unknown as XsLocker;
  } else {
    console.log("Deploying xsLocker");
    var res = await create2ContractAuroraTestnet(deployer, artifacts.xsLocker, [signerAddress, solace.address], {}, "", deployerContract.address);
    xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, res.address)) as unknown as XsLocker;
    await expectDeployed(xslocker.address);
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
    var res = await create2ContractAuroraTestnet(deployer, artifacts.StakingRewards, [signerAddress, solace.address, xslocker.address, solacePerSecond], {}, "", deployerContract.address);
    stakingRewards = (await ethers.getContractAt(artifacts.StakingRewards.abi, res.address)) as StakingRewards;
    await expectDeployed(stakingRewards.address);
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
    var res = await create2ContractAuroraTestnet(deployer, artifacts.xSOLACE, [xslocker.address], {}, "", deployerContract.address);
    xsolace = (await ethers.getContractAt(artifacts.xSOLACE.abi, res.address)) as XSolace;
    await expectDeployed(xsolace.address);
    console.log(`Deployed xSOLACE to ${xsolace.address}`);
  }
}

async function deployBridgeWrapper() {
  await expectDeployed(solace.address);
  await expectDeployed(BSOLACE_ADDRESS);
  if(await isDeployed(BRIDGE_WRAPPER_ADDRESS)) {
    wrapper = (await ethers.getContractAt(artifacts.BridgeWrapper.abi, BRIDGE_WRAPPER_ADDRESS)) as BridgeWrapper;
  } else {
    console.log("Deploying Bridge Wrapper");
    var res = await create2ContractAuroraTestnet(deployer, artifacts.BridgeWrapper, [SOLACE_ADDRESS, BSOLACE_ADDRESS], {}, "", deployerContract.address);
    wrapper = (await ethers.getContractAt(artifacts.BridgeWrapper.abi, res.address)) as BridgeWrapper;
    await expectDeployed(wrapper.address);
    console.log(`Deployed Bridge Wrapper to ${wrapper.address}`);
    console.log("Adding BridgeWrapper as SOLACE minter");
    let tx1 = await solace.connect(deployer).addMinter(wrapper.address);
    await tx1.wait(10);
    console.log("Added BridgeWrapper as SOLACE minter");
  }
  console.log('Unwrapping bSOLACE');
  let tx1 = await wrapper.connect(deployer).bsolaceToSolace(0, signerAddress);
  await tx1.wait(10);
  console.log('Unwrapped bSOLACE');
  console.log('Wrapping bSOLACE');
  let tx2 = await wrapper.connect(deployer).solaceToBSolace(0, signerAddress);
  await tx2.wait(10);
  console.log('Wrapped bSOLACE');
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SingletonFactory", SINGLETON_FACTORY_ADDRESS);
  logContractAddress("DeployerContract", deployerContract.address);
  logContractAddress("SOLACE", solace.address);
  logContractAddress("Faucet", faucet.address);
  logContractAddress("xsLocker", xslocker.address);
  logContractAddress("StakingRewards", stakingRewards.address);
  logContractAddress("xSOLACE", xsolace.address);
  logContractAddress("bSOLACE", BSOLACE_ADDRESS);
  logContractAddress("Bridge Wrapper", wrapper.address);

  console.log(``);
  console.log(`Copy and paste this into the .env file in the frontend client.`)
  console.log(``);
  //console.log(`REACT_APP_AURORA_TESTNET_SOLACE_CONTRACT_ADDRESS=${solace.address}`);
  console.log("")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
