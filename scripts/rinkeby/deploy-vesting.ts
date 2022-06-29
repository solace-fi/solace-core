// deploys TokenVesting

// Requires following fields in .env
// RINKEBY_URL
// PRIVATE_KEYS
// RINKEBY_ACCOUNTS
// RINKEBY_ALCHEMY_KEY
// POLYGONSCAN_API_KEY

// Require absolute path `stash/scripts/knownHashes.json` to be present, with initial contents {}

// Verify command
// npx hardhat verify --network mumbai 0x501ACeEEa805D0D43AE54577ED4E7dCbDA169675 "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40" "0xa3355b0ea435593f559c0e6e51a16e374bd801ce86911543fa6b09161ad0235c" "0xC32e0d89e25222ABb4d2d68755baBF5aA6648F15"

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
import { BigNumber as BN } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);
const { parseUnits } = ethers.utils

import { logContractAddress } from "../utils";

import { import_artifacts, ArtifactImports } from "../../test/utilities/artifact_importer";
import { TokenVesting } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2Contract } from "../create2Contract";

const DEPLOYER_CONTRACT_ADDRESS  = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const SOLACE_ADDRESS             = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const GOVERNOR_ADDRESS           = ""
const TOKEN_VESTING_ADDRESS      = "";

const VESTING_START = 1638209176;
// Unix timestamp for initial SOLACE add liquidity transaction - https://etherscan.io/tx/0x71f1de15ee75f414c454aec3612433d0123e44ec5987515fc3566795cd840bc3

const INVESTORS: string[] = [
    "0x327924cb8fb1daf959bbb8441f9b522e716f7794",
    "0xe1d3baa26d94f53897efbeb550d95cc2ab72d5f7",
    "0x7998dd03fe0d77159df2982b9b279b105cfd87bf",
    "0x1E8959C39FF895DC53B14025A5BB22d58a80638d",
    "0x187318f330E9e6E8a560b44A62577b5FF0E6bC1E",
    "0x39DC1c08c0efdD39AE86AE402a8B8Ee2cdCB45DF",
    "0x009d353F90DaE2aC6788CB9180614317Ddc561F6",
    "0x73f27B32494933683039146adBe0682010287ca1",
    "0x707B8F3075521Ee750C25Ac3bA9a0B9B85E370C4",
    "0xa405bB5B1ceA47EB4e456CfE82923688Bc4ACf84",
    "0x9271B3CA0B51ea916d14376CD268fd5F0Ef16a87",
    "0xFEEF9D78980083F605C9902C0367Df6035D47276",
    "0xc9fcd1B0123AE3EFF7378b1Cc80eB33858EC6E46",
    "0x56BdEd1E535E3A568E4C8A9C3fda22A135E01bbf",
    "0x8D365687a75DC7688864822869ae0551Bb6fc105",
    "0x623e2849e85b5d1de893247bca99c8c62b0ff572",
    "0x39aF0a4d17111e9ae667f5a5D096E1709c69B286",
    "0xcec0d1a31129af0b1088a3d8dfa6abb4bd1ecb45",
    "0x404d846C95b2a70104fbAe9797305BEAa27a4062",
    "0xf71E9C766Cdf169eDFbE2749490943C1DC6b8A55",
    "0x2352117b6b21FaC6F2D651f765857d213CF5B671",
]
  
const TOTAL_INVESTOR_TOKENS: BN[] = [
    parseUnits("8333334"),
    parseUnits("5000000"),
    parseUnits("3333333"),
    parseUnits("3333333"),
    parseUnits("3333333"),
    parseUnits("6666667"),
    parseUnits("500000"),
    parseUnits("666667"),
    parseUnits("2666667"),
    parseUnits("166667"),
    parseUnits("333333"),
    parseUnits("1666667"),
    parseUnits("333333"),
    parseUnits("333333"),
    parseUnits("666667"),
    parseUnits("833333"),
    parseUnits("333333"),
    parseUnits("166667"),
    parseUnits("333333"),
    parseUnits("1000000"),
    parseUnits("1000000"),
]

let artifacts: ArtifactImports;
let tokenVesting: TokenVesting;

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

  // deploy contracts
  await deployTokenVesting();
  await setInvestorVestingSchedules();

  // log addresses
  await logAddresses();
}


async function deployTokenVesting() {
  if (await isDeployed(TOKEN_VESTING_ADDRESS)) {
    tokenVesting = (await ethers.getContractAt(artifacts.TokenVesting.abi, TOKEN_VESTING_ADDRESS)) as TokenVesting;
  } else {
    console.log("Deploying TokenVesting");
    const res = await create2Contract(deployer, artifacts.TokenVesting, [signerAddress, SOLACE_ADDRESS, VESTING_START], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    tokenVesting = (await ethers.getContractAt(artifacts.TokenVesting.abi, res.address)) as unknown as TokenVesting;
    console.log(`Deployed TokenVesting to ${tokenVesting.address}`);
  }
}

async function setInvestorVestingSchedules() {
    console.log("Setting investor vesting schedule");
    let tx = await tokenVesting.connect(deployer).setTotalInvestorTokens(INVESTORS, TOTAL_INVESTOR_TOKENS, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
}


async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("TokenVesting", tokenVesting.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });