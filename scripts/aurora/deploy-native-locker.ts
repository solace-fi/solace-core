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
import { Registry, Erc20, UnderwritingLockVoting, UnderwritingLocker, GaugeController, DepositHelper } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2Contract } from "../create2Contract";
import { formatUnits } from "ethers/lib/utils";

const DEPLOYER_CONTRACT_ADDRESS         = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const REGISTRY_ADDRESS                  = "0x501ACe0f576fc4ef9C0380AA46A578eA96b85776";
const UWP_ADDRESS                       = "0x501ACEb41708De16FbedE3b31f3064919E9d7F23";
const UWE_ADDRESS                       = "0x501AcE91E8832CDeA18b9e685751079CCddfc0e2";
const REVENUE_ROUTER_ADDRESS            = "0x0436C20030d0C2e278E7e8e4b42D304a6420D3bb";
const UNDERWRITING_LOCKER_ADDRESS       = "0x501aceAC7279713F33d8cd1eBDCfd8E442909CA5";
const GAUGE_CONTROLLER_ADDRESS          = "0x501AcE75E1f2098099E73e05BC73d5F16ED7b6f1";
const UNDERWRITING_LOCK_VOTING_ADDRESS  = "0x501ace085C07AfB7EB070ddbC7b4bC3D4379761a";
const DEPOSIT_HELPER_ADDRESS            = "0x501acE8830E73F81172C4877c9d273D6a3767AD1";
let GOVERNOR_ADDRESS: string;

let artifacts: ArtifactImports;
let registry: Registry;
let underwritingLocker: UnderwritingLocker;
let voting: UnderwritingLockVoting;
let gaugeController: GaugeController;
let depositHelper: DepositHelper;

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
  await gaugeSetup();
  //await addGauges();
  await deployDepositHelper();

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
    const tx2 = await gaugeController.connect(deployer).addVotingContract(voting.address, {...networkSettings.overrides, gasLimit: 1000000});
    await tx2.wait(networkSettings.confirmations);

    console.log("Adding 'underwritingLockVoting' to the registry");
    const tx3 = await registry.connect(deployer).set(["underwritingLockVoting"], [voting.address], {...networkSettings.overrides, gasLimit: 1000000});
    await tx3.wait(networkSettings.confirmations);

    console.log("Enabling UnderwritingLockVoting to charge premium to UnderwritingLocker");
    const tx4 = await underwritingLocker.connect(deployer).setVotingContract(networkSettings.overrides);
    await tx4.wait(networkSettings.confirmations);
}

async function addGauges() {
  console.log("Adding gauges to GaugeController");
  let rol = BN.from(10).pow(18).mul(250).div(10000); // 2.5%
  let appIDs = ["aurora-plus", "aurigami", "bastion-protocol", "bluebit", "trisolaris", "vaporwave-finance"];
  let len = (await gaugeController.totalGauges()).toNumber();
  if(len > 0) {
    console.log(`${len} gauges already found. skipping`);
    return;
  }
  for(let i = 0; i < appIDs.length; ++i) {
    let tx = await gaugeController.connect(deployer).addGauge(appIDs[i], rol, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
  console.log("Added gauges to GaugeController");
}

async function deployDepositHelper() {
  if(await isDeployed(DEPOSIT_HELPER_ADDRESS)) {
    depositHelper = (await ethers.getContractAt(artifacts.DepositHelper.abi, DEPOSIT_HELPER_ADDRESS)) as DepositHelper;
  } else {
    console.log("Deploying DepositHelper");
    const res = await create2Contract(deployer, artifacts.DepositHelper, [UWP_ADDRESS, UWE_ADDRESS, underwritingLocker.address], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    depositHelper = (await ethers.getContractAt(artifacts.DepositHelper.abi, res.address)) as DepositHelper;
    console.log(`Deployed DepositHelper to ${depositHelper.address}`);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("UnderwritingLocker", underwritingLocker.address);
  logContractAddress("GaugeController", gaugeController.address);
  logContractAddress("UnderwritingLockVoting", voting.address);
  logContractAddress("DepositHelper", depositHelper.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
