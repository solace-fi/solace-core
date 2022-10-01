// Requires following fields in .env

// AURORA_URL
// AURORA_ACCOUNTS
// AURORASCAN_API_KEY

// PRIVATE_KEYS
// RINKEBY_ACCOUNTS
// RINKEBY_ALCHEMY_KEY

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
const { parseUnits } = ethers.utils
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { logContractAddress } from "../utils";

import { import_artifacts, ArtifactImports } from "../../test/utilities/artifact_importer";
import { Registry, Erc20, UnderwritingLockVoting, UnderwritingLocker, GaugeController, DepositHelper, BribeController } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2Contract } from "../create2Contract";
import { formatUnits } from "ethers/lib/utils";

const DEPLOYER_CONTRACT_ADDRESS         = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const REGISTRY_ADDRESS                  = "0x501ACe0f576fc4ef9C0380AA46A578eA96b85776";
const UWP_ADDRESS                       = "0x501ACEb41708De16FbedE3b31f3064919E9d7F23";
const UWE_ADDRESS                       = "0x501ACE809013C8916CAAe439e9653bc436172919";
const REVENUE_ROUTER_ADDRESS            = "0x501aceB2Ff39b3aC0189ba1ACe497C3dAB486F7B";
const UNDERWRITING_LOCKER_ADDRESS       = "0x501aCeFC6a6ff5Aa21c27D7D9D58bedCA94f7BC9";
const GAUGE_CONTROLLER_ADDRESS          = "0x501acE57a87C6B4Eec1BfD2fF2d600F65C2875aB";
const UNDERWRITING_LOCK_VOTING_ADDRESS  = "0x501ACe9cc96E4eE51a4c2098d040EE15F6f3e77F";
const DEPOSIT_HELPER_ADDRESS            = "0x501acE1652Cb4d7386cdaBCd84CdE26C811F3520";
const BRIBE_CONTROLLER_ADDRESS          = "0x501Ace5093F43FBF578d081f2d93B5f42e905f90";
let GOVERNOR_ADDRESS: string;

let artifacts: ArtifactImports;
let registry: Registry;
let underwritingLocker: UnderwritingLocker;
let voting: UnderwritingLockVoting;
let gaugeController: GaugeController;
let depositHelper: DepositHelper;
let bribeController: BribeController;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer`);
  GOVERNOR_ADDRESS = signerAddress;

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(UWP_ADDRESS);
  await expectDeployed(UWE_ADDRESS);
  await expectDeployed(REGISTRY_ADDRESS);

  /*********************
     DEPLOY SEQUENCE
  *********************/

  registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;

  //await setRegistry1(); // Set 'uwe' in the registry
  await deployUnderwritingLocker();
  await deployGaugeController();
  //await setRegistry2(); // Set 'revenueRouter', 'underwritingLocker' and 'gaugeController' in the registry
  await deployUnderwritingLockVoting();
  //await gaugeSetup();
  await deployDepositHelper();
  //await setRegistry3(); // set 'underwritingLockVoting' in the registry
  await deployBribeController();
  //await setBribeController();
  //await updateRegistry(); // post update to registry contract

  // log addresses
  await logAddresses();
}

async function setRegistry1() {
    console.log("Setting 'uwe' in the Registry.")
    const keys = ["uwe"];
    const values = [UWE_ADDRESS];
    let tx = await registry.connect(deployer).set(keys, values, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
}

async function deployUnderwritingLocker() {
    if (await isDeployed(UNDERWRITING_LOCKER_ADDRESS)) {
        underwritingLocker = (await ethers.getContractAt(artifacts.UnderwritingLocker.abi, UNDERWRITING_LOCKER_ADDRESS)) as UnderwritingLocker;
    } else {
      console.log("Deploying UnderwritingLocker");
      const res = await create2Contract(deployer, artifacts.UnderwritingLocker, [GOVERNOR_ADDRESS, REGISTRY_ADDRESS], {}, "", DEPLOYER_CONTRACT_ADDRESS);
      underwritingLocker = (await ethers.getContractAt(artifacts.UnderwritingLocker.abi, res.address)) as unknown as UnderwritingLocker;
      console.log(`Deployed UnderwritingLocker to ${underwritingLocker.address}`);
    }
}

async function deployGaugeController() {
    if (await isDeployed(GAUGE_CONTROLLER_ADDRESS)) {
        gaugeController = (await ethers.getContractAt(artifacts.GaugeController.abi, GAUGE_CONTROLLER_ADDRESS)) as GaugeController;
    } else {
      console.log("Deploying GaugeController");
      const res = await create2Contract(deployer, artifacts.GaugeController, [GOVERNOR_ADDRESS, UWE_ADDRESS], {}, "", DEPLOYER_CONTRACT_ADDRESS);
      gaugeController = (await ethers.getContractAt(artifacts.GaugeController.abi, res.address)) as unknown as GaugeController;
      console.log(`Deployed GaugeController to ${gaugeController.address}`);
    }
}

async function setRegistry2() {
    console.log("Setting 'revenueRouter', 'underwritingLocker' and 'gaugeController' in the Registry.")
    const keys = ["revenueRouter", "underwritingLocker", "gaugeController"];
    const values = [REVENUE_ROUTER_ADDRESS, underwritingLocker.address, gaugeController.address]
    let tx = await registry.connect(deployer).set(keys, values, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
}

async function deployUnderwritingLockVoting() {
    if (await isDeployed(UNDERWRITING_LOCK_VOTING_ADDRESS)) {
        voting = (await ethers.getContractAt(artifacts.UnderwritingLockVoting.abi, UNDERWRITING_LOCK_VOTING_ADDRESS)) as UnderwritingLockVoting;
    } else {
      console.log("Deploying UnderwritingLockVoting");
      const res = await create2Contract(deployer, artifacts.UnderwritingLockVoting, [GOVERNOR_ADDRESS, REGISTRY_ADDRESS], {}, "", DEPLOYER_CONTRACT_ADDRESS);
      voting = (await ethers.getContractAt(artifacts.UnderwritingLockVoting.abi, res.address)) as unknown as UnderwritingLockVoting;
      console.log(`Deployed UnderwritingLockVoting to ${voting.address}`);
    }
}

async function gaugeSetup() {
    console.log("Adding UnderwritingLocker as $UWE capacity source in GaugeController");
    const tx1 = await gaugeController.connect(deployer).addTokenholder(underwritingLocker.address, networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);

    console.log("Adding UnderwritingLockVoting as vote source in GaugeController");
    const tx2 = await gaugeController.connect(deployer).addVotingContract(voting.address, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);

    console.log("Adding 'underwritingLockVoting' to the registry");
    const tx3 = await registry.connect(deployer).set(["underwritingLockVoting"], [voting.address], {...networkSettings.overrides, gasLimit: 1000000});
    await tx3.wait(networkSettings.confirmations);

    console.log("Enabling UnderwritingLockVoting to charge premium to UnderwritingLocker");
    const tx4 = await underwritingLocker.connect(deployer).setVotingContract(networkSettings.overrides);
    await tx4.wait(networkSettings.confirmations);
}

async function deployDepositHelper() {
  if(await isDeployed(DEPOSIT_HELPER_ADDRESS)) {
    depositHelper = (await ethers.getContractAt(artifacts.DepositHelper.abi, DEPOSIT_HELPER_ADDRESS)) as DepositHelper;
  } else {
    console.log("Deploying DepositHelper");
    const res = await create2Contract(deployer, artifacts.DepositHelper, [UWE_ADDRESS, underwritingLocker.address], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    depositHelper = (await ethers.getContractAt(artifacts.DepositHelper.abi, res.address)) as DepositHelper;
    console.log(`Deployed DepositHelper to ${depositHelper.address}`);
  }
}

async function setRegistry3() {
    console.log("Setting 'underwritingLockVoting' in the Registry.")
    const keys = ["underwritingLockVoting"];
    const values = [voting.address];
    let tx = await registry.connect(deployer).set(keys, values, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
    console.log("Set 'underwritingLockVoting' in the Registry.")
}

async function deployBribeController() {
  if(await isDeployed(BRIBE_CONTROLLER_ADDRESS)) {
    bribeController = (await ethers.getContractAt(artifacts.BribeController.abi, BRIBE_CONTROLLER_ADDRESS)) as BribeController;
  } else {
    console.log("Deploying BribeController");
    const res = await create2Contract(deployer, artifacts.BribeController, [signerAddress, REGISTRY_ADDRESS], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    bribeController = (await ethers.getContractAt(artifacts.BribeController.abi, res.address)) as BribeController;
    console.log(`Deployed BribeController to ${bribeController.address}`);
  }
}

async function setBribeController() {
  console.log("Setting BribeController in UnderwritingLockVoting");
  let res = await registry.tryGet("bribeController");
  if(res.value != bribeController.address) {
    let tx1 = await registry.connect(deployer).set(["bribeController"], [bribeController.address], networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
  }
  let bc = await voting.bribeController();
  if(bc != bribeController.address) {
    let tx2 = await voting.connect(deployer).setBribeController(networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
  }
  console.log("Set BribeController in UnderwritingLockVoting");
}

async function updateRegistry() {
  console.log("Updating registry");
  let tx1 = await underwritingLocker.connect(deployer).setRegistry(registry.address, networkSettings.overrides);
  await tx1.wait(networkSettings.confirmations);
  let tx2 = await voting.connect(deployer).setRegistry(registry.address, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log("Updated registry");
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("UnderwritingLocker", underwritingLocker.address);
  logContractAddress("GaugeController", gaugeController.address);
  logContractAddress("UnderwritingLockVoting", voting.address);
  logContractAddress("DepositHelper", depositHelper.address);
  logContractAddress("BribeController", bribeController.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
