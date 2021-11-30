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
import { Deployer, Solace, XSolace, BondDepository, BondTellerErc20, BondTellerEth } from "../typechain";
import { BytesLike } from "ethers";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

const BOND_START_TIME = BN.from("1638205200"); // 5 PM UTC November 29 2021
const MAX_UINT40 = BN.from("1099511627775");
const MAX_UINT128 = BN.from(1).shl(128).sub(1);
const ONE_ETHER = BN.from("1000000000000000000");
const VESTING_TERM = 432000; // 5 days
const HALF_LIFE = 2592000; // 30 days
const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");

const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSOLACE_ADDRESS               = "0x501AcE5aC3Af20F49D53242B6D208f3B91cfc411";
const UNDERWRITING_POOL_ADDRESS     = "0x5efC0d9ee3223229Ce3b53e441016efC5BA83435";
const DAO_ADDRESS                   = "0xf075334df87f0a5d9fe6381b5035b60f384d6c2c";
const BOND_DEPO_ADDRESS             = "0x501ACe81445C57fC438B358F861d3774199cE13c";

const DAI_ADDRESS                   = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const DAI_BOND_TELLER_ADDRESS       = "0x501AcE5FEe0337e13A442Cb5e15728EE0e8b3F29";

const WETH_ADDRESS                  = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ETH_BOND_TELLER_ADDRESS       = "0x501ace68E20c29629E690D86E54E79719e2Fc5e8";

const USDC_ADDRESS                  = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_BOND_TELLER_ADDRESS      = "0x501aCE044AE4E11183026659EE3B0E3b0Df04d7F";
const SLP_USDC_ADDRESS              = "0x9C051F8A6648a51eF324D30C235da74D060153aC";
const SLP_USDC_BOND_TELLER_ADDRESS  = "0x501acEb253483BD58773365334DEf095304CddAE";

const WBTC_ADDRESS                  = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const WBTC_BOND_TELLER_ADDRESS      = "0x501aCE2f3b5B8f645E67556Df77ac4c3081D84C7";

const USDT_ADDRESS                  = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_BOND_TELLER_ADDRESS      = "0x501acE6061D6176Da12FCBa36Bc85B2fc3FFd5e3";

const SCP_ADDRESS                   = "0x501AcEe83a6f269B77c167c6701843D454E2EFA0";
const SCP_BOND_TELLER_ADDRESS       = "";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let solace: Solace;
let xsolace: XSolace;
let bondDepo: BondDepository;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerEth;
let usdcTeller: BondTellerErc20;
let slpUsdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;

let scpTeller: BondTellerErc20;

let signerAddress: string;
let tellerImplementationAddress: string;

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

  // new underwriting
  await deploySOLACE();
  await deployXSOLACE();

  await deployBondDepo();

  await deployDaiTeller();
  await deployEthTeller();

  await deployUsdcTeller();
  await deploySlpUsdcTeller();
  await deployWbtcTeller();
  await deployUsdtTeller();
  await deployScpTeller();

  await logAddresses();
}

async function deploySOLACE() {
  if(!!SOLACE_ADDRESS) {
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    var res = await create2Contract(deployer,artifacts.SOLACE,[signerAddress], {}, "", deployerContract.address);
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, res.address)) as Solace;
    console.log(`Deployed SOLACE to ${solace.address}`);
  }
  /*
  if(!(await solace.isMinter(deployer.address)) && (await solace.governance()) == signerAddress) {
    console.log("Adding deployer as SOLACE minter");
    let tx = await solace.connect(deployer).addMinter(deployer.address);
    await tx.wait();
  }
  */
}

async function deployXSOLACE() {
  if(!!XSOLACE_ADDRESS) {
    xsolace = (await ethers.getContractAt(artifacts.xSOLACE.abi, XSOLACE_ADDRESS)) as XSolace;
  } else {
    console.log("Deploying xSOLACE");
    var res = await create2Contract(deployer, artifacts.xSOLACE, [signerAddress, solace.address], {}, "", deployerContract.address);
    xsolace = (await ethers.getContractAt(artifacts.xSOLACE.abi, res.address)) as XSolace;
    console.log(`Deployed xSOLACE to ${xsolace.address}`);
  }
}

async function deployBondDepo() {
  if(!!BOND_DEPO_ADDRESS) {
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
  } else {
    console.log("Deploying BondDepository");
    var res = await create2Contract(deployer,artifacts.BondDepository, [signerAddress, solace.address, xsolace.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS], {}, "", deployerContract.address);
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, res.address)) as BondDepository;
    console.log(`Deployed BondDepository to ${bondDepo.address}`);
  }
}

async function deployDaiTeller() {
  const ONE_CENT_IN_DAI = BN.from("10000000000000000");
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
    let tx1 = await daiTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xsolace.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, DAI_ADDRESS, bondDepo.address);
    await tx1.wait();
    console.log('DAI teller - set terms');
    let tx2 = await daiTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
    await tx2.wait();
    console.log('DAI teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(daiTeller.address);
    await tx3.wait();
    console.log('DAI teller - set fees');
    let tx4 = await daiTeller.connect(deployer).setFees(500, 500);
    await tx4.wait();
    console.log('DAI teller - done');
  }
  tellerImplementationAddress = daiTeller.address;
}

async function deployEthTeller() {
  const ONE_CENT_IN_ETH = BN.from("2500000000000"); // @ 1 eth = $4000
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
    let tx1 = await ethTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xsolace.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, WETH_ADDRESS, bondDepo.address);
    await tx1.wait();
    console.log('ETH teller - set terms');
    let tx2 = await ethTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
    await tx2.wait();
    console.log('ETH teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(ethTeller.address);
    await tx3.wait();
    console.log('ETH teller - set fees');
    let tx4 = await ethTeller.connect(deployer).setFees(500, 500);
    await tx4.wait();
    console.log('ETH teller - done');
  }
}

async function deployUsdcTeller() {
  const ONE_CENT_IN_USDC = BN.from("10000");
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
    var salt = "0x0000000000000000000000000000000000000000000000000000000000aed0a5";
    usdcTeller = await deploy2ProxyTeller(NAME, tellerImplementationAddress, USDC_ADDRESS, salt);
    console.log(`USDC Teller - deployed to ${usdcTeller.address}`);
    console.log('USDC Teller - set terms');
    let tx2 = await usdcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
    await tx2.wait();
    console.log('USDC Teller - set fees');
    let tx4 = await usdcTeller.connect(deployer).setFees(500, 500);
    await tx4.wait();
    console.log('USDC Teller - done');
  }
}

async function deploySlpUsdcTeller() {
  const ONE_CENT_IN_SLP = BN.from("28867513000");
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
    slpUsdcTeller = await deploy2ProxyTeller(NAME, tellerImplementationAddress, SLP_USDC_ADDRESS, salt);
    console.log(`SOLACE-USDC SLP Teller - deployed to ${slpUsdcTeller.address}`);
    console.log('SOLACE-USDC SLP Teller - set terms');
    let tx2 = await slpUsdcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
    await tx2.wait();
    console.log('SOLACE-USDC SLP Teller - set fees');
    let tx4 = await slpUsdcTeller.connect(deployer).setFees(500, 0);
    await tx4.wait();
    console.log('SOLACE-USDC SLP Teller - done');
  }
}

async function deployWbtcTeller() {
  const TEN_CENTS_IN_WBTC = BN.from("170"); // @ BTC ~= 58K
  const FIVE_HUNDRED_THOUSAND_SOLACE = BN.from("500000000000000000000000");
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
    var salt = "0x00000000000000000000000000000000000000000000000000000000025e61f1";
    wbtcTeller = await deploy2ProxyTeller(NAME, tellerImplementationAddress, WBTC_ADDRESS, salt);
    console.log(`WBTC Teller - deployed to ${wbtcTeller.address}`);
    console.log('WBTC Teller - set terms');
    let tx2 = await wbtcTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
    await tx2.wait();
    console.log('WBTC Teller - set fees');
    let tx4 = await wbtcTeller.connect(deployer).setFees(500, 500);
    await tx4.wait();
    console.log('WBTC Teller - done');
  }
}

async function deployUsdtTeller() {
  const ONE_CENT_IN_USDT = BN.from("10000");
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
    var salt = "0x0000000000000000000000000000000000000000000000000000000002988a69";
    usdtTeller = await deploy2ProxyTeller(NAME, tellerImplementationAddress, USDT_ADDRESS, salt);
    console.log(`USDT Teller - deployed to ${usdtTeller.address}`);
    console.log('USDT Teller - set terms');
    let tx2 = await usdtTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: true, startTime: BOND_START_TIME, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
    await tx2.wait();
    console.log('USDT Teller - set fees');
    let tx4 = await usdtTeller.connect(deployer).setFees(500, 500);
    await tx4.wait();
    console.log('USDT Teller - done');
  }
}

async function deployScpTeller() {
  const ONE_CENT_IN_SCP = BN.from("2500000000000"); // @ 1 eth = $4000
  const START_PRICE = ONE_CENT_IN_SCP.mul(10); // 10 cents
  const MAX_PAYOUT = BN.from("1000000000000000000000000") // 1 million SOLACE max single bond
  const CAPACITY = BN.from("573380511154278202017"); // SCP total supply
  const PRICE_ADJ_NUM = ONE_CENT_IN_SCP; // every 50,000 SOLACE bonded raises the price one cent
  const PRICE_ADJ_DENOM = FIFTY_THOUSAND_SOLACE;
  const NAME = "Solace SCP Bond";

  if(!!SCP_BOND_TELLER_ADDRESS) {
    scpTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, SCP_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("SCP Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000006b38c98";
    scpTeller = await deploy2ProxyTeller(NAME, tellerImplementationAddress, SCP_ADDRESS, salt);
    console.log(`SCP Teller - deployed to ${scpTeller.address}`);
    console.log('SCP Teller - set terms');
    let tx2 = await scpTeller.connect(deployer).setTerms({startPrice: START_PRICE, minimumPrice: START_PRICE, maxPayout: MAX_PAYOUT, priceAdjNum: PRICE_ADJ_NUM, priceAdjDenom: PRICE_ADJ_DENOM, capacity: CAPACITY, capacityIsPayout: false, startTime: BOND_START_TIME, endTime: MAX_UINT40, vestingTerm: VESTING_TERM, halfLife: HALF_LIFE});
    await tx2.wait();
    console.log('SCP Teller - set fees');
    let tx4 = await scpTeller.connect(deployer).setFees(500, 0);
    await tx4.wait();
    console.log('SCP Teller - done');
  }
}

async function deployProxyTeller(name: string, implAddress: string, tokenAddress: string) {
  let newTeller;
  let tx = await bondDepo.connect(deployer).createBondTeller(name, signerAddress, implAddress, tokenAddress);
  let events = (await tx.wait())?.events;
  if(events && events.length > 0) {
    let event = events[0];
    newTeller = await ethers.getContractAt(artifacts.BondTellerERC20.abi, event?.args?.["deployment"]) as BondTellerErc20;
  } else throw "no deployment";
  return newTeller;
}

async function deploy2ProxyTeller(name: string, implAddress: string, tokenAddress: string, salt: BytesLike) {
  let newTeller;
  let tx = await bondDepo.connect(deployer).create2BondTeller(name, signerAddress, implAddress, salt, tokenAddress);
  let events = (await tx.wait())?.events;
  if(events && events.length > 0) {
    let event = events[0];
    newTeller = await ethers.getContractAt(artifacts.BondTellerERC20.abi, event?.args?.["deployment"]) as BondTellerErc20;
  } else throw "no deployment";
  return newTeller;
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SOLACE", solace.address);
  logContractAddress("xSOLACE", xsolace.address);
  logContractAddress("BondDepository", bondDepo.address);
  logContractAddress("DAI Bond Teller", daiTeller.address);
  logContractAddress("ETH Bond Teller", ethTeller.address);
  logContractAddress("USDC Bond Teller", usdcTeller.address);
  logContractAddress("SOLACE-USDC SLP Bond Teller", slpUsdcTeller.address);
  logContractAddress("WBTC Bond Teller", wbtcTeller.address);
  logContractAddress("USDT Bond Teller", usdtTeller.address);
  logContractAddress("SCP Bond Teller", scpTeller.address);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("SOLACE-USDC SLP", SLP_USDC_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("SCP", SCP_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
