import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { create2Contract } from "./create2Contract";

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Deployer, Solace, XsLocker, BondDepository, Faucet, BondTellerErc20, BondTellerEth, MockErc20, Weth9 } from "../typechain";
import { BytesLike, constants } from "ethers";
import { deployContract } from "ethereum-waffle";
import { expectDeployed, isDeployed } from "../test/utilities/expectDeployed";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

const BOND_START_TIME = BN.from("1638205200"); // 5 PM UTC November 29 2021
const MAX_UINT40 = BN.from("1099511627775");
const MAX_UINT128 = BN.from(1).shl(128).sub(1);
const ONE_ETHER = BN.from("1000000000000000000");

const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSLOCKER_ADDRESS              = "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1";
const DAO_ADDRESS                   = "0x501aceB2Ff39b3aC0189ba1ACe497C3dAB486F7B";
const UNDERWRITING_POOL_ADDRESS     = "0x501ace27A074471F099ffFeC008Bd1b151c7F7dE";
const BOND_DEPO_ADDRESS             = "0x501ACe2f00EC599D4FDeA408680e192f88D94D0D";
const FAUCET_ADDRESS                = "0x501AcE6547eCd722EEa4a89d08b040ed09E955a4";

const DAI_ADDRESS                   = "0x31a1D59460a9619ec6965a5684C6d3Ae470D0fE5";
const DAI_BOND_TELLER_ADDRESS       = "0x501ACe677634Fd09A876E88126076933b686967a";

const WETH_ADDRESS                  = "0xd0A1E359811322d97991E03f863a0C30C2cF029C";
const ETH_BOND_TELLER_ADDRESS       = "0x501ACe95141F3eB59970dD64af0405f6056FB5d8";

const USDC_ADDRESS                  = "0x512d93ADc3DF4E24cb4b26c44A91682Ec073F559";
const USDC_BOND_TELLER_ADDRESS      = "0x501ACE7E977e06A3Cb55f9c28D5654C9d74d5cA9";

const WBTC_ADDRESS                  = "0x1063bf969F8D3D7296a2A94274D3df9202da2A3A";
const WBTC_BOND_TELLER_ADDRESS      = "0x501aCEF0d0c73BD103337e6E9Fd49d58c426dC27";

const USDT_ADDRESS                  = "0xAEA2B0F4763c8Ffc33A4c454CD08F803B02B6B53";
const USDT_BOND_TELLER_ADDRESS      = "0x501ACe5CeEc693Df03198755ee80d4CE0b5c55fE";

const SCP_ADDRESS                   = "0x501AcEe83a6f269B77c167c6701843D454E2EFA0";
const SCP_BOND_TELLER_ADDRESS       = "0x501ACe00FD8e5dB7C3be5e6D254ba4995e1B45b7";

const FRAX_ADDRESS                  = "0x58B23b32a9774153E1E344762751aDfdca2764DD";
const FRAX_BOND_TELLER_ADDRESS      = "0x501aCef4F8397413C33B13cB39670aD2f17BfE62";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let solace: Solace;
let xslocker: XsLocker;
let bondDepo: BondDepository;
let faucet: Faucet;

let dai: MockErc20;
let weth: Weth9;
let usdc: MockErc20;
let wbtc: MockErc20;
let usdt: MockErc20;
let scp: any;
let frax: MockErc20;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerEth;
let usdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;
let scpTeller: BondTellerErc20;
let fraxTeller: BondTellerErc20;

let signerAddress: string;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  if((await provider.getNetwork()).chainId == 31337) { // testnet
    console.log('funding')
    var [funder] = await hardhat.ethers.getSigners();
    let tx = await funder.sendTransaction({to: signerAddress, value: BN.from("100000000000000000000")});
    await tx.wait();
  }

  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, XSLOCKER_ADDRESS)) as XsLocker;

  //await deployTestnetTokens();
  //await mintTestnetTokens();

  // new underwriting
  await deployBondDepo();
  await deployFaucet();

  await deployDaiTeller();
  await deployEthTeller();
  await deployUsdcTeller();
  await deployWbtcTeller();
  await deployUsdtTeller();
  await deployScpTeller();
  await deployFraxTeller();

  await logAddresses();
}

async function deployBondDepo() {
  if(await isDeployed(BOND_DEPO_ADDRESS)) {
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
  } else {
    console.log("Deploying BondDepository");
    var res = await create2Contract(deployer,artifacts.BondDepository, [signerAddress, solace.address], {}, "", deployerContract.address);
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, res.address)) as BondDepository;
    console.log(`Deployed BondDepository to ${bondDepo.address}`);
  }

  if(!(await solace.isMinter(bondDepo.address)) && (await solace.governance() === (signerAddress))) {
    console.log("Adding bond depo as SOLACE minter");
    let tx = await solace.connect(deployer).addMinter(bondDepo.address);
    await tx.wait();
    console.log("Added bond depo as SOLACE minter");
  }

}

async function deployFaucet() {
  if(await isDeployed(FAUCET_ADDRESS)) {
    faucet = (await ethers.getContractAt(artifacts.Faucet.abi, FAUCET_ADDRESS)) as Faucet;
  } else {
    console.log("Deploying Faucet");
    var res = await create2Contract(deployer, artifacts.Faucet, [solace.address], {}, "", deployerContract.address);
    faucet = (await ethers.getContractAt(artifacts.Faucet.abi, res.address)) as Faucet;
    console.log(`Deployed Faucet to ${faucet.address}`);
  }

  if(!(await solace.isMinter(faucet.address)) && (await solace.governance()) == signerAddress) {
    console.log("Adding faucet as SOLACE minter");
    let tx = await solace.connect(deployer).addMinter(faucet.address);
    await tx.wait();
    console.log("Added faucet as SOLACE minter");
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
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_DAI; // tenth of a cent in FRAX
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(DAI_BOND_TELLER_ADDRESS)) {
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("DAI Teller - deploy");
    var res = await create2Contract(deployer, artifacts.BondTellerERC20, [], {}, "", deployerContract.address);
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, res.address)) as BondTellerErc20;
    console.log(`DAI Teller - deployed to ${daiTeller.address}`);
    await expectDeployed(daiTeller.address);
    console.log('DAI teller - init');
    let tx1 = await daiTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, DAI_ADDRESS, false, bondDepo.address);
    await tx1.wait();
    console.log('DAI teller - set terms');
    let tx2 = await daiTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('DAI teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(daiTeller.address);
    await tx3.wait();
    console.log('DAI teller - set fees');
    let tx4 = await daiTeller.connect(deployer).setFees(500);
    await tx4.wait();
    console.log('DAI teller - done');
  }
}

async function deployEthTeller() {
  const NAME = "Solace ETH Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_ETH = BN.from("333333333333333"); // @ 1 eth = $3000
  const ONE_TENTH_CENT_IN_ETH = BN.from("33333333333333");

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
    var res = await create2Contract(deployer, artifacts.BondTellerETH, [], {}, "", deployerContract.address);
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, res.address)) as BondTellerEth;
    console.log(`ETH Teller - deployed to ${ethTeller.address}`);
    await expectDeployed(ethTeller.address);
    console.log('ETH teller - init');
    let tx1 = await ethTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, WETH_ADDRESS, false, bondDepo.address);
    await tx1.wait();
    console.log('ETH teller - set terms');
    let tx2 = await ethTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('ETH teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(ethTeller.address);
    await tx3.wait();
    console.log('ETH teller - set fees');
    let tx4 = await ethTeller.connect(deployer).setFees(500);
    await tx4.wait();
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
    var salt = "0x00000000000000000000000000000000000000000000000000000000019004c0";
    usdcTeller = await cloneTeller(daiTeller, NAME, USDC_ADDRESS, true, salt);
    console.log(`USDC Teller - deployed to ${usdcTeller.address}`);
    console.log('USDC Teller - set terms');
    let tx2 = await usdcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('USDC teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(usdcTeller.address);
    await tx3.wait();
    console.log('USDC Teller - set fees');
    let tx4 = await usdcTeller.connect(deployer).setFees(500);
    await tx4.wait();
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
    var salt = "0x0000000000000000000000000000000000000000000000000000000001f0cd1b";
    wbtcTeller = await cloneTeller(daiTeller, NAME, WBTC_ADDRESS, false, salt);
    console.log(`WBTC Teller - deployed to ${wbtcTeller.address}`);
    console.log('WBTC Teller - set terms');
    let tx2 = await wbtcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('WBTC teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(wbtcTeller.address);
    await tx3.wait();
    console.log('WBTC Teller - set fees');
    let tx4 = await wbtcTeller.connect(deployer).setFees(500);
    await tx4.wait();
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
    var salt = "0x0000000000000000000000000000000000000000000000000000000002153a56";
    usdtTeller = await cloneTeller(daiTeller, NAME, USDT_ADDRESS, false, salt);
    console.log(`USDT Teller - deployed to ${usdtTeller.address}`);
    console.log('USDT Teller - set terms');
    let tx2 = await usdtTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('USDT teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(usdtTeller.address);
    await tx3.wait();
    console.log('USDT Teller - set fees');
    let tx4 = await usdtTeller.connect(deployer).setFees(500);
    await tx4.wait();
    console.log('USDT Teller - done');
  }
}

async function deployScpTeller() {
  const NAME = "Solace SCP Bond";
  //const VESTING_TERM = 604800; // 7 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_SCP = BN.from("3968253968253"); // @ 1 eth = $2520
  const ONE_TENTH_CENT_IN_SCP = BN.from("396825396825");

  const START_PRICE = ONE_CENT_IN_SCP.mul(8); // 8 cents
  const MAX_PAYOUT = BN.from("10000000000000000000000000") // 10 million SOLACE max single bond
  const CAPACITY = BN.from("100000000000000000000000000"); // 100 million SOLACE max over lifetime
  // every 50,000 SOLACE bonded raises the price one tenth of a cent
  const PRICE_ADJ_NUM = ONE_TENTH_CENT_IN_SCP; // tenth of a cent in SCP
  const PRICE_ADJ_DENOM = BN.from("50000000000000000000000"); // 50,000 SOLACE
  if(PRICE_ADJ_NUM.gt(MAX_UINT128) || PRICE_ADJ_DENOM.gt(MAX_UINT128)) throw `Uint128 too large: ${PRICE_ADJ_NUM.toString()} | ${PRICE_ADJ_DENOM.toString()} > ${MAX_UINT128.toString()}`;

  if(await isDeployed(SCP_BOND_TELLER_ADDRESS)) {
    scpTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, SCP_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("SCP Teller - deploy");
    var salt = "0x000000000000000000000000000000000000000000000000000000000244cea9";
    scpTeller = await cloneTeller(daiTeller, NAME, SCP_ADDRESS, true, salt);
    console.log(`SCP Teller - deployed to ${scpTeller.address}`);
    console.log('SCP Teller - set terms');
    let tx2 = await scpTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('SCP teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(scpTeller.address);
    await tx3.wait();
    console.log('SCP Teller - done');
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
    var salt = "0x0000000000000000000000000000000000000000000000000000000002e3569f";
    fraxTeller = await cloneTeller(daiTeller, NAME, FRAX_ADDRESS, false, salt);
    console.log(`FRAX Teller - deployed to ${fraxTeller.address}`);
    console.log('FRAX Teller - set terms');
    let tx2 = await fraxTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('FRAX teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(fraxTeller.address);
    await tx3.wait();
    console.log('FRAX Teller - set fees');
    let tx4 = await fraxTeller.connect(deployer).setFees(500);
    await tx4.wait();
    console.log('FRAX Teller - done');
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
  await tx1.wait();
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
      let tx1 = await tokenContract.connect(deployer).mint();
      await tx1.wait();
      let bal2 = await tokenContract.balanceOf(signerAddress);
      console.log(`Transferring ${token.symbol}`);
      let tx2 = await tokenContract.connect(deployer).transfer(recipient, bal2.sub(bal1));
      await tx2.wait();

      console.log(`Checking balance of ${token.symbol}`);
      console.log(await tokenContract.balanceOf(recipient));
    }
    console.log('Minting SOLACE');
    let tx3 = await solace.connect(deployer).mint(recipient, ONE_ETHER.mul(1000));
    await tx3.wait()
    console.log('Checking balance of SOLACE');
    console.log(await solace.balanceOf(recipient));
  }
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
  logContractAddress("SCP Bond Teller", scpTeller.address);
  logContractAddress("FRAX Bond Teller", fraxTeller.address);
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
