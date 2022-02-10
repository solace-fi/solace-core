import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { create2ContractAuroraTestnet } from "./create2ContractAuroraTestnet";

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Deployer, Solace, XsLocker, BondDepository, BondTellerErc20, BondTellerEth, MockErc20, Weth9 } from "../typechain";
import { BytesLike, constants } from "ethers";
import { deployContract } from "ethereum-waffle";
import { expectDeployed, isDeployed } from "../test/utilities/expectDeployed";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";

const BOND_START_TIME = BN.from("1638205200"); // 5 PM UTC November 29 2021
const MAX_UINT40 = BN.from("1099511627775");
const MAX_UINT128 = BN.from(1).shl(128).sub(1);
const ONE_ETHER = BN.from("1000000000000000000");

const SOLACE_ADDRESS                = "0x501ACE0C6DeA16206bb2D120484a257B9F393891";
const XSLOCKER_ADDRESS              = "0x501ACebF0918c99546b65cEdCD430e0D4A8E9167";
const DAO_ADDRESS                   = "0x501aceB2Ff39b3aC0189ba1ACe497C3dAB486F7B";
const UNDERWRITING_POOL_ADDRESS     = "0x501ace27A074471F099ffFeC008Bd1b151c7F7dE";
const BOND_DEPO_ADDRESS             = "0x501ace1DB88958A47CE7d968A23e7e66d1a95092";

const DAI_ADDRESS                   = "0x87Eba7597721C156240Ae7d8aE26e269118AFdca";
const DAI_BOND_TELLER_ADDRESS       = "0x501acED0B949D96B3289A1b37791cA8bD93B0D65";

const WETH_ADDRESS                  = "0xfBc3957C8448824D6b7928f160331ec595D0dC0E";
const ETH_BOND_TELLER_ADDRESS       = "0x501aCE92490feCEFACa6F9c9Fbe91caCBc823be1";

const USDC_ADDRESS                  = "0xd0062b097a077F1c9DC97aE082a7FE58a0Be03a8";
const USDC_BOND_TELLER_ADDRESS      = "0x501AcE2248c1bB34f709f2768263A64A9805cCdB";

const WBTC_ADDRESS                  = "0x952349F445Ee8A2D546E1E8c963f3004A87e5f93";
const WBTC_BOND_TELLER_ADDRESS      = "0x501Ace54C7a2Cf564ae37538053902550a859D39";

const USDT_ADDRESS                  = "0xb9D6BB8D150a566Eb93d097b9b65dc9b7455Dd67";
const USDT_BOND_TELLER_ADDRESS      = "0x501aCEa6ff6dcE05D108D616cE886AF74f00EAAa";

const FRAX_ADDRESS                  = "0x5405059004A74d191a07badC3e32501ac8A39788";
const FRAX_BOND_TELLER_ADDRESS      = "0x501acE87fF4E7A1498320ABB674a4960A87792E4";

const NEAR_ADDRESS                  = "0x80dAF9794A2b6f0A6B1E58c6Ae99803c028c00f8";
const NEAR_BOND_TELLER_ADDRESS      = "0x501AcE9D730dcf60d6bbD1FDDca9c1b69CAF0A61";

const AURORA_ADDRESS                = "0x034c971902b0B2EF37abd249c1A5DEc5Dc5bE14B";
const AURORA_BOND_TELLER_ADDRESS    = "0x501ACef4fDF8C0597aA40b5Cb82035FFe5Ad3552";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let solace: Solace;
let xslocker: XsLocker;
let bondDepo: BondDepository;

let dai: MockErc20;
let weth: Weth9;
let usdc: MockErc20;
let wbtc: MockErc20;
let usdt: MockErc20;
let frax: MockErc20;
let near: MockErc20;
let aurora: MockErc20;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerEth;
let usdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;
let fraxTeller: BondTellerErc20;
let nearTeller: BondTellerErc20;
let auroraTeller: BondTellerErc20;

let signerAddress: string;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, XSLOCKER_ADDRESS)) as XsLocker;

  //await deployTestnetTokens();
  //await mintTestnetTokens();

  // new underwriting
  await deployBondDepo();

  await deployDaiTeller();
  await deployEthTeller();

  await deployUsdcTeller();
  await deployWbtcTeller();
  await deployUsdtTeller();
  await deployFraxTeller();
  await deployNearTeller();
  await deployAuroraTeller();

  await logAddresses();
}

async function deployBondDepo() {
  if(await isDeployed(BOND_DEPO_ADDRESS)) {
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
  } else {
    console.log("Deploying BondDepository");
    var res = await create2ContractAuroraTestnet(deployer,artifacts.BondDepository, [signerAddress, solace.address], {}, "", deployerContract.address);
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, res.address)) as BondDepository;
    console.log(`Deployed BondDepository to ${bondDepo.address}`);
  }

  if(!(await solace.isMinter(bondDepo.address)) && (await solace.governance() === (signerAddress))) {
    console.log("Adding bond depo as SOLACE minter");
    let tx = await solace.connect(deployer).addMinter(bondDepo.address);
    await tx.wait(10);
    console.log("Added bond depo as SOLACE minter");
  }
}

async function deployDaiTeller() {
  const NAME = "Solace DAI Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_DAI = BN.from("10000000000000000");
  const ONE_TENTH_CENT_IN_DAI = BN.from("1000000000000000");

  const START_PRICE = ONE_CENT_IN_DAI.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_DAI; // tenth of a cent in DAI
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(DAI_BOND_TELLER_ADDRESS)) {
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("DAI Teller - deploy");
    var res = await create2ContractAuroraTestnet(deployer, artifacts.BondTellerERC20, [], {}, "", deployerContract.address);
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, res.address)) as BondTellerErc20;
    console.log(`DAI Teller - deployed to ${daiTeller.address}`);
    console.log('DAI teller - init');
    let tx1 = await daiTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, DAI_ADDRESS, false, bondDepo.address);
    await tx1.wait(10);
    console.log('DAI teller - set terms');
    let tx2 = await daiTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait(10);
    console.log('DAI teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(daiTeller.address);
    await tx3.wait(10);
    console.log('DAI teller - set fees');
    let tx4 = await daiTeller.connect(deployer).setFees(500);
    await tx4.wait(10);
    console.log('DAI teller - done');
  }
}

async function deployEthTeller() {
  const NAME = "Solace ETH Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_ETH = BN.from("3968253968253"); // @ 1 eth = $2520
  const ONE_TENTH_CENT_IN_ETH = BN.from("396825396825");

  const START_PRICE = ONE_CENT_IN_ETH.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_ETH; // tenth of a cent in DAI
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;


  if(await isDeployed(ETH_BOND_TELLER_ADDRESS)) {
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerEth;
  } else {
    console.log("ETH Teller - deploy");
    var res = await create2ContractAuroraTestnet(deployer, artifacts.BondTellerETH, [], {}, "", deployerContract.address);
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, res.address)) as BondTellerEth;
    console.log(`ETH Teller - deployed to ${ethTeller.address}`);
    await expectDeployed(ethTeller.address);
    console.log('ETH teller - init');
    let tx1 = await ethTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, WETH_ADDRESS, false, bondDepo.address);
    await tx1.wait(10);
    console.log('ETH teller - set terms');
    let tx2 = await ethTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait(10);
    console.log('ETH teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(ethTeller.address);
    await tx3.wait(10);
    console.log('ETH teller - set fees');
    let tx4 = await ethTeller.connect(deployer).setFees(500);
    await tx4.wait(10);
    console.log('ETH teller - done');
  }
}

async function deployUsdcTeller() {
  const NAME = "Solace USDC Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_USDC = BN.from("10000");
  const ONE_TENTH_CENT_IN_USDC = BN.from("1000");

  const START_PRICE = ONE_CENT_IN_USDC.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_USDC; // tenth of a cent in DAI
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(USDC_BOND_TELLER_ADDRESS)) {
    usdcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDC Teller - deploy");
    var salt = "0x000000000000000000000000000000000000000000000000000000000198cbbd";
    usdcTeller = await cloneTeller(daiTeller, NAME, USDC_ADDRESS, true, salt);
    console.log(`USDC Teller - deployed to ${usdcTeller.address}`);
    await expectDeployed(usdcTeller.address);
    console.log('USDC Teller - set terms');
    let tx2 = await usdcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait(10);
    console.log('USDC teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(usdcTeller.address);
    await tx3.wait(10);
    console.log('USDC Teller - set fees');
    let tx4 = await usdcTeller.connect(deployer).setFees(500);
    await tx4.wait(10);
    console.log('USDC Teller - done');
  }
}

async function deployWbtcTeller() {
  const NAME = "Solace WBTC Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days

  const ONE_DOLLAR_IN_WBTC = BN.from("2697"); // @ BTC = $37077
  const TEN_CENTS_IN_WBTC = BN.from("269");

  const START_PRICE = ONE_DOLLAR_IN_WBTC.mul(8).div(100); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_DOLLAR_IN_WBTC.div(10); // ten cents in DAI
  const PRICE_ADJ_DENOM = BN.from("5000000000000000000000000"); //  5000,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(WBTC_BOND_TELLER_ADDRESS)) {
    wbtcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, WBTC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("WBTC Teller - deploy");
    var salt = "0x000000000000000000000000000000000000000000000000000000000298a83b";
    wbtcTeller = await cloneTeller(daiTeller, NAME, WBTC_ADDRESS, false, salt);
    console.log(`WBTC Teller - deployed to ${wbtcTeller.address}`);
    await expectDeployed(wbtcTeller.address);
    console.log('WBTC Teller - set terms');
    let tx2 = await wbtcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait(10);
    console.log('WBTC teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(wbtcTeller.address);
    await tx3.wait(10);
    console.log('WBTC Teller - set fees');
    let tx4 = await wbtcTeller.connect(deployer).setFees(500);
    await tx4.wait(10);
    console.log('WBTC Teller - done');
  }
}

async function deployUsdtTeller() {
  const NAME = "Solace USDT Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_USDT = BN.from("10000");
  const ONE_TENTH_CENT_IN_USDT = BN.from("1000");

  const START_PRICE = ONE_CENT_IN_USDT.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_USDT; // tenth of a cent in USDT
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(USDT_BOND_TELLER_ADDRESS)) {
    usdtTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDT_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDT Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000003b1f978";
    usdtTeller = await cloneTeller(daiTeller, NAME, USDT_ADDRESS, false, salt);
    console.log(`USDT Teller - deployed to ${usdtTeller.address}`);
    await expectDeployed(usdtTeller.address);
    console.log('USDT Teller - set terms');
    let tx2 = await usdtTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait(10);
    console.log('USDT teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(usdtTeller.address);
    await tx3.wait(10);
    console.log('USDT Teller - set fees');
    let tx4 = await usdtTeller.connect(deployer).setFees(500);
    await tx4.wait(10);
    console.log('USDT Teller - done');
  }
}

async function deployFraxTeller() {
  const NAME = "Solace FRAX Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_FRAX = BN.from("10000000000000000");
  const ONE_TENTH_CENT_IN_FRAX = BN.from("1000000000000000");

  const START_PRICE = ONE_CENT_IN_FRAX.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_FRAX; // tenth of a cent in FRAX
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;


  if(await isDeployed(FRAX_BOND_TELLER_ADDRESS)) {
    fraxTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, FRAX_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("FRAX Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000003de1cf9";
    fraxTeller = await cloneTeller(daiTeller, NAME, FRAX_ADDRESS, false, salt);
    console.log(`FRAX Teller - deployed to ${fraxTeller.address}`);
    await expectDeployed(fraxTeller.address);
    console.log('FRAX Teller - set terms');
    let tx2 = await fraxTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait(10);
    console.log('FRAX teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(fraxTeller.address);
    await tx3.wait(10);
    console.log('FRAX Teller - set fees');
    let tx4 = await fraxTeller.connect(deployer).setFees(500);
    await tx4.wait(10);
    console.log('FRAX Teller - done');
  }
}

async function deployNearTeller() {
  const NAME = "Solace NEAR Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  //const ONE_CENT_IN_NEAR = BN.from("909090909090909090909"); // @ 1 NEAR = $11
  //const ONE_TENTH_CENT_IN_NEAR = BN.from("90909090909090909090");
  const ONE_CENT_IN_NEAR = BN.from("800000000000000000000"); // @ 1 NEAR = $12.50
  const ONE_TENTH_CENT_IN_NEAR = BN.from("80000000000000000000");

  const START_PRICE = ONE_CENT_IN_NEAR.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_NEAR; // tenth of a cent in NEAR
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;


  if(await isDeployed(NEAR_BOND_TELLER_ADDRESS)) {
    nearTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, NEAR_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("NEAR Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000004373f7d";
    nearTeller = await cloneTeller(daiTeller, NAME, NEAR_ADDRESS, false, salt);
    console.log(`NEAR Teller - deployed to ${nearTeller.address}`);
    await expectDeployed(nearTeller.address);
    console.log('NEAR Teller - set terms');
    let tx2 = await nearTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait(10);
    console.log('NEAR teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(nearTeller.address);
    await tx3.wait(10);
    console.log('NEAR Teller - set fees');
    let tx4 = await nearTeller.connect(deployer).setFees(500);
    await tx4.wait(10);
    console.log('NEAR Teller - done');
  }
}

async function deployAuroraTeller() {
  const NAME = "Solace AURORA Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  //const ONE_CENT_IN_AURORA = BN.from("800000000000000"); // @ 1 AURORA = $12.50
  //const ONE_TENTH_CENT_IN_AURORA = BN.from("80000000000000");
  const ONE_CENT_IN_AURORA = BN.from("724637681159420"); // @ 1 AURORA = $13.80
  const ONE_TENTH_CENT_IN_AURORA = BN.from("72463768115942");

  const START_PRICE = ONE_CENT_IN_AURORA.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_AURORA; // tenth of a cent in AURORA
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;


  if(await isDeployed(AURORA_BOND_TELLER_ADDRESS)) {
    auroraTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, AURORA_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("AURORA Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000004d104f9";
    auroraTeller = await cloneTeller(daiTeller, NAME, AURORA_ADDRESS, false, salt);
    console.log(`AURORA Teller - deployed to ${auroraTeller.address}`);
    await expectDeployed(auroraTeller.address);
    console.log('AURORA Teller - set terms');
    let tx2 = await auroraTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait(10);
    console.log('AURORA teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(auroraTeller.address);
    await tx3.wait(10);
    console.log('AURORA Teller - set fees');
    let tx4 = await auroraTeller.connect(deployer).setFees(500);
    await tx4.wait(10);
    console.log('AURORA Teller - done');
  }
}

async function cloneTeller(sourceTeller: BondTellerErc20, name: string, principal: string, isPermittable: boolean, salt: BytesLike) {
  let addr = await sourceTeller.calculateMinimalProxyDeploymentAddress(salt);
  console.log(`cloning ${sourceTeller.address} to ${addr}`);
  await sourceTeller.clone(name, signerAddress, principal, isPermittable, salt, {gasLimit: 500000});
  let newTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, addr)) as BondTellerErc20;
  return newTeller;
}

async function deployTestnetTokens() {
  console.log(`Deploying WETH`);
  let weth = await deployContract(deployer, artifacts.WETH);
  console.log(`Deployed to ${weth.address}`);
  let tokens: any[] = [
    {name: "Dai Stablecoin", symbol: "DAI", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "USD Coin", symbol: "USDC", supply: BN.from("1000000000"), decimals: 6, permit: true},
    {name: "Wrapped Bitcoin", symbol: "WBTC", supply: BN.from("1000000000"), decimals: 8, permit: false},
    {name: "USD Token", symbol: "USDT", supply: BN.from("1000000000"), decimals: 6, permit: false},
    {name: "Frax", symbol: "FRAX", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "NEAR", symbol: "NEAR", supply: ONE_ETHER.mul(1000000).mul(1000000), decimals: 24, permit: false},
    {name: "Aurora", symbol: "AURORA", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
  ];
  for(var i = 0; i < tokens.length; ++i) {
    let token = tokens[i];
    console.log(`Deploying ${token.symbol}`);
    let artifact = token.permit ? artifacts.MockERC20Permit : artifacts.MockERC20Decimals;
    let tokenContract = await deployContract(deployer, artifact, [token.name, token.symbol, token.supply, token.decimals]);
    console.log(`Deployed to ${tokenContract.address}`);
  }
}

async function mintTestnetTokens() {
  /*
  let weth = await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS);
  console.log('start eth balance');
  console.log(await provider.getBalance(signerAddress));
  console.log('start weth balance');
  console.log(await weth.balanceOf(signerAddress));
  console.log('wrapping eth')
  let tx1 = await weth.connect(deployer).deposit({value: ONE_ETHER.div(1000)});
  await tx1.wait(10);
  console.log('end eth balance');
  console.log(await provider.getBalance(signerAddress));
  console.log('end weth balance');
  console.log(await weth.balanceOf(signerAddress));
  */
  let tokens: any[] = [
    {name: "Dai Stablecoin", symbol: "DAI", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: DAI_ADDRESS},
    {name: "USD Coin", symbol: "USDC", supply: BN.from("1000000000"), decimals: 6, permit: true, address: USDC_ADDRESS},
    {name: "Wrapped Bitcoin", symbol: "WBTC", supply: BN.from("1000000000"), decimals: 8, permit: false, address: WBTC_ADDRESS},
    {name: "USD Token", symbol: "USDT", supply: BN.from("1000000000"), decimals: 6, permit: false, address: USDT_ADDRESS},
    {name: "Frax", symbol: "FRAX", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false, address: FRAX_ADDRESS},
    {name: "NEAR", symbol: "NEAR", supply: ONE_ETHER.mul(1000000).mul(1000000), decimals: 24, permit: false},
    {name: "Aurora", symbol: "AURORA", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
  ];
  /*
  let recipients = [signerAddress];
  for(var j = 0; j < recipients.length; ++j) {
    let recipient = recipients[j];
    for(var i = 0; i < tokens.length; ++i) {
      let token = tokens[i];
      let artifact = token.permit ? artifacts.MockERC20Permit : artifacts.MockERC20Decimals;
      let tokenContract = await ethers.getContractAt(artifact.abi, token.address);
      console.log(`Minting ${token.symbol}`);
      let bal1 = await tokenContract.balanceOf(signerAddress);
      let tx1 = await tokenContract.connect(deployer).mint();
      await tx1.wait(10);
      let bal2 = await tokenContract.balanceOf(signerAddress);
      console.log(`Transferring ${token.symbol}`);
      let tx2 = await tokenContract.connect(deployer).transfer(recipient, bal2.sub(bal1));
      await tx2.wait(10);

      console.log(`Checking balance of ${token.symbol}`);
      console.log(await tokenContract.balanceOf(recipient));
    }
    console.log('Minting SOLACE');
    let tx3 = await solace.connect(deployer).mint(recipient, ONE_ETHER.mul(1000));
    await tx3.wait(10)
    console.log('Checking balance of SOLACE');
    console.log(await solace.balanceOf(recipient));
  }
  */

  //let dai = (await ethers.getContractAt(artifacts.MockERC20.abi, DAI_ADDRESS)) as MockErc20;
  //let bal1 = await dai.balanceOf(signerAddress);
  /*
  let tx1 = await dai.connect(deployer).transfer("0x1271e2acD0d209FA490692F5578239583Cde4073", ONE_ETHER.mul(100000));
  await tx1.wait(10);
  let tx2 = await dai.connect(deployer).transfer("0x34Bb9e91dC8AC1E13fb42A0e23f7236999e063D4", ONE_ETHER.mul(100000));
  await tx2.wait(10);
  */
  /*
  let weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;
  console.log('deposit')
  //let tx3 = await weth.connect(deployer).deposit({value: ONE_ETHER.mul(2).div(10)});
  //await tx3.wait(10);
  console.log('transfer 1')
  let tx4 = await weth.connect(deployer).transfer("0x1271e2acD0d209FA490692F5578239583Cde4073", ONE_ETHER.div(10));
  await tx4.wait(10);
  console.log('transfer 2')
  let tx5 = await weth.connect(deployer).transfer("0x34Bb9e91dC8AC1E13fb42A0e23f7236999e063D4", ONE_ETHER.div(10));
  await tx5.wait(10);
  console.log('done')
  */
  /*
  console.log(bal1)
  console.log(bal1.div(ONE_ETHER));
  let ethBal = await provider.getBalance(signerAddress);
  console.log(ethBal);
  console.log(ethBal.div(ONE_ETHER));
  */
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
  logContractAddress("NEAR Bond Teller", nearTeller.address);
  logContractAddress("AURORA Bond Teller", auroraTeller.address);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
  logContractAddress("NEAR", NEAR_ADDRESS);
  logContractAddress("AURORA", AURORA_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
