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
      parseUnits("61966.75"),
      parseUnits("15307.32"),
      parseUnits("93116.49"),
      parseUnits("21600.95"),
      parseUnits("19148.14"),
      parseUnits("14422.70"),
      parseUnits("17280.63"),
      parseUnits("17016.41"),
      parseUnits("16979.88"),
      parseUnits("17029.12"),
      parseUnits("17168.00"),
      parseUnits("16951.30"),
      parseUnits("17066.40"),
      parseUnits("17015.34"),
      parseUnits("17049.58"),
      parseUnits("17192.50"),
      parseUnits("17090.70"),
      parseUnits("17052.36"),
      parseUnits("17288.59"),
      parseUnits("19413.01"),
      parseUnits("19512.07"),
      parseUnits("19525.49"),
      parseUnits("19532.94"),
      parseUnits("19523.86"),
      parseUnits("19560.20"),
      parseUnits("19479.77"),
      parseUnits("19567.48"),
      parseUnits("19641.99"),
      parseUnits("19611.48"),
      parseUnits("2961.88"),
      parseUnits("19433.38"),
      parseUnits("19519.70"),
      parseUnits("19479.09"),
      parseUnits("19633.13"),
      parseUnits("19571.24"),
      parseUnits("486168.12"),
      parseUnits("1845.74"),
      parseUnits("16416.53"),
      parseUnits("3624.24"),
      parseUnits("111.88"),
      parseUnits("280435.48"),
      parseUnits("55160.47"),
      parseUnits("24344.44"),
      parseUnits("1857.90"),
      parseUnits("1629.79"),
      parseUnits("12372.86"),
      parseUnits("344332.93"),
      parseUnits("11503.69"),
      parseUnits("1552.77"),
      parseUnits("29109.33"),
      parseUnits("33805.99"),
      parseUnits("792264.41"),
      parseUnits("236.71"),
      parseUnits("361074.90"),
      parseUnits("19683.23"),
      parseUnits("1367013.21"),
      parseUnits("4692.37"),
      parseUnits("495.08"),
      parseUnits("7548.76"),
      parseUnits("29797.20"),
      parseUnits("1105.15"),
      parseUnits("27582.99"),
      parseUnits("40472.95")
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