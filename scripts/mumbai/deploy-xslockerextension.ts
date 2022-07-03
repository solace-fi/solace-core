// deploys MerkleDistributor

// Requires following fields in .env
// MUMBAI_URL
// MUMBAI_ACCOUNTS
// PRIVATE_KEYS
// RINKEBY_ACCOUNTS
// RINKEBY_ALCHEMY_KEY
// POLYGONSCAN_API_KEY

// Verify command
// npx hardhat verify --network mumbai 0x501ACeEEa805D0D43AE54577ED4E7dCbDA169675 "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40" "0xa3355b0ea435593f559c0e6e51a16e374bd801ce86911543fa6b09161ad0235c" "0xC32e0d89e25222ABb4d2d68755baBF5aA6648F15"

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
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
const XSLOCKEREXTENSION_ADDRESS  = "0x501Ace88C8FDB3209B7D95849b8908124e167374"
const MAX_UINT256 = BN.from("115792089237316195423570985008687907853269984665640564039457584007913129639935")

const ONE = BN.from("1")

let artifacts: ArtifactImports;
let xsLockerExtension: XsLockerExtension;
let solace: Solace

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
  await expectDeployed(XSLOCKER_ADDRESS);

  // Deploy contracts
  await deployXsLockerExtension();

  // Distribute locks
  await distributeLocks();

  // log addresses
  await logAddresses();
}

async function deployXsLockerExtension() {
    if (await isDeployed(XSLOCKEREXTENSION_ADDRESS)) {
      xsLockerExtension = (await ethers.getContractAt(artifacts.xsLockerExtension.abi, XSLOCKEREXTENSION_ADDRESS)) as XsLockerExtension;
    } else {
      console.log("Deploying XsLockerExtension");
      const res = await create2Contract(deployer, artifacts.xsLockerExtension, [signerAddress, SOLACE_ADDRESS, XSLOCKER_ADDRESS], {}, "", DEPLOYER_CONTRACT_ADDRESS);
      xsLockerExtension = (await ethers.getContractAt(artifacts.xsLockerExtension.abi, res.address)) as unknown as XsLockerExtension;
      console.log(`Deployed XsLockerExtension to ${xsLockerExtension.address}`);

      console.log(`Approving XsLockerExtension to move SOLACE from deployer`)
      solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
      let tx = await solace.connect(deployer).approve(xsLockerExtension.address, MAX_UINT256, networkSettings.overrides)
      await tx.wait(networkSettings.confirmations);
    }
}

async function distributeLocks() {
    console.log(`Calling distributeLocks`)
    const xsLocks = [3, 5, 10]
    const amounts = [3, 5, 10]
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