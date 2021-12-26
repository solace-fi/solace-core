import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.LOCALHOST_ACCOUNTS || '[]')[0], provider);

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Solace, XSolace, BondDepository, BondTellerErc20, BondTellerEth, FarmRewards } from "../typechain";
import { BytesLike, constants } from "ethers";

const BOND_START_TIME = BN.from("1638205200"); // 5 PM UTC November 29 2021
const MAX_UINT40 = BN.from("1099511627775");
const ONE_ETHER = BN.from("1000000000000000000");
const VESTING_TERM = 432000; // 5 days
const HALF_LIFE = 2592000; // 30 days
const FIFTY_THOUSAND_SOLACE = BN.from("50000000000000000000000");

const SOLACE_ADDRESS                = "";
const XSOLACE_ADDRESS               = "";
const UNDERWRITING_POOL_ADDRESS     = "0xBcd4042DE499D14e55001CcbB24a551F3b954096"; // hardhat node account #10
const DAO_ADDRESS                   = "0x71bE63f3384f5fb98995898A86B02Fb2426c5788"; // hardhat node account #11
const BOND_DEPO_ADDRESS             = "";

const DAI_ADDRESS                   = "";
const DAI_BOND_TELLER_ADDRESS       = "";

const WETH_ADDRESS                  = "";
const ETH_BOND_TELLER_ADDRESS       = "";

const USDC_ADDRESS                  = "";
const USDC_BOND_TELLER_ADDRESS      = "";
const SLP_USDC_ADDRESS              = "";
const SLP_USDC_BOND_TELLER_ADDRESS  = "";

const WBTC_ADDRESS                  = "";
const WBTC_BOND_TELLER_ADDRESS      = "";

const USDT_ADDRESS                  = "";
const USDT_BOND_TELLER_ADDRESS      = "";

const SCP_ADDRESS                   = "";
const SCP_BOND_TELLER_ADDRESS       = "";

const FRAX_ADDRESS                  = "";

const FARM_REWARDS_ADDRESS          = "";

let artifacts: ArtifactImports;

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

let farmRewards: FarmRewards;

let signerAddress: string;
let tellerImplementationAddress: string;

let tokenAddresses: any = {};

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  await deployTestnetTokens();

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

  await deployFarmRewards();

  await logAddresses();
}

async function deploySOLACE() {
  if(!!SOLACE_ADDRESS) {
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    solace = (await deployContract(deployer, artifacts.SOLACE, [signerAddress])) as Solace;
    console.log(`Deployed SOLACE to ${solace.address}`);
  }
}

async function deployXSOLACE() {
  if(!!XSOLACE_ADDRESS) {
    xsolace = (await ethers.getContractAt(artifacts.xSOLACE.abi, XSOLACE_ADDRESS)) as XSolace;
  } else {
    console.log("Deploying xSOLACE");
    xsolace = (await deployContract(deployer, artifacts.xSOLACE, [signerAddress, solace.address])) as XSolace;
    console.log(`Deployed xSOLACE to ${xsolace.address}`);
  }
}

async function deployBondDepo() {
  if(!!BOND_DEPO_ADDRESS) {
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
  } else {
    console.log("Deploying BondDepository");
    bondDepo = (await deployContract(deployer, artifacts.BondDepository, [signerAddress, solace.address, xsolace.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS])) as BondDepository;
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
    daiTeller = (await deployContract(deployer, artifacts.BondTellerERC20)) as BondTellerErc20;
    console.log(`DAI Teller - deployed to ${daiTeller.address}`);
    console.log('DAI teller - init');
    let tx1 = await daiTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xsolace.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, tokenAddresses["DAI"], bondDepo.address);
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
    ethTeller = (await deployContract(deployer, artifacts.BondTellerETH)) as BondTellerEth;
    console.log(`ETH Teller - deployed to ${ethTeller.address}`);
    console.log('ETH teller - init');
    let tx1 = await ethTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xsolace.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, tokenAddresses["WETH"], bondDepo.address);
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
    usdcTeller = await deployProxyTeller(NAME, tellerImplementationAddress, tokenAddresses["USDC"]);
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
    slpUsdcTeller = await deployProxyTeller(NAME, tellerImplementationAddress, tokenAddresses["SLP"]);
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
    wbtcTeller = await deployProxyTeller(NAME, tellerImplementationAddress, tokenAddresses["WBTC"]);
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
    usdtTeller = await deployProxyTeller(NAME, tellerImplementationAddress, tokenAddresses["USDT"]);
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
    scpTeller = await deployProxyTeller(NAME, tellerImplementationAddress, tokenAddresses["SCP"]);
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

async function deployFarmRewards() {
  if(!!FARM_REWARDS_ADDRESS) {
    farmRewards = (await ethers.getContractAt(artifacts.FarmRewards.abi, FARM_REWARDS_ADDRESS)) as FarmRewards;
  } else {
    console.log("Deploying FarmRewards");
    let solacePerXSolace = BN.from("21338806133989362485"); // as of midnight before December 2, 2021
    farmRewards = (await deployContract(deployer, artifacts.FarmRewards, [signerAddress, xsolace.address, DAO_ADDRESS, solacePerXSolace])) as FarmRewards;
    console.log(`Deployed FarmRewards to ${farmRewards.address}`);

    console.log('adding stablecoin support')
    let tx2 = await farmRewards.connect(deployer).supportTokens([tokenAddresses["DAI"], tokenAddresses["USDC"], tokenAddresses["USDT"], tokenAddresses["FRAX"]]);
    await tx2.wait();
  }
}

async function deployTestnetTokens() {
  let tokens: any[] = [
    {name: "Wrapped Ether", symbol: "WETH", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "Dai Stablecoin", symbol: "DAI", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: true},
    {name: "USD Coin", symbol: "USDC", supply: BN.from("1000000000"), decimals: 6, permit: true},
    {name: "Wrapped Bitcoin", symbol: "WBTC", supply: BN.from("1000000000"), decimals: 8, permit: false},
    {name: "USD Token", symbol: "USDT", supply: BN.from("1000000000"), decimals: 6, permit: false},
    {name: "Frax", symbol: "FRAX", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: false},
    {name: "Solace CP Token", symbol: "SCP", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: true},
    {name: "SOLACE-USDC SLP", symbol: "SLP", supply: ONE_ETHER.mul(1000000), decimals: 18, permit: true},
  ];
  for(var i = 0; i < tokens.length; ++i) {
    let token = tokens[i];
    console.log(`Deploying ${token.symbol}`);
    let artifact = token.permit ? artifacts.MockERC20Permit : artifacts.MockERC20Decimals;
    let tokenContract = await deployContract(deployer, artifact, [token.name, token.symbol, token.supply, token.decimals]);
    tokenAddresses[token.symbol] = tokenContract.address;
    console.log(`Deployed to ${tokenContract.address}`);
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SOLACE", solace.address);
  logContractAddress("xSOLACE", xsolace.address);
  logContractAddress("FarmRewards", farmRewards.address);
  logContractAddress("BondDepository", bondDepo.address);
  logContractAddress("DAI Bond Teller", daiTeller.address);
  logContractAddress("ETH Bond Teller", ethTeller.address);
  logContractAddress("USDC Bond Teller", usdcTeller.address);
  logContractAddress("SOLACE-USDC SLP Bond Teller", slpUsdcTeller.address);
  logContractAddress("WBTC Bond Teller", wbtcTeller.address);
  logContractAddress("USDT Bond Teller", usdtTeller.address);
  logContractAddress("SCP Bond Teller", scpTeller.address);
  logContractAddress("DAI", tokenAddresses["DAI"]);
  logContractAddress("WETH", tokenAddresses["WETH"]);
  logContractAddress("USDC", tokenAddresses["USDC"]);
  logContractAddress("SOLACE-USDC SLP", tokenAddresses["SLP"]);
  logContractAddress("WBTC", tokenAddresses["WBTC"]);
  logContractAddress("USDT", tokenAddresses["USDT"]);
  logContractAddress("SCP", tokenAddresses["SCP"]);
  logContractAddress("FRAX", tokenAddresses["FRAX"]);

  console.log("\nnote that these token addresses may not be the same as the tokens deployed in part 1");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
