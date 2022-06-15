import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
const formatUnits = ethers.utils.formatUnits
import axios from "axios"
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { BondTellerErc20, BondTellerEth, BondTellerMatic, BondTellerFtm } from "../typechain";
import { isDeployed } from "../test/utilities/expectDeployed";
import { constants } from "ethers";
import { getNetworkSettings } from "./getNetworkSettings";

const BOND_START_TIME = BN.from("1638205200"); // 5 PM UTC November 29 2021
const MAX_UINT40 = BN.from("1099511627775");
const MAX_UINT128 = BN.from(1).shl(128).sub(1);

// almost all networks
let DAI_BOND_TELLER_ADDRESS       = "0x501ACe677634Fd09A876E88126076933b686967a";
let ETH_BOND_TELLER_ADDRESS       = "0x501ACe95141F3eB59970dD64af0405f6056FB5d8"; // mainnet & aurora
let WETH_BOND_TELLER_ADDRESS      = "0x501Ace367f1865DEa154236D5A8016B80a49e8a9"; // polygon & fantom
let USDC_BOND_TELLER_ADDRESS      = "0x501ACE7E977e06A3Cb55f9c28D5654C9d74d5cA9";
let WBTC_BOND_TELLER_ADDRESS      = "0x501aCEF0d0c73BD103337e6E9Fd49d58c426dC27";
let USDT_BOND_TELLER_ADDRESS      = "0x501ACe5CeEc693Df03198755ee80d4CE0b5c55fE";
let SCP_BOND_TELLER_ADDRESS       = "0x501ACe00FD8e5dB7C3be5e6D254ba4995e1B45b7";
let FRAX_BOND_TELLER_ADDRESS      = "0x501aCef4F8397413C33B13cB39670aD2f17BfE62";
let NEAR_BOND_TELLER_ADDRESS      = "0x501aCe71a83CBE03B1467a6ffEaeB58645d844b4";
let AURORA_BOND_TELLER_ADDRESS    = "0x501Ace35f0B7Fad91C199824B8Fe555ee9037AA3";
let MATIC_BOND_TELLER_ADDRESS     = "0x501aCe133452D4Df83CA68C684454fCbA608b9DD";
let FTM_BOND_TELLER_ADDRESS       = "0x501ACE43A70b62744037c0ec78dD043BE35EF653";

 // aurora testnet
let DAI_BOND_TELLER_ADDRESS_AURORA_TESTNET       = "0x501acED0B949D96B3289A1b37791cA8bD93B0D65";
let ETH_BOND_TELLER_ADDRESS_AURORA_TESTNET       = "0x501aCE92490feCEFACa6F9c9Fbe91caCBc823be1";
let USDC_BOND_TELLER_ADDRESS_AURORA_TESTNET      = "0x501AcE2248c1bB34f709f2768263A64A9805cCdB";
let WBTC_BOND_TELLER_ADDRESS_AURORA_TESTNET      = "0x501Ace54C7a2Cf564ae37538053902550a859D39";
let USDT_BOND_TELLER_ADDRESS_AURORA_TESTNET      = "0x501aCEa6ff6dcE05D108D616cE886AF74f00EAAa";
let FRAX_BOND_TELLER_ADDRESS_AURORA_TESTNET      = "0x501acE87fF4E7A1498320ABB674a4960A87792E4";
let NEAR_BOND_TELLER_ADDRESS_AURORA_TESTNET      = "0x501AcE9D730dcf60d6bbD1FDDca9c1b69CAF0A61";
let AURORA_BOND_TELLER_ADDRESS_AURORA_TESTNET    = "0x501ACef4fDF8C0597aA40b5Cb82035FFe5Ad3552";

// fantom testnet
let DAI_BOND_TELLER_ADDRESS_FANTOM_TESTNET       = "0x501acED0B949D96B3289A1b37791cA8bD93B0D65";
let WETH_BOND_TELLER_ADDRESS_FANTOM_TESTNET      = "0x501AcE1CaC9c5c5c5e8Ac61575c7928E0A3397e7";
let USDC_BOND_TELLER_ADDRESS_FANTOM_TESTNET      = "0x501AcE2248c1bB34f709f2768263A64A9805cCdB";
let WBTC_BOND_TELLER_ADDRESS_FANTOM_TESTNET      = "0x501Ace54C7a2Cf564ae37538053902550a859D39";
let USDT_BOND_TELLER_ADDRESS_FANTOM_TESTNET      = "0x501aCEa6ff6dcE05D108D616cE886AF74f00EAAa";
let FRAX_BOND_TELLER_ADDRESS_FANTOM_TESTNET      = "0x501acE87fF4E7A1498320ABB674a4960A87792E4";
let FTM_BOND_TELLER_ADDRESS_FANTOM_TESTNET       = "0x501acEDb97de787b1A760AbD0e0FC1E5DfC033D8";

let artifacts: ArtifactImports;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerEth;
let wethTeller: BondTellerErc20;
let usdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;
let scpTeller: BondTellerErc20;
let fraxTeller: BondTellerErc20;
let nearTeller: BondTellerErc20;
let auroraTeller: BondTellerErc20;
let maticTeller: BondTellerMatic;
let ftmTeller: BondTellerFtm;

let signerAddress: string;
let networkSettings: any;

// use fetchPrices() to get the current prices, verify the results and paste them here
// then use adjustTeller() to set the terms
// these are old prices
var ONE_DOLLAR_IN_WBTC = BN.from("3316");
var ONE_DOLLAR_IN_ETH = BN.from("541348173491262");
var ONE_DOLLAR_IN_NEAR = BN.from("176991150442477876106194");
var ONE_DOLLAR_IN_AURORA = BN.from("323624595469255663");
var ONE_DOLLAR_IN_MATIC = BN.from("1636661211129296235");
var ONE_DOLLAR_IN_FTM = BN.from("2665955745134630765");

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  if(chainID == 1313161555) {
    DAI_BOND_TELLER_ADDRESS = DAI_BOND_TELLER_ADDRESS_AURORA_TESTNET
    ETH_BOND_TELLER_ADDRESS = ETH_BOND_TELLER_ADDRESS_AURORA_TESTNET
    USDC_BOND_TELLER_ADDRESS = USDC_BOND_TELLER_ADDRESS_AURORA_TESTNET
    WBTC_BOND_TELLER_ADDRESS = WBTC_BOND_TELLER_ADDRESS_AURORA_TESTNET
    USDT_BOND_TELLER_ADDRESS = USDT_BOND_TELLER_ADDRESS_AURORA_TESTNET
    FRAX_BOND_TELLER_ADDRESS = FRAX_BOND_TELLER_ADDRESS_AURORA_TESTNET
    NEAR_BOND_TELLER_ADDRESS = NEAR_BOND_TELLER_ADDRESS_AURORA_TESTNET
    AURORA_BOND_TELLER_ADDRESS = AURORA_BOND_TELLER_ADDRESS_AURORA_TESTNET
  } else if(chainID == 4002) {
    DAI_BOND_TELLER_ADDRESS = DAI_BOND_TELLER_ADDRESS_FANTOM_TESTNET
    WETH_BOND_TELLER_ADDRESS = WETH_BOND_TELLER_ADDRESS_FANTOM_TESTNET
    USDC_BOND_TELLER_ADDRESS = USDC_BOND_TELLER_ADDRESS_FANTOM_TESTNET
    WBTC_BOND_TELLER_ADDRESS = WBTC_BOND_TELLER_ADDRESS_FANTOM_TESTNET
    USDT_BOND_TELLER_ADDRESS = USDT_BOND_TELLER_ADDRESS_FANTOM_TESTNET
    FRAX_BOND_TELLER_ADDRESS = FRAX_BOND_TELLER_ADDRESS_FANTOM_TESTNET
    FTM_BOND_TELLER_ADDRESS = FTM_BOND_TELLER_ADDRESS_FANTOM_TESTNET
  }

  //await fetchPrices();

  await adjustDaiTeller();
  await adjustEthTeller();
  await adjustWethTeller();
  await adjustUsdcTeller();
  await adjustWbtcTeller();
  await adjustUsdtTeller();
  await adjustScpTeller();
  await adjustFraxTeller();
  await adjustNearTeller();
  await adjustAuroraTeller();
  await adjustMaticTeller();
  await adjustFtmTeller();
}

async function fetchPrices() {
  let res = await axios.get("https://api.coingecko.com/api/v3/coins/markets?ids=bitcoin,ethereum,near,aurora-near,matic-network,fantom&vs_currency=usd")
  var oneWBTC = res.data.filter((token:any) => token.id == 'bitcoin')[0].current_price
  var oneETH = res.data.filter((token:any) => token.id == 'ethereum')[0].current_price
  var oneNEAR = res.data.filter((token:any) => token.id == 'near')[0].current_price
  var oneAURORA = res.data.filter((token:any) => token.id == 'aurora-near')[0].current_price
  var oneMATIC = res.data.filter((token:any) => token.id == 'matic-network')[0].current_price
  var oneFTM = res.data.filter((token:any) => token.id == 'fantom')[0].current_price
  ONE_DOLLAR_IN_WBTC = findPrice(8, Math.floor(oneWBTC*10000), 10000)
  ONE_DOLLAR_IN_ETH = findPrice(18, Math.floor(oneETH*10000), 10000)
  ONE_DOLLAR_IN_NEAR = findPrice(24, Math.floor(oneNEAR*10000), 10000)
  ONE_DOLLAR_IN_AURORA = findPrice(18, Math.floor(oneAURORA*10000), 10000)
  ONE_DOLLAR_IN_MATIC = findPrice(18, Math.floor(oneMATIC*10000), 10000)
  ONE_DOLLAR_IN_FTM = findPrice(18, Math.floor(oneFTM*10000), 10000)
  console.log(`${rightPad('wbtc',7,' ')} price = ${leftPad(oneWBTC,7,' ')}  one dollar = ${leftPad(ONE_DOLLAR_IN_WBTC.toString(),24,' ')}`)
  console.log(`${rightPad('eth',7,' ')} price = ${leftPad(oneETH,7,' ')}  one dollar = ${leftPad(ONE_DOLLAR_IN_ETH.toString(),24,' ')}`)
  console.log(`${rightPad('near',7,' ')} price = ${leftPad(oneNEAR,7,' ')}  one dollar = ${leftPad(ONE_DOLLAR_IN_NEAR.toString(),24,' ')}`)
  console.log(`${rightPad('aurora',7,' ')} price = ${leftPad(oneAURORA,7,' ')}  one dollar = ${leftPad(ONE_DOLLAR_IN_AURORA.toString(),24,' ')}`)
  console.log(`${rightPad('matic',7,' ')} price = ${leftPad(oneMATIC,7,' ')}  one dollar = ${leftPad(ONE_DOLLAR_IN_MATIC.toString(),24,' ')}`)
  console.log(`${rightPad('ftm',7,' ')} price = ${leftPad(oneFTM,7,' ')}  one dollar = ${leftPad(ONE_DOLLAR_IN_FTM.toString(),24,' ')}`)
  console.log(`var ONE_DOLLAR_IN_WBTC = BN.from("${ONE_DOLLAR_IN_WBTC.toString()}");`)
  console.log(`var ONE_DOLLAR_IN_ETH = BN.from("${ONE_DOLLAR_IN_ETH.toString()}");`)
  console.log(`var ONE_DOLLAR_IN_NEAR = BN.from("${ONE_DOLLAR_IN_NEAR.toString()}");`)
  console.log(`var ONE_DOLLAR_IN_AURORA = BN.from("${ONE_DOLLAR_IN_AURORA.toString()}");`)
  console.log(`var ONE_DOLLAR_IN_MATIC = BN.from("${ONE_DOLLAR_IN_MATIC.toString()}");`)
  console.log(`var ONE_DOLLAR_IN_FTM = BN.from("${ONE_DOLLAR_IN_FTM.toString()}");`)
}

async function adjustDaiTeller() {
  const NAME = "Solace DAI Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_DAI = BN.from("1000000000000000000");

  const START_PRICE = ONE_DOLLAR_IN_DAI.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_DAI.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_DAI.div(1000); // tenth of a cent in DAI
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('DAI teller - set terms');
  if(!(await isDeployed(DAI_BOND_TELLER_ADDRESS))) {
    console.log("DAI teller not deployed on this network. skipping\n");
    return;
  }
  daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  let name = await daiTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await daiTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustEthTeller() {
  const NAME = "Solace ETH Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days

  const START_PRICE = ONE_DOLLAR_IN_ETH.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_ETH.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_ETH.div(1000); // tenth of a cent in ETH
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('ETH teller - set terms');
  if(!(await isDeployed(ETH_BOND_TELLER_ADDRESS))) {
    console.log("ETH teller not deployed on this network. skipping\n");
    return;
  }
  ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerEth;
  let name = await ethTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await ethTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustWethTeller() {
  const NAME = "Solace ETH Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_WETH = ONE_DOLLAR_IN_ETH;

  const START_PRICE = ONE_DOLLAR_IN_WETH.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_WETH.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_WETH.div(1000); // tenth of a cent in WETH
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('WETH teller - set terms');
  if(!(await isDeployed(WETH_BOND_TELLER_ADDRESS))) {
    console.log("WETH teller not deployed on this network. skipping\n");
    return;
  }
  wethTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, WETH_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  let name = await wethTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await wethTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustUsdcTeller() {
  const NAME = "Solace USDC Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_USDC = BN.from("1000000");

  const START_PRICE = ONE_DOLLAR_IN_USDC.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_USDC.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_USDC.div(1000); // tenth of a cent in USDC
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('USDC teller - set terms');
  if(!(await isDeployed(USDC_BOND_TELLER_ADDRESS))) {
    console.log("USDC teller not deployed on this network. skipping\n");
    return;
  }
  usdcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  let name = await usdcTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await usdcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustWbtcTeller() {
  const NAME = "Solace WBTC Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days

  const START_PRICE = ONE_DOLLAR_IN_WBTC.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_WBTC.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_WBTC.div(1000); // tenth of a cent in WBTC
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('WBTC teller - set terms');
  if(!(await isDeployed(WBTC_BOND_TELLER_ADDRESS))) {
    console.log("WBTC teller not deployed on this network. skipping\n");
    return;
  }
  wbtcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, WBTC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  let name = await wbtcTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await wbtcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustUsdtTeller() {
  const NAME = "Solace USDT Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_USDT = BN.from("1000000");

  const START_PRICE = ONE_DOLLAR_IN_USDT.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_USDT.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_USDT.div(1000); // tenth of a cent in USDT
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('USDT teller - set terms');
  if(!(await isDeployed(USDT_BOND_TELLER_ADDRESS))) {
    console.log("USDT teller not deployed on this network. skipping\n");
    return;
  }
  usdtTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDT_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  let name = await usdtTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await usdtTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustScpTeller() {
  const NAME = "Solace SCP Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_SCP = ONE_DOLLAR_IN_ETH;

  const START_PRICE = ONE_DOLLAR_IN_SCP.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_SCP.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_SCP.div(1000); // tenth of a cent in SCP
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('SCP teller - set terms');
  if(!(await isDeployed(SCP_BOND_TELLER_ADDRESS))) {
    console.log("SCP teller not deployed on this network. skipping\n");
    return;
  }
  scpTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, SCP_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  let name = await scpTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await scpTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustFraxTeller() {
  const NAME = "Solace FRAX Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_FRAX = BN.from("1000000000000000000");

  const START_PRICE = ONE_DOLLAR_IN_FRAX.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_FRAX.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_FRAX.div(1000); // tenth of a cent in FRAX
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('FRAX teller - set terms');
  if(!(await isDeployed(FRAX_BOND_TELLER_ADDRESS))) {
    console.log("FRAX teller not deployed on this network. skipping\n");
    return;
  }
  fraxTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, FRAX_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  let name = await fraxTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await fraxTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustNearTeller() {
  const NAME = "Solace NEAR Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days

  const START_PRICE = ONE_DOLLAR_IN_NEAR.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_NEAR.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_NEAR.div(1000); // tenth of a cent in NEAR
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('NEAR teller - set terms');
  if(!(await isDeployed(NEAR_BOND_TELLER_ADDRESS))) {
    console.log("NEAR teller not deployed on this network. skipping\n");
    return;
  }
  nearTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, NEAR_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  let name = await nearTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await nearTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustAuroraTeller() {
  const NAME = "Solace AURORA Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days

  const START_PRICE = ONE_DOLLAR_IN_AURORA.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_AURORA.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_AURORA.div(1000); // tenth of a cent in AURORA
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('AURORA teller - set terms');
  if(!(await isDeployed(AURORA_BOND_TELLER_ADDRESS))) {
    console.log("AURORA teller not deployed on this network. skipping\n");
    return;
  }
  auroraTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, AURORA_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  let name = await auroraTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }
  let tx2 = await auroraTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustMaticTeller() {
  const NAME = "Solace MATIC Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days

  const START_PRICE = ONE_DOLLAR_IN_MATIC.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_MATIC.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_MATIC.div(1000); // tenth of a cent in MATIC
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('MATIC teller - set terms');
  if(!(await isDeployed(MATIC_BOND_TELLER_ADDRESS))) {
    console.log("MATIC teller not deployed on this network. skipping\n");
    return;
  }
  maticTeller = (await ethers.getContractAt(artifacts.BondTellerMATIC.abi, MATIC_BOND_TELLER_ADDRESS)) as BondTellerMatic;
  let name = await maticTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }

  let tx2 = await maticTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

async function adjustFtmTeller() {
  const NAME = "Solace FTM Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days

  const START_PRICE = ONE_DOLLAR_IN_FTM.mul(180).div(10000); // 1.8 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_FTM.mul(100).div(10000); // 1.0 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 500,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_FTM.div(1000); // tenth of a cent in FTM
  const PRICE_ADJ_DENOM = BN.from("500000000000000000000000"); // 500,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log('FTM teller - set terms');
  if(!(await isDeployed(FTM_BOND_TELLER_ADDRESS))) {
    console.log("FTM teller not deployed on this network. skipping\n");
    return;
  }
  ftmTeller = (await ethers.getContractAt(artifacts.BondTellerFTM.abi, FTM_BOND_TELLER_ADDRESS)) as BondTellerFtm;
  let name = await ftmTeller.name();
  if(name != NAME) {
    console.log(`possible misconfiguration. expected '${NAME}' got '${name}'. skipping\n`);
    return;
  }

  let tx2 = await ftmTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log('done\n');
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

// returns the price in an amount of tokens
// eg to find the price of matic @ $1.36
// findPrice(18, 136, 100)
function findPrice(decimals:any, priceNum:any, priceDenom:any) {
  let s = '1'
  for(var i = 0; i < decimals; ++i) s += '0'
  let oneToken = BN.from(s)
  return oneToken.mul(priceDenom).div(priceNum)
}

function leftPad(str:any, len:number, fill:string) {
  var s2 = `${str}`
  while(s2.length < len) s2 = fill + s2
  return s2
}

function rightPad(str:any, len:number, fill:string) {
  var s2 = `${str}`
  while(s2.length < len) s2 = s2 + fill
  return s2
}
