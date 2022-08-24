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
import { SolaceMegaOracle, FluxMegaOracle, UnderwritingPool, UnderwritingEquity, MockErc20 } from "../../typechain";
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
const SOLACE_ADDRESS               = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const AURORA_ADDRESS               = "0x9727B423892C3BCBEBe9458F4FE5e86A954A0980";
const PLY_ADDRESS                  = "0xfdA6cF34193993c28E32340fc7CEf9361e48C7Ac";
const BSTN_ADDRESS                 = "0xb191d201073Bb24453419Eb3c1e0B790e6EFA6DF";
const BBT_ADDRESS                  = "0xAaF70eE6d386dD0410E2681FA33367f53b3BCc18";
const TRI_ADDRESS                  = "0x13fcD385A20496ed729AF787EC109A6aB4B44d75";
const VWAVE_ADDRESS                = "0x5C4Ccc7b2a2bC3E5c009364917fff92d12a08fF4";

// contract addresses
const SOLACE_MEGA_ORACLE_ADDRESS   = "0x501acEC7AD3F8bb5Fc3C925dcAC1C4077e2bb7C5";
const FLUX_MEGA_ORACLE_ADDRESS     = "0x501AcE8E475B7fD921fcfeBB365374cA62cED1a5";
const UWP_ADDRESS                  = "0x501ACEb41708De16FbedE3b31f3064919E9d7F23";
const UWE_ADDRESS                  = "0x501AcE91E8832CDeA18b9e685751079CCddfc0e2";

let artifacts: ArtifactImports;

let solaceMegaOracle: SolaceMegaOracle;
let fluxMegaOracle: FluxMegaOracle;
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
  await expectDeployed(SOLACE_ADDRESS);
  await expectDeployed(AURORA_ADDRESS);
  await expectDeployed(PLY_ADDRESS);
  await expectDeployed(BSTN_ADDRESS);
  await expectDeployed(BBT_ADDRESS);
  await expectDeployed(TRI_ADDRESS);
  await expectDeployed(VWAVE_ADDRESS);

  // deploy and configure contracts
  // SolaceMegaOracle
  await deploySolaceMegaOracle();
  //await configureSolaceMegaOracle();
  // FluxMegaOracle
  await deployFluxMegaOracle();
  //await configureFluxMegaOracle();
  // uwp
  await deployUwp();
  //await configureUwp();
  // uwe
  await deployUwe();

  // log addresses
  await logAddresses();
}

async function deploySolaceMegaOracle() {
  if(await isDeployed(SOLACE_MEGA_ORACLE_ADDRESS)) {
    solaceMegaOracle = (await ethers.getContractAt(artifacts.SolaceMegaOracle.abi, SOLACE_MEGA_ORACLE_ADDRESS)) as SolaceMegaOracle;
  } else {
    console.log("Deploying SolaceMegaOracle");
    const res = await create2Contract(deployer, artifacts.SolaceMegaOracle, [signerAddress], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    solaceMegaOracle = (await ethers.getContractAt(artifacts.SolaceMegaOracle.abi, res.address)) as SolaceMegaOracle;
    console.log(`Deployed SolaceMegaOracle to ${solaceMegaOracle.address}`);
  }
}

async function configureSolaceMegaOracle() {
  console.log('Adding updater to SolaceMegaOracle');
  let tx1 = await solaceMegaOracle.connect(deployer).setUpdaterStatuses([deployer.address], [true], networkSettings.overrides);
  await tx1.wait(networkSettings.confirmations);
  console.log('Added updater to SolaceMegaOracle');

  console.log('Adding price feeds to SolaceMegaOracle');
  let tx = await solaceMegaOracle.connect(deployer).addPriceFeeds([
    { token: SOLACE_ADDRESS, latestPrice: 0, tokenDecimals: 18, priceFeedDecimals: 18 },
    { token: AURORA_ADDRESS, latestPrice: 0, tokenDecimals: 18, priceFeedDecimals: 18 },
    { token: PLY_ADDRESS, latestPrice: 0, tokenDecimals: 18, priceFeedDecimals: 18 },
    { token: BSTN_ADDRESS, latestPrice: 0, tokenDecimals: 18, priceFeedDecimals: 18 },
    { token: BBT_ADDRESS, latestPrice: 0, tokenDecimals: 18, priceFeedDecimals: 18 },
    { token: TRI_ADDRESS, latestPrice: 0, tokenDecimals: 18, priceFeedDecimals: 18 },
    { token: VWAVE_ADDRESS, latestPrice: 0, tokenDecimals: 18, priceFeedDecimals: 18 },
  ], networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  console.log('Added price feeds to SolaceMegaOracle');
}

async function deployFluxMegaOracle() {
  if(await isDeployed(FLUX_MEGA_ORACLE_ADDRESS)) {
    fluxMegaOracle = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, FLUX_MEGA_ORACLE_ADDRESS)) as FluxMegaOracle;
  } else {
    console.log("Deploying FluxMegaOracle");
    const res = await create2Contract(deployer, artifacts.FluxMegaOracle, [signerAddress], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    fluxMegaOracle = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, res.address)) as FluxMegaOracle;
    console.log(`Deployed FluxMegaOracle to ${fluxMegaOracle.address}`);
  }
}

async function configureFluxMegaOracle() {
  console.log('Adding price feeds to FluxMegaOracle');
  let tx = await fluxMegaOracle.connect(deployer).addPriceFeeds([
    { token: USDC_ADDRESS, priceFeed: USDC_PRICE_FEED_ADDRESS, tokenDecimals: 6, priceFeedDecimals: 8 },
    { token: DAI_ADDRESS, priceFeed: USDC_PRICE_FEED_ADDRESS, tokenDecimals: 18, priceFeedDecimals: 8 },
    { token: USDT_ADDRESS, priceFeed: USDC_PRICE_FEED_ADDRESS, tokenDecimals: 6, priceFeedDecimals: 8 },
    { token: FRAX_ADDRESS, priceFeed: USDC_PRICE_FEED_ADDRESS, tokenDecimals: 18, priceFeedDecimals: 8 },
    { token: WBTC_ADDRESS, priceFeed: BTC_PRICE_FEED_ADDRESS, tokenDecimals: 8, priceFeedDecimals: 8 },
    { token: WETH_ADDRESS, priceFeed: ETH_PRICE_FEED_ADDRESS, tokenDecimals: 18, priceFeedDecimals: 8 },
  ], networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  console.log('Added price feeds to FluxMegaOracle');
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
    { token: USDC_ADDRESS, oracle: fluxMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: DAI_ADDRESS, oracle: fluxMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: USDT_ADDRESS, oracle: fluxMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: FRAX_ADDRESS, oracle: fluxMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: WBTC_ADDRESS, oracle: fluxMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: WETH_ADDRESS, oracle: fluxMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: SOLACE_ADDRESS, oracle: solaceMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: AURORA_ADDRESS, oracle: solaceMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: PLY_ADDRESS, oracle: solaceMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: BSTN_ADDRESS, oracle: solaceMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: BBT_ADDRESS, oracle: solaceMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: TRI_ADDRESS, oracle: solaceMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: VWAVE_ADDRESS, oracle: solaceMegaOracle.address, min: 0, max: ethers.constants.MaxUint256 },
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
  logContractAddress("UnderwritingPool", uwp.address);
  logContractAddress("UnderwritingEquity", uwe.address);
  console.log('');
  logContractAddress("SolaceMegaOracle", solaceMegaOracle.address);
  logContractAddress("FluxMegaOracle", fluxMegaOracle.address);
  console.log('');
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("SOLACE", SOLACE_ADDRESS)
  logContractAddress("AURORA", AURORA_ADDRESS);
  logContractAddress("PLY", PLY_ADDRESS);
  logContractAddress("BSTN", BSTN_ADDRESS);
  logContractAddress("BBT", BBT_ADDRESS);
  logContractAddress("TRI", TRI_ADDRESS);
  logContractAddress("VWAVE", VWAVE_ADDRESS);
  console.log('');
  logContractAddress("USDC price feed", USDC_PRICE_FEED_ADDRESS);
  logContractAddress("BTC price feed", BTC_PRICE_FEED_ADDRESS);
  logContractAddress("ETH price feed", ETH_PRICE_FEED_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
