// deploys the faucet and testnet tokens

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
import { Solace, Faucet } from "../../typechain";
import { deployContract } from "ethereum-waffle";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";

const DEPLOYER_CONTRACT_ADDRESS     = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";
const SOLACE_ADDRESS                = "0x501ACE0C6DeA16206bb2D120484a257B9F393891";
const FAUCET_ADDRESS                = "0x501aCE125D0BE22FDA4e035d06EE1D5150869b53";

const DAI_ADDRESS                   = "0xC709a8965eF42fD80b28F226E253283539ddBb12";
const WETH_ADDRESS                  = "0x82b2c5950955cfEf23AD73675F7dC8C66cE23150";
const USDC_ADDRESS                  = "0x1EE27c7c11E12dBa0F4b3aeEF9599D51Df06bB14";
const WBTC_ADDRESS                  = "0xe3a5001b027168dc9b4b64311fc7a9eb87363d78";
const USDT_ADDRESS                  = "0xC382931bF0D86B0Fd04ecAC093676A61446F3E2d";
const FRAX_ADDRESS                  = "0x87Eba7597721C156240Ae7d8aE26e269118AFdca";
const WFTM_ADDRESS                  = "0x4701b4535CDcC6541292fCef468836486D871250";

const ONE_ETHER = BN.from("1000000000000000000");

let artifacts: ArtifactImports;

let solace: Solace;
let faucet: Faucet;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  if(!networkSettings.isTestnet) throw("Do not deploy the faucet on production networks");
  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(SOLACE_ADDRESS);
  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;

  //await deployTestnetTokens();
  //await mintTestnetTokens();
  await deployFaucet();

  await logAddresses();
}

async function deployFaucet() {
  if(await isDeployed(FAUCET_ADDRESS)) {
    faucet = (await ethers.getContractAt(artifacts.Faucet.abi, FAUCET_ADDRESS)) as Faucet;
  } else {
    console.log("Deploying Faucet");
    var res = await create2Contract(deployer, artifacts.Faucet, [solace.address], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    faucet = (await ethers.getContractAt(artifacts.Faucet.abi, res.address)) as Faucet;
    console.log(`Deployed Faucet to ${faucet.address}`);
  }

  if(!(await solace.isMinter(faucet.address)) && (await solace.governance()) == signerAddress) {
    console.log("Adding faucet as SOLACE minter");
    let tx = await solace.connect(deployer).addMinter(faucet.address, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
    console.log("Added faucet as SOLACE minter");
  }
}

async function deployTestnetTokens() {
  console.log(`Deploying WFTM`);
  let wftm = await deployContract(deployer, artifacts.WFTM, [], {...networkSettings.overrides, gasLimit:6000000});
  console.log(`Deployed to ${wftm.address}`);
  let tokens: any[] = [
    {name: "Dai Stablecoin", symbol: "DAI", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "USD Coin", symbol: "USDC", supply: BN.from("1000000000"), decimals: 6, permit: true},
    {name: "Wrapped Bitcoin", symbol: "WBTC", supply: BN.from("1000000000"), decimals: 8, permit: false},
    {name: "USD Token", symbol: "USDT", supply: BN.from("1000000000"), decimals: 6, permit: false},
    {name: "Frax", symbol: "FRAX", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "Wrapped Ether", symbol: "WETH", supply: ONE_ETHER.mul(1000000).mul(1000000), decimals: 18, permit: false},
  ];
  for(var i = 0; i < tokens.length; ++i) {
    let token = tokens[i];
    console.log(`Deploying ${token.symbol}`);
    let artifact = token.permit ? artifacts.MockERC20Permit : artifacts.MockERC20Decimals;
    let tokenContract = await deployContract(deployer, artifact, [token.name, token.symbol, token.supply, token.decimals], {...networkSettings.overrides, gasLimit: 6000000});
    console.log(`Deployed to ${tokenContract.address}`);
  }
}

async function mintTestnetTokens() {
  let wftm = await ethers.getContractAt(artifacts.WFTM.abi, WFTM_ADDRESS);
  console.log('start ftm balance');
  console.log(await provider.getBalance(signerAddress));
  console.log('start wftm balance');
  console.log(await wftm.balanceOf(signerAddress));
  console.log('wrapping ftm')
  let tx1 = await wftm.connect(deployer).deposit({...networkSettings.overrides, value: ONE_ETHER.div(1000)});
  await tx1.wait(networkSettings.confirmations);
  console.log('end ftm balance');
  console.log(await provider.getBalance(signerAddress));
  console.log('end wftm balance');
  console.log(await wftm.balanceOf(signerAddress));

  let tokens: any[] = [
    {name: "Dai Stablecoin", symbol: "DAI", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: DAI_ADDRESS},
    {name: "USD Coin", symbol: "USDC", supply: BN.from("1000000000"), decimals: 6, permit: true, address: USDC_ADDRESS},
    {name: "Wrapped Bitcoin", symbol: "WBTC", supply: BN.from("1000000000"), decimals: 8, permit: false, address: WBTC_ADDRESS},
    {name: "USD Token", symbol: "USDT", supply: BN.from("1000000000"), decimals: 6, permit: false, address: USDT_ADDRESS},
    {name: "Frax", symbol: "FRAX", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: FRAX_ADDRESS},
    {name: "Wrapped Ether", symbol: "WETH", supply: ONE_ETHER.mul(1000000).mul(1000000), decimals: 18, permit: false, address: WETH_ADDRESS},
  ];
  let recipients = [signerAddress];
  for(var j = 0; j < recipients.length; ++j) {
    let recipient = recipients[j];
    for(var i = 0; i < tokens.length; ++i) {
      let token = tokens[i];
      let artifact = token.permit ? artifacts.MockERC20Permit : artifacts.MockERC20Decimals;
      let tokenContract = await ethers.getContractAt(artifact.abi, token.address);
      console.log(`Minting ${token.symbol}`);
      let bal1 = await tokenContract.balanceOf(signerAddress);
      let tx1 = await tokenContract.connect(deployer).mint(networkSettings.overrides);
      await tx1.wait(networkSettings.confirmations);
      let bal2 = await tokenContract.balanceOf(signerAddress);
      console.log(`Transferring ${token.symbol}`);
      let tx2 = await tokenContract.connect(deployer).transfer(recipient, bal2.sub(bal1), networkSettings.overrides);
      await tx2.wait(networkSettings.confirmations);

      console.log(`Checking balance of ${token.symbol}`);
      console.log(await tokenContract.balanceOf(recipient));
    }
    console.log('Minting SOLACE');
    let tx3 = await solace.connect(deployer).mint(recipient, ONE_ETHER.mul(1000), networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations)
    console.log('Checking balance of SOLACE');
    console.log(await solace.balanceOf(recipient));
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SOLACE", solace.address);
  logContractAddress("Faucet", faucet.address);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
  logContractAddress("WFTM", WFTM_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
