import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { encodePriceSqrt, FeeAmount, TICK_SPACINGS, getMaxTick, getMinTick } from "./utilities/uniswap";
import { bnAddSub, bnMulDiv, expectClose } from "./utilities/math";
import { getPermitErc721EnhancedSignature } from "./utilities/getPermitNFTSignature";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, FarmController, OptionsFarming, SptFarm, PolicyManager, RiskManager, Registry, MockProduct, Weth9, Treasury } from "../typechain";
import { burnBlocks } from "./utilities/time";

// contracts
let solace: Solace;
let farmController: FarmController;
let optionsFarming: OptionsFarming;
let farm1: SptFarm;
let weth: Weth9;
let registry: Registry;
let treasury: Treasury;
let policyManager: PolicyManager;
let riskManager: RiskManager;
let product: MockProduct;

// uniswap contracts
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let lpToken: Contract;

// pools
let solaceEthPool: Contract;

// vars
let solacePerSecond = BN.from("100000000000000000000"); // 100 e18
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const TEN_ETHER = BN.from("10000000000000000000");
const FIFTY_THOUSAND_ETHER = BN.from("50000000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
const ONE_YEAR = 31536000; // in seconds
let timestamp: number;
let initTime: number;
let startTime: number;
let endTime: number;
let sptFarmType = 3;
const price = 10000;
const duration = 1000;
const chainID = 31337;
const deadline = constants.MaxUint256;

describe("Overrides", function () {
  const [deployer, governor, farmer1, farmer2, trader, coveredPlatform] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
  });

  it("does stuff", async function () {
    let tx1 = await deployer.sendTransaction({to:governor.address});
    await logTx(tx1);
    let tx2 = await deployer.sendTransaction({to:governor.address, value:ONE_ETHER});
    await logTx(tx2);
    let tx3 = await weth.connect(deployer).deposit({value: ONE_ETHER});
    await logTx(tx3);
    let tx4 = await weth.connect(deployer).deposit({maxPriorityFeePerGas: 2600000000, maxFeePerGas: 123000000000});
    await logTx(tx4);
    let tx5 = await weth.connect(deployer).deposit({gasPrice: 65000000000, gasLimit: 70000});
    await logTx(tx5);
  });
});

async function logTx(tx: any) {
  return;
  console.log(tx);
  console.log(await tx.wait());
  console.log(tx.maxPriorityFeePerGas?.toString());
  console.log(tx.maxFeePerGas?.toString());
  console.log(tx.gasPrice?.toString());
  console.log(tx.gasLimit?.toString());
  console.log('\n')
}
