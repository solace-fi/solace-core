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
import { FluxMegaOracle, UnderwritingPool, MockErc20 } from "../../typechain";
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
const WBTC_ADDRESS                 = "0xD129f9A01Eb0d41302A2F808e9Ebfd5eB92cE17C";
const WETH_ADDRESS                 = "0x714ECD380a9700086eadAc03297027bAf4686276";

// contract addresses
const ORACLE_ADDRESS               = "0x501ACE9ac1252370a1A5227079d27c21d85d5094";
const UWP_ADDRESS                  = "0x501acEE19526ebbB5A9212867Ac94e1dA9859526";

const ONE_USDC = BN.from("1000000");
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_NEAR = BN.from("1000000000000000000000000");
const ONE_WBTC = BN.from("100000000");

let artifacts: ArtifactImports;

let oracle: FluxMegaOracle;
let uwp: UnderwritingPool;

let usdc: MockErc20;
let wbtc: MockErc20;
let weth: MockErc20;

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
  await expectDeployed(WBTC_ADDRESS);
  await expectDeployed(WETH_ADDRESS);

  usdc = (await ethers.getContractAt(artifacts.MockERC20.abi, USDC_ADDRESS)) as MockErc20;
  wbtc = (await ethers.getContractAt(artifacts.MockERC20.abi, WBTC_ADDRESS)) as MockErc20;
  weth = (await ethers.getContractAt(artifacts.MockERC20.abi, WETH_ADDRESS)) as MockErc20;

  // deploy contracts
  await deployOracle();
  //await configureOracle();
  await deployUwp();
  //await configureUwp();
  //await depositIntoUwp();
  //await redeemFromUwp();

  // log addresses
  await logAddresses();
}

async function deployOracle() {
  if(await isDeployed(ORACLE_ADDRESS)) {
    oracle = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, ORACLE_ADDRESS)) as FluxMegaOracle;
  } else {
    console.log("Deploying FluxMegaOracle");
    const res = await create2Contract(deployer, artifacts.FluxMegaOracle, [signerAddress], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    oracle = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, res.address)) as FluxMegaOracle;
    console.log(`Deployed FluxMegaOracle to ${oracle.address}`);
  }
}

async function configureOracle() {
  console.log('Adding price feeds to oracle');
  let tx = await oracle.connect(deployer).addPriceFeeds([
    { token: USDC_ADDRESS, priceFeed: USDC_PRICE_FEED_ADDRESS, tokenDecimals: 6, priceFeedDecimals: 8 },
    { token: WBTC_ADDRESS, priceFeed: BTC_PRICE_FEED_ADDRESS, tokenDecimals: 8, priceFeedDecimals: 8 },
    { token: WETH_ADDRESS, priceFeed: ETH_PRICE_FEED_ADDRESS, tokenDecimals: 18, priceFeedDecimals: 8 },
  ], networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  console.log('Added price feeds to oracle');
}

async function deployUwp() {
  if(await isDeployed(UWP_ADDRESS)) {
    uwp = (await ethers.getContractAt(artifacts.UnderwritingPool.abi, UWP_ADDRESS)) as UnderwritingPool;
  } else {
    console.log('Deploying UnderwritingPool');
    const res = await create2Contract(deployer, artifacts.UnderwritingPool, [signerAddress], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    uwp = (await ethers.getContractAt(artifacts.UnderwritingPool.abi, res.address)) as UnderwritingPool;
    console.log(`Deploying UnderwritingPool to ${uwp.address}`);
  }
}

async function configureUwp() {
  console.log('Adding tokens to uwp');
  let tx = await uwp.connect(deployer).addTokensToPool([
    { token: USDC_ADDRESS, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: WBTC_ADDRESS, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
    { token: WETH_ADDRESS, oracle: oracle.address, min: 0, max: ethers.constants.MaxUint256 },
  ], networkSettings.overrides);
  await tx.wait(networkSettings.confirmations);
  console.log('Added tokens to uwp');
}

async function depositIntoUwp() {
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

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("USDC price feed", USDC_PRICE_FEED_ADDRESS);
  logContractAddress("BTC price feed", BTC_PRICE_FEED_ADDRESS);
  logContractAddress("ETH price feed", ETH_PRICE_FEED_ADDRESS);
  logContractAddress("FluxMegaOracle", oracle.address);
  logContractAddress("UnderwritingPool", uwp.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
