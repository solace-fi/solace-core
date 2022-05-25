// deploys the bond contracts

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import fs from "fs";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { create2Contract } from "./../create2Contract";

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Deployer, Solace, BondDepository, BondTellerErc20, BondTellerFtm, XsLocker } from "../../typechain";
import { BytesLike, constants } from "ethers";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";

const DEPLOYER_CONTRACT_ADDRESS     = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";

const BOND_START_TIME = BN.from("1643655600"); // 11 AM PST / 7 PM UTC January 31 2022
const MAX_UINT40 = BN.from("1099511627775");
const MAX_UINT128 = BN.from(1).shl(128).sub(1);
const ONE_ETHER = BN.from("1000000000000000000");

const SOLACE_ADDRESS                = "0x501ACE0C6DeA16206bb2D120484a257B9F393891";
const XSLOCKER_ADDRESS              = "0x501ACebF0918c99546b65cEdCD430e0D4A8E9167";
const DAO_ADDRESS                   = "0x501aceB2Ff39b3aC0189ba1ACe497C3dAB486F7B";
const UNDERWRITING_POOL_ADDRESS     = "0x501ace27A074471F099ffFeC008Bd1b151c7F7dE";
const BOND_DEPO_ADDRESS             = "0x501ace1DB88958A47CE7d968A23e7e66d1a95092";

const DAI_ADDRESS                   = "0xC709a8965eF42fD80b28F226E253283539ddBb12";
const DAI_BOND_TELLER_ADDRESS       = "0x501acED0B949D96B3289A1b37791cA8bD93B0D65";

const WETH_ADDRESS                  = "0x82b2c5950955cfEf23AD73675F7dC8C66cE23150";
const ETH_BOND_TELLER_ADDRESS       = "0x501AcE1CaC9c5c5c5e8Ac61575c7928E0A3397e7";

const USDC_ADDRESS                  = "0x1EE27c7c11E12dBa0F4b3aeEF9599D51Df06bB14";
const USDC_BOND_TELLER_ADDRESS      = "0x501AcE2248c1bB34f709f2768263A64A9805cCdB";

const WBTC_ADDRESS                  = "0xe3a5001b027168dc9b4b64311fc7a9eb87363d78";
const WBTC_BOND_TELLER_ADDRESS      = "0x501Ace54C7a2Cf564ae37538053902550a859D39";

const USDT_ADDRESS                  = "0xC382931bF0D86B0Fd04ecAC093676A61446F3E2d";
const USDT_BOND_TELLER_ADDRESS      = "0x501aCEa6ff6dcE05D108D616cE886AF74f00EAAa";

const FRAX_ADDRESS                  = "0x87Eba7597721C156240Ae7d8aE26e269118AFdca";
const FRAX_BOND_TELLER_ADDRESS      = "0x501acE87fF4E7A1498320ABB674a4960A87792E4";

const WFTM_ADDRESS                  = "0x4701b4535CDcC6541292fCef468836486D871250";
const FTM_BOND_TELLER_ADDRESS       = "0x501acEDb97de787b1A760AbD0e0FC1E5DfC033D8";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let solace: Solace;
let xslocker: XsLocker;
let bondDepo: BondDepository;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerErc20;
let usdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;
let fraxTeller: BondTellerErc20;
let ftmTeller: BondTellerFtm;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, XSLOCKER_ADDRESS)) as XsLocker;

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(SOLACE_ADDRESS);
  await expectDeployed(XSLOCKER_ADDRESS);
  //await expectDeployed(DAO_ADDRESS);
  //await expectDeployed(UNDERWRITING_POOL_ADDRESS);

  await expectDeployed(DAI_ADDRESS);
  await expectDeployed(WETH_ADDRESS);
  await expectDeployed(USDC_ADDRESS);
  await expectDeployed(WBTC_ADDRESS);
  await expectDeployed(USDT_ADDRESS);
  await expectDeployed(FRAX_ADDRESS);
  await expectDeployed(WFTM_ADDRESS);

  // new underwriting
  await deployBondDepo();

  await deployDaiTeller();
  await deployEthTeller();
  await deployUsdcTeller();
  await deployWbtcTeller();
  await deployUsdtTeller();
  await deployFraxTeller();
  await deployFtmTeller();

  await logAddresses();
}

async function deployBondDepo() {
  if(await isDeployed(BOND_DEPO_ADDRESS)) {
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
  } else {
    console.log("Deploying BondDepository");
    //var res = await create2Contract(deployer,artifacts.BondDepository, [signerAddress, solace.address], {}, "", deployerContract.address);
    let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/aurora_testnet/bonds/BondDepository.txt").toString().trim();
    let tx = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    await tx.wait(networkSettings.confirmations);
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
    console.log(`Deployed BondDepository to ${bondDepo.address}`);
    await expectDeployed(bondDepo.address);
  }
  if(!(await solace.isMinter(bondDepo.address)) && (await solace.governance()) == signerAddress) {
    console.log('Adding BondDepo as SOLACE minter');
    let tx2 = await solace.connect(deployer).addMinter(bondDepo.address);
    await tx2.wait(networkSettings.confirmations);
    console.log('Added BondDepo as SOLACE minter');
  }
}

async function deployDaiTeller() {
  const NAME = "Solace DAI Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_DAI = BN.from("1000000000000000000");

  const START_PRICE = ONE_DOLLAR_IN_DAI.mul(300).div(10000); // 3 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_DAI.mul(200).div(10000); // 2 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_DAI.div(1000); // tenth of a cent in DAI
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(DAI_BOND_TELLER_ADDRESS)) {
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("DAI Teller - deploy");
    //var res = await create2Contract(deployer, artifacts.BondTellerERC20, [], {}, "", deployerContract.address);
    let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/aurora_testnet/bonds/BondTellerErc20.txt").toString().trim();
    let tx = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    await tx.wait(networkSettings.confirmations);
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
    await expectDeployed(daiTeller.address);
    console.log(`DAI Teller - deployed to ${daiTeller.address}`);
    console.log('DAI teller - init');
    let tx1 = await daiTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, DAI_ADDRESS, false, bondDepo.address);
    await tx1.wait(networkSettings.confirmations);
    console.log('DAI teller - set terms');
    let tx2 = await daiTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
    console.log('DAI teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(daiTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('DAI teller - set fees');
    let tx4 = await daiTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('DAI teller - done');
  }
}

async function deployEthTeller() {
  const NAME = "Solace ETH Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  // findPrice(18, 3010, 1)
  //const ONE_DOLLAR_IN_ETH = BN.from("300030003000300"); // @ 1 ETH = $3,333
  //const ONE_DOLLAR_IN_ETH = BN.from("332225913621262"); // @ 1 ETH = $3,010
  const ONE_DOLLAR_IN_ETH = BN.from("500000000000000"); // @ 1 ETH = $2,000

  const START_PRICE = ONE_DOLLAR_IN_ETH.mul(300).div(10000); // 3 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_ETH.mul(200).div(10000); // 2 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_ETH.div(1000); // tenth of a cent in ETH
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(ETH_BOND_TELLER_ADDRESS)) {
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("ETH Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000005089e28";
    ethTeller = await cloneTeller(daiTeller, NAME, WETH_ADDRESS, false, salt);
    await expectDeployed(ethTeller.address);
    console.log(`ETH Teller - deployed to ${ethTeller.address}`);
    console.log('ETH teller - set terms');
    let tx2 = await ethTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
    console.log('ETH teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(ethTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('ETH teller - set fees');
    let tx4 = await ethTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('ETH teller - done');
  }
}

async function deployUsdcTeller() {
  const NAME = "Solace USDC Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_USDC = BN.from("1000000");

  const START_PRICE = ONE_DOLLAR_IN_USDC.mul(300).div(10000); // 3 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_USDC.mul(200).div(10000); // 2 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_USDC.div(1000); // tenth of a cent in USDC
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(USDC_BOND_TELLER_ADDRESS)) {
    usdcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDC Teller - deploy");
    var salt = "0x000000000000000000000000000000000000000000000000000000000198cbbd";
    usdcTeller = await cloneTeller(daiTeller, NAME, USDC_ADDRESS, false, salt);
    console.log(`USDC Teller - deployed to ${usdcTeller.address}`);
    console.log('USDC Teller - set terms');
    let tx2 = await usdcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
    console.log('USDC teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(usdcTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('USDC Teller - set fees');
    let tx4 = await usdcTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('USDC Teller - done');
  }
}

async function deployWbtcTeller() {
  const NAME = "Solace WBTC Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  // findPrice(8, 40000, 1)
  //const ONE_DOLLAR_IN_WBTC = BN.from("2222"); // @ 1 BTC = $45,000
  //const ONE_DOLLAR_IN_WBTC = BN.from("2500"); // @ 1 BTC = $40,000
  const ONE_DOLLAR_IN_WBTC = BN.from("3333"); // @ 1 BTC = $30,000

  const START_PRICE = ONE_DOLLAR_IN_WBTC.mul(300).div(10000); // 3 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_WBTC.mul(200).div(10000); // 2 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_WBTC.div(1000); // tenth of a cent in WBTC
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(WBTC_BOND_TELLER_ADDRESS)) {
    wbtcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, WBTC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("WBTC Teller - deploy");
    var salt = "0x000000000000000000000000000000000000000000000000000000000298a83b";
    wbtcTeller = await cloneTeller(daiTeller, NAME, WBTC_ADDRESS, false, salt);
    console.log(`WBTC Teller - deployed to ${wbtcTeller.address}`);
    console.log('WBTC Teller - set terms');
    let tx2 = await wbtcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
    console.log('WBTC teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(wbtcTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('WBTC Teller - set fees');
    let tx4 = await wbtcTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('WBTC Teller - done');
  }
}

async function deployUsdtTeller() {
  const NAME = "Solace USDT Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_USDT = BN.from("1000000");

  const START_PRICE = ONE_DOLLAR_IN_USDT.mul(300).div(10000); // 3 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_USDT.mul(200).div(10000); // 2 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_USDT.div(1000); // tenth of a cent in USDT
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(USDT_BOND_TELLER_ADDRESS)) {
    usdtTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDT_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDT Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000003b1f978";
    usdtTeller = await cloneTeller(daiTeller, NAME, USDT_ADDRESS, false, salt);
    console.log(`USDT Teller - deployed to ${usdtTeller.address}`);
    console.log('USDT Teller - set terms');
    let tx2 = await usdtTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
    console.log('USDT teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(usdtTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('USDT Teller - set fees');
    let tx4 = await usdtTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('USDT Teller - done');
  }
}

async function deployFraxTeller() {
  const NAME = "Solace FRAX Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  const ONE_DOLLAR_IN_FRAX = BN.from("1000000000000000000");

  const START_PRICE = ONE_DOLLAR_IN_FRAX.mul(300).div(10000); // 3 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_FRAX.mul(200).div(10000); // 2 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_FRAX.div(1000); // tenth of a cent in FRAX
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(FRAX_BOND_TELLER_ADDRESS)) {
    fraxTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, FRAX_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("FRAX Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000003de1cf9";
    fraxTeller = await cloneTeller(daiTeller, NAME, FRAX_ADDRESS, false, salt);
    console.log(`FRAX Teller - deployed to ${fraxTeller.address}`);
    console.log('FRAX Teller - set terms');
    let tx2 = await fraxTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: FLOOR_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
    console.log('FRAX teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(fraxTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('FRAX Teller - set fees');
    let tx4 = await fraxTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('FRAX Teller - done');
  }
}

async function deployFtmTeller() {
  const NAME = "Solace FTM Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 43200000; // 500 days
  // findPrice(18, 35, 100)
  const ONE_DOLLAR_IN_FTM = BN.from("2857142857142857142"); // @ 1 FTM = $0.35

  const START_PRICE = ONE_DOLLAR_IN_FTM.mul(300).div(10000); // 3 cents
  const FLOOR_PRICE = ONE_DOLLAR_IN_FTM.mul(200).div(10000); // 2 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_FTM.div(1000); // tenth of a cent in FTM
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(FTM_BOND_TELLER_ADDRESS)) {
    ftmTeller = (await ethers.getContractAt(artifacts.BondTellerFTM.abi, FTM_BOND_TELLER_ADDRESS)) as BondTellerFtm;
  } else {
    console.log("FTM Teller - deploy");
    var res = await create2Contract(deployer, artifacts.BondTellerFTM, [], {}, "", deployerContract.address);
    //let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/aurora_testnet/bonds/BondTellerFtm.txt").toString().trim();
    //let tx = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    //await tx.wait(networkSettings.confirmations);
    ftmTeller = (await ethers.getContractAt(artifacts.BondTellerFTM.abi, FTM_BOND_TELLER_ADDRESS)) as BondTellerFtm;
    await expectDeployed(ftmTeller.address);
    console.log(`FTM Teller - deployed to ${ftmTeller.address}`);
    console.log('FTM teller - init');
    let tx1 = await ftmTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, WFTM_ADDRESS, false, bondDepo.address);
    await tx1.wait(networkSettings.confirmations);
    console.log('FTM teller - set terms');
    let tx2 = await ftmTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {...networkSettings.overrides, gasLimit: 300000});
    await tx2.wait(networkSettings.confirmations);
    console.log('FTM teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(ftmTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('FTM teller - set fees');
    let tx4 = await ftmTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('FTM teller - done');
  }
}

async function cloneTeller(sourceTeller: BondTellerErc20, name: string, principal: string, isPermittable: boolean, salt: BytesLike) {
  await expectDeployed(sourceTeller.address);
  let addr = await sourceTeller.calculateMinimalProxyDeploymentAddress(salt);
  console.log(`cloning ${sourceTeller.address} to ${addr}`);
  let tx = await sourceTeller.connect(deployer).clone(name, signerAddress, principal, isPermittable, salt, {...networkSettings.overrides, gasLimit: 500000});
  let receipt = await tx.wait(networkSettings.confirmations);
  let newTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, addr)) as BondTellerErc20;
  await expectDeployed(newTeller.address);
  return newTeller;
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SOLACE", solace.address);
  logContractAddress("xsLocker", xslocker.address);
  logContractAddress("BondDepository", bondDepo.address);
  logContractAddress("DAI Bond Teller", daiTeller.address);
  logContractAddress("ETH Bond Teller", ethTeller.address);
  logContractAddress("USDC Bond Teller", usdcTeller.address);
  logContractAddress("WBTC Bond Teller", wbtcTeller.address);
  logContractAddress("USDT Bond Teller", usdtTeller.address);
  logContractAddress("FRAX Bond Teller", fraxTeller.address);
  logContractAddress("FTM Bond Teller", ftmTeller.address);
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
