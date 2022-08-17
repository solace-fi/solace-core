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
import { FluxMegaOracle, UnderwritingPool, UnderwritingEquity, MockErc20 } from "../../typechain";
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

// contract addresses
const ORACLE_ADDRESS               = "0x501aCee3740e4A7CBf62C2A4C3b42703cE44ADa9";
const UWP_ADDRESS                  = "0x501ACEe266FAFF76AE48C891a06068bF6507c7f6";
const UWE_ADDRESS                  = "0x501ACEF0d60A70F3bc1bFE090a3d51ca10757aaE";

const ONE_USDC = BN.from("1000000");
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_NEAR = BN.from("1000000000000000000000000");
const ONE_WBTC = BN.from("100000000");

let artifacts: ArtifactImports;

let oracle: FluxMegaOracle;
let uwp: UnderwritingPool;
let uwe: UnderwritingEquity;

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

  await expectDeployed(ORACLE_ADDRESS);
  await expectDeployed(UWP_ADDRESS);
  await expectDeployed(UWE_ADDRESS);

  oracle = (await ethers.getContractAt(artifacts.FluxMegaOracle.abi, ORACLE_ADDRESS)) as FluxMegaOracle;
  uwp = (await ethers.getContractAt(artifacts.UnderwritingPool.abi, UWP_ADDRESS)) as UnderwritingPool;
  uwe = (await ethers.getContractAt(artifacts.UnderwritingEquity.abi, UWE_ADDRESS)) as UnderwritingEquity;

  //await depositIntoUwp();
  //await redeemFromUwp();
  await depositIntoUwe();

  // log addresses
  await logAddresses();
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

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("USDC price feed", USDC_PRICE_FEED_ADDRESS);
  logContractAddress("BTC price feed", BTC_PRICE_FEED_ADDRESS);
  logContractAddress("ETH price feed", ETH_PRICE_FEED_ADDRESS);
  logContractAddress("FluxMegaOracle", oracle.address);
  logContractAddress("UnderwritingPool", uwp.address);
  logContractAddress("UnderwritingEquity", uwe.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
