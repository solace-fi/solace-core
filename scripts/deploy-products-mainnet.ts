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
import { Deployer, Registry, PolicyManager, RiskManager, CompoundProduct, AaveV2Product, LiquityProduct, YearnV2Product, CurveProduct, UniswapV2Product, UniswapV3Product, SushiswapProduct } from "../typechain";

const DEPLOYER_CONTRACT_ADDRESS = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const REGISTRY_ADDRESS          = "0x501aCEE3310d98881c827d4357C970F23a30AD29";
const POLICY_MANAGER_ADDRESS    = "0x501ace5E9f058bB2E851675BB3fA104Da6E3A22C";
const RISK_MANAGER_ADDRESS      = "0x501ACe9eE0AB4D2D4204Bcf3bE6eE13Fd6337804";

const AAVEV2_PRODUCT_ADDRESS    = "0x501AcE1564b4EF3c653A635C5c42A9018191b305";
const COMPOUND_PRODUCT_ADDRESS  = "0x501aCe743d0Aa994Fb2297f2D7BD9fD49B10816b";
const LIQUITY_PRODUCT_ADDRESS   = "0x501aCE84be589758f88512E02aE9969d490fAcbC";
const YEARNV2_PRODUCT_ADDRESS   = "0x501ace86502900EC5f3E6A011004B7b9D04b8941";
const CURVE_PRODUCT_ADDRESS     = "0x501aCef2EA19c9a622080F129cEcFEe62a2f8aD5";
const UNISWAPV2_PRODUCT_ADDRESS = "0x501aCED74C9A935A2E3908a8BEBF1E0248ACF2A8";
const UNISWAPV3_PRODUCT_ADDRESS = "0x501Ace6c657A9b53B320780068Fd99894d5795Cb";
const SUSHISWAP_PRODUCT_ADDRESS = "0x501ACe36EE92f290a8C41E344Eaa4D15Da030818";

const AAVE_DATA_PROVIDER        = "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d";
const COMPTROLLER_ADDRESS       = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
const TROVE_MANAGER_ADDRESS     = "0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2";
const YEARN_REGISTRY_ADDRESS    = "0x50c1a2eA0a861A967D9d0FFE2AE4012c2E053804";
const CURVE_ADDRESS_PROVIDER    = "0x0000000022D53366457F9d5E68Ec105046FC4383";
const UNISWAPV2_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const UNISWAPV3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const SUSHISWAP_FACTORY_ADDRESS = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";

// product params
const minPeriod = 6450; // this is about 1 day
const maxPeriod = 2354250; // this is about 1 year from https://ycharts.com/indicators/ethereum_blocks_per_day
const PRICE_22 = 9344;  // 2.20%/yr
const PRICE_24 = 10194; // 2.40%/yr
const PRICE_26 = 11044; // 2.60%/yr
const EQUAL_WEIGHT = 10000;
const DIVISOR = 10;

let artifacts: ArtifactImports;
let deployerContract: Deployer;
let registry: Registry;
let policyManager: PolicyManager;
let riskManager: RiskManager;

let compoundProduct: CompoundProduct;
let aaveProduct: AaveV2Product;
let liquityProduct: LiquityProduct;
let yearnProduct: YearnV2Product;
let curveProduct: CurveProduct;
let uniswapV2Product: UniswapV2Product;
let uniswapV3Product: UniswapV3Product;
let sushiswapProduct: SushiswapProduct;

let signerAddress: string;
let multisigAddress = "0xc47911f768c6fE3a9fe076B95e93a33Ed45B7B34";

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  policyManager = (await ethers.getContractAt(artifacts.PolicyManager.abi, POLICY_MANAGER_ADDRESS)) as PolicyManager;
  riskManager = (await ethers.getContractAt(artifacts.RiskManager.abi, RISK_MANAGER_ADDRESS)) as RiskManager;

  await deployAaveV2Product();
  await deployCompoundProduct();
  await deployLiquityProduct();
  await deployYearnProduct();
  await deployCurveProduct();
  await deployUniswapV2Product();
  await deployUniswapV3Product();
  await deploySushiswapProduct();

  await logAddresses();
}

async function deployAaveV2Product() {
  if(!!AAVEV2_PRODUCT_ADDRESS) {
    aaveProduct = (await ethers.getContractAt(artifacts.AaveV2Product.abi, AAVEV2_PRODUCT_ADDRESS)) as AaveV2Product;
  } else {
    console.log("Deploying AaveV2 Product");
    var res = await create2Contract(deployer,artifacts.AaveV2Product,[signerAddress,policyManager.address,registry.address,AAVE_DATA_PROVIDER,minPeriod,maxPeriod], {}, "", deployerContract.address);
    aaveProduct = (await ethers.getContractAt(artifacts.AaveV2Product.abi, res.address)) as AaveV2Product;
    console.log(`Deployed AaveV2Product to ${aaveProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(aaveProduct.address))) {
    console.log("Registering AaveV2Product in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(aaveProduct.address);
    await tx.wait();
    console.log("Registered AaveV2Product in PolicyManager");
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(aaveProduct.address))) {
    console.log("Registering AaveV2Product in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(aaveProduct.address, EQUAL_WEIGHT, PRICE_22, DIVISOR);
    await tx.wait();
    console.log("Registered AaveV2Product in RiskManager");
  }
}

async function deployCompoundProduct() {
  if(!!COMPOUND_PRODUCT_ADDRESS) {
    compoundProduct = (await ethers.getContractAt(artifacts.CompoundProduct.abi, COMPOUND_PRODUCT_ADDRESS)) as CompoundProduct;
  } else {
    console.log("Deploying Compound Product");
    var res = await create2Contract(deployer,artifacts.CompoundProduct,[signerAddress,policyManager.address,registry.address,COMPTROLLER_ADDRESS,minPeriod,maxPeriod], {}, "", deployerContract.address);
    compoundProduct = (await ethers.getContractAt(artifacts.CompoundProduct.abi, res.address)) as CompoundProduct;
    console.log(`Deployed CompoundProduct to ${compoundProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(compoundProduct.address))) {
    console.log("Registering CompoundProduct in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(compoundProduct.address);
    await tx.wait();
    console.log("Registered CompoundProduct in PolicyManager");
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(compoundProduct.address))) {
    console.log("Registering CompoundProduct in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(compoundProduct.address, EQUAL_WEIGHT, PRICE_22, DIVISOR);
    await tx.wait();
    console.log("Registered CompoundProduct in RiskManager");
  }
}

async function deployLiquityProduct() {
  if(!!LIQUITY_PRODUCT_ADDRESS) {
    liquityProduct = (await ethers.getContractAt(artifacts.LiquityProduct.abi, LIQUITY_PRODUCT_ADDRESS)) as LiquityProduct;
  } else {
    console.log("Deploying Liquity Product");
    var res = await create2Contract(deployer,artifacts.LiquityProduct,[signerAddress,policyManager.address,registry.address,TROVE_MANAGER_ADDRESS,minPeriod,maxPeriod], {}, "", deployerContract.address);
    liquityProduct = (await ethers.getContractAt(artifacts.LiquityProduct.abi, res.address)) as LiquityProduct;
    console.log(`Deployed LiquityProduct to ${liquityProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(liquityProduct.address))) {
    console.log("Registering LiquityProduct in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(liquityProduct.address);
    await tx.wait();
    console.log("Registered LiquityProduct in PolicyManager");
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(liquityProduct.address))) {
    console.log("Registering LiquityProduct in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(liquityProduct.address, EQUAL_WEIGHT, PRICE_22, DIVISOR);
    await tx.wait();
    console.log("Registered LiquityProduct in RiskManager");
  }
}

async function deployYearnProduct() {
  if(!!YEARNV2_PRODUCT_ADDRESS) {
    yearnProduct = (await ethers.getContractAt(artifacts.YearnV2Product.abi, YEARNV2_PRODUCT_ADDRESS)) as YearnV2Product;
  } else {
    console.log("Deploying Yearn Product");
    var res = await create2Contract(deployer,artifacts.YearnV2Product,[signerAddress,policyManager.address,registry.address,YEARN_REGISTRY_ADDRESS,minPeriod,maxPeriod], {}, "", deployerContract.address);
    yearnProduct = (await ethers.getContractAt(artifacts.YearnV2Product.abi, res.address)) as YearnV2Product;
    console.log(`Deployed YearnV2Product to ${yearnProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(yearnProduct.address))) {
    console.log("Registering YearnV2Product in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(yearnProduct.address);
    await tx.wait();
    console.log("Registered YearnV2Product in PolicyManager");
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(yearnProduct.address))) {
    console.log("Registering YearnV2Product in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(yearnProduct.address, EQUAL_WEIGHT, PRICE_22, DIVISOR);
    await tx.wait();
    console.log("Registered YearnV2Product in RiskManager");
  }
}

async function deployCurveProduct() {
  if(!!CURVE_PRODUCT_ADDRESS) {
    curveProduct = (await ethers.getContractAt(artifacts.CurveProduct.abi, CURVE_PRODUCT_ADDRESS)) as CurveProduct;
  } else {
    console.log("Deploying Curve Product");
    var res = await create2Contract(deployer,artifacts.CurveProduct,[signerAddress,policyManager.address,registry.address,CURVE_ADDRESS_PROVIDER,minPeriod,maxPeriod], {}, "", deployerContract.address);
    curveProduct = (await ethers.getContractAt(artifacts.CurveProduct.abi, res.address)) as CurveProduct;
    console.log(`Deployed CurveProduct to ${curveProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(curveProduct.address))) {
    console.log("Registering CurveProduct in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(curveProduct.address);
    await tx.wait();
    console.log("Registered CurveProduct in PolicyManager");
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(curveProduct.address))) {
    console.log("Registering CurveProduct in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(curveProduct.address, EQUAL_WEIGHT, PRICE_22, DIVISOR);
    await tx.wait();
    console.log("Registered CurveProduct in RiskManager");
  }
}

async function deployUniswapV2Product() {
  if(!!UNISWAPV2_PRODUCT_ADDRESS) {
    uniswapV2Product = (await ethers.getContractAt(artifacts.UniswapV2Product.abi, UNISWAPV2_PRODUCT_ADDRESS)) as UniswapV2Product;
  } else {
    console.log("Deploying UniswapV2 Product");
    var res = await create2Contract(deployer,artifacts.UniswapV2Product,[signerAddress,policyManager.address,registry.address,UNISWAPV2_FACTORY_ADDRESS,minPeriod,maxPeriod], {}, "", deployerContract.address);
    uniswapV2Product = (await ethers.getContractAt(artifacts.UniswapV2Product.abi, res.address)) as UniswapV2Product;
    console.log(`Deployed UniswapV2Product to ${uniswapV2Product.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(uniswapV2Product.address))) {
    console.log("Registering UniswapV2Product in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(uniswapV2Product.address);
    await tx.wait();
    console.log("Registered UniswapV2Product in PolicyManager");
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(uniswapV2Product.address))) {
    console.log("Registering UniswapV2Product in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(uniswapV2Product.address, EQUAL_WEIGHT, PRICE_22, DIVISOR);
    await tx.wait();
    console.log("Registered UniswapV2Product in RiskManager");
  }
}

async function deployUniswapV3Product() {
  if(!!UNISWAPV3_PRODUCT_ADDRESS) {
    uniswapV3Product = (await ethers.getContractAt(artifacts.UniswapV3Product.abi, UNISWAPV3_PRODUCT_ADDRESS)) as UniswapV3Product;
  } else {
    console.log("Deploying UniswapV3 Product");
    var res = await create2Contract(deployer,artifacts.UniswapV3Product,[signerAddress,policyManager.address,registry.address,UNISWAPV3_FACTORY_ADDRESS,minPeriod,maxPeriod], {}, "", deployerContract.address);
    uniswapV3Product = (await ethers.getContractAt(artifacts.UniswapV3Product.abi, res.address)) as UniswapV3Product;
    console.log(`Deployed UniswapV3Product to ${uniswapV3Product.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(uniswapV3Product.address))) {
    console.log("Registering UniswapV3Product in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(uniswapV3Product.address);
    await tx.wait();
    console.log("Registered UniswapV3Product in PolicyManager");
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(uniswapV3Product.address))) {
    console.log("Registering UniswapV3Product in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(uniswapV3Product.address, EQUAL_WEIGHT, PRICE_24, DIVISOR);
    await tx.wait();
    console.log("Registered UniswapV3Product in RiskManager");
  }
}

async function deploySushiswapProduct() {
  if(!!SUSHISWAP_PRODUCT_ADDRESS) {
    sushiswapProduct = (await ethers.getContractAt(artifacts.SushiswapProduct.abi, SUSHISWAP_PRODUCT_ADDRESS)) as SushiswapProduct;
  } else {
    console.log("Deploying Sushiswap Product");
    var res = await create2Contract(deployer,artifacts.SushiswapProduct,[signerAddress,policyManager.address,registry.address,SUSHISWAP_FACTORY_ADDRESS,minPeriod,maxPeriod], {}, "", deployerContract.address);
    sushiswapProduct = (await ethers.getContractAt(artifacts.SushiswapProduct.abi, res.address)) as SushiswapProduct;
    console.log(`Deployed SushiswapProduct to ${sushiswapProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(sushiswapProduct.address))) {
    console.log("Registering SushiswapProduct in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(sushiswapProduct.address);
    await tx.wait();
    console.log("Registered SushiswapProduct in PolicyManager");
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(sushiswapProduct.address))) {
    console.log("Registering SushiswapProduct in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(sushiswapProduct.address, EQUAL_WEIGHT, PRICE_22, DIVISOR);
    await tx.wait();
    console.log("Registered SushiswapProduct in RiskManager");
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name    | Address                                      |");
  console.log("|------------------|----------------------------------------------|");
  logContractAddress("AaveV2Product", aaveProduct.address);
  logContractAddress("CompoundProduct", compoundProduct.address);
  logContractAddress("LiquityProduct", liquityProduct.address);
  logContractAddress("YearnV2Product", yearnProduct.address);
  logContractAddress("CurveProduct", curveProduct.address);
  logContractAddress("UniswapV2Product", uniswapV2Product.address);
  logContractAddress("UniswapV3Product", uniswapV3Product.address);
  logContractAddress("SushiswapProduct", sushiswapProduct.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
