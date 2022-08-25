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
import { SolaceMegaOracle, FluxMegaOracle, UnderwritingPool, UnderwritingEquity, UnderwritingLockVoting, UnderwritingLocker, GaugeController, MockErc20, DepositHelper } from "../../typechain";
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
const SOLACE_MEGA_ORACLE_ADDRESS        = "0x501acEC7AD3F8bb5Fc3C925dcAC1C4077e2bb7C5";
const FLUX_MEGA_ORACLE_ADDRESS          = "0x501AcE8E475B7fD921fcfeBB365374cA62cED1a5";
const UWP_ADDRESS                       = "0x501ACEb41708De16FbedE3b31f3064919E9d7F23";
const UWE_ADDRESS                       = "0x501AcE91E8832CDeA18b9e685751079CCddfc0e2";
const REVENUE_ROUTER_ADDRESS            = "0x501AcE0e8D16B92236763E2dEd7aE3bc2DFfA276";
const UNDERWRITING_LOCKER_ADDRESS       = "0x501aceAC7279713F33d8cd1eBDCfd8E442909CA5";
const GAUGE_CONTROLLER_ADDRESS          = "0x501AcE75E1f2098099E73e05BC73d5F16ED7b6f1";
const UNDERWRITING_LOCK_VOTING_ADDRESS  = "0x501ace085C07AfB7EB070ddbC7b4bC3D4379761a";
const DEPOSIT_HELPER_ADDRESS            = "0x501acE8830E73F81172C4877c9d273D6a3767AD1";


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

  solaceMegaOracle = (await ethers.getContractAt(artifacts.SolaceMegaOracle.abi, SOLACE_MEGA_ORACLE_ADDRESS)) as SolaceMegaOracle;
  fluxMegaOracle = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, FLUX_MEGA_ORACLE_ADDRESS)) as FluxMegaOracle;
  uwp = (await ethers.getContractAt(artifacts.UnderwritingPool.abi, UWP_ADDRESS)) as UnderwritingPool;
  uwe = (await ethers.getContractAt(artifacts.UnderwritingEquity.abi, UWE_ADDRESS)) as UnderwritingEquity;
  underwritingLocker = (await ethers.getContractAt(artifacts.UnderwritingLocker.abi, UNDERWRITING_LOCKER_ADDRESS)) as UnderwritingLocker;
  gaugeController = (await ethers.getContractAt(artifacts.GaugeController.abi, GAUGE_CONTROLLER_ADDRESS)) as GaugeController;
  underwritingLockVoting = (await ethers.getContractAt(artifacts.UnderwritingLockVoting.abi, UNDERWRITING_LOCK_VOTING_ADDRESS)) as UnderwritingLockVoting;
  depositHelper = (await ethers.getContractAt(artifacts.DepositHelper.abi, DEPOSIT_HELPER_ADDRESS)) as DepositHelper;

  //await depositIntoUwp();
  //await depositIntoUwe();
  //await useDepositHelper();
  //await withdrawFromLocks();
  //await withdrawFromUwe();
  //await redeemFromUwp();

  await setPriceFeeds();
  await getUwpTokens();
  //await getGauges();
  //await rolloverEpoch();
  //await castVote();
  //await getEpochTimestamps();
}

async function depositIntoUwp() {
  let usdc = (await ethers.getContractAt(artifacts.MockERC20.abi, USDC_ADDRESS)) as MockErc20;
  let wbtc = (await ethers.getContractAt(artifacts.MockERC20.abi, WBTC_ADDRESS)) as MockErc20;
  let weth = (await ethers.getContractAt(artifacts.MockERC20.abi, WETH_ADDRESS)) as MockErc20;

  console.log("Depositing tokens into UWP");
  let tokens = [usdc, wbtc, weth];
  let tokenAddresses = [usdc.address, wbtc.address, weth.address];
  let symbols = ["USDC", "WBTC", "WETH"];
  let depositAmounts = [ONE_USDC.mul(100), ONE_WBTC.div(100), ONE_ETHER.div(10)];
  for(var i = 0; i < tokens.length; ++i) {
    if((await tokens[i].allowance(signerAddress, uwp.address)).lt(depositAmounts[i])) {
      let tx = await tokens[i].connect(deployer).approve(uwp.address, ethers.constants.MaxUint256, networkSettings.overrides);
      await tx.wait(networkSettings.confirmations);
    }
    let bal = await tokens[i].balanceOf(signerAddress);
    if(bal.lt(depositAmounts[i])) {
      console.log(`insufficient ${symbols[i]} balance. depositing ${ethers.utils.formatUnits(depositAmounts[i])} have ${ethers.utils.formatUnits(bal)}`);
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

async function setPriceFeeds() {
  console.log('Setting prices in SolaceMegaOracle');
  let tx = await solaceMegaOracle.connect(deployer).transmit(
    [NEAR_ADDRESS, SOLACE_ADDRESS, AURORA_ADDRESS, PLY_ADDRESS, BSTN_ADDRESS, BBT_ADDRESS, TRI_ADDRESS, VWAVE_ADDRESS],
    [ONE_ETHER.mul(4), ONE_ETHER.mul(120).div(10000), ONE_ETHER.mul(14000).div(10000), ONE_ETHER.mul(16).div(10000), ONE_ETHER.mul(36).div(10000), ONE_ETHER.mul(9).div(10000), ONE_ETHER.mul(317).div(10000), ONE_ETHER.mul(223697).div(10000)],
    networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
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
  }
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
  console.log("Rolled over to next epoch");
}

async function castVote() {
  console.log("Voting");
  let numGauges = (await gaugeController.totalGauges()).toNumber();
  let evenWeight = Math.floor(10000 / numGauges);
  let gaugeIDs = [];
  let gaugeWeights = [];
  for(let gaugeID = 1; gaugeID <= numGauges; ++gaugeID) {
    gaugeIDs.push(gaugeID);
    gaugeWeights.push(evenWeight);
  }
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

function leftPad(s:string, l:number, f:string=' ') {
  while(s.length < l) s = `${f}${s}`;
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
