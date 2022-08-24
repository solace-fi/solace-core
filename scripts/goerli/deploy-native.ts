// deploys v3 of solace wallet coverage

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { FluxMegaOracle, UnderwritingPool, UnderwritingEquity, MockErc20 } from "../../typechain";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2Contract } from "../create2Contract";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

// price feed addresses
const USDC_PRICE_FEED_ADDRESS      = "0xB61119a7349494b694be8C0e1580C1CFCD55753f";
const BTC_PRICE_FEED_ADDRESS       = "0x887e7e9097d7d2AB44ba31dE0C022040Fb26FC9D";
const ETH_PRICE_FEED_ADDRESS       = "0xEB3DA77d163055634335aA65F29e612BeaBf4391";

// token addresses
const USDC_ADDRESS                 = "0x995714E92a094Ea9b50e9F23934C36F86136A46c";
const DAI_ADDRESS                  = "0x6a49238e4d0fA003BA07fbd5ec8B6b045f980574";
const USDT_ADDRESS                 = "0x92f2F8d238183f678a5652a04EDa83eD7BCfa99e";
const FRAX_ADDRESS                 = "0xA542486E4Dc48580fFf76B75b5c406C211218AE2";
const WBTC_ADDRESS                 = "0xD129f9A01Eb0d41302A2F808e9Ebfd5eB92cE17C";
const WETH_ADDRESS                 = "0x714ECD380a9700086eadAc03297027bAf4686276";

// contract addresses
const ORACLE_ADDRESS               = "0x501aCee3740e4A7CBf62C2A4C3b42703cE44ADa9";
const UWP_ADDRESS                  = "0x501ACEe266FAFF76AE48C891a06068bF6507c7f6";
const UWE_ADDRESS                  = "0x501ACEF0d60A70F3bc1bFE090a3d51ca10757aaE";

let artifacts: ArtifactImports;

let oracle: FluxMegaOracle;
let uwp: UnderwritingPool;
let uwe: UnderwritingEquity;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(USDC_PRICE_FEED_ADDRESS);
  await expectDeployed(BTC_PRICE_FEED_ADDRESS);
  await expectDeployed(ETH_PRICE_FEED_ADDRESS);
  await expectDeployed(USDC_ADDRESS);
  await expectDeployed(DAI_ADDRESS);
  await expectDeployed(USDT_ADDRESS);
  await expectDeployed(FRAX_ADDRESS);
  await expectDeployed(WBTC_ADDRESS);
  await expectDeployed(WETH_ADDRESS);

  // deploy and configure contracts
  // oracles
  await deployOracle();
  //await configureOracle();
  // uwp
  await deployUwp();
  //await configureUwp();
  // uwe
  await deployUwe();

  // log addresses
  await logAddresses();
}

async function deployOracle() {
  if(await isDeployed(ORACLE_ADDRESS)) {
    oracle = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, ORACLE_ADDRESS)) as FluxMegaOracle;
  } else {
    console.log("Deploying FluxMegaOracle");
    const res = await create2Contract(deployer, artifacts.FluxMegaOracle, [signerAddress], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    oracle = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, res.address)) as FluxMegaOracle;
    console.log(`Deployed FluxMegaOracle to ${oracle.address}`);
  }
}

async function configureOracle() {
  console.log('Adding price feeds to oracle');
  let tx = await oracle.connect(deployer).addPriceFeeds([
    { token: USDC_ADDRESS, priceFeed: USDC_PRICE_FEED_ADDRESS, tokenDecimals: 6, priceFeedDecimals: 8 },
    { token: DAI_ADDRESS, priceFeed: USDC_PRICE_FEED_ADDRESS, tokenDecimals: 18, priceFeedDecimals: 8 },
    { token: USDT_ADDRESS, priceFeed: USDC_PRICE_FEED_ADDRESS, tokenDecimals: 6, priceFeedDecimals: 8 },
    { token: FRAX_ADDRESS, priceFeed: USDC_PRICE_FEED_ADDRESS, tokenDecimals: 18, priceFeedDecimals: 8 },
    { token: WBTC_ADDRESS, priceFeed: BTC_PRICE_FEED_ADDRESS, tokenDecimals: 8, priceFeedDecimals: 8 },
    { token: WETH_ADDRESS, priceFeed: ETH_PRICE_FEED_ADDRESS, tokenDecimals: 18, priceFeedDecimals: 8 },
  ], networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  console.log('Added price feeds to oracle');
}

async function deployUwp() {
  if(await isDeployed(UWP_ADDRESS)) {
    uwp = (await ethers.getContractAt(artifacts.UnderwritingPool.abi, UWP_ADDRESS)) as UnderwritingPool;
  } else {
    console.log('Deploying UnderwritingPool');
    const res = await create2Contract(deployer, artifacts.UnderwritingPool, [signerAddress], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    uwp = (await ethers.getContractAt(artifacts.UnderwritingPool.abi, res.address)) as UnderwritingPool;
    console.log(`Deploying UnderwritingPool to ${uwp.address}`);
  }
}

async function configureUwp() {
  console.log('Adding tokens to uwp');
  let tx = await uwp.connect(deployer).addTokensToPool([
    { token: USDC_ADDRESS, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: DAI_ADDRESS, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: USDT_ADDRESS, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: FRAX_ADDRESS, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: WBTC_ADDRESS, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: WETH_ADDRESS, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
  ], networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  console.log('Added tokens to uwp');
}

async function deployUwe() {
  if(await isDeployed(UWE_ADDRESS)) {
    uwe = (await ethers.getContractAt(artifacts.UnderwritingEquity.abi, UWE_ADDRESS)) as UnderwritingEquity;
  } else {
    console.log('Deploying UnderwritingEquity');
    const res = await create2Contract(deployer, artifacts.UnderwritingEquity, [signerAddress, uwp.address], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    uwe = (await ethers.getContractAt(artifacts.UnderwritingEquity.abi, res.address)) as UnderwritingEquity;
    console.log(`Deploying UnderwritingEquity to ${uwe.address}`);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("USDC price feed", USDC_PRICE_FEED_ADDRESS);
  logContractAddress("BTC price feed", BTC_PRICE_FEED_ADDRESS);
  logContractAddress("ETH price feed", ETH_PRICE_FEED_ADDRESS);
  logContractAddress("FluxMegaOracle", oracle.address);
  logContractAddress("UnderwritingPool", uwp.address);
  logContractAddress("UnderwritingEquity", uwe.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
