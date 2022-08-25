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
const USDC_PRICE_FEED_ADDRESS      = "0xdD170e697d7ADed472a9284f07576c3449284502";
const DAI_PRICE_FEED_ADDRESS       = "0x9e3C7532d9E4bfF3298a132101Bcc62576D80e36";
const USDT_PRICE_FEED_ADDRESS      = "0x55b9eD56737B161677dC5146873E643647Ba5a43";
const FRAX_PRICE_FEED_ADDRESS      = "";
const BTC_PRICE_FEED_ADDRESS       = "0xBE46e430d336fC827d096Db044cBaEECE72e17bC";
const ETH_PRICE_FEED_ADDRESS       = "0x842AF8074Fa41583E3720821cF1435049cf93565";

// token addresses
const USDC_ADDRESS                 = "0xB12BFcA5A55806AaF64E99521918A4bf0fC40802";
const DAI_ADDRESS                  = "0xe3520349F477A5F6EB06107066048508498A291b";
const USDT_ADDRESS                 = "0x4988a896b1227218e4A686fdE5EabdcAbd91571f";
const FRAX_ADDRESS                 = "0xDA2585430fEf327aD8ee44Af8F1f989a2A91A3d2";
const WBTC_ADDRESS                 = "0xf4eb217ba2454613b15dbdea6e5f22276410e89e";
const WETH_ADDRESS                 = "0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB";
const SOLACE_ADDRESS               = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const AURORA_ADDRESS               = "0x8BEc47865aDe3B172A928df8f990Bc7f2A3b9f79";
const PLY_ADDRESS                  = "0x09C9D464b58d96837f8d8b6f4d9fE4aD408d3A4f";
const BSTN_ADDRESS                 = "0x9f1F933C660a1DC856F0E0Fe058435879c5CCEf0";
const BBT_ADDRESS                  = "0x4148d2Ce7816F0AE378d98b40eB3A7211E1fcF0D";
const TRI_ADDRESS                  = "0xFa94348467f64D5A457F75F8bc40495D33c65aBB";
const VWAVE_ADDRESS                = "0x2451dB68DeD81900C4F16ae1af597E9658689734";

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
  /*
  await expectDeployed(USDC_PRICE_FEED_ADDRESS);
  await expectDeployed(DAI_PRICE_FEED_ADDRESS);
  await expectDeployed(USDT_PRICE_FEED_ADDRESS);
  await expectDeployed(FRAX_PRICE_FEED_ADDRESS);
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
  */

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
    { token: DAI_ADDRESS, priceFeed: DAI_PRICE_FEED_ADDRESS, tokenDecimals: 18, priceFeedDecimals: 8 },
    { token: USDT_ADDRESS, priceFeed: USDT_PRICE_FEED_ADDRESS, tokenDecimals: 6, priceFeedDecimals: 8 },
    { token: FRAX_ADDRESS, priceFeed: FRAX_PRICE_FEED_ADDRESS, tokenDecimals: 18, priceFeedDecimals: 8 },
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
