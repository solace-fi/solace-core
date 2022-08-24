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

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const FAUCET_ADDRESS                = "0x501ACe0742B45fbE2ac422301b55C261b4DEc11F";

const DAI_ADDRESS                   = "0x6a49238e4d0fA003BA07fbd5ec8B6b045f980574";
const WETH_ADDRESS                  = "0x714ECD380a9700086eadAc03297027bAf4686276";
const USDC_ADDRESS                  = "0x995714E92a094Ea9b50e9F23934C36F86136A46c";
const WBTC_ADDRESS                  = "0xD129f9A01Eb0d41302A2F808e9Ebfd5eB92cE17C";
const USDT_ADDRESS                  = "0x92f2F8d238183f678a5652a04EDa83eD7BCfa99e";
const FRAX_ADDRESS                  = "0xA542486E4Dc48580fFf76B75b5c406C211218AE2";

const AURORA_ADDRESS                = "0x9727B423892C3BCBEBe9458F4FE5e86A954A0980";
const PLY_ADDRESS                   = "0xfdA6cF34193993c28E32340fc7CEf9361e48C7Ac";
const BSTN_ADDRESS                  = "0xb191d201073Bb24453419Eb3c1e0B790e6EFA6DF";
const BBT_ADDRESS                   = "0xAaF70eE6d386dD0410E2681FA33367f53b3BCc18";
const TRI_ADDRESS                   = "0x13fcD385A20496ed729AF787EC109A6aB4B44d75";
const VWAVE_ADDRESS                 = "0x5C4Ccc7b2a2bC3E5c009364917fff92d12a08fF4";

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
    {name: "Aurora", symbol: "AURORA", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "Aurigami Token", symbol: "PLY", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "Bastion", symbol: "BSTN", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "BlueBit Token", symbol: "BBT", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "Trisolaris", symbol: "TRI", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "vaporwave.finance", symbol: "VWAVE", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
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
    {name: "Aurora", symbol: "AURORA", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: AURORA_ADDRESS},
    {name: "Aurigami Token", symbol: "PLY", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: PLY_ADDRESS},
    {name: "Bastion", symbol: "BSTN", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: BSTN_ADDRESS},
    {name: "BlueBit Token", symbol: "BBT", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: BBT_ADDRESS},
    {name: "Trisolaris", symbol: "TRI", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: TRI_ADDRESS},
    {name: "vaporwave.finance", symbol: "VWAVE", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: VWAVE_ADDRESS},
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
  logContractAddress("AURORA", AURORA_ADDRESS);
  logContractAddress("PLY", PLY_ADDRESS);
  logContractAddress("BSTN", BSTN_ADDRESS);
  logContractAddress("BBT", BBT_ADDRESS);
  logContractAddress("TRI", TRI_ADDRESS);
  logContractAddress("VWAVE", VWAVE_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
