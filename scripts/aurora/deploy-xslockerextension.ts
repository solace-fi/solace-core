// deploys XsLockerExtension

// Any address can call deployXsLockerExtension()
// But only governor address can call approveXsLockerExtension() and distributeLocks()

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
import { XsLockerExtension, Solace } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2Contract } from "../create2Contract";

const DEPLOYER_CONTRACT_ADDRESS  = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const SOLACE_ADDRESS             = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSLOCKER_ADDRESS           = "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1";
const GOVERNANCE_ADDRESS         = ""
const XSLOCKEREXTENSION_ADDRESS  = ""
const MAX_UINT256 = BN.from("115792089237316195423570985008687907853269984665640564039457584007913129639935")

let artifacts: ArtifactImports;
let xsLockerExtension: XsLockerExtension;
let solace: Solace

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(SOLACE_ADDRESS);
  await expectDeployed(XSLOCKER_ADDRESS);

  // Deploy contracts
  await deployXsLockerExtension();

  // These functions must be called by governor
  await approveXsLockerExtension();
  await distributeLocks();

  // log addresses
  await logAddresses();
}

async function deployXsLockerExtension() {
    if (await isDeployed(XSLOCKEREXTENSION_ADDRESS)) {
      xsLockerExtension = (await ethers.getContractAt(artifacts.xsLockerExtension.abi, XSLOCKEREXTENSION_ADDRESS)) as XsLockerExtension;
    } else {
      console.log("Deploying XsLockerExtension");
      const res = await create2Contract(deployer, artifacts.xsLockerExtension, [GOVERNANCE_ADDRESS, SOLACE_ADDRESS, XSLOCKER_ADDRESS], {}, "", DEPLOYER_CONTRACT_ADDRESS);
      xsLockerExtension = (await ethers.getContractAt(artifacts.xsLockerExtension.abi, res.address)) as unknown as XsLockerExtension;
      console.log(`Deployed XsLockerExtension to ${xsLockerExtension.address}`);
    }
}

// Must be called by governor
async function approveXsLockerExtension() {
  console.log(`Approving XsLockerExtension to move SOLACE from deployer`)
  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  let tx = await solace.connect(deployer).approve(xsLockerExtension.address, MAX_UINT256, networkSettings.overrides)
  await tx.wait(networkSettings.confirmations);
}

// Must be called by governor
async function distributeLocks() {
    console.log(`Calling distributeLocks`)

    const xsLocks = [
      22,
      171,
      182,
      187,
      188,
      199,
      200,
      210,
      213,
      229,
      237,
      238,
      245
    ]
    
    const amounts = [
      parseUnits("71534.62"),
      parseUnits("46160.40"),
      parseUnits("101130.61"),
      parseUnits("57518.54"),
      parseUnits("199321.57"),
      parseUnits("25582.22"),
      parseUnits("14659.89"),
      parseUnits("7455.61"),
      parseUnits("132765.10"),
      parseUnits("856701.53"),
      parseUnits("27302.24"),
      parseUnits("1669.45"),
      parseUnits("472293.94")
    ]
    
    let tx = await xsLockerExtension.connect(deployer).increaseAmountMultiple(xsLocks, amounts, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("XsLockerExtension", xsLockerExtension.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });