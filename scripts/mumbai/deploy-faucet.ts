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

const DEPLOYER_CONTRACT_ADDRESS     = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const FAUCET_ADDRESS                = "0x501ACe0742B45fbE2ac422301b55C261b4DEc11F";

const DAI_ADDRESS                   = "0x31a1D59460a9619ec6965a5684C6d3Ae470D0fE5";
const WETH_ADDRESS                  = "0xd0A1E359811322d97991E03f863a0C30C2cF029C";
const USDC_ADDRESS                  = "0x512d93ADc3DF4E24cb4b26c44A91682Ec073F559";
const WBTC_ADDRESS                  = "0x1063bf969F8D3D7296a2A94274D3df9202da2A3A";
const USDT_ADDRESS                  = "0xAEA2B0F4763c8Ffc33A4c454CD08F803B02B6B53";
const SCP_ADDRESS                   = "0x501AcEe83a6f269B77c167c6701843D454E2EFA0";
const FRAX_ADDRESS                  = "0x58B23b32a9774153E1E344762751aDfdca2764DD";

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
  console.log(`Deploying WETH`);
  let weth = await deployContract(deployer, artifacts.WETH, [], {...networkSettings.overrides, gasLimit:6000000});
  console.log(`Deployed to ${weth.address}`);
  let tokens: any[] = [
    {name: "Dai Stablecoin", symbol: "DAI", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "USD Coin", symbol: "USDC", supply: BN.from("1000000000"), decimals: 6, permit: true},
    {name: "Wrapped Bitcoin", symbol: "WBTC", supply: BN.from("1000000000"), decimals: 8, permit: false},
    {name: "USD Token", symbol: "USDT", supply: BN.from("1000000000"), decimals: 6, permit: false},
    {name: "Frax", symbol: "FRAX", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
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
  let weth = await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS);
  console.log('start eth balance');
  console.log(await provider.getBalance(signerAddress));
  console.log('start weth balance');
  console.log(await weth.balanceOf(signerAddress));
  console.log('wrapping eth')
  let tx1 = await weth.connect(deployer).deposit({...networkSettings.overrides, value: ONE_ETHER.div(1000)});
  await tx1.wait(networkSettings.confirmations);
  console.log('end eth balance');
  console.log(await provider.getBalance(signerAddress));
  console.log('end weth balance');
  console.log(await weth.balanceOf(signerAddress));

  let tokens: any[] = [
    {name: "Dai Stablecoin", symbol: "DAI", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: DAI_ADDRESS},
    {name: "USD Coin", symbol: "USDC", supply: BN.from("1000000000"), decimals: 6, permit: true, address: USDC_ADDRESS},
    {name: "Wrapped Bitcoin", symbol: "WBTC", supply: BN.from("1000000000"), decimals: 8, permit: false, address: WBTC_ADDRESS},
    {name: "USD Token", symbol: "USDT", supply: BN.from("1000000000"), decimals: 6, permit: false, address: USDT_ADDRESS},
    {name: "Frax", symbol: "FRAX", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: FRAX_ADDRESS},
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
  logContractAddress("SCP", SCP_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
