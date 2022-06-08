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
import { Deployer, Solace, BondDepository, BondTellerErc20, BondTellerEth, XsLocker } from "../../typechain";
import { BytesLike, constants } from "ethers";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

const BOND_START_TIME = BN.from("1643655600"); // 11 AM PST / 7 PM UTC January 31 2022
const MAX_UINT40 = BN.from("1099511627775");
const MAX_UINT128 = BN.from(1).shl(128).sub(1);
const ONE_ETHER = BN.from("1000000000000000000");

const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSLOCKER_ADDRESS              = "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1";
const DAO_ADDRESS                   = "0x21afD3bCDa49c125a72ef123Af86d3133b6565Be";
const UNDERWRITING_POOL_ADDRESS     = "0x4A6B0f90597e7429Ce8400fC0E2745Add343df78";
const BOND_DEPO_ADDRESS             = "0x501ACe2f00EC599D4FDeA408680e192f88D94D0D";

const DAI_ADDRESS                   = "0xe3520349F477A5F6EB06107066048508498A291b";
const DAI_BOND_TELLER_ADDRESS       = "0x501ACe677634Fd09A876E88126076933b686967a";

const WETH_ADDRESS                  = "0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB";
const ETH_BOND_TELLER_ADDRESS       = "0x501ACe95141F3eB59970dD64af0405f6056FB5d8";

const USDC_ADDRESS                  = "0xB12BFcA5A55806AaF64E99521918A4bf0fC40802";
const USDC_BOND_TELLER_ADDRESS      = "0x501ACE7E977e06A3Cb55f9c28D5654C9d74d5cA9";

const WBTC_ADDRESS                  = "0xf4eb217ba2454613b15dbdea6e5f22276410e89e";
const WBTC_BOND_TELLER_ADDRESS      = "0x501aCEF0d0c73BD103337e6E9Fd49d58c426dC27";

const USDT_ADDRESS                  = "0x4988a896b1227218e4A686fdE5EabdcAbd91571f";
const USDT_BOND_TELLER_ADDRESS      = "0x501ACe5CeEc693Df03198755ee80d4CE0b5c55fE";

const FRAX_ADDRESS                  = "0xDA2585430fEf327aD8ee44Af8F1f989a2A91A3d2";
const FRAX_BOND_TELLER_ADDRESS      = "0x501aCef4F8397413C33B13cB39670aD2f17BfE62";

const NEAR_ADDRESS                  = "0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d";
const NEAR_BOND_TELLER_ADDRESS      = "0x501aCe71a83CBE03B1467a6ffEaeB58645d844b4";

const AURORA_ADDRESS                = "0x8BEc47865aDe3B172A928df8f990Bc7f2A3b9f79";
const AURORA_BOND_TELLER_ADDRESS    = "0x501Ace35f0B7Fad91C199824B8Fe555ee9037AA3";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let solace: Solace;
let xslocker: XsLocker;
let bondDepo: BondDepository;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerEth;
let usdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;
let fraxTeller: BondTellerErc20;
let nearTeller: BondTellerErc20;
let auroraTeller: BondTellerErc20;

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
  await expectDeployed(DAO_ADDRESS);
  await expectDeployed(UNDERWRITING_POOL_ADDRESS);
  
  await expectDeployed(DAI_ADDRESS);
  await expectDeployed(WETH_ADDRESS);
  await expectDeployed(USDC_ADDRESS);
  await expectDeployed(WBTC_ADDRESS);
  await expectDeployed(USDT_ADDRESS);
  await expectDeployed(FRAX_ADDRESS);
  await expectDeployed(NEAR_ADDRESS);
  await expectDeployed(AURORA_ADDRESS);

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
  console.log(`Bond Depo ${await isDeployed(BOND_DEPO_ADDRESS) ? "is" : "is not"} deployed`);
  if(await isDeployed(BOND_DEPO_ADDRESS)) {
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
  } else {
    console.log("Deploying BondDepository");
    //var res = await create2Contract(deployer,artifacts.BondDepository, [signerAddress, solace.address], {}, "", deployerContract.address);
    let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/bonds/BondDepository.txt").toString().trim();
    let tx = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    await tx.wait(networkSettings.confirmations);
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
    console.log(`Deployed BondDepository to ${bondDepo.address}`);
    await expectDeployed(bondDepo.address);
  }
}

async function deployDaiTeller() {
  const NAME = "Solace DAI Bond";
  const VESTING_TERM = 604800; // 7 days
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_DAI = BN.from("10000000000000000");
  const ONE_TENTH_CENT_IN_DAI = BN.from("1000000000000000");

  const START_PRICE = ONE_CENT_IN_DAI.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_DAI; // tenth of a cent in FRAX
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log(`DAI teller ${await isDeployed(DAI_BOND_TELLER_ADDRESS) ? "is" : "is not"} deployed`);
  if(await isDeployed(DAI_BOND_TELLER_ADDRESS)) {
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("DAI Teller - deploy");
    //var res = await create2Contract(deployer, artifacts.BondTellerERC20, [], {}, "", deployerContract.address);
    let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/bonds/BondTellerErc20.txt").toString().trim();
    let tx = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    await tx.wait(networkSettings.confirmations);
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
    console.log(`DAI Teller - deployed to ${daiTeller.address}`);
    await expectDeployed(daiTeller.address);
    console.log('DAI teller - init');
    let tx1 = await daiTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, DAI_ADDRESS, false, bondDepo.address);
    await tx1.wait(networkSettings.confirmations);
    console.log('DAI teller - set terms');
    let tx2 = await daiTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {...networkSettings.overrides, gasLimit: 300000});
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

  console.log(`ETH teller ${await isDeployed(ETH_BOND_TELLER_ADDRESS) ? "is" : "is not"} deployed`);
  if(await isDeployed(ETH_BOND_TELLER_ADDRESS)) {
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerEth;
  } else {
    console.log("ETH Teller - deploy");
    //var res = await create2Contract(deployer, artifacts.BondTellerETH, [], {}, "", deployerContract.address);
    let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/bonds/BondTellerEth.txt").toString().trim();
    let tx = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    await tx.wait(networkSettings.confirmations);
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerEth;
    console.log(`ETH Teller - deployed to ${ethTeller.address}`);
    await expectDeployed(ethTeller.address);
    console.log('ETH teller - init');
    let tx1 = await ethTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, WETH_ADDRESS, false, bondDepo.address);
    await tx1.wait(networkSettings.confirmations);
    console.log('ETH teller - set terms');
    let tx2 = await ethTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {...networkSettings.overrides, gasLimit: 300000});
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
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_ETH = BN.from("10000"); // @ 1 eth = $4000
  const ONE_TENTH_CENT_IN_ETH = BN.from("1000");

  const START_PRICE = ONE_CENT_IN_ETH.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_ETH; // tenth of a cent in DAI
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  console.log(`USDC teller ${await isDeployed(USDC_BOND_TELLER_ADDRESS) ? "is" : "is not"} deployed`);
  if(await isDeployed(USDC_BOND_TELLER_ADDRESS)) {
    usdcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDC Teller - deploy");
    var salt = "0x00000000000000000000000000000000000000000000000000000000019004c0";
    usdcTeller = await cloneTeller(daiTeller, NAME, USDC_ADDRESS, false, salt);
    console.log(`USDC Teller - deployed to ${usdcTeller.address}`);
    console.log('USDC Teller - set terms');
    let tx2 = await usdcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {...networkSettings.overrides, gasLimit: 300000});
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

  console.log(`WBTC teller ${await isDeployed(WBTC_BOND_TELLER_ADDRESS) ? "is" : "is not"} deployed`);
  if(await isDeployed(WBTC_BOND_TELLER_ADDRESS)) {
    wbtcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, WBTC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("WBTC Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000001f0cd1b";
    wbtcTeller = await cloneTeller(daiTeller, NAME, WBTC_ADDRESS, false, salt);
    console.log(`WBTC Teller - deployed to ${wbtcTeller.address}`);
    console.log('WBTC Teller - set terms');
    let tx2 = await wbtcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {...networkSettings.overrides, gasLimit: 300000});
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

  console.log(`USDT teller ${await isDeployed(USDT_BOND_TELLER_ADDRESS) ? "is" : "is not"} deployed`);
  if(await isDeployed(USDT_BOND_TELLER_ADDRESS)) {
    usdtTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDT_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDT Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000002153a56";
    usdtTeller = await cloneTeller(daiTeller, NAME, USDT_ADDRESS, false, salt);
    console.log(`USDT Teller - deployed to ${usdtTeller.address}`);
    console.log('USDT Teller - set terms');
    let tx2 = await usdtTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {...networkSettings.overrides, gasLimit: 300000});
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

  console.log(`FRAX teller ${await isDeployed(FRAX_BOND_TELLER_ADDRESS) ? "is" : "is not"} deployed`);
  if(await isDeployed(FRAX_BOND_TELLER_ADDRESS)) {
    fraxTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, FRAX_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("FRAX Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000002e3569f";
    fraxTeller = await cloneTeller(daiTeller, NAME, FRAX_ADDRESS, false, salt);
    console.log(`FRAX Teller - deployed to ${fraxTeller.address}`);
    console.log('FRAX Teller - set terms');
    let tx2 = await fraxTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {...networkSettings.overrides, gasLimit: 300000});
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

async function deployNearTeller() {
  const NAME = "Solace NEAR Bond";
  const VESTING_TERM = 604800; // 7 days
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

  console.log('NEAR Bond Teller')
  if(await isDeployed(NEAR_BOND_TELLER_ADDRESS)) {
    nearTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, NEAR_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("NEAR Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000004843332";
    nearTeller = await cloneTeller(daiTeller, NAME, NEAR_ADDRESS, false, salt);
    console.log(`NEAR Teller - deployed to ${nearTeller.address}`);
    await expectDeployed(nearTeller.address);
    console.log('NEAR Teller - set terms');
    let tx2 = await nearTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {...networkSettings.overrides, gasLimit: 300000});
    await tx2.wait(networkSettings.confirmations);
    console.log('NEAR teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(nearTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('NEAR Teller - set fees');
    let tx4 = await nearTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('NEAR Teller - done');
  }
}

async function deployAuroraTeller() {
  const NAME = "Solace AURORA Bond";
  const VESTING_TERM = 604800; // 7 days
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
    var salt = "0x0000000000000000000000000000000000000000000000000000000005201ba9";
    auroraTeller = await cloneTeller(daiTeller, NAME, AURORA_ADDRESS, false, salt);
    console.log(`AURORA Teller - deployed to ${auroraTeller.address}`);
    await expectDeployed(auroraTeller.address);
    console.log('AURORA Teller - set terms');
    let tx2 = await auroraTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {...networkSettings.overrides, gasLimit: 300000});
    await tx2.wait(networkSettings.confirmations);
    console.log('AURORA teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(auroraTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('AURORA Teller - set fees');
    let tx4 = await auroraTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('AURORA Teller - done');
  }
}

async function cloneTeller(sourceTeller: BondTellerErc20, name: string, principal: string, isPermittable: boolean, salt: BytesLike) {
  await expectDeployed(sourceTeller.address);
  let addr = await sourceTeller.calculateMinimalProxyDeploymentAddress(salt);
  console.log(`cloning ${sourceTeller.address} to ${addr}`);
  let tx = await sourceTeller.clone(name, signerAddress, principal, isPermittable, salt, {...networkSettings.overrides, gasLimit: 500000});
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
