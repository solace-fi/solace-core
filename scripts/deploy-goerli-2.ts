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
import { Deployer, Solace, XsLocker, BondDepository, Faucet, BondTellerErc20, BondTellerEth } from "../typechain";
import { BytesLike, constants } from "ethers";
import { deployContract } from "ethereum-waffle";
import { readFileSync } from "fs";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

const BOND_START_TIME = BN.from("1638205200"); // 5 PM UTC November 29 2021
const MAX_UINT40 = BN.from("1099511627775");
const MAX_UINT128 = BN.from(1).shl(128).sub(1);
const ONE_ETHER = BN.from("1000000000000000000");
const VESTING_TERM = 432000; // 5 days
//const HALF_LIFE = 2592000; // 30 days
const HALF_LIFE = 604800; // 7 days
const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");

const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSLOCKER_ADDRESS              = "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1";
const UNDERWRITING_POOL_ADDRESS     = "0x501AcE0e8D16B92236763E2dEd7aE3bc2DFfA276";
const DAO_ADDRESS                   = "0x501AcE0e8D16B92236763E2dEd7aE3bc2DFfA276";
const BOND_DEPO_ADDRESS             = "0x501ACe2f00EC599D4FDeA408680e192f88D94D0D";
const FAUCET_ADDRESS                = "0x501AcE1396AD0Dd9067d36797cf734A2482Aa20b";

const DAI_ADDRESS                   = "0x31a1D59460a9619ec6965a5684C6d3Ae470D0fE5";
const DAI_BOND_TELLER_ADDRESS       = "0x501ACe677634Fd09A876E88126076933b686967a";

const WETH_ADDRESS                  = "0x1F0278a6dFA54F607d458Cc7946f7088Fc18465a";
const ETH_BOND_TELLER_ADDRESS       = "0x501ACe95141F3eB59970dD64af0405f6056FB5d8";

const USDC_ADDRESS                  = "0x512d93ADc3DF4E24cb4b26c44A91682Ec073F559";
const USDC_BOND_TELLER_ADDRESS      = "0x501ACE7E977e06A3Cb55f9c28D5654C9d74d5cA9";

const SLP_USDC_ADDRESS              = "";
const SLP_USDC_BOND_TELLER_ADDRESS  = "";

const WBTC_ADDRESS                  = "0x1063bf969F8D3D7296a2A94274D3df9202da2A3A";
const WBTC_BOND_TELLER_ADDRESS      = "0x501aCEF0d0c73BD103337e6E9Fd49d58c426dC27";

const USDT_ADDRESS                  = "0xAEA2B0F4763c8Ffc33A4c454CD08F803B02B6B53";
const USDT_BOND_TELLER_ADDRESS      = "0x501ACe5CeEc693Df03198755ee80d4CE0b5c55fE";

const FRAX_ADDRESS                  = "0x58B23b32a9774153E1E344762751aDfdca2764DD";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let solace: Solace;
let xslocker: XsLocker;
let bondDepo: BondDepository;
let faucet: Faucet;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerEth;
let usdcTeller: BondTellerErc20;
let slpUsdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;

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

  // new underwriting
  await deployBondDepo();
  //await deployFaucet();

  await deployDaiTeller();
  await deployEthTeller();
  await deployUsdcTeller();
  await deployWbtcTeller();
  await deployUsdtTeller();

  //await deploySlpUsdcTeller();
  //await deployTestnetTokens();
  await logAddresses();
}

async function deployBondDepo() {
  if(!!BOND_DEPO_ADDRESS) {
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
  if(!!FAUCET_ADDRESS) {
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
  //const VESTING_TERM = 432000; // 5 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_DAI = BN.from("10000000000000000");
  const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");
  if(ONE_CENT_IN_DAI.gt(MAX_UINT128) || FIFTY_THOUSAND_SOLACE.gt(MAX_UINT128)) throw `Uint128 too large: ${ONE_CENT_IN_DAI.toString()} | ${FIFTY_THOUSAND_SOLACE.toString()} > ${MAX_UINT128.toString()}`;
  const START_PRICE = ONE_CENT_IN_DAI.mul(10); // 10 cents
  const MAX_PAYOUT = BN.from("1000000000000000000000000") // 1 million SOLACE max single bond
  const CAPACITY = BN.from("10000000000000000000000000"); // 10 million SOLACE max over lifetime
  const PRICE_ADJ_NUM = ONE_CENT_IN_DAI; // every 50,000 SOLACE bonded raises the price one cent
  const PRICE_ADJ_DENOM = FIFTY_THOUSAND_SOLACE;
  const NAME = "Solace DAI Bond";

  if(!!DAI_BOND_TELLER_ADDRESS) {
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("DAI Teller - deploy");
    var res = await create2Contract(deployer, artifacts.BondTellerERC20, [], {}, "", deployerContract.address);
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, res.address)) as BondTellerErc20;
    console.log(`DAI Teller - deployed to ${daiTeller.address}`);
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
  //const VESTING_TERM = 432000; // 5 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_ETH = BN.from("2500000000000"); // @ 1 eth = $4000
  const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");
  if(ONE_CENT_IN_ETH.gt(MAX_UINT128) || FIFTY_THOUSAND_SOLACE.gt(MAX_UINT128)) throw `Uint128 too large: ${ONE_CENT_IN_ETH.toString()} | ${FIFTY_THOUSAND_SOLACE.toString()} > ${MAX_UINT128.toString()}`;
  const START_PRICE = ONE_CENT_IN_ETH.mul(10); // 10 cents
  const MAX_PAYOUT = BN.from("1000000000000000000000000") // 1 million SOLACE max single bond
  const CAPACITY = BN.from("10000000000000000000000000"); // 10 million SOLACE max over lifetime
  const PRICE_ADJ_NUM = ONE_CENT_IN_ETH; // every 50,000 SOLACE bonded raises the price one cent
  const PRICE_ADJ_DENOM = FIFTY_THOUSAND_SOLACE;
  const NAME = "Solace ETH Bond";

  if(!!ETH_BOND_TELLER_ADDRESS) {
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerEth;
  } else {
    console.log("ETH Teller - deploy");
    var res = await create2Contract(deployer, artifacts.BondTellerETH, [], {}, "", deployerContract.address);
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, res.address)) as BondTellerEth;
    console.log(`ETH Teller - deployed to ${ethTeller.address}`);
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
  //const VESTING_TERM = 432000; // 5 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_USDC = BN.from("10000");
  const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");
  if(ONE_CENT_IN_USDC.gt(MAX_UINT128) || FIFTY_THOUSAND_SOLACE.gt(MAX_UINT128)) throw `Uint128 too large: ${ONE_CENT_IN_USDC.toString()} | ${FIFTY_THOUSAND_SOLACE.toString()} > ${MAX_UINT128.toString()}`;
  const START_PRICE = ONE_CENT_IN_USDC.mul(10); // 10 cents
  const MAX_PAYOUT = BN.from("1000000000000000000000000") // 1 million SOLACE max single bond
  const CAPACITY = BN.from("10000000000000000000000000"); // 10 million SOLACE max over lifetime
  const PRICE_ADJ_NUM = ONE_CENT_IN_USDC; // every 50,000 SOLACE bonded raises the price one cent
  const PRICE_ADJ_DENOM = FIFTY_THOUSAND_SOLACE;
  const NAME = "Solace USDC Bond";

  if(!!USDC_BOND_TELLER_ADDRESS) {
    usdcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDC Teller - deploy");
    var salt = "0x00000000000000000000000000000000000000000000000000000000019004c0";
    usdcTeller = await cloneTeller(daiTeller, NAME, USDC_ADDRESS, true, salt);
    console.log(`USDC Teller - deployed to ${usdcTeller.address}`);
    console.log('USDC Teller - set terms');
    let tx2 = await usdcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('USDC Teller - set fees');
    let tx4 = await usdcTeller.connect(deployer).setFees(500);
    await tx4.wait();
    console.log('USDC Teller - done');
  }
}

async function deploySlpUsdcTeller() {
  //const VESTING_TERM = 432000; // 5 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_SLP = BN.from("28867513000");
  const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");
  if(ONE_CENT_IN_SLP.gt(MAX_UINT128) || FIFTY_THOUSAND_SOLACE.gt(MAX_UINT128)) throw `Uint128 too large: ${ONE_CENT_IN_SLP.toString()} | ${FIFTY_THOUSAND_SOLACE.toString()} > ${MAX_UINT128.toString()}`;
  const START_PRICE = ONE_CENT_IN_SLP.mul(10); // 10 cents
  const MAX_PAYOUT = BN.from("1000000000000000000000000") // 1 million SOLACE max single bond
  const CAPACITY = BN.from("10000000000000000000000000"); // 10 million SOLACE max over lifetime
  const PRICE_ADJ_NUM = ONE_CENT_IN_SLP; // every 50,000 SOLACE bonded raises the price one cent
  const PRICE_ADJ_DENOM = FIFTY_THOUSAND_SOLACE;
  const NAME = "Solace SOLACE-USDC SLP Bond";

  if(!!SLP_USDC_BOND_TELLER_ADDRESS) {
    slpUsdcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, SLP_USDC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("SOLACE-USDC SLP Teller - deploy");
    var salt = "0x000000000000000000000000000000000000000000000000000000000235ed01";
    slpUsdcTeller = await cloneTeller(daiTeller, NAME, SLP_USDC_ADDRESS, true, salt);
    console.log(`SOLACE-USDC SLP Teller - deployed to ${slpUsdcTeller.address}`);
    console.log('SOLACE-USDC SLP Teller - set terms');
    let tx2 = await slpUsdcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('SOLACE-USDC SLP Teller - set fees');
    let tx4 = await slpUsdcTeller.connect(deployer).setFees(0);
    await tx4.wait();
    console.log('SOLACE-USDC SLP Teller - done');
  }
}

async function deployWbtcTeller() {
  //const VESTING_TERM = 432000; // 5 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const TEN_CENTS_IN_WBTC = BN.from("170"); // @ BTC ~= 58K
  const FIVE_HUNDRED_THOUSAND_SOLACE = BN.from("500000000000000000000000");
  if(TEN_CENTS_IN_WBTC.gt(MAX_UINT128) || FIVE_HUNDRED_THOUSAND_SOLACE.gt(MAX_UINT128)) throw `Uint128 too large: ${TEN_CENTS_IN_WBTC.toString()} | ${FIVE_HUNDRED_THOUSAND_SOLACE.toString()} > ${MAX_UINT128.toString()}`;
  const START_PRICE = TEN_CENTS_IN_WBTC; // 10 cents
  const MAX_PAYOUT = BN.from("1000000000000000000000000") // 1 million SOLACE max single bond
  const CAPACITY = BN.from("10000000000000000000000000"); // 10 million SOLACE max over lifetime
  const PRICE_ADJ_NUM = TEN_CENTS_IN_WBTC; // every 50,000 SOLACE bonded raises the price one cent
  const PRICE_ADJ_DENOM = FIVE_HUNDRED_THOUSAND_SOLACE;
  const NAME = "Solace WBTC Bond";

  if(!!WBTC_BOND_TELLER_ADDRESS) {
    wbtcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, WBTC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("WBTC Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000001f0cd1b";
    wbtcTeller = await cloneTeller(daiTeller, NAME, WBTC_ADDRESS, false, salt);
    console.log(`WBTC Teller - deployed to ${wbtcTeller.address}`);
    console.log('WBTC Teller - set terms');
    let tx2 = await wbtcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('WBTC Teller - set fees');
    let tx4 = await wbtcTeller.connect(deployer).setFees(500);
    await tx4.wait();
    console.log('WBTC Teller - done');
  }
}

async function deployUsdtTeller() {
  //const VESTING_TERM = 432000; // 5 days
  const VESTING_TERM = 600; // 10 minutes
  const HALF_LIFE = 2592000; // 30 days
  const ONE_CENT_IN_USDT = BN.from("10000");
  const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");
  if(ONE_CENT_IN_USDT.gt(MAX_UINT128) || FIFTY_THOUSAND_SOLACE.gt(MAX_UINT128)) throw `Uint128 too large: ${ONE_CENT_IN_USDT.toString()} | ${FIFTY_THOUSAND_SOLACE.toString()} > ${MAX_UINT128.toString()}`;
  const START_PRICE = ONE_CENT_IN_USDT.mul(10); // 10 cents
  const MAX_PAYOUT = BN.from("1000000000000000000000000") // 1 million SOLACE max single bond
  const CAPACITY = BN.from("10000000000000000000000000"); // 10 million SOLACE max over lifetime
  const PRICE_ADJ_NUM = ONE_CENT_IN_USDT; // every 50,000 SOLACE bonded raises the price one cent
  const PRICE_ADJ_DENOM = FIFTY_THOUSAND_SOLACE;
  const NAME = "Solace USDT Bond";

  if(!!USDT_BOND_TELLER_ADDRESS) {
    usdtTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDT_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDT Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000002153a56";
    usdtTeller = await cloneTeller(daiTeller, NAME, USDT_ADDRESS, false, salt);
    console.log(`USDT Teller - deployed to ${usdtTeller.address}`);
    console.log('USDT Teller - set terms');
    let tx2 = await usdtTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, globalVestingTerm: VESTING_TERM, halfLife: HALF_LIFE}, {gasLimit: 300000});
    await tx2.wait();
    console.log('USDT Teller - set fees');
    let tx4 = await usdtTeller.connect(deployer).setFees(500);
    await tx4.wait();
    console.log('USDT Teller - done');
  }
}

async function cloneTeller(sourceTeller: BondTellerErc20, name: string, principal: string, isPermittable: boolean, salt: BytesLike) {
  let addr = await sourceTeller.calculateMinimalProxyDeploymentAddress(salt);
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
  //logContractAddress("SOLACE-USDC SLP Bond Teller", slpUsdcTeller.address);
  logContractAddress("WBTC Bond Teller", wbtcTeller.address);
  logContractAddress("USDT Bond Teller", usdtTeller.address);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("SOLACE-USDC SLP", SLP_USDC_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });