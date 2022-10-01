// some additional setup and usage of solace native

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import axios from "axios"
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { SolaceMegaOracle, FluxMegaOracle, UnderwritingPool, UnderwritingEquity, UnderwritingLockVoting, UnderwritingLocker, GaugeController, MockErc20, DepositHelper, BribeController } from "../../typechain";
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
const NEAR_ADDRESS                 = "0x19435895aDC47127AA3151a9bf96dfa74f8b2C33";
const SOLACE_ADDRESS               = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const AURORA_ADDRESS               = "0x9727B423892C3BCBEBe9458F4FE5e86A954A0980";
const PLY_ADDRESS                  = "0xfdA6cF34193993c28E32340fc7CEf9361e48C7Ac";
const BSTN_ADDRESS                 = "0xb191d201073Bb24453419Eb3c1e0B790e6EFA6DF";
const BBT_ADDRESS                  = "0xAaF70eE6d386dD0410E2681FA33367f53b3BCc18";
const TRI_ADDRESS                  = "0x13fcD385A20496ed729AF787EC109A6aB4B44d75";
const VWAVE_ADDRESS                = "0x5C4Ccc7b2a2bC3E5c009364917fff92d12a08fF4";

// contract addresses
const SOLACE_MEGA_ORACLE_ADDRESS        = "0x501acE1701111C26Ac718952EEFB3698bDCe70Cf";
const FLUX_MEGA_ORACLE_ADDRESS          = "0x501AcEd36232595b46A1Fb03cCF3cE5e056d5F13";
const UWP_ADDRESS                       = "0x501ACEb41708De16FbedE3b31f3064919E9d7F23";
const UWE_ADDRESS                       = "0x501ACE809013C8916CAAe439e9653bc436172919";
const REVENUE_ROUTER_ADDRESS            = "0x501aceB2Ff39b3aC0189ba1ACe497C3dAB486F7B";
const UNDERWRITING_LOCKER_ADDRESS       = "0x501aCeFC6a6ff5Aa21c27D7D9D58bedCA94f7BC9";
const GAUGE_CONTROLLER_ADDRESS          = "0x501acE57a87C6B4Eec1BfD2fF2d600F65C2875aB";
const UNDERWRITING_LOCK_VOTING_ADDRESS  = "0x501ACe9cc96E4eE51a4c2098d040EE15F6f3e77F";
const DEPOSIT_HELPER_ADDRESS            = "0x501acE1652Cb4d7386cdaBCd84CdE26C811F3520";
const BRIBE_CONTROLLER_ADDRESS          = "0x501Ace5093F43FBF578d081f2d93B5f42e905f90";

const ONE_USDC = BN.from("1000000");
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_NEAR = BN.from("1000000000000000000000000");
const ONE_WBTC = BN.from("100000000");

let artifacts: ArtifactImports;

let solaceMegaOracle: SolaceMegaOracle;
let fluxMegaOracle: FluxMegaOracle;
let uwp: UnderwritingPool;
let uwe: UnderwritingEquity;
let underwritingLocker: UnderwritingLocker;
let underwritingLockVoting: UnderwritingLockVoting;
let gaugeController: GaugeController;
let depositHelper: DepositHelper;
let bribeController: BribeController;

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
  await expectDeployed(NEAR_ADDRESS);
  await expectDeployed(SOLACE_ADDRESS);
  await expectDeployed(AURORA_ADDRESS);
  await expectDeployed(PLY_ADDRESS);
  await expectDeployed(BSTN_ADDRESS);
  await expectDeployed(BBT_ADDRESS);
  await expectDeployed(TRI_ADDRESS);
  await expectDeployed(VWAVE_ADDRESS);

  await expectDeployed(SOLACE_MEGA_ORACLE_ADDRESS);
  await expectDeployed(FLUX_MEGA_ORACLE_ADDRESS);
  await expectDeployed(UWP_ADDRESS);
  await expectDeployed(UWE_ADDRESS);
  await expectDeployed(UNDERWRITING_LOCKER_ADDRESS);
  await expectDeployed(UNDERWRITING_LOCK_VOTING_ADDRESS);
  await expectDeployed(GAUGE_CONTROLLER_ADDRESS);
  await expectDeployed(DEPOSIT_HELPER_ADDRESS);
  await expectDeployed(BRIBE_CONTROLLER_ADDRESS);

  solaceMegaOracle = (await ethers.getContractAt(artifacts.SolaceMegaOracle.abi, SOLACE_MEGA_ORACLE_ADDRESS)) as SolaceMegaOracle;
  fluxMegaOracle = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, FLUX_MEGA_ORACLE_ADDRESS)) as FluxMegaOracle;
  uwp = (await ethers.getContractAt(artifacts.UnderwritingPool.abi, UWP_ADDRESS)) as UnderwritingPool;
  uwe = (await ethers.getContractAt(artifacts.UnderwritingEquity.abi, UWE_ADDRESS)) as UnderwritingEquity;
  underwritingLocker = (await ethers.getContractAt(artifacts.UnderwritingLocker.abi, UNDERWRITING_LOCKER_ADDRESS)) as UnderwritingLocker;
  gaugeController = (await ethers.getContractAt(artifacts.GaugeController.abi, GAUGE_CONTROLLER_ADDRESS)) as GaugeController;
  underwritingLockVoting = (await ethers.getContractAt(artifacts.UnderwritingLockVoting.abi, UNDERWRITING_LOCK_VOTING_ADDRESS)) as UnderwritingLockVoting;
  depositHelper = (await ethers.getContractAt(artifacts.DepositHelper.abi, DEPOSIT_HELPER_ADDRESS)) as DepositHelper;
  bribeController = (await ethers.getContractAt(artifacts.BribeController.abi, BRIBE_CONTROLLER_ADDRESS)) as BribeController;

  await setPriceFeeds();
  //await getUwpTokens();
  //await getTokenValues();
  //await addGauges();
  //await getGauges();
  await rolloverEpoch();
  //await getEpochTimestamps();
  await addBribeTokens();

  //await depositIntoUwp();
  //await depositIntoUwe();
  //await useDepositHelper();
  await useDepositHelper2();
  //await withdrawFromLocks();
  //await withdrawFromUwe();
  //await redeemFromUwp();
  //await castVote();
  //await offerBribe();
  //await acceptBribe();
}

async function setPriceFeeds() {
  console.log('Setting prices in SolaceMegaOracle');
  console.log('fetching prices');
  let tokens = [
    { address: USDC_ADDRESS, coingeckoID: "usd-coin" },
    { address: DAI_ADDRESS, coingeckoID: "dai" },
    { address: USDT_ADDRESS, coingeckoID: "tether" },
    { address: FRAX_ADDRESS, coingeckoID: "frax" },
    { address: WBTC_ADDRESS, coingeckoID: "bitcoin" },
    { address: WETH_ADDRESS, coingeckoID: "ethereum" },
    { address: NEAR_ADDRESS, coingeckoID: "near" },
    { address: SOLACE_ADDRESS, coingeckoID: "solace" },
    { address: AURORA_ADDRESS, coingeckoID: "aurora-near" },
    { address: PLY_ADDRESS, coingeckoID: "aurigami" },
    { address: BSTN_ADDRESS, coingeckoID: "bastion-protocol" },
    { address: BBT_ADDRESS, coingeckoID: "bluebit" },
    { address: TRI_ADDRESS, coingeckoID: "trisolaris" },
    { address: VWAVE_ADDRESS, coingeckoID: "vaporwave" },
  ];
  let coingeckoIDs = tokens.map(token => token.coingeckoID).join(',');
  let url = `https://api.coingecko.com/api/v3/coins/markets?ids=${coingeckoIDs}&vs_currency=usd`;
  let res = await axios.get(url);

  let prices = tokens.map(token => {
    let price = res.data.filter((cgToken:any) => cgToken.id == token.coingeckoID)[0].current_price;
    let price_normalized = ONE_ETHER.mul(Math.floor(price * 1000000000)).div(1000000000);
    console.log(`${rightPad(token.coingeckoID, 20)} ${leftPad(`${price}`, 12)} ${leftPad(price_normalized.toString(), 25)}`);
    return price_normalized;
  });

  let addresses = tokens.map(token => token.address);

  let tx = await solaceMegaOracle.connect(deployer).transmit(addresses, prices, networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  /*
  let tx = await solaceMegaOracle.connect(deployer).transmit(
    [NEAR_ADDRESS, SOLACE_ADDRESS, AURORA_ADDRESS, PLY_ADDRESS, BSTN_ADDRESS, BBT_ADDRESS, TRI_ADDRESS, VWAVE_ADDRESS],
    [ONE_ETHER.mul(4), ONE_ETHER.mul(120).div(10000), ONE_ETHER.mul(14000).div(10000), ONE_ETHER.mul(16).div(10000), ONE_ETHER.mul(36).div(10000), ONE_ETHER.mul(9).div(10000), ONE_ETHER.mul(317).div(10000), ONE_ETHER.mul(223697).div(10000)],
    networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  */
  console.log('Set prices in SolaceMegaOracle');
}

async function getUwpTokens() {
  let len = (await uwp.tokensLength()).toNumber();
  let tokenData = [];
  let tokenMetadata = [];
  let oracleData = [];
  for(let tokenID = 0; tokenID < len; ++tokenID) {
    let data = await uwp.tokenList(tokenID);
    tokenData.push(data);
    let token = (await ethers.getContractAt(artifacts.MockERC20.abi, data.token)) as MockErc20;
    let metadata = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
      token.balanceOf(uwp.address),
    ])
    tokenMetadata.push(metadata);
    let oracle2 = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, data.oracle)) as FluxMegaOracle;
    oracleData.push(await Promise.all([
      oracle2.valueOfTokens(data.token, BN.from(10).pow(metadata[2])), // one token
      oracle2.valueOfTokens(data.token, metadata[3]), // balance
    ]));
  }
  console.log("| Name              | Symbol | Decimals | Price           | Balance  | Value           |");
  console.log("----------------------------------------------------------------------------------------");
  for(let tokenID = 0; tokenID < len; ++tokenID) {
    console.log(`| ${leftPad(tokenMetadata[tokenID][0],17)} | ${leftPad(tokenMetadata[tokenID][1],6)} | ${leftPad(`${tokenMetadata[tokenID][2]}`,8)} | ${leftPad(ethers.utils.formatUnits(oracleData[tokenID][0]),15)} | ${leftPad(ethers.utils.formatUnits(tokenMetadata[tokenID][3],tokenMetadata[tokenID][2]),8)} | ${leftPad(ethers.utils.formatUnits(oracleData[tokenID][1]),15)} |`)

    //console.log(`{"name": "${tokenMetadata[tokenID][0]}", "symbol": "${tokenMetadata[tokenID][1]}", "decimals": ${tokenMetadata[tokenID][2]}, "address": "${tokenData[tokenID].token}", "oracle": "${tokenData[tokenID].oracle}"},`)
  }
}

async function getTokenValues() {
  let len = (await uwp.tokensLength()).toNumber();
  let tokenData = [];
  let tokenMetadata = [];
  let oracleData = [];
  for(let tokenID = 0; tokenID < len; ++tokenID) {
    let data = await uwp.tokenList(tokenID);
    tokenData.push(data);
    let token = (await ethers.getContractAt(artifacts.MockERC20.abi, data.token)) as MockErc20;
    let metadata = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
      token.totalSupply(),
    ])
    tokenMetadata.push(metadata);
    let oracle2 = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, data.oracle)) as FluxMegaOracle;
    oracleData.push(await Promise.all([
      oracle2.valueOfTokens(data.token, BN.from(10).pow(metadata[2])), // one token
      oracle2.valueOfTokens(data.token, metadata[3]), // balance
    ]));
  }
  console.log("| Name              | Symbol | Decimals | Price           | Supply          | Value           |");
  console.log("-----------------------------------------------------------------------------------------------");
  for(let tokenID = 0; tokenID < len; ++tokenID) {
    //console.log(`| ${leftPad(tokenMetadata[tokenID][0],17)} | ${leftPad(tokenMetadata[tokenID][1],6)} | ${leftPad(`${tokenMetadata[tokenID][2]}`,8)} | ${leftPad(ethers.utils.formatUnits(oracleData[tokenID][0]),15)} | ${leftPad(ethers.utils.formatUnits(tokenMetadata[tokenID][3],tokenMetadata[tokenID][2]),15)} | ${leftPad(ethers.utils.formatUnits(oracleData[tokenID][1]),15)} |`)

    let items = [
      leftPad(tokenMetadata[tokenID][0],17),
      leftPad(tokenMetadata[tokenID][1],6),
      leftPad(`${tokenMetadata[tokenID][2]}`,8),
      leftPad(ethers.utils.formatUnits(oracleData[tokenID][0]),15),
      leftPad(Math.floor(parseInt(ethers.utils.formatUnits(tokenMetadata[tokenID][3],tokenMetadata[tokenID][2]))).toLocaleString(),15),
      leftPad(Math.floor(parseInt(ethers.utils.formatUnits(oracleData[tokenID][1]))).toLocaleString(),15)
    ]
    let row = `| ${items.join(' | ')} |`
    console.log(row);

    //console.log(`{"name": "${tokenMetadata[tokenID][0]}", "symbol": "${tokenMetadata[tokenID][1]}", "decimals": ${tokenMetadata[tokenID][2]}, "address": "${tokenData[tokenID].token}", "oracle": "${tokenData[tokenID].oracle}"},`)
  }
}

async function addGauges() {
  console.log("Adding gauges to GaugeController");
  let rol = BN.from(10).pow(18).mul(250).div(10000); // 2.5%
  let appIDs = ["aurora-plus", "aurigami", "bastion-protocol", "bluebit", "trisolaris", "vaporwave-finance"];
  let len = (await gaugeController.totalGauges()).toNumber();
  if(len > 0) {
    console.log(`${len} gauges already found. skipping`);
    return;
  }
  for(let i = 0; i < appIDs.length; ++i) {
    let tx = await gaugeController.connect(deployer).addGauge(appIDs[i], rol, networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
  console.log("Added gauges to GaugeController");
}

async function getGauges() {
  let len = (await gaugeController.totalGauges()).toNumber();
  let gauges = [];
  for(let gaugeID = 1; gaugeID <= len; ++gaugeID) {
    gauges.push(await Promise.all([
      gaugeController.getGaugeName(gaugeID),
      gaugeController.isGaugeActive(gaugeID),
      gaugeController.getRateOnLineOfGauge(gaugeID),
    ]));
  }
  //let header = formatLine(['Gauge Name', 'Status', 'ROL'])
  console.log("| Gauge ID | Gauge Name         | Status   | ROL   |");
  console.log("----------------------------------------------------");
  for(let i = 0; i < len; ++i) {
    let gauge = gauges[i];
    let gaugeID = `${i+1}`
    console.log(`| ${leftPad(gaugeID,8)} | ${leftPad(gauge[0],18)} | ${leftPad(gauge[1]?'active':'inactive',8)} | ${ethers.utils.formatUnits(gauge[2])} |`);
  }
}

async function rolloverEpoch() {
  console.log("Rolling over to next epoch");
  const EPOCH_START_TIME = await gaugeController.getEpochStartTimestamp();

  while (!( EPOCH_START_TIME.eq(await gaugeController.lastTimeGaugeWeightsUpdated()) )) {
    console.log("Rolling over gauge controller");
    const tx = await gaugeController.connect(deployer).updateGaugeWeights({...networkSettings.overrides, gasLimit: 6000000})
    await tx.wait(networkSettings.confirmations)
  }

  while (!( EPOCH_START_TIME.eq(await underwritingLockVoting.lastTimePremiumsCharged()) )) {
    console.log("Rolling over voting");
    const tx = await underwritingLockVoting.connect(deployer).chargePremiums({...networkSettings.overrides, gasLimit: 6000000})
    await tx.wait(networkSettings.confirmations)
  }

  while(true) {
    try {
      let ts1 = await bribeController.getEpochStartTimestamp();
      let ts2 = await bribeController.lastTimeBribesProcessed();
      if(ts2.gte(ts1)) break;
      console.log("Processing bribes");
      let tx = await bribeController.connect(deployer).processBribes(networkSettings.overrides);
      await tx.wait(networkSettings.confirmations);
    } catch(e) { break; }
  }

  console.log("Rolled over to next epoch");
}

async function castVote() {
  console.log("Voting");
  // setup
  let numGauges = (await gaugeController.totalGauges()).toNumber();
  let gaugeIDs = [];
  let gaugeWeights = [];
  let weightLeft = 10000;
  // give all gauges equal amount. may be slightly different due to integer division
  for(let gaugeID = 1; gaugeID <= numGauges; ++gaugeID) {
    gaugeIDs.push(gaugeID);
    let nextWeight = Math.floor(weightLeft / (numGauges + 1 - gaugeID)); // weight left / gauges left
    weightLeft -= nextWeight;
    gaugeWeights.push(nextWeight);
  }
  // send tx
  let tx = await underwritingLockVoting.connect(deployer).voteMultiple(signerAddress, gaugeIDs, gaugeWeights, networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  console.log("Voted");
}

async function getEpochTimestamps() {
  console.log("Fetching epoch timestamps\n");

  console.log("Current time (javascript)");
  logDate(new Date());

  console.log("Current time (solidity)");
  logDate(new Date((await provider.getBlock("latest")).timestamp * 1000));

  console.log("epoch start");
  logDate(new Date((await gaugeController.getEpochStartTimestamp()).toNumber() * 1000));

  console.log("epoch end");
  logDate(new Date((await gaugeController.getEpochEndTimestamp()).toNumber() * 1000));

  console.log("last time gauge weights updated");
  logDate(new Date((await gaugeController.lastTimeGaugeWeightsUpdated()).toNumber() * 1000));

  console.log("last time premiums charged");
  logDate(new Date((await underwritingLockVoting.lastTimePremiumsCharged()).toNumber() * 1000));

  console.log("Fetched epoch timestamps");
}

async function addBribeTokens() {
  console.log("Adding bribe tokens");
  let existingWhitelist = await bribeController.getBribeTokenWhitelist();
  let desiredWhitelist = [
    { address: USDC_ADDRESS, coingeckoID: "usd-coin" },
    { address: DAI_ADDRESS, coingeckoID: "dai" },
    { address: USDT_ADDRESS, coingeckoID: "tether" },
    { address: FRAX_ADDRESS, coingeckoID: "frax" },
    { address: WBTC_ADDRESS, coingeckoID: "bitcoin" },
    { address: WETH_ADDRESS, coingeckoID: "ethereum" },
    { address: NEAR_ADDRESS, coingeckoID: "near" },
    { address: SOLACE_ADDRESS, coingeckoID: "solace" },
    { address: AURORA_ADDRESS, coingeckoID: "aurora-near" },
    { address: PLY_ADDRESS, coingeckoID: "aurigami" },
    { address: BSTN_ADDRESS, coingeckoID: "bastion-protocol" },
    { address: BBT_ADDRESS, coingeckoID: "bluebit" },
    { address: TRI_ADDRESS, coingeckoID: "trisolaris" },
    { address: VWAVE_ADDRESS, coingeckoID: "vaporwave" },
  ];
  //let desiredWhitelist = tokens.map(token => token.address);
  let missingSetAddresses = [];
  let missingSetNames = [];
  for(var i = 0; i < desiredWhitelist.length; ++i) {
    if(!existingWhitelist.includes(desiredWhitelist[i].address)) {
      missingSetAddresses.push(desiredWhitelist[i].address);
      missingSetNames.push(desiredWhitelist[i].coingeckoID);
    }
  }
  if(missingSetAddresses.length == 0) {
    console.log("No tokens to add");
    return;
  }
  console.log("Tokens to add:");
  console.log(missingSetNames.join(', '));
  for(var i = 0; i < missingSetAddresses.length; ++i) {
    let tx = await bribeController.connect(deployer).addBribeToken(missingSetAddresses[i], networkSettings.overrides);
    await tx.wait(networkSettings.confirmations);
  }
  console.log("Added bribe tokens");
}

async function depositIntoUwp() {
  let deposits = [
    { symbol: "USDC", amount: ONE_USDC.mul(1000), address: USDC_ADDRESS, decimals: 6 },
    { symbol: "DAI", amount: ONE_ETHER.mul(1000), address: DAI_ADDRESS, decimals: 18 },
    { symbol: "USDT", amount: ONE_USDC.mul(1000), address: USDT_ADDRESS, decimals: 6 },
    { symbol: "FRAX", amount: ONE_ETHER.mul(1000), address: FRAX_ADDRESS, decimals: 18 },
    { symbol: "WBTC", amount: ONE_WBTC.div(10), address: WBTC_ADDRESS, decimals: 8 },
    { symbol: "WETH", amount: ONE_ETHER.div(1), address: WETH_ADDRESS, decimals: 18 },
    { symbol: "NEAR", amount: ONE_NEAR.mul(250), address: NEAR_ADDRESS, decimals: 24 },
    { symbol: "SOLACE", amount: ONE_ETHER.mul(100000), address: SOLACE_ADDRESS, decimals: 18 },
    { symbol: "AURORA", amount: ONE_ETHER.mul(200), address: AURORA_ADDRESS, decimals: 18 },
    { symbol: "PLY", amount: ONE_ETHER.mul(100000), address: PLY_ADDRESS, decimals: 18 },
    { symbol: "BSTN", amount: ONE_ETHER.mul(100000), address: BSTN_ADDRESS, decimals: 18 },
    { symbol: "BBT", amount: ONE_ETHER.mul(100000), address: BBT_ADDRESS, decimals: 18 },
    { symbol: "TRI", amount: ONE_ETHER.mul(10000), address: TRI_ADDRESS, decimals: 18 },
    { symbol: "VWAVE", amount: ONE_ETHER.mul(50), address: VWAVE_ADDRESS, decimals: 18 },
  ];
  let tokenAddresses = deposits.map(deposit => deposit.address);
  let depositAmounts = deposits.map(deposit => deposit.amount);

  console.log("Depositing tokens into UWP");
  for(var i = 0; i < deposits.length; ++i) {
    let token = (await ethers.getContractAt(artifacts.MockERC20.abi, deposits[i].address)) as MockErc20;
    if((await token.allowance(signerAddress, uwp.address)).lt(deposits[i].amount)) {
      console.log(`Approving ${deposits[i].symbol}`);
      let tx = await token.connect(deployer).approve(uwp.address, ethers.constants.MaxUint256, networkSettings.overrides);
      await tx.wait(networkSettings.confirmations);
    }
    let bal = await token.balanceOf(signerAddress);
    if(bal.lt(deposits[i].amount)) {
      console.log(`insufficient ${deposits[i].symbol} balance. depositing ${ethers.utils.formatUnits(deposits[i].amount, deposits[i].decimals)} have ${ethers.utils.formatUnits(bal, deposits[i].decimals)}`);
    }
  }
  let bal1 = await uwp.balanceOf(signerAddress);
  console.log(`uwp balance before : ${ethers.utils.formatUnits(bal1)}`);
  let tx2 = await uwp.connect(deployer).issue(tokenAddresses, depositAmounts, signerAddress, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  let bal2 = await uwp.balanceOf(signerAddress);
  console.log(`uwp balance after  : ${ethers.utils.formatUnits(bal2)}`);
  console.log("Deposited tokens into UWP");
}

async function redeemFromUwp() {
  console.log("Redeeming UWP");
  let bal = await uwp.balanceOf(signerAddress);
  let tx = await uwp.connect(deployer).redeem(bal, signerAddress, networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  console.log("Redeemed UWP");
}

async function depositIntoUwe() {
  console.log("Depositing UWP into UWE");
  let bal = await uwp.balanceOf(signerAddress);
  let allowance = await uwp.allowance(signerAddress, uwe.address);
  if(allowance.lt(bal)) {
    let tx1 = await uwp.connect(deployer).approve(uwe.address, ethers.constants.MaxUint256, networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
  }
  let bal1 = await uwe.balanceOf(signerAddress);
  console.log(`uwe balance before : ${ethers.utils.formatUnits(bal1)}`);
  console.log(`depositing ${ethers.utils.formatUnits(bal)} uwp`)
  let tx2 = await uwe.connect(deployer).deposit(bal, signerAddress, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  let bal2 = await uwe.balanceOf(signerAddress);
  console.log(`uwe balance after  : ${ethers.utils.formatUnits(bal2)}`);
  console.log("Deposited UWP into UWE");
}

async function useDepositHelper() {
  console.log("Depositing into new lock via DepositHelper");
  let tkn = (await ethers.getContractAt(artifacts.MockERC20.abi, DAI_ADDRESS)) as MockErc20;
  let dec = 18;
  let depositAmount = ONE_ETHER.mul(1000);
  let bal = await tkn.balanceOf(signerAddress);
  if(bal.lt(depositAmount)) {
    console.log(`insufficient balance. depositing ${ethers.utils.formatUnits(depositAmount,dec)} have ${ethers.utils.formatUnits(bal,dec)}`);
    return;
  }
  let allowance = await tkn.allowance(signerAddress, depositHelper.address);
  if(allowance.lt(depositAmount)) {
    let tx1 = await tkn.connect(deployer).approve(depositHelper.address, ethers.constants.MaxUint256, networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
  }
  let expiry = (await provider.getBlock('latest')).timestamp + 60*60*24*365*4; // 4 years from now
  let tx2 = await depositHelper.connect(deployer).depositAndLock(tkn.address, depositAmount, expiry, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  let bal2 = await underwritingLocker.balanceOf(signerAddress);
  let lockID = await underwritingLocker.tokenOfOwnerByIndex(signerAddress, bal2.sub(1));
  let lock = await underwritingLocker.locks(lockID);
  console.log(`created lockID=${lockID.toNumber()}. uwe=${ethers.utils.formatUnits(lock.amount)} expiry=${lock.end}`);
  console.log("Deposited into new lock via DepositHelper");
}

async function useDepositHelper2() {
  console.log("Depositing into existing lock via DepositHelper");
  console.log(`time: ${new Date().toLocaleString()}`);
  let lockID = 1;
  let lockBefore = await underwritingLocker.locks(lockID);
  console.log(`Lock starting with ${ethers.utils.formatUnits(lockBefore.amount)} UWE`);

  let uwpBal = await uwp.balanceOf(signerAddress);
  if(uwpBal.gt(0)) {
    console.log("Depositing UWP");
    let uwpAllow = await uwp.allowance(signerAddress, depositHelper.address);
    if(uwpAllow.lt(uwpBal)) {
      let tx1 = await uwp.connect(deployer).approve(depositHelper.address, ethers.constants.MaxUint256, networkSettings.overrides);
      await tx1.wait(networkSettings.confirmations);
    }
    let tx2 = await depositHelper.connect(deployer).depositIntoLock(uwp.address, uwpBal, lockID, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
  }

  let uweBal = await uwe.balanceOf(signerAddress);
  if(uweBal.gt(0)) {
    console.log("Depositing UWE");
    let uweAllow = await uwe.allowance(signerAddress, depositHelper.address);
    if(uweAllow.lt(uweBal)) {
      let tx1 = await uwe.connect(deployer).approve(depositHelper.address, ethers.constants.MaxUint256, networkSettings.overrides);
      await tx1.wait(networkSettings.confirmations);
    }
    let tx2 = await depositHelper.connect(deployer).depositIntoLock(uwe.address, uweBal, lockID, networkSettings.overrides);
    await tx2.wait(networkSettings.confirmations);
  }

  let deposits = [
    { symbol: "USDC", amount: ONE_USDC.mul(1000), address: USDC_ADDRESS, decimals: 6 },
    { symbol: "DAI", amount: ONE_ETHER.mul(1000), address: DAI_ADDRESS, decimals: 18 },
    { symbol: "USDT", amount: ONE_USDC.mul(1000), address: USDT_ADDRESS, decimals: 6 },
    { symbol: "FRAX", amount: ONE_ETHER.mul(1000), address: FRAX_ADDRESS, decimals: 18 },
    { symbol: "WBTC", amount: ONE_WBTC.div(10), address: WBTC_ADDRESS, decimals: 8 },
    { symbol: "WETH", amount: ONE_ETHER.div(1), address: WETH_ADDRESS, decimals: 18 },
    { symbol: "NEAR", amount: ONE_NEAR.mul(250), address: NEAR_ADDRESS, decimals: 24 },
    { symbol: "SOLACE", amount: ONE_ETHER.mul(10000), address: SOLACE_ADDRESS, decimals: 18 },
    { symbol: "AURORA", amount: ONE_ETHER.mul(200), address: AURORA_ADDRESS, decimals: 18 },
    { symbol: "PLY", amount: ONE_ETHER.mul(100000), address: PLY_ADDRESS, decimals: 18 },
    { symbol: "BSTN", amount: ONE_ETHER.mul(100000), address: BSTN_ADDRESS, decimals: 18 },
    { symbol: "BBT", amount: ONE_ETHER.mul(100000), address: BBT_ADDRESS, decimals: 18 },
    { symbol: "TRI", amount: ONE_ETHER.mul(10000), address: TRI_ADDRESS, decimals: 18 },
    { symbol: "VWAVE", amount: ONE_ETHER.mul(50), address: VWAVE_ADDRESS, decimals: 18 },
  ];
  let index = Math.floor(Math.random() * deposits.length);
  let deposit = deposits[index];

  console.log(`Depositing ${deposit.symbol}`);
  let tkn = (await ethers.getContractAt(artifacts.MockERC20.abi, deposit.address)) as MockErc20;
  let depositAmount = deposit.amount;
  let dec = deposit.decimals;
  let bal = await tkn.balanceOf(signerAddress);
  if(bal.lt(depositAmount)) {
    console.log(`insufficient balance. depositing ${ethers.utils.formatUnits(depositAmount,dec)} have ${ethers.utils.formatUnits(bal,dec)}`);
    return;
  }
  let allowance = await tkn.allowance(signerAddress, depositHelper.address);
  if(allowance.lt(depositAmount)) {
    let tx1 = await tkn.connect(deployer).approve(depositHelper.address, ethers.constants.MaxUint256, networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
  }
  let tx2 = await depositHelper.connect(deployer).depositIntoLock(tkn.address, depositAmount, lockID, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);

  let lockAfter = await underwritingLocker.locks(lockID);
  console.log(`Lock ending with ${ethers.utils.formatUnits(lockAfter.amount)} UWE`);

  console.log("Deposited into existing lock via DepositHelper");
}

async function withdrawFromLocks() {
  console.log("Withdrawing from locks");
  let bal = (await underwritingLocker.balanceOf(signerAddress)).toNumber();
  let lockIDs = [];
  for(let i = 0; i < bal; ++i) {
    lockIDs.push((await underwritingLocker.tokenOfOwnerByIndex(signerAddress, i)).toNumber());
  }
  console.log(`signer has ${bal} locks: ${lockIDs}`);
  console.log(`starting uwe balance: ${ethers.utils.formatUnits(await uwe.balanceOf(signerAddress))}`)
  for(let i = 0; i < bal; ++i) {
    let lockID = lockIDs[i];
    let lock = await underwritingLocker.locks(lockID);
    let amountOut = await underwritingLocker.getWithdrawAmount(lockID);
    console.log(`withdrawing from lock ${lockID}. uwe=${ethers.utils.formatUnits(lock.amount)} end=${(new Date(lock.end.toNumber()*1000)).toUTCString()} amountOut=${ethers.utils.formatUnits(amountOut)}`);
    let tx = await underwritingLocker.connect(deployer).withdraw(lockID, signerAddress, {...networkSettings.overrides, gasLimit:300000});
    await tx.wait(networkSettings.confirmations);
  }
  console.log(`end uwe balance: ${ethers.utils.formatUnits(await uwe.balanceOf(signerAddress))}`)
  console.log("Withdrew from locks");
}

async function withdrawFromUwe() {
  console.log("Redeeming UWE");
  let bal1p = await uwp.balanceOf(signerAddress);
  let bal1e = await uwe.balanceOf(signerAddress);
  console.log('before');
  console.log(`uwp balance: ${ethers.utils.formatUnits(bal1p)}`)
  console.log(`uwe balance: ${ethers.utils.formatUnits(bal1e)}`)
  let tx = await uwe.connect(deployer).withdraw(bal1e, signerAddress, networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  let bal2p = await uwp.balanceOf(signerAddress);
  let bal2e = await uwe.balanceOf(signerAddress);
  console.log('after');
  console.log(`uwp balance: ${ethers.utils.formatUnits(bal2p)}`)
  console.log(`uwe balance: ${ethers.utils.formatUnits(bal2e)}`)
  console.log("Redeemed UWE");
}

async function offerBribe() {
  console.log("Offering Bribe");
  let depositAmount = ONE_ETHER.mul(1000);
  let gaugeID = 1;
  let aurora = await ethers.getContractAt(artifacts.ERC20.abi, AURORA_ADDRESS);
  let tx1 = await aurora.connect(deployer).approve(bribeController.address, depositAmount, networkSettings.overrides);
  await tx1.wait(networkSettings.confirmations);
  let tx2 = await bribeController.connect(deployer).provideBribes([AURORA_ADDRESS], [depositAmount], gaugeID, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  console.log("Offered Bribe");
}
/*
async function acceptBribe() {
  console.log("Accepting bribe");

  const bribeTaker = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[1], provider);
  const bribeTakerAddress = await bribeTaker.getAddress();
  console.log("Bribe taker:", bribeTakerAddress);

  let numLocks = await underwritingLocker.balanceOf(bribeTakerAddress);
  if(numLocks.eq(0)) {
    console.log("Creating lock for bribe taker");
    let dai = (await ethers.getContractAt(artifacts.MockERC20.abi, DAI_ADDRESS)) as MockErc20;
    let depositAmount = ONE_ETHER.mul(1000);
    let balance = await
    let allowance = await dai.allowance(bribeTakerAddress, depositHelper.address);
    if(allowance.lt(0))
  }

  let tx = await bribeController.connect(bribeTaker).
  //function voteForBribe(address voter_, uint256 gaugeID_, uint256 votePowerBPS_) external override nonReentrant {
  console.log("Accepted bribe");
}
*/
function leftPad(s:string, l:number, f:string=' ') {
  while(s.length < l) s = `${f}${s}`;
  return s;
}

function rightPad(s:string, l:number, f:string=' ') {
  while(s.length < l) s = `${s}${f}`;
  return s;
}

function logDate(date:Date) {
  console.log(Math.floor(date.valueOf()/1000));
  console.log(date.toLocaleString());
  console.log(date.toUTCString());
  console.log('')
}

function range(start:number, stop:number) {
  let numbers = [];
  for(let i = start; i < stop; ++i) {
    numbers.push(i);
  }
  return numbers;
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
