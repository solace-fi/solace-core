// deploys XsLockerExtension

// Any address can call deployXsLockerExtension()
// But only governor address can call approveXsLockerExtension() and distributeLocks()

// Requires following fields in .env

// POLYGON_URL
// POLYGON_ACCOUNTS
// POLYGONSCAN_API_KEY

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
      const res = await create2Contract(deployer, artifacts.xsLockerExtension, [SOLACE_ADDRESS, XSLOCKER_ADDRESS], {}, "", DEPLOYER_CONTRACT_ADDRESS);
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
      31,
      43,
      70,
      133,
      143,
      145,
      146,
      147,
      148,
      150,
      151,
      152,
      154,
      155,
      156,
      157,
      158,
      159,
      160,
      162,
      163,
      164,
      165,
      166,
      168,
      169,
      170,
      171,
      172,
      183,
      184,
      185,
      186,
      187,
      188,
      251,
      273,
      276,
      284,
      292,
      301,
      325,
      338,
      340,
      351,
      654,
      689,
      878,
      881,
      896,
      922,
      926,
      931,
      935,
      945,
      946,
      948,
      951,
      952,
      953,
      955,
      956,
      961,
    ]
    
    const amounts = [
      parseUnits("30983.37"),
      parseUnits("7653.66"),
      parseUnits("46558.25"),
      parseUnits("10800.47"),
      parseUnits("9574.07"),
      parseUnits("7211.35"),
      parseUnits("8640.32"),
      parseUnits("8508.20"),
      parseUnits("8489.94"),
      parseUnits("8514.56"),
      parseUnits("8584.00"),
      parseUnits("8475.65"),
      parseUnits("8533.20"),
      parseUnits("8507.67"),
      parseUnits("8524.79"),
      parseUnits("8596.25"),
      parseUnits("8545.35"),
      parseUnits("8526.18"),
      parseUnits("8644.29"),
      parseUnits("9706.50"),
      parseUnits("9756.04"),
      parseUnits("9762.74"),
      parseUnits("9766.47"),
      parseUnits("9761.93"),
      parseUnits("9780.10"),
      parseUnits("9739.89"),
      parseUnits("9783.74"),
      parseUnits("9820.99"),
      parseUnits("9805.74"),
      parseUnits("1480.94"),
      parseUnits("9716.69"),
      parseUnits("9759.85"),
      parseUnits("9739.54"),
      parseUnits("9816.57"),
      parseUnits("9785.62"),
      parseUnits("243084.06"),
      parseUnits("922.87"),
      parseUnits("8208.26"),
      parseUnits("1812.12"),
      parseUnits("55.94"),
      parseUnits("140217.74"),
      parseUnits("27580.24"),
      parseUnits("12172.22"),
      parseUnits("928.95"),
      parseUnits("814.90"),
      parseUnits("6186.43"),
      parseUnits("172166.46"),
      parseUnits("5751.85"),
      parseUnits("776.39"),
      parseUnits("14554.67"),
      parseUnits("16903.00"),
      parseUnits("396132.20"),
      parseUnits("118.35"),
      parseUnits("180537.45"),
      parseUnits("9841.62"),
      parseUnits("683506.61"),
      parseUnits("2346.19"),
      parseUnits("247.54"),
      parseUnits("3774.38"),
      parseUnits("14898.60"),
      parseUnits("552.58"),
      parseUnits("13791.49"),
      parseUnits("20236.48")
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